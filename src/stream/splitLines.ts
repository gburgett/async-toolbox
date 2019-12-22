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

    const lines = chunk.split('\n')
    // flush all but the last line of the chunk - it may not yet be a complete line
    this.buffer.push(lines.slice(0, lines.length - 1).join('\n'))
    this._internalFlush(() => {
      // keep the last line of the chunk
      this.buffer.push(lines[lines.length - 1])
      cb()
    })
  }

  public _flush(cb: () => void) {
    this._internalFlush(cb)
  }

  private _internalFlush(cb: () => void) {
    this.buffer.join('').split('\n').forEach((line) => {
      this.linesWritten++
      this.push(line + '\n')
    })
    this.buffer = []
    cb()
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

    this.push(Buffer.from(chunk))
    this.push(Buffer.from('\n'))
    this.lineCount++
    cb()
  }

}
