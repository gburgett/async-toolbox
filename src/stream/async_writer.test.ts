import test from 'ava'
import { Writable } from 'stream'

import {waitUntil} from '../index'
import './async_writer'
import { writeAsync } from './async_writer'

// tslint:disable:no-unused-expression

test('writes chunks to the stream', async (t) => {
  const chunks = [] as string[]
  const stream = new Writable({
    highWaterMark: 1,
    write: (chunk, encoding, cb) => {
      chunks.push(chunk as string)
      setTimeout(() => cb(), 1)
      return true
    },
  })

  await writeAsync(stream, '1')
  await writeAsync(stream, '2')
  await writeAsync(stream, '3')

  t.deepEqual(chunks.map((c) => c.toString()), ['1', '2', '3'])
})

test('still writable after an error', async (t) => {
  const stream = new Writable({
    write: (chunk, encoding, cb) => {
      if (chunk == '1') {
        setTimeout(() => cb(new Error('test err')), 1)
      } else {
        setTimeout(() => cb(), 1)
      }
      return true
    },
  })

  const streamErrs: Error[] = []
  stream.on('error', (e) => streamErrs.push(e))

  await writeAsync(stream, '1')
  await waitUntil(() => streamErrs.length == 1)
  t.true(streamErrs[0].message == 'test err')

  await writeAsync(stream, '2')
  t.deepEqual(streamErrs.length, 1)
})

test('waits for the drain event if draining', async (t) => {
  const chunks = [] as string[]
  const callbacks = [] as ((error?: Error) => void)[]
  const stream = new Writable({
    highWaterMark: 0,
    write: (chunk, encoding, cb) => {
      chunks.push(chunk as string)
      callbacks.push(cb)
      return false
    },
  })

  writeAsync(stream, '1')
  const p2 = writeAsync(stream, '2')
  let p2done = false
  let p2err: any = null
  p2.then(() => p2done = true, (err) => p2err = err)

  await wait(1)

  t.deepEqual(chunks.map((c) => c.toString()), ['1'])
  t.false(p2done)
  t.falsy(p2err)
})

test('recursively writes the chunk after drain event', async (t) => {
  const chunks = [] as string[]
  const callbacks = [] as ((error?: Error) => void)[]
  const stream = new Writable({
    highWaterMark: 0,
    write: (chunk, encoding, cb) => {
      chunks.push(chunk as string)
      callbacks.push(cb)
      return false
    },
  })

  const p1 = writeAsync(stream, '1')
  const p2 = writeAsync(stream, '2')
  const p3 = writeAsync(stream, '3')
  let p3done = false
  let p3err: any = null
  p3.then(() => p3done = true, (err) => p3err = err)

  // finish write '1'
  callbacks.shift()!()
  await p1
  await waitUntil(() => chunks.length == 2)
  t.deepEqual(chunks.map((c) => c.toString()), ['1', '2'])

  // finish write '2'
  await waitUntil(() => callbacks.length == 1)
  callbacks.shift()!()
  await p2

  t.false(p3done)
  t.falsy(p3err)

  // finish write '3'
  await waitUntil(() => callbacks.length == 1)
  callbacks.shift()!()
  await p3

  t.deepEqual(chunks.map((c) => c.toString()), ['1', '2', '3'])
})

test('can resume after draining', async (t) => {
  const chunks = [] as string[]
  const callbacks = [] as ((error?: Error) => void)[]
  const stream = new Writable({
    highWaterMark: 0,
    write: (chunk, encoding, cb) => {
      chunks.push(chunk as string)
      callbacks.push(cb)
      return false
    },
  })

  const p1 = writeAsync(stream, '1')
  await p1

  // finish write '1' triggering drain event
  callbacks.shift()!()
  await wait(1)

  const p2 = writeAsync(stream, '2')
  await p2
  t.deepEqual(chunks.map((c) => c.toString()), ['1', '2'])

  // finish write '2'
  callbacks.shift()!()
})

function wait(ms = 1): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}
