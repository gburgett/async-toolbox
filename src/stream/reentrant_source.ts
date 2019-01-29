import { Duplex, DuplexOptions } from 'stream'

const EOF = Symbol('End of File')

type ReentrantSourceOptions<TState, TChunk> =
  Pick<DuplexOptions, 'allowHalfOpen' | 'highWaterMark' | 'final' | 'destroy'> &
  ({
    /**
     * Fetches the next page of the source, returning a set of objects or ReentrantSource.EOF
     * to signal end of file.
     */
    fetchNextPage(): Promise<TChunk[] | typeof EOF>,
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
function ReentrantSource<TState, TChunk>(options: ReentrantSourceOptions<TState, TChunk>, values: TChunk[]): Duplex {
  const queue = (values || [])
  const state = 'initialState' in options ? options.initialState : undefined
  let eof = false
  let fetching = false

  return new Duplex({
    ...options,
    read(size) {
      let numPushed = 0
      while (queue.length > 0) {
        if (numPushed > size) {
          break
        }
        if (!this.push(queue.shift())) {
          numPushed++
          break
        }
      }

      if (queue.length == 0) {
        if (eof) {
          this.push(null)
        } else if (!fetching) {
          fetching = true
          options.fetchNextPage(state as TState)
            .then((nextPage) => {
              fetching = false
              if (nextPage != EOF) {
                queue.push(...nextPage)
                if (queue.length == 0) {
                  this.emit('error', 'fetchNextPage returned no results! ' +
                    'Please return ReentrantSource.EOF to signal end of file.')
                }
                this.push(queue.shift())
              } else {
                eof = true
                this.push(null)
              }
            })
            .catch((err) => {
              fetching = false
              this.emit('error', err)
            })
        }
      }
    },
    write(chunk: TChunk, encoding, cb) {
      queue.push(chunk)
      cb()
    },
    writev(chunks, cb) {
      chunks.forEach((c) => queue.push(c.chunk))
      cb()
    },
    objectMode: true,
  })
}

/**
 * The End Of File marker to be returned by fetchNextPage
 */
ReentrantSource.EOF = EOF
