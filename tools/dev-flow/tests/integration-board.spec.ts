// @module-tag slow
// Slow: every case builds a real Git worktree with a bare remote and drives start through a
// `gh` stand-in process.
import { readFileSync, rmSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contextPath, parseContext } from '../src/integration/context.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { integrationFixture } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
const board = (dispatched: string[] = ['dispatchedAt', 'line'], timeZone = 'UTC') => ({
  timeZone,
  events: {
    dispatched,
    delivered: ['deliveredAt', 'status'],
    integrating: ['status'],
    accepted: ['acceptedAt', 'cycleDays', 'status'],
  },
})
function fixture(config: unknown) {
  const f = integrationFixture({ board: config })
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  f.update(f.binding)
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
  return f
}
async function start(f: ReturnType<typeof fixture>) {
  const reports: string[] = []
  const engine = await openIntegration({ root: f.root, report: line => reports.push(line) })
  const context = parseContext(
    await engine.execute({
      kind: 'start',
      authority: f.binding.dispatch,
      issue: f.binding.issue.url,
      revision: 1,
      attempt: 'one',
    }),
  )
  return {
    context,
    board: reports
      .map(line => JSON.parse(line))
      .filter(report => String(report.code).startsWith('board-')),
  }
}
const mutations = (f: ReturnType<typeof fixture>) =>
  readFileSync(`${f.home}/calls.jsonl`, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.includes('query=mutation'))

describe('start board write', () => {
  it('keeps the start result when the Project rejects the write and reports one line', async () => {
    // The gh stand-in exits non-zero on every GraphQL mutation.
    const f = fixture(board())
    const { context, board: reports } = await start(f)
    expect(context.ownerTask).toEqual(f.binding)
    expect(JSON.parse(readFileSync(contextPath(f.root), 'utf8'))).toEqual(context)
    expect(reports).toEqual([
      {
        severity: 'report',
        issue: f.binding.issue.url,
        code: 'board-write-failed',
        // The fixture card has no line attribute, so Line is skipped and one write remains.
        message: expect.stringMatching(/^Board write 1 of 1 \(dispatchedAt\) failed/),
      },
    ])
    expect(mutations(f)).toHaveLength(1)
  })

  it('does not write again when start returns the existing context', async () => {
    const f = fixture(board())
    await start(f)
    const again = await start(f)
    expect(again.board).toEqual([])
    expect(mutations(f)).toHaveLength(1)
  })

  it('stays silent and sends nothing when the board entry disables dispatch writes', async () => {
    const f = fixture(board([]))
    expect((await start(f)).board).toEqual([])
    expect(mutations(f)).toEqual([])
  })

  it('reports an unusable board entry without refusing the start', async () => {
    const f = fixture(board(undefined, 'Mars/Base'))
    const { context, board: reports } = await start(f)
    expect(context.ownerTask).toEqual(f.binding)
    expect(reports.map(report => report.code)).toEqual(['board-write-failed'])
    expect(mutations(f)).toEqual([])
  })
})
