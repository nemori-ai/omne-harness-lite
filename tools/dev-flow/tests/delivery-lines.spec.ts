import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { fileTree, listWorkspaceMembers } from '@omne-harness/repo-toolchain/core/workspace'
import {
  parseDeliveryLines,
  pathOwner,
  scopeOwners,
  targetTrack,
  validateDeliveryLines,
  type DeliveryLines,
} from '../src/delivery/lines.ts'
import { parsePolicy } from '../src/integration/policy.ts'
import { registry, table } from './fixtures/lines.ts'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const members = [
  { path: 'apps/cli' },
  { path: 'packages/model/model' },
  { path: 'packages/model/model-contract' },
  { path: 'packages/session/session' },
  { path: 'tools/dev-flow' },
]
function errors(patch: (lines: DeliveryLines) => void, list = members) {
  return validateDeliveryLines(table(patch), list, registry)
}

describe('line ownership table', () => {
  it('accepts the repository table against its real members and registry', () => {
    const read = (path: string) => JSON.parse(readFileSync(join(repository, path), 'utf8'))
    const real = parseDeliveryLines(read('docs/engineering/delivery-lines.json'))
    expect(
      validateDeliveryLines(
        real,
        listWorkspaceMembers(fileTree(repository), []),
        parsePolicy(read('docs/engineering/integration-policy.json')),
      ),
    ).toEqual([])
  })

  it('accepts the fixture table', () => {
    expect(errors(() => {})).toEqual([])
  })

  it.each([
    [
      'overlapping ownership',
      (t: DeliveryLines) => t.lines[1]?.paths.push('packages/model/model'),
      { code: 'ownership-overlap', at: 'lines[1].paths[1]' },
    ],
    [
      'a missed member',
      (t: DeliveryLines) => t.lines[1]?.paths.splice(0, 1),
      { code: 'member-uncovered', at: 'lines' },
    ],
    [
      'an unregistered track',
      (t: DeliveryLines) => {
        if (t.lines[1] !== undefined) t.lines[1].track = 'session'
      },
      { code: 'track-unregistered', at: 'lines[1].track' },
    ],
    [
      'a contract outside its line',
      (t: DeliveryLines) => t.lines[1]?.contracts.push('packages/model/model-contract'),
      { code: 'contract-outside-line', at: 'lines[1].contracts[0]' },
    ],
  ])('reports exactly one locatable error for %s', (_, patch, expected) => {
    const result = errors(patch)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject(expected)
    expect(result[0]?.message).not.toBe('')
  })

  it('names the uncovered member in the message', () => {
    expect(errors(t => t.lines[1]?.paths.splice(0, 1))[0]?.message).toContain(
      'packages/session/session',
    )
  })

  it('refuses reserved and duplicate line IDs', () => {
    expect(
      errors(t => {
        if (t.lines[1] !== undefined) t.lines[1].id = 'integration'
      }).map(e => e.code),
    ).toEqual(['line-reserved'])
    expect(
      errors(t => {
        if (t.lines[1] !== undefined) t.lines[1].id = 'model'
      }).map(e => e.code),
    ).toEqual(['line-duplicate'])
  })

  it('checks track status and parent and the integration track', () => {
    const track = (id: string) => (t: DeliveryLines) => {
      if (t.lines[1] !== undefined) t.lines[1].track = id
    }
    expect(errors(track('old')).map(e => e.code)).toEqual(['track-status'])
    expect(errors(track('side')).map(e => e.code)).toEqual(['track-parent'])
    expect(
      errors(t => {
        t.integration.track = 'missing'
      }).map(e => e.at),
    ).toEqual(expect.arrayContaining(['integration.track']))
  })

  it('reports a contract that is not a workspace member', () => {
    expect(errors(t => t.lines[0]?.contracts.push('packages/model/gone'))).toEqual([
      expect.objectContaining({ code: 'contract-not-member', at: 'lines[0].contracts[1]' }),
    ])
  })

  it('does not count shared paths as ownership', () => {
    expect(errors(t => t.shared.push('packages/model'))).toEqual([])
  })

  it('refuses unknown fields and unsafe paths when parsing', () => {
    expect(() => parseDeliveryLines({ ...table(), extra: 1 })).toThrow('unknown fields')
    expect(() =>
      parseDeliveryLines(
        table(t => {
          t.integration.paths.push('../outside')
        }),
      ),
    ).toThrow('repository-relative')
    expect(() =>
      parseDeliveryLines(
        table(t => {
          if (t.lines[0] !== undefined) t.lines[0].id = 'Model'
        }),
      ),
    ).toThrow('lowercase line ID')
  })

  it('resolves owners: listed prefix, integration fallback and broad scopes', () => {
    const t = table()
    expect(pathOwner(t, 'packages/model/model/src/index.ts')).toBe('model')
    expect(pathOwner(t, 'apps/cli')).toBe('integration')
    expect(pathOwner(t, 'README.md')).toBe('integration')
    expect(pathOwner(t, 'packages/modelx')).toBe('integration')
    expect([...scopeOwners(t, 'packages/model/model')]).toEqual(['model'])
    expect([...scopeOwners(t, 'packages')].sort()).toEqual([
      'integration',
      'model',
      'session-agent',
    ])
    expect(targetTrack(t, 'model')).toBe('model')
    expect(targetTrack(t, 'session-agent')).toBe('legacy-refactor')
    expect(targetTrack(t, 'integration')).toBe('legacy-refactor')
  })
})

