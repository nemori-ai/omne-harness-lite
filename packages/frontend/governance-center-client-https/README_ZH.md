# @omne-harness-lite/governance-center-client-https

[English](README.md)

用于公开体检与治理交换的 Node HTTPS／JSON 客户端。可以使用独立请求函数，也可以使用具有显式完成所有权的实例。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/governance-center-client-https": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                        | 用途                                      |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| `readPublicHealth`, `exchangeGovernance`                                    | 独立的单次请求函数                        |
| `createGovernanceTransport`, `GovernanceTransportInstance`                  | 具有公共传输操作及 `close()` 的请求拥有者 |
| `./cordis`: `governanceTransportPlugin`, `managedGovernanceTransportPlugin` | 独立与装配管理绑定                        |

## 示例

```ts
import type { PublicHealthOptions } from '@omne-harness-lite/governance-center-entry-https-json'
import { createGovernanceTransport } from '@omne-harness-lite/governance-center-client-https'

export async function inspectHealth(options: PublicHealthOptions) {
  const transport = createGovernanceTransport()
  try {
    return await transport.readPublicHealth(options)
  } finally {
    await transport.close()
  }
}
```

调用此函数会发送一次请求。须提供预期的 HTTPS 端点与信任配置。函数保留实例直到清理完成。

## 边界与生命周期

公开输入与结果类型归[传输定义包](../../core/governance-center-entry-https-json/README.md)。非法配置在网络 I/O 前失败。默认超时为 10,000 毫秒，接受范围为 1～120,000 毫秒。

请求不自动重试、不跟随重定向，也不自动接受新信任。响应头部与体积有界。取消后保留可能已经发送的效果信息。

实例关闭会停止新请求，并等待自身拥有的请求／套接字清理，不关闭独立函数或其他实例的请求。DNS 工作可能晚于套接字清理完成。管理绑定使用注入的装配 lifetime 端口。详见 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/governance-center-client-https run build
pnpm --filter @omne-harness-lite/governance-center-client-https run typecheck
pnpm --filter @omne-harness-lite/governance-center-client-https run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

测试使用本地 TLS 服务端，不需要付费模型调用或公共治理服务。

## 相关包

- [本地客户端协调者](../governance-client-operations-local/README.md)
