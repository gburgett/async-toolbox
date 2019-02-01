import test from 'ava'

import { collect } from '.'
import { wait } from '..'
import '../events'
import { PagedSource } from './paged_source'

test('reads all given chunks', async (t) => {
  const source = new PagedSource({}, upTo(100))
  source.end()

  const chunks = await collect(source)

  t.deepEqual(chunks.length, 100)
  // should be written in order
  t.deepEqual(chunks, upTo(100))
})

// test('writable after given chunks are exhausted', async (t) => {
//   const source = new ReentrantSource({}, upTo(100))
//   const chunks = [] as string[]

//   await source.writeAsync('pushed1')
//   const p = collect(source, (c) => chunks.push(c))

//   while (chunks.length < 101) {
//     await wait(1)
//   }
//   await source.writeAsync('pushed2')

//   while (chunks.length < 102) {
//     await wait(1)
//   }

//   await source.writeAsync('pushed3')

//   source.end()
//   await p

//   t.deepEqual(chunks, upTo(100).concat('pushed1', 'pushed2', 'pushed3'))
// })

test('fetchNextPage concats results to chunk', async (t) => {
  const source = new (class extends PagedSource<{ n: number }, string> {
    constructor() {
      super({})
    }

    public async _fetchNextPage(state: { n: number }) {
      state.n = state.n || 0
      if (state.n >= 50) {
        return PagedSource.EOF
      }

      await wait(1)

      state.n += 10
      return upTo(10)
    }
  })()

  const got = await collect(source)
  t.deepEqual(got, [
    ...upTo(10),
    ...upTo(10),
    ...upTo(10),
    ...upTo(10),
    ...upTo(10),
  ])
})

function upTo(n: number): string[] {
  const res: string[] = []
  for (let i = 0; i < n; i++) {
    res.push(i.toString())
  }
  return res
}