describe('check:lines command', () => {
  const homes: string[] = []
  afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
  function run(lines: unknown) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-lines-')))
    homes.push(root)
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n  - apps/*\n  - tools/dev-flow\n')
    for (const member of members)
      write(`${member.path}/package.json`, JSON.stringify({ name: `@fixture/${member.path}` }))
    write('docs/engineering/delivery-lines.json', JSON.stringify(lines))
    write('docs/engineering/integration-policy.json', JSON.stringify(registry))
    return spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        fileURLToPath(new URL('../src/delivery/lines-cli.ts', import.meta.url)),
        '--root',
        root,
      ],
      { encoding: 'utf8' },
    )
  }

  it('passes a valid table and fails with a located error otherwise', () => {
    const ok = run(table())
    expect(ok.status).toBe(0)
    expect(ok.stdout).toContain('ok (3 lines, 5 workspace members)')
    const bad = run(table(t => t.lines[1]?.paths.splice(0, 1)))
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('lines: member-uncovered: 工作区成员 packages/session/session')
    const broken = run({ ...table(), schemaVersion: 2 })
    expect(broken.status).toBe(2)
  })
})

describe('check:lines owner identity drift', () => {
  const homes: string[] = []
  afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
  const fact = (lineId: string, login: string) => ({
    lineId,
    owner: { login, nodeId: `U_${login}` },
    adoption: {
      comment: {
        url: 'https://github.com/nemori-ai/omne-harness-lite/issues/1#issuecomment-1',
        bodySha256: 'b'.repeat(64),
        updatedAt: '2026-11-01T00:00:00Z',
      },
      authorNodeId: 'U_accepter',
    },
  })
  const manifest = (owners: unknown[]) => ({
    schemaVersion: 1,
    repository: { name: 'nemori-ai/omne-harness-lite', nodeId: 'R_repo' },
    owners,
  })
  function run(identity: unknown) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-lines-')))
    homes.push(root)
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n  - apps/*\n  - tools/dev-flow\n')
    for (const member of members)
      write(`${member.path}/package.json`, JSON.stringify({ name: `@fixture/${member.path}` }))
    write('docs/engineering/delivery-lines.json', JSON.stringify(table()))
    write('docs/engineering/integration-policy.json', JSON.stringify(registry))
    if (identity !== undefined)
      write('docs/engineering/api-review-owners.json', JSON.stringify(identity))
    return spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        fileURLToPath(new URL('../src/delivery/lines-cli.ts', import.meta.url)),
        '--root',
        root,
      ],
      { encoding: 'utf8' },
    )
  }
  const matching = [fact('model', 'model-owner'), fact('session-agent', 'session-owner')]

  it('passes when every identity entry matches the table', () => {
    expect(run(manifest(matching)).status).toBe(0)
  })
  it('fails when a login differs from the table owner', () => {
    const result = run(manifest([fact('model', 'other'), matching[1]]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('owner-identity-drift')
  })
  it('fails when a login differs only by case', () => {
    const result = run(manifest([fact('model', 'Model-Owner'), matching[1]]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('owner-identity-drift')
  })
  it('fails when an identity lineId is not in the table', () => {
    const result = run(manifest([fact('model', 'model-owner'), fact('zzz-gone', 'x')]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('owner-identity-drift')
  })
  it('does not check an absent identity file', () => {
    expect(run(undefined).status).toBe(0)
  })
  it('does not report a table line without an identity entry', () => {
    expect(run(manifest([matching[0]])).status).toBe(0)
  })
  it('refuses an unparsable identity file as unusable input', () => {
    expect(run({ ...manifest(matching), extra: 1 }).status).toBe(2)
  })
})
