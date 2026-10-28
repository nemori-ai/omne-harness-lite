// @module-tag slow
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GhCommand } from '../src/delivery/github-read.ts'
import type { TaskBinding, TaskBindingV2 } from '../src/delivery/binding.ts'
import type { Condition } from '../src/delivery/protocol.ts'
import { LINES_PATH } from '../src/delivery/lines.ts'
import { contextPath, parseContext } from '../src/integration/context.ts'
import { git } from '../src/integration/git.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { integrationFixture, type CardAttributeFields } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
/**
 * A line table for the fixture repository: its `runtime` track is the integration track, which
 * owns `apps`. `tools-line` owns `feature`, `model` owns `model`; neither has a line track.
 */
const lines = {
  schemaVersion: 1,
  integration: { track: 'runtime', paths: ['apps'] },
  shared: [],
  lines: [
    {
      id: 'tools-line',
      title: '工具',
      owner: 'human',
      track: null,
      paths: ['feature'],
      contracts: [],
    },
    { id: 'model', title: '模型', owner: 'human', track: null, paths: ['model'], contracts: [] },
  ],
}
const attributes: CardAttributeFields = {
  line: 'tools-line',
  nature: 'impl',
  contractChange: 'none',
}
const v2 = { line: 'tools-line', nature: 'impl', contractChange: 'none', milestone: 'M1' } as const
const board = {
  timeZone: 'UTC',
  events: {
    dispatched: ['dispatchedAt', 'line'],
    delivered: ['deliveredAt', 'status'],
    integrating: ['status'],
    accepted: ['acceptedAt', 'cycleDays', 'status'],
  },
}
type Platform = {
  labels?: string[]
  milestone?: { title: string } | null
  readbackChange?: object
}
function fixture({
  withLines = true,
  withBoard = false,
  version,
  card = attributes,
  binding: patch = {},
  conditions = [],
  platform = {
    labels: ['kind:feature', 'line:tools-line', 'nature:impl'],
    milestone: { title: 'M1' },
  },
}: {
  withLines?: boolean
  withBoard?: boolean
  version: 1 | 2
  card?: CardAttributeFields
  /** Fields that replace the fixture binding's fields, the v2 attributes included. */
  binding?: Record<string, unknown>
  conditions?: Condition[]
  platform?: Platform
}) {
  const f = integrationFixture({
    lines: withLines ? lines : null,
    ...(withBoard ? { board } : {}),
  })
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  const binding = (
    version === 1 ? { ...f.binding, ...patch } : { ...f.binding, schemaVersion: 2, ...v2, ...patch }
  ) as TaskBinding
  f.update(binding, conditions, 'open', card)
  const path = join(f.home, 'platform.json')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), ...platform }))
  f.authority(
    {
      schemaVersion: 1,
      responsible: 'human',
      basis: ['fixture explicit authorization'],
      action: 'dispatch',
      task: binding,
      confirmations: [],
    },
    1,
  )
  return { ...f, binding }
}
type Fixture = ReturnType<typeof fixture>
const command = (f: Fixture) => ({
  kind: 'start' as const,
  authority: f.binding.dispatch,
  issue: f.binding.issue.url,
  revision: 1,
  attempt: 'one',
})
async function start(f: Fixture, project?: GhCommand) {
  const reports: string[] = []
  const context = parseContext(
    await (
      await openIntegration({
        root: f.root,
        report: line => reports.push(line),
        ...(project === undefined ? {} : { board: { call: project, now: () => new Date() } }),
      })
    ).execute(command(f)),
  )
  return { context, reports: reports.map(line => JSON.parse(line)) }
}
/** Runs the integration CLI as the user does. */
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
  const stderr = result.stderr
    .trim()
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line))
  return { status: result.status, stdout: result.stdout, stderr }
}
function setPlatform(f: Fixture, platform: Platform) {
  const path = join(f.home, 'platform.json')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), ...platform }))
}
function expectedContext(f: Fixture) {
  return {
    schemaVersion: 1,
    targetBase: f.initial,
    tasks: [{ binding: f.binding, taskSource: f.main }],
    ownerTask: f.binding,
    operation: null,
  }
}
const integrationCard: CardAttributeFields = {
  line: 'integration',
  nature: 'integration',
  contractChange: 'none',
}
const integrationLabels = ['kind:feature', 'line:integration', 'nature:integration']

