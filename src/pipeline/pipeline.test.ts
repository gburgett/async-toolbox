import test from 'ava'
import * as fs from 'fs-extra'
const { parse, stringify } = require('JSONStream')
import * as path from 'path'
import { PassThrough, Readable, Transform, Writable } from 'stream'

import { collect, debugStreams, toReadable } from '../stream'
import { endAsync, writeAsync } from '../stream/async_writer'
import { ShellPipe } from '../stream/shellPipe'
import { CombineLines, SplitLines } from '../stream/splitLines'
import { Pipeline } from './pipeline'

test('no pipeline becomes a passthrough', async (t) => {
  const pipe = new Pipeline()

  pipe.write('abcd')
  pipe.end()

  const buffers = await collect(pipe)
  t.deepEqual(buffers.join(''), 'abcd')
})

test('writes to multiple streams', async (t) => {
  const pipe = new Pipeline(
    new SplitLines(),
    rev(),
    slice(0, 4),
    new CombineLines(),
  )

  const buffers = collect(pipe)

  for (let i = 0; i < 10000; i++) {
    await writeAsync(pipe, `abcdefgh`)
    await writeAsync(pipe, `ijklmnop${i}`)
    await writeAsync(pipe, '\n')
  }
  await endAsync(pipe)

  const lines = (await buffers).join('').split('\n')
  t.deepEqual(lines.length, 10001)
  t.deepEqual(lines[0], '0pon')
  t.deepEqual(lines[9999], '9999')
})

test('pipes lots of data through multiple ShellPipes', async (t) => {
  const dir = 'tmp/pipeline'
  await fs.mkdirp(dir)
  const outfile = path.join(dir, 'pipes_lots_of_data.txt')
  const output = fs.createWriteStream(outfile)

  const pipeline = new Pipeline(
    ShellPipe.spawn('yes abcdefgh'),
    ShellPipe.spawn('rev'),
    new SplitLines(),
    new Transform({
      transform(chunk: string, encoding, cb) {
        const str = chunk.toString().slice(1, 4)
        cb(undefined, str)
      },
    }),
    new CombineLines(),
    ShellPipe.spawn('head -n1000'),
  )

  await pipeline.run(undefined, output)

  const stat = await fs.stat(outfile)
  t.deepEqual(stat.size, 4 * 1000)
})

test('works with badly behaved streams like JSONStream', async (t) => {
  const pipeline = new Pipeline(
    parse(null),
    new Transform({
      objectMode: true,
      transform(chunk, encoding, cb) {
        cb(undefined, { b: chunk.a })
      },
    }),
    stringify(false),
  )

  pipeline.write(JSON.stringify({ a: 1 }) + '\n')
  pipeline.end()
  const results = (await collect(pipeline)).join('')
  t.deepEqual(results, '{"b":1}')
})

test('automatically figures out object mode', async (t) => {
  const pipeline = new Pipeline(
    new Transform({
      objectMode: true,
      transform(chunk, encoding, cb) {
        cb(undefined, { b: chunk.a })
      },
    }),
  )

  pipeline.write({ a: 1 })
  pipeline.end()
  const results = await collect(pipeline)
  t.deepEqual(results, [{ b: 1 }])
})

test('allows a readable first stream', async (t) => {
  const source = toReadable(['abc', 'def'])

  const pipeline = new Pipeline(
    source,
    rev(),
  )

  const results = await collect(pipeline)
  t.deepEqual(results, ['cba', 'fed'])
})

test('allows a writable final stream', async (t) => {
  const source = toReadable(['abc', 'def'])
  const chunks = [] as string[]

  const pipeline = new Pipeline(
    source,
    new Writable({
      objectMode: true,
      write(chunk, enc, cb) {
        chunks.push(chunk)
        cb()
      },
    }),
  )

  await pipeline.run({ progress: false })
  t.deepEqual(chunks, ['abc', 'def'])
})

test('waits for readable stream to finish', async (t) => {
  const data = ['abc']
  const source = new Readable({
    objectMode: true,
    read() {
      setTimeout(() => {
        this.push(data.pop() || null)
      }, 100)
    },
  })
  const chunks = [] as string[]

  const pipeline = new Pipeline(
    source,
    new Writable({
      objectMode: true,
      write(chunk, enc, cb) {
        chunks.push(chunk)
        cb()
      },
    }),
  )

  await pipeline.run({ progress: false })
  t.deepEqual(chunks, ['abc'])
})

test('run without output discards readable data', async (t) => {
  const source = toReadable(['abc'])

  const pipeline = new Pipeline(
    source,
    new Transform({
      objectMode: true,
      write(chunk, enc, cb) {
        this.push({ a: chunk })
        cb()
      },
    }),
  )

  await pipeline.run()
  t.pass('finished')
})

test('run with a slow transformation waits for it to finish', async (t) => {
  const source = toReadable(['abc', 'def'])
  const chunks = [] as string[]
  const sink = new Writable({
    objectMode: true,
    write(chunk, enc, cb) {
      chunks.push(chunk)
      cb()
    },
  })

  const pipeline = new Pipeline(
    new PassThrough({ objectMode: true }),
    new Transform({
      objectMode: true,
      transform(chunk, enc, cb) {
        setTimeout(() => {
          this.push(chunk)
          cb()
        }, 1000)
      },
    }),
  )

  // debugStreams([source, ...pipeline.pipeline, sink, pipeline])
  await pipeline.run(source, sink)

  t.deepEqual(chunks, ['abc', 'def'])
})

function rev() {
  return new Transform({
    highWaterMark: 1,
    objectMode: true,
    transform(chunk: string, encoding, cb) {
      const str = chunk.split('').reverse().join('')
      cb(undefined, str)
    },
  })
}
function slice(start: number, end?: number) {
  return new Transform({
    highWaterMark: 1,
    objectMode: true,
    transform(chunk: string, encoding, cb) {
      const str = chunk.slice(start, end)
      cb(undefined, str)
    },
  })
}
