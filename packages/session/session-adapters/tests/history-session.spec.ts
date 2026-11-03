// R2-D14: `historySessionOf` reads the (tenant, session) that a history evidence names. What is
// checked: the history evidence that the Journal core mints for an execution decodes to the tenant
// text and the session of the cell it lives in; an evidence that another owner minted, a record
// that is not namespace, execution and `/history`, and a namespace that is not a two-element array
// of text decode to null. The decoder grants nothing: it names a session, nothing more.
import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { DurableEvidence } from '@omne-harness/agent-contract'
import { historySessionOf } from '../src/history-session.ts'
import { ok, scene } from './fixtures/common-journal.ts'

async function minted() {
  const s = await scene('history-session-decoder')
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  const tenant = tenantCodec.encode(s.access.tenant)
  if (!tenant.ok) throw new Error('fixture: tenant')
  return { head: loaded.history, tenant: tenant.value, session: s.access.session, s }
}

const evidenceOf = (record: string, owner: string): DurableEvidence => ({
  owner,
  record,
  revision: '1',
  digest: `digest:${record}`,
})

describe('historySessionOf', () => {
  it('R2-D14 decodes the history evidence that the Journal core mints to its tenant and session', async () => {
    const { head, tenant, session } = await minted()
    expect(historySessionOf(head)).toEqual({ tenant, session })
  })

  it('R2-D14 gives the session of the cell for another execution of the same cell', async () => {
    const { head, tenant, session } = await minted()
    const other = evidenceOf(
      `${JSON.stringify([tenant, session])}/another-execution/history`,
      head.owner,
    )
    expect(historySessionOf(other)).toEqual({ tenant, session })
  })

  it('R2-D14 historySessionOf answers null for an evidence that another owner minted', async () => {
    const { head } = await minted()
    expect(historySessionOf({ ...head, owner: 'someone-else' })).toBeNull()
  })

  it('R2-D14 historySessionOf answers null when the record does not end with /history', async () => {
    const { head, tenant, session } = await minted()
    const namespace = JSON.stringify([tenant, session])
    for (const record of [
      head.record.replace(/\/history$/u, '/recovery'),
      `${namespace}/execution`,
      `${namespace}/execution/history/more`,
      `${namespace}//history`,
      `${namespace}/history`,
      '',
    ])
      expect(historySessionOf({ ...head, record }), record).toBeNull()
  })

  it('R2-D14 historySessionOf answers null when the namespace is not a two-element array of text', async () => {
    const { head } = await minted()
    for (const namespace of [
      JSON.stringify(['tenant']),
      JSON.stringify(['tenant', 'session', 'extra']),
      JSON.stringify([1, 2]),
      JSON.stringify({ tenant: 't', session: 's' }),
      JSON.stringify('tenant/session'),
      'not json',
      '["unclosed',
    ])
      expect(
        historySessionOf({ ...head, record: `${namespace}/execution/history` }),
        namespace,
      ).toBeNull()
  })

  it('R2-D14 historySessionOf does not read the consumer or a session out of an execution name', async () => {
    const { head, tenant, session } = await minted()
    // An execution text that looks like a namespace names no other session.
    const forged = evidenceOf(
      `${JSON.stringify([tenant, session])}/${JSON.stringify(['other-tenant', 'other'])}/history`,
      head.owner,
    )
    expect(historySessionOf(forged)).toEqual({ tenant, session })
  })
})
