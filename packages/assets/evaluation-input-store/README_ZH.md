# @omne-harness-lite/evaluation-input-store

[English](README.md)

从不可变本地发布、实际会话租户归属及当前组织治理事实读取独立持有的求值输入。本包是实验性、未发布的 ESM workspace 成员，提供独立闭包及 Cordis 读取服务。提供者行为见[薄SPEC](SPEC.md)，资源与局限见[验证入口](verification/README.md)。

## 公开入口

| 入口 | 能力 |
| --- | --- |
| `.` | `createEvaluationInputReader`、`evaluationInputMigrations` 和依赖/reader类型 |
| `./cordis` | `evaluationInputStorePlugin`；共享 CurrentEvaluationInputs Service及支持端口归asset-evaluation |
| `./publication` | 可信 `publishLocalInputs`、`captureSessionRecipe`、`readPublicationRevision` 及发布类型 |
| `./registry-inputs` | 供已准入 registry 调用者使用的受限固定根读取器 |
| `./registry-history` | `createRegistryHistoryReader` 及历史类型，读取已授权精确历史正文 |

## 读取当前输入

会话引用通过 `@omne-harness-lite/messages` 当前根入口校验；这些读取不解码对话消息正文。

明确交入与实际治理共用的 `AtomicStorage`、会话归属读取器、`storeKey`、可信部署条目 `{ capability, meta }`、诊断/失败端口和单调计时函数。先建立真实会话映射并捕获它的 recipe。

```ts
import { createEvaluationInputReader, type InputSourceDependencies } from '@omne-harness-lite/evaluation-input-store'
import type { TenantId } from '@omne-harness-lite/identity-values'

export async function readCurrent(dependencies: InputSourceDependencies, session: string, tenant: TenantId) {
  const reader = createEvaluationInputReader(dependencies)
  try { return await reader.read(session, tenant) }
  finally { await reader.close() }
}
```

结果保留归属和来源修订。空范围行与缺少范围行不同。shared/workspace/MCP 来源不可用时拒绝整个读取，不补空输入。

## 在可信 bootstrap 发布

传入完整定义、明确范围行及带 `expectedRevision` 的发布。下一次读取能看到新发布，已经返回的值保持为独立快照。

```ts
import type { InputSourceDependencies } from '@omne-harness-lite/evaluation-input-store'
import { publishLocalInputs, readPublicationRevision, type LocalPublication } from '@omne-harness-lite/evaluation-input-store/publication'

export async function publish(dependencies: InputSourceDependencies, publication: LocalPublication) {
  const previous = await readPublicationRevision(dependencies)
  const result = await publishLocalInputs(dependencies, publication)
  return { previous, result }
}
```

提交结果未知时先读实际修订和数据，再决定下一步；示例不自动重试。`captureSessionRecipe` 在会话归属建立后记录明确的根及会话值。

## 受限消费者与生命周期

仓库 guard 限制 `./registry-inputs` 和 `./registry-history` 的调用者。固定根调用者需先确认原始完整填表。历史读取器消费真实 manifest 历史、当前租户/成员资格及不可变版本，不恢复 registry，也不根据传入元组授予权限。普通 runtime 消费根入口。

准入前将 `evaluationInputMigrations` 与实际账户、治理、会话迁移合成。读取器的 `close()` 排空自身读取；先关闭读取器并结束发布，再关闭借用的治理/storage。测试使用真实文件 SQLite 和实际治理插件，组件通过不等于完整 runtime 交付或断电证明。

```sh
pnpm --filter @omne-harness-lite/evaluation-input-store... run build
pnpm --filter @omne-harness-lite/evaluation-input-store run typecheck
pnpm --filter @omne-harness-lite/evaluation-input-store run test
```
