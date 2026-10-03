# 失败边界清单（#44 试点）

2026-10-02，主线起草，**负责人 2026-10-02 签，外层兜底选方案 A**。这是 GitHub issue #44「存量失败表达统一成异常」的第一份契约边界清单，也是 #48 第 5 项（本成员清理）与 #44 试点合并实施的规格。它不改契约语义、公开返回形状或端口协议。源码读数取自 `34bae69bf`；2026-10-03核当前15个src文件逐字相同。公开面、端口、失败回传、catch与身份位置均落在本页附表，不依赖临时目录。

依据：研发品味 TS/JS 专节「实现内部的失败用异常表达……只在契约规定了失败值的边界把异常收束成那个闭合的失败集合；收束处只接认得的错误类型，认不得的原样上抛」（`.meta_harness/agents/roles/engineering-taste.md`，链接不出 design/ 根，写纯文本）；[Runner5](../../../../spec/capabilities/loop-extension-runner/v5/contract.md) S-20、S-21 ⑥、S-22 ⑥ 的封闭失败集合；本节点 [v6](v6-run-pass-design.md)「任意缺阶段归属的端口异常亦作为控制来源不可用」。

## 四条规则

1. **收束处保留原返回形状。**收束处有三类：
   - `src/index.ts` 导出的公开入口（附表 A，33 项）；
   - 端口协议（附表 B，45 项）。本包自己实现的端口（`run-log.ts`、`reminder-log.ts` 两个适配器，`service.ts` 里的 `presence`、`invoke`、`nestedChain`、`isActive` 闭包，任务 owner）同样是收束处，**内部不引入信号**，照旧返回端口形状；
   - 贡献者错误通道（`candidateError` → 耐久结论 `skipped: errored`）。它不是操作失败，不动。
2. **只有原样透传的失败才改抛。**内部函数的失败值，在每个调用处都原样（或都改写成同一个值）传到收束处，才改成抛内部信号。以下两种保留值返回：同一失败在不同调用处被改写成不同值的；返回值本身是「不是这个形状」的解析结果（`undefined`、`null` 当可选值用）的。
3. **内部信号只有一种。**它是一个模块内部的错误类，不从 `index.ts` 导出，携带当次原失败值对象本身。收束处用 `instanceof` 认它，原样返回该对象，不重建、共享或冻结原来不共享或不冻结的对象。
4. **端口异常照节点设计收成 `unavailable`。**包住端口调用的 `try` 块里只放端口调用本身，不放本包内部函数，这样内部信号不会被端口的 `catch` 吞成 `unavailable`。现有 13 处端口 `catch` 已经满足这一条（附表 D）。

## 2026-10-03 事实订正与采用范围

原签字稿规则3写“现有的冻结失败单例”。这一描述不覆盖 positionUnknown：基线 `run-pass.ts:251` 的 validatePass和 `pass-history.ts:106` 的 validateHistoryScope每次新建未冻结对象。规则3现明确携带当次原失败值对象；原冻结单例保留原身份，positionUnknown保留每次新建和不冻结。此订正落实既有“不改行为”要求，不改负责人签选的A方案或失败集合。

本页是#44限定试点与#48清理的施工边界。语义与公开协议沿已接受Runner5／LC6及D106实际采用范围。没有新增绑定或生产Run／等待／十三操作交付声明。试点实现与独立验证的当前状态由对应提交和交付记录另记。

## 外层兜底的取舍（已签：A）

`runPass` 的外层 `catch`（`run-pass.ts:538`）今天把任何异常都收成 `unavailable`，`readPassConclusions` 的外层 `catch`（`pass-history.ts:79`）把任何异常都收成 `invalidInput`。规则 3 要求收束处先认信号；剩下的问题是：认不得的异常怎么办。

