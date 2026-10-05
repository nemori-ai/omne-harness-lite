# @omne-harness-lite/governance-center-entry-https-json

[English](README.md)

治理 HTTPS／JSON 的客户端公共传输契约。它定义体检、交换结果与信任配置，不提供 HTTP 实现。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/governance-center-entry-https-json": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                     | 用途                       |
| ------------------------------------------------------------------------ | -------------------------- |
| `GovernanceTransport`                                                    | 公开体检与治理交换接口     |
| `PublicHealthOptions`, `CenterTrust`                                     | 端点、信任、超时与取消输入 |
| `PublicHealthOutcome`, `GovernanceOutcome`, `EntryAnswer`                | 分类传输与入口观察         |
| `GovernanceClientConfigurationError`, `GovernanceTransportStopped`       | 配置与生命周期使用错误     |
| `./cordis`: `GovernanceTransportService`, `GOVERNANCE_TRANSPORT_SERVICE` | 公共 Service 定义与服务键  |

## 示例

```ts
import type {
  GovernanceTransport,
  PublicHealthOptions,
} from '@omne-harness-lite/governance-center-entry-https-json'

export async function inspectCenter(transport: GovernanceTransport, options: PublicHealthOptions) {
  return transport.readPublicHealth(options)
}
```

调用方提供传输、HTTPS 端点及明确的信任要求。只有调用该函数时才发送请求。

## 边界与生命周期

客户端契约继续使用 EC2／HT2 协议。服务端 EC3／HT3 承诺不自动升级客户端协议。精确范围见 [SPEC.md](SPEC.md)。

传输执行一次尝试，不选择中心、不保存登录、不接受新信任，也不安排重试。公开体检可达不表示业务就绪。

取消只请求停止，不表示清理完成。请求可能到达服务端时须保留 `sendAttempted` 信息，不能把不确定的远端效果报告成确定失败。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/governance-center-entry-https-json run build
pnpm --filter @omne-harness-lite/governance-center-entry-https-json run typecheck
pnpm --filter @omne-harness-lite/governance-center-entry-https-json run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [Node HTTPS 客户端提供者](../../frontend/governance-center-client-https/README.md)
- [服务端入口定义](../governance-center-entry/README.md)
