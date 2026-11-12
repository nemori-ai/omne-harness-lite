# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 源码 | 内容 | 调用者资格 |
| --- | --- | --- | --- |
| `@omne-harness/session-observation` | [src/index.ts](../src/index.ts) | 领域面、帧、端口、默认策略与间隔底线；不导入 Cordis | 任何持有端口实现的调用方；`open` 里的 `access` 是观察者自己的主体 |
| `@omne-harness/session-observation/cordis` | [src/cordis.ts](../src/cordis.ts) | 服务 `SessionObservationService`、键 `sessionObservationKey`、插件工厂 `createSessionObservationPlugin` | 服务端应用的装配 |

## 定义索引

| 定义 | 源码 | 行为条款 |
| --- | --- | --- |
| `createSessionObservation`、`SessionObservation`、`SessionObservationOpen` | [src/observation.ts](../src/observation.ts) | SPEC 的[领域面](../SPEC.md#领域面) |
| `SessionObservationFrame`、`StateFrame`、`SessionObservationEnd` | [src/frames.ts](../src/frames.ts) | [状态帧](../SPEC.md#状态帧)、[领域面](../SPEC.md#领域面) |
| `SessionObservationPorts`、`ObservationRefreshPolicy`、`ObservationDiagnostic` | [src/ports.ts](../src/ports.ts) | [刷新的预算](../SPEC.md#刷新的预算)、[通知](../SPEC.md#通知) |
| `DEFAULT_OBSERVATION_REFRESH_POLICY`、`DEFAULT_LOCATE_PAGES`、`INTERVAL_FLOOR` | [src/ports.ts](../src/ports.ts) | [刷新的预算](../SPEC.md#刷新的预算) |
| `SessionObservationPluginInput`、`SessionObservationConfig` | [src/cordis.ts](../src/cordis.ts) | [cordis.md](cordis.md) |

输入输出与失败行为：`open` 的三种结果与帧序列的结束原因见 SPEC 的[领域面](../SPEC.md#领域面)与[失败](../SPEC.md#失败)。帧里的 `snapshot`、`delta`、`gap` 已在类型里，现行不会发出，见 SPEC 的[现行限制](../SPEC.md#现行限制)。
