import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runProtocolCell, type Cell, type CellOutcome, type Verdict } from './cell.ts'
import { cells } from './cells.ts'
import { expectations, type Expectation } from './expectations.ts'

export const CELL_BUDGET_MS = 420_000

export type Row = CellOutcome &
  Readonly<{
    expected: Verdict
    matches: boolean
    mismatch: readonly string[]
  }>

export type MatrixSummary = Readonly<{ rows: readonly Row[]; mismatches: readonly Row[]; out: string; tookMs: number }>

export type MatrixOptions = Readonly<{
  only?: readonly string[]
  blocks?: readonly string[]
  out?: string
  print?: (line: string) => void
}>

function expectationOf(id: string): Expectation {
  const found = expectations[id]
  if (found === undefined) throw new Error(`no expectation for ${id}`)
  return found
}

function selected(cell: Cell, options: MatrixOptions): boolean {
  const only = options.only ?? []
  const blocks = options.blocks ?? []
  if (only.length > 0) return only.includes(cell.id)
  if (blocks.length > 0) return blocks.includes(cell.block)
  return true
}

async function outcomeOf(cell: Cell): Promise<CellOutcome> {
  const began = Date.now()
  if (cell.layer === 'page')
    return { id: cell.id, block: cell.block, layer: 'page', actual: 'not-run', checks: [], notes: [`page layer, probe ${cell.probe}`], tookMs: 0, stoppedUnits: [] }
  if ('untestable' in cell)
    return { id: cell.id, block: cell.block, layer: 'protocol', actual: 'untestable', checks: [], notes: [cell.untestable], tookMs: 0, stoppedUnits: [] }
  const outcome = await runProtocolCell(cell, CELL_BUDGET_MS)
  return { ...outcome, tookMs: Date.now() - began }
}

const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - [...text].length))

export async function runMatrix(options: MatrixOptions = {}): Promise<MatrixSummary> {
  const print = options.print ?? (() => {})
  const began = Date.now()
  const rows: Row[] = []
  print(`${pad('cell', 14)}${pad('layer', 10)}${pad('expected', 12)}${pad('actual', 12)}seconds  mismatch`)
  for (const cell of cells.filter(entry => selected(entry, options))) {
    const expectation = expectationOf(cell.id)
    const outcome = await outcomeOf(cell)
    const failing = outcome.checks.filter(check => !check.ok).map(check => `${check.name} (${check.detail})`)
    const counted = outcome.layer === 'protocol'
    const matches = !counted || outcome.actual === expectation.expected
    const mismatch = matches ? [] : outcome.actual === 'fail' ? failing : [`expected ${expectation.expected}${expectation.failsBecause === undefined ? '' : `: ${expectation.failsBecause}`}`]
    const row: Row = { ...outcome, expected: expectation.expected, matches, mismatch }
    rows.push(row)
    print(
      `${pad(cell.id, 14)}${pad(outcome.layer, 10)}${pad(expectation.expected, 12)}${pad(outcome.actual, 12)}${pad(String(Math.round(outcome.tookMs / 1000)), 9)}${mismatch.join(' | ').slice(0, 400)}`,
    )
    for (const note of outcome.notes.filter(text => text.startsWith('timeout'))) print(`${' '.repeat(14)}${note}`)
  }
  const out = options.out ?? join(tmpdir(), `matrix-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  mkdirSync(dirname(out), { recursive: true })
  const tookMs = Date.now() - began
  writeFileSync(out, `${JSON.stringify({ tookMs, rows }, null, 2)}\n`)
  const mismatches = rows.filter(row => !row.matches)
  const protocol = rows.filter(row => row.layer === 'protocol' && row.actual !== 'untestable')
  print(
    `protocol cells: ${String(protocol.filter(row => row.actual === 'pass').length)} pass, ${String(protocol.filter(row => row.actual === 'fail').length)} fail; mismatches ${String(mismatches.length)}; ${String(Math.round(tookMs / 1000))} s; ${out}`,
  )
  return { rows, mismatches, out, tookMs }
}
