# 当前访问检查的实现范围

行为承诺归 [SPEC 当前操作的访问裁定](../SPEC.md#当前操作的访问裁定)。精确公开形状归 [access.ts](../src/access.ts)，根入口导出 `SessionAccessCheck`、`SessionAccessRequest`、`SessionAccessDecision`、`SessionAccessOperation`、`SessionAccessTarget` 与 `SessionReadAccessOperation`。

变更请求通过 operation 关联原 `SessionCommand`。租户请求使用共同 `Access`，系统目录请求携带真实 principal 与 `scope: 'system'`，不伪造 tenant。裁定是 allowed 和证据、denied、unavailable 三种结果。类型不证明调用者有权。

## 独立测试替身

`./testing` 的 `createScriptedSessionAccessCheck` 必须显式接收答复列表。每次 check 消费下一项并记录收到的完整请求。列表项可以是三类裁定，或带原异常的 throw 项。列表耗尽返回 unavailable，不重复上次 allowed。替身复制答复列表，记录保留 principal 与目标对象身份。它不承诺冻结调用者提供的请求或作为审计快照。

该替身标记 `durability: 'none'`，只供测试独立选择使用。`createPolicySessionAccessCheck` 是第二个替身：调用者给一条显式政策，每次 check 调用政策一次并记录请求。它供跑很多操作的 fixture 使用，政策写在 fixture 里，替身不加默认答案。端口替身通过不证明实际读写已受检查。

## 授权参考范围

[authorization 的端口适配测试](../../../identity/authorization/tests/port-adapters.spec.ts) 实现真实公开接口。测试显式选择仅核成员资格的参考政策，正控限于 `history.begin`、`history.next`、`recordMessage`。裁定使用真实 Access，变更请求先核租户、Session 与 command 一致，再将原 command 摘要绑定到裁定证据。

`recordMessage` 示例带 Participation、消息准入及来源证据。该测试不执行消息提交，也不证明这些材料真实。allowed 不能替代 coordinator 调用方类、Participation、消息准入、来源与共同提交检查。

模式变更缺少政策解释器，返回明确 unavailable。其余设置、控制、维护和未支持操作同样失败关闭。系统目录缺少系统授权提供者，也返回 unavailable。测试只证明该参考范围的类型兼容、当前成员资格重查、参数绑定、来源失败与失败关闭。完整模式及其他政策的允许路径未覆盖。

## 已接入的执行边界

`SessionTransactionPort.commit` 显式携带本次 `SessionAccess`。access 的租户与 Session 必须等于命令的租户与 Session，不一致时返回 `denied`，不调用检查。`readAccessRequest` 与 `mutationAccessRequest` 从 access、操作与命令拼出请求。

`createMemorySessionTransactions` 必需 `accessCheck`，没有可选参数或默认允许。每个公开读写在实际执行处调用一次 `check`：commit（含已持有操作的认回）、`readWork`、`readInput`、`queryOperation`、每一页 `history.*`、`pending`、`references`、`releasedScopes`。`denied` 返回同名失败。`unavailable` 或检查抛错返回 `unavailable`。这三种结果都不写条目、不签发游标、不返回答案。allowed 的证据只在同一次 commit 内交给存储，与该操作记录放在一起，`controls.decisionOf` 可以读回。认回不改写原记录的证据。

[session-adapters](../../session-adapters/docs/testing.md) 的 `createMemorySessionJournal` 同样必需 `accessCheck`。它的 `transactions` 只暴露端口方法，不暴露内部提交路径。Agent 提交派生的 Session 参加（message、context-transition、custody、processed）是委派的同日志提交：Agent 侧资格已核验，Session 半边走内部路径，不再调用本检查。`controls.reconcile` 要提交的每个 release 事实按 `receive` 各调用一次检查。

验证资源：[transactions-access.spec.ts](../tests/transactions-access.spec.ts)、session-adapters 的 [transactions-access.spec.ts](../../session-adapters/tests/transactions-access.spec.ts)，以及 authorization 的[端口适配测试](../../../identity/authorization/tests/port-adapters.spec.ts)经真实事务端口的历史读用例。

## 尚未接入的部分

[Cordis 定义](../../session-cordis-contract/docs/cordis.md) 已导出检查 Service 与键。独立子类的装卸测试不证明生产 Session 已完成必需注入。生产 Session 服务、生产系统授权、Session 存储组合、持久重启及跨进程资格均未由这些测试验证。
