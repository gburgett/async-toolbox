import { DuplexOptions, Transform, TransformCallback } from 'stream'
import { ReadLock, Semaphore } from '../semaphore'

interface SemaphoreInterface {
  lock<T>(action: (lock: ReadLock) => Promise<T>): Promise<T>
  isEmpty(): boolean

  on(event: 'empty', cb: () => void): void
}

export interface ParallelTransformOptions extends DuplexOptions {

  /**
   * The maximum number of chunks that can be transformed in parallel.  Use this
   * to, for instance, restrict the number of outgoing API calls you make in the
   * transformAsync implementation.
   *
   * Alternatively you can provide your own semaphore to share a lock between steps.
   */
  maxParallelChunks?: number

  /**
   * Provide a custom semaphore implementation to share a lock between multiple steps,
   * ex. if multiple transform steps are calling the same rate-limited API.
   */
  semaphore?: SemaphoreInterface

  flushAsync?: (this: ParallelTransform) => Promise<void>

  /**
   * Implement this function to transform a single chunk, calling `this.push()` to
   * pass values to the next stream in the chain.  Multiple instances
   * of _transformAsync may be invoked simultaneously to perform batch processing,
   * up to the given value of `maxParallelChunks`.
   * @param chunk The chunk to transform
   * @param encoding The encoding of the current chunk
   */
  transformAsync?(this: ParallelTransform, chunk: any, lock: ReadLock): Promise<void>
}

type TransformGenerator<T = any, U = any> = (chunk: T) => AsyncGenerator<U, void, unknown>
type TransformFlush<U = any> = () => AsyncGenerator<U, void, unknown>

/**
 * An extension of a Transform stream which can process chunks in parallel.
 * Ordering is not preserved, because the individual transformations may complete
 * in any order.
 *
 * Implementers should not implement `_transform`, but rather `_transformAsync`.
 */
export class ParallelTransform extends Transform {

  public static from(
    generator: TransformGenerator,
    opts?: ParallelTransformOptions
  ): ParallelTransform

  public static from(
    generator: TransformGenerator,
    flush: TransformFlush,
    opts?: ParallelTransformOptions
  ): ParallelTransform

  public static from(
      generator: TransformGenerator,
      flush?: TransformFlush | ParallelTransformOptions,
      opts?: ParallelTransformOptions
    ) {
    let flushFn: TransformFlush | undefined
    if (typeof flush == 'function') {
      flushFn = flush
    } else if(typeof flush == 'object') {
      opts = flush
      flushFn = flush = undefined
    }

    return new ParallelTransform({
      ...opts,
      async transformAsync(chunk) {
        for await(const value of generator(chunk)) {
          this.push(value)
        }
      },
      async flushAsync() {
        if (flushFn) {
          for await(const value of flushFn()) {
            this.push(value)
          }
        }
      }
    })
  }

  // tslint:disable-next-line:variable-name
  private _semaphore: SemaphoreInterface

  constructor(opts: ParallelTransformOptions) {
    super(opts)

    this._semaphore = opts.semaphore || new Semaphore({ tokens: opts.maxParallelChunks || 4 })
    if (opts.transformAsync) {
      this._transformAsync = opts.transformAsync
    }

    if (opts.flushAsync) {
      this._flushAsync = opts.flushAsync
    }

    if (!this._transformAsync) {
      throw new Error('Please provide a _transformAsync implementation')
    }
  }

  public _transform(chunk: any, encoding: string, callback: TransformCallback) {
    this._semaphore.lock(async (lock) => {
      // Tell the stream lib to send us more data
      callback(undefined)
      return await this._transformAsync(chunk, lock)
    })
      .catch((err) => this.emit('error', err))
  }

  public _flush(callback: TransformCallback) {
    const finalize = () => {
      // can't just use .lock here in case maxInflight > 1
      if (this._semaphore.isEmpty()) {
        this._flushAsync()
          .then(
            () => {
              callback(undefined)
            },
            (err: Error) => {
              callback(err)
            },
          )
      } else {
        this._semaphore.on('empty', () => {
          finalize()
        })
      }
    }

    finalize()
  }

  /**
   * @see ParallelTransformOptions['transformAsync']
   */
  protected _transformAsync(chunk: any, lock: ReadLock): Promise<void> {
    throw new Error('No implementation given for _transformAsync')
  }

  protected _flushAsync(): Promise<void> {
    return Promise.resolve()
  }
}
