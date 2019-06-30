import test from 'ava'

import { timeout, TimeoutError, wait } from '.'

test('returns action result if no timeout', async (t) => {

  const result = await timeout(async () => {
    await wait(1)
    return 'expected'
  }, 10)

  t.deepEqual(result, 'expected')
})

test('raises timeout error', async (t) => {
  await t.throwsAsync(timeout(async () => {
      await wait(100)
      return 'expected'
    }, 10),
    {
      name: 'TimeoutError',
    },
  )
})

test('propagates error from function', async (t) => {
  await t.throwsAsync(timeout(async () => {
      await wait(1)
      throw new Error('test error')
    }, 10),
    'test error',
  )

})
