import { Interval, RateLimiter } from 'limiter'

import { Action, callbackify } from './promisify'
import { Semaphore, SemaphoreConfig } from './semaphore'

interface LimiterConfig {
  maxInflight?: number,
  tokensPerInterval: number,
  interval: Interval
}

declare module 'limiter' {
  export interface RateLimiter {
    /** https://github.com/jhurliman/node-rate-limiter */
    getTokensRemaining(): number
  }
}

/**
 * A Semaphore which uses the 'limiter' npm package to provide rate limiting.
 * 'limiter' must be installed separately as an optional dependency
 */
export class Limiter extends Semaphore {
  public config: Readonly<LimiterConfig & SemaphoreConfig>

  private _limiter: RateLimiter

  constructor(config?: LimiterConfig) {
    super()

    this.config = Object.assign({
      maxInflight: Infinity,
    }, config)
    this._limiter = new RateLimiter(this.config.tokensPerInterval, this.config.interval)
  }

  /**
   * Gets a snapshot of the current state of the semaphore.
   * @returns the current number of inflight requests, and the current queue size.
   */
  public stats(): Readonly<{ inflight: number, queueSize: number, tokensRemaining: number }> {
    return {
      ...super.stats(),
      tokensRemaining: this._limiter.getTokensRemaining(),
    }
  }

  /**
   * Locks the semaphore, running or enqueuing the given task.  The semaphore is
   * not unlocked until the task completes.  The task should perform the minimum
   * required work and then return a value.  For example, connecting to a remote
   * API and returning the response body for further processing.
   *
   * The task can either be an async function returning a promise, or a function
   * that accepts a callback as the first parameter.
   *
   * @param action An action to be run when the number of inflight tasks is below the limit.
   * @returns A promise that completes when the action completes, returning the result
   *  of the action.
   */
  public lock<T>(action: Action<T>): Promise<T> {
    return super.lock((cb) => {
      this._limiter.removeTokens(1, () => {
        callbackify(action, cb)
      })
    })
  }
}
