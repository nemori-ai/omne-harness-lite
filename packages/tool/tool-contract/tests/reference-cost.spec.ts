// @module-tag slow
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  encodeToolInvocationRef,
  resolveToolInvocationRef,
  type ToolCallId,
  type ToolOperationId,
} from '@omne-harness/tool-contract'

const ROUNDS = 7
const ITERATIONS = 100_000
const CEILING_NS = 50_000

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}

const tenantA = tenant(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)

function canonicalText(value: unknown): string {
  return JSON.stringify(value, (_key, member: unknown) => {
    if (typeof member !== 'object' || member === null || Array.isArray(member)) return member
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(member).sort())
      sorted[key] = (member as Readonly<Record<string, unknown>>)[key]
    return sorted
  })
}

function producerDigest(producer: unknown): string {
  return createHash('sha256').update(canonicalText(producer)).digest('hex')
}

function medianNs(work: () => unknown): number {
  for (let i = 0; i < ITERATIONS; i += 1) work()
  const rounds: number[] = []
  for (let round = 0; round < ROUNDS; round += 1) {
    const start = process.hrtime.bigint()
    for (let i = 0; i < ITERATIONS; i += 1) work()
    rounds.push(Number(process.hrtime.bigint() - start) / ITERATIONS)
  }
  rounds.sort((a, b) => a - b)
  return rounds[Math.floor(ROUNDS / 2)]!
}

describe('the cost of a saved Tool reference', () => {
  it('resolves and digests within the ceiling and prints the measurement', () => {
    const encoded = encodeToolInvocationRef({
      tenant: tenantA,
      call: `call_${'a'.repeat(64)}` as ToolCallId,
      admission: `op_${'b'.repeat(64)}` as ToolOperationId,
    })
    if ('failure' in encoded) throw new Error('fixture reference does not encode')
    const reference = encoded.ok
    const producer = { kind: 'tool', call: reference }
    let sink = 0
    const resolveNs = medianNs(() => {
      const resolved = resolveToolInvocationRef(reference, tenantA)
      if ('ok' in resolved) sink += resolved.ok.call.length
    })
    const digestNs = medianNs(() => {
      sink += producerDigest(producer).length
    })
    console.log(
      `ref-cost tool ${JSON.stringify({ bytes: reference.length, resolveNs, digestNs, sink: sink > 0 })}`,
    )
    expect(resolveNs).toBeLessThan(CEILING_NS)
    expect(digestNs).toBeLessThan(CEILING_NS)
  })
})
