# Session／模型调用归属：独立机制读数

2026-09-29；步骤 C；候选、未接受。仅供主线对账，不能作为长期设计依据。

## 读了什么、没读什么、为什么

- 执行位置已核：HUB `/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime`，分支 `panqiwei/model-request-runtime`，源码基线 `be316078f4490f9e03381de1d57a72726eaaec78`。只写本目录 `mechanism-reading.md`、`comparison.json`；不修改规格、映射、词条、对象、产品、源码，不提交、不委派、不接受。
- 已读 handbook（步骤 B/C、0→8、六问、decompose、reconciliation），工作区/设计/对象/realization 约定、worktree-discipline；Cordis 采用事实只用现有 basis 4.0.4 条目，不另推导生命周期。
- 需求基准是主线明确的合成目标：`003561900adb27de6ebe776fa1cf1b228304c873` 的 PF-013 rev14、PF-012 rev21、PF-015 rev20，加 HUB PF-013 rev15 的计量/有限输入承诺；已核同步提交 `690937a4` 的 PF-013 README 为 rev16。00356190 的对象/词条按 git blob 读取，避免把 HUB 尚未同步的旧条目当目标。未声称已在 HUB 合入该提交。
- 独立 A 输入来自主线消息：只交付 model runtime；保留已符合归属的结构；外部 Session/Run 只提供必要事实和接口；新的 Run 可凭可序列化引用查回执行/结果。最后一条是用户本轮意图（由主线转述），**其精确引用格式、未知与失联的判定、授权面尚待规格化**。
- 最后范围澄清：正式模型包只承担执行、模型专属 registry/ref/status/result 与必要身份/授权关系；正式源码不建设 Session/Run 领域系统。端到端验证可用 demo 的简单 LLM call loop（Cordis plugin/fiber）消费独立模型 service。不能把完整治理 host 或恢复调度建设列为本次前置，也不删必要身份/引用/授权字段。
- 读取 `sources.json` 以定位原始来源。该 manifest 同时暴露封存声明、性质数量与待核事项元数据；这些不作为本读数推导依据。**未读 `domain-reading.md` 正文、未读其性质表；未做对账四表。**任务最初要求读 B/四表与角色冲突，已报主线，主线随后明确四表自己做。
- 已读原始 PF-013 §5.13、PF-015 §6.19，以及相关对象/UL 原文；已读 RT10 相关条款、runtime 历史设计及 v10/v11/v19 增补、runner v8 增补和状态入口；已读实际调用、容器、读取、恢复、opened、settlement、插件与 demo 宿主源码。runtime-v19 的采用由节点入口给出，不能被其保留的 candidate 文案推翻。
- 未读 `design_legacy/`、未读正在修正的 impact/report.md，未进行 paid/key/ledger/build 操作，未运行行为测试或形式检查。下面的“已有”表示静态机制证据；不等于新需求通过验收。
- 用户随后要求先考察 DSH agent registry 范式；主线提供了官方固定提交 `639ed015397290b3745d163aafe02ffee4aa3f84` 的逐符号读数，下文按**主线转交的源码事实**引用。我未独立执行该上游测试，也未把此查阅提交当项目采用基线；本项目仍只直接采用 Cordis。

全文路径除特别注明外相对 HUB；设计路径前缀为 `.meta_harness/design/`。源码行号只帮助定位，不充当语义绑定或验证。

## C1：从对象条目起步

对象基线是 `00356190:design/domain_objects/objects.md` 的 **3 个有身份对象**：UL-session、UL-run、UL-model-call。UL-runtime-handle 在 `ubiquitous_language/terms/agent-runtime-loop.md` 的形态是**属性**，不应在对象表里另找一条，也不新增第 4 个领域对象。

