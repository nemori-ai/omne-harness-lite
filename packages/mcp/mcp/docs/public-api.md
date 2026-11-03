# 公开接口导航

本文件导航本包的公开边界。精确类型与运行时校验在源码里，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口                | 源码                            | 调用者     | 运行时导出                                    |
| ------------------- | ------------------------------- | ---------- | --------------------------------------------- |
| `@omne-harness/mcp` | [src/index.ts](../src/index.ts) | 宿主与装配 | `createMcpCore`、`createInMemoryCatalogStore` |

`internal/` 的模块不从公开根导出。下一波的调用口在成员内接入它们，签名见包根 README「给下一波」。

## 定义索引

| 定义                                         | 源码                                      | SPEC 条款           |
| -------------------------------------------- | ----------------------------------------- | ------------------- |
| `createMcpCore`、`McpCore`、`McpCoreOptions` | [index.ts](../src/index.ts)               | MC-1                |
| `McpDiscovery`、`RefreshRequest`             | [discovery.ts](../src/discovery.ts)       | MC-7、MC-8          |
| `createInMemoryCatalogStore`                 | [store/memory.ts](../src/store/memory.ts) | MC-13               |
| 四个服务的接口与结果值                       | 契约成员 `services.ts`                    | 契约 S1、S5、S7、S8 |

`McpDiscovery.refresh` 的请求比契约的多一个可选的 `signal`；`McpCore` 可赋给契约的 `Omit<McpServices, 'invoker'>`，`tests/core.spec.ts` 核对这一点。
