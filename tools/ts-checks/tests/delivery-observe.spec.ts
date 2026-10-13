import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  chmodSync,
  mkdirSync,
  symlinkSync,
  linkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { observeDelivery } from '../src/delivery/observe.ts'
import type { TaskBinding } from '../src/delivery/binding.ts'
import {
  bindCapture,
  parseBaseline,
  parseCapture,
  parseConfig,
  workKinds,
} from '../src/delivery/protocol.ts'
import type {
  CapturedIssue,
  Condition,
  DeliveryCapture,
  DeliveryConfig,
} from '../src/delivery/protocol.ts'

const at = '2026-10-10T00:00:00Z'
export function config(): DeliveryConfig {
  return {
    schemaVersion: 2,
    kind: 'github-delivery-config',
    protocolVersion: 2,
    enabled: false,
    repository: 'owner/repo',
    mode: 'manual-single-dispatcher',
    project: {
      owner: 'owner',
      number: 4,
      id: 'project-4',
      url: 'https://github.com/orgs/owner/projects/4',
      fields: { stage: 'stage-field', priority: 'priority-field', iteration: 'iteration-field' },
    },
    creationHandoffIssue: null,
    writers: { stage: null, body: null },
  }
}
export function body(
  number: number,
  kind = 'feature',
  conditions: Condition[] = [],
  level = 'delivery',
): string {
  return [
    '- 交付层级：' + level,
    '- 主工作类型：' + kind,
    '- 交付修订：1',
    '- 创建操作标识：create-' + number,
    '- 卡负责人、主结果接受者及授权依据：负责人及具名授权',
    '- 受影响语义拥有者：无',
    ...(level === 'subtask'
      ? [
          '- 父交付卡：https://github.com/owner/repo/issues/1',
          '- 现行依据或获准问题：成员SPEC abc123',
        ]
      : ['- 责任范围：工具维护，不需要PF']),
    ...(level === 'subtask'
      ? [
          '## 交付结果与范围\n可验证结果。',
          '## 持续成果与交接\n工具拥有。',
          '## 当前执行与交接\n未派发。',
          '## 决定\n未决定。',
        ]
      : [
          '## 问题、结果与范围\n修复具体问题。',
          '## 依据与验收\n成员SPEC，abc123，实际方法。',
          '## 工作类型附加内容\n实际基线、范围和相称方法。',
          '## 实施与持续成果交接\n工具拥有，不含PF。',
          '## 决定与剩余责任\n未决定。',
        ]),
    '## 交付条件',
    conditions.length === 0
      ? '无'
      : '| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 |\n| --- | --- | --- | --- | --- | --- |\n' +
        conditions
          .map(
            c =>
              `| ${c.id} | ${c.kind} | ${c.target} | ${c.phase} | ${c.predicate} | ${c.evidence} |`,
          )
          .join('\n'),
  ].join('\n')
}
export function issue(number: number, patch: Partial<CapturedIssue> = {}): CapturedIssue {
  return {
    number,
    url: `https://github.com/owner/repo/issues/${number}`,
    id: `issue-${number}`,
    state: 'open',
    updatedAt: at,
    body: body(number),
    labels: [],
    comments: [],
    commentsComplete: true,
    relationsComplete: true,
    blockedBy: [],
    parentIssue: null,
    stage: null,
    ...patch,
  }
}
export function capture(
  issues: CapturedIssue[] = [],
  patch: Partial<DeliveryCapture> = {},
): DeliveryCapture {
  return {
    schemaVersion: 1,
    kind: 'github-delivery-capture',
    repository: 'owner/repo',
    projectId: 'project-4',
    protocolVersion: 2,
    startedAt: at,
    finishedAt: at,
    collection: { issues: 'complete', project: 'complete', errors: [] },
    issues,
    ...patch,
  }
}
function dependency(id: string, target: number, phase: Condition['phase'] = 'start'): Condition {
  return {
    id,
    kind: 'issue-result',
    target: `https://github.com/owner/repo/issues/${target}`,
    phase,
    predicate: '目标整项结果已被接受',
    evidence: '具名责任，实际决定入口',
  }
}
function codes(issues: CapturedIssue[], patch: Partial<DeliveryCapture> = {}): string[] {
  return observeDelivery(config(), capture(issues, patch)).findings.map(f => f.code)
}

