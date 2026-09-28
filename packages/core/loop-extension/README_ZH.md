# @omne-harness-lite/loop-extension

[English](README.md)

提供十一处 Agent Loop 位置上拓展件的数据与判定。声明拓展件的干预力与实现，接收调用输入，并对照该次精确输入检查结论记录。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

| 公开 API                                                           | 用途                               |
| ------------------------------------------------------------------ | ---------------------------------- |
| `judgeDefinition`、`judgeInput`、`judgeOutput`                     | 接收协议值并取得带类型的副本       |
| `judgeConclusion(value, inputs)`                                   | 检查结论形状、合法组合与不可改字段 |
| `POSITIONS`、`POWERS`、`POWER_CONCLUSIONS`、`POSITION_CONCLUSIONS` | 查看位置与结论的合法组合           |
| `loopExtensionBodyContract`                                        | 为资产模型提供拓展件定义规则       |
| `validate`、`judgeValue`                                           | 使用 Schema 与通用判定面           |

根入口采用 `data.loop-extension/v6`。模型调用失败输入必须带完整、有序的 `retryConclusions`；该位置落下的每条结论都必须带与输入相符的 `modelCallId`。`/schema/v3` 与 `/schema/v2` 仅提供当前规范引用所需的精确资源，不是旧版可执行 API。

## 接收拓展件定义

声明描述一个内置实现；接收定义不会加载或调用它。

```ts
import {
  judgeDefinition,
  POWER_CONCLUSIONS,
  POSITION_CONCLUSIONS,
  type LoopExtensionDefinition,
} from '@omne-harness-lite/loop-extension'

const definition: LoopExtensionDefinition = {
  name: 'review-before-action',
  position: 'before_action',
  power: 'veto',
  onError: 'record',
  unavailability: 'veto',
  needs: ['audit-log'],
  implementation: { kind: 'builtin', builtinName: 'action-review' },
}
console.log('ok' in judgeDefinition(definition)) // true
console.log(POWER_CONCLUSIONS.observe) // ['observed']
console.log(POSITION_CONCLUSIONS.after_terminal) // ['observed']
```

## 对照实际输入检查改写

这里允许表示对已解析参数的改写，但拒绝改变调用身份。输入判定器构造不透明句柄与内容块类型。

```ts
import { judgeInput, judgeConclusion } from '@omne-harness-lite/loop-extension'

const input = judgeInput({
  position: 'before_action',
  run: 'run_1',
  attempt: 1,
  subject: {
    call: {
      id: 'block_call',
      kind: 'tool_call',
      complete: true,
      callId: 'call_1',
      tool: 'repo__read',
      arguments: { path: 'README.md' },
      visibility: { toHuman: true, toModel: true },
    },
    definition: { name: 'repo__read' },
    batch: ['call_1'],
  },
  earlier: [],
  log: 'log_1',
  environment: 'environment_1',
})
if ('rejected' in input || input.ok.position !== 'before_action')
  throw new Error('Action input required')
const subject = input.ok.subject
const context = { input: input.ok, extensionName: 'review-before-action' }
const conclusion = {
  extension: context.extensionName,
  position: 'before_action',
  power: 'rewrite',
  callId: 'call_1',
  at: '2026-09-26T10:00:00Z',
  output: {
    kind: 'rewrite',
    subject: {
      ...subject,
      call: { ...subject.call, arguments: { path: 'CONTRIBUTING.md' } },
    },
  },
}
console.log('ok' in judgeConclusion(conclusion, context)) // true
console.log(
  judgeConclusion(
    {
      ...conclusion,
      output: {
        kind: 'rewrite',
        subject: {
          ...subject,
          call: { ...subject.call, tool: 'other' },
        },
      },
    },
    context,
  ),
) // { rejected: 'rewrite_touches_immutable' }
```

## 失败与边界

判定返回带类型的 `{ ok }` 副本或 `{ rejected }`。`judgeConclusion` 需要已经接收的 `ExtensionInput` 与真实拓展件名，并与该次位置、维度及动作身份配对。辅助配置缺失或不合法会抛出 `TypeError`；协议拒绝仍是独立结果。只检查 Schema 的类型守卫与 `validate` 无法对照实际调用检查改写。

合法结论不代表派发授权。调用方提供生效干预力，检查模型与供应商资格，完成放行，记录结论并按 Loop 次序应用。`select_model`、`retry`、`ask`、`veto` 在这里都是值；本包不执行模型选择、重试、等待、否决效果或命令。日志与环境句柄是不透明的。

改写保留对应位置的不可改成员。拓展件不能把无法解析的工具调用修补成已解析参数。注入提醒必须以真实拓展件名作为来源。依赖、策略执行、持久化与恢复归消费者负责。

公开 JSON Schema 入口是 `@omne-harness-lite/loop-extension/schema`（v6）、`/schema/v3` 和 `/schema/v2`。参见[源码导出](src/index.ts)、[测试](tests/)与[工具定义](../tool-definition/README_ZH.md)。

## 校验已记录的重试结论

重试历史保留完整结论，包括模型调用身份、作者、时刻及方案。`judgeInput` 校验完整失败主体，并核对每条发出记录及重试结论都属于同一个模型调用；完整日志前缀仍由运行时取得。

```ts
import { judgeValue } from '@omne-harness-lite/loop-extension'

const result = judgeValue('ModelRetryConclusion', {
  extension: 'default-retry',
  position: 'after_model_call',
  dimension: { ending: 'failure' },
  modelCallId: 'mc_01',
  power: 'rewrite',
  output: { kind: 'retry', plan: { provider: 'provider-b', after: 'PT2S' } },
  at: '2026-09-28T10:00:00Z',
})
console.log('ok' in result) // true
```
