import { expect, it, vi } from 'vitest'
import { stubPlugin } from '../../../src/cordis.ts'
import { defineRow } from '../../../src/row.ts'
import { runServe, type S0Record } from '../../../src/run.ts'

const root = process.platform === 'win32' ? 'C:/host-files' : '/host-files'
const config = { filesRoot: root, stateDirectory: `${root}/state` }
const probe = vi.fn()
const sentinel = defineRow({
  row: 'sentinel',
  implementation: 'real',
  lifecycle: { kind: 'none' },
  manifest: { provides: [], injects: [], sameProviderGroup: null },
  plugin: { apply: probe },
})

async function run(distribution: unknown, operator?: unknown) {
  probe.mockClear()
  const records: S0Record[] = []
  const errors: string[] = []
  const result = await runServe({
    distribution,
    ...(operator === undefined ? {} : { operator }),
    plugins: { sentinel, stubPlugin },
    entryObjects: [],
    readinessTimeoutMs: 20,
    shutdownDeadlineMs: 100,
    stateRoot: root,
    stop: AbortSignal.abort(),
    write: record => records.push(record),
    stderr: line => errors.push(line),
  })
  return { result, records, errors }
}

it('rejects an operator-inserted factory row before any plugin body runs', async () => {
  const outcome = await run(
    { rows: [{ id: 'sentinel', plugin: 'sentinel', config: {} }] },
    {
      ops: [
        {
          kind: 'insert',
          after: 'sentinel',
          row: { id: 'execution-host', plugin: 'executionHost', config },
        },
      ],
    },
  )
  expect(outcome.result.exitCode).toBe(2)
  expect(probe).not.toHaveBeenCalled()
  expect(outcome.errors.join('\n')).toContain('factory row cannot be inserted')
})

it('rejects a factory export on another distribution row before any plugin body runs', async () => {
  const outcome = await run({
    rows: [
      { id: 'sentinel', plugin: 'sentinel', config: {} },
      { id: 'other-host', plugin: 'executionHost', config },
    ],
  })
  expect(outcome.result.exitCode).toBe(2)
  expect(probe).not.toHaveBeenCalled()
  expect(outcome.errors.join('\n')).toContain('factory export requires row execution-host')
})

it('allows operator replacement of the distribution factory configuration', async () => {
  const outcome = await run(
    { rows: [{ id: 'execution-host', plugin: 'executionHost', config }] },
    {
      ops: [
        { kind: 'replace', id: 'execution-host', config: { ...config, maintainIntervalMs: 19 } },
      ],
    },
  )
  expect(outcome.result.exitCode).toBe(4)
  expect(outcome.records.find(record => record.kind === 'row-state')).toMatchObject({
    state: 'PENDING',
  })
  expect(outcome.result.appliedRows).toEqual([])
  expect(outcome.errors.join('\n')).not.toContain('unknown-plugin')
})

it('hands the output capacity of retained processes to the host plugin, and refuses one that is not a byte count', async () => {
  const row = (retainedOutputBytes: unknown) => ({
    rows: [
      {
        id: 'execution-host',
        plugin: 'executionHost',
        config: { ...config, retainedOutputBytes },
      },
    ],
  })
  const kept = await run(row(0))
  expect(kept.errors.join('\n')).not.toContain('invalid execution-host configuration')
  expect(kept.result.exitCode).toBe(4)
  for (const value of [-1, 1.5, 'all']) {
    const refused = await run(row(value))
    expect(refused.result.exitCode).toBe(2)
    expect(refused.errors.join('\n')).toContain('invalid execution-host configuration')
  }
})

it('rejects invalid host configuration without running preceding bodies or leaking input', async () => {
  const outcome = await run({
    rows: [
      { id: 'sentinel', plugin: 'sentinel', config: {} },
      {
        id: 'execution-host',
        plugin: 'executionHost',
        config: { ...config, maintainIntervalMs: 'secret-input' },
      },
    ],
  })
  expect(outcome.result.exitCode).toBe(2)
  expect(probe).not.toHaveBeenCalled()
  expect(outcome.errors.join('\n')).toContain('invalid execution-host configuration')
  expect(JSON.stringify(outcome)).not.toContain('secret-input')
})
