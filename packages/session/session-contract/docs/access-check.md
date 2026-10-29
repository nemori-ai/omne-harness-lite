# 当前访问检查的实现范围

行为承诺归 [SPEC 当前操作的访问裁定](../SPEC.md#当前操作的访问裁定)。精确公开形状归 [access.ts](../src/access.ts)，根入口导出 `SessionAccessCheck`、`SessionAccessRequest`、`SessionAccessDecision`、`SessionAccessOperation`、`SessionAccessTarget` 与 `SessionReadAccessOperation`。

变更请求通过 operation 关联原 `SessionCommand`。租户请求使用共同 `Access`，系统目录请求携带真实 principal 与 `scope: 'system'`，不伪造 tenant。裁定是 allowed 和证据、denied、unavailable 三种结果。类型不证明调用者有权。

## 独立测试替身

`./testing` 的 `createScriptedSessionAccessCheck` 必须显式接收答复列表。每次 check 消费下一项并记录收到的完整请求。列表项可以是三类裁定，或带原异常的 throw 项。列表耗尽返回 unavailable，不重复上次 allowed。替身复制答复列表，记录保留 principal 与目标对象身份。它不承诺冻结调用者提供的请求或作为审计快照。

该替身标记 `durability: 'none'`，只供测试独立选择使用。现有 `createMemorySessionTransactions` 尚未消费它。端口替身通过不证明实际读写已受检查。

## 授权参考范围

[authorization 的端口适配测试](../../../identity/authorization/tests/port-adapters.spec.ts) 实现真实公开接口。测试显式选择仅核成员资格的参考政策，正控限于 `history.begin`、`history.next`、`recordMessage`。裁定使用真实 Access，变更请求先核租户、Session 与 command 一致，再将原 command 摘要绑定到裁定证据。

`recordMessage` 示例带 Participation、消息准入及来源证据。该测试不执行消息提交，也不证明这些材料真实。allowed 不能替代 coordinator 调用方类、Participation、消息准入、来源与共同提交检查。

模式变更缺少政策解释器，返回明确 unavailable。其余设置、控制、维护和未支持操作同样失败关闭。系统目录缺少系统授权提供者，也返回 unavailable。测试只证明该参考范围的类型兼容、当前成员资格重查、参数绑定、来源失败与失败关闭。完整模式及其他政策的允许路径未覆盖。

## 尚未接入的执行边界

公开事务 commit 的显式 access、事务工厂的必需 accessCheck、每次实际读写的检查，以及同次调用内的私有证据传递尚未实现。提供者与现有消费者必须共同迁移，不能增加 optional 或默认允许绕过。

[Cordis 定义](../../session-cordis-contract/docs/cordis.md) 已导出检查 Service 与键。独立子类的装卸测试不证明生产 Session 已完成必需注入。生产系统授权、Session 存储组合、持久重启及跨进程资格均未由这些测试验证。
