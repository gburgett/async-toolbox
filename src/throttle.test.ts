import test from 'ava'
import { performance } from 'perf_hooks'

import { throttle } from './throttle'

test('queues up subsequent invocations', async (t) => {
  let i = 0
  const fn = throttle(async () => {
    return ++i
  }, 100)

  const start = performance.now()
  const p1 = fn()
  const p2 = fn()
  const p3 = fn()

  const result1 = await p1
  t.deepEqual(result1, 1)
  t.true(performance.now() - start < 100)

  const result2 = await p2
  t.deepEqual(result2, 2)
  t.true(performance.now() - start >= 100)

  const result3 = await p3
  t.deepEqual(result3, 2)
  t.true(performance.now() - start >= 100)
  t.true(performance.now() - start < 200)

  const result4 = await fn()
  t.deepEqual(result4, 3)
  t.true(performance.now() - start >= 200)
  t.true(performance.now() - start < 300)
})
