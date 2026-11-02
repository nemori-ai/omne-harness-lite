# 当前访问检查的实现范围

行为承诺归 [SPEC 当前操作的访问裁定](../SPEC.md#当前操作的访问裁定)。委派视图的核对规则与失败答复例外，只归本页的[委派入口](#委派入口)一节，SPEC 引用该节。精确公开形状归 [access.ts](../src/access.ts)，根入口导出 `SessionAccessCheck`、`SessionAccessRequest`、`SessionAccessDecision`、`SessionAccessOperation`、`SessionAccessTarget` 与 `SessionReadAccessOperation`。

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

[session-adapters](../../session-adapters/docs/testing.md) 的 `createMemorySessionJournal` 同样必需 `accessCheck`。它的 `transactions` 只暴露端口方法，不暴露内部提交路径。Agent 提交派生的四种 Session 参加是独立的 Session 变更命令：`message` 对应 `recordMessage`，`context-transition` 对应 `commitDerived`，`custody` 对应 `preserveResult`，`processed` 对应 `completeConsumption`。每次公开的 Agent 写入按对应命令在共同发布之前调用一次本检查，访问身份是本次 Agent 调用的 principal 与 tenant，目标是该会话。认回已持有的操作也先调用一次。`denied` 与 `unavailable` 时 Agent 侧与 Session 侧都不写入，Agent 调用返回同类失败。allowed 的证据随同一次共同提交与该 Session 操作记录放在一起。裁定之后同一 execution 的修订已被另一次写入推进时，本次调用不提交，返回可重试的 `unavailable`，同一次调用内不再裁定。`controls.reconcile` 要提交的每个 release 事实按 `receive` 各调用一次检查。

验证资源：[transactions-access.spec.ts](../tests/transactions-access.spec.ts)、session-adapters 的 [transactions-access.spec.ts](../../session-adapters/tests/transactions-access.spec.ts) 与 [participation-access.spec.ts](../../session-adapters/tests/participation-access.spec.ts)，以及 authorization 的[端口适配测试](../../../identity/authorization/tests/port-adapters.spec.ts)经真实事务端口的历史读用例。

## 委派入口

精确形状归 [access.ts](../src/access.ts)，根入口导出 `SessionCheckedAccess` 与 `SessionDelegatedTransactions`。它是一次面操作从 Session 执行边界到存储的内部路径，兑现[当前操作的访问裁定](../SPEC.md#当前操作的访问裁定)中「同一公开调用内部的步骤不重复裁定」。

1. Session 服务实例在面操作开头按本次面操作的请求调用一次 `check`。
2. 结果为 allowed 时，服务实例以请求和证据调用 `bind`，取得只服务本次面操作的视图。视图的形状是 `SessionTransactionPort<P>`。
3. 本次面操作内的认回点查、权威读、`changed` 重做与提交都经视图。视图不调用 `check`。

视图按绑定核对每次调用。下列规则是视图核对与失败答复的唯一来源：

- 调用的租户与 Session 不等于请求目标时，视图答 `denied`。
- 提交的命令与请求所带命令的种类、操作身份或 OP-00 摘要（不含 `expected`）不同时，视图答 `denied`。读请求不带命令，所以经读绑定的提交也答 `denied`。
- `pending`、`references`、`releasedScopes` 与 `commitEntries` 不属于单会话的面操作，视图一律答 `denied`。
- 提交时，视图把绑定的证据交给存储，与该操作记录放在一起。

委派入口只经受信名 `sessionDelegatedTransactions`（[Cordis 定义](../../session-cordis-contract/docs/cordis.md#受信服务键)）交给 Session 服务实例，不进共享根。视图不跨面操作保留，不写进任务、缓存或游标。公开 `SessionTransactionPort` 的每个方法仍各自调用一次 `check`。

`./testing` 的 `createMemorySessionTransactionPair` 返回 `{ transactions, delegated }`，两者共用同一份内存核心。`createMemorySessionTransactions` 返回其中的 `transactions`。视图替身不调用检查，按上列规则答 `denied`，并把绑定证据记进操作记录，`controls.decisionOf` 可以读回。`sessionDelegatedTransactionsConformance` 是视图的符合性套件，`memorySessionDelegatedTransactionsFixture` 在内存对上构造它的 fixture。验证资源：[delegated-conformance.spec.ts](../tests/delegated-conformance.spec.ts)。

## 会话归属读口与会话工作主体

精确形状归 [ports.ts](../src/ports.ts)，根入口导出 `SessionPrincipalBindingSource` 与 `SessionWorkPrincipals`。两者都只在受信作用域内交付，服务键与替身在 [Cordis 定义](../../session-cordis-contract/docs/cordis.md#受信服务键)。

`SessionPrincipalBindingSource.read` 只证明会话的租户归属与已成立身份，不返回输入、历史或快照。它不调用 `SessionAccessCheck`，避免递归依赖。未知 Session 与另一租户的 Session 都答 `not-bound`，两者不可区分。

`SessionWorkPrincipals.forSession` 为协调器或维护者签发该会话的主体。签发前，实现读取会话归属读口。下表是失败映射，所有失败都不签发主体：

| 情形 | 答复 |
| --- | --- |
| 读口答 `not-bound` | `denied` |
| 读口答 `bound`，但租户或 Session 与请求不同 | `quarantined` |
| 读口答 `unavailable` 或 `quarantined` | 原样转交 |
| 读口抛错 | `unavailable` |
| 签发失败 | `unavailable`，`owner` 为 `identity` |

`SessionInternalPrincipals` 保留，只用于系统维护，适用的操作见 [session CP-01](../../session/SPEC.md#cp-access)。

## 尚未接入的部分

[Cordis 定义](../../session-cordis-contract/docs/cordis.md) 已导出检查 Service 与键。独立子类的装卸测试不证明生产 Session 已完成必需注入。会话存储提供者的委派入口与归属读口、装配入口的 `forSession` 以及 Session 服务实例经视图的接线尚未交付，内存替身不证明这些运行保证。生产 Session 服务、生产系统授权、Session 存储组合、持久重启及跨进程资格均未由这些测试验证。
