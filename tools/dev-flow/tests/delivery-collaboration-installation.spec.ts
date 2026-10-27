import { afterEach, describe, expect, it } from 'vitest'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { git } from '../src/integration/git.ts'
import { digest } from '../src/integration/parse.ts'
import { POLICY_PATH } from '../src/integration/policy.ts'
import { ACCEPTANCE_SOURCES_PATH } from '../src/delivery/collaboration-acceptance-source.ts'
import {
  installCollaboration,
  parseCollaborationInstallation,
  readCollaborationInstallation,
} from '../src/delivery/collaboration-installation.ts'
import { openCollaborationInstallation } from '../src/delivery/collaboration-bootstrap.ts'
import { installCollaborationCli } from '../src/delivery/collaboration-install-cli.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { policy } from './fixtures/collaboration-authority.ts'
import { evidence } from './fixtures/collaboration.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'collaboration-installation-')))
  roots.push(root)
  git(root, ['init', '-q'])
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-qm',
    'Fixture tool',
  ])
  const head = git(root, ['rev-parse', 'HEAD'])
  const config = JSON.parse(
    readFileSync(
      new URL('../../../docs/engineering/github-delivery.json', import.meta.url),
      'utf8',
    ),
  )
  config.repository = policy.repository
  const files = new Map([
    [POLICY_PATH, JSON.stringify(policy) + '\n'],
    [policy.deliveryConfig, JSON.stringify(config) + '\n'],
    [
      ACCEPTANCE_SOURCES_PATH,
      JSON.stringify({ schemaVersion: 2, entries: [], mandates: [] }) + '\n',
    ],
  ])
  function file(path: string) {
    const text = files.get(path)
    if (text === undefined) throw new Error('Unexpected source: ' + path)
    const sha = createHash('sha1')
      .update(`blob ${Buffer.byteLength(text)}\0`)
      .update(text)
      .digest('hex')
    return {
      type: 'file',
      path,
      sha,
      encoding: 'base64',
      content: Buffer.from(text).toString('base64'),
    }
  }
  function source(path: string) {
    const text = files.get(path)
    if (text === undefined) throw new Error('Missing fixture')
    return { commit: head, path, blob: file(path).sha, digest: digest(text) }
  }
  const installation = {
    schemaVersion: 1 as const,
    repository: policy.repository,
    toolCommit: head,
    policySource: source(POLICY_PATH),
    acceptanceSource: source(ACCEPTANCE_SOURCES_PATH),
    basis: [evidence],
    facts: { kind: 'direct' },
  }
  const trace: string[][] = []
  const read: GhRead = args => {
    trace.push([...args])
    expect(args[args.indexOf('--method') + 1]).toBe('GET')
    const endpoint = args.at(-1) ?? ''
    const prefix = `repos/${policy.repository}/contents/`
    if (!endpoint.startsWith(prefix) || !endpoint.endsWith(`?ref=${head}`))
      throw new Error('Unexpected read: ' + endpoint)
    return file(endpoint.slice(prefix.length).split('?')[0] ?? '')
  }
  const adopt = () => {
    const text = JSON.stringify(installation)
    return installCollaboration(root, text, digest(text))
  }
  return { root, head, files, file, installation, trace, read, adopt }
}

