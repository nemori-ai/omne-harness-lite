import { afterEach, describe, expect, it } from 'vitest'
import { rmSync, linkSync, symlinkSync, readFileSync, mkdirSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  repository,
  write,
  commit,
  git,
  removeTemporaries,
} from './fixtures/loop-canary/repository.ts'
import {
  CUTOVERS_PATH,
  DELIVERY_CONFIG_PATH,
  cardTexts,
  inspectCurrentSources,
  parseCutovers,
  sha256,
  type Cutovers,
  type CurrentSources,
} from '../src/product/sources.ts'
import { inspectRetire } from '../src/product/retire.ts'

afterEach(removeTemporaries)
const productRoot = '.meta_harness/design/product',
  stories = `${productRoot}/PF-016-test/stories.md`
const story = (id: string) =>
  `### ${id} · card\n\n- **就绪**：是\n- **覆盖场景**：[A01](acceptance.md)\n`
const raw = `# cards\n\n**已发到**：ST-016-02\n\n${story('ST-016-01')}\n${story('ST-016-02')}`
function fixture() {
  const root = repository()
  write(root, stories, raw)
  write(root, `${productRoot}/PF-016-test/README.md`, '---\nrevision: 7\n---\n')
  const base = commit(root, 'legacy cards')
  write(
    root,
    DELIVERY_CONFIG_PATH,
    JSON.stringify({
      schemaVersion: 1,
      kind: 'github-delivery-config',
      protocolVersion: 1,
      enabled: false,
      repository: 'owner/repo',
      mode: 'manual-single-dispatcher',
      project: {
        owner: 'owner',
        number: null,
        id: null,
        url: null,
        fields: { stage: null, priority: null, iteration: null },
      },
      writers: { stage: null, body: null },
      creationHandoffIssue: null,
    }),
  )
  const source = { commit: base, path: stories, blob: git(root, 'rev-parse', `${base}:${stories}`) }
  const cutovers: Cutovers = {
    schemaVersion: 1,
    kind: 'legacy-source-cutovers',
    repository: 'owner/repo',
    topics: [
      {
        topic: 'PF-016',
        history: [source],
        batches: [
          {
            id: 'batch-1',
            source,
            adoption: {
              source: 'https://github.com/owner/repo/issues/4#issuecomment-1',
              decider: 'owner',
              scope: ['ST-016-01'],
            },
            consumers: ['stories', 'retire'],
            removals: [
              {
                card: 'ST-016-01',
                cardSha256: sha256(cardTexts(raw).get('ST-016-01') ?? ''),
                target: {
                  repository: 'owner/repo',
                  nodeId: 'I_one',
                  url: 'https://github.com/owner/repo/issues/1',
                  revision: 1,
                  bodySha256: sha256('first body'),
                },
                readback: {
                  source: 'https://github.com/owner/repo/issues/1',
                  captureSha256: sha256('first capture'),
                  issueUpdatedAt: '2026-10-10T00:00:00Z',
                  alias: 'ST-016-01@7',
                },
              },
            ],
          },
        ],
      },
    ],
  }
  return { root, base, cutovers }
}
function migrate(f: ReturnType<typeof fixture>, trailers = 'Migrated-Card: ST-016-01') {
  write(f.root, CUTOVERS_PATH, JSON.stringify(f.cutovers))
  write(f.root, stories, `# cards\n\n**已发到**：ST-016-02\n\n${story('ST-016-02')}`)
  return commit(f.root, `migration\n\n${trailers}`)
}
function capture(
  root: string,
  options: {
    complete?: boolean
    alias?: string
    id?: string
    duplicate?: boolean
    present?: boolean
  } = {},
) {
  const issue = {
    number: 1,
    id: options.id ?? 'I_one',
    url: 'https://github.com/owner/repo/issues/1',
    state: 'closed',
    updatedAt: '2026-10-10T00:00:00Z',
    body: `# Current title\n- 交付修订：2\n- 旧卡来源别名：${options.alias ?? 'ST-016-01@7'}\n- 产品关联：PF-016 A01`,
    stage: 'Accepted',
    labels: [],
    comments: [],
    commentsComplete: true,
    relationsComplete: true,
    blockedBy: [],
    parentIssue: null,
  }
  const issues =
    options.present === false
      ? []
      : [
          issue,
          ...(options.duplicate
            ? [{ ...issue, id: 'I_two', number: 2, url: 'https://github.com/owner/repo/issues/2' }]
            : []),
        ]
  const path = resolve(root, 'capture.json')
  write(
    root,
    'capture.json',
    JSON.stringify({
      schemaVersion: 1,
      kind: 'github-delivery-capture',
      protocolVersion: 1,
      repository: 'owner/repo',
      projectId: null,
      startedAt: '2026-10-10T00:00:00Z',
      finishedAt: '2026-10-10T00:00:00Z',
      collection: {
        issues: options.complete === false ? 'partial' : 'complete',
        project: 'complete',
        errors: [],
      },
      issues,
    }),
  )
  return path
}
describe('current sources in real Git', () => {
  it('keeps an old checkout legacy-only without config and binds absent inputs', () => {
    const f = fixture()
    rmSync(resolve(f.root, DELIVERY_CONFIG_PATH))
    const r = inspectCurrentSources({ root: f.root, productRoot })
    expect(r.cards.map(c => c.kind)).toEqual(['legacy', 'legacy'])
    expect(r.dailyEnabled).toBe(false)
    expect(r.bindings.filter(b => b.sha256 === null)).toHaveLength(2)
    expect(() =>
      inspectCurrentSources({ root: f.root, productRoot, configPath: 'missing.json' }),
    ).toThrow()
  })
  it('partially switches, keeps stable unknown identity and observes later revisions', () => {
    const f = fixture()
    migrate(f)
    const r = inspectCurrentSources({ root: f.root, productRoot })
    expect(r.cards.map(c => c.kind)).toEqual(['legacy', 'issue'])
    expect(r.cards[1]).toMatchObject({ identity: { id: 'I_one' }, read: { kind: 'unknown' } })
    const observed = inspectCurrentSources({
      root: f.root,
      productRoot,
      capturePath: capture(f.root),
    })
    expect(observed.cards[1]).toMatchObject({
      read: { kind: 'known', revision: 2, state: 'closed', stage: 'Accepted' },
      aliases: [{ id: 'ST-016-01', productRevision: 7 }],
    })
    expect(observed.findings.some(f => f.category === 'deviation')).toBe(false)
  })
  it('distinguishes missing pages, missing target, duplicate aliases, wrong product revision and dual source', () => {
    const f = fixture()
    migrate(f)
    const read = (options: Parameters<typeof capture>[1]) =>
      inspectCurrentSources({ root: f.root, productRoot, capturePath: capture(f.root, options) })
    expect(
      read({ complete: false, present: false }).findings.every(f => f.category !== 'deviation'),
    ).toBe(true)
    expect(read({ present: false }).findings.some(f => f.code === 'missing-target')).toBe(true)
    expect(read({ duplicate: true }).findings.some(f => f.code === 'alias-conflict')).toBe(true)
    expect(read({ alias: 'ST-016-01@2' }).findings.some(f => f.code === 'alias-conflict')).toBe(
      true,
    )
    write(f.root, stories, raw)
    expect(read({}).aliases.find(a => a.id === 'ST-016-01')?.resolution.kind).toBe('conflict')
  })
  it('rejects malformed records and schema before producing CLI JSON', () => {
    const f = fixture()
    expect(() => parseCutovers({ ...f.cutovers, schemaVersion: 2 })).toThrow()
    expect(() =>
      parseCutovers({ ...f.cutovers, topics: [...f.cutovers.topics, ...f.cutovers.topics] }),
    ).toThrow(/duplicate/)
    write(f.root, CUTOVERS_PATH, '{')
    const cli = fileURLToPath(new URL('../src/product/sources-cli.ts', import.meta.url))
    const result = spawnSync(process.execPath, [cli, '--root', f.root], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
  })
  it('runs the actual source-status CLI offline', () => {
    const f = fixture()
    migrate(f)
    const cli = fileURLToPath(new URL('../src/product/sources-cli.ts', import.meta.url))
    const result = spawnSync(process.execPath, [cli, '--root', f.root], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'current-source-observation',
      dailyEnabled: false,
      completeness: 'unknown',
    })
  })
})
describe('cutover history in real Git', () => {
  it('accepts independent migration, rejects double disposition and missing batch', () => {
    const f = fixture()
    migrate(f)
    expect(inspectRetire(f.root, f.base, productRoot).violations).toEqual([])
    const other = fixture()
    migrate(other, 'Accepted-Card: ST-016-01\nMigrated-Card: ST-016-01')
    expect(inspectRetire(other.root, other.base, productRoot).violations.join()).toMatch(/不止一次/)
    const missing = fixture()
    migrate(missing)
    git(missing.root, 'reset', '--soft', missing.base)
    rmSync(resolve(missing.root, CUTOVERS_PATH))
    commit(missing.root, 'bad\n\nMigrated-Card: ST-016-01')
    expect(inspectRetire(missing.root, missing.base, productRoot).violations.join()).toMatch(
      /新增切换/,
    )
  })
  it('preserves history when deleting an empty container without inventing migrated cards', () => {
    const f = fixture()
    migrate(f)
    write(f.root, stories, '**已发到**：ST-016-02\n')
    commit(f.root, 'accept remaining\n\nAccepted-Card: ST-016-02')
    rmSync(resolve(f.root, stories))
    commit(f.root, 'remove empty container')
    expect(inspectRetire(f.root, f.base, productRoot).violations).toEqual([])
    write(f.root, CUTOVERS_PATH, JSON.stringify({ ...f.cutovers, topics: [] }))
    commit(f.root, 'remove anchor')
    expect(inspectRetire(f.root, f.base, productRoot).violations.join()).toMatch(/被删除|丢失/)
  })
  it('rejects changes to immutable batches and bad bound source card text', () => {
    const f = fixture()
    const migrated = migrate(f)
    const altered = JSON.parse(JSON.stringify(f.cutovers))
    altered.topics[0].batches[0].adoption.decider = 'someone else'
    write(f.root, CUTOVERS_PATH, JSON.stringify(altered))
    commit(f.root, 'rewrite adoption')
    expect(inspectRetire(f.root, migrated, productRoot).violations.join()).toMatch(/改写/)
    const bad = fixture()
    const record = JSON.parse(JSON.stringify(bad.cutovers))
    record.topics[0].batches[0].removals[0].cardSha256 = '0'.repeat(64)
    migrate({ ...bad, cutovers: record })
    expect(inspectRetire(bad.root, bad.base, productRoot).violations.join()).toMatch(/摘要不符/)
  })
  it('inherits a batch from either merge parent without demanding another trailer', () => {
    for (const reverse of [false, true]) {
      const f = fixture()
      git(f.root, 'branch', 'other', f.base)
      migrate(f)
      git(f.root, 'checkout', 'other')
      write(f.root, 'other.txt', 'other')
      commit(f.root, 'parallel')
      if (reverse) git(f.root, 'checkout', 'main')
      git(f.root, 'merge', '--no-ff', reverse ? 'other' : 'main', '-m', 'merge cutovers')
      expect(inspectRetire(f.root, f.base, productRoot).violations).toEqual([])
    }
  })
  it('rejects unknown historical schema as a tool error', () => {
    const f = fixture()
    write(f.root, CUTOVERS_PATH, JSON.stringify({ ...f.cutovers, schemaVersion: 999 }))
    commit(f.root, 'unknown schema')
    expect(() => inspectRetire(f.root, f.base, productRoot)).toThrow(/schema/)
  })
})

