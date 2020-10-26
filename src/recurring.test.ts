import test, { ExecutionContext } from 'ava'

import { wait } from '.'
import {clearRecurring, RecurrenceTimeout, setRecurring} from './recurring'

interface Ctx {
  recurrence?: RecurrenceTimeout | undefined
}

test.afterEach((t) => {
  clearRecurring((t.context as Ctx).recurrence)
})

test('runs the function after the initial timeout', async (t) => {
  const executions: number[] = []
  const start = Date.now();

  // act
  (t.context as Ctx).recurrence = setRecurring(async () => {
    executions.push(Date.now())
    await wait(2)
  }, 100)

  // wait
  await wait(130)

  t.deepEqual(executions.length, 1)
  t.assert(executions[0] >= start + 100)
})

test('passes arguments', async (t) => {
  let args: any[] = [];

  // act
  (t.context as Ctx).recurrence = setRecurring(async (arg1: string, arg2: number) => {
    args = [arg1, arg2]
  }, 100, 'test', 42)

  // wait
  await wait(150)

  t.deepEqual(args, ['test', 42])
})

test('runs the function a second time after the fn finishes', async (t) => {
  const executions: number[] = [];

  // act
  (t.context as Ctx).recurrence = setRecurring(async () => {
    executions.push(Date.now())
    await wait(50)
  }, 100)

  // wait
  await wait(280)

  t.deepEqual(executions.length, 2)
  t.assert(executions[1] - executions[0] >= 100 + 50)
})

test('runs the function even if we dont keep a reference', async (t) => {
  const executions = []

  // act
  setRecurring(async () => {
    executions.push(Date.now())
    await wait(50)
  }, 100)

  // wait
  await wait(280)

  t.deepEqual(executions.length, 2)
})

test('does not run a second time if cancelled', async (t) => {
  const executions: number[] = [];

  (t.context as Ctx).recurrence = setRecurring(async () => {
    executions.push(Date.now())
    await wait(5)
  }, 10)

  // wait till 1 execution has happened
  await wait(20)
  // act
  clearRecurring((t.context as Ctx).recurrence)
  // wait till 2nd would have happened
  await wait(20)

  t.deepEqual(executions.length, 1)
})

test('does not run a first time if cancelled', async (t) => {
  const executions: number[] = [];

  (t.context as Ctx).recurrence = setRecurring(async () => {
    executions.push(Date.now())
    await wait(5)
  }, 10)
  await wait(1)

  // act
  clearRecurring((t.context as Ctx).recurrence)
  // wait till 1st would have happened
  await wait(20)

  t.deepEqual(executions.length, 0)
})
