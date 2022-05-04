import { AbortError, AbortSignal } from './abort'

/**
 * Returns a promise which resolves after a given number of milliseconds,
 * using setTimeout.
 */
export function wait(ms: number, abort?: {signal: AbortSignal}): Promise<void> {

  return new Promise((resolve, reject) => {
    let resolved = false
    const timeout = setTimeout(() => {
      resolved = true
      resolve()
    }, ms)

    if (abort?.signal) {
      abort.signal.addEventListener('abort',
        () => {
          if (!resolved) {
            clearTimeout(timeout)

            reject(new AbortError())
          }
        },
        { once: true })
    }
  })
}

export function waitImmediate(): Promise<void> {
  return new Promise((res) => {
    setImmediate(() => res())
  })
}
