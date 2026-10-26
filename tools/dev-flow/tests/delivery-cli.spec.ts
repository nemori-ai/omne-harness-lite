// @module-tag slow
// Slow: every case runs a delivery CLI as a child process, some with a `gh` stand-in on PATH.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
const cli = (name: string) => fileURLToPath(new URL(`../src/delivery/${name}`, import.meta.url))
function run(name: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', cli(name), ...args], {
    encoding: 'utf8',
    env,
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
const TOO_LARGE = '9007199254740993'

describe('issue number arguments', () => {
  it('board-cli refuses a card number beyond the safe integers with the usage error', () => {
    const result = run('board-cli.ts', ['integrating', '--issue', TOO_LARGE, '--dry-run'])
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({
      kind: 'board-error',
      message: expect.stringMatching(/^Usage: board-cli\.ts/),
    })
  })

  it('milestone-cli carry refuses a card number beyond the safe integers with the usage error', () => {
    const result = run('milestone-cli.ts', [
      'carry',
      '--from',
      'M1',
      '--to',
      'M2',
      '--reason',
      'r',
      TOO_LARGE,
    ])
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({
      kind: 'milestone-error',
      message: expect.stringMatching(/^Usage: milestone-cli\.ts/),
    })
  })
})

describe('board-cli write failure', () => {
  it('exits 2 and keeps the skipped writes in the stderr JSON', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-board-cli-')))
    homes.push(home)
    const bin = join(home, 'bin')
    mkdirSync(bin)
    const config = join(home, 'github-delivery.json')
    writeFileSync(
      config,
      JSON.stringify({
        schemaVersion: 2,
        kind: 'github-delivery-config',
        protocolVersion: 2,
        enabled: true,
        repository: 'owner/repo',
        mode: 'manual-single-dispatcher',
        project: {
          owner: 'owner',
          number: 1,
          id: 'P_1',
          url: 'https://github.com/orgs/owner/projects/1',
          fields: {
            stage: 'F_stage',
            priority: null,
            iteration: null,
            line: 'F_line',
            dispatchedAt: 'F_disp',
          },
          options: { stage: {}, line: { model: 'o_model' } },
        },
        creationHandoffIssue: null,
        writers: { stage: 'human', body: 'human' },
        board: { timeZone: 'UTC', events: { dispatched: ['dispatchedAt', 'line'] } },
      }),
    )
    // The card has no binding and no line attribute, so Line is skipped; the mutation fails.
    writeFileSync(
      join(bin, 'gh'),
      String.raw`#!/usr/bin/env node
const args = process.argv.slice(2)
const query = (args.find(a => a.startsWith('query=')) || '').slice(6)
let result
if (args[1] === '--method' && args.at(-1) === 'repos/owner/repo/issues/7')
  result = { number: 7, node_id: 'I_7', html_url: 'https://github.com/owner/repo/issues/7', body: '', labels: [], milestone: null }
else if (query.startsWith('mutation')) {
  process.stderr.write('secret API body')
  process.exit(1)
} else if (query.includes('projectItems('))
  result = { data: { node: { id: 'I_7', url: 'https://github.com/owner/repo/issues/7', projectItems: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'ITEM_7', project: { id: 'P_1' } }] } } } }
else if (query.includes('... on ProjectV2Item{'))
  result = { data: { node: { id: 'ITEM_7', project: { id: 'P_1' }, fieldValues: { pageInfo: { hasNextPage: false }, nodes: [] } } } }
else process.exit(94)
process.stdout.write(JSON.stringify(result))
`,
    )
    chmodSync(join(bin, 'gh'), 0o755)
    const result = run('board-cli.ts', ['dispatched', '--issue', '7', '--config', config], {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
    })
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toEqual({
      kind: 'board-error',
      message:
        'Board write 1 of 1 (dispatchedAt) failed. Earlier writes stay applied. API output omitted.',
      skipped: [{ name: 'line', reason: 'The card has no delivery line' }],
    })
    expect(result.stderr).not.toContain('secret API body')
  })
})
