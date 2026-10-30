import { describe, expect, it } from 'vitest'
import { decodeAgentExecutionId } from '@omne-harness/agent-contract'
import { sampleStartFence } from '@omne-harness/agent-contract/testing'
import { entriesFixture } from './fixtures/entries-conformance.ts'
import { ok, operation } from './fixtures/common-journal.ts'

// `failNextRecord` scripts the next `record` of one execution of one tenant that reaches its
// write step. These cases hold the scope and the consumption point of that control, which the
// conformance suite's lost-reply and failed-write cases use without checking.
describe('the scripted record fault of the memory journal', () => {
  // Red when the fault leaks to another tenant's execution of the same text, or to another
  // execution of the same tenant: that record fails with the scripted `unavailable` instead.
  it('fails only the next record of the arranged tenant and execution', async () => {
    const { fixture } = entriesFixture()
    const execution = ok(decodeAgentExecutionId('fault-scope')),
      sibling = ok(decodeAgentExecutionId('fault-scope-sibling'))
    const own = await fixture.open(fixture.access, execution),
      other = await fixture.open(fixture.otherAccess, execution),
      next = await fixture.open(fixture.access, sibling)
    await fixture.failNextRecord!(fixture.access, execution, { kind: 'unavailable' })
    const write = (
      who: typeof fixture.access,
      at: typeof execution,
      authority: typeof own,
      name: string,
    ) =>
      fixture.entries.record({
        ...who,
        execution: at,
        operation: operation(name),
        authority,
        entry: sampleStartFence(name),
      })
    expect(await write(fixture.otherAccess, execution, other, 'other-tenant')).toHaveProperty('ok')
    expect(await write(fixture.access, sibling, next, 'other-execution')).toHaveProperty('ok')
    expect(await write(fixture.access, execution, own, 'arranged')).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  // Red when the fault is consumed before the qualification check: the refused call would use
  // it up, and the next record that does reach the write step would succeed.
  it('stays armed through a refused record and fails the next one that reaches the write step', async () => {
    const { fixture, joint } = entriesFixture()
    const execution = ok(decodeAgentExecutionId('fault-refused'))
    const authority = await fixture.open(fixture.access, execution)
    await fixture.failNextRecord!(fixture.access, execution, { kind: 'unavailable' })
    const write = (name: string) =>
      fixture.entries.record({
        ...fixture.access,
        execution,
        operation: operation(name),
        authority,
        entry: sampleStartFence(name),
      })
    joint.qualify(fixture.access, execution, 'denied')
    expect(await write('refused')).toMatchObject({ failure: { kind: 'denied' } })
    joint.qualify(fixture.access, execution, 'allowed')
    expect(await write('reaches-write')).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await write('after-fault')).toHaveProperty('ok')
  })
})
