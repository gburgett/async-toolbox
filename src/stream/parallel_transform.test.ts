import test from 'ava'

import { collect, toReadable } from '.'
import { wait } from '..'
import '../events'
import { ParallelTransform } from './parallel_transform'

test('pipes from readable to writable', async (t) => {
  const source = toReadable(upTo(1000))

  const instance = new ParallelTransform({
    objectMode: true,
    maxParallelChunks: 10,
    async transformAsync(chunk, encoding) {
      await wait(Math.random() * 10)
      this.push('xformed' + chunk)
    },
  })

  const chunks = await collect(source.pipe(instance))

  t.deepEqual(chunks.length, 1000)
  // should be written out of order since we are awaiting a random number of seconds
  const expected = upTo(1000).map((n) => 'xformed' + n)
  t.notDeepEqual(chunks, expected)

  const hash: { [chunk: string]: number} = {}
  for (const chunk of chunks) {
    hash[chunk] = (hash[chunk]) ? (hash[chunk] + 1) : 1
  }
  for (const chunk of expected) {
    t.deepEqual(hash[chunk], 1, `Chunk not found! ${chunk}`)
  }
})


test('uses async generator', async (t) => {
  const source = toReadable(upTo(1000))

  const xform = async function*(chunk: number) {

    yield 'xformed' + chunk

    await wait(Math.random() * 10)

    yield 'after' + chunk
  }

  const instance = ParallelTransform.from(xform, {
    objectMode: true,
    maxParallelChunks: 10,
  })

  const chunks = await collect(source.pipe(instance))

  t.deepEqual(chunks.length, 2000)
  // should be written out of order since we are awaiting a random number of seconds
  const expected = upTo(1000).map((n) => 'xformed' + n).concat(
    upTo(1000).map((n) => 'after' + n))
  t.notDeepEqual(chunks, expected)

  const hash: { [chunk: string]: number} = {}
  for (const chunk of chunks) {
    hash[chunk] = (hash[chunk]) ? (hash[chunk] + 1) : 1
  }
  for (const chunk of expected) {
    t.deepEqual(hash[chunk], 1, `Chunk not found! ${chunk}`)
  }
})

test('uses async generator w/ flush', async (t) => {
  const source = toReadable(upTo(1000))

  const xform = async function*(chunk: number) {

    yield 'xformed' + chunk

    await wait(Math.random() * 10)

    yield 'after' + chunk
  }

  const flush = async function*() {
    yield 'finally'
  }

  const instance = ParallelTransform.from(
    xform,
    flush,
  {
    objectMode: true,
    maxParallelChunks: 10,
  })

  const chunks = await collect(source.pipe(instance))

  t.deepEqual(chunks.length, 2001)
  // Should put the "flush" data last
  t.deepEqual(chunks[chunks.length - 1], 'finally')
})

function upTo(n: number): string[] {
  const res: string[] = []
  for (let i = 0; i < n; i++) {
    res.push(i.toString())
  }
  return res
}