| 基线条目 | 原身份／宿主／生灭 | 机制分解与证据 |
|---|---|---|
| UL-session | 捕获租户的耐久会话身份；无删除、过期、回收 | 外部会话身份/访问事实；模型侧按 SessionRef 绑定日志与调用 owner。demo `bootstrap.ts:588,2296` 已有 `Map<SessionRef, Set<DemoCallHost>>`，是宿主留存集合，不是持久会话本体 |
| UL-run | 宿主为 Session；身份在数据里；完成/失败/取消为吸收终态 | 外部治理事实与记录归属。新消费者 Run、原调用 Run、原发起 attempt 不合并；RT10 S5 的归属权威是条目壳，runner-v8 拒绝跨 Run 失败主体挪用 |
| UL-model-call | 宿主 Session；可持久恢复调用身份，关联原 Run/发起尝试/实际输入；运行、完整/上交/中断 | 同一对象拆看身份值、进程内执行容器、耐久调用事实及派生查询。`CallKey={session,callId}`、`CallContainerStore`、`call-history`/`projectCallState` 已分别承担前三面；不得据此另建“模型执行对象”身份 |
| UL-runtime-handle（属性） | 新持有者按访问资格重新取得；释放不取消；**原文明确不是持久化调用身份** | 候选把“可序列化调用引用”和“临时等待/观察资源”分开。前者引用 UL-model-call 的身份值；后者承载消费者本地等待/观察，并在释放时只撤该消费资源。正式词条不另造；“可序列化调用引用”目前是描述语（无独立词条） |

### 对对象条目的差异清单（报维护者）

没有合并、改宿主或新领域对象。模型调用的四个机制面是同一对象的表示与责任，不改变 UL-model-call 的 Session 宿主。UL-runtime-handle 的“不是持久化身份”须保留；若用户的 ref 要独立命名，由词条 owner 判它是不是既有身份值的引用，不能擅把句柄改成耐久治理对象。

对象表 UL-model-call 指“实际输入依据”，但现 RT10 新 `open` 尚无日志记录（S28/S34）；若外部会话在首次 dispatch 前已保存 ref，崩溃后如何区分已分配但未发出、无权读取、从未存在，现有输入不足以裁定。此为模型调用身份公布时机/事实留存缺口，不是新增 Session 系统的理由。

## 现有承载与最小差异

以下 M 编号只在本产物内有效，是机制证据项，**不对应 B 的性质编号、不作逐性质裁定**。

