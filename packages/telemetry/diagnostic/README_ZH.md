# @omne-harness/diagnostic

[English](README.md)

有界失败链端口。本成员归 Issue #275。

## 职责与状态

存储调用方和后来的模型调用方在自己的结果旁边送入一条失败链。本包负责接受、读取和关闭这条链。它不替换 `CommitResult`、装配 `CloseReport`，也不替换存储的 `incomplete`。

已实现 `createDiagnosticPort` 和公开结果类型。包测试覆盖队列、字节、在途拒绝、导出失败、缺少导出端、跨租户拒绝和关闭。PanQiWei 于 2026-10-15 授权本成员进入 #275 的交付。事件名、保留时长和生产数字限额尚未接受。本包不导入 OpenTelemetry SDK、Pino、Cordis 或两棵 legacy。

## 使用

调用方传入 `sink`。`sink` 为 null 时记下可见缺口，业务值仍原样返回。`close` 返回诊断报告。调用方关闭业务资源时不等待这个 Promise。没有 `./cordis` 入口。`package.json` 的 `files` 只发布 `dist`。

英文 README 的 Usage 有一份可编译的调用示例。独立使用从包根导入。本成员没有 Cordis 集成入口。

## 契约

`src/types.ts` 持有公开形状。`admit` 返回 `accepted`、`rejected` 或 `gap`。拒绝原因是 `queue_full`、`bytes_full`、`in_flight_full` 和 `closed`。链以唯一的 `origin` 开始。调用方其后的原因是 `attached`。只有端口追加 `export`。导出字节同时计入失败链和关联字段。没有导出端时，放不进限额的记录仍然拒绝。`read` 和交给 `sink.export` 的对象都是副本。

`read` 仅在请求租户等于记录租户时返回链。不一致时结果是 `denied`，响应里没有链。详情键 `secret`、`token`、`authorization` 在进入时去掉。

`close` 分开报告最后一条记录、flush 和传输。截止时间到达时 flush 和传输是 `deadline`，不是导出成功。再次 `close` 返回同一次报告。这份报告不是装配 `CloseReport`。

## 设计

一个端口拥有进程内队列、字节计数和在途计数。调用方不共享这张表。导出端是唯一的导出适配器。本成员的超限行为是拒绝。放不下的新记录不会被存下。已接受的记录保留到导出、导出失败或关闭。

## 配置与运行

`profile`、`os`、`node`、`load` 必须是非空字符串。`maxQueue`、`maxExportBytes`、`maxInFlight` 必须是有限正数。`overLimit` 只能是 `reject`。`closeDeadlineMs` 必须是有限非负数。本包不为这些字段提供生产默认值。调用方点名这些数字所属的部署剖面。本包 engines 沿用既有新包范围 `>=24.18.0 <25`。

## 验证

在本目录运行 `pnpm test`。它先构建，再运行公开入口测试、`tests/diagnostic-port.spec.ts` 和 `tests/review-repro.spec.ts`。其中一项用 `node:fs` 把记录写进临时目录，一项在父目录不存在时期待写入抛错，一项在关闭截止时中止延迟写入并期待没有文件。这些测试不导入 Pino 或 OpenTelemetry SDK，也不选定生产限额。

## 维护

`AdmitResult`、`FailureChain` 或 `DiagnosticCloseReport` 变化时，同步本页、英文 README 和 `tests/diagnostic-port.spec.ts`。存储和模型在有真实调用方后从本包根导入，不要复制队列。事件目录、保留时长和一个生产剖面的数字限额仍然未知。
