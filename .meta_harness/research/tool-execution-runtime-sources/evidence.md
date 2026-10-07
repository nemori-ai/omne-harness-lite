# 证据记录

本页是**逐条来源与可复核观察**。当前结论见 [research.md](research.md)，逐行论证见
[2026-09-23 报告](reports/2026-09-23-dsh-jobs-vs-pf006.md)。

## 取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 立场 |
|---|---|---|---|
| DeepSeek Harness | `c291e7961a515f6d7af9304e7fd1d257929aef26`，根包 `@deepseek-ai/dsh-root@0.1.5-rc.2`，jobs 三包各 `0.1.5-rc.2` | 主检出 `tmp/sources/dsh-c291e79.tar.gz`（SHA-256 见下）解包于 `tmp/sources/extracted/dsh/`；只读 `sed -n`/`grep -n` | 作者自述（README、JSDoc、`.agents/notes/`）+ 源码。无独立第三方 |
| minimal-runtime local-execution | `.worktrees/minimal-runtime`，`feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`；包 `@omne-harness-lite/local-execution@0.0.0`（private） | 工作树直读；`git merge-base --is-ancestor` 核对提交关系 | 本仓库未接受的实施产物；设计依据属已退役设计链 |
| 已知问题记录 | 主检出 `tmp/local-execution-stop-io-coordination.md`（2026-09-16） | 直读 | 实施侧自述，非契约 |
| 产品正文与统一语言 | HUB `.worktrees/assets-runtimes`：PF-006 rev 14、PF-012 rev 7、PF-014 rev 3、PF-015 rev 10、PF-005 rev 5、PF-007 rev 16 | 直读 | 本项目需求权威 |
| 本项目约束 | 当前基础设施后端采用规则；主检出 `pnpm-workspace.yaml:8`（main `2c1a108`） | 直读 | 已接受决定 / 仓库事实 |

> DSH 抽取副本的 `SHA256SUMS` 行：`f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860  dsh-c291e79.tar.gz`；
> 复核：在主检出 `tmp/sources/` 下 `sha256sum -c SHA256SUMS`。
> 升级 DSH 采用版本时 grep 本页的 `c291e796` 即得全部待复核记录；minimal-runtime 前进时 grep `d79484d`。

---

## E-1 DSH `dsh-jobs` 契约：对象、状态、owner 与钩子

- 消费对象：research.md 结论 1、3、4、5、7
- 来源与精确修订：DSH `c291e796`，`packages/jobs/jobs/src/{types.ts,index.ts,invariant.ts,brand.ts}`、`packages/jobs/jobs/README.md`、`packages/jobs/jobs/package.json`
- 来源立场：作者自述 + 源码
- 实际观察：
  - `types.ts:17` `JobStatus = 'running' | 'stopping' | 'completed' | 'killed' | 'failed'`——**没有等待类状态**。
  - `types.ts:23-26` `JobKindMap` 只有 `bash`、`subagent` 两项，靠声明合并扩展。
  - `types.ts:32-39` `JobOutcome.status` 只有 `completed | killed | failed` 三种终态，`detail` 是自由文本。
  - `types.ts:57-62` `owner?: Agent`，注释：「agent disposal cancels and awaits the job. The instance must be the one currently registered under its agent id. Omitting the owner creates an unowned job, open to any caller until service disposal.」
  - `types.ts:64-68` `run(): JobHooks`——同步返回进程内回调；`types.ts:72-91` `JobHooks = { cancel(reason?), done: Promise<JobOutcome>, readOutput?() }`，`readOutput` 注释「each job has one consuming cursor」。
  - `types.ts:111` `ownerSession?: SessionId`（授权用）；`types.ts:120-127` `reported: boolean` 的注释把它与「completion reporters suppress redundant notices」绑在一起。
  - `types.ts:146-149` `JobDoneListener(snapshot, owner: Agent | undefined)`——完成监听拿到的是活体 `Agent`。
  - `index.ts:41-61` 实现者必须满足的四条语义（登记比 producer/controller fiber 活得长；按 owner 的 session id 授权；首个终态胜出、完成最后宣布；无 controller 服务该 owner 时 `start` 拒绝）。
  - `index.ts:62-71` 抽象类直接挂载即抛错；`index.ts:82,90,99,109,120,133,143,167,176` 九个抽象方法。
  - `README.md:53`「Jobs managed by the shipped in-process registry die with the harness process; durable execution across restarts needs a different backend implementing this contract.」
  - `README.md:120-122` Known Limitations 三条：契约是进程内的（`run()` 传回调与精确 `Agent` 对象，持久或跨进程后端须重塑 identity/restart/ownership/observation）；流式输出只有一个消费游标；**前台工作不能提升为后台**。
  - `invariant.ts:39-42` 快照不变式把 `ownerSession` 与完成监听收到的 `owner?.id` 对齐。
  - `package.json` `peerDependencies`：`dsh-agent`、`dsh-brand`、`dsh-invariants`、`dsh-session`、`@deepseek-ai/cordis`；`"license": "MIT"`。
