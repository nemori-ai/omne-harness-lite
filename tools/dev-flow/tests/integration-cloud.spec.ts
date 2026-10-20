// @module-tag slow
// Drives the real engine with temporary Git repositories and a `gh` double on PATH.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { integrationFixture } from './fixtures/integration.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { contextPath } from '../src/integration/context.ts'
import { FACTS_CLOCK_SKEW_MS } from '../src/integration/delivery-facts.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
const DISPATCHES = 'repos/owner/repo/actions/workflows/delivery-facts.yml/dispatches'
/**
 * A card in the cloud: the platform double denies every GraphQL request, environments and orgs,
 * and answers the delivery-facts workflow with one bot comment. `platform` edits the double.
 */
function cloud(
  platform: Record<string, unknown> = {},
  env: Record<string, string> = { OMNE_DELIVERY_FACTS: 'workflow' },
) {
  const f = integrationFixture({ admissionOnly: true })
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
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
  const path = join(f.home, 'platform.json'),
    p = JSON.parse(readFileSync(path, 'utf8'))
  writeFileSync(path, JSON.stringify({ ...p, cloud: true, facts: {}, ...platform }))
  const calls = (): string[][] =>
    existsSync(f.calls)
      ? readFileSync(f.calls, 'utf8')
          .trim()
          .split('\n')
          .filter(line => line !== '')
          .map(line => JSON.parse(line))
      : []
  const execute = async (kind: 'start' | 'register' = 'start') =>
    (await openIntegration({ root: f.root })).execute({
      kind,
      authority: f.binding.dispatch,
      issue: f.binding.issue.url,
      revision: 1,
      attempt: 'one',
    })
  return { ...f, calls, execute }
}

