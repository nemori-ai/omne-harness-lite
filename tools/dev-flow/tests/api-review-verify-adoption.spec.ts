// verify-owner-adoption (candidate-r4.md 8.6, adoption rows of section 10). Git is real: a
// temporary repository and `git merge-tree`. GitHub is a stand-in that answers by comment id and
// records every read, so a case can prove that a comment was not read.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GhReadError, type GhRead } from '../src/delivery/github-read.ts'
import { verifyOwnerAdoption } from '../src/integration/api-review-cli.ts'
import { git } from '../src/integration/git.ts'
import { init } from './fixtures/integration.ts'

const REPO = 'owner/repo'
const OWNERS = 'docs/engineering/api-review-owners.json'
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))

const BODY = 'accept line alpha: alice / N_alice'
const UPDATED = '2026-11-01T04:39:28Z'
const urlOf = (id: number, repo = REPO) => `https://github.com/${repo}/issues/10#issuecomment-${id}`
type Stored = {
  html_url: string
  body: string | null
  updated_at: string
  user: { login: string; node_id: string }
}
const stored = (id: number, over: Partial<Stored> = {}): Stored => ({
  html_url: urlOf(id),
  body: BODY,
  updated_at: UPDATED,
  user: { login: 'alice', node_id: 'N_alice' },
  ...over,
})
type FactOver = { url?: string; sha?: string; updated?: string; author?: string; nodeId?: string }
const fact = (lineId: string, over: FactOver = {}, id = 501) => ({
  lineId,
  owner: { login: 'alice', nodeId: over.nodeId ?? 'N_alice' },
  adoption: {
    comment: {
      url: over.url ?? urlOf(id),
      bodySha256: over.sha ?? sha(BODY),
      updatedAt: over.updated ?? UPDATED,
    },
    authorNodeId: over.author ?? 'N_alice',
  },
})
const manifest = (...owners: unknown[]) =>
  `${JSON.stringify({ schemaVersion: 1, repository: { name: REPO, nodeId: 'R_repo' }, owners }, null, 2)}\n`

function write(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
function commitAll(root: string, message: string): string {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '--allow-empty', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}
function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-adoption-')))
  homes.push(root)
  init(root)
  write(root, 'README.md', 'x\n')
  return root
}
/** `base` and `head` hold the identity file `baseText` and `headText`; null means no file. */
function scenario(baseText: string | null, headText: string | null) {
  const root = temporary()
  if (baseText !== null) write(root, OWNERS, baseText)
  const base = commitAll(root, 'base')
  git(root, ['checkout', '-q', '-b', 'head'])
  if (headText === null) rmSync(join(root, OWNERS), { force: true })
  else write(root, OWNERS, headText)
  return { root, base, head: commitAll(root, 'head') }
}
function remote(comments: Record<number, Stored | number>) {
  const reads: string[] = []
  const call: GhRead = argv => {
    const path = String(argv[argv.length - 1])
    reads.push(path)
    const id = Number(/issues\/comments\/(\d+)$/.exec(path)?.[1])
    const entry = comments[id]
    if (entry === undefined) throw new GhReadError({ status: '404', message: 'Not Found' })
    if (typeof entry === 'number') throw new GhReadError({ status: String(entry), message: 'x' })
    return entry
  }
  return { call, reads }
}
const run = (s: { root: string; base: string; head: string }, call: GhRead) =>
  verifyOwnerAdoption({ root: s.root, base: s.base, head: s.head, repository: REPO, call })
const codes = (result: ReturnType<typeof run>) =>
  result.report.kind === 'unchanged' ? [] : result.report.findings.map(item => item.code)

