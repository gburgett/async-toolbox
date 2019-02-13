import test from 'ava'

import { wait } from '.'
import { Limiter } from './limiter'

test('queues up tasks when they go over rate limit', async (t) => {
  const limiter = new Limiter({
    // 2 executions every 100 ms
    interval: 100,
    tokensPerInterval: 2,
  })

  const tasks = upTo(19) // 20 * 100 / 2 = 1000 ms
  let timestamps = [] as number[]
  const start = Date.now()
  await Promise.all(tasks.map(() => {
    return limiter.lock(async () => {
      timestamps.push(Date.now())
      await wait(1)
    })
  }))
  const end = Date.now()

  t.true(timestamps.length == 20)
  t.true(end - start > 900) // should take more than 900 ms

  timestamps = timestamps.map((ts) => ts - start)

  t.true(timestamps[0] < 100)
  t.true(timestamps[1] < 200)

  t.true(timestamps[19] > 900)
})

function upTo(n: number): number[] {
  const arr = [] as number[]
  for (let i = 0; i <= n; i++) {
    arr.push(i)
  }
  return arr
}
