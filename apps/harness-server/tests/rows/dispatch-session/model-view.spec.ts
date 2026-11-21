import { describe, expect, it } from 'vitest'
import { readModelViewTo } from '../../../src/rows/dispatch-session/model-view.ts'

const ACCESS = { principal: 'p', tenant: 't' as never, session: 's' as never }
const row = (seq: number) => ({
  seq: String(seq),
  entry: `e${String(seq)}`,
  bytes: 10,
  prefixDigest: 'd',
  message: { id: `m${String(seq)}`, role: 'user', blocks: [] },
})
const kept = (seq: number) => ({ seq: String(seq), bytes: 10, message: row(seq).message })
const page = (basis: object, rows: unknown[], next: string | null) => ({
  ok: { kind: 'page', basis, rows, next },
})

function reading(answers: unknown[]) {
  const asked: unknown[] = []
  const read = async (input: unknown) => {
    asked.push(input)
    return answers.shift() as never
  }
  return { asked, read }
}

describe('the model view of a session up to a moment', () => {
  const basis = { epoch: 'epoch-1', upper: '3' }

  it('reads the whole view under the basis the first page fixes when no moment is given', async () => {
    const { asked, read } = reading([
      page(basis, [row(1), row(2)], '2'),
      page(basis, [row(3)], null),
    ])
    expect(await readModelViewTo(read, ACCESS, null)).toEqual({
      kind: 'read',
      value: { epoch: 'epoch-1', rows: [kept(1), kept(2), kept(3)] },
    })
    expect(asked).toEqual([
      { ...ACCESS, basis: null, after: null, pageBytes: 262_144 },
      { ...ACCESS, basis, after: '2', pageBytes: 262_144 },
    ])
  })

  it('reads up to the moment it is given: the generation and the last row', async () => {
    const { asked, read } = reading([page(basis, [row(1)], null)])
    await readModelViewTo(read, ACCESS, JSON.stringify(['epoch-1', '3']))
    expect(asked).toEqual([{ ...ACCESS, basis, after: null, pageBytes: 262_144 }])
  })

  it('answers gone when the generation changed, also on a later page', async () => {
    const changed = { ok: { kind: 'epoch-changed', current: { epoch: 'epoch-2', upper: '1' } } }
    expect(await readModelViewTo(reading([changed]).read, ACCESS, null)).toEqual({
      kind: 'read',
      value: 'gone',
    })
    const later = reading([page(basis, [row(1)], '1'), changed])
    expect(await readModelViewTo(later.read, ACCESS, null)).toEqual({ kind: 'read', value: 'gone' })
  })

  it.each(['not json', '"text"', '["epoch-1"]', '["epoch-1", 3]', '[1, "3"]', '["a","b","c"]'])(
    'answers gone for a moment it did not write (%s), and reads nothing',
    async moment => {
      const { asked, read } = reading([])
      expect(await readModelViewTo(read, ACCESS, moment)).toEqual({ kind: 'read', value: 'gone' })
      expect(asked).toEqual([])
    },
  )

  it('is unreadable when a page fails', async () => {
    const failing = reading([page(basis, [row(1)], '1'), { failure: { kind: 'unavailable' } }])
    expect(await readModelViewTo(failing.read, ACCESS, null)).toEqual({ kind: 'unavailable' })
  })
})
