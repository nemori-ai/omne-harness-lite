import { describe, expect, it } from 'vitest'
import { decodeAgentExecutionId } from '@omne-harness/agent-contract'
import {
  memoryReceivedCommitFixture,
  sampleReceivedModelResult,
} from '@omne-harness/agent-contract/testing'
import { testingTenant } from '@omne-harness/tool-contract/testing'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

const access = {
  principal: 'owner',
  tenant: testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
}
const otherAccess = {
  principal: 'other',
  tenant: testingTenant(`org_${'2'.repeat(26)}`, `acc_${'3'.repeat(26)}`),
}

async function setup() {
  const fixture = memoryReceivedCommitFixture(access, otherAccess)
  const execution = ok(decodeAgentExecutionId('qualified-route'))
  await fixture.open(access, execution)
  const { material: _source, ...entry } = sampleReceivedModelResult(access.tenant, 'qualified')
  const value = fixture.joint.material('retained')
  const input = { identity: 'retained', consumer: entry.consumer, value }
  return { fixture, execution, input, value }
}

describe('an explicit execution on a consumer without a bound execution needs a current qualification', () => {
  it('refuses a same-tenant principal that holds no qualification, and a denied one', async () => {
    const { fixture, execution, input } = await setup()
    const stranger = { tenant: access.tenant, principal: 'stranger' }
    expect(
      await fixture.joint.materials.preserve({ ...stranger, ...input, execution }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    fixture.joint.qualify(access, execution, 'denied')
    expect(
      await fixture.joint.materials.preserve({ ...access, ...input, execution }),
    ).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('refuses another tenant that names the execution', async () => {
    const { fixture, execution, input } = await setup()
    expect(
      await fixture.joint.materials.preserve({ ...otherAccess, ...input, execution }),
    ).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('does not let a legacy-shape repeat drop the execution of retained material', async () => {
    const { fixture, execution, input, value } = await setup()
    const source = ok(await fixture.joint.materials.preserve({ ...access, ...input, execution }))
    expect(await fixture.joint.materials.preserve({ ...access, ...input })).toMatchObject({
      failure: { kind: 'denied' },
    })
    const stranger = { tenant: access.tenant, principal: 'stranger' }
    expect(await fixture.joint.materials.read({ ...stranger, source })).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(ok(await fixture.joint.materials.read({ ...access, source }))).toEqual(value)
  })
})
