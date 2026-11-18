import { expect, it } from 'vitest'
import { readExecutionInterpretation } from '../src/cordis/agent-journal.ts'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'
import { keptToolCall } from './fixtures/tool-call.ts'

it('the head of an execution is the receipt of the write that moved it; a write that moves nothing keeps it', async () => {
  const s = await sqlScene('head-kept')
  try {
    const journal = s.view.journal
    const opened = ok(await journal.open(s.openInput))
    const head = async () => {
      const read = await readExecutionInterpretation(
        {
          storage: s.storage,
          tenantDomainLookup: {
            lookup: () => Promise.resolve({ kind: 'ready', domain: s.domain }),
          },
        },
        { tenant: s.access.tenant, session: s.access.session, execution: s.execution, after: '0' },
      )
      if (read.kind !== 'read' || read.execution === null) throw new Error(`read ${read.kind}`)
      return read.execution.head
    }
    expect(await head()).toEqual(opened.receipt.evidence)
    const moved = ok(
      await journal.control({
        ...s.access,
        execution: s.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
    expect(Number(moved.revision)).toBe(Number(opened.receipt.revision) + 1)
    expect(await head()).toEqual(moved.evidence)
    // Preserving a material writes a fact and moves nothing: Session must still read the head to
    // interpret the events it has not read yet.
    await keptToolCall({ view: s.view, access: s.access, execution: s.execution })
    expect(ok(await journal.load({ ...s.access, execution: s.execution })).revision).toBe(
      moved.revision,
    )
    expect(await head()).toEqual(moved.evidence)
  } finally {
    await s.close()
  }
})

it('a write the Journal rejects still moves the execution: its head is the receipt of the rejecting batch', async () => {
  const s = await sqlScene('head-rejected')
  try {
    const journal = s.view.journal
    ok(await journal.open(s.openInput))
    const control = operation('cancel')
    const command = { kind: 'cancel' as const, reason: evidence('cancel') }
    ok(await journal.control({ ...s.access, execution: s.execution, operation: control, command }))
    const staged = (name: string, source: string) =>
      journal.recordControl({
        ...s.access,
        execution: s.execution,
        operation: operation(name),
        target: control,
        stage: 'intent-established',
        state: 'reached',
        source: evidence(source),
      })
    const reached = ok(await staged('intent', 'intent'))
    // The stage is reached: another source for it is refused, and the refusal is a fact.
    expect(await staged('intent-again', 'another')).toMatchObject({ failure: { kind: 'conflict' } })
    const after = ok(await journal.load({ ...s.access, execution: s.execution }))
    expect(Number(after.revision)).toBe(Number(reached.revision) + 1)
    const read = await readExecutionInterpretation(
      {
        storage: s.storage,
        tenantDomainLookup: { lookup: () => Promise.resolve({ kind: 'ready', domain: s.domain }) },
      },
      { tenant: s.access.tenant, session: s.access.session, execution: s.execution, after: '0' },
    )
    if (read.kind !== 'read' || read.execution === null) throw new Error(`read ${read.kind}`)
    expect(read.execution.revision).toBe(after.revision)
    expect(read.execution.head).toMatchObject({ revision: after.revision })
    expect(read.execution.head.record).toMatch(/\/pub\/\d+$/u)
  } finally {
    await s.close()
  }
})
