import { Duplex, Readable } from 'stream'

interface InternalAsyncState {
  _asyncReadableState: {
    readablePromise: Promise<void> | null,
  } | undefined
}

/**
 * Reads a chunk from the current write stream, returning a promise that completes
 * when the chunk has actually been read.
 *
 * This function respects the 'readable' event of the stream.  If the stream is currently
 * waiting for data, the function will queue the read until the readable event is fired.
 */
export function readAsync(stream: Readable & InternalAsyncState, size?: number): Promise<any> {
  if (stream._asyncReadableState === undefined) {
    stream._asyncReadableState = {
      readablePromise: null,
    }
  }

  return new Promise<any>((resolve, reject) => {
    if (stream.readable) {
      try {
        resolve(stream.read(size))
      } catch (e) {
        reject(e)
      }
    } else {
      if (!stream._asyncReadableState!.readablePromise) {
        stream._asyncReadableState!.readablePromise = new Promise<void>((rpResolve, rpErr) => {
          const resolved = false
          stream.once('readable', () => {
            if (resolved) { return }
            stream._asyncReadableState!.readablePromise = null
            rpResolve()
          })
          stream.once('error', (err) => {
            if (resolved) { return }
            stream._asyncReadableState!.readablePromise = null
            rpErr(err)
          })
        })
      }

      // await recursive
      stream._asyncReadableState!.readablePromise =
        stream._asyncReadableState!.readablePromise!.then(
          () =>
            stream.readAsync(size)
              .then(resolve)
              .catch(reject),
        ).catch((err) => reject(err))
    }
  })
}

declare module 'stream' {
  interface Readable {
    /**
     * Reads a chunk from the current write stream, returning a promise that completes
     * when the chunk has actually been read.
     *
     * This function respects the 'readable' event of the stream.  If the stream is currently
     * waiting for data, the function will queue the read until the readable event is fired.
     */
    readAsync(size?: number): Promise<any>
  }

  interface Duplex {
    /**
     * Reads a chunk from the current write stream, returning a promise that completes
     * when the chunk has actually been read.
     *
     * This function respects the 'readable' event of the stream.  If the stream is currently
     * waiting for data, the function will queue the read until the readable event is fired.
     */
    readAsync(size?: number): Promise<any>
  }
}
Readable.prototype.readAsync = function(size) {
  return readAsync(this, size)
}
Duplex.prototype.readAsync = function(size) {
  return readAsync(this, size)
}
