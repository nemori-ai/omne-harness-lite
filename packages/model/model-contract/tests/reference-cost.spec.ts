// @module-tag slow
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type ModelInvocationParts,
} from '@omne-harness/model-contract'
import { tenantA, call, operation, must } from './scripted-support.ts'

const ROUNDS = 7
const ITERATIONS = 100_000
const CEILING_NS = 50_000

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

describe('the cost of a saved Model reference', () => {
  it('resolves and digests within the ceiling and prints the measurement', () => {
    const parts: ModelInvocationParts = {
      tenant: tenantA,
      call: call('a'.repeat(64)),
      admission: operation('b'.repeat(64)),
    }
    const reference = must(encodeModelInvocationRef(parts))
    const producer = { kind: 'model', call: reference }
    let sink = 0
    const resolveNs = medianNs(() => {
      const resolved = resolveModelInvocationRef(reference, tenantA)
      if ('ok' in resolved) sink += resolved.ok.call.length
    })
    const digestNs = medianNs(() => {
      sink += producerDigest(producer).length
    })
    console.log(
      `ref-cost model ${JSON.stringify({ bytes: reference.length, resolveNs, digestNs, sink: sink > 0 })}`,
    )
    expect(resolveNs).toBeLessThan(CEILING_NS)
    expect(digestNs).toBeLessThan(CEILING_NS)
  })
})
