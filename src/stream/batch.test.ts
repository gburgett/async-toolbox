import test from 'ava'

import { collect, toReadable } from '.'
import { onceAsync } from '../events'
import { wait } from '../wait'
import { endAsync, writeAsync } from './async_writer'
import { batch } from './batch'

test('invokes the function immediately', async (t) => {
  const batches: string[][] = []

  const stream = batch(async (b: string[]) => {
    batches.push(b)
  })

  await writeAsync(stream, '1')

  const pEnd = onceAsync(stream, 'end')
  await endAsync(stream)
  // await pEnd

  t.deepEqual(batches, [
    ['1'],
  ])
})

test('batches based on size limit', async (t) => {
  const batches: string[][] = []

  const stream = batch(async (b: string[]) => {
    batches.push(b)
    await wait(100)
  }, { maxBatchSize: 2 })

  // 1st batch
  stream.write('1')
  stream.write('2')
  // 2nd batch
  stream.write('3')
  stream.write('4')
  // 3rd batch (due to size limit)
  stream.write('5')

  const pEnd = onceAsync(stream, 'end')
  await endAsync(stream)
  await pEnd

  t.deepEqual(batches, [
    ['1', '2'],
    ['3', '4'],
    ['5'],
  ])
})

test('sends results out the transform stream', async (t) => {
  const stream = batch(async (b: string[]) => {
    await wait(100)
    return b.map((s) => parseInt(s, 10))
  }, { maxBatchSize: 2 })

  const pipeline = toReadable(['1', '2', '3', '4', '5'])
    .pipe(stream)

  const numbers = await collect(pipeline)

  t.deepEqual(numbers, [1, 2, 3, 4, 5])
})

test('propagates errors', async (t) => {
  const stream = batch(async (b: string[]) => {
    throw new Error('boom')
  }, { maxBatchSize: 2 })

  const caught: Error[] = []
  stream.on('error', (err) => caught.push(err))

  const pipeline = toReadable(['1', '2', '3', '4', '5'])
    .pipe(stream)

  try {
    await onceAsync(stream, 'end')
    t.fail('did not boom')
  } catch (ex) {
    // expected
    t.deepEqual(ex.message, 'boom')
  }

  t.deepEqual(caught.length, 1)
  t.deepEqual(caught[0].message, 'boom')
})

test('runs batch transformations in parallel', async (t) => {
  const promises: Array<() => void> = []

  const stream = batch(async (b: string[]) => {
    await new Promise<void>((res) => promises.push(res))

    return b.map((s) => parseInt(s, 10))
  }, { maxBatchSize: 2, parallelLimit: 2 })

  // act
  const pipeline = toReadable(['1', '2', '3', '4', '5'])
    .pipe(stream)

  await wait(1)

  // should have started two parallel batches
  t.deepEqual(promises.length, 2)
  // Let the second batch finish first
  promises[1].call(null)
  await wait(1)
  // should have started the third batch
  t.deepEqual(promises.length, 3)

  // should have pushed the second batch
  t.deepEqual(pipeline.read(), 3)
  t.deepEqual(pipeline.read(), 4)
  // let the remaining batches finish
  promises[0].call(null)
  promises[2].call(null)
  t.deepEqual(await collect(pipeline), [1, 2, 5])
})

test('handles parallelLimit: Infinity', async (t) => {
  const stream = batch(async (b: string[]) => {
    await wait(100)
    return b.map((s) => parseInt(s, 10))
  }, { maxBatchSize: 2, parallelLimit: Infinity })

  const pipeline = toReadable(['1', '2', '3', '4', '5'])
    .pipe(stream)

  const numbers = await collect(pipeline)

  t.deepEqual(numbers, [1, 2, 3, 4, 5])
})

test('lots of numbers!', async (t) => {
  let maxInProgress = 0
  let inProgress = 0
  const stream = batch(async (b: string[]) => {
    inProgress++
    maxInProgress = Math.max(maxInProgress, inProgress)
    try {
      // wait a random amount of time
      await wait(Math.random() * 10)

      return b.map((s) => parseInt(s, 10))
    } finally {
      inProgress--
    }
  }, { maxBatchSize: 10, parallelLimit: 5 })

  const expected = upTo(10000)
  const pipeline = toReadable(expected.map((num) => num.toString()))
    .pipe(stream)

  const numbers = await collect(pipeline)

  numbers.sort((a, b) => a - b)
  t.deepEqual(numbers, expected)
  t.deepEqual(maxInProgress, 5)
})

function upTo(n: number): number[] {
  const arr = [] as number[]
  for (let i = 0; i <= n; i++) {
    arr.push(i)
  }
  return arr
}
