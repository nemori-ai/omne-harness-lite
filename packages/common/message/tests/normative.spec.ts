import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  isCompactionMessage,
  judgeCompaction,
  judgeMessage,
  parseRecordEntryRef,
  type CompactionContext,
  type CoveredEntry,
  type Message,
  type RecordEntryRef,
} from '@omne-harness/message'

/**
 * The two tables in docs/public-api.md are the rule list of the tool parts, the role rules, and
 * the compaction variant. This file runs every row, and it also fixes which rules and which
 * polarities each table has to show, so a table that lost a row or changed an outcome fails here.
 */
const ID = 'msg_abcdefghijklmnopqrstuv'

const POSITIVE = '正'

interface Cells {
  readonly line: number
  readonly cells: readonly string[]
}

/** The data rows of the table under a `## ` heading, each cell without its backticks. */
function tableRows(heading: string, width: number): readonly Cells[] {
  const doc = readFileSync(new URL('../docs/public-api.md', import.meta.url), 'utf8')
  const lines = doc.split('\n')
  const start = lines.findIndex(line => line.trim() === heading)
  if (start < 0) throw new Error(`the heading ${heading} is missing`)
  const rows: Cells[] = []
  for (let at = start + 1; at < lines.length; at += 1) {
    const line = lines[at] ?? ''
    if (line.startsWith('## ')) break
    if (!line.startsWith('|') || /^\|[\s:-]+\|/u.test(line)) continue
    const cells = line
      .slice(1, line.lastIndexOf('|'))
      .split('|')
      .map(cell => cell.trim().replace(/^`|`$/gu, ''))
    if (cells.length !== width) throw new Error(`line ${at + 1}: a row has ${width} cells`)
    if (cells[0] !== '规则') rows.push({ line: at + 1, cells })
  }
  return rows
}

function countShown(rows: readonly { rule: string; polarity: string }[]): Record<string, number> {
  const shown: Record<string, number> = {}
  for (const row of rows) {
    const key = `${row.rule}/${row.polarity}`
    shown[key] = (shown[key] ?? 0) + 1
  }
  return shown
}

// The three keys of a compaction message, for a row that is about its blocks.
const COMPACTION_KEYS = {
  covers: { from: 'e1', to: 'e1' },
  retained: [],
  derivation: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
}

interface Row {
  readonly line: number
  readonly rule: string
  readonly polarity: string
  readonly role: string
  readonly blocks: unknown
  readonly outcome: string
}

function exampleRows(): readonly Row[] {
  return tableRows('## 示例表', 5).map(({ line, cells }) => {
    const [rule, polarity, role, blocks, outcome] = cells as [
      string,
      string,
      string,
      string,
      string,
    ]
    return { line, rule, polarity, role, blocks: JSON.parse(blocks), outcome }
  })
}

function outcomeOf(role: string, blocks: unknown): string {
  const keys = role === 'compaction' ? COMPACTION_KEYS : {}
  const judged = judgeMessage({ id: ID, role, blocks, ...keys })
  if ('ok' in judged) return 'ok'
  return `rejected:${judged.rejected}@${judged.blockIndex ?? '-'}`
}

// How many rows show each rule on each side. An unparsed call may carry any visibility, so that
// rule has no refused row.
const EXPECTED_ROWS: Readonly<Record<string, number>> = {
  'call.keys/正': 1,
  'call.keys/反': 2,
  'call.identity/正': 1,
  'call.identity/反': 2,
  'call.callId/正': 1,
  'call.callId/反': 1,
  'call.name/正': 1,
  'call.name/反': 1,
  'call.arguments/正': 1,
  'call.arguments/反': 2,
  'incomplete.keys/正': 1,
  'incomplete.keys/反': 1,
  'incomplete.visibility/正': 1,
  'incomplete.visibility/反': 2,
  'incomplete.callId/正': 1,
  'incomplete.callId/反': 2,
  'incomplete.name/正': 1,
  'incomplete.name/反': 1,
  'incomplete.partial/正': 1,
  'incomplete.partial/反': 1,
  'unparsed.keys/正': 1,
  'unparsed.keys/反': 1,
  'unparsed.visibility/正': 2,
  'unparsed.callId/正': 1,
  'unparsed.callId/反': 1,
  'unparsed.name/正': 1,
  'unparsed.name/反': 1,
  'unparsed.raw/正': 1,
  'unparsed.raw/反': 1,
  'result.keys/正': 1,
  'result.keys/反': 2,
  'result.callId/正': 1,
  'result.callId/反': 1,
  'role.tool-first/正': 1,
  'role.tool-first/反': 2,
  'role.tool-single-marker/正': 1,
  'role.tool-single-marker/反': 1,
  'role.tool-body/正': 1,
  'role.tool-body/反': 3,
  'role.marker-only-in-tool/正': 1,
  'role.marker-only-in-tool/反': 2,
  'role.calls-only-in-assistant/正': 1,
  'role.calls-only-in-assistant/反': 4,
  'id.unique/正': 1,
  'id.unique/反': 3,
}

