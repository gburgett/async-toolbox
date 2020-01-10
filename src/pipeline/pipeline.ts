import { Duplex, DuplexOptions, PassThrough } from 'stream'
import { present } from '..'
import { writeAsync } from '../stream/async_writer'
import { StreamProgress } from './streamProgress'

interface RunOptions {
  progress: boolean
}

export interface PipelineOptions {
  highWaterMark?: number
  encoding?: string
  decodeStrings?: boolean
  objectMode?: boolean
  readableObjectMode?: boolean
  writableObjectMode?: boolean
}

/**
 * A Pipeline wraps a list of streams up into one duplex stream.  The writable
 * side of the duplex stream writes to the first stream in the pipeline, and
 * the readable side of the pipeline reads from the last stream in the pipeline.
 * Errors from any stream in the list are emitted from the pipeline.
 *
 * If the first stream in the pipeline is not writable (i.e. a read only stream),
 * then the pipeline's `writable` attribute will be false and writes will error.
 *
 * If the last stream in the pipeline is not readable, then the pipeline's `readable`
 * attribute will be false and reads will error.
 *
 * All other streams in the pipeline must be duplex streams, as they will be piped
 * to eachother.
 *
 * A pipeline starts in the 'paused' state.  It begins flowing when one of the
 * following occurs:
 *   1. Data is written to the pipeline using `write`
 *   2. Data is read from the pipeline using `read`
 *   3. An input stream is piped to the pipeline, or the pipeline is piped to an output stream.
 *   4. The `run` function is called.
 *
 * If you simply create the pipeline and wait for the `finish` event without doing
 * one of the above 4 things, the `finish` event will never be fired.
 */
export class Pipeline extends Duplex {
  public readonly pipeline: Array<NodeJS.ReadableStream | NodeJS.WritableStream>

  private _initialized: boolean
  private in: NodeJS.WritableStream | undefined
  private out: NodeJS.ReadableStream | undefined
  private _ended: boolean

  // tslint:disable: max-line-length unified-signatures
  constructor(options?: PipelineOptions)
  /** Note: if a writable stream is given, it must be last in the list */
  constructor(input?: NodeJS.ReadableStream | NodeJS.ReadWriteStream, ...pipeline: Array<NodeJS.ReadWriteStream | NodeJS.WritableStream>)
  /** Note: if a writable stream is given, it must be last in the list */
  constructor(options: PipelineOptions, input?: NodeJS.ReadableStream | NodeJS.ReadWriteStream, ...pipeline: Array<NodeJS.ReadWriteStream | NodeJS.WritableStream>)
  // tslint:enable: max-line-length unified-signatures

  constructor(
    first: PipelineOptions | NodeJS.ReadableStream | NodeJS.WritableStream | undefined,
    ...remainder: Array<NodeJS.ReadableStream | NodeJS.WritableStream | undefined>
  ) {
    let pipeline: Array<NodeJS.ReadableStream | NodeJS.WritableStream>
    let opts: PipelineOptions = {}
    if (!first) {
      pipeline = [new PassThrough()]
    } else {
      if (!isWritableStream(first) && !isReadableStream(first)) {
        opts = first
        pipeline = remainder.filter(present)
      } else {
        pipeline = [first, ...remainder].filter(present)
      }
    }

    const input = pipeline[0]
    let output = pipeline[pipeline.length - 1]

    // try to guess whether we should be in object mode
    const writableState = (input as any)._writableState
    const writableObjectMode = writableState && writableState.objectMode
    const readableState = (output as any)._readableState
    const readableObjectMode = readableState && readableState.objectMode

    if ('readable' in output && !output.read) {
      // JSONStream implements pipe but not read
      try {
        output = output.pipe(new PassThrough({
            objectMode: readableObjectMode,
            highWaterMark: readableObjectMode ? 1 : 1024,
          }))
      } catch (err) {
        if (err.code != 'ERR_STREAM_CANNOT_PIPE') {
          throw err
        }
        // OK maybe it's not a legacy stream like JSONStream.  Continue with
        // the output as is, instead of attempting to use a pass through
      }
    }

    super({
      writableObjectMode,
      readableObjectMode,
      ...opts,
    })

    this.pipeline = [
      ...pipeline,
    ]
    if (isWritableStream(input)) {
      this.writable = true
      this.in = input
    } else {
      this.writable = false
      this.in = undefined
    }
    if (isReadableStream(output)) {
      this.readable = true
      this.out = output
    } else {
      this.readable = false
      this.out = undefined
    }
  }

  public run(opts?: Partial<RunOptions>): Promise<void>
  public run(output?: NodeJS.WritableStream, opts?: Partial<RunOptions>): Promise<void>
  public run(input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, opts?: Partial<RunOptions>): Promise<void>

