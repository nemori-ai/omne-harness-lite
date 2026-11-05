# 公开接口导航

本文件导航本包的公开边界。精确类型与运行时校验在源码里，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口                | 源码                            | 调用者     | 运行时导出                                |
| ------------------- | ------------------------------- | ---------- | ----------------------------------------- |
| `@omne-harness/mcp` | [src/index.ts](../src/index.ts) | 宿主与装配 | `createMcp`、`createInMemoryCatalogStore` |

`internal/` 的模块不从公开根导出。`createMcp(ports, config)` 交出契约的 `McpServices`。

## 定义索引

| 定义                         | 源码                                      | SPEC 条款  |
| ---------------------------- | ----------------------------------------- | ---------- |
| `createMcp`                  | [index.ts](../src/index.ts)               | MC-1       |
| `createInMemoryCatalogStore` | [store/memory.ts](../src/store/memory.ts) | MC-13      |
| 五个服务的接口与结果值       | 契约成员 `services.ts`                    | 契约 S1–S8 |

本包不另加公开类型：服务的形状都是契约的；`tests/mcp.spec.ts` 核对 `createMcp` 的返回值可赋给 `McpServices`。
