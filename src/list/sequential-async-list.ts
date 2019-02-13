import { Semaphore } from '../semaphore'
import { ParallelAsyncList } from './parallel-async-list'

type NotPromise<T> = Exclude<T, Promise<any>>
type BindResult<U> = Promise<U[]> | Promise<U>
type SemaphoreLock = <U>(action: () => Promise<U>) => Promise<U>

interface Options {
  /**
   * Provide an optional semaphore to lock access to the resulting tasks.
   */
  semaphore?: { lock: SemaphoreLock },
}

/**
 * A Monadic representation of a list of promises, exposing functions to
 * do computations over the promises.  The key feature of this monad is that
 * the computations are run in-sequence and not in parallel, like you would
 * get with Promise.all(arr.map(async () => {}))
 */
export class SequentialAsyncList<T> implements Promise<T[]> {

  /**
   * The constructor for a SequentialAsyncList.
   *
   * "Lifts" a set of items into the monadic space, so that they can be transformed.
   */
  public static lift<T>(items: T[] | Promise<T[]>, options?: Options) {
    if (Array.isArray(items)) {
      return new SequentialAsyncList<T>(Promise.resolve(items), options || {})
    }
    return new SequentialAsyncList<T>(items, options || {})
  }

  public readonly [Symbol.toStringTag]: string
  private _semaphore: { lock: SemaphoreLock }

  private constructor(private readonly promises: Promise<T[]>, private readonly options: Options) {
    if (options && options.semaphore) {
      this._semaphore = options.semaphore
    } else {
      this._semaphore = { lock: (action) => action() }
    }
  }

  /**
   * Transform each item in the sequential list using an async function
   *
   * The function is only invoked after the promise from the previous function completes.
   */
  // monad bind
  public flatMap<U>(fn: (item: T, index?: number) => Promise<U[]> | Promise<U>): SequentialAsyncList<U> {
    return new SequentialAsyncList<U>(
      this._bind(fn),
      {
        semaphore: this._semaphore,
      },
    )
  }

  /**
   * Transform each item in the sequential list using an async function
   *
   * The function is only invoked after the previous promise in sequence completes.
   */
  public map<U>(fn: (item: T, index?: number) => U & NotPromise<U>): SequentialAsyncList<U> {
    return new SequentialAsyncList<U>(
      this._bind((item, idx) => Promise.resolve(fn(item, idx))),
      {
        semaphore: this._semaphore,
      },
    )
  }

  /**
   * Do something for each promise in sequence.  Returns a promise that can be awaited
   * to get the result.
   */
  public async forEach(fn: (item: T, index?: number) => Promise<void>): Promise<void> {
    await this._bind(fn)
  }

  /**
   * Reduce each item in the sequence.
   */
  public async reduce<U>(fn: (aggregate: U, current: T, index?: number) => Promise<U>, initial: U): Promise<U> {
    let aggregate = initial
    await this._bind(async (item, index) => (
      aggregate = await fn(aggregate, item, index)
    ))
    return aggregate
  }

  /**
   * Equivalent to Promise.all.then
   */
  public async then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
    return this.promises.then(onfulfilled, onrejected)
  }

  /**
   * Equivalent to Promise.all.catch
   */
  public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null)
    : Promise<T[] | TResult> {
      return this.promises.catch(onrejected)
  }

  /**
   * Converts this sequential list to a parallel list, so that the next sequence
   * of tasks execute in parallel.
   */
  public parallel(): ParallelAsyncList<T> {
    return ParallelAsyncList.lift(this.promises,
      {
        semaphore: this._semaphore,
      })
  }

  /**
   * Monadic Bind function
   *
   * Applies the transform function after all promises from prior transformations have finished.
   */
  protected async _bind<U>(
    fn: (item: T, index?: number) => BindResult<U>,
    ): Promise<U[]> {

    const arr = (await this.promises)
    const result = [] as U[]
    for (let i = 0; i < arr.length; i++) {
      const output = await this._semaphore.lock<U[] | U>(
        () => fn(arr[i], i),
      )

      if (Array.isArray(output)) {
        result.push(...output)
      } else {
        result.push(output)
      }
    }
    return result
  }
}
