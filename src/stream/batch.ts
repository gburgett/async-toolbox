import { throttle } from '../throttle'
import { ParallelTransform, ParallelTransformOptions } from './parallel_transform'
import { Transform, Writable } from './types'

interface BatchOptions {
  /**
   * The maximum number of items that will be passed to the processor in each
   * invocation.  Defaults to 1000.  Can be set to Infinity.
   */
  maxBatchSize: number,
  /**
   * The amount of time in ms that the processor will wait between invocations.
   * This also ensures all processor invocations happen in serial.
   *
   * Defaults to 0, which only ensures that the invocations happen in serial.
   * @see throttle
   */
  throttlePeriod: number
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
  processor: (batch: T[]) => Promise<void>,
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
  processor: (batch: T[]) => Promise<U[] | void>,
  options?: Partial<BatchOptions>,
): Transform<T, U>

export function batch<T, U>(
  processor: (batch: T[]) => Promise<U[] | void>,
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
  private nextQueue: T[] = []

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

    this.processQueue = throttle(this.processQueue, this.options.throttlePeriod)
  }

  public async _transformAsync(chunk: T) {
    if (this.queue.length < this.options.maxBatchSize) {
      this.queue.push(chunk)
    } else {
      this.nextQueue.push(chunk)
    }
    if (this.nextQueue.length >= this.options.maxBatchSize) {
      // don't accumulate more in the batch till we've processed this batch
      const value = await this.processQueue()
      this.pushBatch(value)
    } else {
      // start it but keep accumulating the batch while we wait
     this.processing = this.processQueue()
        .then((value) => {
          this.pushBatch(value)
        })
        .catch((ex) => this.emit('error', ex))
    }
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

  private async processQueue() {
    const b = this.queue
    this.queue = this.nextQueue
    this.nextQueue = []
    return await this._processBatch(b)
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