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
export function readAsync(stream: NodeJS.ReadableStream & InternalAsyncState, size?: number): Promise<any> {
  if (stream._asyncReadableState === undefined) {
    stream._asyncReadableState = {
      readablePromise: null,
    }
  }

  return new Promise<any>((resolve, reject) => {
    // console.error('readable?', stream.readable)
    if (stream.readable) {
      try {
        const data = stream.read(size)
        if (data != null) {
          resolve(data)
          return
        }
      } catch (e) {
        reject(e)
        return
      }
    }

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
          readAsync(stream, size)
            .then(resolve)
            .catch(reject),
      ).catch((err) => reject(err))
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