| 项 | 静态证据 | 读数与限制 |
|---|---|---|
| M01 稳定引用 | `src/service-types.ts:62` CallKey；RT10 S5/S8/S34 | SessionRef + ModelCallId 已能表示调用定位；callId 单独不是访问键。可序列化值面已有基础；不把 host、AbortSignal、Promise、Fiber uid 或 service 对象写进 Session/Run |
| M02 执行 owner | `service-types.ts:130` 明言 original call actual lifetime owner；`service-container.ts:138` close 会 abort/systemStop；v11 显式宿主协议；demo 按 Session 留存 host | 已有执行 owner 能独立于一次消费者存在。**owner.close 取消正确，不是消费者 release。**`CallReservation.release` 只 unlock（`service-container.ts:782`）；不能把 reservation 释放写成取消链。完整生产会话归档/Run 取消调度不在本交付 |
| M03 规范宿主错位 | RT10 S5、S7、S36 仍写 agent runtime 宿主；S61 将宿主 stop 接 S36；基础 realization/design.md 同样写 Agent 宿主 | 与新产品条款发生实际语义差异，须新版本纠正。现有 `ModelCallHost` 机制可复用，把它解释为真实模型执行寿命 owner；不能据旧规范称现代码一定随 Agent 销毁而取消，也不能反过来以代码抹掉规范冲突 |
| M04 按 ref 查活执行 | store.find 查本进程容器；readAttempts 读合法完整前缀，返回 open/in_flight/speaking/终态；`call-state.ts` 明确 durable 优先 | **缺口**：日志中的 in_flight/speaking 是历史进度，不证明当前活性；Map 查无容器不证明执行已失联。需要模型专属解析行为，联合实际执行 owner 与耐久状态，区分存活、完成/其他终态、确认失联、不可判；未知不授重发 |
| M05 重新等待/观察 | `service-calls.ts:645–701`：openCall 原本只认 resumable，同本地 host，同 session binding；在途不给重开。观察替换也仅此支；原 dispatch 持 `handle.outcome` | **缺口**：新持有者不能把 openCall 当无副作用 attach。应新增/扩展读及附着行为，仍按 CallKey 找原调用，零新 send、零重规划、零原属主改写。重新取得句柄不接受新调用的 messages/target/basis 来覆盖旧请求 |
| M06 结果读取与承接 | RT10 S34 与 `service-reads.ts` 已返回每次已落响应体；`service-dispatch.ts:876` 将完整未处置回复保留到原容器 reply_pending；`service-reconcile.ts:124` settleReply 使用原 invocation | **部分已有**：完成且耐久的结果可读，不需要重做 readAttempts。缺的是新消费者取得原 pending 完整回复/等待结果的公开入口；“上游已完成”不一定等于 RT 的 complete，reply_pending 不能伪装成已耐久。原 Run 终态/归档后的结果承接须保留只留痕、不得复活原 Run 的规则 |
| M07 无持有者时完成 | 原 dispatch 异步任务与容器保留 pending，不以消费者引用数触发 close；RT10 S6/S17 仍把正常完整回复收口留给调用方 | **证据不足/语义需细化**：消费者消失时执行可继续，但 pending 结果何时耐久、何种“处置”可由 owner 写、再次取得者如何认回，不能由“Promise 仍在”证明。不能擅自将所有回复写 consumed/vetoed 来避免 pending；需主线明确模型结果留存与消息处置的边界 |
| M08 opened 与原栅栏 | `anchored-invocation.ts:536` append 原 run/attempt fence；首内容回调 `:681–700` 原输入壳写 model_call_opened | **条件风险，不是已运行反例**：旧调用已发出→Agent 重装配进入后继 attempt→旧调用才收到首内容，原 attempt 栅栏可能拒绝 opened，影响持续输出。需独立发出授权/既有调用事实写入的裁定，不能直接改成无条件 unfenced 而绕过授权/取消 |
| M09 最终结果结算 | `settlement-coordinator.ts:430` 明确 unfenced，withRun 用同前缀 tailEquals；RT10 S17/S69–72 | 已有承载应保留；不能从 M08 推导“旧 attempt 的结果一律被拒”。共享存储对象是同一会话日志的尾及该响应判重键，非进程内锁；跨 owner 同提交仍由同一 append 批/条件承载 |
| M10 恢复入口 | RT10 S33 需旧网络/门/追加/结算 writer 实际停止，原批认回后才恢复；demo `reconcileModelRuntime` 主动 stop 原 hosts | 已有恢复不能充当“新消费者查找”。后者必须先确认原执行存活/已完成；活着即重新等，**不能为查询先 stop owner，再说确认失联**。reconcile 只供真实停止/失联后收口；未知与可靠不可判均不重发 |
| M11 访问与跨 Run | RuntimeSessionAccess.bind 核 Session/tenant/generation；observer 授权现查；RT10 S23 仍是受信内部面，runner-v8 必须原 Run 相等 | 可复用访问与观察入口，ref 本身不授权。另一 Run 可以获准观察原执行/结果，不据此获得取消权、重发权或将失败主体导入自己的 after_model_call；原 owner/原 Run/成本归属不迁移。跨 Run 具体观察授权仍由外部会话访问 owner 明示 |
| M12 当前状态索引 | RT10 S34 要同一合法完整前缀；`service-reads.ts.withPrefix`/readSettlementPrefix 沿该读面；PF015 §6.19 要当前值查询不随日志增长全扫 | 派生持久索引可作为原日志的查询投影，不是另一真相或通用资产 registry。现已读路径未证明 O(1) 当前值；不能把全调用历史列表返回成本算 O(1)。新 ref 查状态若纳入该目标，须分开单次定位和按需历史读取，并给出来源进度/新鲜度证据 |

