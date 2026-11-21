import { describe, expect, it } from 'vitest'
import {
  createAssemblyOperations,
  type AdoptedRequestSource,
  type AssemblyResult,
  type SourceRead,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createMemoryAdoptedSource,
  createTestingPrincipalBinding,
  type AssemblyFixture,
} from '@omne-harness/request-context-contract/testing'
import { row, text, evidence } from './fixtures.js'

type Group = 'history' | 'prompt' | 'model' | 'tools' | 'control'
const groups: readonly Group[] = ['history', 'prompt', 'model', 'tools', 'control']

function candidate(result: AssemblyResult) {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(result.kind)
  return result.candidate
}
function patchGroup<K extends 'readCount' | 'readSource'>(
  f: AssemblyFixture,
  group: Group,
  method: K,
  make: (original: AssemblyFixture['sources']['groups'][Group][K]) => unknown,
) {
  const reader = f.sources.groups[group] as unknown as Record<string, unknown>
  const original = reader[method] as AssemblyFixture['sources']['groups'][Group][K]
  reader[method] = make(original)
}
function carry(f: AssemblyFixture, first: ReturnType<typeof candidate>) {
  const control = f.sources.values().control
  f.sources.update('control', {
    ...control,
    previous: { candidate: f.call.candidate, enteredCompaction: false, carried: first },
  })
}

describe('a failing count read keeps its class', () => {
  it.each(groups.flatMap(group => [1, 2].map(at => [group, at] as const)))(
    'the %s group count read %i of an attempt fails: unknown, nothing published',
    async (group, at) => {
      const f = createAssemblyFixture()
      let n = 0
      patchGroup(f, group, 'readCount', original => async (call: never) => {
        n++
        return n === at ? { kind: 'unknown' } : (original as (c: never) => unknown)(call)
      })
      expect(await f.operations().assemble(f.call)).toMatchObject({ kind: 'unknown' })
    },
  )
})

describe('a failing source read keeps its class', () => {
  it.each(groups)('the %s group source read denied is denied', async group => {
    const f = createAssemblyFixture()
    patchGroup(f, group, 'readSource', () => async () => ({ kind: 'denied' }))
    expect(await f.operations().assemble(f.call)).toMatchObject({
      kind: 'denied',
      action: 'read-inputs',
    })
  })
  it('an invalid source read names the group and the field', async () => {
    const f = createAssemblyFixture()
    patchGroup(f, 'tools', 'readSource', () => async () => ({
      kind: 'invalid',
      field: 'definitions',
      reason: 'missing-input',
    }))
    expect(await f.operations().assemble(f.call)).toEqual({
      kind: 'invalid',
      field: 'tools.definitions',
      reason: 'missing-input',
    })
  })
  it('the adopted source read keeps its class, and gets the access and the target', async () => {
    const f = createAssemblyFixture()
    const seen: unknown[] = []
    const failing: AdoptedRequestSource<string> = {
      authority: { owner: 'test', name: 'adopted', revision: '1', digest: 'd' },
      async readCount(input) {
        seen.push(input)
        return { kind: 'value', value: 'adopted_1' as never }
      },
      async readSource(input): Promise<SourceRead<null>> {
        seen.push(input)
        return { kind: 'unavailable', diagnostic: 'adopted log offline' }
      },
    }
    ;(f.sources as { adopted: AdoptedRequestSource<string> }).adopted = failing
    expect(await f.operations().assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      diagnostic: 'adopted log offline',
    })
    expect(seen).toContainEqual({ access: f.call.access, target: f.target })
    expect(seen.every(input => JSON.stringify(input) === JSON.stringify(seen[0]))).toBe(true)
  })
})

