import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolLedger } from '@omne-harness/tool'
import { OUTPUT_BODY_KEY, type CallAccess } from '@omne-harness/tool-contract/provider'
import { bodyRepresentation } from '../src/body-representation.ts'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  evidence,
  functionDefinition,
  ok,
  operationId,
  text,
  type Block,
  type Principal,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

function representation() {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  const fixed = bodyRepresentation(definition.returns.body)
  if (fixed === null) throw new Error('fixture must declare a body')
  return fixed
}

async function outputWriter(ledger: ToolLedger<Principal, Block>, access: CallAccess<Principal>) {
  const recovery = ok(await ledger.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('fixture has no original start')
  const binding = { ...access, start: recovery.start, source: evidence('author-output') }
  let next = 1
  return {
    begin: async () =>
      ok(
        await ledger.bodyWrites.begin({
          ...binding,
          key: OUTPUT_BODY_KEY,
          operation: operationId('output-begin'),
          representation: representation(),
        }),
      ),
    append: async (value: string, end = false) => {
      const sequence = String(next)
      next += 1
      return ok(
        await ledger.bodyWrites.append({
          ...binding,
          key: OUTPUT_BODY_KEY,
          operation: operationId(`output-append-${sequence}`),
          sequence,
          frame: { kind: 'text', block: OUTPUT_BODY_KEY, text: value, end },
        }),
      )
    },
    seal: async () =>
      ok(
        await ledger.bodyWrites.seal({
          ...binding,
          key: OUTPUT_BODY_KEY,
          operation: operationId('output-seal'),
          afterSequence: String(next - 1),
        }),
      ),
  }
}

const answer = { content: [text('answer', 'done')], data: { kind: 'none' as const } }

/** A call that wrote `parts` into its output body before its final, sealed or left open. */
async function writtenFixture(parts: readonly string[], seal: boolean) {
  return settlementFixture({
    value: async (ledger, access) => {
      const writer = await outputWriter(ledger, access)
      await writer.begin()
      for (const [index, part] of parts.entries())
        await writer.append(part, seal && index === parts.length - 1)
      if (seal) await writer.seal()
      return { ...answer, original: { kind: 'none' }, attachments: [] }
    },
  })
}

type Fixture = Awaited<ReturnType<typeof settlementFixture>>
const read = (f: Fixture, after: string | null, maxBytes = 1024) =>
  f.ledger.reads.output({ ...f.access, admission: f.before.admission, after, maxBytes })

describe('reading the output body (design table: read the output body)', () => {
  it('a call without an output body answers none at any position', async () => {
    const f = await settlementFixture()
    for (const after of [null, '0', '9'])
      expect(await read(f, after)).toEqual({ ok: { kind: 'none' } })
  })

  it('an open body reads the last part, the part after a position, and nothing past the kept end', async () => {
    const f = await writtenFixture(['hello ', 'world'], false)
    expect(await read(f, null)).toEqual({
      ok: { kind: 'open', from: '0', through: '11', total: '11', text: 'hello world' },
    })
    expect(await read(f, null, 5)).toEqual({
      ok: { kind: 'open', from: '6', through: '11', total: '11', text: 'world' },
    })
    expect(await read(f, '6')).toMatchObject({ ok: { from: '6', through: '11', text: 'world' } })
    expect(await read(f, '11')).toEqual({
      ok: { kind: 'open', from: '11', through: '11', total: '11', text: '' },
    })
    expect(await read(f, '99')).toEqual({
      ok: { kind: 'open', from: '99', through: '99', total: '11', text: '' },
    })
  })

  it('a sealed body reads the same way and says it is sealed', async () => {
    const f = await writtenFixture(['hello ', 'world'], true)
    expect(await read(f, null, 5)).toEqual({
      ok: { kind: 'sealed', from: '6', through: '11', total: '11', text: 'world' },
    })
    expect(await read(f, '20')).toMatchObject({ ok: { kind: 'sealed', from: '20', text: '' } })
  })

  it('a part never splits a character', async () => {
    const f = await writtenFixture(['日本語'], true)
    expect(await read(f, null, 4)).toMatchObject({ ok: { from: '6', through: '9', text: '語' } })
    expect(await read(f, '1', 3)).toMatchObject({ ok: { from: '0', through: '3', text: '日' } })
  })

  it('the sealed output body stays readable with the result after the call settles', async () => {
    const f = await writtenFixture(['hello ', 'world'], true)
    ok(await f.preserve())
    expect(await read(f, '6')).toMatchObject({ ok: { kind: 'sealed', text: 'world' } })
  })

  it('settling links the sealed output body with an expiry, so it is kept and later reclaimed', async () => {
    const f = await writtenFixture(['hello'], true)
    ok(await f.preserve())
    const records = await f.records()
    const output = records.flatMap(record =>
      record.kind === 'body-entry' && record.body.key === OUTPUT_BODY_KEY ? [record.body] : [],
    )
    expect(output).toHaveLength(1)
    expect(output[0]?.state.kind).toBe('linked')
  })

  it('a call whose large result went to a system body still has no output body', async () => {
    const f = await settlementFixture({
      value: {
        content: [text('answer', 'x'.repeat(300_000))],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      },
    })
    ok(await f.preserve())
    expect(await read(f, null)).toEqual({ ok: { kind: 'none' } })
  })

  it('an output body left open is gone after the call settles', async () => {
    const f = await writtenFixture(['hello'], false)
    ok(await f.preserve())
    expect(await read(f, null)).toEqual({
      failure: { kind: 'not-found', target: 'body', reason: 'expired' },
    })
  })

  it('a store that cannot be read answers unavailable, not empty', async () => {
    const f = await writtenFixture(['hello'], false)
    f.bodies.store.failNext()
    expect(await read(f, null)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a reference under another admission is refused as not accepted', async () => {
    const f = await writtenFixture(['hello'], false)
    expect(
      await f.ledger.reads.output({
        ...f.access,
        admission: operationId('op-never'),
        after: null,
        maxBytes: 64,
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'reference' } })
  })

  it('a malformed position or budget is refused', async () => {
    const f = await writtenFixture(['hello'], false)
    expect(await read(f, '-1')).toMatchObject({ failure: { kind: 'invalid', field: 'after' } })
    const odd = (after: unknown, maxBytes: unknown) =>
      f.ledger.reads.output({
        ...f.access,
        admission: f.before.admission,
        after,
        maxBytes,
      } as never)
    expect(await odd(5, 64)).toMatchObject({ failure: { kind: 'invalid', field: 'after' } })
    expect(await odd(null, '64')).toMatchObject({ failure: { kind: 'invalid', field: 'maxBytes' } })
    expect(await odd(null, 1.5)).toMatchObject({ failure: { kind: 'invalid', field: 'maxBytes' } })
    expect(await read(f, null, 0)).toMatchObject({
      failure: { kind: 'invalid', field: 'maxBytes' },
    })
  })
})

// A small seeded generator stands in for a property library: the sequences are reproducible.
function generator(seed: number) {
  let state = seed >>> 0
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % bound
  }
}
const WORDS = ['a', 'bc', 'déf', '日', 'ghij', '\n', 'xyz🙂']

describe('reading never changes the call (TL-52, I-7)', () => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    it(`seed ${seed}: reads at any position return the kept bytes, the same twice, and write nothing`, async () => {
      const next = generator(seed)
      const steps = 4 + next(6)
      const parts = Array.from({ length: steps }, () => WORDS[next(WORDS.length)] ?? 'a')
      let fixture: Fixture | undefined
      const reads: (() => Promise<void>)[] = []
      fixture = await settlementFixture({
        value: async (ledger, access) => {
          const writer = await outputWriter(ledger, access)
          const { admission } = ok(await ledger.commands.loadRecovery(access))
          await writer.begin()
          let kept = ''
          for (const [index, part] of parts.entries()) {
            await writer.append(part, index === parts.length - 1)
            kept += part
            const bytes = Buffer.from(kept)
            const after = String(next(bytes.length + 3))
            const budget = 1 + next(bytes.length + 2)
            const first = ok(
              await ledger.reads.output({ ...access, admission, after, maxBytes: budget }),
            )
            const again = ok(
              await ledger.reads.output({ ...access, admission, after, maxBytes: budget }),
            )
            expect(again).toEqual(first)
            if (first.kind === 'none') throw new Error('the body was begun')
            expect(first.total).toBe(String(bytes.length))
            expect(Buffer.from(first.text).toString()).toBe(
              bytes.subarray(Number(first.from), Number(first.through)).toString(),
            )
            reads.push(async () => {
              expect(
                ok(await ledger.reads.output({ ...access, admission, after, maxBytes: budget }))
                  .kind,
              ).toBe('sealed')
            })
          }
          await writer.seal()
          return { ...answer, original: { kind: 'none' }, attachments: [] }
        },
      })
      const f = fixture
      const commits = f.commits.length
      const state = ok(await f.ledger.commands.loadRecovery(f.access)).state
      for (const again of reads) await again()
      expect(f.commits.length).toBe(commits)
      expect(ok(await f.ledger.commands.loadRecovery(f.access)).state).toEqual(state)
      ok(await f.preserve())
      const settled = await f.resultPage()
      expect(settled.terminal).toEqual({ kind: 'completed' })
      const all = ok(await read(f, '0', 1 << 16))
      expect(all).toMatchObject({ kind: 'sealed', text: parts.join('') })
    })
  }
})