describe('start refuses a new context on attribute findings', () => {
  it('binds a v2 card and reports nothing when its attributes agree', async () => {
    const f = fixture({ version: 2 })
    const { context, reports } = await start(f)
    expect(context).toMatchObject(expectedContext(f))
    expect(JSON.parse(readFileSync(contextPath(f.root), 'utf8'))).toEqual(context)
    expect(reports).toEqual([])
  })

  // One card per refusing code; each card has that code as its only finding.
  it.each([
    [
      'attribute-missing',
      '契约变更',
      () => fixture({ version: 2, card: { ...attributes, contractChange: '' } }),
    ],
    [
      'attribute-invalid',
      '性质',
      () => fixture({ version: 2, card: { ...attributes, nature: 'feature' } }),
    ],
    [
      'attribute-binding-drift',
      'binding.nature',
      () => fixture({ version: 2, binding: { nature: 'contract' } }),
    ],
    [
      'nature-route-mismatch',
      'route.kind',
      () =>
        fixture({
          version: 2,
          card: { line: 'integration', nature: 'design', contractChange: 'none' },
          binding: { line: 'integration', nature: 'design' },
          platform: {
            labels: ['kind:feature', 'line:integration', 'nature:design'],
            milestone: { title: 'M1' },
          },
        }),
    ],
    [
      'scope-outside-line',
      'model',
      () => fixture({ version: 2, binding: { writeScope: ['model'] } }),
    ],
    [
      'scope-integration-path',
      'apps',
      () => fixture({ version: 2, binding: { writeScope: ['apps'] } }),
    ],
    [
      'condition-cross-line',
      '交付条件',
      () =>
        fixture({
          version: 2,
          card: { line: 'integration', nature: 'baseline', contractChange: 'none' },
          binding: {
            line: 'integration',
            nature: 'baseline',
            writeScope: ['tmp/issue-1'],
            conditions: ['C1'],
          },
          conditions: [
            {
              id: 'C1',
              kind: 'capability',
              target: 'fixture capability',
              phase: 'acceptance',
              predicate: 'available',
              evidence: 'human',
            },
          ],
          platform: {
            labels: ['kind:feature', 'line:integration', 'nature:baseline'],
            milestone: { title: 'M1' },
          },
        }),
    ],
    [
      'label-drift',
      'nature:',
      () =>
        fixture({
          version: 2,
          platform: { labels: ['kind:feature', 'line:tools-line'], milestone: { title: 'M1' } },
        }),
    ],
    ['binding-v1', 'binding', () => fixture({ version: 1 })],
  ])('refuses %s with its clause and remedy and writes no context', async (code, clause, make) => {
    const f = make()
    const error = await start(f).then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect(error).toMatchObject({ code: 'refused' })
    const message = (error as Error).message
    expect(message).toContain(`${code} [${clause}]`)
    expect(message.split('\n').filter(line => line.startsWith('- '))).toHaveLength(1)
    expect(message).toMatch(/改法：\S/)
    expect(existsSync(contextPath(f.root))).toBe(false)
  })

  it('lists every refusing finding, one line each with code, clause and remedy', async () => {
    const f = fixture({
      version: 2,
      binding: { writeScope: ['apps', 'model'] },
      platform: { labels: ['kind:feature', 'line:tools-line'], milestone: { title: 'M1' } },
    })
    await expect(start(f)).rejects.toMatchObject({ code: 'refused' })
    const message = await start(f).catch((error: Error) => error.message)
    const items = String(message)
      .split('\n')
      .filter(line => line.startsWith('- '))
    expect(items.map(line => line.split(' ')[1])).toEqual([
      'scope-integration-path',
      'scope-outside-line',
      'label-drift',
    ])
    for (const item of items) expect(item).toMatch(/^- \S+ \[[^\]]+\] .+ 改法：\S/)
  })

  it('writes no board field when it refuses', async () => {
    const f = fixture({
      version: 2,
      withBoard: true,
      platform: { labels: ['kind:feature', 'line:tools-line'], milestone: { title: 'M1' } },
    })
    const calls: string[][] = []
    const project: GhCommand = argv => {
      calls.push([...argv])
      throw new Error('the board must not be read or written')
    }
    await expect(start(f, project)).rejects.toMatchObject({ code: 'refused' })
    expect(calls).toEqual([])
    expect(existsSync(contextPath(f.root))).toBe(false)
  })

  it('exits 2 on the command line with the refusal on stderr and nothing on stdout', () => {
    const f = fixture({ version: 1 })
    const result = cli(f)
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toEqual([
      expect.objectContaining({ code: 'refused', message: expect.stringContaining('binding-v1') }),
    ])
    expect(existsSync(contextPath(f.root))).toBe(false)
  })
})

