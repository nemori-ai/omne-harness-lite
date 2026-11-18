import { describe, it, expect } from 'vitest'
import {
  assembleSystemPrompt,
  project,
  projectForHuman,
  compactionSettingsBlock,
  compactionPolicySchema,
  coverageSchema,
} from '@omne-harness/request-context-contract'
import {
  fixture,
  must,
  text,
  row,
  adoption,
  scope,
  epoch,
  assemble,
  resume,
  sourcesFor,
  rowWith,
  type Ports,
} from './fixtures.js'

describe('assembly closed outcomes and source boundaries', () => {
  it('assembles deterministic three-layer candidates and measures the planned request bytes', async () => {
    const f = fixture()
    const seen: string[] = []
    const meter = f.ports.meter
    const ports = {
      ...f.ports,
      plan: ((value: Parameters<NonNullable<Ports['plan']>>[0]) => ({
        ok: {
          parameters: [],
          representation: {
            kind: 'materialized' as const,
            adoption: value.assembled.representation,
            tokenInput: { kind: 'null' as const },
            media: [],
            requestBytes: '103',
          },
        },
      })) satisfies NonNullable<Ports['plan']>,
      meter: {
        ...meter,
        measure: (input: Parameters<typeof meter.measure>[0]) => {
          seen.push(
            input.representation.kind === 'materialized'
              ? input.representation.requestBytes
              : 'pending',
          )
          return meter.measure(input)
        },
      },
    }
    const a = await assemble(f.input, ports, f.policies),
      b = await assemble(f.input, ports, f.policies)
    expect(a).toEqual(b)
    expect(a.kind).toBe('candidate-before-extension')
    expect(seen).toEqual(['103', '103', '103', '103'])
    if (a.kind === 'candidate-before-extension') {
      expect(a.candidate.coverage.history.prefixDigest).toBe('chain:0')
      expect(a.candidate.assembled.messages).toHaveLength(1)
      expect(a.candidate.assembled.source.digest).toMatch(/^[0-9a-f]{64}$/u)
    }
  })
  it('requires reliable input save and uses caller scope', async () => {
    const f = fixture()
    expect(
      (
        await assemble(
          { ...f.input, inputs: { ...f.input.inputs, saved: null } },
          f.ports,
          f.policies,
        )
      ).kind,
    ).toBe('invalid')
    expect(f.counts().reads).toBe(0)
  })
  it.each(['denied', 'unknown', 'unavailable'] as const)('preserves history %s', async kind => {
    const f = fixture()
    const p = {
      ...f.ports,
      history: {
        ...f.ports.history,
        read: async () => (kind === 'unavailable' ? { kind, diagnostic: 'offline' } : { kind }),
      },
    }
    expect((await assemble(f.input, p, f.policies)).kind).toBe(kind)
  })
  it('fixed input overflow is cannot-fit; entered plan changes outcome without changing input content', async () => {
    const f = fixture()
    let calls = 0
    const p = {
      ...f.ports,
      meter: {
        ...f.ports.meter,
        measure: async () => ({ ok: f.budget(++calls % 2 ? '900' : '1') }),
      },
    }
    expect((await assemble(f.input, p, f.policies)).kind).toBe('needs-compaction')
    expect(
      (
        await assemble(
          {
            ...f.input,
            previous: {
              candidate: f.input.identity.candidate,
              enteredCompaction: true,
            },
          },
          p,
          f.policies,
        )
      ).kind,
    ).toBe('cannot-fit')
    const overflow = {
      ...f.ports,
      meter: { ...f.ports.meter, measure: async () => ({ ok: f.budget('1001') }) },
    }
    const result = await assemble(f.input, overflow, f.policies)
    expect(result).toMatchObject({ kind: 'cannot-fit', reason: 'fixed-part-over-limit' })
  })
  it('unknown upstream limit still produces candidate with evidence', async () => {
    const f = fixture()
    const budget = f.budget()
    const p = {
      ...f.ports,
      meter: {
        ...f.ports.meter,
        measure: async () => ({
          ok: {
            ...budget,
            checks: budget.checks.map(c => ({
              ...c,
              constraint: { ...c.constraint, upstream: { kind: 'unknown' as const } },
            })),
          },
        }),
      },
    }
    const result = await assemble(f.input, p, f.policies)
    expect(result.kind).toBe('candidate-before-extension')
    if (result.kind === 'candidate-before-extension')
      expect(result.candidate.verdict.kind).toBe('limit-unknown')
  })
  it('epoch changes discard prior pages and all next pages use the new evidence', async () => {
    const f = fixture()
    let n = 0
    const seen: string[] = []
    const next = must(
      (await import('@omne-harness/request-context-contract')).decodeEpochId('epoch:2'),
    )
    const p: typeof f.ports = {
      ...f.ports,
      history: {
        ...f.ports.history,
        read: async ({ evidence: e }) => {
          seen.push(e.epoch)
          n++
          if (n > 1) return { kind: 'page' as const, page: { rows: [row()], next: null } }
          const sources = sourcesFor(f.input, p)
          const history = sources.values().history
          sources.update('history', { ...history, evidence: { ...history.evidence, epoch: next } })
          return { kind: 'epoch-changed' as const, current: { ...e, epoch: next } }
        },
      },
    }
    const result = await assemble(f.input, p, f.policies)
    expect(seen).toEqual([epoch, next])
    if (result.kind === 'candidate-before-extension')
      expect(result.candidate.coverage.history.epoch).toBe(next)
  })
  it('resume requires the compaction transition before reading and counting', async () => {
    const f = fixture()
    const result = await resume({ ...f.input, transition: null }, f.ports, f.policies)
    expect(result).toMatchObject({ kind: 'invalid', reason: 'missing-input' })
    expect(f.counts().meters).toBe(0)
  })
})
describe('prompt', () => {
  it('sorts sections by order then name and shadows variables by scope', () => {
    const f = fixture()
    const source = { source: adoption, revision: '1' }
    const result = assembleSystemPrompt(
      {
        digest: 'd',
        generation: null,
        contributions: [
          {
            kind: 'variable',
            name: 'who',
            value: 'global',
            scope: null,
            ...source,
          },
          { kind: 'variable', name: 'who', value: 'local', scope, ...source },
          {
            kind: 'section',
            name: 'b',
            order: '1',
            template: 'B {{who}}',
            uses: ['who'],
            scope: null,
            ...source,
          },
          {
            kind: 'section',
            name: 'a',
            order: '1',
            template: 'A',
            uses: [],
            scope: null,
            ...source,
          },
        ],
      },
      f.input.assembleContext,
    )
    expect(result.kind).toBe('rendered')
    if (result.kind === 'rendered') expect(result.blocks[0]).toMatchObject({ text: 'A\nB local' })
  })
})
describe('projection and compaction plans', () => {
  it('does not mutate source and excludes private/tool-internal model blocks', () => {
    const r = row()
    const privateMessage = {
      id: r.message.id,
      role: 'user',
      blocks: [{ ...text('secret'), visibility: { toModel: false, toHuman: true } }],
    } as const
    expect(project([rowWith(0, privateMessage)], epoch).messages).toHaveLength(0)
    expect(projectForHuman([rowWith(0, privateMessage)]).entries).toHaveLength(1)
    expect(privateMessage.blocks[0].text).toBe('secret')
  })
})
it('required block schemas and durable decoders reject malformed values', () => {
  expect(compactionSettingsBlock.required).toBe(true)
  expect(compactionPolicySchema['~standard'].validate({})).toHaveProperty('issues')
  expect(coverageSchema['~standard'].validate({ history: {} })).toHaveProperty('issues')
})
it('caller-carried stable layers skip history reads while tail/representation/budget/outcome remain live', async () => {
  const f = fixture()
  const first = await assemble(f.input, f.ports, f.policies)
  if (first.kind !== 'candidate-before-extension') throw new Error(first.kind)
  const before = f.counts()
  const result = await assemble(
    {
      ...f.input,
      previous: {
        candidate: f.input.identity.candidate,
        enteredCompaction: false,
        carried: first.candidate,
      },
    },
    f.ports,
    f.policies,
  )
  expect(result.kind).toBe('candidate-before-extension')
  expect(f.counts().reads).toBe(before.reads)
  expect(f.counts().meters).toBe(before.meters + 2)
  const changed = await assemble(
    {
      ...f.input,
      conditions: { ...f.input.conditions, revision: '2' },
      previous: {
        candidate: f.input.identity.candidate,
        enteredCompaction: false,
        carried: first.candidate,
      },
    },
    f.ports,
    f.policies,
  )
  expect(changed.kind).toBe('candidate-before-extension')
  expect(f.counts().reads).toBe(before.reads)
  expect(f.counts().meters).toBe(before.meters + 4)
})