describe('cutover counterexamples', () => {
  it('rejects traversal, short refs, extra fields, wrong adoption scope and duplicate migrations', () => {
    const f = fixture()
    const cases = [
      (v: Record<string, unknown>) => {
        v.extra = 'business title'
      },
      (v: Record<string, unknown>) => {
        v.repository = 'other/repo'
      },
    ]
    for (const mutate of cases) {
      const value = { ...f.cutovers }
      mutate(value)
      expect(() => parseCutovers(value)).toThrow()
    }
    for (const rawValue of [
      JSON.stringify(f.cutovers).replace('"commit":"' + f.base + '"', '"commit":"HEAD"'),
      JSON.stringify(f.cutovers).replace(stories, '../stories.md'),
      JSON.stringify(f.cutovers).replace('"scope":["ST-016-01"]', '"scope":[]'),
      JSON.stringify(f.cutovers).replace('"alias":"ST-016-01@7"', '"alias":"ST-016-02@7"'),
    ])
      expect(() => parseCutovers(JSON.parse(rawValue))).toThrow()
    const topic = f.cutovers.topics[0]
    if (topic === undefined) throw new Error('fixture topic missing')
    expect(() =>
      parseCutovers({
        ...f.cutovers,
        topics: [{ ...topic, batches: [...topic.batches, ...topic.batches] }],
      }),
    ).toThrow(/duplicate/)
  })
  it('rejects lower current water even when an anchor preserves the higher historical water', () => {
    const f = fixture()
    migrate(f)
    write(f.root, stories, '**已发到**：ST-016-01\n')
    commit(f.root, 'lower current water\n\nAccepted-Card: ST-016-02')
    expect(inspectRetire(f.root, f.base, productRoot).violations.join()).toMatch(/低于历史|改小/)
  })
  it('checks raw card text in every merge parent', () => {
    const f = fixture()
    git(f.root, 'branch', 'other', f.base)
    write(f.root, 'left.txt', 'left')
    const left = commit(f.root, 'left')
    git(f.root, 'checkout', 'other')
    write(f.root, stories, raw.replace('· card', '· changed'))
    const right = commit(f.root, 'changed source')
    git(f.root, 'checkout', 'main')
    migrate(f)
    const tree = git(f.root, 'rev-parse', 'HEAD^{tree}')
    const merge = git(
      f.root,
      'commit-tree',
      tree,
      '-p',
      left,
      '-p',
      right,
      '-m',
      'merge migration\n\nMigrated-Card: ST-016-01',
    )
    git(f.root, 'reset', '--hard', merge)
    expect(inspectRetire(f.root, f.base, productRoot).violations.join()).toMatch(/父版本原文冲突/)
  })
  it('requires all merge parents to preserve a batch identity with identical content', () => {
    const f = fixture()
    const initial = migrate(f)
    git(f.root, 'branch', 'other', initial)
    write(f.root, 'left.txt', 'left')
    const left = commit(f.root, 'left')
    git(f.root, 'checkout', 'other')
    const changed = JSON.parse(JSON.stringify(f.cutovers))
    changed.topics[0].batches[0].adoption.decider = 'different'
    write(f.root, CUTOVERS_PATH, JSON.stringify(changed))
    const right = commit(f.root, 'alter parent record')
    const tree = git(f.root, 'rev-parse', `${left}^{tree}`)
    const merged = git(f.root, 'commit-tree', tree, '-p', left, '-p', right, '-m', 'merge')
    git(f.root, 'reset', '--hard', merged)
    expect(inspectRetire(f.root, initial, productRoot).violations.join()).toMatch(
      /各父版本记录冲突/,
    )
  })
  it('runs retire CLI for a valid migrated batch and for malformed historical schema', () => {
    const f = fixture()
    migrate(f)
    const cli = fileURLToPath(new URL('../src/product/retire-cli.ts', import.meta.url))
    const good = spawnSync(process.execPath, [cli, '--root', f.root, '--base', f.base], {
      encoding: 'utf8',
    })
    expect(good.status).toBe(0)
    expect(good.stdout).toContain('迁出 ST-016-01')
    expect(good.stdout).toContain('unknown: ST-016-01 首次远端读回真实性未核')
    write(f.root, CUTOVERS_PATH, '{')
    commit(f.root, 'broken input')
    const bad = spawnSync(process.execPath, [cli, '--root', f.root, '--base', f.base], {
      encoding: 'utf8',
    })
    expect(bad.status).toBe(2)
    expect(bad.stdout).toBe('')
  })
})