describe('start keeps report-only findings as reports', () => {
  it('starts after a carry and only reports the milestone drift', async () => {
    // The binding keeps the dispatch milestone M1; carry moved the Issue to M2.
    const f = fixture({
      version: 2,
      platform: {
        labels: ['kind:feature', 'line:tools-line', 'nature:impl'],
        milestone: { title: 'M2' },
      },
    })
    const { context, reports } = await start(f)
    expect(context).toMatchObject(expectedContext(f))
    expect(reports).toEqual([
      expect.objectContaining({
        severity: 'report',
        code: 'attribute-binding-drift',
        clause: 'binding.milestone',
        issue: f.binding.issue.url,
      }),
    ])
    expect(readFileSync(contextPath(f.root), 'utf8')).toBe(`${JSON.stringify(context, null, 2)}\n`)
  })

  it('starts a v1 card whose delivery line is integration and reports binding-v1', async () => {
    const f = fixture({
      version: 1,
      card: integrationCard,
      binding: { writeScope: ['apps'] },
      platform: { labels: integrationLabels, milestone: { title: 'M1' } },
    })
    const { context, reports } = await start(f)
    expect(context).toMatchObject(expectedContext(f))
    expect(reports.map(report => [report.code, report.clause])).toEqual([['binding-v1', 'binding']])
  })

  it('refuses a v1 card whose body has no valid delivery line', async () => {
    const f = fixture({
      version: 1,
      card: { ...integrationCard, line: 'unknown-line' },
      binding: { writeScope: ['apps'] },
      platform: { labels: integrationLabels, milestone: { title: 'M1' } },
    })
    await expect(start(f)).rejects.toMatchObject({
      code: 'refused',
      message: expect.stringContaining('binding-v1 [binding]'),
    })
    expect(existsSync(contextPath(f.root))).toBe(false)
  })

  it('only reports on a rerun in a tree that the same task already bound', () => {
    const f = fixture({ version: 2 })
    const first = cli(f)
    expect(first.status).toBe(0)
    expect(first.stderr).toEqual([])
    const bound = readFileSync(contextPath(f.root), 'utf8')
    // The labels drift after the context exists; a rerun keeps the context and only reports.
    setPlatform(f, { labels: ['kind:feature', 'line:tools-line'] })
    const rerun = cli(f)
    expect(rerun.status).toBe(0)
    expect(rerun.stdout).toBe(first.stdout)
    expect(readFileSync(contextPath(f.root), 'utf8')).toBe(bound)
    expect(rerun.stderr.map(report => [report.severity, report.code])).toEqual([
      ['report', 'label-drift'],
    ])
  })

  it('refuses a new context when the attribute rules cannot be read', async () => {
    const f = fixture({ version: 2, withLines: false })
    await expect(start(f)).rejects.toMatchObject({
      code: 'refused',
      message: expect.stringContaining('attribute-rules-unavailable'),
    })
    expect(existsSync(contextPath(f.root))).toBe(false)
  })

  it('refuses a new context when the committed line table is malformed', async () => {
    const f = fixture({ version: 2 })
    writeFileSync(join(f.root, LINES_PATH), '{"schemaVersion": 1}\n')
    git(f.root, ['commit', '-q', '-am', 'break the line table'])
    await expect(start(f)).rejects.toMatchObject({
      code: 'refused',
      message: expect.stringContaining('attribute-rules-unavailable'),
    })
    expect(existsSync(contextPath(f.root))).toBe(false)
  })

  it('only reports unavailable rules on a rerun in a tree the task already bound', async () => {
    const f = fixture({ version: 2 })
    const first = await start(f)
    const bound = readFileSync(contextPath(f.root), 'utf8')
    git(f.root, ['rm', '-q', LINES_PATH])
    git(f.root, ['commit', '-q', '-m', 'drop the line table'])
    const rerun = await start(f)
    expect(rerun.context).toEqual(first.context)
    expect(readFileSync(contextPath(f.root), 'utf8')).toBe(bound)
    expect(rerun.reports).toEqual([
      expect.objectContaining({ severity: 'report', code: 'attribute-rules-unavailable' }),
    ])
  })

  it('refuses like any Issue edit when the milestone changes between the two admission reads', async () => {
    // GitHub bumps updated_at with a milestone edit; the readback digest holds both.
    const f = fixture({
      version: 2,
      platform: {
        labels: ['kind:feature', 'line:tools-line', 'nature:impl'],
        milestone: { title: 'M1' },
        readbackChange: { milestone: { title: 'M2' }, updatedAt: '2026-10-12T00:00:00Z' },
      },
    })
    await expect(start(f)).rejects.toThrow('Task inputs changed during dispatch readback')
    expect(existsSync(contextPath(f.root))).toBe(false)
  })

  it.each([
    [['line:tools-line'], { title: 'M1' }, 'exactly one kind: label (found 0)'],
    [['kind:feature', 'kind:bug', 'line:tools-line'], { title: 'M1' }, 'kind: label (found 2)'],
    [['kind:feature'], { title: 'M1' }, 'exactly one line: label (found 0)'],
    [['kind:feature', 'line:tools-line'], null, 'a milestone'],
  ])(
    'refuses a card without its dispatch fields and writes no context',
    async (labels, milestone, gap) => {
      const f = fixture({ version: 2, platform: { labels, milestone } })
      await expect(start(f)).rejects.toMatchObject({
        code: 'refused',
        message: expect.stringContaining(gap),
      })
      expect(existsSync(contextPath(f.root))).toBe(false)
    },
  )

  it('keeps a failing report sink from changing the result', async () => {
    const f = fixture({
      version: 2,
      platform: {
        labels: ['kind:feature', 'line:tools-line', 'nature:impl'],
        milestone: { title: 'M2' },
      },
    })
    const context = await (
      await openIntegration({
        root: f.root,
        report: () => {
          throw new Error('closed stream')
        },
      })
    ).execute(command(f))
    expect(context).toMatchObject(expectedContext(f))
  })

  it('writes reports to stderr only; stdout and exit code are the command result', () => {
    const f = fixture({
      version: 2,
      platform: {
        labels: ['kind:feature', 'line:tools-line', 'nature:impl'],
        milestone: { title: 'M2' },
      },
    })
    const result = cli(f)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(contextPath(f.root), 'utf8')))
    expect(result.stderr.map(report => [report.severity, report.code, report.clause])).toEqual([
      ['report', 'attribute-binding-drift', 'binding.milestone'],
    ])
  })
})

it('keeps the v2 binding fields in the written context', async () => {
  const f = fixture({ version: 2 })
  await start(f)
  const written = JSON.parse(readFileSync(contextPath(f.root), 'utf8'))
  const owner: TaskBindingV2 = written.ownerTask
  expect(owner).toMatchObject({ schemaVersion: 2, line: 'tools-line', milestone: 'M1' })
  expect(written.schemaVersion).toBe(1)
})
