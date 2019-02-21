import { Duplex, Writable } from 'stream'

interface InternalAsyncState {
  _asyncWrtiableState: {
    draining: boolean
    drainPromise: Promise<void> | null,
  } | undefined
}

function writeAsync(this: Writable & InternalAsyncState, chunk: any, encoding?: string): Promise<void> {
  return _awaitDraining.call(this, (cb: (err?: any) => void) => this.write(chunk, encoding, cb))
}

function endAsync(this: Writable & InternalAsyncState): Promise<void> {
  return _awaitDraining.call(this, (cb: (err?: any) => void) => {
    this.once('error', cb)
    this.end(cb)
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

function _awaitDraining(this: Writable & InternalAsyncState, action: (cb: (err?: any) => void) => void): Promise<void> {
  _initAsyncWritableState.call(this)

  return new Promise<void>((resolve, reject) => {
    if (this._asyncWrtiableState!.draining) {
      action((err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    } else {
      if (!this._asyncWrtiableState!.drainPromise) {
        this._asyncWrtiableState!.drainPromise = new Promise<void>((dpResolve) => {
          this.once('drain', () => {
            this._asyncWrtiableState!.drainPromise = null
            this._asyncWrtiableState!.draining = true
            dpResolve()
          })
        })
      }

      // await recursive
      this._asyncWrtiableState!.drainPromise!.then(
        () =>
          _awaitDraining.call(this, action)
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

Writable.prototype.writeAsync = writeAsync
Duplex.prototype.writeAsync = writeAsync
Writable.prototype.endAsync = endAsync
Duplex.prototype.endAsync = endAsync
