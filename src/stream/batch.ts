import { Transform as TransformImpl, TransformCallback } from 'stream'
import { wait } from '../wait'
import { ParallelTransform, ParallelTransformOptions } from './parallel_transform'
import { Transform, Writable } from './types'

interface BatchOptions {
  /**
   * The maximum number of items that will be passed to the processor in each
   * invocation.  Defaults to 1000.  Can be set to Infinity.
   */
  maxBatchSize: number,

  /**
   * The maximum number of parallel invocations of the batch processor.  Defaults
   * to 1, meaning that the function is not invoked until the previous invocation
   * has returned.  Set it to `Infinity` to run the batch processor as soon
   * as there's a full batch, even if the previous invocations have not finished.
   */
  parallelLimit: number

  /** Sets the name of the stream for use in a Pipeline with StreamProgress */
  name?: string
}

/**
 * Constructs a Writable stream that aggregates writes and passes them to an
 * asynchronous batch inProgress function.  This function is always invoked in
 * serial (never in parallel) with the next `maxBatchSize` items that were
 * written to the queue.
 *
 * The first invocation always happens with a single item in the batch, then
 * subsequent batches contain more items up to `maxBatchSize`.
 */
export function batch<T>(
  processor: (this: Writable<T>, batch: T[]) => Promise<void>,
  options?: Partial<BatchOptions>,
): Writable<T>

/**
 * Constructs a Transform stream that aggregates writes and passes them to an
 * asynchronous batch inProgress function.  This function is always invoked in
 * serial (never in parallel) with the next `maxBatchSize` items that were
 * written to the queue.
 *
 * The results of the batch inProgress function are written to the readable
 * side of the transform stream.  Note that if the function returns `undefined`
 * and the stream is not yet flowing, the stream will be switched to the flowing
 * state.  This is to support the other use case of a write-only batch inProgress
 * function.
 *
 * The first invocation always happens with a single item in the batch, then
 * subsequent batches contain more items up to `maxBatchSize`.
 */
export function batch<T, U>(
  processor: (this: Transform<T, U>, batch: T[]) => Promise<U[] | void>,
  options?: Partial<BatchOptions>,
): Transform<T, U>

export function batch<T, U>(
  processor: (this: Transform<T, U>, batch: T[]) => Promise<U[] | void>,
  options?: Partial<BatchOptions>,
): Transform<T, U> {
  const opts = Object.assign({
    maxBatchSize: 1000,
    parallelLimit: 1,
  }, options)

  return new BatchStream(
    processor,
    opts,
  )
}

class BatchStream<T, U> extends TransformImpl {
  public readonly name?: string
  private inProgress: Promise<any>[] = []
  private nextBatch: T[] = []

  constructor(
    processBatch: (batch: T[]) => Promise<U[] | void>,
    private readonly options: BatchOptions,
  ) {
    // we keep our own queue, and when our queue is full that's when we need
    // to block
    super({
      writableHighWaterMark: 1,
      objectMode: true,
    } as ParallelTransformOptions)

    if (processBatch) {
      this._processBatch = processBatch
    }
    this.name = options.name || (processBatch && processBatch.name)
  }

  public _transform(chunk: T, _encoding: any, cb: TransformCallback) {
    const transformAsync = async () => {
      if (this.nextBatch.length < this.options.maxBatchSize) {
        this.nextBatch.push(chunk)
        return
      }

      while (this.inProgress.length >= this.options.parallelLimit) {
        // Start putting backpressure by waiting for one of the parallel inProgress tasks
        // to finish
        await Promise.race([...this.inProgress])
      }

      // start the batch and then push this item onto the next batch
      this.processQueue()
      this.nextBatch.push(chunk)
    }

    transformAsync()
      .then(
        () => cb(undefined),
        (err) => cb(err),
      )
  }

  public _flush(cb: TransformCallback) {
    const flushAsync = async () => {
      // ensure the queue finishes before we end
      while (this.nextBatch.length > 0) {
        while (this.inProgress.length >= this.options.parallelLimit) {
          await Promise.race([...this.inProgress])
        }

        this.processQueue()
      }

      // Wait for all the in-progress batch transformations to finish
      await Promise.all([...this.inProgress])
    }

    flushAsync()
      .then(
        () => cb(undefined),
        (err) => cb(err),
      )
  }

  /**
   * @see ParallelTransformOptions['transformAsync']
   */
  protected _processBatch(b: T[]): Promise<U[] | void> {
    throw new Error('No implementation given for _processBatch')
  }

  private processQueue() {
    const b = this.nextBatch
    this.nextBatch = []
    const p = this._processBatch(b)
      .then((value) => {
        // send the resulting values downstream
        this.pushBatch(value)
        // remove this promise from the "inProgress" array
        const idx = this.inProgress.indexOf(p)
        if (idx >= 0) { this.inProgress.splice(idx, 1) }
      },
      (ex) => this.emit('error', ex))
    this.inProgress.push(p)

    return p
  }

  private pushBatch(value: U[] | void) {
    if (!value) {
      if ((this as any).readableFlowing === null) {
        // The batch function does not generate any data.  Switch us into
        // "flowing" mode so that we can properly end.
        this.resume()
      }
    } else {
      value.forEach((x) => this.push(x))
    }
  }
}
