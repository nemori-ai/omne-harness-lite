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
import {
  adoptCollaborationProducer,
  openCollaborationInstallation,
} from '../src/delivery/collaboration-bootstrap.ts'
import { factsRunName } from '../src/integration/prepared-facts-run.ts'
import type { FactsDeployment } from '../src/integration/published-delivery-facts.ts'
import { installCollaborationCli } from '../src/delivery/collaboration-install-cli.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { backend, block, dispatch, policy, rawComment } from './fixtures/collaboration-authority.ts'
import { FACTS_MARKER } from '../src/integration/delivery-facts-record.ts'
import { evidence } from './fixtures/collaboration.ts'
import { openReduceInstallation } from '../src/delivery/reduce-bootstrap.ts'

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
    `Fixture tool ${root}`,
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
  it('refuses reduce execution with an installation that did not adopt the gate revision', () => {
    const f = fixture()
    f.adopt()
    expect(() => openReduceInstallation(f.root, policy.repository, f.read)).toThrow(
      'reduce-gate-installation-v3-required',
    )
    expect(f.trace).toEqual([])
  })

  it('assembles reduce ports using only the adopted gate revision and shared report readers', () => {
    const f = fixture()
    const installation = {
      ...f.installation,
      schemaVersion: 3,
      gateWorkflow: {
        path: '.github/workflows/gate-publish.yml',
        ref: 'github-gate',
        head: 'a'.repeat(40),
      },
    }
    const text = JSON.stringify(installation)
    installCollaboration(f.root, text, digest(text))
    const ports = openReduceInstallation(f.root, policy.repository, f.read)
    expect(ports.gateWorkflowHead).toBe('a'.repeat(40))
    expect(ports.verifyCandidateEvidence).toBeTypeOf('function')
    expect(ports.verifyWaveEvidence).toBeTypeOf('function')
    expect(f.trace.every(args => args[2] === 'GET')).toBe(true)
    expect(() => ports.read(['api', '--method', 'POST', 'anything'], 1)).toThrow(
      'collaboration-installation-read-only',
    )
  })
  function historicalInstallation(version: 2 | 3 = 2) {
    const f = fixture()
    const workflow = {
      id: 9,
      path: '.github/workflows/delivery-facts.yml',
      ref: 'github-gate',
      head: f.head,
    }
    return {
      f,
      input: {
        ...f.installation,
        schemaVersion: version,
        ...(version === 3
          ? {
              gateWorkflow: {
                path: '.github/workflows/gate-publish.yml',
                ref: 'github-gate',
                head: f.head,
              },
            }
          : {}),
        facts: {
          kind: 'published',
          workflow,
          bot: { login: 'fixed[bot]', nodeId: 'BOT_fixed' },
          historicalWorkflows: [{ ...workflow, head: '9'.repeat(40) }],
        },
      },
    }
  }

  it('adopts explicit v2 historical workflows without a fictitious prior descriptor', () => {
    const { f, input } = historicalInstallation()
    const text = JSON.stringify(input)
    expect(installCollaboration(f.root, text, digest(text))).toEqual(input)
    const assembly = openCollaborationInstallation(f.root, policy.repository, f.read)
    expect(assembly.installation).toEqual(input)
    expect(assembly.request.factsFor).toBeDefined()
    expect(assembly.prepareFacts).toBeUndefined()
    expect(f.trace.every(args => args[2] === 'GET')).toBe(true)
  })

  it.each(['direct', 'published'])(
    'pins the publishing workflow independently in a v3 %s installation',
    kind => {
      const { f, input: historical } = historicalInstallation()
      const input = {
        ...(kind === 'direct' ? f.installation : historical),
        schemaVersion: 3,
        gateWorkflow: {
          path: '.github/workflows/gate-publish.yml',
          ref: 'github-gate',
          head: '8'.repeat(40),
        },
      }
      const text = JSON.stringify(input)
      expect(installCollaboration(f.root, text, digest(text))).toEqual(input)
      expect(openCollaborationInstallation(f.root, policy.repository, f.read).installation).toEqual(
        input,
      )
    },
  )

  it.each([
    undefined,
    { path: '.github/workflows/other.yml', ref: 'github-gate', head: '8'.repeat(40) },
    { path: '.github/workflows/gate-publish.yml', ref: 'main', head: '8'.repeat(40) },
    { path: '.github/workflows/gate-publish.yml', ref: 'github-gate', head: 'HEAD' },
  ])('rejects missing or unpinned gate identity in v3: %j', gateWorkflow => {
    const f = fixture()
    expect(() =>
      parseCollaborationInstallation({ ...f.installation, schemaVersion: 3, gateWorkflow }),
    ).toThrow()
  })

  it('does not reinterpret a legacy descriptor as an adopted publish workflow', () => {
    const f = fixture()
    expect(() =>
      parseCollaborationInstallation({
        ...f.installation,
        gateWorkflow: {
          path: '.github/workflows/gate-publish.yml',
          ref: 'github-gate',
          head: f.head,
        },
      }),
    ).toThrow('unknown fields gateWorkflow')
  })

  it.each([2, 3] as const)(
    'supplies adopted history through the installed v%s request and watch readers',
    version => {
      const { f, input } = historicalInstallation(version)
      const declaration = dispatch()
      const historical = input.facts.historicalWorkflows[0]!
      const facts = {
        schemaVersion: 1,
        nonce: '0'.repeat(32),
        run: 202,
        issue: 100,
        authority: {
          url: declaration.html_url,
          author: declaration.user.login,
          authorNodeId: declaration.user.node_id,
          bodySha256: digest(declaration.body),
          updatedAt: declaration.updated_at,
          reviewer: true,
        },
        project: {
          id: JSON.parse(f.files.get(policy.deliveryConfig)!).project.id,
          item: 'ITEM_1',
          stage: 'Ready',
        },
      }
      const comment = rawComment(
        20,
        block(FACTS_MARKER, facts),
        '2026-10-27T10:00:30Z',
        input.facts.bot.login,
      )
      comment.user = { ...input.facts.bot, node_id: input.facts.bot.nodeId, type: 'Bot' }
      const api = backend(undefined, [declaration, comment])
      const run = {
        id: 202,
        workflow_id: historical.id,
        path: historical.path,
        head_branch: historical.ref,
        head_sha: historical.head,
        event: 'workflow_dispatch',
        run_attempt: 1,
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-10-27T10:00:00Z',
        run_started_at: '2026-10-27T10:00:01Z',
        updated_at: '2026-10-27T10:01:00Z',
        repository: { full_name: policy.repository },
        head_repository: { full_name: policy.repository },
      }
      const read: GhRead = (args, timeout) => {
        expect(args[2]).toBe('GET')
        const path = args.at(-1) ?? ''
        if (path.includes('/contents/')) return f.read(args, timeout)
        if (/\/actions\/runs\/202(?:\/attempts\/1)?$/.test(path)) return structuredClone(run)
        return structuredClone(api.read(args, timeout))
      }
      const text = JSON.stringify(input)
      installCollaboration(f.root, text, digest(text))
      const assembly = openCollaborationInstallation(f.root, policy.repository, read)
      expect(assembly.request.factsFor?.(declaration.html_url)).toEqual(facts.authority)
      expect(assembly.watch.taskFactsFor?.(declaration.html_url)).toEqual(facts.authority)
      expect(assembly.authorityFor(100).factsFor?.(declaration.html_url)).toEqual(facts.authority)
      run.head_sha = '8'.repeat(40)
      expect(() => assembly.request.factsFor?.(declaration.html_url)).toThrow(
        'workflow provenance mismatch',
      )
    },
  )

  it.each([
    'missing',
    'current-repeated',
    'history-repeated',
    'wrong-path',
    'wrong-ref',
    'wrong-head',
    'extra-field',
    'v1-history',
    'unknown-version',
  ])('rejects invalid history adoption: %s', defect => {
    const { input } = historicalInstallation()
    const value: Record<string, unknown> = structuredClone(input)
    const history = input.facts.historicalWorkflows[0]!
    if (defect === 'missing')
      value.facts = { kind: 'published', workflow: input.facts.workflow, bot: input.facts.bot }
    if (defect === 'current-repeated') input.facts.historicalWorkflows = [input.facts.workflow]
    if (defect === 'history-repeated') input.facts.historicalWorkflows.push(history)
    if (defect === 'wrong-path') history.path = '.github/workflows/other.yml'
    if (defect === 'wrong-ref') history.ref = 'main'
    if (defect === 'wrong-head') history.head = 'HEAD'
    if (defect === 'extra-field') value.facts = { ...input.facts, acceptor: 'caller' }
    if (defect === 'v1-history') value.schemaVersion = 1
    if (defect === 'unknown-version') value.schemaVersion = 3
    if (!['missing', 'extra-field'].includes(defect)) value.facts = input.facts
    expect(() => parseCollaborationInstallation(value)).toThrow()
  })

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