最小语义演进候选限定在 RT 的宿主解释、定位/附着观察、pending 可重取、恢复准入、opened 授权，以及需要它们引用的共享值/日志条款；MR9 的结果事实和 RT10 的 token 估算/校准/有限输入、runner5/v8 的原 Run 绑定保持。是否必须改变 MR 表示/新增记录只能在 M07 的语义裁定后判断，不能先列整批重写清单。

## C2：逐对象机制面落点（0→8，第一个“是”即停）

这是 3 个领域对象加 1 个属性的 **7 个定位面**，不另立对象名册。#0 只表示本批模型侧无需为该面另建结构，不表示外域系统已经交付。

| 对象的机制面 | 落点 | 为什么前面的不是 / 成立前提 |
|---|---|---|
| Session 身份/租户/外域治理事实 | #0 | RT10 S5/S14/S19、RuntimeSessionAccess 已要求显式外部来源；本批只列缺席行为，不新造 Session 生命周期系统 |
| Run 身份、原属主、终态解释 | #0 | RT10 S5/S17/G28、runner-v8 已有归属约束；来源缺口外置。不得因为要跨 Run 观察就重写治理身份 |
| Model Call 的稳定可序列化引用 | #1 数据 | #0 尚无消费者长期保存/认回此引用的完整承诺；#1 无新执行寿命、无新可见实例，仅现有 CallKey 值与来源对应；发布前持久边界待裁 |
| Model Call 的查活/附着/owner 解释 | #2 service 条款（有条件候选） | #0 现 readAttempts/openCall 不足；#1 需要现查/授权/附着行为；#2 在既有模型调用责任及内部授权/失败框架内可承载，新返回形态仍须新版本。若另需独立跨进程 owner 定位协议，不能假称现 S23 覆盖，先报缺口；本批不预建新平台 |
| Model Call 的终态/响应事实 | #0 | 已有 RT10 S17/S34 与 MR9、unfenced+tailEquals、原批认回。仅补新消费入口，不另置第二个写方或结果真相 |
| Runtime Handle 的消费者等待/观察资源 | #3 effect（候选） | #0 没有在途重新附着入口；#1 有主动订阅/等待资源；#2 的业务附着操作由上一行承担，本行是具体资源撤除，不能只靠条款使监听消失；#3 寿命与消费者相同，释放只撤本地等待/观察，不 close 执行 owner。跨进程观察需协议，当前不声称内核支持 |
| Model Call 的耐久状态索引 | #1 数据（必要性待性能/需求范围对账） | #0 已读路径未证明规定的直接查询目标；#1 同一调用的派生数据，无独立身份、实现实例或执行寿命。写入一致性和追尾成本由提供者进一步设计 |

分布：#0=3，#1=2，#2=1，#3=1；#4～#8 无新增落点。#9 非结构性出口明确保留：若剩余问题只是诊断内容/测得的查询优化，按该类流程处理；本次查活与重等属于行为承诺，不能降格为 #9。

## C3：六问

