import test from 'ava'

import { memo } from './memo'
import { wait } from './wait'

test('memo runs fn only once', async (t) => {
  let invocations = 0
  const fn = memo(async () => {
    invocations++
    return 'a'
  })

  const result = await fn()
  const result2 = await fn()

  t.deepEqual(result, 'a')
  t.deepEqual(result2, 'a')
  t.deepEqual(invocations, 1)
})

test('memo throttles fn to 1 simultaneous invocation', async (t) => {
  let invocations = 0
  const fn = memo(async () => {
    invocations++
    await wait(10)
    return 'a'
  })

  const p1 = fn()
  const p2 = fn()

  t.deepEqual(await p1, 'a')
  t.deepEqual(await p2, 'a')
  t.deepEqual(invocations, 1)
})

test('memo does not memoize result in case of error', async (t) => {
  let invocations = 0
  const fn = memo(async () => {
    invocations++
    await wait(10)
    if (invocations == 1) {
      throw new Error('ouch')
    }
    return 'a'
  })

  await t.throwsAsync(async () => await fn())
  const result = await fn()

  t.deepEqual(result, 'a')
  t.deepEqual(invocations, 2)
})

test('memo handles inline exceptions', async (t) => {
  let invocations = 0
  const fn = memo(() => {
    invocations++
    if (invocations == 1) {
      throw new Error('ouch')
    }
    return Promise.resolve('a')
  })

  await t.throwsAsync(async () => await fn())
  const result = await fn()

  t.deepEqual(result, 'a')
  t.deepEqual(invocations, 2)
})

test('memo passes this arg', async (t) => {
  const args: any[] = []
  const fn = memo(function(this: {}, a: string, b: number, c: string) {
    args.push(this, a, b, c)
    return Promise.resolve('a')
  })
  const thisObj = {}

  await fn.call(thisObj, 'a', 2, 'c')

  t.deepEqual(args, [thisObj, 'a', 2, 'c'])
})
