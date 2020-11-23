import test from 'ava'
import { performance } from 'perf_hooks'

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

test('throttles the batch function', async (t) => {
  const batches: string[][] = []
  const invocations: number[] = []

  const stream = batch(async (b: string[]) => {
    invocations.push(performance.now())
    batches.push(b)
  }, { throttlePeriod: 100 })

  const start = performance.now()
  await writeAsync(stream, '1')
  await writeAsync(stream, '2')
  await writeAsync(stream, '3')
  const pEnd = onceAsync(stream, 'end')
  await endAsync(stream)
  await pEnd

  t.deepEqual(batches, [
    ['1'],
    ['2', '3'],
  ])
  t.deepEqual(invocations.length, 2)
  t.true(invocations[0] - start < 90)
  // should wait approx. 100ms between
  t.true(invocations[1] - invocations[0] > 90)
})

test('batches based on size limit', async (t) => {
  const batches: string[][] = []

  const stream = batch(async (b: string[]) => {
    batches.push(b)
    await wait(100)
  }, { maxBatchSize: 2 })

  // 1st batch
  stream.write('1')
  // 2nd batch
  stream.write('2')
  stream.write('3')
  // 3rd batch (due to size limit)
  stream.write('4')
  stream.write('5')

  const pEnd = onceAsync(stream, 'end')
  await endAsync(stream)
  await pEnd

  t.deepEqual(batches, [
    ['1'],
    ['2', '3'],
    ['4', '5'],
  ])
})

test('sends results out the transform stream', async (t) => {
  const stream = batch(async (b: string[]) => {
    return b.map((s) => parseInt(s, 10))
  }, { maxBatchSize: 2 })

  const pipeline = toReadable(['1', '2', '3', '4', '5'])
    .pipe(stream)

  const numbers = await collect(pipeline)

  t.deepEqual(numbers, [1, 2, 3, 4, 5])
})
