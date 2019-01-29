import { Duplex, DuplexOptions } from 'stream'

const EOF = Symbol('End of File')

type ReentrantSourceOptions<TState, TChunk> =
  Pick<DuplexOptions, 'allowHalfOpen' | 'highWaterMark' | 'final' | 'destroy'> &
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
 * Creates a Duplex stream that queues up values written to it.
 * A function may be provided to look up the next page of results once the readable
 * queue is empty.  The write methods on the duplex stream add a chunk to the queue
 * to be processed.
 *
 * This forms a base for something like an HTML hyperlink checker, or some other
 * stream processor where downstream checks may warrant adding new source objects
 * to the stream.
 */
export class ReentrantSource<TState = any, TChunk = any> extends Duplex {
  /**
   * The End Of File marker to be returned by fetchNextPage
   */
  public static readonly EOF: typeof EOF = EOF

  private _queue: TChunk[] = []
  private _state: TState = {} as any
  private _eof = false
  private _fetching = false

  constructor(options: ReentrantSourceOptions<TState, TChunk>, values?: TChunk[]) {
    super(Object.assign({ objectMode: true }, options))

    if (values) {
      this._queue.push(...values)
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
                this.emit('error', 'fetchNextPage returned no results! ' +
                  'Please return ReentrantSource.EOF to signal end of file.')
              }
              this.push(this._queue.shift())
            } else {
              this.end()
            }
          })
          .catch((err) => {
            this._fetching = false
            this.emit('error', err)
          })
      }
    }
  }

  public _write(chunk: TChunk, encoding: string, cb: (error?: Error | null) => void) {
    this._queue.push(chunk)
    if (this._queue.length == 1) {
      this.push(this._queue.shift())
    }
    cb()
  }
  public _writev(chunks: Array<{ chunk: TChunk, encoding: string }>, cb: (error?: Error | null) => void) {
    chunks.forEach((c) => this._queue.push(c.chunk))
    if (this._queue.length == chunks.length) {
      this.push(this._queue.shift())
    }
    cb()
  }
  public _final(callback: (error?: Error | null) => void) {
    this._eof = true
    if (this._queue.length > 0) {
      this.push(this._queue.shift())
    } else {
      this.push(null)
    }
    callback()
  }
  /**
   * Implemented by the subclass to fetch the next page of the source, returning a set of objects or
   * ReentrantSource.EOF to signal end of file.  The function can manipulate the state object to save
   * state between calls.
   */
  protected _fetchNextPage?(state: TState | undefined): Promise<TChunk[] | typeof EOF>
}
