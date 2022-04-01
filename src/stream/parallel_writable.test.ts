import test from 'ava'

import { toReadable } from '.'
import { wait } from '..'
import '../events'
import { onceAsync } from '../events'
import { endAsync, writeAsync } from './async_writer'
import { ParallelWritable } from './parallel_writable'

test('pipes from readable', async (t) => {
  const chunks: string[] = []

  const source = toReadable(upTo(1000))

  const instance = new ParallelWritable({
    objectMode: true,
    maxParallelChunks: 10,
    writeAsync: async (chunk, encoding) => {
      await wait(Math.random() * 10)
      chunks.push(chunk)
    },
  })

  const p = onceAsync(instance, 'finish')
  source.pipe(instance)
  await p

  t.deepEqual(chunks.length, 1000)
  // should be written out of order since we are awaiting a random number of seconds
  t.notDeepEqual(chunks, upTo(1000))
})

test('calls finalize if provided', async (t) => {
  const chunks: string[] = []

  let release = null as unknown as () => void
  const blocker = new Promise<void>((resolve) => release = resolve)

  const impl = class extends ParallelWritable {
    public _writeAsync = async (chunk: string) => {
      await wait(Math.random() * 10)
      chunks.push(chunk)
    }

    public _finalAsync = async () => {
      await blocker
    }
  }

  const instance = new impl({ objectMode: true })

  await writeAsync(instance, '1')

  const pEnd = endAsync(instance)
  let pEndDone = false
  let pEndErr = null as Error | null
  pEnd.then(
    () => pEndDone = true,
    (err) => pEndErr = err,
  )

  await wait(10)

  t.false(pEndDone)

  release()

  await pEnd

  t.true(pEndDone)
  t.falsy(pEndErr)

  t.deepEqual(chunks, ['1'])
})

function upTo(n: number): string[] {
  const res: string[] = []
  for (let i = 0; i < n; i++) {
    res.push(i.toString())
  }
  return res
}
