// The stable read of the groups (RQ-13): each count and source read keeps its class, retries are
// bounded, carried rows are reused only under the same key, and the judgment window is checked.
import { describe, expect, it } from 'vitest'
import type {
  AdoptedRequestSource,
  AssemblyResult,
  CompactionContextResult,
  SourceRead,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createMemoryAdoptedSource,
  type AssemblyFixture,
} from '@omne-harness/request-context-contract/testing'
import { row, text, evidence } from './fixtures.js'

type Group = 'history' | 'context' | 'prompt' | 'model' | 'tools' | 'control'
const groups: readonly Group[] = ['history', 'context', 'prompt', 'model', 'tools', 'control']

function candidate(result: AssemblyResult) {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(result.kind)
  return result.candidate
}
/** Replaces one method of a group reader; the memory reader object is writable. */
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
    previous: { candidate: f.call.candidate, enteredCompaction: null, carried: first },
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
      // The group still answers the old evidence on this read; its next read is the new epoch.
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

describe('the context group token covers the adopted count', () => {
  it('the token is present and moves when only the adopted fact moves', async () => {
    const f = createAssemblyFixture()
    const adopted = createMemoryAdoptedSource<string>()
    ;(f.sources as { adopted: AdoptedRequestSource<string> }).adopted = adopted
    const first = candidate(await f.operations().assemble(f.call))
    const before = first.preparation.key.tokens.context
    expect(typeof before).toBe('string')
    adopted.set(null)
    const second = candidate(await f.operations().assemble(f.call))
    expect(second.preparation.key.tokens.context).not.toBe(before)
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
  it('planCompaction always reads the window, never carried rows', async () => {
    const f = createAssemblyFixture({ rows: [row(0), row(1)] })
    const first = candidate(await f.operations().assemble(f.call))
    carry(f, first)
    const reads = f.history.readCount()
    await f.operations().planCompaction(f.call)
    expect(f.history.readCount()).toBeGreaterThan(reads)
  })
})

describe('the judgment window of planCompaction', () => {
  it('an empty history has no window: invalid, missing input', async () => {
    const f = createAssemblyFixture({ rows: [] })
    expect(await f.operations().planCompaction(f.call)).toEqual({
      kind: 'invalid',
      field: 'history.evidence.upper',
      reason: 'missing-input',
    })
  })
  function windowAnswer(f: AssemblyFixture, answer: (real: CompactionContextResult) => unknown) {
    const real = f.history.compactionContext.bind(f.history)
    ;(f.sources as unknown as { history: unknown }).history = {
      ...f.history,
      read: f.history.read.bind(f.history),
      async compactionContext(input: Parameters<typeof real>[0]) {
        return answer(await real(input)) as CompactionContextResult
      },
    }
  }
  it.each([
    [{ kind: 'denied' }, { kind: 'denied', action: 'read-history' }],
    [
      { kind: 'invalid', field: 'coverTo', reason: 'missing-input' },
      { kind: 'invalid', field: 'history.compactionContext.coverTo' },
    ],
    [{ kind: 'unknown' }, { kind: 'unknown' }],
    [
      { kind: 'unavailable', diagnostic: 'holder offline' },
      { kind: 'unavailable', owner: 'history-source' },
    ],
  ])('a window answer %j keeps its class', async (answer, expected) => {
    const f = createAssemblyFixture({ rows: [row(0), row(1)] })
    windowAnswer(f, () => answer)
    expect(await f.operations().planCompaction(f.call)).toMatchObject(expected)
  })
  it('a window under another evidence is a source evidence conflict', async () => {
    const f = createAssemblyFixture({ rows: [row(0), row(1)] })
    windowAnswer(f, real =>
      real.kind === 'context'
        ? { ...real, evidence: { ...real.evidence, upper: { kind: 'empty' } } }
        : real,
    )
    expect(await f.operations().planCompaction(f.call)).toEqual({
      kind: 'invalid',
      field: 'history.compactionContext.evidence',
      reason: 'source-evidence-conflict',
    })
  })
  it('an epoch change while the window is read retries the history group', async () => {
    const f = createAssemblyFixture({ rows: [row(0), row(1)] })
    let first = true
    windowAnswer(f, real => {
      if (!first) return real
      first = false
      return { kind: 'epoch-changed' }
    })
    expect((await f.operations().planCompaction(f.call)).kind).toBe('planned')
    expect(f.sources.sourceReads('history')).toBe(2)
  })
})

describe('deriveStep reads the model group stably', () => {
  it('a model group that keeps moving is unavailable for deriveStep', async () => {
    const f = createAssemblyFixture({ rows: [row(0), row(1)] })
    const planned = await f.operations().planCompaction(f.call)
    if (planned.kind !== 'planned') throw new Error(planned.kind)
    f.sources.churn('model', true)
    expect(
      await f.operations().deriveStep({
        call: f.call,
        plan: planned.plan,
        progress: planned.progress,
        material: planned.first.material,
        step: { kind: 'summary', index: '0', produced: [text('summary')], consumed: evidence },
      }),
    ).toMatchObject({ kind: 'unavailable', diagnostic: 'unstable-input:model' })
  })
})