const templateValues: Record<string, string> = {
  一次可独立接受的结果: '统一交付卡的输入与执行信息',
  父交付卡中的一次可验证结果: '统一子任务的输入与执行信息',
  'feature／bug／refactor／performance／maintenance／investigation': 'maintenance',
  '创建前登记并读回的稳定标识，后续修订保持': 'template-maintenance-2',
  '真实父Issue URL，并核对平台父关系': 'https://github.com/owner/repo/issues/1',
  '领域、实际成员或工程机制': '交付卡模板及只读观察工具',
  '本切片承担的实际成员、领域或工程机制': '交付卡模板及只读观察工具',
  '具名人、身份和本次权限依据': 'Human，工程负责人，按本卡获准范围接受',
  '产品、架构或契约变化的拥有者；无则写无': '无',
  '本卡指定调度者及获委派会话；未定则说明': 'Human，本卡调度会话 session-2',
  '本卡指定正文集成者；兼任时写同上': '同上',
  '当前问题及为何需要这次交付。': '当前卡片依据与执行输入分散，接手者难以核对。',
  '本切片解决什么问题，以及为何可以独立接受。': '子任务独立承担模板组织和观察器适配。',
  本子任务可独立接受的结果: '两份模板统一组织且新旧卡仍可观察',
  '本切片对父结果的贡献，以及仍由父卡或其他子项承担的范围':
    '本卡交付模板适配，父卡承担其余调度工作',
  本次必须兑现的范围: '模板、操作说明和章节解析',
  明确排除的相邻工作: '新调度服务和产品功能',
  '按工作类型补齐必要事实，只保留适用内容': '维护工程入口，不改变条件与接受语义',
  '引用下表输入ID及本子任务适用条款；不自动沿用父卡全部范围': 'I-01，卡片与阶段',
  '真实可访问入口；无既有源时写获准问题':
    'https://github.com/owner/repo/blob/main/docs/engineering/delivery.md',
  '精确输入；候选须标未采用': '071e60d75d27a39bc74f2a6bb3406fa4706ba72f，已采用',
  只列本次必要范围: '卡片结构、认领、单写和接受边界',
  '已接受设计、必要环境、关键失败语义及停止点；已有正文足够时直接引用':
    '按 I-01 维护，遇到授权冲突停止相关写入',
  '实际成员、装配、工具、配置或外部消费': 'tools/ts-checks 交付观察器',
  '要更新的规格、设计、指南和持续验证；依据不变时明说': '更新模板、agent-delivery 和观察器 SPEC',
  '接手者可取得的最小材料；仅本机tmp须说明如何交接': '本卡正文及 I-01 固定提交',
  可观察结果及必须拒绝的行为: '读取完整新旧卡，报告缺节和混合布局',
  可复跑方法或独立判断入口: '运行交付观察器测试并核对两份模板',
  '实际包、工具或文档拥有者': 'tools/ts-checks',
  '单元／包内集成／关键旅程组合／其他适用检查': '单元及真实离线 CLI',
  '本次关键行为、失败和边界': '新旧章节、条件、身份及绑定',
  具体参与者与声明边界: '真实解析器，平台响应用 fixture，不覆盖平台权限',
  '实际命令或方法；未具备则列缺口':
    'pnpm --filter @omne-harness-lite/ts-checks test tests/delivery-observe.spec.ts',
  '按风险需要的角色、对象和接受者；不适用项及理由': '独立评审实现，Human 接受本卡结果',
  '实际限制及如何影响本次接受，不能把未运行写成通过': '平台真实权限须另核',
  'issue-result／adopted-source／decision／capability': 'decision',
  '真实结果、规范、决定或资源': 'https://github.com/owner/repo/issues/2#issuecomment-3',
  'start／integration／acceptance': 'integration',
  精确满足条件: 'Human 已授权本次候选进入 main',
  具名确认者及可访问证据: 'Human 核对目标与候选，证据见目标评论',
  'all；仅integration可限定track/main/stable或登记完整ref': 'main',
  '真实评论URL；尚未认领时写未认领': '未认领',
  '未派发；或引用下方binding.dispatch对应决定': '未派发',
  '人的责任、宿主、会话或agent实例定位；不得用Assignee代替': '尚未派发执行实例',
  '实际路径；未创建明说': '未创建',
  '未派发时：写明未登记binding，列计划集成路线、最终终点及待定输入。不要发布占位JSON。':
    '未登记binding。计划 global 路线，最终进入 main，执行实例待派发。',
  '已派发Git任务时：由正文单写者在此插入唯一、完整、真实的json omne-integration-binding:v1区块，并替换上述计划文字。branch、route、completionTarget、taskBase、writeScope、attempt等以此区块为唯一编辑源。形状见集成工具指南。':
    '',
  '从binding.route及已采用轨道登记解析的只读摘要': '未派发，尚未解析',
  'start回执taskSource；与binding.taskBase分别保留': '未开工',
  'start回执targetBase及观察时点；后续集成重新核': '未开工',
  '工具生成路径、成功回执、所核revision/attempt与工作树；未生成明说': '未生成',
  '时间；首次建卡写尚未开工': '尚未开工',
  '关键结果、最后成功远端提交或报告评论': '尚无实施成果',
  '条件ID、影响、确认责任；无则写无': '无',
  具体接续动作和谁负责: 'Human 核准执行实例并派发',
  '链接、所核Stage和时点；待更新或失败须明说': 'https://github.com/orgs/owner/projects/4，待更新',
  'PR/提交/报告及修订；未交付时写未交付': '未交付',
  '逐项C-ID实际结果、证据和未覆盖': 'C1 尚未执行',
  '实际所在分支/提交；无Git交付写不适用': '尚未集成',
  '接受对象、缺口、下一责任': '候选尚未形成，由 Human 接收后续成果',
  '真实评论URL、对象与精确修订、范围；没有则写未决定': '未决定',
  '本子任务具名决定的真实评论URL、精确修订与范围；没有则写未决定': '未决定',
  '未完成或未接受部分及具名下一责任；无则写无': '全范围尚未实施，Human 负责派发',
  '有效决定读回、Issue开闭与原因、Project Stage；未接受时保持活动':
    '无接受决定，Issue open，Project 待更新',
}
function template(level: 'delivery' | 'subtask'): string {
  return readFileSync(
    new URL(
      `../../../.github/ISSUE_TEMPLATE/${level === 'delivery' ? 'work-item' : 'task'}.md`,
      import.meta.url,
    ),
    'utf8',
  )
}
function filledTemplate(level: 'delivery' | 'subtask', withCondition = false): string {
  const source = template(level)
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/^填写交付条件时，.*$/m, '')
  return (
    withCondition ? source : replaceSection(source, '交付条件', '## 交付条件\n\n无\n\n')
  ).replace(/\{\{(.*?)\}\}/g, (_, name: string) => {
    const value = templateValues[name]
    if (value === undefined) throw new Error(`Unfilled template field: ${name}`)
    return value
  })
}
function replaceSection(body: string, name: string, replacement: string): string {
  return body.replace(new RegExp(`^## ${name}\\n[^]*?(?=^## |$(?![^]))`, 'm'), replacement)
}