| 方案 | 做法 | 后果 |
|---|---|---|
| **A 保留（推荐）** | 先认信号、原样返回；其余照旧收成 `unavailable`／`invalidInput` | 行为不变，守得住清理「测试只读、行为不变」的锁。内部信号不会被吞成默认值，满足方案验收。代价是：外部纯判定与本包缺陷抛出的异常仍被收成 `unavailable`，与品味「认不得的原样上抛」不一致 |
| B 收窄 | 外层只认信号；另把 `run-pass.ts` 里 12 处没单独包的端口与释放调用逐个包成 `unavailable`；其余异常让 `runPass` 拒绝 | 合品味，错误尽早暴露。但这改变公开函数的行为：今天从不拒绝，以后会拒绝，现有测试锁不住。还要定两件语义：`finally` 里的释放在成功之后抛错时，成功要不要作废（今天作废成 `unavailable`）；v6 要求的「可观测」怎么兑现（今天全包没有一处诊断输出）。这两件归 #44 的方案定 |

推荐 A：试点不顺手改行为，B 的两件语义随 #44 的完整方案另定。

## 附表 A 公开入口：33 项，全部保留返回形状

| # | 入口 | 返回里的失败形状（保留） | 处置 |
|---|---|---|---|
| 1 | `passKeys` | `{invalidInput:true}` | 保留 |
| 2 | `prepareRunnerConclusion` | `{invalidInput:true}` | 保留 |
| 3 | `inspectRunnerConclusion` | `{invalid:true}`、`{unrelated:true}` | 保留。`invalid` 在 5 个调用处被改写成 3 种值，由调用方按读场景映射（v5 设计第 47 行） |
| 4 | `readRunnerRetryConclusions` | `{unavailable:true}` | 保留 |
| 5 | `composeEffect` | `{invalidInput:true}`；非 `TypeError` 原样重抛 | 保留，已合规则 |
| 6 | `runPass` | `RunnerFailure` 七值；不拒绝 | **收束处**；先认信号，其余照旧收成 `unavailable`（方案 A） |
| 7–12 | `createRunnerTaskOwner` 及 `start`、`hasUnknown`、`closeAdmission`、`drain`、`reconcileStoppedLog` | 工厂对坏 `session` 抛 `TypeError`；`start` 与 `reconcileStoppedLog` 返回 `{unavailable:true}`，后者逐项 `{kind:'replayInconsistent'}` | 保留 |
| 13–15 | `createRunnerLogAdapter` 及 `readConclusions`、`record` | 工厂抛 `TypeError`；两个方法返回端口形状 | 保留；端口实现，内部不引入信号 |
| 16–18 | `createRunnerReminderLogAdapter` 及 `inspect`、`append` | 同上 | 同上 |
| 19 | `readPassConclusions` | `RunnerReplayFailure`；不抛 | **收束处**；先认信号，其余照旧收成 `invalidInput`（方案 A） |
| 20–25 | `createRunnerImplementationRegistry` 及 `registerBuiltin`、`capture`、lease `invoke`、`closeAdmission`、`drain` | `registerBuiltin` 抛错（关准入、坏参数、重名），`model-request-runtime` 的默认重试插件依赖这一点让登记者 fiber 失败（v7 设计第 56 行）；`capture` 返回 `{absent:true}`；`invoke` 返回 `RunnerInvocationResult` | 保留 |
| 26 | `readRunnerChain` | `RunnerReplayFailure`；三处 `await` 无 `try`，会拒绝 | 保留，拒绝行为不变 |
| 27–32 | `createLoopExtensionRunner` 及 `dispatch`、`replay`、`implementations.registerBuiltin`、`closeAdmission`、`drain` | `dispatch`／`replay` 返回七值／五值；宿主、来源、owner 的异常使 Promise 拒绝 | `dispatch`、`replay` 是**收束处**：只认信号，其余照旧拒绝 |
| 33 | `loopExtensionRunnerPlugin` | `apply` 抛 `TypeError` | 保留 |

计数核对：运行时导出 18 个名字 = 14 个入口 + 4 个常量（`runnerFormat`、`runnerAllKey`、两个服务名）；14 个入口加 19 个返回对象的方法 = 33。

## 附表 B 端口：45 项，全部保留协议形状

