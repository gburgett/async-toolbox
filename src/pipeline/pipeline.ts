import { Duplex, DuplexOptions, PassThrough } from 'stream'
import { present } from '..'
import { writeAsync } from '../stream/async_writer'
import { StreamProgress } from './streamProgress'

interface RunOptions {
  progress: boolean
}

export class Pipeline extends Duplex {
  public readonly pipeline: NodeJS.ReadWriteStream[]

  public bytesWritten: number
  public bytesRead: number
  public linesWritten: number

  private _initialized: boolean
  private in: NodeJS.WritableStream
  private out: NodeJS.ReadableStream
  private _ended: boolean

  constructor(
    pipeline: NodeJS.ReadWriteStream[],
    opts?: DuplexOptions,
  ) {
    pipeline.forEach((stream) => {
      if (!stream.readable) {
        throw new Error(`Stream ${(stream as any).name || stream.constructor.name} is not readable`)
      }
      if (!stream.writable) {
        throw new Error(`Stream ${(stream as any).name || stream.constructor.name} is not writable`)
      }
    })

    if (pipeline.length == 0) {
      pipeline = [new PassThrough()]
    }
    const input = pipeline[0]
    let output = pipeline[pipeline.length - 1]

    // try to guess whether we should be in object mode
    const writableState = (input as any)._writableState
    const writableObjectMode = writableState && writableState.objectMode
    const readableState = (output as any)._readableState
    const readableObjectMode = readableState && readableState.objectMode

    if (!output.read) {
      // JSONStream implements pipe but not read
      pipeline.push(output = new PassThrough({
        objectMode: readableObjectMode,
        highWaterMark: readableObjectMode ? 1 : 1024,
      }))
    }

    super({
      writableObjectMode,
      readableObjectMode,
      ...opts,
    })

    this.pipeline = [
      ...pipeline,
    ]
    this.in = input
    this.out = output
  }

  public run(
    input?: NodeJS.ReadableStream,
    output?: NodeJS.WritableStream,
    options?: Partial<RunOptions>,
  ): Promise<void> {
    const opts = {
      progress: false,
      ...options,
    }
    return new Promise<void>((resolve, reject) => {
      const progressBar =
        opts.progress && new StreamProgress([input, ...this.pipeline, output].filter(present)).start()

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
    })
  }

  // the "writable" side is the input into the child process
  public async _write(chunk: any, encoding: string, callback: (err: Error | null | undefined) => void) {
    if (!this._initialized) {
      this._init()
    }

    try {
      await writeAsync(this.in, chunk, encoding)
      this.bytesWritten += chunk.length
      this.linesWritten += ((chunk.toString() as string).match(/\n/g) || []).length
      callback(undefined)
    } catch (ex) {
      callback(ex)
    }
  }

  public _final(cb: (error?: Error | null) => void) {
    if (!this._initialized) {
      this._init()
    }

    this.in.end(() => {
      cb()
    })
  }

  public _read(size?: number) {
    if (!this._initialized) {
      this._init()
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
      this.bytesRead += chunk.length
      pushed = true
    }

    // if we didn't push anything, the stream library expects us to push something
    // asynchronously before it will call _read again.
    if (!pushed) {
      this.out.once('data', (ch) => {
        this.push(ch)
        this.bytesRead += ch.length
        this.out!.pause()
      })
      this.out.resume()
    }
  }

  private _init() {
    this._initialized = true
    const last = this.pipeline.reduce((a, b) => {
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

  private _createErrorHandler(a: NodeJS.ReadWriteStream, b: NodeJS.ReadWriteStream): (err: any) => void {
    return (err: any) => {
      if (err.code == 'ERR_STREAM_WRITE_AFTER_END') {
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
