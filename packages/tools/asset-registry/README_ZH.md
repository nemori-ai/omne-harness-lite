# @omne-harness-lite/asset-registry

[English](README.md)

实验性会话资产表实现。本包是未发布的 ESM workspace 骨架：已有声明和构建，但组件检查尚未通过，完整服务没有交付通过。model-runtime 纵线会先补齐所需投影。状态见[实现映射](../../../.meta_harness/design/realization/packages/tools/asset-registry/README.md)。

## 已声明公开面

| 导出 | 用途 |
| --- | --- |
| `createAssetRegistry` | 构造显式依赖绑定的 registry 闭包 |
| `AssetRegistryService` | 声明 fill/reload、可用性刷新、lookup/list、失败标记及资产变化操作 |
| `REGISTERED_CATEGORIES` | 查看表类别 |
| `buildTableContents`、`buildSnapshots`、`computeAvailability`、`findInSnapshot`、`buildReport` | 可单独取用的构造/投影函数 |
| `extractRootSourceFromFullFillRecord` | 从完整填表记录读取原始根来源 |
| `assetRegistryPlugin`、`ASSET_REGISTRY_SERVICE` | 实验性 Cordis 提供者声明 |

## 查看接口调用形式

```ts
import { REGISTERED_CATEGORIES, type AssetRegistryService } from '@omne-harness-lite/asset-registry'

console.log(REGISTERED_CATEGORIES)
export async function readTools(registry: AssetRegistryService, session: string, within: unknown) {
  return registry.list(session, 'tool', within)
}
```

示例仅说明公开调用形式，需要真实初始化的 registry，不证明未完成提供者已经可运行。处理分类 `failure` 和 lookup 的 `none`。依赖包括真实 manifest 历史、当前/固定输入源、租户映射、时钟及明确的冲突/容量/诊断政策，不以虚构成功事实替代。

先关闭 registry，再释放借用的依赖。完整命令通知和通用 registry 交付不属于当前 runtime 增量。先构建再跑当前检查，并保留失败。

```sh
pnpm --filter @omne-harness-lite/asset-registry... run build
pnpm --filter @omne-harness-lite/asset-registry run typecheck
pnpm --filter @omne-harness-lite/asset-registry run test
```