describe('explicit collaboration installation', () => {
  it('does not report adoption on retry while directory persistence still fails', () => {
    const f = fixture()
    const script = `
      import assert from 'node:assert/strict'
      import fs from 'node:fs'
      import { createHash } from 'node:crypto'
      import { syncBuiltinESMExports } from 'node:module'
      const [moduleUrl, root, text] = process.argv.slice(1)
      const sha = createHash('sha256').update(text).digest('hex')
      const original = fs.fsyncSync
      fs.fsyncSync = fd => {
        if (fs.fstatSync(fd).isDirectory()) throw new Error('injected directory persistence EIO')
        return original(fd)
      }
      syncBuiltinESMExports()
      const { installCollaboration, readCollaborationInstallation } = await import(moduleUrl)
      assert.throws(() => installCollaboration(root, text, sha), /persistence EIO/)
      assert.throws(() => installCollaboration(root, text, sha), /persistence EIO/)
      fs.fsyncSync = original
      syncBuiltinESMExports()
      installCollaboration(root, text, sha)
      assert.equal(readCollaborationInstallation(root, 'owner/repo').toolCommit, JSON.parse(text).toolCommit)
      console.log('Failed persistence remains failed on retry; recovery succeeds after the fault clears.')
    `
    const output = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        script,
        new URL('../src/delivery/collaboration-installation.ts', import.meta.url).href,
        f.root,
        JSON.stringify(f.installation),
      ],
      { encoding: 'utf8' },
    )
    expect(output).toContain('recovery succeeds after the fault clears')
  })

  it('atomically adopts exact bytes and repeats without replacing the installation', () => {
    const f = fixture()
    const first = f.adopt()
    const target = join(f.root, '.git', 'omne-collaboration-installation.json')
    const before = readFileSync(target, 'utf8')
    expect(f.adopt()).toEqual(first)
    expect(readFileSync(target, 'utf8')).toBe(before)
    expect(readdirSync(join(f.root, '.git')).filter(name => name.includes('.tmp'))).toEqual([])
    f.installation.basis = [{ ...evidence, description: 'A different adoption' }]
    expect(f.adopt).toThrow('already-adopted')
    expect(readFileSync(target, 'utf8')).toBe(before)
  })

  it('refuses missing adoption before any network call', () => {
    const f = fixture()
    expect(() => openCollaborationInstallation(f.root, policy.repository, f.read)).toThrow(
      'installation-required',
    )
    expect(f.trace).toEqual([])
  })

  it('refuses a digest mismatch without publishing a record', () => {
    const f = fixture()
    expect(() =>
      installCollaboration(f.root, JSON.stringify(f.installation), '0'.repeat(64)),
    ).toThrow('digest-mismatch')
    expect(() => readCollaborationInstallation(f.root, policy.repository)).toThrow(
      'installation-required',
    )
  })

  it.each([
    ['repository', 'other/repo'],
    ['toolCommit', 'a'.repeat(40)],
  ])('refuses a different requested or executable %s', (field, value) => {
    const f = fixture()
    f.adopt()
    if (field === 'repository') {
      expect(() => openCollaborationInstallation(f.root, value, f.read)).toThrow(
        'repository-mismatch',
      )
    } else {
      git(f.root, [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '--allow-empty',
        '-qm',
        'Changed tool',
      ])
      expect(() => openCollaborationInstallation(f.root, policy.repository, f.read)).toThrow(
        'tool-commit-mismatch',
      )
    }
    expect(f.trace).toEqual([])
  })

  it('refuses a dirty tool checkout', () => {
    const f = fixture()
    f.adopt()
    writeFileSync(join(f.root, 'new-code.ts'), 'export const unsafe = true')
    expect(() => openCollaborationInstallation(f.root, policy.repository, f.read)).toThrow(
      'not clean',
    )
    expect(f.trace).toEqual([])
  })

  it.each([
    { policySource: { commit: 'HEAD' } },
    { acceptanceSource: { path: 'caller.json' } },
    { facts: { kind: 'direct', workflow: {} } },
    { facts: { kind: 'fallback' } },
    { basis: [] },
    { acceptor: 'caller' },
  ])('rejects malformed descriptor %j', change => {
    const f = fixture()
    expect(() => parseCollaborationInstallation({ ...f.installation, ...change })).toThrow()
  })

  it('installs through the explicit CLI and rejects an ordinary authority override', () => {
    const f = fixture()
    const text = JSON.stringify(f.installation)
    const input = join(f.root, '.git', 'reviewed-descriptor.json')
    writeFileSync(input, text)
    const result = JSON.parse(
      installCollaborationCli(['--descriptor', input, '--sha256', digest(text)], f.root),
    )
    expect(result.status).toBe('adopted')
    expect(result.descriptorSha256).toBe(digest(text))
    expect(() =>
      installCollaborationCli(
        ['--descriptor', input, '--sha256', digest(text), '--acceptor', 'caller'],
        f.root,
      ),
    ).toThrow()
  })
})

