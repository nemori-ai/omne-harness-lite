import { expect, it } from 'vitest'
import { decodeAgentExecutionId, decodeAgentOperationId } from '@omne-harness/agent-contract'
import {
  memoryReceivedCommitFixture,
  sampleReceivedModelResult,
} from '@omne-harness/agent-contract/testing'
import { testingTenant } from '@omne-harness/tool-contract/testing'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

it('uses the required execution and refuses a different consumer binding', async () => {
  const access = {
    principal: 'owner',
    tenant: testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
  }
  const otherAccess = {
    principal: 'other',
    tenant: testingTenant(`org_${'2'.repeat(26)}`, `acc_${'3'.repeat(26)}`),
  }
  const fixture = memoryReceivedCommitFixture(access, otherAccess)
  const execution = ok(decodeAgentExecutionId('material-owner'))
  const elsewhere = ok(decodeAgentExecutionId('another-execution'))
  await fixture.open(access, execution)
  await fixture.open(access, elsewhere)
  const { material: _source, ...entry } = sampleReceivedModelResult(access.tenant, 'material')
  const value = fixture.joint.material('retained')
  await fixture.joint.bind({
    ...access,
    execution,
    operation: ok(decodeAgentOperationId('bind-material')),
    entry,
    material: value,
  })
  const input = { ...access, identity: 'material', consumer: entry.consumer, value }
  expect(await fixture.joint.materials.preserve({ ...input, execution: elsewhere })).toMatchObject({
    failure: { kind: 'denied' },
  })
  const source = ok(await fixture.joint.materials.preserve({ ...input, execution }))
  expect(ok(await fixture.joint.materials.preserve({ ...input, execution }))).toEqual(source)
  expect(ok(await fixture.joint.materials.read({ ...access, source }))).toEqual(value)
  fixture.joint.qualify(access, execution, 'denied')
  expect(await fixture.joint.materials.preserve({ ...input, execution })).toMatchObject({
    failure: { kind: 'denied' },
  })
})