  public run(
    i?: NodeJS.ReadableStream | NodeJS.WritableStream | Partial<RunOptions>,
    o?: NodeJS.WritableStream | Partial<RunOptions>,
    opts?: Partial<RunOptions>,
  ): Promise<void> {
    const input: NodeJS.ReadableStream | undefined =
      i && isReadableStream(i) ? i : undefined
    const output: NodeJS.WritableStream | undefined =
      o && isWritableStream(o) ? o :
        i && isWritableStream(i) ? i : undefined
    opts =
      opts ? opts :
        o && !isWritableStream(o) ? o :
          i && !isReadableStream(i) && !isWritableStream(i) ? i : undefined
    const options = {
      progress: false,
      ...opts,
    }

    return new Promise<void>((resolve, reject) => {
      const progressBar =
        options.progress && new StreamProgress([input, ...this.pipeline, output].filter(present)).start()

      let ended = false
      const end = () => {
        if (ended) {
          return
        }
        ended = true
        if (progressBar) { progressBar.end() }
        resolve()
      }

      const handleError = (err: Error) => {
        if (ended) { return }
        reject(err)
      }

      this.on('end', end)
      this.on('finish', end)
      this.on('close', end)
      this.on('error', handleError)

      if (output) {
        this.pipe(output)
        output.on('end', () => {
          this.end()
        })
        output.on('error', (err) => {
          if (err.code == 'ERR_STREAM_WRITE_AFTER_END') {
            // trying to write to the next stage of the pipeline when it's been closed.
            // Just end this stream instead.
            this.destroy()
          } else {
            handleError(err)
          }
        })
      }

      if (input) {
        input.pipe(this)
      }
      this._init()
      if (!this.in) {
        // our input is a readable stream that will end itself.  Meanwhile the
        // wrapper should end.
        this.end()
      }
    })
  }

  // the "writable" side is the input into the child process
  public async _write(chunk: any, encoding: string, callback: (err: Error | null | undefined) => void) {
    if (!this._initialized) {
      this._init()
    }
    if (!this.in) {
      throw new Error(`Pipeline is not writable - ${this.pipeline[0]} is not a writable stream`)
    }

    try {
      await writeAsync(this.in, chunk, encoding)
      callback(undefined)
    } catch (ex) {
      callback(ex)
    }
  }

  public _final(cb: (error?: Error | null) => void) {
    if (!this._initialized) {
      this._init()
    }

    // end the input stream if it's writable (if not, we assume the pipeline will
    // end itself)
    if (this.in) {
      this.in.end(() => {
        cb()
      })
    } else {
      cb()
    }
  }

  public _read(size?: number) {
    if (!this._initialized) {
      this._init()
    }
    if (!this.out) {
      throw new Error(`Pipeline is not readable - ${this.pipeline[this.pipeline.length - 1]} is not a readable stream`)
    }

    let pushed = false
    let chunk: string | Buffer | null = null
    while ((!size || size > 0)) {
      chunk = this.out.read(size)
      if (chunk == null) {
        break
      }
      if (size) { size -= chunk.length }
      this.push(chunk)
      pushed = true
    }

    // if we didn't push anything, the stream library expects us to push something
    // asynchronously before it will call _read again.
    if (!pushed) {
      this.out.once('data', (ch) => {
        this.push(ch)
        this.out!.pause()
      })
      this.out.resume()
    }
  }

  private _init() {
    this._initialized = true
    const last = this.pipeline.reduce((a: any, b: any) => {
      b.on('error', this._createErrorHandler(a, b))
      return a.pipe(b)
    })

    last.on('end', () => {
      this._end()
    })
    last.on('close', () => {
      this._end()
    })
  }

  private _createErrorHandler(a: NodeJS.EventEmitter, b: NodeJS.EventEmitter): (err: any) => void {
    return (err: any) => {
      if (err.code == 'ERR_STREAM_WRITE_AFTER_END' || err.code == 'ERR_STREAM_DESTROYED') {
        // trying to write to the next stage of the pipeline when it's been closed.
        // Just end this stream instead.
        if ('destroy' in a) {
          (a as any).destroy()
        }
      } else {
        this.emit('error', err)
      }
    }
  }

  private _end() {
    if (this._ended) {
      return
    }
    this._ended = true
    // EOF - triggers 'end' event.
    this.push(null)
  }
}

function isWritableStream(stream: any): stream is NodeJS.WritableStream {
  return 'write' in stream && typeof stream.write == 'function'
}

function isReadableStream(stream: any): stream is NodeJS.ReadableStream {
  return 'read' in stream && typeof stream.read == 'function'
}

function nameOfStream(stream: any): string {
  return ('name' in stream) ? stream.name : stream.constructor.name
}