describe('verify-owner-adoption', () => {
  it('lists an added entry with the read-back body and exits 0 when the four fields match', () => {
    const s = scenario(null, manifest(fact('alpha')))
    const result = run(s, remote({ 501: stored(501) }).call)
    expect(result.exit).toBe(0)
    expect(result.report).toMatchObject({
      kind: 'changed',
      findings: [],
      entries: [
        {
          change: 'added',
          fact: { lineId: 'alpha' },
          readBack: {
            htmlUrl: urlOf(501),
            body: BODY,
            bodySha256: sha(BODY),
            updatedAt: UPDATED,
            author: { nodeId: 'N_alice' },
          },
        },
      ],
    })
    expect(result.summary).toBe('verify-owner-adoption: 0 added=1 changed=0 removed=0 findings=0')
  })

  it('classifies an entry whose fields differ from the base as changed', () => {
    const s = scenario(manifest(fact('alpha')), manifest(fact('alpha', { nodeId: 'N_other' })))
    const result = run(s, remote({ 501: stored(501) }).call)
    expect(result.report).toMatchObject({ kind: 'changed', entries: [{ change: 'changed' }] })
    expect(result.summary).toContain('added=0 changed=1 removed=0')
  })

  it('refuses a URL of another repository without reading any comment', () => {
    const s = scenario(null, manifest(fact('alpha', { url: urlOf(501, 'other/repo') })))
    const platform = remote({ 501: stored(501) })
    const result = run(s, platform.call)
    expect(codes(result)).toEqual(['adoption-verify-foreign-url'])
    expect(result.exit).toBe(1)
    expect(platform.reads).toEqual([])
  })

  it('refuses a read-back html_url that differs from the registered URL', () => {
    const s = scenario(null, manifest(fact('alpha')))
    const result = run(s, remote({ 501: stored(501, { html_url: urlOf(999) }) }).call)
    expect(codes(result)).toEqual(['adoption-verify-foreign-url'])
    expect(result.exit).toBe(1)
  })

  it('reports a known 404 as comment-missing, exit 1', () => {
    const s = scenario(null, manifest(fact('alpha')))
    const result = run(s, remote({}).call)
    expect(codes(result)).toEqual(['adoption-verify-comment-missing'])
    expect(result.exit).toBe(1)
  })

  it.each([
    ['bodySha256', { sha: sha('another body') }],
    ['updatedAt', { updated: '2026-11-01T04:39:29Z' }],
    ['authorNodeId', { author: 'N_mallory' }],
  ] as const)('reports a differing %s alone as mismatch naming that field', (field, over) => {
    const s = scenario(null, manifest(fact('alpha', over)))
    const result = run(s, remote({ 501: stored(501) }).call)
    expect(result.exit).toBe(1)
    expect(result.report).toMatchObject({
      findings: [{ code: 'adoption-verify-mismatch', lineId: 'alpha', fields: [field] }],
    })
  })

  it('lists a removed entry without reading its comment and exits 0', () => {
    const s = scenario(manifest(fact('alpha')), manifest())
    const platform = remote({ 501: 403 })
    const result = run(s, platform.call)
    expect(result.exit).toBe(0)
    expect(result.report).toMatchObject({
      kind: 'changed',
      entries: [{ change: 'removed', fact: { lineId: 'alpha' } }],
    })
    expect(platform.reads).toEqual([])
  })

  it('reports unchanged when both sides lack the file or hold the same blob, with no read', () => {
    for (const text of [null, manifest(fact('alpha'))]) {
      const s = scenario(text, text)
      const platform = remote({})
      const result = run(s, platform.call)
      expect(result.report.kind).toBe('unchanged')
      expect(result.exit).toBe(0)
      expect(platform.reads).toEqual([])
    }
  })

  it.each([[403], [429]])('reports comment read %i as input-unknown, exit 2', status => {
    const s = scenario(null, manifest(fact('alpha')))
    const result = run(s, remote({ 501: status }).call)
    expect(codes(result)).toEqual(['adoption-verify-input-unknown'])
    expect(result.exit).toBe(2)
  })

  it('reports a merge-tree conflict as input-unknown without partial entries', () => {
    const root = temporary()
    write(root, OWNERS, manifest(fact('alpha')))
    commitAll(root, 'start')
    git(root, ['checkout', '-q', '-b', 'head'])
    write(root, OWNERS, manifest(fact('alpha', { nodeId: 'N_one' })))
    const head = commitAll(root, 'one')
    git(root, ['checkout', '-q', 'main'])
    write(root, OWNERS, manifest(fact('alpha', { nodeId: 'N_two' })))
    const base = commitAll(root, 'two')
    const result = run({ root, base, head }, remote({ 501: stored(501) }).call)
    expect(result.exit).toBe(2)
    expect(result.report).toMatchObject({
      kind: 'input-unknown',
      findings: [{ code: 'adoption-verify-input-unknown' }],
    })
  })

  it('reports a commit missing from the object store as input-unknown without fetching', () => {
    const s = scenario(null, manifest(fact('alpha')))
    const result = run({ ...s, head: 'a'.repeat(40) }, remote({}).call)
    expect(result.exit).toBe(2)
    expect(result.report.kind).toBe('input-unknown')
  })

  it('reports an argument that is not a 40-digit commit as input-unknown', () => {
    const s = scenario(null, manifest(fact('alpha')))
    const platform = remote({})
    const result = run({ ...s, base: 'main' }, platform.call)
    expect(result.exit).toBe(2)
    expect(platform.reads).toEqual([])
  })

  it('reports a merged identity file that fails the strict parse as manifest-invalid, exit 1', () => {
    const s = scenario(null, manifest(fact('alpha'), fact('alpha')))
    const platform = remote({ 501: stored(501) })
    const result = run(s, platform.call)
    expect(codes(result)).toEqual(['adoption-verify-manifest-invalid'])
    expect(result.exit).toBe(1)
    expect(platform.reads).toEqual([])
  })

  it('reports an unparsable base-side identity file as input-unknown', () => {
    const s = scenario('{"schemaVersion":1,"unknown":true}', manifest(fact('alpha')))
    const result = run(s, remote({ 501: stored(501) }).call)
    expect(result.exit).toBe(2)
    expect(result.report.kind).toBe('input-unknown')
  })
})

