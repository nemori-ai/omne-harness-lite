import { it } from 'vitest'
import { agentJournalEntriesConformance } from '@omne-harness/agent-contract/testing'
import { entriesFixture } from './fixtures/entries-conformance.ts'
const inventory = entriesFixture()
for (const [index, test] of agentJournalEntriesConformance(inventory.fixture, {
  received: 'required',
  joint: inventory.joint,
}).entries()) {
  it(`Journal entries/received: ${test.name}`, async () => {
    const { fixture, joint } = entriesFixture()
    await agentJournalEntriesConformance(fixture, { received: 'required', joint })[index]!.run()
  })
}
