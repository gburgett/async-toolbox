import test from 'ava'
import { PassThrough } from 'stream'
import { collect } from '.'
import { wait } from '..'

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

  await stream.writeAsync('1')
  await wait(1)
  t.false(finished)
  t.falsy(err)

  await stream.writeAsync('2')
  await wait(1)
  t.false(finished)
  t.falsy(err)
  t.deepEqual(chunks, ['1', '2'])

  await stream.endAsync()
  t.true(finished)
  t.falsy(err)
})