| 组 | 项数 | 成员 | 处置 |
|---|---|---|---|
| `RunnerPorts`（`run-pass.ts:141-195`） | 16 | `binding`、`readConclusions`、`readAskState`、`presence`、`openHandles`、`invoke`、`verifyFailure`、`judgeCapabilities`、`record`、`now`、`mintReminder`、`isActive`、`fallbackNeedsProjection`、`reminders.inspect`／`nestedChain`／`append` | 保留；`runPass` 在调用处检查结果值。服务装配下由本包实现的 8 个（`readConclusions`、`record`、`presence`、`invoke`、`isActive`、`reminders.inspect`／`nestedChain`／`append`）内部不引入信号 |
| `RunnerExecutionPorts` 另加（`service-types.ts:29-42`） | 2 | `invokeCommand`、`commandPresence` | 保留 |
| 宿主与作用域（`service-types.ts`） | 10 | `acquireDispatch`、`acquireReplay`、`RunnerHostFactory`、`RunnerReadScope` 的 `binding`／`sources`／`owner`／`isActive`／`release`、`subjectForCandidate`、`readMessagePrefix` | 保留；`service.ts` 对宿主异常照旧不收（拒绝） |
| 链来源 `RunnerChainSources`（`runner-chain.ts:33-38`） | 5 | `holdingTenant`、`readHead`、`dependencyPresence`、`history.read`、`isActive` | 保留 |
| 端口回调与工厂输入 | 12 | `RunnerReplayBinding.control`／`release`、`RunnerHandles.release`、`verified.release`、SL3 `append`／`readByKey`／`readSince`、服务工厂的 `isActive`、`start` 的 `execute`／`unknown`、`RunnerRecoveredLog.readByKey`、`RunnerBuiltinImplementation` | 保留 |

## 附表 C 内部失败回传点：27 项

「改抛」= 实施时必须改成抛内部信号；「可改」= 合规则 2，由实施者按能否降复杂度定，交回时逐项写结论；「保留」= 不许改。

