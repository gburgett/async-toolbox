export * from './semaphore'
export * from './limiter'
export * from './promisify'
export * from './throttle'

/**
 * Returns a promise which resolves after a given number of milliseconds,
 * using setTimeout.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(), ms),
  )
}

/**
 * Returns a promise which polls the given test function, resolving when the test function
 * returns true.
 * @param test A function to call every millisecond until it returns true.
 * @param options interval: how often to poll in milliseconds,
 *    timeout: how long to poll for before rejecting the promise
 */
export function waitUntil(test: () => boolean, options?: { interval?: number, timeout?: number }): Promise<void> {
  const opts = Object.assign({
    interval: 1,
    timeout: 1000,
  }, options)

  const start = Date.now()
  return new Promise((resolve, reject) => {
    function check() {
      try {
        if (test()) {
          resolve()
          return
        }
      } catch (e) {
        reject(e)
        return
      }

      if (Date.now() - start > opts.timeout) {
        reject(new Error(`waitUntil timed out after ${opts.timeout} ms`))
        return
      }

      setTimeout(check, opts.interval)
    }

    check()
  })
}
