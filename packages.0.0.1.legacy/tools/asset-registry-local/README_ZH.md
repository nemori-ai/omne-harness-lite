# @omne-harness-lite/asset-registry-local

[English](README.md)

独立七操作登记表闭包；完整 MCP 和外部依赖事实仍未接全，本包尚无正式提供者插件。见[提供者行为](SPEC.md)与[验证入口](verification/README.md)。

扩展声明使用 `@omne-harness-lite/loop-extension` 当前公开类型。

提供者根入口导出 `createAssetRegistry` 和构造类型。共用操作与纯投影归 `@omne-harness-lite/asset-registry`，服务定义归它的 `./cordis`。demo 只创建一个注册表，通过该定义的子类借出；原先使用活体配置的实验插件已删除。

## 已声明公开面

| 导出 | 用途 |
| --- | --- |
| `createAssetRegistry` | 构造显式依赖绑定的 registry 闭包 |
| `AssetRegistryService` | 声明 fill/reload、可用性刷新、lookup/list、失败标记及资产变化操作 |
| `REGISTERED_CATEGORIES` | 查看表类别 |
| `buildTableContents`、`buildSnapshots`、`computeAvailability`、`findInSnapshot`、`buildReport` | 可单独取用的构造/投影函数 |
| `extractRootSourceFromFullFillRecord` | 从完整填表记录读取原始根来源 |

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
pnpm --filter @omne-harness-lite/asset-registry-local... run build
pnpm --filter @omne-harness-lite/asset-registry-local run typecheck
pnpm --filter @omne-harness-lite/asset-registry-local run test
```

[行为承诺](SPEC.md)拥有类型之外的规则；[验证入口](verification/README.md)说明方法与限制。
