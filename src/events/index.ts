
/**
 * The subset of EventEmitter that we need for this function.
 */
interface EventEmitter {
  once(event: string | symbol, listener: (...args: any[]) => void): this
}

/**
 * Returns a promise that resolves the next time the emitter emits the given
 * event.  The promise is rejected if the emitter emits 'error'.
 *
 * If the given event is 'error', then the promise is resolved with the error and does not reject.
 */
export function onceAsync(emitter: EventEmitter, event: string | symbol): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    let resolved = false
    emitter.once(event, (...args: any[]) => {
      if (!resolved) {
        resolved = true
        resolve(args)
      }
    })

    if (event != 'error') {
      emitter.once('error', (err) => {
        if (!resolved) {
          resolved = true
          reject(err)
        }
      })
    }
  })
}
