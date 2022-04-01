import test from 'ava'

import { wait, waitUntil } from '.'
import { TaskCB } from './promisify'
import { Action, Semaphore } from './semaphore'

test('runs a task', async (t) => {
  const semaphore = new Semaphore()

  const p1 = semaphore.lock(async () => {
    await wait(1)
    return 'hi there'
  })

  let p1done: string | null = null
  p1.then((val) => p1done = val)
  t.falsy(p1done)

  await p1

  t.true(p1done == 'hi there')
})

test('handles task error', async (t) => {
  const semaphore = new Semaphore()

  const p1 = semaphore.lock(async () => '1')
  const p2 = semaphore.lock(async () => {
    await wait(1)
    throw new Error('oh no!')
  })
  const p3 = semaphore.lock(async () => '3')

  await t.notThrowsAsync(p1)
  await t.throwsAsync(p2)
  await t.notThrowsAsync(p3)

})

test('queues up tasks greater than maxInflight', async (t) => {
  const semaphore = new Semaphore({ tokens: 2 })

  const callbacks: TaskCB<string>[] = []
  const action: Action<string> = (_, cb) => callbacks.push(cb)
  const p1 = semaphore.lock<string>(action)
  const p2 = semaphore.lock<string>(action)
  const p3 = semaphore.lock<string>(action)
  const p4 = semaphore.lock<string>(action)

  await wait(1)

  t.deepEqual(callbacks.length, 2)
  t.deepEqual(semaphore.stats(), {
    inflight: 2,
    queueSize: 2,
    availableTokens: 0,
  })

  callbacks[0](null, '1')
  t.true(await p1 == '1')

  t.deepEqual(callbacks.length, 2)
  t.deepEqual(semaphore.stats(), {
    inflight: 2,
    queueSize: 1,
    availableTokens: 0,
  })

  await wait(1)
  callbacks[1](null, '2')
  t.true(await p2 == '2')

  t.deepEqual(callbacks.length, 3)
  t.deepEqual(semaphore.stats(), {
    inflight: 2,
    queueSize: 0,
    availableTokens: 0,
  })

  await wait(1)
  callbacks[3](null, '4')
  t.true(await p4 == '4')

  t.deepEqual(callbacks.length, 4)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 0,
    availableTokens: 1,
  })
})

test('queues up a write task after all current read tasks', async (t) => {
  const semaphore = new Semaphore({ tokens: 2 })

  const callbacks: TaskCB<string>[] = []
  const action: Action<string> = (_, cb) => {
    callbacks.push(cb)
  }
  const p1 = semaphore.lock<string>(action)
  const p2 = semaphore.lock<string>(action, 'write')
  const p3 = semaphore.lock<string>(action)

  await wait(1)

  t.deepEqual(callbacks.length, 1)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 2,
    availableTokens: 1,
  })

  callbacks[0](null, '1')
  t.true(await p1 == '1')
  await wait(1)

  t.deepEqual(callbacks.length, 2)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 1,
    availableTokens: 0,
  })

  callbacks[1](null, '2')
  t.true(await p2 == '2')
  await wait(1)

  t.deepEqual(callbacks.length, 3)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 0,
    availableTokens: 1,
  })

})

test('can upgrade a readLock to a writeLock', async (t) => {
  const semaphore = new Semaphore({ tokens: 2 })

  const callbacks: TaskCB<string>[] = []
  const action: Action<string> = (_, cb) => {
    callbacks.push(cb)
  }
  const p1 = semaphore.lock<string>(action)

  let p2upgraded = false
  const p2 = semaphore.lock<string>((lock, cb) => {
    callbacks.push(cb)
    lock.upgrade().then(
      () => { p2upgraded = true },
      (err) => cb(err),
    )
  })
  const p3 = semaphore.lock<string>(action)

  await wait(1)

  t.deepEqual(callbacks.length, 2)
  t.deepEqual(semaphore.stats(), {
    inflight: 2,
    queueSize: 2,
    availableTokens: 1,
  })
  t.false(p2upgraded)

  callbacks[0](null, '1')
  t.true(await p1 == '1')
  await wait(1)

  t.deepEqual(callbacks.length, 2)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 1,
    availableTokens: 0,
  })

  await waitUntil(() => p2upgraded)

  callbacks[1](null, '2')
  t.true(await p2 == '2')
  await wait(1)

  t.deepEqual(callbacks.length, 3)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 0,
    availableTokens: 1,
  })

})

test('can downgrade a writeLock to a readLock', async (t) => {
  const semaphore = new Semaphore({ tokens: 2 })

  const callbacks: TaskCB<string>[] = []
  const action: Action<string> = (_, cb) => {
    callbacks.push(cb)
  }
  const p1 = semaphore.lock<string>(action)

  let downgradeMe: (() => void) | null = null
  const p2 = semaphore.lock<string>((lock, cb) => {
    callbacks.push(cb)
    downgradeMe = () => {
      lock.downgrade()
    }
  }, 'write')
  const p3 = semaphore.lock<string>(action)

  await wait(1)

  t.deepEqual(callbacks.length, 1)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 2,
    availableTokens: 1,
  })

  callbacks[0](null, '1')
  t.true(await p1 == '1')
  await wait(1)

  t.deepEqual(callbacks.length, 2)
  t.deepEqual(semaphore.stats(), {
    inflight: 1,
    queueSize: 1,
    availableTokens: 0,
  })

  downgradeMe!()
  await wait(1)

  t.deepEqual(callbacks.length, 3)
  t.deepEqual(semaphore.stats(), {
    inflight: 2,
    queueSize: 0,
    availableTokens: 0,
  })

})

test('synchronize sets this obj', async (t) => {
  class SomeClass {
    public async foo(...args: any[]) {
      return [this, ...args]
    }
  }

  const uut = new SomeClass()
  const instance = new Semaphore()

  uut.foo = instance.synchronize(uut.foo)

  // act
  const result = await uut.foo(1, 2, 3)
  const result2 = await uut.foo.call('otherThis')

  // assert
  t.is(result[0], uut)
  t.is(result[2], 2)
  t.is(result[3], 3)
  t.is(result2[0], 'otherThis')
})