describe('api-review-cli command line', () => {
  const cli = join(import.meta.dirname, '..', 'src', 'integration', 'api-review-cli.ts')
  const spawn = (args: string[], cwd: string) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
      cwd,
      encoding: 'utf8',
    })

  it('prints the report and the summary line, and exits 0 for an unchanged identity file', () => {
    const root = temporary()
    write(root, 'docs/engineering/integration-policy.json', JSON.stringify({ repository: REPO }))
    write(root, OWNERS, manifest(fact('alpha')))
    const base = commitAll(root, 'base')
    const head = commitAll(root, 'same')
    const result = spawn(
      ['verify-owner-adoption', '--root', root, '--base', base, '--head', head],
      root,
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'unchanged', base, head })
    expect(result.stderr.trim().split('\n').pop()).toBe(
      'verify-owner-adoption: 0 added=0 changed=0 removed=0 findings=0',
    )
  })

  it('exits 2 for a repeated option, a missing option, a bad flag value and an unknown command', () => {
    const root = temporary()
    const forms = [
      ['verify-owner-adoption', '--root', root, '--root', root, '--base', 'a', '--head', 'b'],
      ['verify-owner-adoption', '--root', root, '--base', 'a'],
      ['check-milestone', '--root', root, '--baseline-issue', '5', '--semantic-review', 'false'],
      ['record', '--file', 'x'],
    ]
    for (const args of forms) expect(spawn(args, root).status, args.join(' ')).toBe(2)
  })

  it('refuses draft-card and draft-ri until R3-5 is wired, with exit 2 and a reason', () => {
    const root = temporary()
    const forms = [
      ['draft-card', '--root', root],
      ['draft-ri', '--root', root, '--track', 't', '--review-issue', '3'],
    ]
    for (const args of forms) {
      const result = spawn(args, root)
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stdout)).toMatchObject({ code: 'unavailable' })
    }
  })
})
