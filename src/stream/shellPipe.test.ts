import test from 'ava'

import { Writable } from 'stream'
import { collect, toReadable } from '.'
import { wait } from '..'
import '../events'
import { writeAsync } from './async_writer'
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

  t.deepEqual(buffer.toString(), 'y\n'.repeat(10))
  await wait(500)
  t.true(pipe.readableLength < 32 * 1024)

  buffer = await pipe.readAsync(20)

  t.deepEqual(buffer.toString(), 'y\n'.repeat(10))
  await wait(500)
  t.true(pipe.readableLength < 32 * 1024)
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
  const source = toReadable(new Array(50000).fill('asdf\n'))
  const pipe = new ShellPipe('rev').spawn()

  source.pipe(pipe)

  await pipe.readAsync(20)
  await wait(1000)
  t.true(source.remaining > 0)
})

test('handles error code from invoked process', async (t) => {
  const pipe = new ShellPipe('xargs curl -v').spawn()

  await t.throwsAsync(async () => {
    // curl: (3) Bad URL
    await pipe.writeAsync('https://')
    await pipe.endAsync()
  })
})
