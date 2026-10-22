// @module-tag slow
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskBinding, TaskBindingV2 } from '../src/delivery/binding.ts'
import { contextPath, parseContext } from '../src/integration/context.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { integrationFixture, type CardAttributeFields } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
/** A line table for the fixture repository: its `runtime` track is the integration track. */
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
  ],
}
const attributes: CardAttributeFields = {
  line: 'tools-line',
  nature: 'impl',
  contractChange: 'none',
}
type Platform = { labels?: string[]; milestone?: { title: string } | null; readbackChange?: object }
function fixture({
  withLines = true,
  version,
  platform = { labels: ['line:tools-line', 'nature:impl'], milestone: { title: 'M1' } },
}: {
  withLines?: boolean
  version: 1 | 2
  platform?: Platform
}) {
  const f = integrationFixture(withLines ? { lines } : {})
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  const binding: TaskBinding =
    version === 1
      ? f.binding
      : {
          ...f.binding,
          schemaVersion: 2,
          line: 'tools-line',
          nature: 'impl',
          contractChange: 'none',
          milestone: 'M1',
        }
  f.update(binding, [], 'open', attributes)
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
async function start(f: Fixture) {
  const reports: string[] = []
  const context = parseContext(
    await (
      await openIntegration({ root: f.root, report: line => reports.push(line) })
    ).execute(command(f)),
  )
  return { context, reports: reports.map(line => JSON.parse(line)) }
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

describe('start attribute reports', () => {
  it('binds a v2 card and reports nothing when its attributes agree', async () => {
    const f = fixture({ version: 2 })
    const { context, reports } = await start(f)
    expect(context).toMatchObject(expectedContext(f))
    expect(JSON.parse(readFileSync(contextPath(f.root), 'utf8'))).toEqual(context)
    expect(reports).toEqual([])
  })

  it('reports v2 findings as report lines and keeps the context the same', async () => {
    const quiet = fixture({ version: 2 })
    const clean = await start(quiet)
    const f = fixture({ version: 2, platform: { labels: [], milestone: { title: 'M2' } } })
    const { context, reports } = await start(f)
    expect(reports).toEqual([
      expect.objectContaining({ severity: 'report', code: 'attribute-binding-drift' }),
      expect.objectContaining({ severity: 'report', code: 'label-drift', clause: 'line:' }),
      expect.objectContaining({ severity: 'report', code: 'label-drift', clause: 'nature:' }),
    ])
    for (const report of reports) expect(report.issue).toBe(f.binding.issue.url)
    expect(context).toMatchObject(expectedContext(f))
    expect(Object.keys(context)).toEqual(Object.keys(clean.context))
    expect(readFileSync(contextPath(f.root), 'utf8')).toBe(`${JSON.stringify(context, null, 2)}\n`)
  })

  it('warns that a v1 binding carries no attributes and binds it as before', async () => {
    const f = fixture({ version: 1 })
    const { context, reports } = await start(f)
    expect(context).toMatchObject(expectedContext(f))
    expect(context).toMatchObject({ ownerTask: f.binding, tasks: [{ binding: f.binding }] })
    expect(reports.map(report => report.code)).toEqual(['binding-v1'])
  })

  it('reports unavailable rules once and still starts', async () => {
    const f = fixture({ version: 2, withLines: false })
    const { context, reports } = await start(f)
    expect(context).toMatchObject(expectedContext(f))
    expect(reports).toEqual([
      expect.objectContaining({ severity: 'report', code: 'attribute-rules-unavailable' }),
    ])
  })

  it('does not refuse when only the milestone changes between the two admission reads', async () => {
    const f = fixture({
      version: 2,
      platform: {
        labels: ['line:tools-line', 'nature:impl'],
        milestone: { title: 'M1' },
        readbackChange: { milestone: { title: 'M2' } },
      },
    })
    const { context } = await start(f)
    expect(context).toMatchObject(expectedContext(f))
  })

  it('keeps a failing report sink from changing the result', async () => {
    const f = fixture({ version: 2, platform: { labels: [], milestone: { title: 'M1' } } })
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
    const f = fixture({ version: 2, platform: { labels: [], milestone: { title: 'M1' } } })
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
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(contextPath(f.root), 'utf8')))
    const reports = result.stderr
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(reports.map(report => [report.severity, report.code])).toEqual([
      ['report', 'label-drift'],
      ['report', 'label-drift'],
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
