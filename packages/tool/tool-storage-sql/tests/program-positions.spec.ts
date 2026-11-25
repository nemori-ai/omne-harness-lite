import { afterEach, expect, it } from 'vitest'
import type { LedgerDomain, LedgerRecord } from '@omne-harness/tool'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolRevision, type ProgramPosition } from '@omne-harness/tool-contract/provider'
import { createSqlToolLedgerStore } from '../src/index.ts'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function decoded<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error('fixture identity is not legal')
  return answer.ok
}
const revision = (text: string) => decoded(decodeToolRevision(text))
const domain: LedgerDomain = {
  kind: 'call',
  tenant: TENANT_A,
  call: decoded(decodeToolCallId('call-parent')),
}
const position = (ordinal: number): ProgramPosition => ({
  ordinal,
  child: decoded(decodeToolCallId(`call-child-${String(ordinal)}`)),
  admission: decoded(decodeToolOperationId(`admit-child-${String(ordinal)}`)),
  target: { name: 'Files', command: 'read', digest: 'sha256:target' },
  state: 'handed',
  background: false,
})

it('keeps the table of a program and each of its positions as records of the parent call, replaced one at a time', async () => {
  const app = await openApp()
  opened.push(app)
  const store = createSqlToolLedgerStore(app.options)
  const table: LedgerRecord = { kind: 'program', program: { phase: 'open' } }
  const rows: LedgerRecord[] = [1, 2].map(ordinal => ({
    kind: 'position',
    position: position(ordinal),
  }))
  expect(
    await store.commit({
      domain,
      expected: revision('0'),
      revision: revision('1'),
      writes: [table, ...rows].map(record => ({ kind: 'put', record })),
    }),
  ).toEqual({ kind: 'committed' })
  const excluded: LedgerRecord = {
    kind: 'position',
    position: {
      ...position(2),
      state: 'excluded',
      exclusion: { kind: 'denied', reason: 'not this one' },
    } as ProgramPosition,
  }
  expect(
    await store.commit({
      domain,
      expected: revision('1'),
      revision: revision('2'),
      writes: [
        { kind: 'put', record: excluded },
        { kind: 'put', record: { kind: 'program', program: { phase: 'sealed' } } },
      ],
    }),
  ).toEqual({ kind: 'committed' })
  const read = await store.read(domain)
  if (read.kind !== 'complete') throw new Error(read.kind)
  expect(read.revision).toBe('2')
  expect(read.records).toHaveLength(3)
  expect(read.records).toEqual(
    expect.arrayContaining([{ kind: 'program', program: { phase: 'sealed' } }, rows[0], excluded]),
  )
  expect(await store.readRecord(domain, 'position:2')).toMatchObject({ record: excluded })
})
