import { Duplex, Readable } from 'stream'

interface InternalAsyncState {
  _asyncReadableState: {
    readablePromise: Promise<void> | null,
    rpResolveOnEnd: null | (() => void)
    readable: boolean,
  }

  readableEnded: boolean
}

/**
 * Reads a chunk from the current write stream, returning a promise that completes
 * when the chunk has actually been read.
 *
 * This function respects the 'readable' event of the stream.  If the stream is currently
 * waiting for data, the function will queue the read until the readable event is fired.
 */
export async function readAsync(stream: NodeJS.ReadableStream, size?: number): Promise<any> {
  if (!_initAsyncReadableState(stream)) {
    throw new Error(`_initAsyncWritableState returned false!`)
  }

  if (stream._asyncReadableState.readable) {
    // read immediately
    const chunk = stream.read(size)
    if (chunk != null) {
      return chunk
    }

    // no data
    stream._asyncReadableState.readable = false
  }

  // wait for data to be available
  return _awaitData(stream)
}

function _awaitData(
  stream: NodeJS.ReadableStream & InternalAsyncState,
): Promise<any> {
  return new Promise<void>((resolve) => {
    if (!stream._asyncReadableState.readablePromise) {
      stream._asyncReadableState.readablePromise = new Promise<void>((rpResolve) => {
        stream._asyncReadableState.rpResolveOnEnd = rpResolve

        stream.once('data', (chunk) => {
          stream._asyncReadableState.readablePromise = null
          stream._asyncReadableState.rpResolveOnEnd = null
          stream._asyncReadableState.readable = true
          stream.pause()
          rpResolve(chunk)
        })
        stream.resume()
      })
    }

    // queue up drain awaiters in a promise chain
    stream._asyncReadableState.readablePromise = stream._asyncReadableState.readablePromise.then(resolve)
  })
}

function _initAsyncReadableState(
  stream: NodeJS.ReadableStream & Partial<InternalAsyncState>,
): stream is NodeJS.ReadableStream & InternalAsyncState {
  if (!stream._asyncReadableState) {
    stream._asyncReadableState = {
      readablePromise: null,
      rpResolveOnEnd: null,
      readable: true,
    }

    stream.once('end', () => {
      if (stream._asyncReadableState &&
          stream._asyncReadableState.rpResolveOnEnd) {
        // resolve the waiting async readers with "null"
        stream._asyncReadableState.rpResolveOnEnd()
      }
    })
  }
  return true
}

(Readable.prototype as any).readAsync = function(size?: number) {
  return readAsync(this, size)
};

(Duplex.prototype as any).readAsync = function(size?: number) {
  return readAsync(this, size)
}