describe('installed collaboration assembly', () => {
  it('shares exact policy and accepted sources using GET-only immutable content reads', () => {
    const f = fixture()
    f.adopt()
    const assembly = openCollaborationInstallation(f.root, policy.repository, f.read)
    expect(assembly.request.policy).toEqual(policy)
    expect(assembly.authorityFor(999).policy).toBe(assembly.request.policy)
    expect(assembly.watch.sources.source).toEqual(f.installation.acceptanceSource)
    expect(assembly.watch.sources.mandates).toEqual([])
    expect(assembly.request.factsFor).toBeUndefined()
    expect(assembly.request.taskAuthority).toBeUndefined()
    expect(f.trace).toHaveLength(3)
    expect(() => assembly.watch.read(['api', '--method', 'POST', 'anything'], 1)).toThrow(
      'read-only',
    )
    expect(() => assembly.watch.read(['api', 'graphql', '--method', 'GET'], 1)).toThrow('read-only')
    expect(f.trace).toHaveLength(3)
  })

  it.each([POLICY_PATH, ACCEPTANCE_SOURCES_PATH])(
    'refuses changed pinned source bytes at %s',
    path => {
      const f = fixture()
      f.adopt()
      f.files.set(path, (f.files.get(path) ?? '') + ' ')
      expect(() => openCollaborationInstallation(f.root, policy.repository, f.read)).toThrow(
        /changed/,
      )
    },
  )

  it.each(['disabled', 'wrong-repository', 'missing-project'])(
    'refuses invalid delivery config %s',
    mode => {
      const f = fixture()
      f.adopt()
      const config = JSON.parse(f.files.get(policy.deliveryConfig) ?? '')
      if (mode === 'disabled') config.enabled = false
      if (mode === 'wrong-repository') config.repository = 'other/repo'
      if (mode === 'missing-project') config.project.id = null
      f.files.set(policy.deliveryConfig, JSON.stringify(config))
      expect(() => openCollaborationInstallation(f.root, policy.repository, f.read)).toThrow(
        'delivery-config',
      )
    },
  )

  it('defers published current, historical and task facts until called, without a direct fallback', () => {
    const f = fixture()
    const input = {
      ...f.installation,
      facts: {
        kind: 'published',
        workflow: {
          id: 9,
          path: '.github/workflows/delivery-facts.yml',
          ref: 'github-gate',
          head: f.head,
        },
        bot: { login: 'fixed[bot]', nodeId: 'BOT_fixed' },
      },
    }
    const text = JSON.stringify(input)
    installCollaboration(f.root, text, digest(text))
    const assembly = openCollaborationInstallation(f.root, policy.repository, f.read)
    expect(f.trace).toHaveLength(3)
    expect(assembly.request.factsFor).toBe(assembly.request.taskAuthority)
    expect(assembly.watch.taskFactsFor).toBe(assembly.request.factsFor)
    expect(assembly.authorityFor(200).factsFor).toBe(assembly.request.factsFor)
    expect(() =>
      assembly.request.taskAuthority?.('https://github.com/owner/repo/issues/200#issuecomment-9'),
    ).toThrow('Unexpected read')
    expect(f.trace.some(args => args.some(arg => arg.includes('/environments/')))).toBe(false)
  })

  it('refuses tool changes while remote sources are being loaded', () => {
    const f = fixture()
    f.adopt()
    expect(() =>
      openCollaborationInstallation(f.root, policy.repository, (args, timeout) => {
        const result = f.read(args, timeout)
        if (f.trace.length === 3) writeFileSync(join(f.root, 'changed.ts'), 'changed')
        return result
      }),
    ).toThrow('not clean')
  })
})
