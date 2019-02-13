import { ParallelAsyncList, ParallelAsyncListOptions } from './parallel-async-list'
import { SequentialAsyncList, SequentialAsyncListOptions } from './sequential-async-list'

export * from './sequential-async-list'
export * from './parallel-async-list'

/**
 * Creates a monad which executes each async task in sequence, i.e. one at a time.
 * Can accept a semaphore implementation which is passed along to each step in the chain.
 * @see SequentialAsyncList
 */
export function sequential<T>(list: T[] | Promise<T[]>, options?: SequentialAsyncListOptions) {
  return SequentialAsyncList.lift(list, options)
}

/**
 * Creates a monad which executes all async tasks in parallel, with optionally limited concurrency.
 * Can accept a semaphore implementation which is passed along to each step in the chain.
 * @see ParallelAsyncList
 */
export function parallel<T>(list: T[] | Promise<T[]>, options?: ParallelAsyncListOptions) {
  return ParallelAsyncList.lift(list, options)
}