| # | 函数 | 失败 → 调用处 | 处置 | 理由 |
|---|---|---|---|---|
| 1 | `dimensionPart`（`keys.ts:40`） | `undefined` → `passKeys` 的 `invalidInput` | 保留 | 解析结果 |
| 2 | `ordinalText`（`keys.ts:56`） | 同上 | 保留 | 解析结果 |
| 3 | `conclusion`（`conclusion-codec.ts:66`） | `undefined` → prepare `invalidInput`／inspect `invalid` | 保留 | 解析结果；两个公开函数各自映射 |
| 4 | `occurrence`（`:79`） | 同上 | 保留 | 同上 |
| 5 | `messageCopies`（`:86`） | 同上 | 保留 | 同上 |
| 6 | `execution`（`:119`） | 同上 | 保留 | 同上 |
| 7 | `validatePass`（`run-pass.ts:243`） | `invalidInput`、`positionUnknown` 及 #14 的结果 → 原样 | **改抛** | 唯一调用者原样透传 |
| 8 | `checkControl`（`:274`） | `cancelled`、`unavailable` → 11 处全部原样 | **改抛** | 都是原样透传。`:643-647` 在 ready 时须**先 release 再失败**，次序不得变 |
| 9 | `awaitWithAbort`（`:284`） | `aborted`／`failed` → 两处都改写成 `cancelled`／`unavailable` | **改抛** | 两处改写成同一组值；`failed` 即端口异步拒绝，合规则 4 |
| 10 | `resolveEffect`（`:315`） | 3 处原样；ask 分支 2 处（`:653`、`:909`）把任何失败（含 `unavailable`）改写成 `replayInconsistent` | 保留 | 改写不一 |
| 11 | `entryFromRecord`（`:425`） | 四种失败 → 原样 | **改抛** | 唯一调用者原样透传 |
| 12 | `persistReminders`（`:461`） | 各失败 → 3 处都原样 | **改抛** | 原样透传；嵌套经过成功但效果不是 `proceed`／`vetoed` 时改写成 `replayInconsistent`，这是成功分支上的判断，不受影响 |
| 13 | `runPassInternal`（`:544`） | 六值 → `runPass` 原样；`persistReminders` 里的嵌套调用原样 | **改抛** | 同上；收束处是 `runPass` |
| 14 | `validateHistoryScope`（`pass-history.ts:98`） | `invalidInput`、`positionUnknown` → 3 个调用者都原样 | **改抛** | 收束处是 `readPassConclusions`、`runPass`、`dispatch`／`replay` |
| 15 | `currentSubject`（`:170`） | `null` → 2 个调用者都改写成 `replayInconsistent` | **改抛**（`replayInconsistent`） | 两处改写成同一个值 |
| 16 | `readPassHistory`（`:180`） | 三种失败 → 2 个调用者都原样 | **改抛** | 原样透传 |
| 17 | `judgeConclusionForCurrent`（`:249`） | `invalidInput` → `readPassHistory` 改写成 `replayInconsistent`，`runPassInternal` 原样 | 保留 | 改写不一 |
| 18 | `readWinner`（`run-log.ts:58`） | `undefined` → `{kind:'unavailable'}` | 保留 | 端口实现内部 |
| 19 | `prefix`（`reminder-log.ts:35`） | `{unavailable:true}` → `{kind:'unavailable'}` | 保留 | 端口实现内部 |
| 20 | `inspect`（`reminder-log.ts:45`） | 端口形状 | 保留 | 端口实现 |
| 21 | `project`（`runner-chain.ts:83`） | `undefined` → `unavailable` | 保留 | 解析结果 |
| 22 | `piece`（`runner-chain.ts:165`） | 同上 | 保留 | 解析结果 |
| 23 | `request`（`service.ts:44`） | 三种失败 → `dispatch`、`replay` 都原样 | 可改 | 原样透传；收束处是 `dispatch`／`replay` |
| 24 | `chain` 闭包（`service.ts:131`） | `unavailable` 及 `readRunnerChain` 的结果 → 都原样 | 可改 | 同上 |
| 25 | `presence` 闭包（`service.ts:200`） | 端口形状 | 保留 | 端口实现 |
| 26 | `invoke` 闭包（`service.ts:222`） | 端口形状 | 保留 | 端口实现 |
| 27 | `nestedChain` 闭包（`service.ts:244`） | 端口形状 | 保留 | 端口实现；它不调用 #24，信号不会穿过它 |

合计：改抛 9、可改 2、保留 16。布尔判定直接映射成失败值的（`validPorts`、`sameAssociation`、`modelPosition`、`scopeActive` 等）不算回传点，判定处直接抛或直接返回都可以，不影响收束处。

## 附表 D `catch` 子句：28 处

