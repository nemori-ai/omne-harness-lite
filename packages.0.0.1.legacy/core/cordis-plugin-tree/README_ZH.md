# @omne-harness-lite/cordis-plugin-tree

[English](README.md)

采用稳定行标识、可序列化配置及脱敏来源描述的两层插件树。Cordis 入口负责准备与加载合成后的树。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/cordis-plugin-tree": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                            | 用途                                |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| `PluginRow`, `OperatorEdit`, `composePluginTree`                                                | 合成发行层行与替换、停用、插入编辑  |
| `describePluginTree`, `PluginTreeDescription`                                                   | 描述所有行，并脱敏配置              |
| `AssemblyDeclaration`, `AssemblyClaim`, `PreparedPluginTree`, `PluginTreeHandle`                | 准备结果、依赖与生命周期形状        |
| `PluginTreeError`, `PluginTreePreparationError`, `PluginTreeUsageError`, `PluginTreeStartError` | 带安全错误码的分类错误              |
| `./cordis`: `preparePluginTree`, `loadPluginTree`, `inspectPluginTree`                          | 解析导出、装载 fiber 及检查实际装配 |

## 示例

```ts
import assert from 'node:assert/strict'
import { composePluginTree, describePluginTree } from '@omne-harness-lite/cordis-plugin-tree'

const rows = composePluginTree(
  [
    {
      id: 'clock',
      plugin: { package: '@omne-harness-lite/clock-lease', export: 'managedClockPlugin' },
      config: {},
    },
  ],
  [{ op: 'replace', id: 'clock', config: {} }],
)
const [description] = describePluginTree(rows)
assert.equal(description?.source, 'operator')
assert.equal(description?.config, '[redacted]')
```

合成不解析示例插件，也不启动资源。准备阶段由解析器从公开 `/cordis` 入口选择具名导出。

## 边界与生命周期

替换会替换整份配置。停用保留行标识与位置。插入须定位启用行。缺失目标、重复标识与非法配置均失败。

配置只接受有限 JSON 数据，不接受运行时对象、回调、访问器或循环。来源描述不暴露配置值、键、长度或摘要。

准备在执行插件前校验启用导出、Schema、装配声明与依赖顺序，不为部署代码提供沙箱。一份真实准备结果只能加载到一份全新的 lifetime。

就绪须同时满足资源工作与真实 fiber／服务状态。就绪失败不表示关闭完成。外部服务须保留到关闭报告允许释放。详见 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/cordis-plugin-tree run build
pnpm --filter @omne-harness-lite/cordis-plugin-tree run typecheck
pnpm --filter @omne-harness-lite/cordis-plugin-tree run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [装配完成拥有者](../assembly-lifecycle/README.md)
- [真实治理宿主](../../../apps.0.0.1.legacy/tenancy-host/README.md)

## 当前支持与架构偏离

当前loader加载已安装npm包的具名/cordis导出，准备一份进程内固定树。它尚无运行期配置热更新或Session动态插件接管入口，更新当前依赖重启重算。这是支持缺项，不是系统必须重启的规范。

固定行或端口退出ACTIVE，静态声明的必需、可选服务丧失或换代，以及可选依赖拥有关系变化，目前会结束整代。纯动态贡献退出若未撤掉静态服务则不触发该停止。若同代包含无关工作，这个策略超出[真实依赖影响范围](../../../docs/architecture/deployment/cordis-and-lifecycle.md#依赖换代与就绪)；可选服务换代也不能直接成为无关工作停机的许可。loader、关闭机制及实际装配拥有者继续承接局部换代和连续性，不能凭现有回归测试声称目标已满足。
