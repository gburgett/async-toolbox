
import * as list from './list'
import * as stream from './stream'

export * from './semaphore'

// tslint:disable:variable-name
export const Stream = stream
export const List = list
// tslint:enable:variable-name

/**
 * Returns a promise which resolves after a given number of milliseconds,
 * using setTimeout.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(), ms),
  )
}
