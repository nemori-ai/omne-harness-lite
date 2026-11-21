import { describe, expect, it } from 'vitest'
import type { Message } from '@omne-harness/message'
import type { HistoryRow } from '@omne-harness/request-context-contract'
import { assemble, fixture, rowWith, text, upper } from './fixtures.js'
import { parseMessageId } from '@omne-harness/message'

// P1: while the log only grows, has no compaction, and the definition and tool declarations stay
// the same, a later request to the same recipient starts with the bytes of an earlier one.

type Assembled = Readonly<{ system: string; tools: string; messages: readonly string[] }>
type Assembler = (rows: readonly HistoryRow[]) => Promise<Assembled>

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

function idOf(index: number): Message['id'] {
  const parsed = parseMessageId(`msg_${String(index).padStart(22, 'm')}`)
  if (!parsed.ok) throw new Error('id')
  return parsed.value
}

// A log of user, assistant and reminder messages; every one is legal history.
function historyOf(next: () => number, length: number): readonly HistoryRow[] {
  return Array.from({ length }, (_, index) => {
    const roll = next()
    const words = `entry ${index} ${Math.floor(roll * 1_000_000)}`
    const message: Message =
      roll < 0.4
        ? { role: 'user', id: idOf(index), blocks: [text(words)] }
        : roll < 0.8
          ? { role: 'assistant', id: idOf(index), blocks: [text(words)] }
          : { role: 'system_reminder', id: idOf(index), blocks: [text(words)] }
    return rowWith(index, message)
  })
}

const realAssembly: Assembler = async rows => {
  const f = fixture()
  const ports = {
    ...f.ports,
    history: {
      ...f.ports.history,
      async read() {
        return { kind: 'page' as const, page: { rows, next: null } }
      },
    },
  }
  const input = { ...f.input, history: { ...f.input.history, upper: upper(rows.length - 1) } }
  const result = await assemble(input, ports, f.policies)
  if (result.kind !== 'candidate-before-extension') throw new Error(result.kind)
  const assembled = result.candidate.assembled
  if (assembled.messages.length !== rows.length)
    throw new Error(`assembled ${assembled.messages.length} messages from ${rows.length} rows`)
  return {
    system: JSON.stringify(assembled.system),
    tools: JSON.stringify(assembled.tools),
    messages: assembled.messages.map(message => JSON.stringify(message)),
  }
}

// The broken projection P1 must catch: content that is not in the log, put in the middle.
const insertingAssembly: Assembler = async rows => {
  const real = await realAssembly(rows)
  const middle = Math.floor(real.messages.length / 2)
  return {
    ...real,
    messages: [
      ...real.messages.slice(0, middle),
      JSON.stringify({ role: 'system_reminder', text: `rows ${rows.length}` }),
      ...real.messages.slice(middle),
    ],
  }
}

async function counterexample(assembler: Assembler, seeds: number): Promise<string | null> {
  for (let seed = 1; seed <= seeds; seed++) {
    const next = random(seed)
    const length = 2 + Math.floor(next() * 12)
    const rows = historyOf(next, length)
    const cut = 1 + Math.floor(next() * (length - 1))
    const earlier = await assembler(rows.slice(0, cut))
    const later = await assembler(rows)
    if (earlier.system !== later.system) return `seed ${seed}: system prompt changed`
    if (earlier.tools !== later.tools) return `seed ${seed}: tool declarations changed`
    const head = later.messages.slice(0, earlier.messages.length)
    if (JSON.stringify(head) !== JSON.stringify(earlier.messages))
      return `seed ${seed}: the later request does not start with the earlier one (cut ${cut} of ${length})`
  }
  return null
}

describe('P1: an append-only log gives append-only requests', () => {
  it('holds on generated logs', async () => {
    expect(await counterexample(realAssembly, 200)).toBeNull()
  })
  it('finds a counterexample when the projection inserts content that is not in the log', async () => {
    expect(await counterexample(insertingAssembly, 200)).toMatch(/does not start with/u)
  })
})