- 支持范围：契约层的对象模型与作者声明的边界。不支持「持久后端改起来有多难」的量化，那是本轮推断（见报告）。

## E-2 DSH `dsh-jobs-local`：进程内实现

- 消费对象：research.md 结论 1、3、7
- 来源与精确修订：DSH `c291e796`，`packages/jobs/jobs-local/src/index.ts`、`README.md`、`package.json`
- 来源立场：作者自述 + 源码
- 实际观察：
  - `index.ts:1-4`「It keeps every record in memory and hands out fresh snapshots」。
  - `index.ts:28` 每 owner 默认并发上限 10；`index.ts:102-103` `store = new Map<JobId, TrackedTask>()`、`counters = new Map<string, number>()`；`index.ts:116` 作用域分层表 `ScopedLayers`；`index.ts:119` `ownerCleanups = new Map<Agent, …>()`。
  - `index.ts:131-134` `start` 首先检查 `servesOwner`，失败信息点名「load @deepseek-ai/dsh-tool-jobs」；`index.ts:150-153` 先调 `spec.run()`，再以每 kind 的进程内计数器生成 `<kind>-N`。
  - `index.ts:215-228` `kill`：先调 producer `cancel`，再置 `stopping` 与 `reported = true`。
  - `index.ts:356-360` 授权：`job.owner.id !== caller?.id` 即拒——**按 session id 比较**。
  - `index.ts:416-440` `settle`：首个终态胜出，先放行 waiter、再 `notifyChanged`，最后调完成监听。
  - `index.ts:448-464` `ensureOwnerCleanup`：要求 `ctx.get('agents')` 存在且 `agents.get(ownerId) === owner`，然后在 `owner.ctx.effect(...)` 上挂清理——**清理跟着 owner 这个活体 Agent 的 Cordis 作用域走**。
  - `index.ts:467-475` `disposeOwned`：owner 被撤时取消其全部任务、等结算、**从 store 删除记录**。
  - `index.ts:481-500` 服务撤除：取消全部、清空 store。
  - `index.ts:507-531` 撤除时 cancel 抛错则把记录强制记成 `failed`，detail「work may be orphaned」。
  - `README.md:12`「jobs die with the harness process and are not durable across restarts」；`README.md:131-132` 两条已知限制（进程内；cancel 不结算会卡住撤除并占着名额）。
  - `package.json` `peerDependencies`：`dsh-agent`、`dsh-scope`、`dsh-jobs`、`dsh-timeout`、`@deepseek-ai/cordis`；`dependencies`：`@deepseek-ai/schemastery`。
  - 测试 `tests/jobs.spec.ts` 55 个用例（名单见文件 115-1113 行），覆盖原子准入、owner 隔离、同 id 换实例、撤除、首胜结算；**无任何重启/持久化用例**。
