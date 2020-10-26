import { ParallelTransform, ParallelTransformOptions } from './stream'
import { Transform, Writable } from './stream/types'
import { throttle } from './throttle'

interface BatchOptions {
  maxBatchSize: number,
  throttle: number
}

export function batch<T>(
  processor: (batch: T[]) => Promise<void>,
  options?: Partial<BatchOptions>,
): Writable<T>

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
    throttle: 0,
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

    this.processQueue = throttle(this.processQueue, this.options.throttle)
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
