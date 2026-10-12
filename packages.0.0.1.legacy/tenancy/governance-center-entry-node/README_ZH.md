# @omne-harness-lite/governance-center-entry-node

[English](README.md)

Node 治理入口，包含 TLS 客户端面与 Unix 套接字运维面。独立工厂与 Cordis 绑定共享启动和关闭拥有者。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/governance-center-entry-node": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                                     | 用途                                   |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `createGovernanceCenterEntry`, `createGovernanceCenterOps`, `GovernanceCenterWork`                       | 具有 `setup()` 与 `close()` 的独立工厂 |
| `GovernanceCenterEntryConfigSchema`, `GovernanceCenterOpsConfigSchema`, 依赖与配置类型                   | 经校验的配置与显式运行时依赖           |
| `GovernanceCenterWorkStopped`, `GovernanceCenterClockTimeoutError`, `TlsMaterialError`, 身份与套接字错误 | 分类启动、生命周期与资源错误           |
| `governanceCenterMigrations`, `governanceCenterPreflight`, 快照与离线维护导出                            | 调用方合成的数据库及维护设施           |
| `RECEIVE_LIMITS`, `TLS_HANDSHAKE_TIMEOUT_MS`, `OPS_SOCKET_NAME`                                          | 公开传输上界与套接字文件名             |
| `./cordis`: `governanceCenterEntryPlugin`, `managedGovernanceCenterEntryPlugin`                          | 独立与管理 TLS 绑定                    |
| `./cordis`: `governanceCenterOpsPlugin`, `managedGovernanceCenterOpsPlugin`                              | 独立与管理 Unix 运维绑定               |

## 示例

```ts
import {
  createGovernanceCenterEntry,
  type GovernanceCenterEntryConfig,
  type GovernanceCenterEntryDependencies,
} from '@omne-harness-lite/governance-center-entry-node'

export async function serveEntry(
  config: GovernanceCenterEntryConfig,
  dependencies: GovernanceCenterEntryDependencies,
  serve: () => Promise<void>,
) {
  const entry = createGovernanceCenterEntry(config, dependencies)
  try {
    await entry.setup()
    await serve()
  } finally {
    await entry.close()
  }
}
```

调用方提供 TLS 材料、存活业务服务与本代开闸信号。需要结束服务时，`serve` 须兑现。单独完成 setup 不授予开闸资格。

## 边界与生命周期

构造不启动 I/O。setup 与 close 使用稳定的完成 Promise。setup 失败后仍须关闭；先关闭再 setup 会阻止资源启动。

两张面均依赖公共开闸服务。宿主须在开闸前确认当前代。维护资源使用 `EntryMaintenance`，不把回调放进 JSON 配置；管理绑定另需装配 lifetime 端口。

停止会阻止新准入。借入依赖释放前，已有业务工作须完成。网络排空超时不证明业务完成。类型化通知归[公共入口拥有者](../../core/governance-center-entry/README.md)。

真实[治理宿主](../../../apps.0.0.1.legacy/tenancy-host/README.md)选择提供者、合成迁移并拥有确认／开闸。公共集成承诺归 [SPEC.md](SPEC.md)，保持的业务条款继续从该处接续。

## 传输常量

这些取值是实现常量，不是配置字段。接受的协议版本归公共入口拥有者定义。

| 上界或时限                   | 取值                                        |
| ---------------------------- | ------------------------------------------- |
| 头部块／请求体               | 8,192／65,536 字节                          |
| 客户端 JSON 深度／对象成员数 | 64／1,024                                   |
| 接收／TLS 握手时限           | 30／30 秒                                   |
| 读尽字节数／时限             | 65,536 字节／5 秒                           |
| 运维面撤除时等待在途体检     | 3 秒                                        |
| 现探存储的体检时限           | 2 秒                                        |
| 时钟轮询间隔                 | 100 毫秒，上界由 `clockReadyTimeoutMs` 限定 |

私有请求策略消费协议、关联号和事务端口。业务路由与 wire 投影各有唯一拥有者，适配保留原提交及答复次序。见[边界理由](adr/decision-protocol.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/governance-center-entry-node run build
pnpm --filter @omne-harness-lite/governance-center-entry-node run typecheck
pnpm --filter @omne-harness-lite/governance-center-entry-node run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

测试使用真实 TLS、Unix 套接字与 SQLite 文件。部分传输用例需要本机 OpenSSL；慢接收用例约耗时 30 秒。双来源用例使用 `127.0.0.1` 与 `127.0.0.2`，或按端到端环境说明设置 `OMNE_TEST_ALTERNATE_SOURCE_ADDRESS`。

## 相关包

- [服务端入口定义](../../core/governance-center-entry/README.md)
- [传输定义](../../core/governance-center-entry-https-json/README.md)
- [端到端环境说明](../../../apps.0.0.1.legacy/tenancy-host/tests/e2e/README.md)

[维护边界](adr/maintenance-effects.md)分开策略与文件、codec 和摘要提供者；实际装配保持原同fd、发布和清理所有权。

运维体检编码消费注入的探针，装配选择原SQL探针与维护提供者。探针超时后实际读仍继续；网络排空后仍等已准入业务完成，再释放资源。
