
/**
 * Returns a promise which polls the given test function, resolving when the test function
 * returns true.
 * @param test A function to call every millisecond until it returns true.
 * @param options interval: how often to poll in milliseconds,
 *    timeout: how long to poll for before rejecting the promise
 */
export function waitUntil(
  test: () => boolean | Promise<boolean>,
  options?: { interval?: number, timeout?: number },
): Promise<void> {
  const opts = Object.assign({
    interval: 1,
    timeout: 1000,
  }, options)

  const start = Date.now()
  return new Promise((resolve, reject) => {
    async function check() {
      try {
        if (await test()) {
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