- 支持范围：实现的实际存放与生命周期挂钩。

## E-3 DSH `dsh-tool-jobs`：面向模型的工具与完成送达

- 消费对象：research.md 结论 7、8，对照表「完成以提醒送达」行
- 来源与精确修订：DSH `c291e796`，`packages/jobs/tool-jobs/src/index.ts`、`README.md`、`package.json`
- 来源立场：作者自述 + 源码
- 实际观察：
  - `index.ts:10-18` 导入 `dsh-llm`（`createUserMessage`、`boundContextSummary`）、`dsh-output-retention`、`dsh-tools`、`dsh-jobs`、`dsh-agent`；`index.ts:21` `inject = ['tools', 'jobs', 'systemPrompt']`。
  - `index.ts:213` `spentWakes = new WeakMap<Agent, number>()`；`index.ts:224` 监听 `agent/inbox/claimed` 复位唤醒预算。
  - `index.ts:232` 在 `tools/pre-execute` 瀑布上 prepend 一个监听；`index.ts:259` `ctx.jobs.attachController('tool-jobs')`；`index.ts:262-266` 注册系统提示词片段。
  - `index.ts:278-299` `onJobDone`：已 `reported` 或无 owner 则不送；idle 且在预算内 → `owner.followup(message)`，否则 `owner.inject(message)`——**送达目标是活体 Agent**。
  - `index.ts:301-400` 三个工具 `job_output`、`job_list`、`job_kill`；`job_kill` 的 `reason` 只转给 producer（`index.ts:366`）。
  - `README.md:173-177` 已知限制：驱动退役窗口内结算的提醒会搁浅；唤醒预算不随时间恢复；**owner 被撤时挂在 idle owner 上的提醒丢失**；流式读单消费者；无 owner 的任务无 session 栅栏。
- 支持范围：工具面与完成送达的实现形状、它对运行时的依赖方向（工具面依赖运行时，反之不然）。

## E-4 DSH 决策注记：运行时的设计理由与自承代价

- 消费对象：research.md 结论 1、2、3、7、15
- 来源与精确修订：DSH `c291e796`
  - `.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md`
  - `.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md`
  - `.agents/notes/implemented/feature/2026-08-08-web-background-job-display.md`
- 来源立场：作者自述，含「Alternatives considered / Consequences」段
- 实际观察：
  - runtime 注记 `:32` 已发布 id 之后取消归任务自己的控制器，「later cancellation of the producing tool call must not kill the published task」；「foreground execution remains coupled to the call's `exec.signal`」。
  - `:44` 登记不是 producer fiber 的 effect，重载工具插件不杀任务。
  - `:50` session 相等授予访问，精确对象身份选择清理与送达。
  - `:52-54` 首个任务给 owner 的 `owner.ctx` 挂一个异步 effect；「Work intended to outlive an agent must be started unowned; survival across runtime restarts requires a separate durable-job design.」
  - `:58-66` 当时的 Service API 列 8 个方法（无 `onJobsChanged`）；seam 注记 `:16` 列九个方法——**API 在两次注记之间增长过**。
  - `:70` 「Custom non-model controllers can attach themselves without teaching the registry tool names.」
  - `:88` 每个 producer 以 `enableRunInBackground` 决定是否暴露后台参数，**默认 true**。
  - `:108` 抽象后端当时未做，因为 `run()` 传进程内回调与精确 `Agent`。
  - `:126` 「Foreground-to-background promotion requires a user interaction contract the SDK does not prescribe. Starts, reads, and notices are already logged as tool and context events, so dedicated task session events would duplicate model-visible facts.」
  - `:138`「Owned background bash now stops with its agent instead of surviving it. … Durable jobs, independent observation cursors, and foreground promotion remain separate designs.」
  - seam 注记 `:22`「a durable or cross-process backend still has design work to do before it can satisfy this Service Definition (identity, restart, ownership, observation)」。
  - web 显示注记 `:21` 每任务流式输出给人看与人发起取消是「separate phases」；`:108` 否决了把 `job/started … job/settled` 做成持久会话事件，理由是「durable format change in service of a browser list」。
