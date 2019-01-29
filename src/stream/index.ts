import { Readable, Stream, Writable } from 'stream'

import './async_reader'
import './async_writer'

export * from './parallel_transform'
export * from './parallel_writable'
export * from './reentrant_source'

/**
 * Converts an array of chunks into a readable object stream which can be piped
 * to transforms or writable streams.
 * @param entries The entries to be read out of the stream
 * @returns a readable stream which provides the entries in sequence.
 */
export function toReadable(entries: any[]): Readable {
  let index = 0
  return new Readable({
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
    },
  })
}

/**
 * Reads all the chunks of a readable stream and collects them in an array.
 *
 * @param stream The readable stream to drain into an array
 * @returns a promise which completes when the stream is fully read.
 */
export function collect(stream: Readable): Promise<any[]>
export function collect(stream: Readable, cb: (chunk: any) => void): Promise<void>

export function collect(stream: Readable, cb?: (chunk: any) => void): Promise<any[]> | Promise<void> {
  const result: any = []

  return new Promise<any>((resolve, reject) => {
    stream.pipe(new Writable({
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
