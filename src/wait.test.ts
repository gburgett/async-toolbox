import test, { ExecutionContext } from 'ava'
import {AbortController} from 'node-abort-controller'

import { wait } from '.'
import { waitImmediate } from './wait'


test('halts until the timeout has passed', async (t) => {
  const start = Date.now()

  await wait(100)

  t.assert(Date.now() > start + 100)
})


test('aborts before finish if AbortController signalled', async (t) => {
  const start = Date.now()
  const abort = new AbortController()

  const promise = wait(100, {signal: abort.signal})
  let ex: any
  promise.catch((e) => ex = e)

  // act
  abort.abort()
  await waitImmediate()

  t.assert(Date.now() < start + 100)
  t.truthy(ex)
})