- 支持范围：作者承认的边界与演化轨迹。

## E-5 DSH producer 与前台等待：bash 与 ask_user

- 消费对象：research.md 结论 2、4、6
- 来源与精确修订：DSH `c291e796`
  - `packages/shell/tool-bash/src/index.ts:35,40,190,348-388`；`packages/shell/tool-bash/src/background.ts:17-27`
  - `packages/interaction/tool-ask-user/src/index.ts:1-5,90`
- 来源立场：源码
- 实际观察：
  - `tool-bash index.ts:40` `enableRunInBackground: z.boolean().default(true)`。
  - `index.ts:348` 只有 `run_in_background === true` 才走 `jobs.start`（`:364`），返回 `{ kind: 'background', jobId }`；否则 `:379` `ctx.shell.run(... signal: exec.signal)` 前台执行，**前台不进 jobs 登记表**；前台被取消时抛 `HarnessError('tool call aborted', TOOL_ABORTED)`。
  - `background.ts:18-22` TODO：非沙箱 spawn 失败目前会「alias a signal-less kill」，即基础设施失败可能被记成 `killed`。
  - `tool-ask-user index.ts:1-5`「The tool pauses until a UI provider returns a human answer」，`:90` 传入 `exec.signal`——**等人是前台工具体里的一个 await，不是 jobs 的状态**。
- 支持范围：DSH 前后台的实际分岔点与等待的实现位置。未核实 DSH 是否有「只取消一次工具调用而不取消整轮」的用户入口。

## E-6 DSH 工具执行管线

- 消费对象：对照表「六种收场以正常返回到达」行
- 来源与精确修订：DSH `c291e796`，`docs/tool-execution-pipeline.md:6,8-57,60`（生成文档）
- 来源立场：作者自述（由源码生成的图）
- 实际观察：`tool/call` 事件在执行前落日志，`tool/result` 是「single model-facing outcome」；管线各段 throw 由 registry 规范化为 `isError` 结果。jobs 在管线上的接缝只有 tool-jobs 在 `tools/pre-execute` 上的输出上限监听（E-3）。
- 支持范围：一次调用恰产出一条 `tool/result`；后台完成走另一条 user/notice 消息（E-3），不回写原 `tool/result`。

## E-7 Cordis 版本、许可证与上游状态

- 消费对象：research.md 结论 15、16
- 来源与精确修订：
  - DSH `c291e796`：`vendor/cordis/package.json:2,4`（`"name": "@deepseek-ai/cordis"`、`"version": "4.0.2"`，以 workspace 方式 vendor）；`LICENSE:1-3`（MIT，Copyright (c) 2026 DeepSeek）；三包 `package.json` `"license": "MIT"`，版本 `0.1.5-rc.2`。
  - 本仓库 main `2c1a108`：`pnpm-workspace.yaml:8` `'@deepseek-ai/cordis': 4.0.4`（catalog）。
- 来源立场：仓库事实
- 支持范围：DSH jobs 编写与测试时所对的 Cordis 与本项目采用版本不同（4.0.2 vendor vs 4.0.4 官方发布包）；**本轮未验证 4.0.2→4.0.4 之间 `Service`、`ctx.effect`、`ctx.get` 的行为差异**。

## E-8 minimal-runtime local-execution：范围、形状与明确不做

