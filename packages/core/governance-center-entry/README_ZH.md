# @omne-harness-lite/governance-center-entry

[English](README.md)

服务端入口的公共协调定义：中心身份、路由、类型化通知、准入与维护资源。本包不监听网络套接字。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/governance-center-entry": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                 | 用途                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `EntryOpeningSignal`, `EntryOpeningStopped`                                          | 本代准入与等待停止行为                                                      |
| `EntryMaintenanceResources`                                                          | 运行时维护依赖                                                              |
| `GovernanceCenterId`, `isGovernanceCenterId`                                         | 中心标识形状与校验                                                          |
| `PUBLIC_HEALTH_ROUTE`, `ROUTE_IDS`, `ACCEPTED_PROTOCOL_VERSIONS`                     | 公开体检路由、路由标识与接受的协议版本                                      |
| `SERVING_EVENT`, `STOPPED_EVENT`, `DEFECT_EVENT`, `LISTENING_EVENT`, `ServingNotice` | 公共类型化通知名及载荷                                                      |
| `./cordis`: `EntryOpening`, `EntryMaintenance`                                       | 共享 Service 及 `ENTRY_OPENING_SERVICE`、`ENTRY_MAINTENANCE_SERVICE` 服务键 |
| `./schema/v2`                                                                        | 公开 EC2 线协议 Schema                                                      |

## 示例

```ts
import assert from 'node:assert/strict'
import {
  isGovernanceCenterId,
  ACCEPTED_PROTOCOL_VERSIONS,
} from '@omne-harness-lite/governance-center-entry'

assert.equal(isGovernanceCenterId('0123456789abcdef0123456789abcdef'), true)
assert.equal(isGovernanceCenterId('not-a-center-id'), false)
assert.deepEqual(ACCEPTED_PROTOCOL_VERSIONS, ['2'])
```

标识校验只检查形状，不建立中心信任。协议常量不表示入口正在监听或已经开闸。

## 边界与生命周期

开闸等待兑现不表示持续许可。宿主拥有本代确认与开闸责任；入口须在每次准入边界重新检查 `isOpen()`。

停止准入不取消已准入业务工作。实际完成前须保留其依赖。通知只报告状态，不授予权限，也不撤销已提交数据。

运行时维护资源通过服务传递，不放进可序列化插件配置。操作、事件与生命周期承诺归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/governance-center-entry run build
pnpm --filter @omne-harness-lite/governance-center-entry run typecheck
pnpm --filter @omne-harness-lite/governance-center-entry run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [Node 服务端提供者](../../tenancy/governance-center-entry-node/README.md)
