
declare var performance: { now(): number }
export const isomorphicPerformance: { now(): number } = (() => {
  if (typeof (performance) != 'undefined') {
    return performance
  }
  if (typeof (eval) != 'undefined' && typeof (require) != 'undefined') {
    try {
      // we only get here in nodejs.  Use eval to confuse webpack so it doesn't import
      // the perf_hooks package.
      // tslint:disable-next-line:no-eval
      return eval('require')('perf_hooks').performance
    } catch (ex: any) {
      // Error: cannot find module 'perf_hooks'
    }
  }

  // we fall through here if all ways of looking up the "performance" API failed.
  // This can happen inside ExecJS during server-side rendering.
  return Date
})()

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
    } catch (ex: any) {
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