| # | 位置 | `try` 里调用什么 | 今天做什么 | 处置 |
|---|---|---|---|---|
| 1 | `run-pass.ts:278` `checkControl` | 端口 `isActive` | → `unavailable` | 保留（规则 4）。`checkControl` 改抛后，这个 `catch` 改为抛 `unavailable` 信号 |
| 2 | `:334` `resolveEffect` | 端口 `fallbackNeedsProjection` | → `unavailable` | 保留 |
| 3 | `:476` `persistReminders` | 端口 `reminders.inspect` | → `unavailable` | 保留；`try` 里只有端口调用 |
| 4 | `:485` | 端口 `reminders.nestedChain` | → `unavailable` | 保留；同上 |
| 5 | `:509` | 端口 `reminders.append` | → `unavailable` | 保留；同上 |
| 6 | `:518` | 端口 `reminders.inspect` 再读 | → `unavailable` | 保留；同上 |
| 7 | `:538` `runPass` | 整次经过 | 任何异常 → `unavailable` | **收束处**：先认信号；其余照旧 → `unavailable`（方案 A） |
| 8 | `:581` | 端口 `readConclusions` | → `unavailable` | 保留；同上 |
| 9 | `:640` | 端口 `readAskState` | → `unavailable` | 保留 |
| 10 | `:677` | 端口 `presence` | → `unavailable` | 保留；同上 |
| 11 | `:696` | 端口 `openHandles` | → `unavailable` | 保留 |
| 12 | `:718` | 端口 `invoke` 的同步部分 | → `unavailable` | 保留；同上 |
| 13 | `:774` | 外部纯判定 `judgeConclusion` | → `invalidInput` | 保留：S-14「runner 调判定的输入边界失败 → `invalidInput`」 |
| 14 | `:782` | 端口 `judgeCapabilities` | → `unavailable` | 保留 |
| 15 | `:888` | 端口 `record` 的同步部分 | → `unavailable` | 保留 |
| 16 | `effect.ts:50` `composeEffect` | 外部纯判定 | `TypeError` → `invalidInput`，其余重抛 | 保留，已合规则 |
| 17 | `implementation-registry.ts:68` | 贡献者实现 | → `errored` | 保留：贡献者错误通道（S-13） |
| 18 | `pass-history.ts:79` `readPassConclusions` | 整次解释 | 任何异常 → `invalidInput` | **收束处**：先认信号；其余照旧 → `invalidInput`（方案 A） |
| 19 | `run-log.ts:53` | SL3 `readByKey` | → `{failure:'unavailable'}` | 保留（端口实现内部，调外部端口） |
| 20 | `run-log.ts:67` `readWinner` | SL3 `readByKey` | → `undefined` | 保留 |
| 21 | `run-log.ts:81` | 宿主 `subjectForCandidate` | → `{kind:'unavailable'}` | 保留 |
| 22 | `run-log.ts:122` | SL3 `append` | → `{kind:'unknown'}` | 保留 |
| 23 | `reminder-log.ts:40` `prefix` | 宿主 `readMessagePrefix` | → `{unavailable:true}` | 保留 |
| 24 | `reminder-log.ts:68` `inspect` | SL3 `readByKey` 加外部编解码 | → `{kind:'unavailable'}` | 保留 |
| 25 | `reminder-log.ts:130` `append` | SL3 `append` 加同闭包的 `inspect` | → `{kind:'unknown'}` | 保留；端口实现内部不引入信号，所以碰不到信号（遗留问题见「发现」4） |
| 26 | `task-owner.ts:137` | 本包分类器 lambda | 视为 unknown 并留存 | 保留：fail-closed |
| 27 | `task-owner.ts:187` | 宿主 `recovered.readByKey` | → `{unavailable:true}` | 保留 |
| 28 | `task-owner.ts:271` | 外部纯判定 | → `{kind:'replayInconsistent'}` | 保留 |

另有 4 处 `.then(onFulfilled, onRejected)`（`run-pass.ts:307`、`task-owner.ts:132`、`implementation-registry.ts:80`、`service.ts:122`）不是 `catch` 子句，全部保留。

`dispatch`、`replay` 今天没有 `catch`。实施后它们各自要有一处收束：只认信号，其余照旧拒绝。这两处是新增的，不在 28 处之内，交回时单列。

## 附表 E 租户与身份比对：54 处，全部保持 fail-closed

逐处位置见下表。位置来自基线原实现；清理后交回须提供旧→新位置对照。处置一律是：**保持 fail-closed**；改动碰到这些行的 hunk，主线逐行读；比对的失败改成抛信号时，信号携带的值必须与今天返回的值相同。分布：`conclusion-codec.ts` 4、`retry-history.ts` 5（其中 1 处是筛选，不是失败）、`run-pass.ts` 7、`pass-history.ts` 5、`task-owner.ts` 7、`run-log.ts` 6、`reminder-log.ts` 5、`runner-chain.ts` 8、`service.ts` 3、`implementation-registry.ts` 3、`effect.ts` 1。