describe('delivery card layouts', () => {
  const headings = [
    '身份与责任',
    '目标与范围',
    '依据与实施输入',
    '验收与测试',
    '交付条件',
    '当前执行与交接',
    '决定与剩余责任',
  ]
  const legacy = [
    { level: 'delivery', identity: '身份与责任', heading: '依据与验收' },
    { level: 'subtask', identity: '责任与依据', heading: '持续成果与交接' },
  ]

  it('publishes identical visible intake instructions and seven sections in both templates', () => {
    const [delivery, subtask] = [template('delivery'), template('subtask')]
    for (const source of [delivery, subtask]) {
      expect([...source.matchAll(/^## (.+)$/gm)].map(match => match[1])).toEqual(headings)
      expect(source.replace(/<!--[^]*?-->/g, '')).toContain('在本Issue评论声明认卡')
      expect(source).not.toContain('```json omne-integration-binding:v1')
    }
    const notice = (source: string) =>
      source.slice(source.indexOf('**接手本卡**'), source.indexOf('## 身份与责任'))
    expect(notice(delivery)).toBe(notice(subtask))
    expect(notice(delivery)).toContain('在本Issue评论声明认卡')
    expect(notice(delivery)).toContain('指定调度者更新Project Stage')
  })

  it.each(['delivery', 'subtask'] as const)(
    'observes a filled %s template without granting dispatch',
    level => {
      const result = observeDelivery(
        config(),
        capture([
          issue(2, {
            body: filledTemplate(level),
            parentIssue: level === 'subtask' ? issue(1).url : null,
            comments: [
              {
                url: `${issue(2).url}#issuecomment-1`,
                author: 'human',
                body: '认卡：Human 按当前修订请求领取，尚无派发。',
                updatedAt: at,
              },
            ],
          }),
        ]),
      )
      expect(result.findings.filter(f => f.category === 'deviation')).toEqual([])
      expect(result.cards[0]).toMatchObject({
        level,
        revision: 1,
        workKind: 'maintenance',
        conditions: [],
        integrationBinding: null,
        dispatchPermission: 'not-provided',
        acceptance: 'unknown',
      })
    },
  )

  it.each(legacy)('keeps complete legacy $level cards readable', ({ level, identity, heading }) => {
    const card = issue(2, {
      body: `## ${identity}\n${body(2, 'maintenance', [], level)}`,
      parentIssue: level === 'subtask' ? issue(1).url : null,
    })
    expect(
      observeDelivery(config(), capture([card])).findings.filter(f => f.category === 'deviation'),
    ).toEqual([])
    expect(codes([{ ...card, body: replaceSection(card.body, heading, '') }])).toContain(
      'section-missing',
    )
    expect(codes([{ ...card, body: `${card.body}\n## ${heading}\n另一份正文。` }])).toContain(
      'section-duplicate',
    )
  })

  it.each(headings)('reports absent, empty and duplicate unified section %s', heading => {
    const source = filledTemplate('delivery')
    for (const replacement of ['', `## ${heading}\n\n`]) {
      const changed = replaceSection(source, heading, replacement)
      const result = observeDelivery(
        config(),
        capture([
          issue(2, {
            body: heading === '身份与责任' ? `- 交付层级：delivery\n${changed}` : changed,
          }),
        ]),
      )
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'deviation',
            code: heading === '交付条件' ? 'conditions-missing' : 'section-missing',
            clause: heading,
          }),
        ]),
      )
    }
    expect(codes([issue(2, { body: `${source}\n## ${heading}\n另一份正文。` })])).toContain(
      'section-duplicate',
    )
  })

  it.each([
    '问题、结果与范围',
    '依据与验收',
    '工作类型附加内容',
    '实施与持续成果交接',
    '责任与依据',
    '交付结果与范围',
    '持续成果与交接',
    '决定',
  ])('rejects old-only section %s in a unified card', heading => {
    expect(
      codes([issue(2, { body: `${filledTemplate('delivery')}\n## ${heading}\n旧版内容。` })]),
    ).toContain('section-layout-mixed')
  })

  it.each(['目标与范围', '依据与实施输入', '验收与测试'])(
    'does not fall back to legacy when only %s is migrated',
    heading => {
      for (const { level, identity } of legacy) {
        const source = `## ${identity}\n${body(2, 'maintenance', [], level)}\n## ${heading}\n迁移未完成。`
        expect(
          codes([
            issue(2, { body: source, parentIssue: level === 'subtask' ? issue(1).url : null }),
          ]),
        ).toEqual(expect.arrayContaining(['section-layout-mixed', 'section-missing']))
      }
    },
  )

  it('keeps condition, parent and unique revision requirements on unified cards', () => {
    const source = filledTemplate('subtask')
    expect(
      codes([
        issue(2, { body: source.replace('## 交付条件\n\n无', '## 交付条件\n\n无\n附加说明。') }),
      ]),
    ).toContain('conditions-table-invalid')
    expect(
      codes([
        issue(2, {
          body: source.replace('- 父交付卡：https://github.com/owner/repo/issues/1', ''),
        }),
      ]),
    ).toEqual(expect.arrayContaining(['field-missing', 'parent-reference-invalid']))
    expect(codes([issue(2, { body: source, parentIssue: issue(3).url })])).toContain(
      'parent-projection-conflict',
    )
    expect(codes([issue(2, { body: `${source}\n- 交付修订：1` })])).toContain('field-duplicate')
  })

  it.each(['delivery', 'subtask'] as const)(
    'reads the seven-column condition table from the %s template',
    level => {
      const result = observeDelivery(
        config(),
        capture([
          issue(2, {
            body: filledTemplate(level, true),
            parentIssue: level === 'subtask' ? issue(1).url : null,
          }),
        ]),
      )
      expect(result.findings.filter(f => f.category === 'deviation')).toEqual([])
      expect(result.cards[0]?.conditions).toEqual([
        {
          id: 'D-01',
          kind: 'decision',
          target: `${issue(2).url}#issuecomment-3`,
          phase: 'integration',
          predicate: 'Human 已授权本次候选进入 main',
          evidence: 'Human 核对目标与候选，证据见目标评论',
          scope: 'main',
        },
      ])
    },
  )

  it('keeps binding authority separate from derived execution observations', () => {
    const binding: TaskBinding = {
      schemaVersion: 1,
      issue: { repository: 'owner/repo', id: 'issue-2', number: 2, url: issue(2).url },
      revision: 1,
      attempt: 'template-2',
      responsible: 'human',
      branch: 'human/template-2',
      route: { kind: 'global', owners: ['human'] },
      completionTarget: 'main',
      taskBase: 'a'.repeat(40),
      writeScope: ['.github/ISSUE_TEMPLATE'],
      dispatch: `${issue(2).url}#issuecomment-2`,
      conditions: [],
      authorization: [],
    }
    const block = `\`\`\`json omne-integration-binding:v1\n${JSON.stringify(binding)}\n\`\`\``
    const source = replaceSection(
      filledTemplate('delivery'),
      '当前执行与交接',
      `## 当前执行与交接\n\n${block}\n\n- 认卡声明：${issue(2).url}#issuecomment-1\n- 派发情况：${binding.dispatch}\n- 实际开工HEAD：${'b'.repeat(40)}\n- 本次读回的目标HEAD：${'c'.repeat(40)}\n- task context路径与核验：工具生成 .git/omne-integration-context.json\n\n`,
    )
    const result = observeDelivery(config(), capture([issue(2, { body: source })]))
    expect(result.findings.filter(f => f.category === 'deviation')).toEqual([])
    expect(result.cards[0]?.integrationBinding).toEqual(binding)
    expect(result.cards[0]?.dispatchPermission).toBe('not-provided')
    expect(codes([issue(2, { body: source.replace(block, `${block}\n${block}`) })])).toContain(
      'integration-binding-invalid',
    )
    expect(
      codes([
        issue(2, {
          body: source.replace(
            JSON.stringify(binding),
            JSON.stringify({ ...binding, taskContextPath: '.git/omne-integration-context.json' }),
          ),
        }),
      ]),
    ).toContain('integration-binding-invalid')
  })

  it('allows an explicitly non-Git report while retaining execution and acceptance observations', () => {
    const source = replaceSection(
      filledTemplate('delivery'),
      '当前执行与交接',
      '## 当前执行与交接\n\n认卡与派发尚未登记。分支及task context不适用，本卡明确只交Issue报告评论。当前未开工，结果仍待Human接受。\n\n',
    )
    const result = observeDelivery(config(), capture([issue(2, { body: source })]))
    expect(result.findings.filter(f => f.category === 'deviation')).toEqual([])
    expect(result.cards[0]).toMatchObject({
      integrationBinding: null,
      execution: 'requires-review',
      dispatchPermission: 'not-provided',
      acceptance: 'unknown',
    })
  })
})

