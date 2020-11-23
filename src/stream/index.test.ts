import test from 'ava'
import { PassThrough } from 'stream'
import { collect } from '.'
import { wait } from '..'
import { endAsync, writeAsync } from './async_writer'

test('Duplex does not end until we tell it', async (t) => {
  const stream = new PassThrough({
    objectMode: true,
  })
  const chunks = [] as any[]
  const p = collect(stream, (chunk) => chunks.push(chunk))
  let finished = false
  let err = null
  p.then(
    () => finished = true,
    (e) => err = e,
  )

  await wait(1)
  t.false(finished)
  t.falsy(err)

  await writeAsync(stream, '1')
  await wait(1)
  t.false(finished)
  t.falsy(err)

  await writeAsync(stream, '2')
  await wait(1)
  t.false(finished)
  t.falsy(err)
  t.deepEqual(chunks, ['1', '2'])

  await endAsync(stream)
  t.true(finished)
  t.falsy(err)
})
