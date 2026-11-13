# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 内容 | 调用者 |
| --- | --- | --- |
| `@omne-harness/session-protocol` | 契约值与类型，不导入 Cordis、Node 内置模块 | 服务端接入插件、客户端核心与界面，浏览器可用 |

## 定义索引

| 导出 | 种类 | 定义位置 | 条款 |
| --- | --- | --- | --- |
| `sessionProtocol` | 值：`session/v1` 的协议契约 | [src/session-protocol.ts](../src/session-protocol.ts) | [SPEC.md](../SPEC.md#operations) |
| `SessionProtocol` | 类型：`typeof sessionProtocol` | [src/session-protocol.ts](../src/session-protocol.ts) | [SPEC.md](../SPEC.md#differences) |
| `ObserveSessionOpen` | 类型：观察的建立点 | [src/session-protocol.ts](../src/session-protocol.ts) | [SPEC.md](../SPEC.md#observe-session) |
| `ObserveSessionFrame` | 类型：观察的五种帧 | [src/session-protocol.ts](../src/session-protocol.ts) | [SPEC.md](../SPEC.md#observe-session) |

`api/` 下的快照由 `pnpm run contract:api --write` 从 `dist` 的声明生成。
