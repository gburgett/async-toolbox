import { Readable as ReadableImpl, Writable as WritableImpl } from 'stream'

import './async_reader'
import './async_writer'
import { Readable, Transform, Writable } from './types'

export * from './parallel_transform'
export * from './parallel_writable'
export * from './paged_source'
export * from './shellPipe'
export * from './debugStreams'
export * from './splitLines'
export * from './types'

/**
 * Converts an array of chunks into a readable object stream which can be piped
 * to transforms or writable streams.
 * @param entries The entries to be read out of the stream
 * @returns a readable stream which provides the entries in sequence.
 */
export function toReadable<T>(entries: T[]): Readable<T> & { remaining: number } {
  let index = 0
  return Object.assign(new ReadableImpl({
    objectMode: true,
    read(size) {
      if (index >= entries.length) {
        // eof
        this.push(null)
      }
      while (index < entries.length) {
        if (!this.push(entries[index++])) {
          break
        }
      }

      (this as any).remaining = entries.length - index
    },
  }), { remaining: entries.length })
}

/**
 * Reads all the chunks of a readable stream and collects them in an array.
 *
 * @param stream The readable stream to drain into an array
 * @returns a promise which completes when the stream is fully read.
 */
export function collect<T>(stream: Readable<T>): Promise<T[]>
export function collect<T>(stream: Readable<T>, cb: (chunk: T) => void): Promise<void>

export function collect(stream: NodeJS.ReadableStream): Promise<any[]>
export function collect(stream: NodeJS.ReadableStream, cb: (chunk: any) => void): Promise<void>

export function collect<T = any>(
  stream: Readable<T> | NodeJS.ReadableStream,
  cb?: (chunk: any) => void,
): Promise<any[]> | Promise<void> {
  const result: any = []

  return new Promise<T[]>((resolve, reject) => {
    stream.pipe(new WritableImpl({
      objectMode: true,
      write: (chunk, encoding, callback) => {
        if (cb) {
          cb(chunk)
        } else {
          result.push(chunk)
        }
        callback()
      },
    }))
      .on('error', (err) => {
        reject(err)
      })
      .on('finish', () => {
        resolve(cb ? undefined : result)
      })

    stream.on('error', (err) => reject(err))
  })
}