describe('installed producer continuity', () => {
  function published(
    f: ReturnType<typeof fixture>,
    head: string,
    history: FactsDeployment['workflow'][] = [],
    version: 2 | 3 = 2,
  ) {
    return {
      ...f.installation,
      schemaVersion: version,
      ...(version === 3
        ? { gateWorkflow: { path: '.github/workflows/gate-publish.yml', ref: 'github-gate', head } }
        : {}),
      facts: {
        kind: 'published' as const,
        workflow: { id: 9, path: '.github/workflows/delivery-facts.yml', ref: 'github-gate', head },
        bot: { login: 'fixed[bot]', nodeId: 'BOT_fixed' },
        historicalWorkflows: history,
      },
    }
  }
  function install(
    f: ReturnType<typeof fixture>,
    input: ReturnType<typeof published>,
    flags: string[] = [],
    read = f.read,
  ) {
    const text = JSON.stringify(input)
    const path = join(f.root, '.git', 'producer-descriptor.json')
    writeFileSync(path, text)
    return JSON.parse(
      installCollaborationCli(
        ['--descriptor', path, '--sha256', digest(text), ...flags],
        f.root,
        read,
      ),
    )
  }

  // These adoption cases repeatedly start real Git processes to validate both tool checkouts.
  it.each([1, 2])(
    'requires explicit producer adoption for schema %s',
    { tags: ['slow'] },
    version => {
      const f = fixture()
      const input = published(f, f.head)
      const text = JSON.stringify(
        version === 2
          ? input
          : {
              ...input,
              schemaVersion: 1,
              facts: { kind: 'published', workflow: input.facts.workflow, bot: input.facts.bot },
            },
      )
      installCollaboration(f.root, text, digest(text))
      expect(
        openCollaborationInstallation(f.root, policy.repository, f.read).prepareFacts,
      ).toBeUndefined()
      adoptCollaborationProducer(f.root, { kind: 'initial' }, f.read)
      expect(
        openCollaborationInstallation(f.root, policy.repository, f.read).prepareFacts,
      ).toBeTypeOf('function')
      adoptCollaborationProducer(f.root, { kind: 'initial' }, f.read)
      expect(f.trace.every(args => args[2] === 'GET')).toBe(true)
    },
  )

  it.each([2, 3] as const)(
    'transfers a real v2 preparation journal into v%s through the CLI and resumes only its original run',
    { tags: ['slow'] },
    version => {
      const old = fixture(),
        next = fixture()
      const initial = published(old, '1'.repeat(40))
      const replacement = published(next, '2'.repeat(40), [initial.facts.workflow], version)
      const declaration = dispatch(),
        api = backend(undefined, [declaration])
      const runs = new Map<number, Record<string, unknown>>()
      const posts: string[][] = []
      let current = initial.facts.workflow
      const read: GhRead = (args, timeout) => {
        const path = args.find(arg => arg.startsWith('repos/')) ?? ''
        if (path.includes('/contents/')) {
          return path.endsWith(`?ref=${old.head}`)
            ? old.read(args, timeout)
            : next.read(args, timeout)
        }
        if (args[2] === 'POST') {
          posts.push([...args])
          const fields = Object.fromEntries(
            args
              .filter(arg => arg.startsWith('inputs['))
              .map(arg => {
                const end = arg.indexOf(']=')
                return [arg.slice(7, end), arg.slice(end + 2)]
              }),
          )
          const id = 200 + posts.length
          runs.set(id, {
            id,
            workflow_id: current.id,
            path: current.path,
            head_branch: current.ref,
            head_sha: current.head,
            event: 'workflow_dispatch',
            run_attempt: 1,
            display_title: factsRunName({
              issue: fields.issue!,
              authority: fields.authority!,
              nonce: fields.nonce!,
            }),
            status: 'queued',
            conclusion: null,
            created_at: '2026-10-27T10:00:00Z',
            repository: { full_name: policy.repository },
            head_repository: { full_name: policy.repository },
          })
          return {
            workflow_run_id: id,
            run_url: `https://api.github.com/repos/${policy.repository}/actions/runs/${id}`,
            html_url: `https://github.com/${policy.repository}/actions/runs/${id}`,
          }
        }
        if (path.endsWith('/actions/workflows/9'))
          return { id: current.id, path: current.path, state: 'active' }
        if (path.includes('/git/ref/heads/'))
          return { ref: `refs/heads/${current.ref}`, object: { sha: current.head } }
        const match = /\/actions\/runs\/(\d+)(?:\/attempts\/1)?$/.exec(path)
        if (match !== null) return structuredClone(runs.get(Number(match[1])))
        return structuredClone(api.read(args, timeout))
      }
      expect(install(old, initial, ['--initial-producer'], read).producer).toBe('initialized')
      const prior = openCollaborationInstallation(old.root, policy.repository, read).prepareFacts!
      expect(prior(declaration.html_url)).toMatchObject({
        status: 'pending',
        generation: 1,
        run: { id: 201 },
      })
      const journal = join(old.root, '.git', 'omne-facts-preparation')
      const slot = readdirSync(journal)[0]!
      const original = readFileSync(join(journal, slot, 'intent-1.json'))
      const originalReceipt = readFileSync(join(journal, slot, 'run-1.json'))
      const originalInstallation = JSON.parse(
        readFileSync(join(old.root, '.git', 'omne-collaboration-installation.json'), 'utf8'),
      )
      current = replacement.facts.workflow
      expect(install(next, replacement, ['--producer-from', old.root], read).producer).toBe(
        'transferred',
      )
      expect(prior(declaration.html_url)).toMatchObject({
        status: 'unknown',
        diagnostic: 'producer-retired',
      })
      expect(
        openCollaborationInstallation(old.root, policy.repository, read).prepareFacts,
      ).toBeUndefined()
      const prepare = openCollaborationInstallation(
        next.root,
        policy.repository,
        read,
      ).prepareFacts!
      expect(prepare(declaration.html_url)).toMatchObject({
        status: 'pending',
        generation: 1,
        run: { id: 201 },
      })
      expect(posts).toHaveLength(1)
      Object.assign(runs.get(201)!, { status: 'completed', conclusion: 'failure' })
      expect(prepare(declaration.html_url, { retryFailed: true })).toMatchObject({
        status: 'pending',
        generation: 2,
        run: { id: 202 },
      })
      expect(runs.get(202)?.head_sha).toBe(current.head)
      expect(install(next, replacement, ['--producer-from', old.root], read).producer).toBe(
        'transferred',
      )
      const destination = join(next.root, '.git', 'omne-facts-preparation', slot)
      expect(readFileSync(join(destination, 'intent-1.json'))).toEqual(original)
      expect(readFileSync(join(destination, 'run-1.json'))).toEqual(originalReceipt)
      expect(
        JSON.parse(readFileSync(join(next.root, '.git', 'omne-facts-producer.json'), 'utf8'))
          .installations,
      ).toContainEqual(originalInstallation)
      expect(
        JSON.parse(readFileSync(join(destination, 'intent-2.json'), 'utf8')).binding.deployment
          .workflow,
      ).toEqual(current)
      expect(posts).toHaveLength(2)
    },
  )

  it.each(['workflow', 'bot', 'project'] as const)(
    'does not derive %s trust from a predecessor descriptor',
    { tags: ['slow'] },
    mismatch => {
      const old = fixture(),
        next = fixture()
      const initial = published(old, '1'.repeat(40))
      const replacement = published(
        next,
        '2'.repeat(40),
        mismatch === 'workflow' ? [] : [initial.facts.workflow],
      )
      install(old, initial, ['--initial-producer'])
      if (mismatch === 'bot') replacement.facts.bot.nodeId = 'OTHER_BOT'
      if (mismatch === 'project') {
        const config = JSON.parse(next.files.get(policy.deliveryConfig)!)
        config.project.id = 'OTHER_PROJECT'
        next.files.set(policy.deliveryConfig, JSON.stringify(config))
      }
      const read: GhRead = (args, timeout) =>
        (args.at(-1)?.endsWith(`?ref=${next.head}`) ? next : old).read(args, timeout)
      expect(() => install(next, replacement, ['--producer-from', old.root], read)).toThrow(
        /not-adopted|identity-migration/,
      )
      expect(() => readFileSync(join(next.root, '.git', 'omne-facts-producer.json'))).toThrow()
    },
  )

  it('rejects conflicting producer CLI modes before recording an installation', () => {
    const f = fixture(),
      input = published(f, f.head)
    expect(() => install(f, input, ['--initial-producer', '--producer-from', f.root])).toThrow(
      'options',
    )
    expect(() => readCollaborationInstallation(f.root, policy.repository)).toThrow('required')
  })
})
