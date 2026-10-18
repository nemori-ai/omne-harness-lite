import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'

/**
 * The example table in docs/public-api.md is the rule list of the tool parts and the role rules.
 * This file runs every row, and it also fixes which rules and which polarities the table has to
 * show, so a table that lost a row or changed an outcome fails here.
 */
const ID = 'msg_abcdefghijklmnopqrstuv'

interface Row {
  readonly line: number
  readonly rule: string
  readonly polarity: string
  readonly role: string
  readonly blocks: unknown
  readonly outcome: string
}

const POSITIVE = '正'

function table(): readonly Row[] {
  const doc = readFileSync(new URL('../docs/public-api.md', import.meta.url), 'utf8')
  const lines = doc.split('\n')
  const start = lines.findIndex(line => line.trim() === '## 示例表')
  if (start < 0) throw new Error('the example table heading is missing')
  const rows: Row[] = []
  for (let at = start + 1; at < lines.length; at += 1) {
    const line = lines[at] ?? ''
    if (line.startsWith('## ')) break
    if (!line.startsWith('|') || /^\|[\s:-]+\|/u.test(line)) continue
    const cells = line
      .slice(1, line.lastIndexOf('|'))
      .split('|')
      .map(cell => cell.trim().replace(/^`|`$/gu, ''))
    if (cells.length !== 5) throw new Error(`line ${at + 1}: a row has five cells`)
    const [rule, polarity, role, blocks, outcome] = cells as [
      string,
      string,
      string,
      string,
      string,
    ]
    if (rule === '规则') continue
    rows.push({ line: at + 1, rule, polarity, role, blocks: JSON.parse(blocks), outcome })
  }
  return rows
}

function outcomeOf(role: string, blocks: unknown): string {
  const judged = judgeMessage({ id: ID, role, blocks })
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

const rows = table()

describe('the example table', () => {
  it('shows each rule on each side, with exactly the rows that are fixed here', () => {
    const shown: Record<string, number> = {}
    for (const row of rows) {
      const key = `${row.rule}/${row.polarity}`
      shown[key] = (shown[key] ?? 0) + 1
    }
    expect(shown).toEqual(EXPECTED_ROWS)
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
