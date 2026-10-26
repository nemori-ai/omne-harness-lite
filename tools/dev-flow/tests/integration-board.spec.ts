// @module-tag slow
// Slow: every case builds a real Git worktree with a bare remote and drives start through a
// `gh` stand-in process; two cases also run the CLI as a child process.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { contextPath, parseContext } from '../src/integration/context.ts'
import { openIntegration, type BoardEffects } from '../src/integration/engine.ts'
import { integrationFixture } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
const board = (dispatched: unknown = ['dispatchedAt', 'line'], timeZone = 'UTC') => ({
  timeZone,
  events: {
    dispatched,
    delivered: ['deliveredAt', 'status'],
    integrating: ['status'],
    accepted: ['acceptedAt', 'cycleDays', 'status'],
  },
})
function fixture(config: unknown, options: { cloud?: boolean } = {}) {
  const f = integrationFixture({ board: config, admissionOnly: options.cloud ?? false })
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  f.update(f.binding, [], 'open', {
    line: 'integration',
    nature: 'integration',
    contractChange: 'none',
  })
  f.authority(
    {
      schemaVersion: 1,
      responsible: 'human',
      basis: ['fixture explicit authorization'],
      action: 'dispatch',
      task: f.binding,
      confirmations: [],
    },
    1,
  )
  if (options.cloud === true) {
    vi.stubEnv('OMNE_DELIVERY_FACTS', 'workflow')
    const path = join(f.home, 'platform.json')
    writeFileSync(
      path,
      JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), cloud: true, facts: {} }),
    )
  }
  return f
}
type Fixture = ReturnType<typeof fixture>
const command = (f: Fixture) => ({
  kind: 'start' as const,
  authority: f.binding.dispatch,
  issue: f.binding.issue.url,
  revision: 1,
  attempt: 'one',
})
async function start(f: Fixture, effects?: BoardEffects) {
  const reports: string[] = []
  const engine = await openIntegration({
    root: f.root,
    report: line => reports.push(line),
    ...(effects === undefined ? {} : { board: effects }),
  })
  const context = parseContext(await engine.execute(command(f)))
  return {
    context,
    board: reports
      .map(line => JSON.parse(line))
      .filter(report => String(report.code).startsWith('board-')),
  }
}
/** Runs the integration CLI as the user does; returns exit status, stdout and board lines. */
function cli(f: Fixture) {
  const input = join(f.home, 'command.json')
  writeFileSync(input, JSON.stringify(command(f)))
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      fileURLToPath(new URL('../src/integration/cli.ts', import.meta.url)),
      'execute',
      '--root',
      f.root,
      '--input',
      input,
    ],
    { encoding: 'utf8', env: process.env },
  )
  return {
    status: result.status,
    stdout: result.stdout,
    board: result.stderr
      .trim()
      .split('\n')
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line))
      .filter(report => String(report.code).startsWith('board-')),
  }
}
const ghMutations = (f: Fixture) =>
  existsSync(f.calls)
    ? readFileSync(f.calls, 'utf8')
        .trim()
        .split('\n')
        .filter(line => line.includes('query=mutation'))
    : []
