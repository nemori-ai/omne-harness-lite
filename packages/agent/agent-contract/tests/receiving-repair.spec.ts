import { describe, expect, it } from 'vitest'
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeOutputCursor,
  decodeResultVersion,
} from '@omne-harness/model-contract'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolDeliveryId, decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeConsumptionId,
  type Material,
  type ReceivedCommitInput,
} from '@omne-harness/agent-contract'
import {
  memoryReceivedCommitFixture,
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
} from '@omne-harness/agent-contract/testing'

function decoded<T>(value: Outcome<T, unknown>): T {
  if (!('ok' in value)) throw new Error('invalid test identity')
  return value.ok
}
function accessFor(principal: string, digit: string) {
  const org = organizationCodec.parse(`org_${digit.repeat(26)}`)
  const acc = accountCodec.parse(`acc_${digit.repeat(26)}`)
  if (!org.ok || !acc.ok) throw new Error('invalid test tenant')
  return { principal, tenant: tenant(org.value, acc.value) }
}
const access = accessFor('owner', '1')
const other = accessFor('other', '2')
const evidence = { owner: 'test', record: 'source', revision: '1', digest: 'test' }
function block(): ContentBlock {
  const value = judgeContentBlock({
    kind: 'text',
    id: 'payload',
    visibility: { toHuman: true, toModel: true },
    text: 'complete payload',
  })
  if (!('ok' in value)) throw new Error('invalid test block')
  return value.ok
}
function producerMaterial(kind: 'model' | 'tool'): Material<ContentBlock> {
  if (kind === 'model')
    return {
      kind,
      result: {
        producer: { kind, call: decoded(decodeModelCallId('mcall_material')) },
        version: 'mrver_material',
        delivery: null,
        source: evidence,
      },
      pages: [
        {
          parts: [{ kind: 'sealed', block: block(), trims: [] }],
          next: null,
          settlement: {
            version: decoded(decodeResultVersion('mrver_material')),
            cursor: decoded(decodeOutputCursor('0')),
            termination: { kind: 'completed', reason: 'stop' },
            source: evidence,
          },
        },
      ],
    }
  return {
    kind,
    result: {
      producer: { kind, call: decoded(decodeToolCallId('tool-material')) },
      version: 'tool-version',
      delivery: null,
      source: evidence,
    },
    pages: [
      {
        result: decoded(decodeToolResultVersion('tool-version')),
        terminal: { kind: 'completed' },
        effect: { kind: 'not-started' },
        actualTerminal: null,
        relation: 'original',
        delivery: decoded(decodeToolDeliveryId('tool-delivery')),
        source: evidence,
        value: {
          content: [block()],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [],
        },
        next: null,
      },
    ],
  }
}
async function fixtureInput(name: string, kind: 'model' | 'tool' = 'model') {
  const fixture = memoryReceivedCommitFixture(access, other)
  const execution = decoded(decodeAgentExecutionId(name))
  await fixture.open(access, execution)
  const { material: _source, ...entry } = (
    kind === 'model' ? sampleReceivedModelResult : sampleReceivedToolAccount
  )(access.tenant, name)
  const input = {
    ...access,
    execution,
    operation: decoded(decodeAgentOperationId(name)),
    entry,
    material: fixture.joint.material(name),
  }
  return { fixture, input }
}

