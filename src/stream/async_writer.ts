import { Duplex, Writable } from 'stream'

interface InternalAsyncState {
  _asyncWrtiableState: {
    draining: boolean
    drainPromise: Promise<void> | null,
  } | undefined
}

/**
 * Writes a chunk to the current write stream, returning a promise that completes
 * when the chunk has actually been written.
 *
 * This function respects the 'drain' event of the stream.  If the stream is currently
 * full, the function will queue the write until the drain event is fired.
 * @param chunk The chunk to write
 * @param encoding The encoding of the chunk
 */
export function writeAsync(stream: Writable & InternalAsyncState, chunk: any, encoding?: string): Promise<void> {
  return _awaitDraining(stream, (cb: (err?: any) => void) => stream.write(chunk, encoding, cb))
}

/**
 * Ends the stream, returning a promise that completes when the stream is finished
 * (i.e. the end callback has returned)
 */
export function endAsync(stream: Writable & InternalAsyncState): Promise<void> {
  return _awaitDraining(stream, (cb: (err?: any) => void) => {
    stream.once('error', cb)
    stream.end(cb)
  })
}

function _initAsyncWritableState(this: Writable & InternalAsyncState): void {
  if (this._asyncWrtiableState === undefined) {
    this._asyncWrtiableState = {
      draining: true,
      drainPromise: null,
    }
  }
}

function _awaitDraining(
  stream: Writable & InternalAsyncState,
  action: (cb: (err?: any) => void) => void,
): Promise<void> {
  _initAsyncWritableState.call(stream)

  return new Promise<void>((resolve, reject) => {
    if (stream._asyncWrtiableState!.draining) {
      action((err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    } else {
      if (!stream._asyncWrtiableState!.drainPromise) {
        stream._asyncWrtiableState!.drainPromise = new Promise<void>((dpResolve) => {
          stream.once('drain', () => {
            stream._asyncWrtiableState!.drainPromise = null
            stream._asyncWrtiableState!.draining = true
            dpResolve()
          })
        })
      }

      // await recursive
      stream._asyncWrtiableState!.drainPromise!.then(
        () =>
          _awaitDraining.call(stream, action)
            .then(resolve, reject),
        (err) => reject(err),
      )
    }
  })
}

declare module 'stream' {
  interface Writable {
    /**
     * Writes a chunk to the current write stream, returning a promise that completes
     * when the chunk has actually been written.
     *
     * This function respects the 'drain' event of the stream.  If the stream is currently
     * full, the function will queue the write until the drain event is fired.
     * @param chunk The chunk to write
     * @param encoding The encoding of the chunk
     */
    writeAsync(chunk: any, encoding?: string): Promise<void>

    /**
     * Ends the stream, returning a promise that completes when the stream is finished
     * (i.e. the end callback has returned)
     */
    endAsync(): Promise<void>
  }

  interface Duplex {
    /**
     * Writes a chunk to the current write stream, returning a promise that completes
     * when the chunk has actually been written.
     *
     * This function respects the 'drain' event of the stream.  If the stream is currently
     * full, the function will queue the write until the drain event is fired.
     * @param chunk The chunk to write
     * @param encoding The encoding of the chunk
     */
    writeAsync(chunk: any, encoding?: string): Promise<void>

    /**
     * Ends the stream, returning a promise that completes when the stream is finished
     * (i.e. the end callback has returned)
     */
    endAsync(): Promise<void>
  }
}

Writable.prototype.writeAsync = function(chunk, encoding) {
  return writeAsync(this, chunk, encoding)
}
Duplex.prototype.writeAsync = function(chunk, encoding) {
  return writeAsync(this, chunk, encoding)
}
Writable.prototype.endAsync = function() {
  return endAsync(this)
}
Duplex.prototype.endAsync = function() {
  return endAsync(this)
}
