import { Duplex, DuplexOptions, Readable, ReadableOptions } from 'stream'

const EOF = Symbol('End of File')

type PagedSourceOptions<TState, TChunk> =
  Pick<ReadableOptions, 'highWaterMark' | 'destroy' | 'encoding'> &
  ({
    /**
     * Fetches the next page of the source, returning a set of objects or ReentrantSource.EOF
     * to signal end of file.
     */
    fetchNextPage?(): Promise<TChunk[] | typeof EOF>,
  } | {
    /**
     * The initial value for the state object given to fetchNextPage
     */
    initialState: TState

    /**
     * Fetches the next page of the source, returning a set of objects or ReentrantSource.EOF
     * to signal end of file.  The function can manipulate the state object to save state
     * between calls.
     */
    fetchNextPage(state: TState): Promise<TChunk[] | typeof EOF>,
  })

/**
 * Creates a Readable stream that pages values from an API.
 *
 * This forms a base for something like an HTML hyperlink checker, or some other
 * stream processor where downstream checks may warrant adding new source objects
 * to the stream.
 */
export class PagedSource<TState = any, TChunk = any> extends Readable {
  /**
   * The End Of File marker to be returned by fetchNextPage
   */
  public static readonly EOF: typeof EOF = EOF

  private _queue: TChunk[] = []
  private _state: TState = {} as any
  private _eof = false
  private _fetching = false

  constructor(options: PagedSourceOptions<TState, TChunk>, initialValues?: TChunk[]) {
    super(Object.assign({ objectMode: true }, options))

    if (initialValues) {
      this._queue.push(...initialValues)
    }
    if ('initialState' in options) {
      this._state = options.initialState
    }

    if (options.fetchNextPage) {
      this._fetchNextPage = options.fetchNextPage
    }
  }

  public _read(size: number) {
    let numPushed = 0
    while (this._queue.length > 0) {
      if (numPushed > size) {
        break
      }
      if (!this.push(this._queue.shift())) {
        numPushed++
        break
      }
    }

    if (this._queue.length == 0) {
      if (this._eof) {
        this.push(null)
      } else if (!this._fetching && this._fetchNextPage) {

        this._fetching = true
        this._fetchNextPage(this._state)
          .then((nextPage) => {
            this._fetching = false

            if (nextPage != EOF) {
              this._queue.push(...nextPage)
              if (this._queue.length == 0) {
                this.emit('warning', 'fetchNextPage returned no results! ' +
                  'Please return ReentrantSource.EOF to signal end of file.')
              }
              this.push(this._queue.shift())
            } else {
              // end
              this._eof = true
              this.push(null)
            }
          })
          .catch((err) => {
            this._fetching = false
            this.emit('error', err)
          })
      }
    }
  }

  public end() {
    this._eof = true
    if (this._queue.length == 0) {
      this.push(null)
    }
  }

  /**
   * Implemented by the subclass to fetch the next page of the source, returning a set of objects or
   * ReentrantSource.EOF to signal end of file.  The function can manipulate the state object to save
   * state between calls.
   */
  protected _fetchNextPage?(state: TState | undefined): Promise<TChunk[] | typeof EOF>
}
