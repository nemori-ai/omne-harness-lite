# 遥测能力组

本组是条件性工程位置，依据为[项目要求](../../docs/requirements.md)与[目标包组织](../../docs/package-organization.md#目标目录)。当前 workspace 成员是 [telemetry-contract](telemetry-contract/README_ZH.md)、[telemetry-cordis-contract](telemetry-cordis-contract/README_ZH.md) 与 [telemetry-node](telemetry-node/README_ZH.md)。事件目录、保留时长和生产数字限额仍未接受。

## 责任与范围

三个成员按 RFC-0013 的 B 线建立，是候选。新增成员前，先明确具名消费者、采集目的、获准数据范围和权限。本组不接管相邻领域的业务规则或事实权威。

## 成员与依赖

`telemetry-contract` 是 `@omne-harness/telemetry-contract`，状态为候选（第一版，RFC-0013）。根入口是工程遥测的纯契约：作用域绑定、声明式定义（字段可以标为可选）、字段与绑定校验、carrier 编解码、准入结果与关闭报告的形状。`./testing` 是有界捕获替身。本包在运行时只依赖 `@omne-harness/legal-identity`，不依赖 Cordis 或 Node 内置模块；它的安装闭包里没有 Cordis。

`telemetry-cordis-contract` 是 `@omne-harness/telemetry-cordis-contract`，状态为候选（第一版，RFC-0013）。`./cordis` 是唯一的服务定义 `telemetry`：抽象类 `TelemetryService` 与键常量 `telemetryKey`。根入口不导出值。它依赖纯契约与 `@deepseek-ai/cordis`。纯契约与 Cordis 定义分成两个成员，照 `model-contract` 与 `model-cordis-contract` 的先例：只依赖纯契约的领域实现成员，生产安装闭包里不出现 Cordis。

`telemetry-node` 是 `@omne-harness/telemetry-node`，状态为候选（第一版，RFC-0013），是这份契约的 Node 提供者，只有本地出口。根入口是运行时：校验、有界队列、本地出口（应用的写函数或 Pino 同步文件）、计数与关闭报告，以及禁用实现。`./cordis` 有两个插件工厂与 Cordis 日志桥，插件继承 `telemetry-cordis-contract` 的 `TelemetryService`。根入口不依赖 Cordis。具名消费者是应用装配 `apps/harness-server`。

依赖方向：领域实现成员依赖 `telemetry-contract`；提供者与发射行依赖 `telemetry-contract` 与 `telemetry-cordis-contract`；`telemetry-cordis-contract` 依赖 `telemetry-contract`；`telemetry-contract` 不依赖任何领域成员。规则见[包边界与公开入口](../../docs/package-organization.md#包边界与公开入口)。

## 关键协作

事实拥有者提供可观察事件；遥测能力在获准范围采集与传送；观测端消费。精确交接与失败行为随实际成员或协调者维护。`telemetry-contract` 的 [SPEC](telemetry-contract/SPEC.md) 拥有提供者与发射领域共用的准入规则：端口操作不抛错，字段没有自由文本，作用域只表达事实属于谁。`telemetry-cordis-contract` 的 [SPEC](telemetry-cordis-contract/SPEC.md) 拥有服务键与注入的规则。

## 组合验证

核对采集权限、传输失败及数据缺失可识别性。事件、指标、保留时限与后端尚待决定。`telemetry-contract` 的测试覆盖校验规则、carrier 格式、捕获替身与安装闭包里没有 Cordis。`telemetry-cordis-contract` 的测试覆盖服务键在真实 Cordis `Context` 上的提供、注入与撤除。它们不证明任何真实提供者或后端的行为。`telemetry-node` 的测试覆盖准入、有界队列、出口故障、真实文件出口、关闭报告、禁用实现、日志桥的四个状态与真实 Cordis 上的插件。它不证明应用装配与关闭顺序，这些验证归 `apps/harness-server`。

## 维护

组技术拥有者与原语义或事实拥有者共同判断新增成员，文档维护者同步导航、登记及链接。长期个人负责人尚未具名。建包前核对[成员文档规范](../../docs/member-documentation.md)和[开发指南](../../docs/development.md#创建和整改产品包)；条件未满足时在原拥有者处维护局部机制。
