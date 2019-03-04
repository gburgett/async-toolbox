
export type MaybeCallback<T> = (() => Promise<T>) | ((cb: TaskCB<T>) => void)
export type TaskCB<T> = (err: Error | null, result?: T) => void

/**
 * Takes an Action which either receives a callback or returns a promise,
 * and awaits the appropriate thing.
 *
 * If the action returns a 'thenable', that is awaited.  Otherwise, a new
 * promise object is returned which is resolved when the callback is called.
 */
export function promisify<T>(action: MaybeCallback<T>): Promise<T> {
  let returnedPromise: Promise<T> | void | undefined
  const cbPromise = new Promise<T>((resolve, reject) => {
    returnedPromise = action((err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })

  if (returnedPromise &&
    typeof returnedPromise == 'object' &&
    'then' in returnedPromise) {
      return returnedPromise
  }

  return cbPromise
}

/**
 * Takes an Action which either receives a callback or returns a promise,
 * and awaits the appropriate thing.
 *
 * If the action returns a 'thenable', that is awaited and the cb is called
 * when it finishes.  Otherwise, the callback is called directly by the action.
 */
export function callbackify<T>(action: MaybeCallback<T>, cb: TaskCB<T>): void {
  const returnedPromise = action(cb)

  if (returnedPromise &&
    typeof returnedPromise == 'object' &&
    'then' in returnedPromise) {
      returnedPromise.then(
        (value) => cb(null, value),
        (err) => cb(err),
      )
  }
}
