// The enablement check of the API semantic review path (candidate-r4.md 3.2). Real temporary Git
// checkouts. Counting stand-ins prove the order: step 1 runs before any Git read, trusted-target
// read or JSON parse, and steps 2 to 4 finish before the caller's later reads.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTHORITY_PATHS,
  checkEnablement,
  gitEnablementPorts,
  type EnablementPorts,
} from '../src/integration/api-review-enablement.ts'
import { git } from '../src/integration/git.ts'
import { init } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})

const ENTRY = 'tools/dev-flow/src/integration/api-review-enablement.ts'
const LINES = 'docs/engineering/delivery-lines.json'
const OWNERS = 'docs/engineering/api-review-owners.json'
const VERIFICATION = 'docs/verification.md'
type Files = Record<string, string | null>
type Fixture = { root: string; targetBase: string; candidate: string }

/** A complete authority set: every AuthorityFiles path exists, the two JSON files parse. */
function baseFiles(): Files {
  return {
    [ENTRY]: 'export {}\n',
    'tools/dev-flow/package.json': '{}\n',
    'docs/engineering/integration.md': 'integration\n',
    'docs/engineering/delivery.md': 'delivery\n',
    [VERIFICATION]: 'verification\n',
    [LINES]: '{"lines":[]}\n',
    [OWNERS]: '{"schemaVersion":1}\n',
    'docs/engineering/integration-policy.json': '{}\n',
    'repo-toolchain.config.json': '{}\n',
  }
}
function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-enablement-')))
  homes.push(root)
  return root
}
function apply(root: string, files: Files, message: string): string {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) git(root, ['rm', '-q', '--', path])
    else {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
      git(root, ['add', '--', path])
    }
  }
  git(root, ['commit', '-q', '--allow-empty', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}
/** targetBase commit with `target` files, then a candidate commit that applies `change` on it. */
function fixture(target: Files = baseFiles(), change: Files = {}): Fixture {
  const root = temporary()
  init(root)
  const targetBase = apply(root, target, 'target')
  const candidate = apply(root, change, 'candidate')
  return { root, targetBase, candidate }
}

type Spy = { events: string[]; ports: EnablementPorts; count(name: string): number }
function spied(root: string): Spy {
  const real = gitEnablementPorts(root)
  const events: string[] = []
  const ports: EnablementPorts = {
    realpath: path => (events.push('realpath'), real.realpath(path)),
    objectId: (commit, path) => (events.push('git'), real.objectId(commit, path)),
    readBlob: (commit, path) => (events.push('git'), real.readBlob(commit, path)),
    parseJson: text => (events.push('json'), real.parseJson(text)),
  }
  return { events, ports, count: name => events.filter(e => e === name).length }
}
function run(f: Fixture, options: { entry?: string } = {}) {
  const spy = spied(f.root)
  const result = checkEnablement(
    {
      entry: options.entry ?? join(f.root, ENTRY),
      root: f.root,
      resolveTrusted: () => {
        spy.events.push('trusted')
        return { candidate: f.candidate, targetBase: f.targetBase }
      },
    },
    spy.ports,
  )
  return { result, spy }
}

// Every case builds a temporary Git checkout with several subprocesses: about one second idle,
// 5.2 seconds under load (admission 2026-11-01), past the 5-second default. The limit is three
// times the loaded cost; no assertion changes.
describe('enablement check', { timeout: 20_000 }, () => {
  it('passes when both sides carry identical authority files and the targetBase JSON parses', () => {
    const f = fixture()
    const { result } = run(f)
    const oids = [...AUTHORITY_PATHS].map(path => ({
      oid: git(f.root, ['rev-parse', `${f.targetBase}:${path}`]),
      path,
    }))
    const expected = createHash('sha256').update(JSON.stringify(oids)).digest('hex')
    expect(result).toMatchObject({
      enablement: { kind: 'enabled', authoritySha256: expected },
      code: null,
      exit: 0,
      findings: [],
    })
  })

  it('lists the nine AuthorityFiles sorted by UTF-16 code units, the directory included', () => {
    expect([...AUTHORITY_PATHS]).toEqual([...AUTHORITY_PATHS].sort())
    expect(AUTHORITY_PATHS).toHaveLength(9)
    expect(AUTHORITY_PATHS).toContain('tools/dev-flow/src')
  })

  it('refuses self-authorization when the target lacks a file the candidate adds', () => {
    const target = baseFiles()
    delete target[OWNERS]
    const { result, spy } = run(fixture(target, { [OWNERS]: '{"schemaVersion":1}\n' }))
    expect(result.code).toBe('api-review-self-authorization')
    expect(result.exit).toBe(1)
    expect(result.enablement).toEqual({
      kind: 'presence',
      rows: [{ path: OWNERS, targetBase: 'absent', candidate: 'present' }],
    })
    expect(spy.count('json')).toBe(0)
  })

  it('refuses self-authorization when the candidate deletes a file the target has', () => {
    const { result } = run(fixture(baseFiles(), { [OWNERS]: null }))
    expect(result.code).toBe('api-review-self-authorization')
    expect(result.enablement).toEqual({
      kind: 'presence',
      rows: [{ path: OWNERS, targetBase: 'present', candidate: 'absent' }],
    })
  })

  it('reports policy-unavailable with exit 2 when both sides lack the identity file', () => {
    const target = baseFiles()
    delete target[OWNERS]
    const { result } = run(fixture(target))
    expect(result.code).toBe('api-review-policy-unavailable')
    expect(result.exit).toBe(2)
    expect(result.enablement).toEqual({
      kind: 'presence',
      rows: [{ path: OWNERS, targetBase: 'absent', candidate: 'absent' }],
    })
  })

  it('refuses self-authorization with oid-differs when a present file differs', () => {
    const { result } = run(fixture(baseFiles(), { [VERIFICATION]: 'changed\n' }))
    expect(result.code).toBe('api-review-self-authorization')
    expect(result.exit).toBe(1)
    expect(result.enablement).toEqual({ kind: 'oid-differs', paths: [VERIFICATION] })
  })

  it('compares the src directory by tree oid and lists every differing path', () => {
    const { result } = run(
      fixture(baseFiles(), {
        'tools/dev-flow/src/extra.ts': 'export {}\n',
        'repo-toolchain.config.json': '{"x":1}\n',
      }),
    )
    expect(result.enablement).toEqual({
      kind: 'oid-differs',
      paths: ['repo-toolchain.config.json', 'tools/dev-flow/src'],
    })
  })

  it('makes self-authorization the result and keeps policy-unavailable rows in the report', () => {
    const target = baseFiles()
    delete target[OWNERS]
    const { result } = run(fixture(target, { 'docs/engineering/delivery.md': null }))
    expect(result.code).toBe('api-review-self-authorization')
    expect(result.exit).toBe(1)
    expect(result.findings.map(f => f.code).sort()).toEqual([
      'api-review-policy-unavailable',
      'api-review-self-authorization',
    ])
  })

  it('does not compare oids once step 2 failed', () => {
    const { result } = run(fixture(baseFiles(), { [OWNERS]: null, [VERIFICATION]: 'changed\n' }))
    expect(result.enablement.kind).toBe('presence')
    expect(result.findings).toHaveLength(1)
  })

  it('reports policy-unavailable with exit 2 when a targetBase JSON file cannot be parsed', () => {
    const { result, spy } = run(fixture({ ...baseFiles(), [LINES]: '{not json' }, {}))
    expect(result.code).toBe('api-review-policy-unavailable')
    expect(result.exit).toBe(2)
    expect(result.enablement).toEqual({ kind: 'unparsable', path: LINES })
    expect(spy.count('json')).toBeGreaterThan(0)
  })

  it('parses only after presence and equality passed', () => {
    const { result, spy } = run(
      fixture({ ...baseFiles(), [LINES]: '{not json' }, { [VERIFICATION]: 'x\n' }),
    )
    expect(result.code).toBe('api-review-self-authorization')
    expect(spy.count('json')).toBe(0)
  })

  it('fails at step 1 before any Git read, trusted-target read or JSON parse', () => {
    const f = fixture()
    const elsewhere = fixture()
    const { result, spy } = run(f, { entry: join(elsewhere.root, ENTRY) })
    expect(result.code).toBe('api-review-entry-outside-root')
    expect(result.exit).toBe(1)
    expect(result.enablement).toMatchObject({ kind: 'entry-outside-root', root: f.root })
    expect(spy.count('git')).toBe(0)
    expect(spy.count('trusted')).toBe(0)
    expect(spy.count('json')).toBe(0)
  })

  it('rejects an entry beside src, and a sibling directory that shares the name prefix', () => {
    const f = fixture()
    for (const entry of ['tools/dev-flow/dist/cli.js', 'tools/dev-flow/src-copy/a.ts']) {
      mkdirSync(dirname(join(f.root, entry)), { recursive: true })
      writeFileSync(join(f.root, entry), '')
      expect(run(f, { entry: join(f.root, entry) }).result.code).toBe(
        'api-review-entry-outside-root',
      )
    }
  })

  it('keeps the two failure codes apart for the same candidate', () => {
    const f = fixture(baseFiles(), { [VERIFICATION]: 'changed\n' })
    const elsewhere = fixture()
    expect(run(f, { entry: join(elsewhere.root, ENTRY) }).result.code).toBe(
      'api-review-entry-outside-root',
    )
    expect(run(f).result.code).toBe('api-review-self-authorization')
  })

  it('reads in order: entry location, trusted target, presence and oid reads, then parsing', () => {
    const { spy } = run(fixture())
    const afterEntry = spy.events.filter(e => e !== 'realpath')
    expect(afterEntry[0]).toBe('trusted')
    // 9 paths on 2 sides come first; JSON parsing never precedes them.
    expect(afterEntry.slice(1, 19).every(e => e === 'git')).toBe(true)
    expect(afterEntry.indexOf('json')).toBeGreaterThan(18)
  })
})