1. **数据还是 service？** CallKey/原 Run/原 attempt/来源进度是数据；resolve/attach 的实际行为归已有 modelRuntime。公开函数层可按显式端口组合，不强迫外部消费者构造 Session runtime 或 Cordis Context。独立 invokeModel 的调用模型能力保持独立。
2. **哪层 fiber？** 保留现 modelRuntime 提供者；真正执行由原 CallContainer/ModelCallHost 负责。消费者可以有自己的 fiber/作用域，但执行不可挂在其销毁链下。本读数没有证据要求每个 Session×Run×Call 建 fiber，也不把本次反例当成新插件理由。
3. **要不要 isolate？** 不新增按 Session/Run 的 label。这里变化的是身份和访问资格，不是多份定制实现；显式 bind 校验负责数据访问。依据 basis `isolate-hides-instances-not-data`（4.0.4，有 probe）。
4. **谁 inject 谁？** 保持现 P-2 必需依赖（service-plugin：sessionLog/modelCatalogRead/credentialLookup/modelTransport/storage/clock）的既有实际关闭协议；消费者重载只释放消费者资源。不要让“Agent inject modelRuntime 会重跑”反向建立“Agent 卸载必停模型”。依据 `plugin-body-reruns-on-provider-change`（4.0.4，有 probe）；换提供者后只能凭 ref 重新 resolve，不能用新 service 实例暗中 dispatch。
5. **事件通知还是控制？** 沿 RT10 S37 保留直接调用的控制面；观察是有界显式输出端，不作为权威、授权或重发许可。无新增 Cordis 控制事件，因此不引 emit/bail/serial 作为取消授权。
6. **装卸配对？** 执行 owner 的 close→实际停止/未知写认回→唯一释放原 lease；消费者 acquire wait→撤等待/观察；两者不能共享最后引用计数。P-2 真实卸载保留旧 owner 的未完责任，fiber 消失不等于释放成功。依据 `effect-disposal-concurrent-not-ordered`（4.0.4，有 probe）与已采用 v10 owner 组合关闭，不依赖多个 effect 完成顺序。

上述 basis 三条均非 null probe；本次未重跑 probe。**“Fiber uid 不能作持久身份”仅依据当前领域身份要求和 CallKey 实现作本项目结论**，不新增未取证的上游身份协议主张。无需本次访问官方源码；如下一阶段依赖精确卸载结算/新 attach 的重入顺序，再按采用 4.0.4 做来源核对。

## 可独立引用的装配草图与为什么不拆

此节仍是临时机制候选。若主线采用为后继提供者依据，必须先移到 proposal 或该节点新版本正文；不能长期引用此 tmp 文件。

```text
外部 Session/Run owner
  保留身份值/原归属/访问事实/终态与归档事实；持久保存调用引用
          │ 显式端口（缺源就不可判，不构建完整外域系统）
          v
现 modelRuntime 公共组合 / 同一 Cordis 服务
  CallKey -> 原 CallContainerStore -> 原执行 ModelCallHost + invocation
       │                │                         │
       │                └-> N 个可撤等待/观察      └-> 实际发送/流/结果结算
       v
同一 Session 日志 -> 原调用事实/响应/成本 + 可重建查询索引

新消费者：读取持久 ref -> 当前访问校验 -> resolve
  存活：附着原执行，等/观察；不发模型请求
  已完成或其他终态：读原事实/原结果；不改原 Run
  确认失联：沿原恢复前提对账，再按首 token 判据；不是直接重发
  不可判/缺权威/查不到可信归属：不可用；不当作失联或新调用
```

**为什么不拆成新的 registry 能力：**原调用状态、首 token、结果和停止事实仍由同一模型责任解释；进程内 store 已能定位实际执行，日志已能定位耐久事实。新平台会迫使二者与第三份状态同步，增加至少一个跨 owner 一致性边界而没有独立消费者/独立变化责任的证据。Session asset registry 拥有资产可用性，不拥有执行存活，不能复用其名字掩盖差别。

**为什么不拆每调用独立插件：**当前容器已拥有连接、异步工作、lease、pending 结果与收口。生命周期独立于消费者不等于必须新增 fiber；现显式 owner 已能表达该区别。新增调用插件若依赖可换代服务，还须重新证明不会因重跑再次发送。只有可复现的独立装卸/失败隔离需求当前 owner 无法满足时，才回到 C1 重分解。

**公开面两种投影候选，供主线选择，非已采用提案：**