- 消费对象：research.md 结论 9、10、11、12、13、14
- 来源与精确修订：`feat/minimal-runtime@d79484d`，`packages/tools/local-execution/`
- 来源立场：本仓库未接受的实施产物，其 design.md 以已退役设计链为施工依据
- 实际观察：
  - `README.md:3-6`「supports only bounded UTF-8 reads and revision-checked replacement writes for files registered directly beneath one deployment-exclusive control directory. It does not execute shell commands, follow arbitrary paths, create targets, detach work, or claim a sandbox.」
  - `README.md:8-14` 持久 JSONL 执行账本；写路径「exclusive same-directory temporary file, file sync, revision recheck, rename, target sync, and directory sync」；「Node cannot make the final revision-check-to-rename interval conditional, so the host acquires an exclusive deployment lease … A stale lease fails closed and needs deployment-level proof before it is removed.」
  - `README.md:16-21` 协作式停止；超时返回 `physical: unknown`；「The provider never produces `forced_isolation` evidence. `dispatch_intent` without a terminal recovers as unknown and is never replayed」。
  - `README.md:28-33` `host.terminals` 只发执行身份铃，消费者重读、启动后自行扫描补漏。
  - `design.md:50-51`「不执行 shell/任意 callback/网络文件系统/后台脱离；… 不用 AbortSignal 或内存 Map 代替停止协议」；`design.md:158-162` 不承诺有时限强停，`requestStop(mode:'force')` 返回 unsupported；`design.md:164-170` 「accepted 且无 dispatch_intent」可经恢复许可继续；`design.md:188-192` 两个命令 `frames:[]`，`subscribe` unsupported，「不能沿本切片静默降级为内存帧」。
  - `src/plugin.ts:12-16` `localFileToolDefinition`：`frames: []`、`background: { mode: 'unsupported' }`、`stop: { capability: 'cooperative_fence' }`。
  - `src/types.ts:56-66` `ExecutionTerminal.outcome = 'succeeded' | 'failed' | 'interrupted' | 'unknown' | 'cancelled_before_execution'`，另有 `physical`、`cleanup`、`effect` 三个独立维度。
  - `src/host.ts:208-220` 构造顺序：取部署租约 → 开账本 → `recover()`；`src/host.ts:247-265` 有 `dispatch` 无 `terminal` 的 attempt 恢复为 `unknown`、`effect: possible`、`cleanup: retained`，注释「is never replayed」；`src/host.ts:714-717` 停止栅栏命中落 `interrupted`；`src/host.ts:766-778` `force` 模式返回 `unsupported`；`src/host.ts:1126-1160` 关闭：对未终态 attempt 发协作停止，有残留则 `retained`。
  - `src/ledger.ts:13-14` 账本上限 64 MiB、单条 2 MiB；`src/ledger.ts:174-222` `execution-ledger.jsonl` 追加写 + 文件 `sync` + 目录 `sync`；host 中 16 处 `ledger.append`。
  - `src/filesystem.ts:93-107` 租约文件 `active.lock` 以 `O_CREAT|O_EXCL` 创建，已存在即报「an active or stale deployment lease exists; remove it only after proving the prior owner cannot run」。
  - `src/*.ts` 无任何 Cordis 导入；`LocalExecutionPlugin` 是普通类（`src/plugin.ts:66-78`）。
  - `package.json`：`"license": "UNLICENSED"`、`private: true`、`engines.node ">=24 <25"`、唯一运行依赖 `@omne-harness-lite/work-data`（同样只在 minimal-runtime 分支）。
  - `packages/core/work-data/src/index.ts:10,16-20,68`：`SessionRef = {tenantId, sessionId}`、`RunRef`、`StepRef`、`WorkOwner = StepRef | WorkRef`、`CallRef = {owner, callId, attemptId}`——执行身份携带租户与会话。
  - 测试：`tests/local-execution.spec.ts`（21 处声明，含 `it.each`）、`tests/stop-before-rename.spec.ts`（4）、`tests/grant-scope.spec.ts`（1）；README `:50-52` 称测试用真实临时目录、独立崩溃进程与 Linux `/proc`。本轮未运行。
- 支持范围：它实现了什么、明确不做什么。不支持「它符合任何现行契约」。

