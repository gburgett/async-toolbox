import test from 'ava'
import * as fs from 'fs-extra'
import os from 'os'
import * as path from 'path'
import { Transform } from 'stream'

import { collect, toReadable } from '.'
import { wait } from '..'
import '../events'
import { onceAsync } from '../events'
import { writeAsync } from './async_writer'
import { ShellPipe } from './shellPipe'
import { CombineLines, SplitLines } from './splitLines'

test.skip('reads from stdout', async (t) => {
  const pipe = new ShellPipe('yes | head -n 10').spawn()

  const buffers = await collect(pipe)
  t.deepEqual(buffers.join(), 'y\n'.repeat(10))
})

test.skip('reads a lot of data from stdout', async (t) => {
  const pipe = new ShellPipe('yes | head -n 50000').spawn()

  const buffers = await collect(pipe)
  const lines = buffers.join().split('\n')
  t.deepEqual(lines.length, 50001)
})

test.skip('buffers stdout', async (t) => {
  const pipe = new ShellPipe('yes').spawn()

  let buffer = await pipe.readAsync(20)

  t.deepEqual(buffer.toString(), 'y\n'.repeat(10))
  await wait(500)
  t.true(pipe.readableLength < 32 * 1024)

  buffer = await pipe.readAsync(20)

  t.deepEqual(buffer.toString(), 'y\n'.repeat(10))
  await wait(500)
  t.true(pipe.readableLength < 32 * 1024)
})

test.skip('writes through stdin', async (t) => {
  const pipe = new ShellPipe('rev').spawn()

  const buffers = collect(pipe)

  for (let i = 0; i < 1000; i++) {
    await writeAsync(pipe, 'abcdefghijklmnopqrstuvwxyz\n')
  }
  await pipe.endAsync()

  t.deepEqual((await buffers).join(''), 'zyxwvutsrqponmlkjihgfedcba\n'.repeat(1000))
})

test.skip('buffers stdin', async (t) => {
  const source = toReadable(new Array(50000).fill('asdf\n'))
  const pipe = new ShellPipe('rev').spawn()

  source.pipe(pipe)

  await pipe.readAsync(20)
  await wait(1000)
  t.true(source.remaining > 0)
})

test('pipes lots of data through multiple ShellPipes', async (t) => {
  const dir = path.join(os.tmpdir(), 'tmp/shellPipe')
  await fs.mkdirp(dir)
  const outfile = 'out.txt'
  const output = fs.createWriteStream(outfile)

  const pipeline = [
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
  ]

  const last = pipeline.reduce((a, b) => a.pipe(b))
  last.pipe(output)

  await onceAsync(output, 'finish')
  const stat = await fs.stat(outfile)
  t.deepEqual(stat.size, 4 * 1000)
})