describe('source report output boundary', () => {
  it('refuses to overwrite existing and absent observation inputs', () => {
    const f = fixture()
    const cli = fileURLToPath(new URL('../src/product/sources-cli.ts', import.meta.url))
    linkSync(resolve(f.root, stories), resolve(f.root, 'hardlink.md'))
    symlinkSync(resolve(f.root, CUTOVERS_PATH), resolve(f.root, 'dangling.json'))
    for (const output of [
      stories,
      DELIVERY_CONFIG_PATH,
      CUTOVERS_PATH,
      'hardlink.md',
      'dangling.json',
    ]) {
      const result = spawnSync(
        process.execPath,
        [cli, '--root', f.root, '--report', resolve(f.root, output)],
        { encoding: 'utf8' },
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('must not overwrite')
    }
    expect(inspectCurrentSources({ root: f.root, productRoot }).cards).toHaveLength(2)
  })
})

describe('selected source inputs across real CLIs', () => {
  const cli = fileURLToPath(new URL('../src/product/sources-cli.ts', import.meta.url))
  const python = fileURLToPath(
    new URL('../../../.meta_harness/tooling/src/stories.py', import.meta.url),
  )
  function observe(root: string, args: string[] = []): CurrentSources {
    const result = spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    return JSON.parse(result.stdout)
  }
  function consume(root: string, report: CurrentSources) {
    write(root, 'projection.json', JSON.stringify(report))
    return spawnSync(
      'python3',
      [
        python,
        '--root',
        resolve(root, '.meta_harness/design'),
        '--source-observation',
        resolve(root, 'projection.json'),
      ],
      { encoding: 'utf8' },
    )
  }
  function emptyFixture() {
    const f = fixture()
    rmSync(resolve(f.root, stories))
    write(f.root, CUTOVERS_PATH, JSON.stringify({ ...f.cutovers, topics: [] }))
    return f
  }
  it('B1 reports the enabled unread Issue queue as unknown, and disabled legacy as complete', () => {
    const { root } = emptyFixture()
    expect(observe(root).completeness).toBe('complete')
    const config = JSON.parse(readFileSync(resolve(root, DELIVERY_CONFIG_PATH), 'utf8'))
    write(root, DELIVERY_CONFIG_PATH, JSON.stringify({ ...config, enabled: true }))
    const report = observe(root)
    expect(report.cards).toEqual([])
    expect(report.completeness).toBe('unknown')
    expect(report.findings.map(f => f.code)).toContain('issue-queue-unread')
    expect(consume(root, report).status).toBe(0)
    for (const completeness of ['complete', 'partial'] as const)
      expect(consume(root, { ...report, completeness }).status).toBe(2)
  })
  it('B2 rejects an omitted config binding even after a same-HEAD config change', () => {
    const { root } = emptyFixture()
    const report = observe(root)
    const head = git(root, 'rev-parse', 'HEAD')
    write(
      root,
      DELIVERY_CONFIG_PATH,
      readFileSync(resolve(root, DELIVERY_CONFIG_PATH), 'utf8') + ' ',
    )
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head)
    expect(consume(root, report).status).toBe(2)
    expect(
      consume(root, {
        ...report,
        bindings: report.bindings.filter(b => b.path !== report.inputRoles.config.path),
      }).status,
    ).toBe(2)
  })
  it.each(['plain', 'parent-link', 'dangling-link', 'parent-dotdot'])(
    'round trips missing defaults and cutovers through %s paths',
    layout => {
      const { root } = emptyFixture()
      rmSync(resolve(root, DELIVERY_CONFIG_PATH))
      rmSync(resolve(root, CUTOVERS_PATH))
      if (layout === 'parent-link') {
        renameSync(resolve(root, 'docs/engineering'), resolve(root, 'actual-engineering'))
        symlinkSync('../actual-engineering', resolve(root, 'docs/engineering'))
      } else if (layout === 'dangling-link') {
        symlinkSync('../../missing/config.json', resolve(root, DELIVERY_CONFIG_PATH))
        symlinkSync('../../missing/cutovers.json', resolve(root, CUTOVERS_PATH))
      } else if (layout === 'parent-dotdot') {
        mkdirSync(resolve(root, 'nested/child'), { recursive: true })
        symlinkSync('../../nested/child', resolve(root, 'docs/engineering/link'))
        symlinkSync('link/../config.json', resolve(root, DELIVERY_CONFIG_PATH))
      }
      const report = observe(root)
      if (layout === 'parent-dotdot')
        expect(report.inputRoles.config.path).toBe(resolve(root, 'nested/config.json'))
      expect(report.inputRoles.config.selection).toBe('default')
      expect(report.inputRoles.capture).toEqual({ kind: 'none' })
      expect(report.bindings.every(b => b.sha256 === null)).toBe(true)
      const result = consume(root, report)
      expect(result.status, result.stderr).toBe(0)
    },
  )
  it('round trips explicit external config/capture and rejects same-HEAD capture edits', () => {
    const { root } = emptyFixture()
    const external = repository()
    write(external, 'config.json', readFileSync(resolve(root, DELIVERY_CONFIG_PATH), 'utf8'))
    const capturePath = capture(external, { present: false })
    symlinkSync(resolve(external, 'config.json'), resolve(root, 'config-link.json'))
    symlinkSync(capturePath, resolve(root, 'capture-link.json'))
    const report = observe(root, ['--config', 'config-link.json', '--capture', 'capture-link.json'])
    expect(report.inputRoles).toEqual({
      config: { selection: 'explicit', path: resolve(external, 'config.json') },
      cutovers: { path: resolve(root, CUTOVERS_PATH) },
      capture: { kind: 'file', path: capturePath },
    })
    expect(consume(root, report).status).toBe(0)
    write(external, 'capture.json', readFileSync(capturePath, 'utf8') + ' ')
    expect(consume(root, report).status).toBe(2)
    expect(
      consume(root, { ...report, bindings: report.bindings.filter(b => b.path !== capturePath) })
        .status,
    ).toBe(2)
  })
  it('rejects looping links as input errors without JSON', () => {
    const { root } = emptyFixture()
    rmSync(resolve(root, DELIVERY_CONFIG_PATH))
    symlinkSync('github-delivery.json', resolve(root, DELIVERY_CONFIG_PATH))
    const result = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
  })
})