describe('delivery input boundary', () => {
  it('rejects nonexistent calendar dates and invalid times', () => {
    expect(() =>
      parseCapture(
        capture([], { startedAt: '2026-02-31T00:00:00Z', finishedAt: '2026-03-04T00:00:00Z' }),
      ),
    ).toThrow(/calendar/)
    expect(() =>
      parseCapture(
        capture([], { startedAt: '2026-10-10T24:00:00Z', finishedAt: '2026-10-11T00:00:00Z' }),
      ),
    ).toThrow(/calendar/)
    expect(() =>
      parseCapture(
        capture([], { startedAt: '2024-02-29T00:00:00Z', finishedAt: '2024-02-29T00:00:00Z' }),
      ),
    ).not.toThrow()
  })

  it('rejects configured repository traversal before any network read', () => {
    expect(() => parseConfig({ ...config(), repository: '../repo' })).toThrow()
    expect(() => parseConfig({ ...config(), repository: 'owner/..' })).toThrow()
  })

  it('parses explicit config/capture and ignores extra readiness claims', () => {
    const c = parseConfig({ ...config(), ready: true }),
      raw = parseCapture({ ...capture([issue(1)]), allReady: true })
    expect(observeDelivery(c, raw).cards[0]?.dispatchPermission).toBe('not-provided')
  })
  it.each(['repository', 'projectId', 'protocolVersion'])(
    'rejects cross-input %s identities',
    field => {
      const raw = { ...capture(), [field]: field === 'protocolVersion' ? 1 : 'other' }
      if (field === 'protocolVersion') expect(() => parseCapture(raw)).toThrow()
      else expect(() => bindCapture(config(), parseCapture(raw))).toThrow(/match exactly/)
    },
  )
  it('rejects both null/real Project mismatches', () => {
    expect(() => bindCapture(config(), capture([], { projectId: null }))).toThrow()
    const c = config()
    c.project.id = null
    expect(() => bindCapture(c, capture())).toThrow()
    expect(() => bindCapture(c, capture([], { projectId: null }))).not.toThrow()
  })
  it('rejects Issue URL/number/repository disagreement and missing completeness', () => {
    expect(() =>
      parseCapture(capture([issue(1, { url: 'https://github.com/other/repo/issues/1' })])),
    ).toThrow(/match repository/)
    expect(() => parseCapture({ ...capture(), collection: { issues: 'complete' } })).toThrow()
    expect(() => parseCapture(capture([issue(1), issue(1)]))).toThrow(/duplicate/)
  })
  it('rejects malformed and unsupported baseline', () => {
    expect(() => parseBaseline({})).toThrow()
    const report = observeDelivery(config(), capture([issue(1)]))
    expect(() => parseBaseline({ ...report, schemaVersion: 3 })).toThrow()
    expect(() => parseBaseline({ ...report, stock: { ...report.stock, unknown: 100 } })).toThrow(
      /stock/,
    )
    expect(parseBaseline(JSON.parse(JSON.stringify(report))).findings).toEqual(report.findings)
  })
})
describe('delivery observations', () => {
  it.each(workKinds)('supports %s without forcing a PF', kind => {
    const r = observeDelivery(config(), capture([issue(1, { body: body(1, kind) })]))
    expect(r.cards[0]?.workKind).toBe(kind)
    expect(r.findings.filter(f => f.category === 'deviation')).toEqual([])
  })
  it('observes a child relation without creating a hard parent wait', () => {
    const r = observeDelivery(
      config(),
      capture([
        issue(1),
        issue(2, {
          body: body(2, 'refactor', [], 'subtask'),
          parentIssue: 'https://github.com/owner/repo/issues/1',
        }),
      ]),
    )
    expect(r.cards[1]?.level).toBe('subtask')
    expect(r.graph.cycles).toEqual([])
    expect(r.findings.filter(f => f.category === 'deviation')).toEqual([])
  })
  it('detects missing, duplicate fields, placeholders and malformed kinds/revisions', () => {
    const b =
      body(1)
        .replace('- 主工作类型：feature', '- 主工作类型：what')
        .replace('- 交付修订：1', '- 交付修订：0')
        .replace('- 创建操作标识：create-1', '- 创建操作标识：{{创建}}')
        .replace('- 责任范围：工具维护，不需要PF', '') + '\n- 交付层级：delivery'
    expect(codes([issue(1, { body: b })])).toEqual(
      expect.arrayContaining([
        'field-duplicate',
        'field-missing',
        'placeholder',
        'invalid-work-kind',
        'invalid-revision',
      ]),
    )
  })
  it('reports ordinary Issues and the configured bootstrap separately', () => {
    const c = config()
    c.creationHandoffIssue = issue(1).url
    const r = observeDelivery(
      c,
      capture([
        issue(1, { body: 'creation locator only' }),
        issue(2, { body: 'ordinary bug question' }),
      ]),
    )
    expect(r.cards).toEqual([])
    expect(r.findings.map(f => f.code)).toEqual(
      expect.arrayContaining(['creation-handoff-not-work-card', 'unsupported-issue']),
    )
    expect(r.stock.uncovered).toBe(2)
  })
  it('does not equate closed, Accepted, declarations or green CI with effective acceptance', () => {
    const comment = {
      url: issue(1).url + '#issuecomment-1',
      author: 'writer',
      body: '- 决定：accept\n- 对象与交付修订：https://github.com/owner/repo/issues/1 revision 1\n- 决定者、身份及权限依据：具名人\n- 范围：完整结果\n- 成果与证据：CI green',
      updatedAt: at,
    }
    const r = observeDelivery(
      config(),
      capture([issue(1, { state: 'closed', stage: 'Accepted', comments: [comment] })]),
    )
    expect(r.cards[0]?.declaredDecisions[0]?.revision).toBe(1)
    expect(r.cards[0]?.acceptance).toBe('unknown')
    expect(r.cards[0]?.dispatchPermission).toBe('not-provided')
  })
  it.each(['partial', 'cancel', 'revoke'])('does not use %s as a full result', kind => {
    expect(
      codes([
        issue(1, {
          comments: [
            {
              url: 'https://github.com/owner/repo/issues/1#issuecomment-2',
              author: 'writer',
              body: `- 决定：${kind}\n- 对象与交付修订：https://github.com/owner/repo/issues/1 revision 2`,
              updatedAt: at,
            },
          ],
        }),
      ]),
    ).toContain('decision-not-full-acceptance')
    expect(
      codes([
        issue(1, {
          comments: [
            {
              url: 'x',
              author: 'writer',
              body: `- 决定：${kind}\n- 对象与交付修订：https://github.com/owner/repo/issues/1 revision 2`,
              updatedAt: at,
            },
          ],
        }),
      ]),
    ).toContain('decision-object-unconfirmed')
  })
  it('keeps absent comments and unknown collection as unknown', () => {
    expect(codes([issue(1, { commentsComplete: false })])).toContain(
      'acceptance-comments-incomplete',
    )
    const r = observeDelivery(
      config(),
      capture([], {
        collection: { issues: 'unknown', project: 'unknown', errors: ['permissions unavailable'] },
      }),
    )
    expect(r.stock.unknown).toBeGreaterThan(0)
    expect(r.cards).toEqual([])
  })
  it('requires explicit no-conditions and detects duplicate IDs and escaped table cells', () => {
    const d = dependency('D-01', 2)
    expect(codes([issue(1, { body: body(1).replace('## 交付条件\n无', '') })])).toContain(
      'conditions-missing',
    )
    expect(codes([issue(1, { body: body(1, 'feature', [d, d]) }), issue(2)])).toContain(
      'condition-duplicate',
    )
    const r = observeDelivery(
      config(),
      capture([
        issue(1, {
          body: body(1, 'feature', [{ ...d, evidence: '负责人\\|实际入口' }]),
          blockedBy: [issue(2).url],
        }),
        issue(2),
      ]),
    )
    expect(r.cards[0]?.conditions[0]?.evidence).toBe('负责人|实际入口')
  })
  it('reports external sources, ambiguity and malformed conditions without guessing satisfaction', () => {
    const external: Condition = {
      id: 'D-01',
      kind: 'adopted-source',
      target: 'SPEC clause',
      phase: 'integration',
      predicate: '具名接受',
      evidence: 'source',
    }
    expect(codes([issue(1, { body: body(1, 'feature', [external]) })])).toContain(
      'condition-target-unconfirmed',
    )
    expect(
      codes([
        issue(1, {
          body: body(1, 'feature', [{ ...dependency('D-01', 2), predicate: '某部分就绪' }]),
        }),
      ]),
    ).toContain('condition-target-unconfirmed')
    expect(
      codes([
        issue(1, { body: body(1, 'feature', [external]).replace('adopted-source', 'arbitrary') }),
      ]),
    ).toContain('condition-invalid')
  })
  it('detects hidden full-phase cycles even when other sources are unknown', () => {
    const a = issue(1, {
      body: body(1, 'feature', [dependency('D-01', 2)]),
      blockedBy: [issue(2).url],
    })
    const b = issue(2, { body: body(2, 'feature', [dependency('D-02', 1, 'integration')]) })
    const r = observeDelivery(
      config(),
      capture([a, b], { collection: { issues: 'partial', project: 'unknown', errors: [] } }),
    )
    expect(r.graph.cycles[0]?.phases.some(p => p.endsWith('@acceptance'))).toBe(true)
    expect(r.graph.cycles[0]?.conditions).toEqual(
      expect.arrayContaining([a.url + '#D-01', b.url + '#D-02']),
    )
    expect(r.findings.some(f => f.code === 'phase-cycle')).toBe(true)
  })
  it('detects hard self-dependency', () => {
    expect(codes([issue(1, { body: body(1, 'feature', [dependency('D-01', 1)]) })])).toContain(
      'condition-self',
    )
  })
})
describe('native dependency projection', () => {
  it('does not treat a negated whole-result phrase as a projectable condition', () => {
    const condition = { ...dependency('D-01', 2), predicate: '不需要整项结果，仅核子结果' }
    const result = codes([issue(1, { body: body(1, 'feature', [condition]) }), issue(2)])
    expect(result).toContain('condition-target-unconfirmed')
    expect(result).not.toContain('native-edge-missing')
  })

  it('reports unexplained observed edges even if other relations are partial', () => {
    expect(
      codes([issue(1, { blockedBy: [issue(2).url], relationsComplete: false }), issue(2)]),
    ).toContain('native-edge-unexplained')
  })
  it('reports definite missing start whole-result edges', () => {
    expect(
      codes([issue(1, { body: body(1, 'feature', [dependency('D-01', 2)]) }), issue(2)]),
    ).toContain('native-edge-missing')
  })
  it('does not project integration or partial-result conditions', () => {
    expect(
      codes([
        issue(1, { body: body(1, 'feature', [dependency('D-01', 2, 'integration')]) }),
        issue(2),
      ]),
    ).not.toContain('native-edge-missing')
  })
  it('reports complete in-scope dangling targets but keeps incomplete/outside unknown', () => {
    expect(codes([issue(1, { blockedBy: [issue(9).url] })])).toContain('native-target-dangling')
    expect(
      codes([issue(1, { blockedBy: [issue(9).url], relationsComplete: false })]),
    ).not.toContain('native-target-dangling')
    expect(codes([issue(1, { blockedBy: ['https://github.com/other/repo/issues/1'] })])).toContain(
      'native-target-uncovered',
    )
  })
  it('does not report missing edges from incomplete relations', () => {
    const result = codes([
      issue(1, { body: body(1, 'feature', [dependency('D-01', 2)]), relationsComplete: false }),
      issue(2),
    ])
    expect(result).not.toContain('native-edge-missing')
    expect(result).toContain('native-relations-incomplete')
  })
})
describe('stock and comparable delta', () => {
  it('keeps identity stable across card revisions and records resolved structural findings', () => {
    const old = observeDelivery(
      config(),
      capture([issue(1, { body: body(1).replace('- 责任范围：工具维护，不需要PF', '') })]),
    )
    const next = observeDelivery(
      config(),
      capture([issue(1, { body: body(1).replace('- 交付修订：1', '- 交付修订：2') })]),
      parseBaseline(old),
    )
    expect(next.delta.remaining.some(id => id.includes('acceptance-requires-review'))).toBe(true)
    expect(next.delta.resolved.some(id => id.includes('field-missing'))).toBe(true)
  })
  it('does not resolve missing old findings from partial capture', () => {
    const old = observeDelivery(config(), capture([issue(1)]))
    const next = observeDelivery(
      config(),
      capture([], { collection: { issues: 'partial', project: 'complete', errors: [] } }),
      old,
    )
    expect(next.delta.resolved).toEqual([])
    expect(next.delta.notComparable.length).toBeGreaterThan(0)
  })
  it('does not count a Project identity change as improvement', () => {
    const old = observeDelivery(config(), capture([issue(1)]))
    const c = config()
    c.project.id = null
    const next = observeDelivery(c, capture([issue(1)], { projectId: null }), old)
    expect(next.delta.resolved).toEqual([])
    expect(next.delta.introduced).toEqual([])
    expect(next.delta.notComparable.length).toBeGreaterThan(0)
  })
})

