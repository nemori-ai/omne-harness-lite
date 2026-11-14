# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。它覆盖独立消费与适用的 Harness 接入，引用系统架构与真实消费者，不成为新的架构源。

## 使用方式

```ts
import { sessionProtocol } from '@omne-harness/session-protocol'

const { frame } = sessionProtocol.observations['observe-session']
const written = frame.write({ kind: 'refreshing' }, limits)
```

依赖只有 `@omne-harness/public-contract`。`limits` 是调用者给的 JSON 结构上限。没有初始化与释放。

## 消费者与定位

本包在[系统最简模型](../../../../AGENTS.md#系统的最简模型)第二张图里是「某领域的协议契约」那一格，两端共用。具名消费者都还没有建：

- `packages/session/session-access`：`session/v1` 的接入插件，按本契约写八个处理函数与 `observe-session` 的帧来源。
- 客户端核心（`@omne-harness/sdk/core` 的 `createClient`）与会话的界面模块：拿同一个值得到每个操作一个方法和 `observe.observe-session`。

`read-session-diagnostics` 不在这里，归 `session-diagnostics/v1`。
