// 场景状态报告：四种状态各由「有没有卡、有没有验收覆盖」推出；跨 topic 引用的卡算在场景所在的 topic；
// 入口读真实目录结构、只报告、退出 0。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { scenarioStatuses, renderScenarioStatus } from '../src/acceptance/scenario-status.ts'
import { scenarioRows } from '../src/product/scenarios.ts'
import type { DeliveryConfig, DeliveryCapture } from '../src/delivery/protocol.ts'
import type { CurrentSources } from '../src/product/sources.ts'

const topics = [
  {
    dir: 'PF-016-cli',
    topic: 'PF-016',
    scenarios: scenarioRows('| S1 |\n| S2 |\n| S3 |\n| S4 |\n'),
  },
  { dir: 'PF-017-center', topic: 'PF-017', scenarios: scenarioRows('| A01 |\n') },
  { dir: 'PF-018-empty', topic: 'PF-018', scenarios: scenarioRows('没有编号\n') },
]
const card = (id: string, covers: string) =>
  `### ${id} · 一张卡\n- **覆盖场景**：${covers}\n- **就绪**：是\n`
const sources: CurrentSources = {
  schemaVersion: 1,
  kind: 'current-source-observation',
  root: '/',
  productRoot: '/product',
  head: 'test',
  dailyEnabled: false,
  inputRoles: {
    config: { selection: 'default', path: '/repo/docs/engineering/github-delivery.json' },
    cutovers: { path: '/repo/docs/engineering/source-cutovers.json' },
    capture: { kind: 'none' },
  },
  bindings: [],
  aliases: [],
  completeness: 'complete',
  findings: [],
  cards: [
    {
      kind: 'legacy',
      id: 'ST-016-02',
      path: 'stories.md',
      topic: 'PF-016',
      title: '卡',
      scenarios: [
        { topic: 'PF-016', id: 'S2' },
        { topic: 'PF-017', id: 'A01' },
      ],
    },
    {
      kind: 'legacy',
      id: 'ST-016-03',
      path: 'stories.md',
      topic: 'PF-016',
      title: '卡',
      scenarios: [{ topic: 'PF-016', id: 'S3' }],
    },
  ],
}
const declarations = [
  { path: 'apps/cli/acceptance/PF-016.a.acceptance.ts', covers: [{ topic: 'PF-016', id: 'S1' }] },
  {
    path: 'apps/cli/acceptance/PF-016.b.acceptance.ts',
    covers: [
      { topic: 'PF-016', id: 'S2' },
      { topic: 'PF-017', id: 'A01' },
    ],
  },
]

describe('场景事实', () => {
  it('keeps enabled unread native Issue activity unknown when no cards are selected', () => {
    const statuses = scenarioStatuses(
      topics,
      { ...sources, dailyEnabled: true, cards: [], completeness: 'unknown' },
      [],
    )
    for (const topic of statuses)
      for (const scenario of topic.scenarios)
        expect(scenario.activity).toEqual({
          cards: [],
          unassociated: [],
          completeness: 'unknown',
          dailyEnabled: true,
        })
  })
  it('覆盖声明与关联卡分别报告，覆盖声明不能产生执行或有效接受', () => {
    const statuses = scenarioStatuses(topics, sources, declarations)
    expect(statuses.map(topic => topic.dir)).toEqual(['PF-016-cli', 'PF-017-center'])
    expect(statuses[0]?.scenarios[0]?.coverageDeclarations).toEqual([
      'apps/cli/acceptance/PF-016.a.acceptance.ts',
    ])
    expect(statuses[1]?.scenarios[0]?.activity.cards).toEqual([sources.cards[0]])
    for (const topic of statuses)
      for (const scenario of topic.scenarios) {
        expect(scenario.execution.kind).toBe('unknown')
        expect(scenario.acceptance.kind).toBe('unknown')
      }
  })

  it('closed、Accepted Stage 与未读Issue都不能变成有效接受或空活动', () => {
    const identity = {
      repository: 'a/b',
      id: 'I_1',
      url: 'https://github.com/a/b/issues/1',
      number: 1,
    }
    const observation: CurrentSources = {
      ...sources,
      completeness: 'partial',
      cards: [
        {
          kind: 'issue',
          identity,
          aliases: [],
          read: {
            kind: 'known',
            title: '卡',
            revision: 2,
            scenarios: [{ topic: 'PF-016', id: 'S1' }],
            state: 'closed',
            stage: 'Accepted',
          },
        },
        {
          kind: 'issue',
          identity: { ...identity, id: 'I_2', number: 2, url: 'https://github.com/a/b/issues/2' },
          aliases: [{ id: 'ST-016-01', productRevision: 1 }],
          read: { kind: 'unknown', reason: '缺页' },
        },
      ],
    }
    const statuses = scenarioStatuses(topics, observation, declarations)
    expect(statuses[0]?.scenarios[0]?.activity.cards).toHaveLength(1)
    expect(statuses[0]?.scenarios[3]?.activity.unassociated).toHaveLength(1)
    expect(statuses[0]?.scenarios[3]?.activity.completeness).toBe('partial')
    const text = renderScenarioStatus(statuses, ['一条备注']).join('\n')
    expect(text).toContain('平台 closed，Stage Accepted')
    expect(text).toContain('平台活动 unknown：缺页')
    expect(text).toContain('有效接受 unknown')
    expect(text).toContain('日常禁用')
    expect(text).not.toContain('已交付')
    expect(text).not.toContain('交付中')
  })
})