const rows = exampleRows()

describe('the example table', () => {
  it('shows each rule on each side, with exactly the rows that are fixed here', () => {
    expect(countShown(rows)).toEqual(EXPECTED_ROWS)
  })

  it('has a refused row for every refusal and an ok row for every allowed example', () => {
    for (const row of rows) {
      expect(row.polarity === POSITIVE, `line ${row.line}`).toBe(row.outcome === 'ok')
    }
  })

  it.each(rows.map(row => [`line ${row.line} ${row.rule}/${row.polarity}`, row] as const))(
    'judges %s as the table says',
    (_name, row) => {
      expect(outcomeOf(row.role, row.blocks)).toBe(row.outcome)
    },
  )
})

const ABSENT = '<absent>'
const GETTER = '<getter>'

const BASE_MESSAGE = {
  id: ID,
  role: 'compaction',
  blocks: [{ kind: 'text', id: 's1', visibility: { toHuman: true, toModel: true }, text: 's' }],
  ...COMPACTION_KEYS,
}

/** The accessor of a `<getter>` cell, and how often it has been called. */
interface Probe {
  calls: number
}

/** Applies the two markers of the message cell: a key is dropped, or becomes an accessor. */
function resolveMarkers(value: unknown, probe: Probe): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => resolveMarkers(item, probe))
  if (typeof value !== 'object' || value === null) return value
  const resolved: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === ABSENT) continue
    if (item === GETTER) {
      Object.defineProperty(resolved, key, {
        enumerable: true,
        get: () => {
          probe.calls += 1
          return 'e1'
        },
      })
    } else {
      resolved[key] = resolveMarkers(item, probe)
    }
  }
  return resolved
}

function admit(role: string, blocks: unknown[], extra: object = {}): Message {
  const judged = judgeMessage({ id: ID, role, blocks, ...extra })
  if (!('ok' in judged)) throw new Error(`fixture ${role} is refused: ${judged.rejected}`)
  return judged.ok
}

const SEEN = { toHuman: true, toModel: true }
const HIDDEN = { toHuman: false, toModel: false }

function textBlock(visibility = SEEN): object {
  return { kind: 'text', id: 'b1', visibility, text: 'x' }
}

/** The message that a shorthand of the context cell stands for. */
function shorthandMessage(shorthand: string): Message {
  const [kind = '', callId = ''] = shorthand.split(':')
  const call = { id: 'b1', callId, name: 'echo' }
  switch (kind) {
    case 'text':
      return admit('user', [textBlock()])
    case 'hidden':
      return admit('user', [textBlock(HIDDEN)])
    case 'internal':
      return admit('tool_internal', [textBlock()])
    case 'call':
      return admit('assistant', [
        { kind: 'tool_call', ...call, visibility: SEEN, arguments: { kind: 'null' } },
      ])
    case 'unparsed':
      return admit('assistant', [
        { kind: 'tool_call_unparsed', ...call, visibility: SEEN, raw: '{' },
      ])
    case 'incomplete':
      return admit('assistant', [
        { kind: 'tool_call_incomplete', ...call, visibility: HIDDEN, partial: '{' },
      ])
    case 'answer':
      return admit('tool', [
        { kind: 'tool_result', id: 'r1', visibility: SEEN, callId },
        { ...textBlock(), id: 'b2' },
      ])
    case 'compaction':
      return admit('compaction', [textBlock()], COMPACTION_KEYS)
    default:
      throw new Error(`unknown shorthand ${shorthand}`)
  }
}

function entryRef(raw: string): RecordEntryRef {
  const ref = parseRecordEntryRef(raw)
  if (ref === null) throw new Error('a reference in the table is empty')
  return ref
}

interface ContextCell {
  readonly covered: readonly (readonly [string, string | null])[]
  readonly after: readonly string[]
  readonly open: readonly string[]
}

