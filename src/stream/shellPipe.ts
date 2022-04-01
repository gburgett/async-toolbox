import * as child_process from 'child_process'
import { Duplex, DuplexOptions, Readable, Writable } from 'stream'

import {writeAsync} from './async_writer'

type ShellPipeOptions = child_process.SpawnOptions &
  Pick<DuplexOptions, 'highWaterMark' | 'decodeStrings' | 'encoding'>

/**
 * Wraps a shell command in a Duplex stream that can be part of a pipeline.
 * Writes to the duplex stream are passed in to the shell command's stdin,
 * and reads from the duplex stream read from the shell command's stdout.
 * Stderr is by default piped to the parent process (options.stdio = ['pipe', 'pipe', 'inherit'])
 */
export class ShellPipe extends Duplex {
  /**
   * Executes a shell command using child_process.spawn, and returns a ShellPipe
   * @param shellCommand The command to execute
   * @param options Options for "spawn" and for the duplex stream wrapped around stdin/stdout
   */
  public static spawn(shellCommand: string, options?: child_process.SpawnOptions): ShellPipe {
    return new ShellPipe(shellCommand, options).spawn()
  }

  public readonly name: string
  public bytesWritten: number = 0
  public bytesRead: number = 0
  public linesWritten: number = 0

  private _process: child_process.ChildProcess | undefined
  private stdout: Readable | undefined
  private stdin: Writable | undefined

  private inProgressWrites: ((err: Error | null | undefined) => void)[] = []

  constructor(public readonly shellCommand: string, private readonly options?: ShellPipeOptions) {
    super(Object.assign({},
      options,
      {
        objectMode: false,
        highWaterMark: 0,
      }))

    this.name = shellCommand
  }

  // the "writable" side is the input into the child process
  public async _write(chunk: any, encoding: BufferEncoding, callback: (err: Error | null | undefined) => void) {
    if (!this._process) {
      callback(new Error(`Command not yet spawned: '${this.shellCommand}'`))
      return
    }
    if (!this.stdin) {
      callback(new Error(`Process was spawned with stdin not set to 'pipe'`))
      return
    }

    this.inProgressWrites.push(callback)
    try {
      await writeAsync(this.stdin, chunk, encoding)
      this.bytesWritten += chunk.length
      this.linesWritten += ((chunk.toString() as string).match(/\n/g) || []).length
      if (this.inProgressWrites.indexOf(callback) >= 0) {
        callback(undefined)
      }
    } catch (ex: any) {
      if (this.inProgressWrites.indexOf(callback) >= 0) {
        callback(ex)
      }
    } finally {
      const idx = this.inProgressWrites.indexOf(callback)
      this.inProgressWrites.splice(idx, 1)
    }
  }

  public _final(cb: (error?: Error | null) => void) {
    if (!this._process) {
      cb(new Error(`Command not yet spawned: '${this.shellCommand}'`))
      return
    }
    this._process.once('exit', () => {
      cb()
    })

    if (this._process.stdin) { this._process.stdin.end() }
  }

  public _read(size?: number) {
    if (!this._process) {
      throw new Error(`Command not yet spawned: '${this.shellCommand}'`)
    }
    if (!this.stdout) {
      throw new Error(`Process was spawned with stdout not set to 'pipe'`)
    }

    let pushed = false
    let chunk: string | Buffer | null = null
    while ((!size || size > 0)) {
      chunk = this.stdout.read(size)
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
      this.stdout.once('data', (ch) => {
        this.push(ch)
        this.bytesRead += ch.length
        this.stdout!.pause()
      })
      this.stdout.resume()
    }
  }

  /**
   * Spawns the child process, initializing the stream and making it readable.
   * Do this before piping the stream anywhere.
   */
  public spawn(): this {
    if (this._process) {
      return this
    }

    this._process = child_process.spawn(this.shellCommand,
      Object.assign({
        shell: true,
        stdio: ['pipe', 'pipe', 'inherit'],
      },
      this.options),
    )
    this._process.on('exit', (code: number) => {
      if (code != 0) {
        this.emit('error', new Error(code.toString()))
      }
      this.end()
      const inProgress = this.inProgressWrites.slice()
      this.inProgressWrites = []

      const writeErr: any = new Error('Shell input closed')
      writeErr.code = 'ERR_STREAM_WRITE_AFTER_END'
      if (inProgress.length > 0) {
        this.emit('error', writeErr)
      }
      inProgress.forEach((cb) => {
        try {
          cb(undefined)
        } catch (ex: any) {
          // suppress
        }
      })
    })

    if (this._process.stdout) {
      const stdout = this.stdout = this._process.stdout
      stdout.on('end', () => {
        this.push(null)
      })
    }
    if (this._process.stdin) {
      const stdin = this.stdin = this._process.stdin
      stdin.on('error', (err: any) => {
        if (err.code == 'EPIPE') {
          // Something like 'head' which closes its stdin
          this.end()
        } else {
          this.emit('error', err)
        }
      })
    }

    return this
  }
}
