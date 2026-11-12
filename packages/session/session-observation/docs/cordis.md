# Cordis 集成

本文件说明本包的 Cordis 集成：适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则引用仓库的 IC 约定，不在本文件复制。

## 集成入口

`@omne-harness/session-observation/cordis` 导出三样：服务 `SessionObservationService`、键 `sessionObservationKey`（值是 `sessionObservation`）、插件工厂 `createSessionObservationPlugin`。

插件工厂的输入 `SessionObservationPluginInput` 只有一项 `historyKinds`：读历史给出的条目种类，必填。服务端应用从 `LOCAL_HISTORY_KINDS` 取。

行配置 `SessionObservationConfig` 经 `apply` 的第二个参数传入，两项都可选，没给的取成员默认初值：

- `policy`：`ObservationRefreshPolicy` 的部分字段，逐字段覆盖默认值（`interval` 1000 ms、`backoff` 1.5、`maxAttempts` 60、`deadline` 30 分钟、`currentTimeout` 5000 ms）。
- `locatePages`：一次反向读最多翻几页，默认 4。

插件名 `session-observation`。它注入三个服务：

- `session`，以 `reader` 调用方类注入，用它的 `history` 读日志。
- `modelStreamReferences` 与 `modelStreamObservation`，模型的两个公共流读取面。现行定位不问模型，所以这两个还没有被调用，见 SPEC 的[现行限制](../SPEC.md#现行限制)。

插件提供一个服务 `sessionObservation`，它的 `open` 就是领域面的 `open`。

事件：一棵树只挂一个 `session-cordis-contract/committed` 监听者。它按租户和会话过滤，把条目种类交给各次观察。种类集合的判断在观察里做，不在监听者里。通知只叫醒，不带内容。

## 生命周期与清理

- 启动：插件在装载时创建服务与监听者。依赖的服务不在时，Cordis 不启动它。
- 监听者挂在插件的作用域上，作用域卸载时由 Cordis 收回。每次观察的订阅在监听集合里，观察收场时退订。
- 卸载不替进行中的观察中止；它们由各自的 `signal` 结束。调用方在撤除协议时中止它们。
- 本包没有外部副作用：不写日志，不取消模型调用。所以没有需要逆转的效果。
- 诊断（现行只有 `observation.policy-clamped`）经 `session-observation` 记录器以警告级别记录。