## E-9 local-execution 已知问题：停止与文件 I/O 交错

- 消费对象：research.md 结论 12
- 来源与精确修订：主检出 `tmp/local-execution-stop-io-coordination.md`（2026-09-16）；提交 `e14a34c`（窄修 rename）与 `245ef05`（「fix(local-execution): fence each pre-rename file step」），`git merge-base --is-ancestor` 证实二者都是 `d79484d` 的祖先；`d79484d` **不是** main 的祖先。
- 来源立场：实施侧自述，文中明言「不是已接受契约」
- 实际观察：
  - `:9-20` 反例：`rename_intent` 耐久后 `await markers.mayContinue()` 与真正调 `rename` 之间有异步交错点，`requestStop` 写入的墓碑与该调用没有同门全序；旧实现在墓碑耐久后仍 rename 并记 succeeded。
  - `:31-34` 审计称问题不限于 rename（read 的 open/read/fstat、写临时文件 open/write/sync 等）。
  - `:57-64` `245ef05` 把 rename 前各步统一走 host 串行门、先登记 task 再立即调 Node I/O，新增两个真实交错用例；「该实现证据仍只属于 LE 局部，不替代迁移规格正式落条」。
  - 源码现状：`src/filesystem.ts:313,346,366` 仍有 `await markers.mayContinue()`；`src/host.ts:697-698` `mayContinue` 与 `launchRename` 经 `io.issue` 发出。
- 支持范围：已知竞态存在过、局部修过；**不支持「停止协议已完整正确」**。

## E-10 本项目约束：无 in-memory 与存储协议

- 消费对象：research.md 结论 3、11。
- 当前采用范围：[基础设施后端规则](../../design/architecture/infrastructure-policy.md)。存储与消息队列两类不提供 in-memory 后端，时钟不在此列；活体句柄表的归类尚未定案，不能从后端约束推定其生命周期。
- 存储协议：[公共 SPEC](../../../packages/core/storage/SPEC.md)与实际公开入口维护 read/write 及事务锁语义。本研究的旧源码观察只适用于其原输入，不证明现行消费者或消息队列符合性。

## E-11 产品正文的对照锚点

- 消费对象：research.md 对照表每一行
- 来源与精确修订：HUB `.worktrees/assets-runtimes/.meta_harness/design/`
- 实际观察（行号为本轮读到的位置）：
  - PF-006 rev 14：§4 Tool Execution `:194-205`；等待态 `:224-236`；发帧 `:238-277`；产出 `:279-297`；卸载 `:299-313`；§5.2 `:340-364`；§5.4 账 `:487-496`；§5.5 六种收场 `:498-536`；§6.5 `:659-666`；§6.6 `:668-734`；§6.7 `:736-763`；§6.10 `:795-848`；§6.12 `:894-948`。
  - PF-012 rev 7：§5.3 段停在「等工具」`:567-576`；§6.13 `:1694-1715`；I-6/I-7 `:1724-1734`。
  - PF-014 rev 3：§5.3 `:306-322`；§5.4 `:324-341`；控制指令表 `:434-444`。
  - PF-015 rev 10：§4 归档连带三件事 `:116-125`；在途工作被取消 `:329-335`；§6.3 `:507-517`；§6.4 `:519-524`。
  - PF-005 rev 5：执行环境权限 `:197-220`；§6.9 `:428-452`。
  - PF-007 rev 16：§6.4 `run_in_background` 与后台声明 `:566-571`；§6.10 `BkgJobs()` `:941-961`。
  - `ubiquitous_language/terms/execution-and-outcome.md`：UL-tool-execution `:46-63`；UL-background-execution `:65-84`；UL-tool-wait-state `:122-146`；UL-frame-emission `:148-169`；UL-execution-frame `:171-195`；UL-execution-outcome `:286-313`。
  - `domain_objects/objects.md`：UL-tool-execution `:200-206`。
- 支持范围：需求侧的条款原文位置。