- 优先评估在已有模型能力增加一个清晰的“按引用解析并取得消费资源”操作，名字待统一语言/规格主线确定。公开资源含只撤消费的 release、等待/读取和授权范围；控制仍走独立现有控制面。代价：公开操作数从 13 增至 14（若把查找和附着拆开则可能更多，不能预先保证只一项）、所有服务适配/文档/类型/验收矩阵新版本。收益是 openCall 不混入无副作用重等语义，readAttempts 保持纯历史读。
- 也可评估扩展 readAttempts 的显式消费模式，复用已有 FailureConsumption 风格，但不能把失败主体消费资源冒充一般执行等待；必须返回新的可辨识分支，保留默认读取只读语义并明确等待释放。代价是同一操作承担历史读与资源取得、需要新的授权/失效/资源泄漏证据。**维持 13 不是选择依据**。若九项操作规格混杂难以表达，回到前项。

两者复用同一执行/日志核心，均非新能力拆分提案；本任务未建立 proposal 信息包、未做三个候选的能力裁定。

### DSH agent registry 范式：可复用部分及不能照搬的部分

原始来源：[固定提交的 agent/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts)。证据传递：主线于本轮消息报告已读该文件、README 与 agent.spec 的相关测试定义；本读数是这些观察在模型侧的投影，不声称本执行者重做上游核验。该 DSH 层没有本项目采用的 basis 条目，类比能用于模型候选的判断标为**假设**，不能成为 Cordis 保证或已接受绑定。

| 主线转交的上游观察 | 对模型候选的含义 |
|---|---|
| `AgentRegistry extends Service`，`Map<SessionId,AgentEntry>`，`super(ctx,'agents')`（245–255） | 可借用服务作为访问门面、Map 保存实际进程内实例的形状；模型键沿 CallKey，不能拿 SessionId 一对一结构去限制同 Session 多模型调用 |
| typert 将 wire agentId 解析到 get(id)/ctx（258–268）；`setFactory` 分离工厂（358） | 可借用序列化引用与实际对象解析、构造实现分离；模型解析仍需显式 Session/tenant/授权。未来 Tool/Agent 可以采用相同分层思想，调用标识和终态语义各归原能力 |
| create/resume 以 `getTraceable(ownerCtx,target)` 跟随访问调用 ctx（391–415） | **不能照搬 owner 规则**：Model 执行 owner 必须是会话一侧真实寿命 owner，Agent 消费者 ctx 只拥有其消费资源；否则把现有产品约束重新破坏 |
| register 用 effect，enter 完成 setup 后才插入，唯一 ID；detach 以精确 entry identity 防旧 disposer 删新实例（437、459、497） | 可借用“完成准备后发布”“精确登记代际注销”。从消费者释放误删原执行或旧实例清理删新实例都是应有负控；该范式不证明耐久身份或跨进程唯一性 |
| get 只返回 live entry 或 undefined，无终态墓碑（566） | 只能承担进程内活实例索引；模型还需原日志的终态/失联/不可判解析。undefined 不能解释成失败、已结束或准许重发 |
| AgentHandle.dispose 会真实 stop/drain/unregister/移除 Session（约161） | 不是 UL-runtime-handle 的只撤消费者引用；模型不能直接暴露它充当普通 release。必须区分实际执行取消与观察/等待资源撤除 |

**暂定方向**：借鉴服务门面 + 实际执行索引 + 可替换工厂 + 精确登记/撤除 + wire/ref 解析的组合范式，复用本项目已有 CallContainerStore 与 owner，补模型专属耐久状态/授权/重等；不引入 DSH agent 原语，也不据一种领域先发布 Model/Tool/Agent 通用 registry 契约。

