import test from 'ava'
import * as fs from 'fs-extra'
import * as path from 'path'

import { collect, toReadable } from '.'
import { wait } from '..'
import '../events'
import { writeAsync } from './async_writer'
import {debugStreams} from './debugStreams'
import { ShellPipe } from './shellPipe'

test('reads from stdout', async (t) => {
  const pipe = new ShellPipe('yes | head -n 10').spawn()

  const buffers = await collect(pipe)
  t.deepEqual(buffers.join(), 'y\n'.repeat(10))
})

test('reads a lot of data from stdout', async (t) => {
  const pipe = new ShellPipe('yes | head -n 50000').spawn()

  const buffers = await collect(pipe)
  const lines = buffers.join().split('\n')
  t.deepEqual(lines.length, 50001)
})

test('buffers stdout', async (t) => {
  const pipe = new ShellPipe('yes').spawn()

  let buffer = await pipe.readAsync(20)

  t.true(buffer.length >= 20)
  await wait(500)
  t.true(pipe.readableLength > 0)

  buffer = await pipe.readAsync(20)

  t.true(buffer.length >= 20)
  await wait(500)
  t.true(pipe.readableLength > 0)
})

test('writes through stdin', async (t) => {
  const pipe = new ShellPipe('rev').spawn()

  const buffers = collect(pipe)

  for (let i = 0; i < 1000; i++) {
    await writeAsync(pipe, 'abcdefghijklmnopqrstuvwxyz\n')
  }
  await pipe.endAsync()

  t.deepEqual((await buffers).join(''), 'zyxwvutsrqponmlkjihgfedcba\n'.repeat(1000))
})

test('buffers stdin', async (t) => {
  const source = Object.assign(
    toReadable(new Array(50000).fill('abcdefghijklmnopqrstuvwxyz\n')),
    { name: 'source' },
  )
  const pipe = new ShellPipe('rev', { highWaterMark: 1 }).spawn()

  source.pipe(pipe)

  await wait(1000)
  const chunk = source.read(20)
  t.deepEqual(chunk, 'abcdefghijklmnopqrstuvwxyz\n')
  t.true(source.remaining > 0)
})

test('handles error code from invoked process', async (t) => {
  const pipe = new ShellPipe('xargs bash -c "exit 255"').spawn()

  await t.throwsAsync(async () => {
    await pipe.writeAsync('test\n')
    await wait(10)
    await pipe.endAsync()
  })
})

test('handles big chunks of stdout', async (t) => {
  const dir = 'tmp/shellPipe'
  await fs.mkdirp(dir)
  const outfile = path.join(dir, 'lots_of_stdout.txt')
  const output = fs.createWriteStream(outfile)

  const line = 'abcdefghijklmnopqrstuvwxyz\n'
  for (let i = 0; i < 10000; i++) {
    await writeAsync(output, line)
  }
  await output.endAsync()

  const pipe = new ShellPipe(`cat '${outfile}'`).spawn()

  const chunks = [] as Buffer[]

  let chunk = await pipe.readAsync(32 * 1024)
  chunks.push(chunk)
  t.true(chunk.length > 0)
  t.deepEqual(chunk.length, pipe.bytesRead)
  // tslint:disable-next-line: no-conditional-assignment
  while (chunk = await pipe.readAsync(32 * 1024)) {
    t.true(chunk.length > 0)
    chunks.push(chunk)
  }

  const expectedSize = await fs.stat(outfile)
  const total = chunks.reduce((size, buf) => buf.length + size, 0)
  t.deepEqual(total, expectedSize.size)
})