function contextOf(cell: ContextCell): CompactionContext {
  const covered: CoveredEntry[] = cell.covered.map(([ref, shorthand]) => ({
    ref: entryRef(ref),
    message: shorthand === null ? null : shorthandMessage(shorthand),
  }))
  return {
    covered,
    after: cell.after.map(shorthandMessage),
    open: cell.open.map(entryRef),
  }
}

interface CompactionRow {
  readonly line: number
  readonly rule: string
  readonly polarity: string
  readonly patch: Record<string, unknown>
  readonly context: ContextCell | undefined
  readonly verdict: string
  readonly notes: readonly string[]
}

const NOTES = ['getter 未被调用', '成功值不变且已冻结']

function compactionRows(): readonly CompactionRow[] {
  return tableRows('## 压缩用例表', 5).map(({ line, cells }) => {
    const [rule, polarity, patch, context, outcome] = cells as [
      string,
      string,
      string,
      string,
      string,
    ]
    const [verdict = '', ...notes] = outcome.split(';').map(part => part.trim())
    for (const note of notes) if (!NOTES.includes(note)) throw new Error(`line ${line}: ${note}`)
    return {
      line,
      rule,
      polarity,
      patch: JSON.parse(patch) as Record<string, unknown>,
      context: context === '-' ? undefined : (JSON.parse(context) as ContextCell),
      verdict,
      notes,
    }
  })
}

/** What the function under test says: a message rejection, or a history rejection with its ref. */
function verdictOf(message: unknown, context: ContextCell | undefined): string {
  if (context === undefined) {
    const judged = judgeMessage(message)
    return 'ok' in judged ? 'ok' : `rejected:${judged.rejected}`
  }
  const judged = judgeCompaction(message, contextOf(context))
  if ('ok' in judged) return 'ok'
  return `rejected:${judged.rejected}${judged.ref === null ? '' : `@${judged.ref}`}`
}

const EXPECTED_COMPACTION_ROWS: Readonly<Record<string, number>> = {
  'compaction.keys/正': 1,
  'compaction.keys/反': 4,
  'compaction.order/反': 2,
  'compaction.covers/反': 4,
  'compaction.retained/反': 3,
  'compaction.derivation/反': 2,
  'compaction.copy/正': 1,
  'history.message/反': 1,
  'history.range/正': 1,
  'history.range/反': 5,
  'history.outside/反': 1,
  'history.order/反': 1,
  'history.not-model/反': 3,
  'history.pairing/正': 4,
  'history.pairing/反': 4,
  'history.open-work/正': 1,
  'history.open-work/反': 2,
  'history.repeat/正': 1,
  'history.first-failure/反': 1,
}

const compaction = compactionRows()

describe('the compaction table', () => {
  it('shows each rule on each side, with exactly the rows that are fixed here', () => {
    expect(countShown(compaction)).toEqual(EXPECTED_COMPACTION_ROWS)
  })

  it('has a refused row for every refusal and an ok row for every allowed example', () => {
    for (const row of compaction) {
      expect(row.polarity === POSITIVE, `line ${row.line}`).toBe(row.verdict === 'ok')
    }
  })

  it.each(compaction.map(row => [`line ${row.line} ${row.rule}/${row.polarity}`, row] as const))(
    'judges %s as the table says',
    (_name, row) => {
      const probe: Probe = { calls: 0 }
      const message = resolveMarkers({ ...BASE_MESSAGE, ...row.patch }, probe) as Record<
        string,
        unknown
      >
      expect(verdictOf(message, row.context)).toBe(row.verdict)
      if (row.notes.includes('getter 未被调用')) expect(probe.calls).toBe(0)
      if (row.notes.includes('成功值不变且已冻结')) expectCopy(message)
    },
  )
})

/** The success value keeps the three keys as they were, and no later change of the input reaches it. */
function expectCopy(message: Record<string, unknown>): void {
  const judged = judgeMessage(message)
  if (!('ok' in judged) || !isCompactionMessage(judged.ok)) {
    throw new Error('expected an admitted compaction message')
  }
  const { covers, retained, derivation } = judged.ok
  const before = structuredClone({ covers, retained, derivation })
  ;(message.retained as unknown[]).push('e9')
  ;(message.covers as Record<string, unknown>).to = 'e9'
  ;(message.derivation as Record<string, unknown>).digest = 'changed'
  expect({ covers, retained, derivation }).toEqual(before)
  for (const kept of [covers, retained, derivation]) expect(Object.isFrozen(kept)).toBe(true)
}
