// @module-tag slow
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { integrationFixture } from './fixtures/integration.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { contextPath } from '../src/integration/context.ts'
import { git, repository } from '../src/integration/git.ts'
import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
const homes: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function fixture(admissionOnly = false) {
  const f = integrationFixture({ admissionOnly })
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  return f
}
const common = {
  schemaVersion: 1,
  responsible: 'human',
  basis: ['fixture explicit authorization'],
} as const
async function start(f: ReturnType<typeof fixture>) {
  f.authority(
    { ...common, basis: [...common.basis], action: 'dispatch', task: f.binding, confirmations: [] },
    1,
  )
  await (
    await openIntegration({ root: f.root })
  ).execute({
    kind: 'start',
    authority: f.binding.dispatch,
    issue: f.binding.issue.url,
    revision: 1,
    attempt: 'one',
  })
}
it.each(['start', 'register'] as const)(
  'admits %s without repository Issues or Project item enumeration',
  async kind => {
    const f = fixture(true)
    f.authority(
      {
        ...common,
        basis: [...common.basis],
        action: 'dispatch',
        task: f.binding,
        confirmations: [],
      },
      1,
    )
    const result = await (
      await openIntegration({ root: f.root })
    ).execute({
      kind,
      authority: f.binding.dispatch,
      issue: f.binding.issue.url,
      revision: 1,
      attempt: 'one',
    })
    expect(result).toMatchObject({ ownerTask: f.binding })
    const calls: string[][] = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(calls.some(call => call.at(-1)?.includes('/issues?'))).toBe(false)
    expect(calls.some(call => call.some(arg => arg.includes(' items(')))).toBe(false)
    expect(calls.filter(call => call.at(-1) === 'repos/owner/repo/issues/1')).toHaveLength(2)
  },
)

it.each(['body', 'comment', 'relation', 'stage', 'closure'] as const)(
  'refuses a changed %s on readback without writing context',
  async change => {
    const f = fixture(true)
    f.authority(
      {
        ...common,
        basis: [...common.basis],
        action: 'dispatch',
        task: f.binding,
        confirmations: [],
      },
      1,
    )
    const platform = join(f.home, 'platform.json'),
      p = JSON.parse(readFileSync(platform, 'utf8'))
    p.readbackChange =
      change === 'body'
        ? { body: p.body + '\nChanged relevant body' }
        : change === 'comment'
          ? {
              comments: p.comments.map((comment: { body: string }) => ({
                ...comment,
                body: comment.body + '\nChanged relevant comment',
              })),
            }
          : change === 'stage'
            ? { stage: 'In Progress' }
            : change === 'relation'
              ? { parent: f.binding.issue.url }
              : { blockedBy: ['https://github.com/owner/repo/issues/2'] }
    writeFileSync(platform, JSON.stringify(p))
    await expect(
      (await openIntegration({ root: f.root })).execute({
        kind: 'start',
        authority: f.binding.dispatch,
        issue: f.binding.issue.url,
        revision: 1,
        attempt: 'one',
      }),
    ).rejects.toThrow('Task inputs changed')
    expect(existsSync(contextPath(f.root))).toBe(false)
  },
)
describe('dispatch by publish environment reviewers', () => {
  async function dispatch(
    f: ReturnType<typeof fixture>,
    change: (platform: Record<string, unknown>) => void = () => {},
    extra: Record<string, unknown> = {},
  ) {
    f.authority(
      {
        ...common,
        ...extra,
        basis: [...common.basis],
        action: 'dispatch',
        task: f.binding,
        confirmations: [],
      },
      1,
    )
    const path = join(f.home, 'platform.json'),
      platform = JSON.parse(readFileSync(path, 'utf8'))
    change(platform)
    writeFileSync(path, JSON.stringify(platform))
    return (await openIntegration({ root: f.root })).execute({
      kind: 'start',
      authority: f.binding.dispatch,
      issue: f.binding.issue.url,
      revision: 1,
      attempt: 'one',
    })
  }
  const team = (members: string[]) => (platform: Record<string, unknown>) => {
    platform.environment = {
      name: 'publish',
      protection_rules: [
        { type: 'required_reviewers', reviewers: [{ type: 'Team', reviewer: { slug: 'leads' } }] },
      ],
    }
    platform.teams = { leads: members }
  }

  it('starts without an adoption descriptor, anchor or tag', async () => {
    const f = fixture()
    expect(existsSync(join(f.root, 'docs/engineering/integration-bootstrap.json'))).toBe(false)
    expect(existsSync(join(repository(f.root).commonDir, 'omne-integration'))).toBe(false)
    expect(git(f.remote, ['for-each-ref', '--format=%(refname)', 'refs/tags/'])).toBe('')
    const context = await dispatch(f)
    expect(context).toMatchObject({ targetBase: f.initial, ownerTask: f.binding, operation: null })
    expect(context).not.toHaveProperty('anchor')
    const written = JSON.parse(readFileSync(contextPath(f.root), 'utf8'))
    expect(written).toEqual(context)
    expect(Object.keys(written)).not.toContain('anchor')
    expect(baselines(f.root)).toMatchObject({ targetBase: f.initial })
  })
  it('refuses a dispatch that still carries the retired policyRevision and writes no context', async () => {
    const f = fixture()
    await expect(dispatch(f, undefined, { policyRevision: '1' })).rejects.toThrow(
      'dispatch: unknown fields policyRevision',
    )
    expect(existsSync(contextPath(f.root))).toBe(false)
  })
  it('accepts a member of a reviewer team', async () => {
    await expect(dispatch(fixture(), team(['human']))).resolves.toMatchObject({
      ownerTask: { attempt: 'one' },
    })
  })
  it.each([
    ['a team that does not include the author', team(['someone-else']), 'not a reviewer'],
    [
      'an unreadable environment',
      (platform: Record<string, unknown>) => {
        platform.environmentUnreadable = true
      },
      'Cannot read the publish environment',
    ],
    [
      'an environment without required reviewers',
      (platform: Record<string, unknown>) => {
        platform.environment = { name: 'publish', protection_rules: [] }
      },
      'no required reviewers',
    ],
  ])('refuses %s and writes no context', async (_, change, message) => {
    const f = fixture()
    await expect(dispatch(f, change)).rejects.toThrow(message)
    expect(existsSync(contextPath(f.root))).toBe(false)
  })
})
it('keeps unrelated platform changes out of admission readback', async () => {
  const f = fixture(true),
    platform = join(f.home, 'platform.json'),
    p = JSON.parse(readFileSync(platform, 'utf8'))
  p.readbackChange = { unrelatedIssueBody: 'changed', unrelatedProjectItem: 'Done' }
  writeFileSync(platform, JSON.stringify(p))
  await start(f)
  expect(existsSync(contextPath(f.root))).toBe(true)
})

