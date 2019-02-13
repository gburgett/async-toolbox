import test from 'ava'
import {wait} from '..'
import ParallelAsyncList from './parallel-async-list'

test('flatMap returns a ParallelAsyncList', (t) => {
  const subject = ParallelAsyncList.lift([1])

  const result = subject.flatMap(async (x) => [x + 1])

  t.true(result instanceof ParallelAsyncList)
})

test('flatMap executes each promise in parallel', async (t) => {
  const sequence = [] as number[]
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const subject = ParallelAsyncList.lift(values)

  const before = Date.now()
  const result = subject.flatMap(async (x) => {
    await wait(10 - x)
    sequence.push(x)
    return x * 10
  }).flatMap(async (x2) => {
    await wait(100 - x2)
    sequence.push(x2)
    return x2
  })

  await result
  const after = Date.now()

  const expected = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    0, 10, 20, 30, 40, 50, 60, 70, 80, 90,
  ]
  t.notDeepEqual(sequence, expected)
  t.deepEqual(sequence.sort((a, b) => a - b), expected.sort((a, b) => a - b))
  t.true(after - before < 605) // 100 + 90 + 80 + ...
})

test('can flatMap to an array', async (t) => {
    const values = [0, 1, 2]
    const subject = ParallelAsyncList.lift(values)
    const result = subject.flatMap(async (x) => {
      return upTo(x)
    })

    t.deepEqual(await result, [
      0,
      0, 1,
      0, 1, 2,
    ])
  })

test('can flatMap an array to another array', async (t) => {
    const values = [1, 2, 3]
    const subject = ParallelAsyncList.lift(values)
    const result = subject.flatMap<number>(async (x) => {
      return upTo(x)
    }).flatMap(async (x2) => (
      upTo(x2)
    ))

    t.deepEqual(await result, [
      0,
      0, 1,
      0,
      0, 1,
      0, 1, 2,
      0,
      0, 1,
      0, 1, 2,
      0, 1, 2, 3,
    ])
  })

test('all gets all results', async (t) => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const subject = ParallelAsyncList.lift(values)

  const result = await subject.map((x) => x * 2)
  t.deepEqual(result, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18])
})

function upTo(n: number): number[] {
  const arr = [] as number[]
  for (let i = 0; i <= n; i++) {
    arr.push(i)
  }
  return arr
}