/** An injected Project for issue 1: one item whose field values the writes update. */
function project(values: Record<string, string> = {}) {
  const state = new Map(Object.entries(values)),
    calls: string[][] = []
  const arg = (argv: readonly string[], key: string) =>
    argv.find(item => item.startsWith(`${key}=`))?.slice(key.length + 1)
  const call: GhCommand = argv => {
    calls.push([...argv])
    const query = arg(argv, 'query') ?? ''
    if (query.startsWith('mutation')) {
      state.set(
        arg(argv, 'field') ?? '',
        arg(argv, 'value[date]') ?? arg(argv, 'value[singleSelectOptionId]') ?? '',
      )
      return { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM_1' } } } }
    }
    if (query.includes('projectItems('))
      return {
        data: {
          node: {
            id: 'I_1',
            url: 'https://github.com/owner/repo/issues/1',
            projectItems: {
              pageInfo: { hasNextPage: false },
              nodes: [{ id: 'ITEM_1', project: { id: 'P_1' } }],
            },
          },
        },
      }
    return {
      data: {
        node: {
          id: 'ITEM_1',
          project: { id: 'P_1' },
          fieldValues: {
            pageInfo: { hasNextPage: false },
            nodes: [...state].map(([id, value]) =>
              id === 'F_line'
                ? {
                    __typename: 'ProjectV2ItemFieldSingleSelectValue',
                    optionId: value,
                    field: { id },
                  }
                : { __typename: 'ProjectV2ItemFieldDateValue', date: value, field: { id } },
            ),
          },
        },
      },
    }
  }
  const effects: BoardEffects = { call, now: () => new Date('2026-10-26T08:00:00Z') }
  return { effects, calls, state }
}

describe('start board write', () => {
  it('writes Dispatched at and Line through the injected Project on a new context', async () => {
    const f = fixture(board()),
      p = project()
    const { board: reports } = await start(f, p.effects)
    expect(reports).toEqual([])
    expect([...p.state]).toEqual([
      ['F_disp', '2026-10-26'],
      ['F_line', 'd'],
    ])
  })

  it('keeps an existing Dispatched at when the same attempt starts in a new tree', async () => {
    const f = fixture(board()),
      p = project({ F_disp: '2026-10-20' })
    const { board: reports } = await start(f, p.effects)
    expect(reports.map(report => report.message)).toEqual([
      'dispatchedAt: Dispatched at is already 2026-10-20',
    ])
    expect(p.state.get('F_disp')).toBe('2026-10-20')
  })

  it('does not write again when start returns the existing context', async () => {
    const f = fixture(board()),
      p = project()
    await start(f, p.effects)
    const writes = p.calls.length
    expect((await start(f, p.effects)).board).toEqual([])
    expect(p.calls).toHaveLength(writes)
  })

  it('sends no Project request in a cloud session and reports one skip line', async () => {
    const f = fixture(board(), { cloud: true }),
      p = project()
    const { context, board: reports } = await start(f, p.effects)
    expect(context.ownerTask).toEqual(f.binding)
    expect(reports).toEqual([
      {
        severity: 'report',
        issue: f.binding.issue.url,
        code: 'board-skipped',
        message: expect.stringContaining('cloud session'),
      },
    ])
    expect(p.calls).toEqual([])
  })
})

describe('start board write through the CLI', () => {
  it('keeps stdout and exit code when the Project rejects the write', () => {
    // The gh stand-in exits non-zero on every GraphQL mutation.
    const f = fixture(board())
    const result = cli(f)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(contextPath(f.root), 'utf8')))
    expect(result.board).toEqual([
      expect.objectContaining({
        code: 'board-write-failed',
        message: expect.stringMatching(/^Board write 1 of 2 \(dispatchedAt\) failed/),
      }),
    ])
    expect(ghMutations(f)).toHaveLength(1)
  })

  it('keeps stdout and exit code when the board entry is unusable', () => {
    const f = fixture(board(undefined, 'Mars/Base'))
    const result = cli(f)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).ownerTask).toEqual(f.binding)
    expect(result.board.map(report => report.code)).toEqual(['board-write-failed'])
    expect(ghMutations(f)).toEqual([])
  })

  it('keeps stdout and exit code and stays silent when dispatch writes are disabled', () => {
    const f = fixture(board([]))
    const result = cli(f)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).ownerTask).toEqual(f.binding)
    expect(result.board).toEqual([])
    expect(ghMutations(f)).toEqual([])
  })

  it('refuses the start when the board entry is malformed, like any delivery config field', async () => {
    const f = fixture(board('x'))
    await expect((await openIntegration({ root: f.root })).execute(command(f))).rejects.toThrow(
      'config.board.events.dispatched must be an array',
    )
    expect(existsSync(contextPath(f.root))).toBe(false)
  })
})
