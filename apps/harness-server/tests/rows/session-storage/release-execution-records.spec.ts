// @module-tag slow
// The Agent records of a session after its Runs: a settled execution leaves its tombstone and its
// operation records, and the next writer generation keeps only the current executions.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import {
  historyOf,
  likeARealModel,
  onReleaseTree,
  onReleaseTreeRuns,
  pollUntil,
  sqliteFiles,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  endedRuns,
  perMessageShell,
  sendInput,
  setShell,
} from '../authorization/release-flow-support.ts'

const TABLES = [
  'er_execution',
  'er_operation',
  'er_fact',
  'er_item',
  'er_item_content',
  'er_preadmission',
] as const
type Table = (typeof TABLES)[number]
type Reading = Readonly<Record<Table, Readonly<{ rows: number; bytes: number }>>> &
  Readonly<{ unsettled: number }>

const cellBytes = (cell: unknown): number =>
  cell instanceof Uint8Array
    ? cell.byteLength
    : typeof cell === 'string'
      ? Buffer.byteLength(cell)
      : cell === null
        ? 0
        : 8

function records(tree: ReleaseTree): Reading {
  const totals = Object.fromEntries(TABLES.map(table => [table, { rows: 0, bytes: 0 }])) as Record<
    Table,
    { rows: number; bytes: number }
  >
  let unsettled = 0
  for (const file of sqliteFiles(tree.storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const held = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'er_execution'")
        .get()
      if (held === undefined) continue
      for (const table of TABLES)
        for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
          totals[table].rows += 1
          totals[table].bytes += Object.values(row).reduce<number>(
            (sum, cell) => sum + cellBytes(cell),
            0,
          )
        }
      const open = db.prepare('SELECT COUNT(*) AS n FROM er_execution WHERE settled IS NULL').get()
      unsettled += Number(open?.['n'] ?? 0)
    } finally {
      db.close()
    }
  }
  return { ...totals, unsettled }
}

const total = (reading: Reading): number =>
  TABLES.reduce((sum, table) => sum + reading[table].bytes, 0)

const settledAll = (tree: ReleaseTree, executions: number) =>
  pollUntil(
    `${String(executions)} executions to settle`,
    async () => records(tree),
    reading => reading.er_execution.rows === executions && reading.unsettled === 0,
  )

it(
  'three Runs with a tool call leave only tombstones and operation records, and the next generation keeps only the current execution',
  { timeout: 300_000 },
  async () => {
    let session = ''
    const readings: Record<string, Reading> = {}
    await onReleaseTreeRuns({ script: perMessageShell }, [
      async tree => {
        await setShell(tree, 'auto', 'set-shell-auto')
        session = await tree.startSession('start: echo one')
        await endedRuns(tree, session, 1)
        readings['1 Run'] = await settledAll(tree, 1)
        await sendInput(tree, session, 'start: echo two')
        await endedRuns(tree, session, 2)
        await sendInput(tree, session, 'start: echo three')
        const entries = await endedRuns(tree, session, 3)
        readings['3 Runs'] = await settledAll(tree, 3)
        expect(toolResults(entries).join('\n')).toContain('three-done')
      },
      async tree => {
        await sendInput(tree, session, 'start: echo four')
        const entries = await endedRuns(tree, session, 4)
        readings['after the restart, Run 4'] = await settledAll(tree, 1)
        expect(toolResults(entries).join('\n')).toContain('four-done')
      },
    ])
    console.log(`EXECUTION-RECORDS ${JSON.stringify(readings)}`)
    const one = readings['1 Run']!
    const three = readings['3 Runs']!
    const restarted = readings['after the restart, Run 4']!
    for (const reading of [one, three, restarted])
      for (const table of ['er_fact', 'er_item', 'er_item_content', 'er_preadmission'] as const)
        expect(reading[table].rows, table).toBe(0)
    expect(three.er_execution.rows).toBe(3)
    expect(total(three)).toBeLessThanOrEqual(3 * total(one) + 1024)
    expect(restarted.er_execution.rows).toBe(1)
    expect(restarted.er_operation.rows).toBeLessThanOrEqual(2 * one.er_operation.rows)
  },
)

const sessionEntries = (tree: ReleaseTree, kind: string): number => {
  let rows = 0
  for (const file of sqliteFiles(tree.storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const held = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sl_entry'")
        .get()
      if (held === undefined) continue
      rows += Number(
        db.prepare('SELECT COUNT(*) AS n FROM sl_entry WHERE kind = ?').get(kind)?.['n'] ?? 0,
      )
    } finally {
      db.close()
    }
  }
  return rows
}

it(
  'a background call keeps its ended execution unsettled; its late outcome reaches the session log in full, and the execution then settles',
  { timeout: 240_000 },
  async () => {
    const OPENING = 'start: a long command in the background'
    const command = JSON.stringify({
      command: 'execute',
      intent: 'test call',
      params: {
        script: 'while [ ! -f go-late ]; do sleep 0.1; done; echo late-done',
        run_in_background: true,
      },
    })
    const asked = { ownReply: 0 }
    const script = likeARealModel(
      toolCallsByRequest(body =>
        body.includes(OPENING) && !body.includes('"role":"tool"')
          ? [{ id: 'call_late', tool: 'Shell', arguments: command }]
          : [],
      ),
      asked,
    )
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        const session = await tree.startSession(OPENING)
        await pollUntil(
          'the first Run to end',
          () => historyOf(tree, session),
          entries => entries.some(entry => entry.kind === 'run.terminal'),
        )
        await new Promise(resolve => setTimeout(resolve, 1000))
        const held = records(tree)
        expect(held.unsettled).toBe(1)
        expect(held.er_fact.rows).toBeGreaterThan(0)
        expect(sessionEntries(tree, 'call.background-settled')).toBe(0)

        writeFileSync(join(dirname(tree.storageRoot), 'workspace', 'go-late'), '')
        const entries = await pollUntil(
          'the late outcome to reach the session log',
          () => historyOf(tree, session),
          found =>
            found.some(
              entry =>
                entry.kind === 'message.system_reminder' &&
                JSON.stringify(entry.payload).includes('late-done'),
            ),
        )
        expect(sessionEntries(tree, 'call.background-settled')).toBe(1)
        expect(entries.filter(entry => entry.kind === 'run.terminal').length).toBeGreaterThan(0)
        const woken = await pollUntil(
          'the Run the late outcome wakes to end',
          () => historyOf(tree, session),
          found => found.filter(entry => entry.kind === 'run.terminal').length >= 2,
        )
        expect(woken.filter(entry => entry.kind === 'run.terminal')).toHaveLength(2)
        const reading = await pollUntil(
          'every execution to settle',
          async () => records(tree),
          value => value.unsettled === 0 && value.er_execution.rows >= 1,
        )
        for (const table of ['er_fact', 'er_item', 'er_item_content', 'er_preadmission'] as const)
          expect(reading[table].rows, table).toBe(0)
        expect(asked.ownReply).toBe(0)
      },
    )
    expect(exitCode).toBe(0)
  },
)
