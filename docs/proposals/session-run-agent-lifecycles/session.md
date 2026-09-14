# Session：能力权威、流模型、宿主服务与恢复顺序

[提案索引](README.md) · [状态机与级联](lifecycles.md) · [Run](run.md) · [实例](agent.md) · [Cordis 视角](cordis.md)

本文件是 `capability.session` v1 的候选来源，也是 `packages/session/session`、
`persistence`、`projection` 三份提供者设计修订的输入。语义不重新建模：全部条款
来自已接受的 [session-run v2](../../../spec/capabilities/session-run/v2/contract.md)，
本文件只做三件事：逐句归属（哪些进 Session、哪些进 Run、哪些进组合契约）、
把 Session 提供者必须回答的流模型与宿主服务定下来、把恢复顺序按 v2 重排。

## 1. 目的与消费者

Session 是长期会话的权威：身份、生命周期、历史水位、输入队列、到达账本（Inbound）、
context 水位、状态贡献注册，以及"该 Session 下一步该开哪个 Run"的调度。消费者有四类：
用户与应用（目录、队列、控制入口）、Run 能力（取批建 Run、终态时的接续处理）、
驱动器（读 classified arrival 与水位、注册驱动位置投影）、外部来源（工具结算、人类
答复、连接器、日程、跨会话消息经 Inbound 受理）。Session 不拥有 Run 的状态机、epoch
与控制，也不拥有实例。

## 2. 条款逐句归属

