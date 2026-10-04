# @omne-harness-lite/assembly-manifest-store

[English](README.md)

通过公开 Storage 持久保存不可变会话装配记录，读取头部、历史表及求值投影。本包是实验性 ESM workspace 成员，尚未发布到 npm。当前提供者采用 MF4；组件检查与完整模型 runtime 验收分别记录，见[实现映射和验证](../../../.meta_harness/design/realization/packages/assets/assembly-manifest-store/README.md)。

## 公开接口

| 导出 | 用途 |
| --- | --- |
| `createAssemblyManifestStore(storage, options)` | 建立借用调用者 storage 的独立闭包 |
| `readHead`、`append`、`readHistory` | 读取头部、条件追加、读取某类资产的历史记录 |
| `readGiven(session, head)` | 在明确观察到的 head 读取实际原始完整填表记录 |
| `readEvaluation`、`dependencyPresence` | 读取当前求值投影与显式依赖事实 |
| `checkManifestAppendInput`、`checkManifestGivenReadInput`、`judgeManifestAppend` | 单独复用输入判定与追加决定 |
| `answerPresence`、`readEvaluationProjection` | 单独复用事实投影 |
| `assemblyManifestMigrations` | 准入前合成 SQL 迁移片段 |
| `assemblyManifestStorePlugin`、`ASSEMBLY_MANIFEST_SERVICE` | Cordis 提供者与服务标识 |

## 追加并读回

传入实际会话及装配 owner 构造的完整记录。追加以观察到的 head 为前提，冲突明确返回。`readGiven` 会检查保存的求值内容和原始填表种类，任意 JSON 不等于可消费的求值记录。

```ts
import { createAssemblyManifestStore, type ManifestAppendInput } from '@omne-harness-lite/assembly-manifest-store'
import type { Storage } from '@omne-harness-lite/storage'

export async function recordAssembly(storage: Storage, session: string, record: ManifestAppendInput) {
  const store = createAssemblyManifestStore(storage)
  try {
    const current = await store.readHead(session)
    if ('failure' in current) return current
    const appended = await store.append(session, current.head, record)
    if ('failure' in appended) return appended
    return await store.readGiven(session, appended.head)
  } finally { await store.close() }
}
```

`readHistory(session, category, filledAt)` 读取精确分类快照；`readEvaluation(session)` 读取当前公开投影。记录不存在、输入非法和存储不可用分别保留。重复追加判定会保留记录 owner，不意味着可以重试结果未知的提交。

## 接入与关闭

先将 `assemblyManifestMigrations` 与装配其他片段合成，完成迁移和准入检查。`dependencyPresence` 需要显式 `PresenceSource`，未知事实不能当作 absent。可选诊断端口只接收阶段事实，输出上界由端口持有方负责。

先调用 `store.close()` 停止新工作并排空已准入操作，再关闭自己的 storage。闭包和插件借用 storage，不删除历史。组件测试使用真实临时 SQLite 和子进程崩溃，不构成断电耐久证明或完整 registry/runtime 组合验收。

```sh
pnpm --filter @omne-harness-lite/assembly-manifest-store... run build
pnpm --filter @omne-harness-lite/assembly-manifest-store run typecheck
pnpm --filter @omne-harness-lite/assembly-manifest-store run test
```