it.each(['valid', 'revoked', 'direct-mismatch', 'actor-id'] as const)(
  'checks a separate authority Issue with %s evidence',
  async evidence => {
    const f = fixture(true),
      authorityIssue = 'https://github.com/owner/repo/issues/2'
    f.binding.dispatch = authorityIssue + '#issuecomment-900'
    f.update(f.binding)
    f.authority(
      {
        ...common,
        basis: [...common.basis],
        action: 'dispatch',
        task: f.binding,
        confirmations: [],
      },
      900,
    )
    const platform = join(f.home, 'platform.json'),
      p = JSON.parse(readFileSync(platform, 'utf8')),
      authority = {
        ...p.comments[0],
        html_url: f.binding.dispatch,
        issue_url: 'https://api.github.com/repos/owner/repo/issues/2',
      }
    p.comments = []
    p.authorityComments = [authority]
    if (evidence === 'revoked') {
      p.authorityComments.push(
        ...Array.from({ length: 99 }, (_, i) => ({
          ...authority,
          id: i + 901,
          html_url: authorityIssue + '#issuecomment-' + (i + 901),
          body: 'discussion',
        })),
      )
      p.authorityComments.push({
        ...authority,
        id: 1000,
        html_url: authorityIssue + '#issuecomment-1000',
        body:
          '\x60\x60\x60json omne-integration-revocation:v1\n' +
          JSON.stringify({
            schemaVersion: 1,
            decisions: [f.binding.dispatch],
            basis: 'withdrawn',
          }) +
          '\n\x60\x60\x60',
      })
    }
    if (evidence === 'direct-mismatch')
      p.directCommentChange = { body: authority.body + '\nChanged' }
    if (evidence === 'actor-id')
      p.directCommentChange = { user: { login: 'human', node_id: 'U_impostor' } }
    writeFileSync(platform, JSON.stringify(p))
    const pending = (await openIntegration({ root: f.root })).execute({
      kind: 'start',
      authority: f.binding.dispatch,
      issue: f.binding.issue.url,
      revision: 1,
      attempt: 'one',
    })
    if (evidence === 'valid') await expect(pending).resolves.toMatchObject({ ownerTask: f.binding })
    else {
      await expect(pending).rejects.toThrow(
        evidence === 'revoked'
          ? 'revocation'
          : evidence === 'direct-mismatch'
            ? 'changed during capture'
            : 'not a reviewer of the publish environment',
      )
      expect(existsSync(contextPath(f.root))).toBe(false)
    }
  },
)