评审 r1 发现 4 要求逐句归属。下表把 session-run v2 的每条拆到 `capability.session` v1
（SE）、`capability.run` v1（RN）或生命周期组合契约（LC，见
[lifecycles.md](lifecycles.md#级联矩阵)）。"原文"指条款正文照搬，只改编号与引用。

| [session-run v2](../../../spec/capabilities/session-run/v2/contract.md) 条款 | 归属 | 说明 |
|---|---|---|
| SR-01 Session 身份、create、list | SE-01 | 原文 |
| SR-02 生命周期、归档/删除 | SE-02 + LC 行 1 | 生命周期转移、busy 规则、队列项结算原因归 SE；"仍有非终态 Run 则 busy"的判定在组合门内读 Run 的当前状态；"归档与队列项/arrival 关闭同一提交"是 LC 声明的同提交行 |
| SR-03 历史与投影 | SE-03 | 原文 |
| SR-04 队列项、trigger 项、容量、到达行为、撤回 | SE-04 | 原文；trigger 项来源引用 SE-13 |
| SR-05 edit/reorder/withdraw | SE-05 | 原文 |
| SR-06 takeBatch / takeTrigger | SE-06 + LC 行 3 | 固定批次、门条件（队列非 hold、Session open、权限与定义可用、trigger 来源仍有效）、operationId 派生归 SE；"不存在活动驱动占位"读 LC 的占位派生；"取项与 Run 建立、占位、epoch 同一提交"是 LC 行 |
| SR-07 有序命令 | SE-07 + RN-06 | 声明的位置、让行、清除时点、takeCommand 领取与命令执行身份归 SE；命令 Run 的 basis、终态映射（success → completed 等）与控制语义（interrupt → not_applicable）归 RN |
| SR-08 Run、状态、占位、epoch、Step、驱动位置 | RN-01 + LC | Run 记录、状态集合、epoch、Step、驱动位置投影、模型固定归 RN；"占位由 (SessionRef, RunRef) 精确持有""退役只封闭 epoch 不释放占位""能与占位并存的只有 interrupted"归 LC 的关系定义 |
| SR-09 取得下一 Step、完成条件 | RN-02 | 原文；"就绪接续只由 Inbound 已裁决的 arrival 定义"改为引用 SE-13 |
| SR-10 控制请求、interrupt/resume/cancel | RN-03 | 原文 |
| SR-11 interrupt_then_run | SE-08 + RN-04 | 新 input、当时精确 Run、复合意图先耐久，新输入按队列顺序处理归 SE；旧 Run 的处置表、interrupted + supersededByInput、显式 resume 的相容判断归 RN |
| SR-12 force_stop | RN-05 + SE-09 | 撤销 epoch、stopping、隔离证明、晚到结算作隔离证据归 RN；"Session 范围强停将队列置 hold、continueQueue 只解除 hold"归 SE |
| SR-13 状态贡献 | SE-10 + RN-07 | 注册、authoritative/projection 规则、Inbound 为 authoritative 贡献、context 水位归 SE；"驱动位置由 run-driver 以 projection 贡献注册、由 Run 事实 fold"归 RN |
| SR-14 恢复 | SE-11 + RN-08 | 恢复顺序、Session 级裁决先行与启动扫描、历史读可用性归 SE；恢复兼容证据、unknown 处理、不复活、writer/Run 旧 epoch 失效归 RN |
| SR-15 到达账本与裁决者 | SE-12 | 原文 |
| SR-16 四种意图与来源枚举 | SE-13 | 原文 |
| SR-17 裁决决定表 | SE-14 + LC | 决定表与判定对象归 SE；"裁决与目标 Run 的终态转移在同一协调域全序"是 LC 声明的同域关系 |
| SR-18 队列消费与调度 | SE-15 | 原文；"重取从 (RunRef, 封闭的 epoch) 派生"与 RN-08 交叉引用 |
| SR-19 context 水位与有界 | SE-16 | 原文 |
| SR-20 Run 结算与接续处理 | SE-17 + LC 行 3 | 转为 trigger 记 converted、cancelled/级联关闭则 closed、结算后到达者按 C/D1/D2 列归 SE；"在同一提交"是 LC 行 |
| SR-21 受理与裁决两次提交 | SE-18 | 原文 |
| 末段"本版不承诺" | SE、RN 各自保留 | 通知命名空间、PF-004 协议、多进程活性 |

拆分后 SE 与 RN 互相只以条款引用，不复制对方正文；两者都以规范依赖引用 LC。

## 3. 流模型与持久格式

Session 提供者拥有三条 tenant-scoped stream：`session(S)`（目录、生命周期、hold、状态
贡献注册）、`queue(S)`（队列项内容、修订、顺序、取用）、`inbound(S)`（arrival 的受理、
裁决、消费、context 水位；用户裁决 U-22）。Run 提供者拥有 `run(R)`。四条流在首版位于
同一协调域（[CC-01](../../../spec/compositions/core-work-coordination/v1/contract.md)），
一个 batch 每条流一条 append。

持久格式语言无关、存储后端无关（U-21）：流身份、envelope 内容与事件词汇定义在
[DR-01](../../../spec/capabilities/durable-records/v1/contract.md) 的记录模型层；JSONL 布局
是 [DR-04](../../../spec/capabilities/durable-records/v1/contract.md) 的一个提供者，在 DSH
`c291e796` 的 session v3 JSONL 与 `session-persistence-jsonl` 切片上二次开发（来源见
[fork 切片](../core-capabilities/fork/jsonl-source.md)）。将来接 SQL 只需新的 DR-04
对应条款，Session 设计不变。envelope 与事件数据的 JSON Schema 记为未完成义务。

## 4. 事件词汇 v2（候选）

事件词汇属于提供者设计，最终形状在 `packages/session/session/design.md` 固定；这里给
候选清单以核对覆盖，每项标出它兑现的条款。kind 前缀 `session.`，version 字符串 `"1"`。

| 流 | 事件 | 兑现 |
|---|---|---|
| session | `created`、`lifecycle_changed{to: archived / open / deleted, reason}`、`renamed`、`pinned`、`model_choice_set` | SE-01、SE-02、PF-023 的 Session 选择 |
| session | `hold_set` / `holds_released` | SE-09 |
| session | `contribution_registered` / `contribution_withdrawn{stateKey, kind, version}` | SE-10 |
| queue | `input_enqueued{kind: text / command / trigger, arrival?}`、`input_edited`、`queue_reordered`、`input_withdrawn`、`items_taken{kind, items, run, operation}`、`item_closed{reason}` | SE-04～07；`items_taken` 是 LC 行 3 同提交中队列侧的记录 |
| inbound | `arrival_accepted{arrivalId, source, dedupKey, payloadRef, refs, policy}`、`arrival_classified{intent, observedRun}`、`arrival_consumed{by}`、`arrival_converted{item}`、`arrival_closed{reason}`、`arrival_withdrawn` | SE-12～14、SE-17 |
| inbound | `context_watermark_advanced{watermark, lowerBound}`、`arrival_refused{reason: refused_capacity}` | SE-16 |

去掉的词汇：`driver_reserved` / `driver_released` / `epoch_parked`（占位改为派生，用户裁决
U-23 与作者裁决 A-13）、`checkpoint_saved`（U-23）、`call_proposed` / `call_linked` /
`result_linked` / `continuation_*`（接续改由 arrival 承载，调用绑定归 Run 流）。原
design.md 的 `step_*`、`driver_claimed` 等 Run 流事件迁到 [run.md](run.md#6-事件词汇-v2候选)。

## 5. 宿主服务：裁决者、调度者与组合者

三者都是 session-run 提供者的宿主级服务，不随实例生灭，按用户裁决 U-18 各自成插件，
包归属仍是 `packages/session/session`（同包内独立插件，不改 D-013 的归属）。

- **裁决者**（`omneInboundAdjudicator`）：消费 accepted 的 arrival，在一次短提交内按
  裁决时刻的 Run 状态判意图并写 `arrival_classified`。它写 `inbound(S)`，读 Run 的当前
  状态戳（Run 插件的 check 端口），因此是形状 2 的组合者之一：裁决与 Run 终态在同域
  全序由 LC 声明。启动时扫描全部 Session（SE-18），扫描完成是调度者重取的前提。
- **调度者**（`omneSessionScheduler`）：响应事实广播中的铃（队列变化、Run 终态、hold
  解除、arrival 判为接续或审批就绪、epoch 封闭、门恢复、resume），对该 Session 判断：
  无占位且队首合格 → 取批/取命令/取 trigger；占位在、执行者空且有可干的事 → 重取；
  否则不动。先查该 Session 是否有 ready 实例，有则直接交 Run，无则经 `agents.activate`。
  不轮询；开机全扫与裁决扫描同一趟，且在所有裁决完成后才开始重取（评审 r1 发现 7）。
- **组合者**（`omneLifecycleCompositions`）：LC 声明的每一条形状 2 的行对应一个具名
  组合：`take_batch` / `take_command` / `take_trigger`（队列侧取用 + Run 建立 + epoch 发行）、
  `run_settle`（Run 终态 + arrival 转换/关闭）、`session_archive` / `session_delete`（生命周期
  转移 + 队列与 arrival 关闭 + 前提读 Run）、`session_force_stop`（hold + Run 控制受理 +
  epoch 撤销）、`interrupt_then_run_accept`（新 input + 复合意图）。每个组合注入双方的
  prepare/check 端口，一次 batch 提交；Session 插件与 Run 插件互不 required inject。

## 6. checkpoint 的处置

原 design.md 里 `checkpoint_saved` 是 run 流的权威事件，记录驱动器的具名安全位置并推进
phase。v2 的 [SR-08](../../../spec/capabilities/session-run/v2/contract.md) 把驱动位置定为
projection、恢复重算，run-driver 的 decide 是已提交事实的纯函数，位置可推导，因此
`checkpoint_saved` 成了第二份位置事实。用户裁决 U-23：取消其 authoritative 地位，phase
由 fold 得到；保留 DSH 式的投影 checkpoint（fold 状态 + watermark 的加速缓存，绑定
stateKey、版本、SessionRef、水位，越界即弃用重建）作为可选项，归 projection 包。两者
在提供者设计中分别命名为"驱动位置投影"与"投影缓存"，不再共用 checkpoint 一词。

## 7. 恢复顺序（persistence 设计的输入）

按 SE-11 与 [RN-08](run.md)、[RD-04](../../../spec/capabilities/run-driver/v1/contract.md) 重排：

1. records 提供者持锁扫描并重新同步有效前缀（DR-03/04）；
2. 全部 owner 的 decoder 与 fold 在同一水位装载：Session 三条流、Run 流、TL/HD/MC 各自流；
3. Session 校验同批关系、未知事件、状态贡献版本、定义/配置与环境能力（SE-11）；
4. 裁决者扫描全部 Session，把 accepted 而未 classified 的 arrival 在当前 Run 状态下裁决完
   （SE-18）；
5. 投影重建：驱动位置投影从 Run 事实 fold，投影缓存可用则加速；
6. TL/HD/MC 各 owner 核实在途 call/request/attempt 与停止账本（RN-08、CC-06）；
7. 当前身份、TG、AU 与对象资格重新取得；
8. 调度者对每个 Session 判断：占位 Run 执行者为空且有可干的事 → 经 AR 激活并以新 epoch
   重取（RN-08 的兼容证据在此核对）；无占位且队首合格 → 开新 Run；
9. 耐久后才继续；历史读面可在第 3 步后带水位开放。

第 4 步在第 8 步之前是硬顺序，由调度者插件负责（评审 r1 发现 7）。

## 8. 未决与未完成义务

- 事件词汇的精确 shape、`arrival` 的 payloadRef 形状与 refs 的编码归提供者设计。
- 归档后后台调用的存续政策留待工具设计（U-26）。
- 通知命名空间（U-5）由 [cordis.md](cordis.md#3-事实即事件的广播机制) 的广播机制部分闭合，
  作用域过滤的实现仍待验收。
- envelope 与事件数据的 JSON Schema 为未完成义务。
