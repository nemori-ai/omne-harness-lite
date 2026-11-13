# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 内容 |
| --- | --- |
| `@omne-harness/client-assembly` | 纯函数与类型：`applyFrame`、`defaultBackoff`、`keyText`、`AvailabilityView`、`AvailabilityStep`、`Backoff`、`ProtocolKey`（[src/availability.ts](../src/availability.ts)），不导入 Cordis |
| `@omne-harness/client-assembly/cordis` | `connectionPlugin`、`ConnectionService`、`defineProtocolClient`、`protocolServiceName` 与类型 `Connection`、`ConnectionOptions`、`LoginState`、`LoginStateSource`、`AssemblyDiagnostic`（[src/cordis.ts](../src/cordis.ts)） |

## 定义索引

行为在 [SPEC.md](../SPEC.md)：连接见「连接」，协议客户端见「协议客户端」。