未来提取通用构件的条件：至少第二个实际能力提出同样的实例登记/精确注销/构造边界，且能证明不将模型的首 token、Tool 的不可重做外部效应、Agent 的装配/尝试生命周期混进共享层。可共用的候选最多先是进程内登记构件和引用解析适配；耐久结果、取消范围、重启/重发与授权仍由各能力决定。出现重复维护的相同算法或共同缺陷才有提取收益证据；当前没有这些证据，不定稿通用化方案。

### 本次可交付的最小 demo 装配

正式模型包可由独立 Cordis service 暴露上述模型行为，应用侧明确提供模型访问、存储/日志、身份关联和授权端口。demo 起一个简单 call-loop plugin/fiber：取得合法身份输入、发起一次调用、保存可序列化 ref、等待/展示结果；卸载该消费者后再起一个消费者按 ref 认回。它只是验证消费者，不实现正式 Agent Loop、Session 生命周期或 Run 状态机。

执行 service 的 owner 位于消费者之外。demo 消费者退出只撤其等待/观察资源，service 与原模型执行继续；显式取消或真正关闭执行 service 才走原排空/取消/认回/释放协议。第一版可以使用现已合法的 noRun 调用路径；若验与 Run 相关的归属分支，交入有真实依据的最小关联及授权事实，不能伪造 fence 或把任意 bool 当生产 Run 事实。缺外域输入只阻依赖它的分支，不能把完整外域实现升级为独立模型 service 的启用前置。

建议 demo 验证同一 CallKey 的三段：消费者 A 消失时正在请求；B 重新附着等待且 send 计数不增；执行完成后 C 从 ref 取得已存结果。另验未知引用/撤权/不同租户拒绝及关闭执行 service 的真实收口。上述是验收候选，未在本次执行。

## 外部事实与缺席行为

| 提供者 | 模型侧最小所需事实/动作 | 缺席/未知行为 |
|---|---|---|
| Session 身份/访问 owner | 当前访问者对该 Session 的资格、创建时租户、日志绑定/generation；原调用归属；归档/显式取消的实际通知或控制调用 | 身份/权限不可验证则 unavailable 或现有授权拒绝；不拿 ref 或历史身份当凭证；不能触发新 send |
| Run owner | 原 Run 与调用的关联；真实终态的同前缀解释；本次消费者 Run/attempt 与可消费资格；取消应作用的目标集合 | G28 保持：未知不得解释为未终结。不能为缺一个 bool 新建完整 Run；需要依赖该事实的结算/消费路径不可用，其他 noRun 或合法只读路径保留 |
| 当前尝试/写授权 owner | 发起新动作的真实资格；原调用已经获准发出的事实；attempt 被替换后，原执行追加 opened/事实的合法授权 | 不复用新尝试身份改写原来源，不自动 bypass fence。opened 方案在正式演进前未定；不能放行内容后再补事实 |
| 执行 owner/恢复装配 | 原实际执行仍活/已完成/确已停止的事实；唯一重承载、旧 writer 停止、同源完整前缀 | 查无本地容器或等待超时不足以判失联；不可判返回 unavailable，保留 ref，禁止重发 |
| 结果消费者/消息 owner | 结果被持久为消息/否决/系统使用的真实处置及授权；同一响应/消息批的提交关系 | 没有处置不能编造 consumed；原 pending 责任必须保留。原 Run 终结后只留痕/记账，后继 Run 读取不取得原归属 |

外部输入是要求已有/未来外域 owner 提供的窄事实端口，不要求本次完成其完整系统。跨进程后，ref 仍是数据；活性/唯一执行 owner 的发现、附着/撤权、观察交付是协议责任，Cordis 不补齐。当前单机实现不提前发布分布式一致性保证。

## 正式验证义务与当前证据边界

以下是触发的后续义务，本次未运行、未关闭：