| # | 位置 | 比较什么 | 不等/缺失时 | fail-closed |
|---|---|---|---|---|
| 1 | `src/conclusion-codec.ts:155-157` | `tenant` 是否合 `TenantId` 表示（prepare） | `invalidInput` | 是 |
| 2 | `src/conclusion-codec.ts:109-110` | 提醒 `source.extension` 与结论 `extension` 相等 | `messageCopies` 返回 `undefined` → prepare `invalidInput` / inspect `invalid` | 是 |
| 3 | `src/conclusion-codec.ts:238-253` | `tenant` 表示；`entry.session !== source.session` | `invalid` | 是 |
| 4 | `src/conclusion-codec.ts:268` | `tenantIdEquals(owned.tenant, tenant.ok)`（条目壳租户 vs 调用方租户） | `invalid` | 是 |
| 5 | `src/retry-history.ts:47-57` | `session`、`callId`、`tenant` 表示 | `unavailable` | 是 |
| 6 | `src/retry-history.ts:65` | `raw.session !== session.ok` | `unavailable` | 是 |
| 7 | `src/retry-history.ts:79` | `tenantIdEquals(owned.tenant, tenant.ok)` | `unavailable` | 是 |
| 8 | `src/retry-history.ts:81-82` | 经 `inspectRunnerConclusion` 再核 session/tenant | `invalid` → `unavailable` | 是 |
| 9 | `src/retry-history.ts:87` | `value.modelCallId === callId.ok` | 不等则**跳过该条**（筛选，不是失败；S-54「同一 Run 的不同模型调用互不借用历史」） | 不适用（筛选） |
| 10 | `src/run-pass.ts:221-222` | `binding.session`、`binding.logGeneration` 表示（**不校 tenant**） | `invalidInput`（`:551`） | 是（tenant 除外） |
| 11 | `src/run-pass.ts:411-423`（`sameAssociation`） | 等待关联的 `binding.session`、`logGeneration`、`tenantIdEquals(tenant)`、`piece`、`pass`、`askEntry`、`askHistory`、`earlier`、`subject` | `:651` → `replayInconsistent`；`:659-661` → release 后 `replayInconsistent` | 是 |
| 12 | `src/run-pass.ts:435-452`（`entryFromRecord`） | 写回条目经 `inspect` 核 `binding.session`/`tenant`；`dedupeKey`、`anchor`、`extension`、`power`、位置、执行种类、`run` | `replayInconsistent` | 是 |
| 13 | `src/run-pass.ts:571` | 宿主 `verifyFailure` 返回主体与 `initial` 逐值相等 | release 后 `invalidInput` | 是 |
| 14 | `src/run-pass.ts:324` | `chain[index].definition.name` 与结论 `extension` | `replayInconsistent` | 是 |
| 15 | `src/run-pass.ts:663-670` | ready 绑定的 `cardId`/`batchId`/`answerId` 表示（只校表示，不与任何值比） | release 后 `unavailable` | 是（仅表示） |
| 16 | `src/run-pass.ts:860-868` | `prepareRunnerConclusion` 以 `ports.binding.session/tenant` 构壳（此处首次校 tenant 表示） | `invalidInput`（`:869`） | 是 |
| 17 | `src/pass-history.ts:66-73` | `binding.session`、`logGeneration`、`tenant` 表示 | `invalidInput` | 是 |
| 18 | `src/pass-history.ts:204` | 条目 `readKeys` 含本经过 `pass` 键 | `replayInconsistent` | 是 |
| 19 | `src/pass-history.ts:208-213` | 经 `inspect` 核条目 session/tenant 与 binding | `replayInconsistent` | 是 |
| 20 | `src/pass-history.ts:215-221` | `anchor`、位置/维度、`run`（withRun 相等 / noRun 必须无 run） | `replayInconsistent` | 是 |
| 21 | `src/pass-history.ts:223-225` | 条目 `extension`、`power` 与链上该件 | `replayInconsistent` | 是 |
| 22 | `src/task-owner.ts:74-80`（`sameBinding`） | `session`、`logGeneration` 严格相等；**`tenant` 用 `modelLogJsonEqual`**（其他处用 `tenantIdEquals`） | 由调用处决定（下 3 行） | — |
| 23 | `src/task-owner.ts:84-85` | 构造时 `binding.session` 表示（`tenant`、`logGeneration` 不校） | 抛 `TypeError` | 是（tenant 除外） |
| 24 | `src/task-owner.ts:109-110` | `start` 的 candidate 绑定 vs owner 绑定 | `{unavailable:true}` | 是 |
| 25 | `src/task-owner.ts:157` | `hasUnknown` 查询绑定 vs owner 绑定 | 返回 `true`（调用者据此给 `unavailable`） | 是 |
| 26 | `src/task-owner.ts:178` | `reconcileStoppedLog` 恢复绑定 vs owner 绑定（且须已关准入） | `{unavailable:true}` | 是 |
| 27 | `src/task-owner.ts:215-238` | 提醒候选：`inspectModelLogEntry` 以 owner `session/tenant` 解码候选与实际；`dedupeKey`、消息值、条目值 | `{kind:'replayInconsistent'}` | 是 |
| 28 | `src/task-owner.ts:243-262` | 结论候选：`inspect` 以 owner `session/tenant` 解码两边；`dedupeKey`、`run`、`callId`、`modelCallId` | `{kind:'replayInconsistent'}`；全通过后内容不同记 `winner` | 是 |
| 29 | `src/run-log.ts:35-36` | 构造时 `binding.session` 表示 | 抛 `TypeError` | 是 |
| 30 | `src/run-log.ts:45` | `owner.hasUnknown(binding, pass 键)` | `{failure:'unavailable'}` | 是 |
| 31 | `src/run-log.ts:93-98` | 候选条目经 `inspect` 核 `binding.session/tenant` | `{kind:'invalidInput'}` | 是 |
| 32 | `src/run-log.ts:104-106` | `owner.start` 的 candidate 绑定（→ 第 24 行） | `{kind:'unavailable'}`（`:118`） | 是 |
| 33 | `src/run-log.ts:134` | SL3 返回 `tenantMismatch` | `{kind:'invalidInput'}` | 是 |
| 34 | `src/run-log.ts:58-70`（`readWinner`） | **不核**胜者 session/tenant（由 `entryFromRecord` 第 12 行事后核） | — | 本函数否，调用链上是 |
| 35 | `src/reminder-log.ts:31-32` | 构造时 `binding.session` 表示 | 抛 `TypeError` | 是 |
| 36 | `src/reminder-log.ts:47` | `owner.hasUnknown(binding, 消息键)` | `{kind:'unavailable'}` | 是 |
| 37 | `src/reminder-log.ts:57-64` | 已有同 ID 条目经 `inspectModelLogEntry` 核 session/tenant（该函数内 `tenantIdEquals`，`packages/model/model-request-runtime/src/log-codec-entry.ts:294`） | 返回 **`conflict`**（不是 `unavailable`）；上游 `persistReminders` → `replayInconsistent`，`:792` 处 → 贡献者错误 `inject_message_id_conflict` | 是 |
| 38 | `src/reminder-log.ts:84-94` | `prepareModelLogEntry` 以 `binding.tenant` 构壳 | `{kind:'unavailable'}` | 是 |
| 39 | `src/reminder-log.ts:129` | SL3 返回 `tenantMismatch`（落入兜底） | `{kind:'unavailable'}`（与第 33 行 run-log 的 `invalidInput` 不同） | 是 |
| 40 | `src/runner-chain.ts:229-236` | `session`、`binding.session`、`logGeneration`、`tenant` 表示 | `{failure:'invalidInput'}` | 是 |
| 41 | `src/runner-chain.ts:237` | `session !== binding.session` | `manifestMissing` | 是 |
| 42 | `src/runner-chain.ts:246-247` | `holdingTenant(session)` 是否取得 | `sessionNotFound` → `manifestMissing`；其他 → `unavailable` | 是 |
| 43 | `src/runner-chain.ts:248` | `tenantIdEquals(holding.tenant, binding.tenant)`（会话持有租户 vs 日志绑定租户） | `unavailable` | 是 |
| 44 | `src/runner-chain.ts:90` | 清单记录 `record.session !== session` | `project` → `undefined` → `unavailable` | 是 |
| 45 | `src/runner-chain.ts:94`、`:105` | `evaluationRef` 表示及与 owned 记录一致 | `unavailable` | 是 |
| 46 | `src/runner-chain.ts:207` | 定义 `name` 与资产能力标识 `name` | `unavailable` | 是 |
| 47 | `src/runner-chain.ts:259-267` | 以 `binding.tenant` 请求历史版本；**不核**返回值租户（交提供者核） | — | 交提供者 |
| 48 | `src/service.ts:57` | `manifest` 是否合 `SessionRef` | `invalidInput` | 是 |
| 49 | `src/service.ts:132` | `scope.binding.session !== requested.manifest` | `unavailable`（同类不符在 `readRunnerChain:237` 给 `manifestMissing`；经服务调用时那一行不可达） | 是 |
| 50 | `src/service.ts:286-292` | `scope.binding.session` 表示；`owner.hasUnknown` | `unavailable` | 是 |
| 51 | `src/implementation-registry.ts:48` | disposer 只删自己捕获的那一代 `entry` | 不同代则不删 | 是 |
| 52 | `src/implementation-registry.ts:61`、`:64` | 调用前当前代 `entries.get(name) === entry` | `notStartedUnavailable` | 是 |
| 53 | `src/implementation-registry.ts:72` | 调用返回后当前代仍是同一 `entry` | `errored`（撤下记报错，S-34） | 是 |
| 54 | `src/effect.ts:41-48` | `judgeConclusionForSubject` 的 `extensionName` 取自结论自身 `raw.extension` | 与自身比较，**此处 extension 身份核对是空的** | 不适用 |

