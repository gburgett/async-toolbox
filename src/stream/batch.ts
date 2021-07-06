import { ParallelTransform, ParallelTransformOptions } from './parallel_transform'
import { Transform, Writable } from './types'

interface BatchOptions {
  /**
   * The maximum number of items that will be passed to the processor in each
   * invocation.  Defaults to 1000.  Can be set to Infinity.
   */
  maxBatchSize: number,
}

/**
 * Constructs a Writable stream that aggregates writes and passes them to an
 * asynchronous batch processing function.  This function is always invoked in
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
 * asynchronous batch processing function.  This function is always invoked in
 * serial (never in parallel) with the next `maxBatchSize` items that were
 * written to the queue.
 *
 * The results of the batch processing function are written to the readable
 * side of the transform stream.  Note that if the function returns `undefined`
 * and the stream is not yet flowing, the stream will be switched to the flowing
 * state.  This is to support the other use case of a write-only batch processing
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
    throttlePeriod: 0,
  }, options)

  return new BatchProcessingStream(
    processor,
    opts,
  )
}

class BatchProcessingStream<T, U> extends ParallelTransform {
  private processing: Promise<any> | undefined = undefined
  private queue: T[] = []

  constructor(
    processBatch: (batch: T[]) => Promise<U[] | void>,
    private readonly options: BatchOptions,
  ) {
    // we keep our own queue, and when our queue is full that's when we need
    // to block
    super({
      maxParallelChunks: 1,
      writableHighWaterMark: 1,
      objectMode: true,
    } as ParallelTransformOptions)

    if (processBatch) {
      this._processBatch = processBatch
    }
  }

  public async _transformAsync(chunk: T) {
    if (this.queue.length < this.options.maxBatchSize) {
      this.queue.push(chunk)
      return
    }

    // don't accumulate more in the batch till we've processed this batch
    await this.processing

    // start the batch and then push this item onto the next batch
    this.processing = this.processQueue()
      .then((value) => {
        this.pushBatch(value)
        this.processing = undefined
      },
      (ex) => this.emit('error', ex))
    this.queue.push(chunk)
  }

  public async _flushAsync() {
    await this.processing

    // ensure the queue finishes before we end
    while (this.queue.length > 0) {
      const value = await this.processQueue()
      this.pushBatch(value)
    }
  }

  /**
   * @see ParallelTransformOptions['transformAsync']
   */
  protected _processBatch(b: T[]): Promise<U[] | void> {
    throw new Error('No implementation given for _processBatch')
  }

  private processQueue() {
    const b = this.queue
    this.queue = []
    return this._processBatch(b)
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
