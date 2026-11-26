import type { GoalDraft } from '@omne-harness/goal-contract'

/** The example of the design: a goal with every section, as a person and an agent would agree it. */
export const HOME: GoalDraft = {
  purpose: '把首页的加载时间降下来，不改功能。运营反馈首屏太慢，影响转化。',
  criteria: [
    {
      statement: '首页在测试环境里的 p95 加载时间到 M1 的目标',
      evidence: { kind: 'metric', metric: 'M1' },
    },
    {
      statement: '现有端到端用例全过',
      evidence: { kind: 'command', command: 'pnpm test:e2e' },
      pass: { kind: 'exit-zero' },
    },
    {
      statement: '改动说明写进了 CHANGELOG',
      evidence: { kind: 'file', path: 'CHANGELOG.md' },
      pass: { kind: 'shows', text: '「未发布」一节下有一条讲这次提速的新条目' },
    },
  ],
  metrics: [
    {
      statement: '首页 p95 加载时间，毫秒',
      measure: { command: 'pnpm bench:home --json', path: '.p95_ms' },
      direction: 'lower',
      target: 800,
      floor: 1200,
      baseline: 'measure-first',
    },
  ],
  rules: [
    { statement: '不改公共接口。' },
    { statement: '每次提交前跑 `pnpm lint`，不带着报错提交。' },
  ],
  exits: [
    {
      statement: '预算用尽',
      kind: 'budget',
      limits: [{ amount: 30, unit: 'rounds' }],
      deliver: '当前最好的指标与改动',
      counts: 'failure',
    },
    {
      statement: '预算用尽时已经够用',
      kind: 'good-enough',
      by: [
        { kind: 'floor', id: 'M1' },
        { kind: 'criterion', id: 'A2' },
      ],
      deliver: '当前的指标与改动，写明离目标差多少',
      counts: 'success',
    },
    {
      statement: '要改公共接口才能达标',
      kind: 'person',
      deliver: '要改哪个接口、为什么',
      counts: 'failure',
    },
  ],
  references: [
    { statement: '首页的渲染路径与已知的慢点', at: 'docs/perf/home.md', readWhen: '开工' },
  ],
  method: ['先量基线，再动手；每改一处量一次。'],
}

export const HOME_TEXT = `## 目的
把首页的加载时间降下来，不改功能。运营反馈首屏太慢，影响转化。

## 达成
- [A1] 首页在测试环境里的 p95 加载时间到 M1 的目标
  - 证据: 指标 M1
- [A2] 现有端到端用例全过
  - 证据: 命令 \`pnpm test:e2e\`
  - 通过: 退出码 0
- [A3] 改动说明写进了 CHANGELOG
  - 证据: 文件 \`CHANGELOG.md\`
  - 通过: 「未发布」一节下有一条讲这次提速的新条目

## 指标
- [M1] 首页 p95 加载时间，毫秒
  - 量法: 命令 \`pnpm bench:home --json\` 取 \`.p95_ms\`
  - 方向: 越低越好
  - 目标: 800
  - 底线: 1200
  - 基线: 先量

## 守则
- [N1] 不改公共接口。
- [N2] 每次提交前跑 \`pnpm lint\`，不带着报错提交。

## 退出
- [X1] 预算用尽
  - 种类: 预算
  - 上限: 30 轮
  - 交: 当前最好的指标与改动
  - 算: 失败
- [X2] 预算用尽时已经够用
  - 种类: 够用
  - 凭: M1 到底线, A2
  - 交: 当前的指标与改动，写明离目标差多少
  - 算: 成功
- [X3] 要改公共接口才能达标
  - 种类: 要人定
  - 交: 要改哪个接口、为什么
  - 算: 失败

## 依据
- [R1] 首页的渲染路径与已知的慢点
  - 在: \`docs/perf/home.md\`
  - 读: 开工

## 做法
- 先量基线，再动手；每改一处量一次。
`

/** The least a goal can be: a purpose and one criterion. */
export const LEAST: GoalDraft = {
  purpose: '把这段输入要的事做完',
  criteria: [{ statement: '事做完了', evidence: { kind: 'person' } }],
}
