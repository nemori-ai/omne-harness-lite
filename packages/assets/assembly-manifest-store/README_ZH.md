# @omne-harness-lite/assembly-manifest-store

[English](README.md)

通过公开 Storage 保存不可变会话装配记录。独立 MF4 工厂与 Cordis 绑定共用六操作实现。
本包是实验性 ESM workspace 成员，尚未发布到 npm。组件接受与完整模型 runtime 接受分别记录。
[绑定行为](SPEC.md)、[验证入口](verification/README.md)与保留的 [MF4 来源](../../../.meta_harness/design/realization/packages/assets/assembly-manifest-store/README.md)分别约束自己的范围。

## 公开入口

| 入口 | 导出 |
|---|---|
| 根入口 | createAssemblyManifestStore、assemblyManifestMigrations、AssemblyManifestStore、ManifestDb |
| ./cordis | assemblyManifestStorePlugin、AssemblyManifestStoreService、AssemblyManifestResourcesService |
| 公共拥有者 @omne-harness-lite/assembly-manifest | 六操作类型、ManifestAppendInput、PresenceSource、ManifestOptions、ManifestDiagnostic、纯输入判定和投影函数 |
| 公共拥有者 @omne-harness-lite/assembly-manifest/cordis | 业务及资源的抽象 Service、唯一服务键 |

根入口不导入 Cordis。工厂返回 readHead、append、readHistory、dependencyPresence、readEvaluation、readGiven 和 close。
纯校验及投影函数从公共定义包导入，不经提供者别名转发。

## 独立调用

传入真实会话及装配拥有者构造的完整记录，追加以观察到的 head 为前提。
冲突、记录不存在、输入非法和存储不可用保持不同结果。

```ts
import { createAssemblyManifestStore } from '@omne-harness-lite/assembly-manifest-store'
import type { ManifestAppendInput } from '@omne-harness-lite/assembly-manifest'
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

## Cordis 与资源责任

准入前合成并执行 assemblyManifestMigrations。先提供 storage 与显式的 AssemblyManifestResourcesService，再以 `{}` 加载 manifest 插件。
资源 Service 承载可选 presence 和诊断端口；运行时回调不能放在可序列化插件配置中。
配置 diagnostic 必须同时提供 diagnosticFailure。未知 presence 仍是未知；诊断不包含内容和原始错误。

插件借用 storage 与端口。撤除停止新有效调用，已准入操作继续使用捕获的旧代资源。
选择 AssemblyManifestStoreService 的装配代码保留其稳定 closed promise。只有 fulfilled 才证明真实排空，允许释放借用资源。
拒绝完成需要检查；重复内核撤除不能代替真实完成观察。新代可用不解除旧代责任。
独立调用时，先 await store.close，再释放借用资源。两条路径都不删除历史，也不关闭调用者的 storage。

```sh
pnpm --filter @omne-harness-lite/assembly-manifest-store... run build
pnpm --filter @omne-harness-lite/assembly-manifest-store run typecheck
pnpm --filter @omne-harness-lite/assembly-manifest-store run test
```