describe('cloud start through the delivery-facts workflow', () => {
  it.each(['start', 'register'] as const)(
    '%s dispatches once, adopts the facts and writes context without forbidden reads',
    async kind => {
      const f = cloud()
      const context = await f.execute(kind)
      expect(context).toMatchObject({ ownerTask: f.binding, targetBase: f.initial })
      expect(JSON.parse(readFileSync(contextPath(f.root), 'utf8'))).toEqual(context)
      const calls = f.calls()
      const dispatches = calls.filter(call => call.at(-1) === DISPATCHES)
      expect(dispatches).toHaveLength(1)
      expect(dispatches[0]?.slice(0, 3)).toEqual(['api', '--method', 'POST'])
      expect(dispatches[0]).toContain('ref=github-gate')
      expect(dispatches[0]).toContain('inputs[issue]=1')
      expect(dispatches[0]).toContain(`inputs[authority]=${f.binding.dispatch}`)
      expect(dispatches[0]?.find(arg => arg.startsWith('inputs[nonce]='))).toMatch(
        /^inputs\[nonce\]=[0-9a-f]{32}$/,
      )
      // Dispatch, comments and the run come before the first admission capture; both captures
      // follow and use the adopted Project facts.
      const firstCapture = calls.findIndex(call => call.at(-1) === 'repos/owner/repo/issues/1')
      expect(calls.findIndex(call => call.at(-1) === DISPATCHES)).toBeLessThan(firstCapture)
      expect(
        calls.findIndex(call => call.at(-1) === 'repos/owner/repo/actions/runs/42'),
      ).toBeLessThan(firstCapture)
      expect(calls.filter(call => call.at(-1) === 'repos/owner/repo/actions/runs/42')).toHaveLength(
        1,
      )
      expect(calls.filter(call => call.at(-1) === 'repos/owner/repo/issues/1')).toHaveLength(2)
      expect(calls.filter(call => call[1] === 'graphql')).toEqual([])
      expect(calls.some(call => /environments\/|^orgs\//.test(call.at(-1) ?? ''))).toBe(false)
      expect(calls.filter(call => call[2] === 'POST')).toEqual(dispatches)
    },
  )
  it('detects the cloud from CCR_AGENT_PROXY_ENABLED=1', async () => {
    const f = cloud({}, { CCR_AGENT_PROXY_ENABLED: '1' })
    await expect(f.execute()).resolves.toMatchObject({ ownerTask: f.binding })
    expect(f.calls().filter(call => call.at(-1) === DISPATCHES)).toHaveLength(1)
  })
  it('keeps the direct path when OMNE_DELIVERY_FACTS=direct overrides the cloud detection', async () => {
    const f = cloud(
      { cloud: false, facts: null },
      { CCR_AGENT_PROXY_ENABLED: '1', OMNE_DELIVERY_FACTS: 'direct' },
    )
    await expect(f.execute()).resolves.toMatchObject({ ownerTask: f.binding })
    const calls = f.calls()
    expect(calls.some(call => call.at(-1) === DISPATCHES)).toBe(false)
    expect(calls.some(call => call.at(-1) === 'repos/owner/repo/environments/publish')).toBe(true)
    expect(calls.some(call => call.some(arg => arg.includes('projectItems(')))).toBe(true)
  })
  it('refuses an unsupported OMNE_DELIVERY_FACTS value before any platform read', async () => {
    const f = cloud({}, { OMNE_DELIVERY_FACTS: 'proxy' })
    await expect(f.execute()).rejects.toMatchObject({
      code: 'input-error',
      message: expect.stringContaining('OMNE_DELIVERY_FACTS'),
    })
    expect(f.calls()).toEqual([])
    expect(existsSync(contextPath(f.root))).toBe(false)
  })
  it.each<[string, Record<string, unknown>, string, string]>([
    [
      'a non-reviewer author',
      { facts: { block: { authority: { reviewer: false } } } },
      'refused',
      'not show the author as a publish reviewer',
    ],
    [
      'facts about another author',
      { facts: { block: { authority: { author: 'impostor' } } } },
      'unknown',
      'author mismatch',
    ],
    [
      'facts about another node ID',
      { facts: { block: { authority: { authorNodeId: 'U_impostor' } } } },
      'unknown',
      'author mismatch',
    ],
    [
      'facts about an edited body',
      { facts: { block: { authority: { bodySha256: 'c'.repeat(64) } } } },
      'unknown',
      'body digest mismatch',
    ],
    [
      'facts with another update time',
      { facts: { block: { authority: { updatedAt: '2026-10-12T00:00:00Z' } } } },
      'unknown',
      'update time mismatch',
    ],
    [
      'facts for another Project',
      { facts: { block: { project: { id: 'P_2' } } } },
      'unknown',
      'Project mismatch',
    ],
    ['facts for another Issue', { facts: { block: { issue: 2 } } }, 'unknown', 'Issue mismatch'],
    [
      'a comment from another login',
      { facts: { login: 'human' } },
      'unknown',
      'not the delivery identity',
    ],
    ['a comment whose type is not Bot', { facts: { type: 'User' } }, 'unknown', 'not a Bot'],
    [
      'an edited facts comment',
      { facts: { updatedAt: '2026-10-12T00:00:00Z' } },
      'unknown',
      'was edited',
    ],
    ['a failed run', { run: { conclusion: 'failure' } }, 'unknown', 'did not succeed'],
    [
      'a run from another workflow',
      { run: { path: '.github/workflows/gate-publish.yml' } },
      'unknown',
      'run path mismatch',
    ],
    ['a run on main', { run: { head_branch: 'main' } }, 'unknown', 'run branch mismatch'],
    ['a push run', { run: { event: 'push' } }, 'unknown', 'run event mismatch'],
    [
      'a run created before the dispatch beyond the tolerance',
      { runCreatedBeforeMs: FACTS_CLOCK_SKEW_MS + 60_000 },
      'unknown',
      'predates this dispatch',
    ],
  ])('refuses %s and writes no context', async (_, platform, code, message) => {
    const f = cloud(platform)
    await expect(f.execute()).rejects.toMatchObject({
      code,
      message: expect.stringContaining(message),
    })
    expect(existsSync(contextPath(f.root))).toBe(false)
    const calls = f.calls()
    expect(calls.some(call => call[1] === 'graphql')).toBe(false)
    expect(calls.some(call => /environments\/|^orgs\//.test(call.at(-1) ?? ''))).toBe(false)
  })
})
