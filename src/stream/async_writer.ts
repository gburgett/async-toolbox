import { Duplex, Writable } from 'stream'

interface InternalAsyncState {
  _asyncWritableState: {
    draining: boolean
    drainPromise: Promise<void> | null,
  }
}

/**
 * Writes a chunk to the current write stream, returning a promise that completes
 * when the chunk is enqueued.
 *
 * This function respects the 'drain' event of the stream.  If the stream is currently
 * full, the function will queue the write until the drain event is fired.
 * @param chunk The chunk to write
 * @param encoding The encoding of the chunk
 */
export async function writeAsync(stream: Writable, chunk: any, encoding?: string): Promise<void> {
  if (!_initAsyncWritableState(stream)) {
    throw new Error(`_initAsyncWritableState returned false!`)
  }

  if (stream._asyncWritableState.draining) {
    stream._asyncWritableState.draining = stream.write(chunk, encoding)
  } else {
    await _awaitDraining(stream)
    return stream.writeAsync(chunk, encoding)
  }
}

/**
 * Ends the stream, returning a promise that completes when the stream is finished
 * (i.e. the end callback has returned)
 */
export async function endAsync(stream: Writable): Promise<void> {
  if (!_initAsyncWritableState(stream)) {
    throw new Error(`_initAsyncWritableState returned false!`)
  }

  if (stream._asyncWritableState.draining) {
    return new Promise<void>((resolve, reject) => {
      stream.once('error', (err: any) => reject(err))
      stream.end(() => resolve())
    })
  } else {
    await _awaitDraining(stream)
    return stream.endAsync()
  }
}

function _initAsyncWritableState(
  stream: Writable & Partial<InternalAsyncState>,
): stream is Writable & InternalAsyncState {
  if (!stream._asyncWritableState) {
    stream._asyncWritableState = {
      draining: true,
      drainPromise: null,
    }
  }
  return true
}

function _awaitDraining(
  stream: Writable & InternalAsyncState,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!stream._asyncWritableState.drainPromise) {
        stream._asyncWritableState.drainPromise = new Promise<void>((dpResolve) => {
          stream.once('drain', () => {
            stream._asyncWritableState!.drainPromise = null
            stream._asyncWritableState!.draining = true
            dpResolve()
          })
        })
      }

      // await recursive
      stream._asyncWritableState.drainPromise.then(resolve, reject)
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
    writeAsync(this: Writable, chunk: any, encoding?: string): Promise<void>

    /**
     * Ends the stream, returning a promise that completes when the stream is finished
     * (i.e. the end callback has returned)
     */
    endAsync(this: Writable): Promise<void>
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
    writeAsync(this: Duplex, chunk: any, encoding?: string): Promise<void>

    /**
     * Ends the stream, returning a promise that completes when the stream is finished
     * (i.e. the end callback has returned)
     */
    endAsync(this: Duplex): Promise<void>
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
