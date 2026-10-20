# tool-host-local 行为规格

本页维护单机宿主在公共契约之外真实承担的行为：配置、资源所有权、失败、生命周期、并发、持久性、取消与恢复。公共结果、不变量和协议归契约包 `@omne-harness/tool-contract` 的 [SPEC](../tool-contract/SPEC.md)。本页不另写公共保证，也不能用提供者限制改写公共承诺。

下列决定已接受，由本包承担。它们在契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)中有完整记录：

- G4：宿主时钟适配器，同进程单调时钟加进程 epoch，跨进程比较返回 unknown。尚未实现。
- G5：第一版采用同机的启动协调器和耐久受理台账，实现 [P04](../tool-contract/SPEC.md#p04-实际发起围栏) 要求的启动排序域。本地启动协调器已实现，见下文；现有测试使用非耐久记录仓。耐久记录仓提供者尚未交付，耐久受理台账仍依赖该提供者。
- G7：`ToolBindingRegistry` 由本包实现。尚未实现。
- G9：本包命名为 `packages/tool/tool-host-local`。

## 本地启动协调器（G5）

`createLocalStartCoordinator({ store, access, guardsOf, commitAttempts })` 返回 `ToolStartAuthority`。`commitAttempts` 不是正安全整数时抛 `TypeError`。

### 1 排序域

协调器的全部记录放在记录仓的 `host` 域，每个租户一个域，键是 `start-coordinator`。每个操作读这个域、做决定、按域修订号条件提交，同一进程内的操作还经过一个串行区。所以许可、受理、拒绝、排除与失效有一个共同的先后，它就是提交的先后。修订冲突时重读重判，最多 `commitAttempts` 次，用尽后回复 `unavailable`。

本排序域只在一个进程内验证过。两个进程共用记录仓的装配没有验证，所以本协调器不声明跨进程的启动保证（P04）。

### 2 许可与守卫

`prepare` 核对资格、启动记录与固定请求，然后对 `guardsOf(request)` 的每个资源读取当前守卫修订号，从未失效的守卫是 `0`。它把许可提交为该启动的当前许可，再回复许可。新许可替换同一启动的旧许可。许可本身不授权执行。

`invalidate` 把一个守卫的修订号加一，与失效操作记录一起提交之后才回复失效证据。每个租户内，操作号绑定完整守卫输入的规范摘要与首次证据。摘要涵盖 owner、resource、revision、完整 evidence 与 scope 变体的全部契约字段，不受属性顺序或额外属性影响。同操作号、同输入重送时回复首次证据，守卫不再前进；同操作号、异输入回复 `conflict`，`operation` 为本次操作号，不写记录。后续失效或使用同一记录仓重建协调器不改变原操作的绑定。提交结果未知回复 `commit-unknown`，不可用回复 `unavailable`，两者都不给证据。

### 3 consume

`consume` 只能由受信执行边界调用，它在胶囊暂存之后以许可与执行者回执调用。决定顺序：

1. 该启动已有受理时回复原 `started`，已有启动拒绝或整次调用的排除时回复原 `rejected`。
2. 许可不是该启动的当前许可（摘要不同，或已被 `inspect` 收回）：有排除标记时回复 `not-started` 与该标记，否则回复 `invalid`（`permit: not-issued`）。
3. 许可里任一守卫的修订号已不是当前修订号：提交永久的启动拒绝，回复 `rejected`。失效先成立，所以不发起。
4. 否则提交唯一的受理并收回许可，回复 `started`。受理先成立，所以之后的失效只影响后来的启动。

受理提交结果未知回复 `unknown`，之后重送同一许可会认回受理。

### 4 inspect

`inspect` 回复已有的受理或拒绝。都没有时，它先提交排除标记并收回当前许可，再回复 `not-started`。所以在这个回答之前签发的许可，在回答之后不能被受理。之后签发的新许可可以受理，这就是同一启动身份在排除证明之后的首次执行。已有标记且没有未收回的许可时，直接回复该标记，不再提交。

### 5 exclude

`exclude` 排除一个调用尚未受理的全部启动，将整次调用的拒绝与本次排除操作记录共同提交，再回复拒绝证据。每个租户内，以调用与操作号定位排除操作记录，绑定本次 reason 与返回 evidence。同操作号、同理由重送回复原证据；同操作号、异理由回复 `conflict`，`operation` 为本次操作号，不写记录。

已排除的调用收到另一操作号时，协调器提交该操作号与本次理由的绑定后，仍回复首次排除的证据，不改变调用的拒绝理由或终态。使用同一记录仓重建协调器后，所有已提交的排除操作仍按原绑定认回或冲突。首次排除与别名绑定的提交结果未知均回复 `commit-unknown`，不可用均回复 `unavailable`，两者都不给证据。该调用已有受理时回复 `conflict`，`operation` 是被受理的启动：在途执行只能由控制停止。

### 6 身份、租户与失败

每个操作先检查边界输入。缺租户、租户形状不对或缺主体回复 `denied`，然后才问 `access.qualify`：调用范围的操作用动作 `start`，`invalidate` 用动作 `invalidate`。资格拒绝回复 `denied`，不可读回复 `unavailable`（`dependency` 为 `access-guard`），这些都不读记录仓。守卫属于租户内的资源，所以一个租户的失效不影响另一个租户的同名守卫。启动的键同时含调用与启动操作号，因为启动操作号只在一个调用内唯一（P01）。

台账不可读回复 `unavailable`（`dependency` 为 `start-ledger`），不回复受理或拒绝，也不读缓存（P04：准入资料不可读时拒绝新的 consume）。台账里出现本协调器没有写过的记录时同样回复 `unavailable`。

文档导航见 [index](index.md)。

## 实例宿主与普通调用的边界

本包尚未提供生产 ToolInstanceHost、来源签发器或 ToolInstanceIdentities。宿主实现须在创建实例时取得身份，向 driver.run 显式传入，同一存活实例重复唤醒沿用。runtime 工厂不再接受全局 instance。当前测试将普通 payload 经 invoke、配对来源 issuer/guard、真实 ledger 和本地启动协调器组合，driver 的 instance 由测试 host 提供。这只证明单进程非耐久组合，不证明 claim、换实例接管或恢复。
