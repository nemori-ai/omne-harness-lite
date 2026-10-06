# @omne-harness-lite/assembly-lifecycle

[English](README.md)

有序装配代的显式完成拥有者。它停止准入，并按逆序等待已登记工作关闭。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/assembly-lifecycle": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                    | 用途                           |
| --------------------------------------------------------------------------------------- | ------------------------------ |
| `createAssemblyLifetime`, `AssemblyLifetime`                                            | 创建、认领及关闭一代装配       |
| `AssemblyLifetimePort`, `OwnedWork`, `LifetimeRegistration`                             | 行作用域准入与实际完成         |
| `AssemblyCloseReport`, `CloseResult`                                                    | 包含分类失败的完成结果         |
| `AssemblyWorkStopped`                                                                   | 停止后启动管理工作时的使用错误 |
| `createRetainedWork`, `RetainedCloseControl`, `RetainedCloseAttempt` | 保有未确认关闭的原责任并显式重试 |
| `./cordis`: `AssemblyLifetimeService`, `ASSEMBLY_LIFETIME_SERVICE`, `startAssemblyWork`, `startRetainedAssemblyWork` | 注入行端口并登记实际工作 |

## 示例

```ts
import assert from 'node:assert/strict'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'

const closed: string[] = []
const lifetime = createAssemblyLifetime(['database', 'consumer'], () => {})
assert.equal(lifetime.tryClaim(), true)
for (const id of lifetime.ids) {
  lifetime.port(id).register({
    ready: Promise.resolve(),
    async close() {
      closed.push(id)
    },
  })
}
const report = await lifetime.close()
assert.equal(report.complete, true)
assert.deepEqual(closed, ['consumer', 'database'])
assert.equal(lifetime.isCurrent(), false)
```

示例登记的是演示用拥有者。真实拥有者的 `close()` 须等待资源与已准入工作完成。登记前须认领 lifetime。

## 边界与生命周期

每个 lifetime 只允许一次认领，不能在替换提供者时复用。行端口共享本代停止状态，并标明关闭责任，不授予租户权限。

停止回调在停止准入后执行，不表示关闭已完成。释放依赖前须检查关闭报告。Cordis fiber 的撤除不能把关闭失败改成成功完成。

本包不发现插件、不回滚已提交业务数据，也不调度 Session 工作。顺序与失败契约归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/assembly-lifecycle run build
pnpm --filter @omne-harness-lite/assembly-lifecycle run typecheck
pnpm --filter @omne-harness-lite/assembly-lifecycle run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [插件树加载器](../cordis-plugin-tree/README.md)
