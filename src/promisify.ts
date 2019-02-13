
export type Action<T> = (() => Promise<T>) | ((cb: TaskCB<T>) => void)
export type TaskCB<T> = (err: Error | null, result?: T) => void

export function promisify<T>(action: Action<T>): Promise<T> {
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

export function callbackify<T>(action: Action<T>, cb: TaskCB<T>): void {
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
