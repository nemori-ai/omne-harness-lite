# session-tenancy 行为契约

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 设计并实施第二阶段。公开形状归 `src/index.ts`；本页只约束类型不能保证的行为。分阶段兑现范围由实际验证证据报告，不以本页存在宣称全部实现。

AC-1（core/session-tenancy）活体绑定必须由可信入口签发。每次使用核验当前身份、会话持有和操作许可；brand 或引用不是授权。旧绑定不可序列化复活。issue 不暴露为普通插件服务。

AC-2（core/session-tenancy）principalKind 独立于 context consumer。签发器从真实入口验证 human/system/agent 身份种类与 principal 后写入绑定；answer 的 by 原样来自 authorize 的这两项，答复 JSON 不能选择来源种类。无法核实来源即不签发或 unavailable，不能默认为 human/system。

AC-3（core/session-tenancy；core/session-log 消费）SessionAccess 用于 readPrefix/borrow 时必须通过 session.log.coordinate 校验；签发器只给已核实的应用协调组件此权，不因 tool.submit/tool.read 或自报 consumer 而授予。普通工具绑定不能借任意日志面。RecoveryAccess 沿 EE-10 验证维护 owner 和既有责任，不能据借用扩大为新执行权。