describe('provider delivery scope', () => {
  it('protects an unpublished binding from a legacy write in another execution', async () => {
    const { fixture, input } = await fixtureInput('bound-before-record')
    await fixture.joint.bind(input)
    const execution = decoded(decodeAgentExecutionId('other-unpublished'))
    await fixture.open(access, execution)
    expect(
      await fixture.entries.record({
        ...input,
        execution,
        authority: null,
        entry: {
          ...input.entry,
          consumer: { ...input.entry.consumer, work: 'other' },
          material: evidence,
        },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    expect(await fixture.joint.inspect(access, execution)).toEqual({
      revision: 0,
      entries: 0,
      materials: 0,
    })
    expect(await fixture.joint.received.commit(input)).toMatchObject({ ok: { kind: 'committed' } })
  })
  it.each(['joint', 'legacy'] as const)(
    'refuses a conflicting execution after a %s received entry',
    async firstPath => {
      const { fixture, input } = await fixtureInput(`scope-${firstPath}`)
      if (firstPath === 'joint') {
        await fixture.joint.bind(input)
        expect(await fixture.joint.received.commit(input)).toMatchObject({
          ok: { kind: 'committed' },
        })
      } else {
        expect(
          await fixture.entries.record({
            ...input,
            authority: null,
            entry: { ...input.entry, material: evidence },
          }),
        ).toHaveProperty('ok')
      }
      const execution = decoded(decodeAgentExecutionId(`other-${firstPath}`))
      await fixture.open(access, execution)
      const second = {
        ...input,
        execution,
        operation: decoded(decodeAgentOperationId(`second-${firstPath}`)),
        entry: {
          ...input.entry,
          consumer: { ...input.entry.consumer, work: 'another-execution' },
          consumption: decoded(decodeConsumptionId('another-consumption')),
        },
      }
      let rejected = false
      try {
        await fixture.joint.bind(second)
      } catch {
        rejected = true
      }
      if (!rejected)
        expect(await fixture.joint.received.commit(second)).toMatchObject({
          failure: { kind: 'conflict' },
        })
      expect(
        await fixture.entries.record({
          ...second,
          authority: null,
          entry: { ...second.entry, material: evidence },
        }),
      ).toMatchObject({ failure: { kind: 'conflict' } })
      expect(await fixture.read(access, execution)).toEqual([])
      expect(await fixture.joint.inspect(access, execution)).toEqual({
        revision: 0,
        entries: 0,
        materials: 0,
      })
    },
  )
})

describe('producer material page validation', () => {
  it.each(['model', 'tool'] as const)('rejects a null %s page before publication', async kind => {
    const { fixture, input } = await fixtureInput(`bad-page-${kind}`, kind)
    const malformed = {
      ...input,
      material: { ...producerMaterial(kind), pages: [null] },
    } as unknown as ReceivedCommitInput<string, ContentBlock>
    await fixture.joint.bind(malformed)
    expect(await fixture.joint.received.commit(malformed)).toMatchObject({
      failure: { kind: 'invalid', field: 'material.pages.0' },
    })
    expect(await fixture.read(access, input.execution)).toEqual([])
    expect(await fixture.joint.inspect(access, input.execution)).toEqual({
      revision: 0,
      entries: 0,
      materials: 0,
    })
  })
  it.each([
    ['model', 'parts', null, 'material.pages.0.parts'],
    ['model', 'settlement.cursor', 'invalid', 'material.pages.0.settlement.cursor'],
    ['model', 'parts.0.block', null, 'material.pages.0.parts.0.block'],
    [
      'model',
      'settlement.termination.reason',
      'invented',
      'material.pages.0.settlement.termination.reason',
    ],
    ['tool', 'value.content.0', null, 'material.pages.0.value.content.0'],
    [
      'tool',
      'value.data',
      { kind: 'json', contract: evidence, schema: {}, value: null },
      'material.pages.0.value.data.contract.name',
    ],
    ['tool', 'terminal.kind', 'invented', 'material.pages.0.terminal.kind'],
    ['tool', 'value.attachments', [null], 'material.pages.0.value.attachments.0'],
  ] as const)('rejects malformed %s %s at its material path', async (kind, path, value, field) => {
    const { fixture, input } = await fixtureInput(
      `malformed-${kind}-${path.replaceAll('.', '-')}`,
      kind,
    )
    const material = JSON.parse(JSON.stringify(producerMaterial(kind))) as Record<string, unknown>
    function replaceAt(target: unknown, keys: string[]): void {
      if (typeof target !== 'object' || target === null) throw new Error('invalid test edit path')
      const [key, ...rest] = keys
      if (!key) throw new Error('missing test edit key')
      if (rest.length === 0) Reflect.set(target, key, value)
      else replaceAt(Reflect.get(target, key), rest)
    }
    replaceAt(material, ['pages', '0', ...path.split('.')])
    const malformed = { ...input, material } as unknown as ReceivedCommitInput<string, ContentBlock>
    await fixture.joint.bind(malformed)
    expect(await fixture.joint.received.commit(malformed)).toMatchObject({
      failure: { kind: 'invalid', field },
    })
    expect(await fixture.joint.inspect(access, input.execution)).toEqual({
      revision: 0,
      entries: 0,
      materials: 0,
    })
  })
  it.each(['model', 'tool'] as const)(
    'preserves a valid %s page and complete content',
    async kind => {
      const { fixture, input } = await fixtureInput(`valid-page-${kind}`, kind)
      const valid = { ...input, material: producerMaterial(kind) }
      await fixture.joint.bind(valid)
      const answer = await fixture.joint.received.commit(valid)
      expect(answer).toMatchObject({ ok: { kind: 'committed' } })
      if (!('ok' in answer) || answer.ok.kind !== 'committed') throw new Error('expected committed')
      expect(
        await fixture.joint.materials.read({ ...access, source: answer.ok.value.entry.material }),
      ).toEqual({ ok: valid.material })
    },
  )
})
