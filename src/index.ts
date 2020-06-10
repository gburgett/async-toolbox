export * from './semaphore'
export * from './limiter'
export * from './promisify'
export * from './throttle'
export * from './recurring'
export * from './wait'
export * from './waitUntil'
export * from './timeout'
export * from './memo'

/**
 * Equivalent to Ruby's "present?" method, with Typescript niceties.
 * @example
 *   const a: Array<string | undefined | null> = ['', undefined, null, 'a', 'b']
 *   const b: string[] = a.filter(present) // ['a', 'b']
 * @param value
 */
export function present<T>(value: T): value is Exclude<T, null | undefined | false | ''> {
  if (typeof value == 'string') {
    return value ? value.length > 0 && /\S/.test(value) : false
  }
  if (typeof value == 'number') {
    return value != 0
  }
  return !!value
}
