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
export async function writeAsync(stream: NodeJS.WritableStream, chunk: any, encoding?: string): Promise<void> {
  if (!_initAsyncWritableState(stream)) {
    throw new Error(`_initAsyncWritableState returned false!`)
  }

  if (stream._asyncWritableState.draining) {
    stream._asyncWritableState.draining = stream.write(chunk, encoding)
    if (!stream._asyncWritableState.draining) {
      // ensure a drain listener exists to reset the draining state
      _awaitDraining(stream)
    }
  } else {
    await _awaitDraining(stream)
    return writeAsync(stream, chunk, encoding)
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
    return endAsync(stream)
  }
}

function _initAsyncWritableState(
  stream: NodeJS.WritableStream & Partial<InternalAsyncState>,
): stream is NodeJS.WritableStream & InternalAsyncState {
  if (!stream._asyncWritableState) {
    stream._asyncWritableState = {
      draining: true,
      drainPromise: null,
    }
  }
  return true
}

function _awaitDraining(
  stream: NodeJS.WritableStream & InternalAsyncState,
): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!stream._asyncWritableState.drainPromise) {
        stream._asyncWritableState.drainPromise = new Promise<void>((dpResolve) => {
          stream.once('drain', () => {
            stream._asyncWritableState.drainPromise = null
            stream._asyncWritableState.draining = true
            dpResolve()
          })
        })
      }

      // queue up drain awaiters in a promise chain
      stream._asyncWritableState.drainPromise = stream._asyncWritableState.drainPromise.then(resolve)
    })
}

(Writable.prototype as any).writeAsync = function(chunk: any, encoding: any) {
  return writeAsync(this, chunk, encoding)
};
(Duplex.prototype as any).writeAsync = function(chunk: any, encoding: any) {
  return writeAsync(this, chunk, encoding)
};
(Writable.prototype as any).endAsync = function() {
  return endAsync(this)
};
(Duplex.prototype as any).endAsync = function() {
  return endAsync(this)
}