describe('场景状态入口', { timeout: 60_000 }, () => {
  const made: string[] = []
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
  })
  const cli = fileURLToPath(new URL('../src/acceptance/scenario-status-cli.ts', import.meta.url))
  const sourceCli = fileURLToPath(new URL('../src/product/sources-cli.ts', import.meta.url))
  const write = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  it('读检出里的产品区与验收；覆盖声明有错只提一句，照样退出 0', () => {
    const root = mkdtempSync(join(tmpdir(), 'scenario-status-'))
    made.push(root)
    execFileSync('git', ['init', '-q', root])
    execFileSync('git', [
      '-C',
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'seed',
    ])
    const product = '.meta_harness/design/product'
    write(root, `${product}/PF-016-cli/acceptance.md`, '| S5 | 没有屏 |\n| S6 | 调试 |\n')
    write(
      root,
      `${product}/PF-016-cli/stories.md`,
      `**已发到**：ST-016-01\n\n${card('ST-016-01', '[S5](acceptance.md)')}`,
    )
    write(root, 'apps/cli/package.json', '{"scripts":{"acceptance":"vitest run"}}')
    write(root, 'apps/cli/acceptance/PF-016.a.acceptance.ts', '// covers: PF-016 S5, PF-016 S7\n')
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root],
      {
        encoding: 'utf8',
      },
    )
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'S5：覆盖声明 apps/cli/acceptance/PF-016.a.acceptance.ts；执行 unknown；有效接受 unknown',
    )
    expect(result.stdout).toContain('ST-016-01（旧卡）')
    expect(result.stdout).toContain('S6：覆盖声明 无；执行 unknown；有效接受 unknown')
    expect(result.stdout).toContain('覆盖声明有 1 处问题（`pnpm run lint:rules` 判它失败）')
  })

  it('显式离线capture列平台closed与未读Issue，日常禁用不授予接受', () => {
    const root = mkdtempSync(join(tmpdir(), 'scenario-capture-'))
    made.push(root)
    execFileSync('git', ['init', '-q', root])
    execFileSync('git', [
      '-C',
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'seed',
    ])
    write(root, '.meta_harness/design/product/PF-016-cli/acceptance.md', '| S1 | 场景 |\n')
    const config: DeliveryConfig = {
      schemaVersion: 1,
      kind: 'github-delivery-config',
      protocolVersion: 1,
      enabled: false,
      repository: 'a/b',
      mode: 'manual-single-dispatcher',
      project: {
        owner: 'a',
        number: null,
        id: null,
        url: null,
        fields: { stage: null, priority: null, iteration: null },
      },
      creationHandoffIssue: null,
      writers: { stage: null, body: null },
    }
    const capture: DeliveryCapture = {
      schemaVersion: 1,
      kind: 'github-delivery-capture',
      protocolVersion: 1,
      repository: 'a/b',
      projectId: null,
      startedAt: '2026-10-10T00:00:00Z',
      finishedAt: '2026-10-10T00:00:01Z',
      collection: { issues: 'partial', project: 'complete', errors: [] },
      issues: [1, 2].map(number => ({
        number,
        url: `https://github.com/a/b/issues/${number}`,
        id: `I_${number}`,
        state: 'closed',
        updatedAt: '2026-10-10T00:00:00Z',
        body:
          number === 1
            ? '- 标题：卡\n- 交付修订：2\n- 产品关联：PF-016 S1\n- 旧卡来源别名：无'
            : '- 交付层级：delivery\n- 标题：未读修订\n',
        labels: [],
        comments: [],
        commentsComplete: false,
        relationsComplete: false,
        blockedBy: [],
        parentIssue: null,
        stage: 'Accepted',
      })),
    }
    write(root, 'actual/config.json', JSON.stringify(config))
    write(root, 'actual/capture.json', JSON.stringify(capture))
    write(root, 'config.json', JSON.stringify({ ...config, repository: 'wrong/repository' }))
    write(root, 'capture.json', '{damaged')
    mkdirSync(join(root, 'actual/child'))
    symlinkSync(join(root, 'actual/child'), join(root, 'link'))
    const caller = mkdtempSync(join(tmpdir(), 'scenario-caller-'))
    made.push(caller)
    symlinkSync(join(root, 'actual/child'), join(caller, 'link'))
    for (const [configPath, capturePath, cwd] of [
      [`${root}/link/../config.json`, join(root, 'actual/capture.json'), root],
      [join(root, 'actual/config.json'), 'link/../capture.json', caller],
    ] as const) {
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types', cli, '--root', root,
          '--config', configPath, '--capture', capturePath,
        ],
        { encoding: 'utf8', cwd },
      )
      expect(result.status, result.stderr).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain('https://github.com/a/b/issues/1（平台 closed，Stage Accepted）')
      expect(result.stdout).toContain('https://github.com/a/b/issues/2（平台活动 unknown')
      expect(result.stdout).toContain('执行 unknown；有效接受 unknown')
      expect(result.stdout).toContain('partial，日常禁用')
      const source = spawnSync(
        process.execPath,
        ['--experimental-strip-types', sourceCli, '--root', root,
          '--config', configPath,
          '--capture', capturePath.startsWith('/') ? capturePath : `${cwd}/${capturePath}`],
        { encoding: 'utf8' },
      )
      expect(source.status, source.stderr).toBe(0)
      const observation: CurrentSources = JSON.parse(source.stdout)
      expect(observation.inputRoles.config.path).toBe(join(root, 'actual/config.json'))
      expect(observation.inputRoles.capture).toEqual({ kind: 'file', path: join(root, 'actual/capture.json') })
      expect(observation.cards.some(card => card.kind === 'issue' && card.identity.number === 1)).toBe(true)
    }
  })

  it('产品区不存在：工具出错，退出 2', () => {
    const root = mkdtempSync(join(tmpdir(), 'scenario-status-'))
    made.push(root)
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root],
      {
        encoding: 'utf8',
      },
    )
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('不存在')
  })
})
