import { present } from '..'

interface StreamState {
  count: number,
  bytes: number,
  total: number | undefined
  done: boolean
  status?: string

  child?: StreamProgress
}

interface Spinner {
  /** Recommended interval. */
  readonly interval: number

  /** A list of frames to show for the spinner. */
  readonly frames: string[]
}

export interface StreamProgressOptions {
  /**
   * Use one of https://www.npmjs.com/package/cli-spinners or provide your own
   * defaults to "Dots"
   */
  spinner: Spinner
  /**
   * Use a stream other than process.stderr
   */
  logStream: NodeJS.WritableStream | null

  /**
   * Use the "Chalk" library to colorize the output using ansi codes
   */
  color: boolean

  /**
   * if you have a pipeline of pipelines, how deep to show progress
   */
  depth: number
}

export class StreamProgress {
  private readonly options: StreamProgressOptions
  private readonly state: StreamState[]

  private _interval: NodeJS.Timeout | undefined
  private time: number = 0

  private readonly _chalk: typeof fakeChalk

  constructor(
    private readonly pipeline: Array<NodeJS.ReadableStream | NodeJS.WritableStream>,
    options?: Partial<StreamProgressOptions>,
    ) {
    const logStream = (options && options.logStream) || process.stderr
    this.options = {
      spinner: dots,
      logStream,
      color: ('isTTY' in logStream) && (logStream as any).isTTY,
      depth: 1,
      ...options,
    }

    this.state = pipeline.map((stream) => {
      const childPipeline = ('pipeline' in stream) && Array.isArray((stream as any).pipeline) ?
        (stream as any).pipeline as Array<NodeJS.ReadableStream | NodeJS.WritableStream> :
        undefined
      return {
        count: 0,
        bytes: 0,
        total: undefined,
        done: false,

        child: childPipeline && this.options.depth > 0 ?
          new StreamProgress(childPipeline, {
            ...this.options,
            logStream: undefined,
            depth: this.options.depth - 1,
          }).start() : undefined,
      }
    })

    if (this.options.color) {
      try {
        this._chalk = require('chalk')
      } catch (ex) {
        if (options && options.color === true) {
          throw new Error('"color: true" set on StreamProgress but "chalk" is not installed.\n' + ex.toString())
        }
      }
    }
    if (!this._chalk) {
      this._chalk = fakeChalk
    }
  }

  public start(): this {
    this.pipeline.forEach((p, i) => {
      const stream = this.pipeline[i]
      if ('readable' in stream && stream.readable) {
        p.on('data', (chunk) => {
          if (chunk instanceof Buffer) {
            this.state[i].bytes += chunk.length
          } else {
            this.state[i].count++
          }
        })
      }
      const endStream = () => {
        this.state[i].total = this.state[i].count
        this.state[i].done = true
      }
      p.on('end', endStream)
      p.on('close', endStream)
      p.on('status', (statusText) => {
        this.state[i].status = statusText
      })
    })

    this._interval = setInterval(() => {
      this.time++
      this.render()
    }, this.options.spinner.interval)

    return this
  }

  public end() {
    clearInterval(this._interval!)
    setTimeout(() => {
      this.render('end')
    }, 0)
  }

  public format() {
    const { logStream } = this.options

    const msg = [] as string[]
    this.state.forEach((s, i) => {
      const stream = this.pipeline[i]

      const name = ('name' in stream) ? (stream as any).name : stream.constructor.name
      if (name == 'PassThrough') {
        // skip pass throughs
        return
      }

      const spinner = s.done ? this._chalk.green('✓') : this._chalk.gray(this.getFrame(i))
      let count = s.count > 0 && s.count.toString()
      if (!count && s.bytes > 0) {
        count = `${(s.bytes / 1024).toFixed(2)}kb`
      }
      if (!count && (stream as any).bytesWritten) {
        count = `${((stream as any).bytesWritten / 1024).toFixed(2)}kb`
      }
      const status = s.status ? '  ' + this._chalk.gray(s.status) : ''

      let line = `${spinner}  ${name}: ${count || '    '}${status}`
      if (logStream && 'columns' in logStream) {
        const columns = (logStream as any).columns - 4
        if (line.length > columns) {
          line = line.slice(0, columns) + this._chalk.gray('...')
        }
      }

      msg.push(line)
      if (s.child) {
        s.child.format().forEach((childLine) => {
          msg.push('  ' + childLine)
        })
      }
    })

    return msg
  }

  public render(end?: 'end') {
    const { logStream } = this.options
    if (!logStream) {
      return
    }

    logStream.write(clearLine)
    logStream.write('\n')
    const msg = this.format()

    msg.forEach((line) => {
      logStream.write(clearLine)
      logStream.write(' ')
      logStream.write(line)
      logStream.write('\n')
    })
    if (end != 'end') {
      for (let i = 0; i < msg.length + 1; i++) {
        logStream.write(goUp)
      }
    }
  }

  private getFrame(offset: number): string {
    const spinner = this.options.spinner
    const index = (this.time + offset) % spinner.frames.length
    return spinner.frames[index]
  }
}

const clearLine = '\x1b[2K'
const goUp = '\x1b[F'

const dots = {
  interval: 80,
  frames: [
    '⠋',
    '⠙',
    '⠹',
    '⠸',
    '⠼',
    '⠴',
    '⠦',
    '⠧',
    '⠇',
    '⠏',
  ],
}

const fakeChalk = {
  green: (msg: string) => msg,
  gray: (msg: string) => msg,
}
