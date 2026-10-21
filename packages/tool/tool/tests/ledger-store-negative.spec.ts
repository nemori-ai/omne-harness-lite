import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { ConformanceCase } from '@omne-harness/tool-contract/testing'
import { runConformanceCase } from '@omne-harness/tool-contract/testing'
import {
  createMemoryToolLedgerStoreFixture,
  toolLedgerStoreConformance,
  toolLedgerStoreCompositionConformance,
  type ToolLedgerStoreControls,
  type ToolLedgerStoreFixture,
} from '@omne-harness/tool/testing'
import {
  aliasInput,
  aliasOutput,
  collapseDomains,
  ignoreCas,
  lateWithoutCas,
  oldPartialApply,
  readMap,
  stateUsesDomainRevision,
  withoutOperations,
  wrappedFixture,
} from './ledger-store-negative-values.ts'

function control(
  change: (fixture: ToolLedgerStoreFixture) => ToolLedgerStoreControls,
): ToolLedgerStoreFixture {
  const fixture = createMemoryToolLedgerStoreFixture()
  return { ...fixture, controls: { ...fixture.controls, ...change(fixture) } }
}
const noFault = () => {}
const negatives = [
  {
    name: 'store.snapshot',
    fixture: () =>
      readMap(read =>
        read.kind === 'complete' ? { ...read, records: read.records.slice(0, 1) } : read,
      ),
    message: 'read must include the complete committed batch',
  },
  {
    name: 'store.ordered-writes',
    fixture: () =>
      wrappedFixture(store => ({
        ...store,
        commit: input =>
          input.writes.length === 0 ? Promise.resolve({ kind: 'committed' }) : store.commit(input),
      })),
    message: 'empty writes must set the supplied revision',
  },
  {
    name: 'store.cas',
    fixture: ignoreCas,
    message: 'replayed CAS must conflict with current revision',
  },
  {
    name: 'store.concurrent-cas',
    fixture: ignoreCas,
    message: 'concurrent CAS must have exactly one winner',
  },
  {
    name: 'store.partitions',
    fixture: collapseDomains,
    message: 'domain identities must not share records or revision',
  },
  {
    name: 'store.input-copy',
    fixture: aliasInput,
    message: 'committed values must not alias caller input',
  },
  {
    name: 'store.output-copy',
    fixture: aliasOutput,
    message: 'read values must not alias stored records',
  },
  {
    name: 'store.read-unavailable',
    fixture: () => control(() => ({ readUnavailable: noFault })),
    message: 'armed read must answer unavailable',
  },
  {
    name: 'store.commit-unavailable',
    fixture: () =>
      control(f => ({
        commitUnavailable: async () => {
          assert.ok(f.controls.unknownDropped)
          await f.controls.unknownDropped()
        },
      })),
    message: 'armed commit must answer unavailable',
  },
  {
    name: 'store.unknownApplied',
    fixture: () =>
      control(f => ({
        unknownApplied: async () => {
          assert.ok(f.controls.unknownDropped)
          await f.controls.unknownDropped()
        },
      })),
    message: 'fault must preserve the declared complete applied or dropped outcome',
  },
  {
    name: 'store.unknownDropped',
    fixture: () =>
      control(f => ({
        unknownDropped: async () => {
          assert.ok(f.controls.unknownApplied)
          await f.controls.unknownApplied()
        },
      })),
    message: 'fault must preserve the declared complete applied or dropped outcome',
  },
  {
    name: 'store.throwApplied',
    fixture: () =>
      control(f => ({
        throwApplied: async () => {
          assert.ok(f.controls.unknownDropped)
          await f.controls.unknownDropped()
        },
      })),
    message: 'armed applied commit must throw',
  },
  {
    name: 'store.delayed-land',
    fixture: () =>
      control(f => ({
        delayed: {
          arm: async () => {
            await f.controls.unknownDropped?.()
          },
          land: noFault,
        },
      })),
    message: 'uncontested delayed commit must land completely',
  },
  {
    name: 'store.delayed-fence',
    fixture: lateWithoutCas,
    message: 'delayed commit must recheck expected after a fence',
  },
  {
    name: 'store.rejected-copy',
    fixture: oldPartialApply,
    message: 'rejected batch must preserve every record and the revision',
  },
  {
    name: 'ledger.idempotency',
    fixture: withoutOperations,
    message: 'same-input retry must recall admission',
  },
  {
    name: 'ledger.input-conflict',
    fixture: withoutOperations,
    message: 'same-operation different-input retry must be a business conflict',
  },
  {
    name: 'ledger.state-revision',
    fixture: stateUsesDomainRevision,
    message: 'valid state expected must succeed after domain revision advances',
  },
  {
    name: 'ledger.unknownApplied',
    fixture: () => control(() => ({ unknownApplied: noFault })),
    message: 'uncertain admission must not report success',
  },
  {
    name: 'ledger.throwApplied',
    fixture: () => control(() => ({ throwApplied: noFault })),
    message: 'uncertain admission must not report success',
  },
  {
    name: 'ledger.unknownDropped',
    fixture: () =>
      control(f => ({
        unknownDropped: async () => {
          assert.ok(f.controls.unknownApplied)
          await f.controls.unknownApplied()
        },
      })),
    message: 'dropped original operation must be reliably excluded',
  },
  {
    name: 'ledger.delayed-fresh-retry',
    fixture: lateWithoutCas,
    message: 'late old commit must not cross a successful fence',
  },
  {
    name: 'ledger.fence-unknownDropped',
    fixture: () => control(() => ({ unknownDropped: noFault })),
    message: 'unknown fence cannot justify a negative answer',
  },
  {
    name: 'ledger.fence-commitUnavailable',
    fixture: () => control(() => ({ commitUnavailable: noFault })),
    message: 'unavailable fence must fail the query',
  },
] satisfies readonly Readonly<{
  name: string
  fixture(): ToolLedgerStoreFixture
  message: string
}>[]

const checks = [...toolLedgerStoreConformance(), ...toolLedgerStoreCompositionConformance()]
function findCase(name: string): ConformanceCase<ToolLedgerStoreFixture> {
  const check = checks.find(item => item.name === name)
  assert.ok(check, `case ${name} must be public`)
  return check
}
describe('each public case detects its targeted defect', () => {
  for (const negative of negatives)
    it(negative.name, async () => {
      const fixture = negative.fixture()
      try {
        await assert.rejects(
          () => runConformanceCase(findCase(negative.name), fixture),
          error => {
            assert.ok(
              error instanceof assert.AssertionError,
              `target must fail by AssertionError, received ${String(error)}`,
            )
            assert.ok(
              error.message.includes(negative.message),
              `expected target ${negative.message}, received ${error.message}`,
            )
            return true
          },
        )
      } finally {
        await fixture.close()
      }
    })
  it('maps every store and business case except the separate internal guard negative', () => {
    assert.deepEqual(
      negatives.map(item => item.name).sort(),
      checks
        .filter(item => item.name !== 'ledger.qualification')
        .map(item => item.name)
        .sort(),
    )
  })
})
