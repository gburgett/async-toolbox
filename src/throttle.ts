import { wait } from '.'

export function throttle<T>(fn: () => Promise<T>, period = 1000): () => Promise<T> {
  let timeout: Promise<void> | undefined
  let inProgress: Promise<T> | undefined
  let next: Promise<T> | undefined

  return function(this: any) {
    const context = this

    if (next) {
      return next
    }

    if (inProgress || timeout) {
      return next = waitInvokeNext()
        .then(
          (result) => {next = undefined; return result},
          (err) => { next = undefined; throw err })
    }

    return invokeNow()

    async function waitInvokeNext() {
      if (timeout) {
        // wait till the previous throttle period has passed
        await timeout
      }
      if (inProgress) {
        try {
          // ensure the previous invocation is complete
          await inProgress
        } catch {
          // suppress
        }
      }

      return invokeNow()
    }

    function invokeNow() {
      // set the throttling timeout
      timeout = wait(period)
        .then(() => { timeout = undefined })
      inProgress = fn.apply(context)
        .then(
          (result: T) => { inProgress = undefined; return result },
          (err: any) => { inProgress = undefined; throw err })
      return inProgress as Promise<T>
    }
  }
}