1. **执行与消费者的分离（状态模型）**：consumer acquire/release/reload，执行 ready/inflight/opened/pending/terminal 并发；任意 N→0 消费者不隐式 cancel/send。新增 consumer 不改变 call/run/snapshot，终态吸收。负控：最后句柄释放调用 owner.close 必须失败。
2. **解析/附着与关闭竞争（状态模型 + 实际故障）**：resolve 看见 live 后执行终态、owner 换代、访问撤回；只附着一个原执行，失败不变相新开。未知、不存在、确认失联分别建模，不能通过把 lost 定义为 Map absent 吸收证明义务。
3. **opened 授权（跨 owner 状态模型）**：dispatch 已提交→新 attempt 生效→旧执行首内容→opened 回执未知/失败；在合法原执行继续条件下可落真实事实，取消/归档竞争后不得越权泄露内容。日志原对象上的共同提交/条件要明确；只是改 fence 类型不能代证。
4. **pending 结果认回与治理（状态模型 + 同日志批）**：消费者消失、结果完成、旧/新尝试并发处置、Run 终结、迟到响应；每 dispatch 至多一响应及正确原 Run 归属，不虚构处置、不复活 Run。现 Settlement 模型的 unfenced/tail 比较性质继续保留，不用 M08 覆盖它。
5. **恢复先辨活性（状态模型 + 实际 HTTP）**：新消费者进入时原执行仍活，必须 0 新 send、0 reconcile 强停；真正失联才按 opened 恢复。网络/写者未停或未知写未认回时不重发。首 token 后任何恢复分支都无再次发出。
6. **索引与身份（必要时结构模型）**：同 Session 两 Call、不同 Session 同 callId、跨租户拒绝；索引只能是同源事实的投影，来源进度与当前性可核；并发终态写不得被旧活性覆盖。尚未决定存储结构，不能声称已有 Alloy 义务闭合。
7. **实际资源与复杂度证据**：真 Cordis 消费者卸载不取消原执行，提供者实际关闭仍留存未释放 owner；多观察者可撤且有界，不把 logger 吞错当成功；对指定当前值在增长日志上的读取工作量做测量。形式模型不能证明真实 transport/内存资源实际释放或 O(1) I/O。

## 报给主线

- **规范语义差异**：RT10 S5/S7/S36/S61 及基础 realization 对 Agent 宿主的文字必须在后继版本准确取代；只改 demo 或以 execution-owner 代码注释解释不够。已有 close/settlement 不因此重写。
- **公开行为缺口**：RT10 S28/S34 无活性 resolve/在途 reattach；稳定 CallKey 有基础，原 store/日志可复用。服务新增操作与扩展 readAttempts 两候选需主线做九项规格取舍，不能把 13 当硬上限。
- **产品到规格未定项**：PF013 §5.13/PF015 §6.19 的持久 ref、无持有者结果继续记录，遇 open 未持久与 reply_pending 未处置时的精确边界待裁；失联观测权威/期限、跨 Run 观察与控制授权缺具体接口，不发明默认值。
- **条件风险**：opened 原 attempt fence 的后继尝试轨迹需正式验证；最终响应已经 unfenced+tailEquals，不泛化为旧结果不能落账。生产 G28 未闭合，demo 事实只证明有限组合。
- **词条/对象**：UL-runtime-handle 是属性并排除持久身份；“可序列化调用引用”“执行索引”均无独立词条，仅描述现有调用的值/机制投影。未修改词条或对象。对象表没有 UL-runtime-handle 条目是正确状态；UL-model-call 不新增平行执行身份。
- **基线协调**：来源合成提交 690937a4 PF013 rev16 已核存在；本次源码静态证据固定 be316078。HUB 合入后主线须核受影响字节，不把当前临时报告当自动更新视图。
- **历史材料**：节点 README 的最新采用与保留 candidate 段需按日期/精确范围读；不据其旧“未采用”段否定 D107/v19 或 D106/v8。本文不修这些正文。

本读数不接受设计、不证明行为已通过。性质承载四表、需求正当性/成本裁定与正式变更授权由主线处理。
