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

declare var performance: { now(): number }
export const isomorphicPerformance: typeof performance = typeof (performance) != 'undefined' ?
  performance :
  // we only get here in nodejs.  Use eval to confuse webpack so it doesn't import
  // the perf_hooks package.
  // tslint:disable-next-line:no-eval
  eval('require')('perf_hooks').performance

// tslint:disable-next-line: no-shadowed-variable
export function timeout<T>(action: () => Promise<T>, timeout: number): Promise<T> {
  let completed = false
  return new Promise<T>(async (resolve, reject) => {
    const start = isomorphicPerformance.now()
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true
        const end = isomorphicPerformance.now()
        reject(new TimeoutError(end - start, timeout))
      }
    }, timeout)

    try {
      const result = await action()
      if (!completed) {
        completed = true
        clearTimeout(timer)
        resolve(result)
      }
    } catch (ex) {
      if (!completed) {
        completed = true
        clearTimeout(timer)
        reject(ex)
      }
    }
  })
}

export class TimeoutError extends Error {
  // tslint:disable-next-line: no-shadowed-variable
  constructor(public readonly elapsed: number, public readonly timeout: number) {
    super(`timed out after ${elapsed}`)
    this.name = 'TimeoutError'
  }
}

/**
 * Equivalent to Ruby's "present?" method, with Typescript niceties.
 * @example
 *   const a: Array<string | undefined | null> = ['', undefined, null, 'a', 'b']
 *   const b: string[] = a.filter(present) // ['a', 'b']
 * @param value
 */
export function present<T>(value: T | null | undefined | false): value is T {
  if (typeof value == 'string') {
    return value && /\S/.test(value)
  }
  if (typeof value == 'number') {
    return value != 0
  }
  return !!value
}