describe('actual offline CLI', () => {
  it.each(['chain', 'reverse', 'two-chains', 'directory-parent'])(
    'rejects %s dangling output aliases with real target identities',
    mode => {
      const dir = mkdtempSync(join(tmpdir(), 'delivery-chain-'))
      try {
        const cfg = join(dir, 'config.json'),
          missing = join(dir, 'missing.json'),
          first = join(dir, 'first.json'),
          second = join(dir, 'second.json')
        writeFileSync(cfg, JSON.stringify(config()))
        const gh = join(dir, 'gh')
        writeFileSync(gh, '#!/usr/bin/env node\nprocess.stdout.write("[]")\n')
        chmodSync(gh, 0o755)
        let saved = missing,
          reported = first
        if (mode === 'directory-parent') {
          mkdirSync(join(dir, 'physical'))
          mkdirSync(join(dir, 'physical', 'child'))
          symlinkSync('physical/child', join(dir, 'parent-link'))
          saved = join(dir, 'physical', 'missing.json')
          symlinkSync('parent-link/../missing.json', first)
        } else {
          symlinkSync('missing.json', second)
          symlinkSync('second.json', first)
          if (mode === 'reverse') {
            saved = first
            reported = missing
          }
          if (mode === 'two-chains') {
            const third = join(dir, 'third.json')
            symlinkSync('missing.json', third)
            saved = first
            reported = third
          }
        }
        const result = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            resolve('src/delivery/cli.ts'),
            '--config',
            cfg,
            '--live',
            '--save-capture',
            saved,
            '--report',
            reported,
          ],
          { encoding: 'utf8', env: { ...process.env, PATH: dir + ':' + process.env.PATH } },
        )
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('overwrite')
        expect(existsSync(saved)).toBe(false)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
  it.each(['cycle', 'long-chain'])(
    'rejects %s output symlink resolution before any write',
    mode => {
      const dir = mkdtempSync(join(tmpdir(), 'delivery-cycle-'))
      try {
        const cfg = join(dir, 'config.json'),
          cap = join(dir, 'capture.json'),
          output = join(dir, 'link-0')
        writeFileSync(cfg, JSON.stringify(config()))
        writeFileSync(cap, JSON.stringify(capture([issue(1)])))
        const length = mode === 'cycle' ? 2 : 45
        for (let index = 0; index < length; index += 1)
          symlinkSync(
            index + 1 === length
              ? mode === 'cycle'
                ? 'link-0'
                : 'missing.json'
              : `link-${index + 1}`,
            join(dir, `link-${index}`),
          )
        const result = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            resolve('src/delivery/cli.ts'),
            '--config',
            cfg,
            '--capture',
            cap,
            '--report',
            output,
          ],
          { encoding: 'utf8' },
        )
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('cyclic or too long')
        expect(existsSync(join(dir, 'missing.json'))).toBe(false)
        expect(parseCapture(JSON.parse(readFileSync(cap, 'utf8'))).issues).toHaveLength(1)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
  it('allows distinct dangling output targets without replacing capture data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-distinct-'))
    try {
      const cfg = join(dir, 'config.json'),
        saved = join(dir, 'capture.json'),
        reported = join(dir, 'report.json'),
        alias = join(dir, 'report-link.json')
      writeFileSync(cfg, JSON.stringify(config()))
      symlinkSync('report.json', alias)
      const gh = join(dir, 'gh')
      writeFileSync(gh, '#!/usr/bin/env node\nprocess.stdout.write("[]")\n')
      chmodSync(gh, 0o755)
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          resolve('src/delivery/cli.ts'),
          '--config',
          cfg,
          '--live',
          '--save-capture',
          saved,
          '--report',
          alias,
        ],
        { encoding: 'utf8', env: { ...process.env, PATH: dir + ':' + process.env.PATH } },
      )
      expect(result.status).toBe(0)
      expect(parseCapture(JSON.parse(readFileSync(saved, 'utf8'))).kind).toBe(
        'github-delivery-capture',
      )
      expect(parseBaseline(JSON.parse(readFileSync(reported, 'utf8'))).kind).toBe(
        'github-delivery-report',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects dangling output aliases before live reads or writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-dangling-'))
    try {
      const cfg = join(dir, 'config.json'),
        missing = join(dir, 'missing.json'),
        alias = join(dir, 'alias.json'),
        marker = join(dir, 'gh-called')
      writeFileSync(cfg, JSON.stringify(config()))
      symlinkSync(missing, alias)
      const gh = join(dir, 'gh')
      writeFileSync(
        gh,
        '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.DELIVERY_READ_MARKER, "read\\n"); process.stdout.write("[]")\n',
      )
      chmodSync(gh, 0o755)
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          resolve('src/delivery/cli.ts'),
          '--config',
          cfg,
          '--live',
          '--save-capture',
          missing,
          '--report',
          alias,
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, PATH: dir + ':' + process.env.PATH, DELIVERY_READ_MARKER: marker },
        },
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('overwrite')
      expect(existsSync(missing)).toBe(false)
      expect(existsSync(marker)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects symlink and hardlink output aliases of input files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-alias-'))
    try {
      const cfg = join(dir, 'config.json'),
        cap = join(dir, 'capture.json'),
        alias = join(dir, 'alias.json'),
        hard = join(dir, 'hard.json')
      writeFileSync(cfg, JSON.stringify(config()))
      writeFileSync(cap, JSON.stringify(capture([issue(1)])))
      symlinkSync(cfg, alias)
      linkSync(cap, hard)
      for (const out of [alias, hard]) {
        const result = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            resolve('src/delivery/cli.ts'),
            '--config',
            cfg,
            '--capture',
            cap,
            '--report',
            out,
          ],
          { encoding: 'utf8' },
        )
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('overwrite')
      }
      expect(parseConfig(JSON.parse(readFileSync(cfg, 'utf8')))).toEqual(config())
      expect(parseCapture(JSON.parse(readFileSync(cap, 'utf8'))).issues).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('produces a comparable report and exits zero with unknowns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-cli-'))
    try {
      const cfg = join(dir, 'config.json'),
        cap = join(dir, 'capture.json'),
        report = join(dir, 'report.json')
      writeFileSync(cfg, JSON.stringify(config()))
      writeFileSync(cap, JSON.stringify(capture([issue(1)])))
      const cli = resolve('src/delivery/cli.ts')
      execFileSync(process.execPath, [
        '--experimental-strip-types',
        cli,
        '--config',
        cfg,
        '--capture',
        cap,
        '--report',
        report,
      ])
      const first = parseBaseline(JSON.parse(readFileSync(report, 'utf8')))
      expect(first.stock.unknown).toBeGreaterThan(0)
      const next = execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          cli,
          '--config',
          cfg,
          '--capture',
          cap,
          '--baseline',
          report,
        ],
        { encoding: 'utf8' },
      )
      expect(parseBaseline(JSON.parse(next)).delta.remaining.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('rejects invalid/mismatched input without writing an empty report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-cli-'))
    try {
      const cfg = join(dir, 'config.json'),
        cap = join(dir, 'capture.json'),
        out = join(dir, 'must-not-exist.json'),
        cli = resolve('src/delivery/cli.ts')
      writeFileSync(cfg, JSON.stringify(config()))
      writeFileSync(cap, JSON.stringify(capture([], { projectId: null })))
      const child = spawnSync(
        process.execPath,
        ['--experimental-strip-types', cli, '--config', cfg, '--capture', cap, '--report', out],
        { encoding: 'utf8' },
      )
      expect(child.status).toBe(2)
      expect(child.stdout).toBe('')
      expect(child.stderr).toContain('match exactly')
      expect(existsSync(out)).toBe(false)
      const conflict = spawnSync(
        process.execPath,
        ['--experimental-strip-types', cli, '--config', cfg, '--capture', cap, '--live'],
        { encoding: 'utf8' },
      )
      expect(conflict.status).toBe(2)
      const overwrite = spawnSync(
        process.execPath,
        ['--experimental-strip-types', cli, '--config', cfg, '--capture', cap, '--report', cfg],
        { encoding: 'utf8' },
      )
      expect(overwrite.status).toBe(2)
      expect(overwrite.stderr).toContain('overwrite')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('retired delivery structures', () => {
  it.each([1, 2, 3])('rejects report schema %s', schemaVersion => {
    const report = observeDelivery(config(), capture([issue(1)]))
    expect(() => parseBaseline({ ...report, schemaVersion })).toThrow('schemaVersion')
  })
  it.each(['aliases', 'scenarios'])('rejects old card key %s at its own layer', key => {
    const report = observeDelivery(config(), capture([issue(1)]))
    expect(() =>
      parseBaseline({ ...report, cards: report.cards.map(card => ({ ...card, [key]: [] })) }),
    ).toThrow('retired')
    expect(parseBaseline({ ...report, [key]: 'unrelated metadata' }).cards).toHaveLength(1)
  })
  it('rejects sourceCutovers at the configuration layer', () => {
    expect(() => parseConfig({ ...config(), sourceCutovers: null })).toThrow('retired')
    expect(() => parseConfig({ ...config(), schemaVersion: 1 })).toThrow()
    expect(() => parseCapture({ ...capture(), protocolVersion: 1 })).toThrow()
  })
  it('real CLI rejects old formats and retired structural keys with exit 2', () => {
    const root = mkdtempSync(join(tmpdir(), 'delivery-retired-'))
    const cli = new URL('../src/delivery/cli.ts', import.meta.url).pathname
    const report = observeDelivery(config(), capture([issue(1)]))
    const cases = [
      { config: { ...config(), schemaVersion: 1 }, capture: capture(), report },
      { config: { ...config(), sourceCutovers: 'old' }, capture: capture(), report },
      { config: config(), capture: { ...capture(), protocolVersion: 1 }, report },
      ...[1, 2, 3].map(schemaVersion => ({
        config: config(),
        capture: capture(),
        report: { ...report, schemaVersion },
      })),
      ...['aliases', 'scenarios'].map(key => ({
        config: config(),
        capture: capture(),
        report: { ...report, cards: report.cards.map(card => ({ ...card, [key]: [] })) },
      })),
    ]
    try {
      for (const input of cases) {
        for (const [name, value] of Object.entries(input))
          writeFileSync(join(root, `${name}.json`), JSON.stringify(value))
        const result = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            cli,
            '--config',
            join(root, 'config.json'),
            '--capture',
            join(root, 'capture.json'),
            '--baseline',
            join(root, 'report.json'),
            '--report',
            join(root, 'out.json'),
          ],
          { encoding: 'utf8' },
        )
        expect(result.status, result.stderr).toBe(2)
        expect(existsSync(join(root, 'out.json'))).toBe(false)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it.each(['旧卡来源别名', '产品关联'])(
    'reports retired field %s without interpreting its value or general prose',
    name => {
      const i = issue(1)
      i.body += `\n- ${name}：arbitrary old value`
      const result = observeDelivery(config(), capture([i]))
      expect(result.findings.filter(f => f.code === 'retired-field')).toHaveLength(1)
      expect(result.cards[0]).not.toHaveProperty('aliases')
      expect(result.cards[0]).not.toHaveProperty('scenarios')
      i.body = body(1) + '\n- 长期依据：[历史](docs/history.md) ST-016-01, aliases and scenarios.'
      expect(
        observeDelivery(config(), capture([i])).findings.some(f => f.code === 'retired-field'),
      ).toBe(false)
    },
  )
})
