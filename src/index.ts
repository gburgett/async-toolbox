export * from './semaphore'
export * from './limiter'
export * from './promisify'

/**
 * Returns a promise which resolves after a given number of milliseconds,
 * using setTimeout.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(), ms),
  )
}
