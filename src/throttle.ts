import { wait } from '.'

/**
 * Throttle an asynchronous function so it is only invoked once during the period,
 * and never invoked a second time while a previous invocation has not yet completed.
 * If the throttled function is called multiple times within the period, all those
 * calls will receive the result of the next invocation.
 * @param period The minimum time to wait since the last invocation before allowing
 *               the wrapped function to be invoked again.
 */
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

    async function invokeNow() {
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
