import test from 'ava'

import { memo, present, wait } from '.'

test('present excludes empty string', async (t) => {
  let s: 'a' | 'b' | '' | undefined
  s = ''

  if (present(s)) {
    // typescript test - should narrow the type to exclude empty string
    const result: 'a' | 'b' = s
    t.fail()
  } else {
    t.pass()
  }
})

test('present excludes whitespace string', async (t) => {
  let s: string | '' | undefined
  s = '   '

  if (present(s)) {
    t.fail()
  } else {
    t.pass()
  }
})