**表 5 条目数：54。**

## 发现：本试点不处理，报 #44 或回规格

1. **函数面与服务面对宿主异常的处理不一致。**`runPass` 把端口异常收成 `unavailable`，`dispatch`／`replay` 对宿主异常直接拒绝；S-20 的闭合集合没有说异常怎么办。
2. **v6 要求端口异常「可观测」，代码里没有一处诊断输出。**28 处 `catch` 都不记录被捕获的异常。
3. **租户比对口径不一。**`sameBinding` 用 `modelLogJsonEqual` 比租户，其余用 `tenantIdEquals`（`task-owner.ts:78`）。SL3 的 `tenantMismatch` 在 `run-log` 变 `invalidInput`，在 `reminder-log` 变 `unavailable`。`validPorts` 与 `createRunnerTaskOwner` 不校验 `tenant` 的表示，首次校验在 `prepareRunnerConclusion`。`effect.ts:41-48` 里的 extension 身份核对是拿结论自己跟自己比，核对是空的。
4. **`reminder-log.append` 写成功后，如果同闭包的 `inspect` 抛错，返回 `unknown`**，但 owner 已按成功判过，不会把它留存为 unknown（`reminder-log.ts:119-130`）。
5. **类型里有、实现永不产生的取值**：`runPass` 与 `readPassConclusions` 的 `manifestMissing`、`RunnerRecoveryResult` 的 `{kind:'unavailable'}`；`readRunnerChain:237` 的 `manifestMissing` 经服务调用不可达。
6. **契约文件 v5 第 3、10 行仍自称 candidate**，registry 记为 accepted。

## 试点读数（交回时附前后两次）

- 方案固定的计数：`rg -o "'failure' in|'failed' in|'ok' in|\.ok\b" src | wc -l`，`34bae69bf` 上是 167。
- 补充计数（这个写法把 `!== undefined) return` 与其他几种 `'x' in` 也算进来，更贴近本成员的结果值写法）：`rg -o "'(failure|failed|ok|invalidInput|unavailable|invalid|unrelated|absent)' in |!== undefined\) return " src | wc -l`，`34bae69bf` 上是 128，其中 `run-pass.ts` 37。
- `make loop-status` 的超 alert 函数数与风险值（派发前在当时的 main 上刷新草稿取基线）。

## 签字

- [x] 负责人 2026-10-02 签。兜底取舍选 **A**：两个外层兜底先认信号、原样返回，其余照旧收成 `unavailable`／`invalidInput`；B 的两件语义（释放在成功后抛错时成功是否作废、端口异常怎样可观测）随 #44 的完整方案另定。