describe('retries are bounded', () => {
  it.each(groups)('a %s group that keeps moving is read exactly twice', async group => {
    const f = createAssemblyFixture()
    f.sources.churn(group, true)
    expect(await f.operations().assemble(f.call)).toMatchObject({
      diagnostic: `unstable-input:${group}`,
    })
    expect(f.sources.sourceReads(group)).toBe(2)
  })
  it('an epoch that changes during the history read retries with the new evidence', async () => {
    const rows = [row(0), row(1)]
    const f = createAssemblyFixture({ rows })
    const history = f.sources.values().history
    f.sources.afterSourceRead('history', () => {
      const next = f.history.commitCompaction({
        role: 'compaction',
        id: rows[1]!.message.id,
        blocks: [text('summary')],
        covers: { from: rows[0]!.entry, to: rows[0]!.entry },
        retained: [],
        derivation: evidence,
      })
      f.sources.update('history', {
        ...history,
        evidence: { ...f.history.evidence(), epoch: next },
      })
    })
    const result = candidate(await f.operations().assemble(f.call))
    expect(result.coverage.history.epoch).not.toBe(history.evidence.epoch)
    expect(f.sources.sourceReads('history')).toBe(2)
  })
})

describe('the history group token covers the adopted count', () => {
  it('the token is present and moves when only the adopted fact moves', async () => {
    const f = createAssemblyFixture()
    const adopted = createMemoryAdoptedSource<string>()
    ;(f.sources as { adopted: AdoptedRequestSource<string> }).adopted = adopted
    const first = candidate(await f.operations().assemble(f.call))
    const before = first.preparation.key.tokens.history
    expect(typeof before).toBe('string')
    adopted.set(null)
    const second = candidate(await f.operations().assemble(f.call))
    expect(second.preparation.key.tokens.history).not.toBe(before)
    expect(second.preparation.key.tokens.prompt).toBe(first.preparation.key.tokens.prompt)
  })
})

describe('carried rows are reused only under the same key', () => {
  it('the same key reads no history page', async () => {
    const f = createAssemblyFixture()
    const first = candidate(await f.operations().assemble(f.call))
    carry(f, first)
    const reads = f.history.readCount()
    await f.operations().assemble(f.call)
    expect(f.history.readCount()).toBe(reads)
  })
  it.each([
    [
      'another candidate',
      (first: ReturnType<typeof candidate>) => ({ ...first, candidate: 'candidate:9' }),
    ],
    [
      'another source generation',
      (first: ReturnType<typeof candidate>) => ({
        ...first,
        preparation: {
          ...first.preparation,
          key: { ...first.preparation.key, generation: 'generation_9' },
        },
      }),
    ],
    [
      'another history token',
      (first: ReturnType<typeof candidate>) => ({
        ...first,
        preparation: {
          ...first.preparation,
          key: {
            ...first.preparation.key,
            tokens: { ...first.preparation.key.tokens, history: 'history_9' },
          },
        },
      }),
    ],
  ])('%s reads the history again', async (_name, change) => {
    const f = createAssemblyFixture()
    const first = candidate(await f.operations().assemble(f.call))
    carry(f, change(first) as never)
    const reads = f.history.readCount()
    await f.operations().assemble(f.call)
    expect(f.history.readCount()).toBeGreaterThan(reads)
  })
})

describe('lent reuse never changes the original reads', () => {
  const withReuse = (f: AssemblyFixture) =>
    createAssemblyOperations({
      target: f.target,
      sources: f.sources,
      principalBinding: createTestingPrincipalBinding<string>(),
      policies: f.policies,
      reuse: { load: () => null, stage: () => {} },
    })
  it('reuse without material reads every page, like a call without reuse', async () => {
    const f = createAssemblyFixture({ rows: [row(0), row(1), row(2)] })
    const before = f.history.readCount()
    await f.operations().assemble(f.call)
    const alone = f.history.readCount() - before
    await withReuse(f).assemble(f.call)
    expect(f.history.readCount() - before - alone).toBe(alone)
  })
  it('a carried candidate of the same key still reads no page when reuse is lent', async () => {
    const f = createAssemblyFixture()
    const first = candidate(await withReuse(f).assemble(f.call))
    carry(f, first)
    const reads = f.history.readCount()
    await withReuse(f).assemble(f.call)
    expect(f.history.readCount()).toBe(reads)
  })
  it('a group that keeps moving is still read exactly twice', async () => {
    const f = createAssemblyFixture()
    f.sources.churn('history', true)
    expect(await withReuse(f).assemble(f.call)).toMatchObject({
      diagnostic: 'unstable-input:history',
    })
    expect(f.sources.sourceReads('history')).toBe(2)
  })
})
