import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createMemoryRuntimeContext,
  runtimeContextConformance,
} from '@omne-harness/runtime-context-contract/testing'
import type {
  RuntimeContextFixture,
  RuntimeContextPorts,
} from '@omne-harness/runtime-context-contract/testing'
import type {
  Eligibility,
  RuntimeContextOperations,
  SnapshotResult,
} from '@omne-harness/runtime-context-contract'
const first = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
const second = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000001',
  }),
)
if (!first.ok || !second.ok) throw new Error('Invalid fixture tenant')
const tenant = first.value,
  otherTenant = second.value
function fixture(
  wrap: (memory: RuntimeContextOperations<string>) => RuntimeContextOperations<string>,
): RuntimeContextFixture<string> {
  return {
    tenant,
    otherTenant,
    principal: 'negative',
    subject: async (ports: RuntimeContextPorts<string>) => wrap(createMemoryRuntimeContext<string>(ports)),
  }
}
function obligation(name: string) {
  const found = runtimeContextConformance<string>().find(test => test.name === name)
  if (!found) throw new Error('Missing public obligation')
  return found
}
for (const dimension of ['consumer', 'scope'] as const)
  it(`the public ${dimension}-fixed obligation rejects a forwarded reader`, async () => {
    let successor: Eligibility<string> | undefined
    const bad = (memory: RuntimeContextOperations<string>): RuntimeContextOperations<string> => ({
      ...memory,
      async issueEligibility(principal, material) {
        const result = await memory.issueEligibility(principal, material)
        if (result.kind === 'issued' && material.supersedes) successor = result.eligibility
        return result
      },
      async bind(id) {
        const result = await memory.bind(id)
        if (result.kind !== 'bound') return result
        const reader = result.reader
        return {
          kind: 'bound',
          reader: {
            ...reader,
            async snapshot() {
              if (
                successor &&
                (dimension === 'consumer'
                  ? successor.consumer !== reader.consumer
                  : successor.scope.ref !== reader.scope.ref)
              ) {
                const rebound = await memory.bind(successor.id)
                if (rebound.kind === 'bound') return rebound.reader.snapshot()
              }
              return reader.snapshot()
            },
          },
        }
      },
    })
    await expect(
      obligation(`reissue-cannot-change-reader-${dimension}`).run(fixture(bad)),
    ).rejects.toThrow()
  })
for (const name of [
  'removed-plain-registration-refused',
  'removed-eligibility-checked-registration-concealed',
]) {
  it(`the public ${name} obligation rejects a success-plus-missing subject`, async () => {
    const bad = (memory: RuntimeContextOperations<string>): RuntimeContextOperations<string> => ({
      ...memory,
      async bind(id) {
        const result = await memory.bind(id)
        if (result.kind !== 'bound') return result
        const reader = result.reader
        return {
          kind: 'bound',
          reader: {
            ...reader,
            async snapshot(): Promise<SnapshotResult> {
              const current = await reader.snapshot()
              if (current.kind !== 'refused') return current
              return {
                kind: 'success',
                registration: { issued: 1, current: 2 },
                value: {
                  scope: reader.scope,
                  viewRevision: 2,
                  cursor: { cursor: 'incorrect-success' },
                  blocks: [],
                  missing: [{ key: 'suite.value', cause: 'no-value', revision: null }],
                  perRequest: [],
                },
              }
            },
          },
        }
      },
    })
    await expect(obligation(name).run(fixture(bad))).rejects.toThrow()
  })
}
