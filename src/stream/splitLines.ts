import { Transform, TransformCallback, TransformOptions } from 'stream'

// tslint:disable: max-classes-per-file

/**
 * Takes a stream of character data and splits it on newlines, turning it into
 * an object stream where each chunk is one line.
 */
export class SplitLines extends Transform {
  public linesWritten = 0
  private buffer: string[] = []

  constructor(opts?: TransformOptions) {
    super({
      readableObjectMode: true,
      writableObjectMode: false,
      ...opts,
    })
  }

  public _transform(chunk: string | Buffer, encoding: any, cb: TransformCallback) {
    if (typeof chunk != 'string') {
      chunk = chunk.toString()
    }
    if (!chunk.includes('\n')) {
      this.buffer.push(chunk)
      cb()
      return
    }

    // flush all but the last line of the chunk - it may not yet be a complete line
    const index = chunk.lastIndexOf('\n')
    this.buffer.push(chunk.slice(0, index + 1))
    const lastLine = chunk.slice(index + 1)
    this._internalFlush(() => {
      // keep the last line of the chunk
      if (lastLine.length > 0) {
        this.buffer.push(lastLine)
      }
      cb()
    })
  }

  public _flush(cb: () => void) {
    this._internalFlush(cb)
  }

  private _internalFlush(cb: (err?: Error) => void) {
    if (this.buffer.length == 0) {
      cb()
      return
    }

    const buf = this.buffer.join('')
    // the buffer ends in a "\n" - we don't want that to be part of the split
    const lines = buf.replace(/\n$/, '').split('\n')
    this.buffer = []
    try {
      lines.forEach((line, i) => {
        this.linesWritten++
        this.push(line)
      })
      cb()
    } catch (ex: any) {
      cb(ex)
    }
  }
}

/**
 * Takes a stream of string (or stringable) objects and joins them together with
 * newlines writing them to the output buffer.
 */
export class CombineLines extends Transform {
  public lineCount = 0

  constructor(opts?: TransformOptions) {
    super({
      readableObjectMode: false,
      writableObjectMode: true,
      ...opts,
    })
  }

  public _transform(chunk: string | object, encoding: any, cb: TransformCallback) {
    if (typeof chunk != 'string') {
      chunk = chunk.toString()
    }

    try {
      this.push(Buffer.from(chunk))
      this.push(Buffer.from('\n'))
      this.lineCount++
      cb()
    } catch (ex: any) {
      cb(ex)
    }
  }
}
