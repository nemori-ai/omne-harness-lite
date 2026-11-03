# 常驻引用桥接行

`toolResidencyRow` 把 Session 的常驻引用页交给 Tool 的持有者引用读取器。行声明位于
[实现入口](../../src/rows/tool-residency/index.ts)，系统责任归
[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)和
[持有者引用桥接](../../../../docs/architecture/runtime/tool-runtime.md#持有者引用由应用装配桥接)。

## 服务和配置

此行为 `real` 实现，提供 `toolResidencyReader`，没有关闭阶段。它只注入 `session` 与入口提供的
`toolResidencyPrincipal`。Session 的 inject 配置为 `caller: 'maintainer'`。主体由
[入口模块](../../src/entry/tool-residency-principal.ts)签发，桥接行不签发主体，也不授予访问资格。

配置只有 `pageSize`，默认值为 100，必须是正安全整数。未知字段会使配置失败。
发行配置必须成对装载 `tool-host` 与 `tool-residency`。不装工具宿主时也不装桥接行。
桥接行不注入工具宿主，避免与宿主必需的 Reader 形成依赖环。

## 读取和失败

公开形状归 [Tool Cordis 契约](../../../../packages/tool/tool-cordis-contract/docs/cordis.md#换代协调者契约)。
每次 `referencing` 直接调用 Session 的公开 `reconciliation.references`，出示原入口主体，显式带
`scope: 'system'`。`encodeResidentKey` 生成查询键，`after` 原样透传，`pageSize` 作为 `limit`。
`projectResidentReferences` 投影整个页，保留每条引用的 tenant 与首次装载形状，以及原 `next`。
桥接行不按会话文本反查租户，也不合并跨租户的同名 holder。

编码和投影归 [Tool 文本编码契约](../../../../packages/tool/tool-contract/SPEC.md#常驻登记键与-shape-的文本编码)。
编码失败、Session 失败或异常、非法存储形状均返回 `unavailable`。诊断只含固定阶段描述，不包含主体、
下游错误原文或业务正文。失败不返回空页或部分页，也不回退缓存。下一次调用重新读取当前 Session 面。

## 撤除

每代实例独立持有已撤除标记和未决结算集合。异步结果与 disposer 竞争同一个单次结算口。
行撤除或依赖撤除时，disposer 立即将全部未决读取结算为 `unavailable`，不等待下游 promise。
迟到结果不改变结算，旧 reader 的新调用也返回 `unavailable`。新实例拥有独立状态。
此结算不表示取消了 Session 的读取，也不声称下游资源已经停止。

## 持续验证

[桥接套件](../../tests/rows/tool-residency/bridge.spec.ts)用真实 Cordis 和 Session 提供者，组合公开 Session
内存事务，执行两项 Reader 符合性与六项 resident key 往返符合性。用例包含同 holder 文本的两个租户、
跨页失败和 `writeRaw` 负控。[生命周期套件](../../tests/rows/tool-residency/lifecycle.spec.ts)覆盖依赖缺席、
依赖撤除、永不返回的读取、迟到成功、旧引用与重装。
[caller 套件](../../tests/rows/tool-residency/caller.spec.ts)通过真实 Cordis Service 投影验证包装层保留逐键配置。

这些用例证明内存事务与桥接的组合行为，不证明耐久 Session、生产发行接线或完整 M2 链路。
`./cordis` 导出本行，发行配置把它与 `tool-host` 成对装载，见[发行内置 Tool](tool-release.md)。
