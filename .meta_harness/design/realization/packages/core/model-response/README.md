## 2026-09-29 MR10 原响应证据与耐久未处分候选

- **语义接受**：MR10／MS7／CA3／RT11 均为 candidate；此前 MR9 接受及实际证据保持原范围。
- **可实施**：[v10-reference-result-design.md](v10-reference-result-design.md) 起草当前资源图、共享 `judgeResponseFinalization`、原回复和首次消息派生的分工；未技术采用，不释放新增实现。
- **绑定证据**：新增 0，旧 bindings 不变；[R10 验证义务](verification.md#mr10-原响应与未处分内容候选义务) 待执行。
- **实际验证**：本增量未实现、未验。候选 Schema／TLA 只支持各自有限检查，不能证明真实内容来源、原子批、转换与消息写权。

2026-09-29：[D-107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md) 已接受 MR9/RT10，并采用本节点 v9 纯值映射 R9-P1～P5。新增绑定 0；实际实施与 V9 验收待完成。受审正文保持原字节，以下候选标记按起草日期读取。

## MR9 输入校准值映射候选（2026-09-29）

- 入口：[v9-usage-calibration-design.md](v9-usage-calibration-design.md)，revision 1；节点及源码路径仍为 `packages/core/model-response`，纯共享值包，无 plugin/fiber/service。
- **语义接受：无。**catalog 中 MR9/RT10 均 candidate。**可实施：候选 R9-P1～P5** 明确六个共享 readonly 类型、required inputCalibration、局部自有快照、完整 judge 关系与当前格式直接迁移；须经接受后实施。
- **绑定证据：新增 0 条。**既有 bindings 不改；规格有限结果不冒充生产来源证明。**实际验证：本增量尚无产品执行。**[V9 验收与缺口](verification.md#mr9-输入校准值映射候选)明确正反例、公开制品和双语 README 义务。
- MR9 S-45 原批/授权/恢复由 runtime 和日志写方兑现；S-41～S-44 真实投影、观察与 φ 依据归适配提供者，G-16/G-17 保留。当前 Schema/完整关系通过均不能证明这些外部事实。以下历史状态只在其原日期、版本及采用范围内读取。

2026-09-28：[D-105](../../../../record/decisions/model-recovery-timing-provider-adoption/decision.md) 技术采用 [v8 实施映射](v8-design.md)。精确受审正文保留候选标记，以采用记录判当前状态；新增绑定0，V8实际实现验证待完成。

## MR8 恢复时序实施候选（2026-09-28）

- 入口：[v8-design.md](v8-design.md)。纯包根/schema 从 MR7 直接迁移 MR8，Timing.sentAt 允许显式 null，但仅合法 interrupted 持久响应能使用；Pending 仍必须为实际时刻。
- **语义接受**：MR8/RT9 已由 [D104](../../../../record/decisions/model-recovery-timing-adoption/decision.md) 接受。**可实施**：本次窄提供者映射仍为 candidate，未声称采用。
- **绑定证据**：新增 0 条。**实际验证**：本次没有产品测试；已归档 10 Schema 边界与一正四负 TLC 只支持原有限规格范围。
- 消费者编译、拒绝优先级、精确依赖与外部写方责任见 [V8 验收](verification.md#v8-恢复时序实施候选)。null 不证明未发、零费用或可重试；原来源未裁项不由本增量处置。以下历史事件保留原范围。

## 当前格式直接迁移候选（2026-09-28）

2026-09-28：[D-100](../../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 采用 [v7-design.md](v7-design.md) 的当前迁移范围；绑定不新增，实际组合验证待实施。

- 入口：[v7-design.md](v7-design.md)。节点路径仍为 `packages/core/model-response`，沿纯模块边界，根/schema 只提供当前格式；拟删除旧响应版本入口，所有当前消费者一起迁移。
- **语义接受**：MR6/MS5/LC5 与 MP4 的旧基线已接受；MR7/MS6/LC6/MP5 后继候选尚未在本节点基线登记/接受。旧 MR6 S-40 的读取结算义务与新的无兼容要求，须由后继接受解决，本映射不改写冻结契约。
- **可实施**：候选 R7-P1～P6 已列窄施工路径、实际消费者与 Pending/失败主体边界；目标采用门及 Schema 闭包缺口见 G7-1/2，未接受本投影。
- **绑定证据**：本次新增 0 条，原 bindings 保留原坐标。**实际验证**：本次尚无当前格式产品运行；旧 MR5 通过记录不是新根通过记录。
- 验收与外部 owner：[v7 候选义务](verification.md#v7-当前格式直接迁移候选)。以下保留历史采用事件，其中旧入口共存安排不作为本次候选实施目标。

## MR5 纯值实施签收（2026-09-27）

- 2026-09-27 后续有限实施签收：MR5 显式公开面已由 `9512c80b` 并入 HUB `62da5a5f`；本包 PV1～PV9 的有限纯值实施已技术接受，独立原判定 Pass with issues 的双语导航文字随后更正，代码块未变。[实际运行、原失败、制品和范围](../../../../record/evidence/2026-09-27-tests-model-response-v5-core/README.md)保全 317 成员；MR4/v3/旧 Schema 保留。此更新替代下方起草时“没有新增 v5 源码/待验”的当前口径，不改历史事件和外部写方缺口；不新增绑定或升级其他消费者。

## 当前采用与可实施范围（2026-09-27，D-090）

- 语义接受：MR5／RT5 已由 [D-090](../../../../record/decisions/model-headers-v5-adoption/decision.md) 精确接受；本节点 [v5-design rev1](v5-design.md) 同步技术采用。
- 可实施：新增显式 `./v5`、`./schema/v5`；当前根／schema 的 MR4 和保留的 v3／schema-v2 不自动升级。D-078 承接的 v4 采用继续有效，下方候选状态按原日期读取。
- 绑定与证据：本次新增0；v5 PV1～9 尚待，原证据保持原坐标与前提。
- 实际验证：本次没有新增 v5 源码或产品执行，不从采用推断通过。

以下为原版本的历史事件；本节取代其“当前未接受／未实现”的导航口径，不改写历史验证范围。

## v4 候选增量（2026-09-27）

- kind：`provider`

节点与源码路径均为 `packages/core/model-response`。
- 设计入口：[v4-design.md](v4-design.md)。本版从现有 v3 纯模块演进；下方既有接受和验证记录保留原版本范围，原 [design.md](design.md) 不改写。
- 输入：`data.model-response/v4`，同批 `data.model-profile/v3`、`data.messages/v4`；精确依赖和输入哈希见新设计。

### v4 分层状态

- **语义接受：无。**三份增量契约在 catalog 中均为 candidate；v3 的接受不自动覆盖 v4。
- **可实施范围：候选映射已写明，生产实施受语义接受门约束。**MR4-P1～P6 为纯值责任，MR4-P7 的历史与上游事实归真实 runtime/transport。候选默认根/schema 采用 v4；现有 v3 纯值面保留到候选 `./v3`，v2 仅保留已有 `./schema/v2` 完整闭包，不新设 v2 判定 API；本版源码尚未实现。
- **绑定与证据：v4 为 0 条；既有 v3 绑定 1 条按原范围保留。**候选 Schema/精确值脚本是规格证据，未登记为生产实现绑定。新义务见 [verification.md](verification.md#v4-候选证据义务)。
- **实际验证：尚无 v4 生产实现验证。**已归档规格检查覆盖 58 个完整实例、12 个绑定判定及 5 个精确值变异；只说明其输入快照中的有限样本。旧 v3 回归不换标签。

### v4 阅读入口

| 问题 | 入口 |
|---|---|
| 纯值实现、精确版本闭包、失败次序及无装卸责任 | [候选实现设计](v4-design.md) |
| 哪条承诺已有具名证据 | [绑定表](bindings.yaml) |
| 新增反例、外部 owner、受阻消费者 | [验证与缺口](verification.md#v4-覆盖缺口与外部-owner) |

以下是已发生的 v3/core 阶段记录，不作为 v4 接受或验证依据。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 6 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# model-response

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.model-response/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/model-response` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**242 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 5 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `data.model-response · v3`，精确 [规范](../../../../spec/data/model-response/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/model-response` 已完整采用3；作者 `29abb185` 的末段交付已集成至 HUB `fad84ef3`。默认3及完整原字节 `schema/v2` 均保留；实际 AM 固定图和保留2消费者闭包已通过。
- 实际验证：[当前源 HUB 复验](../../../../record/evidence/2026-09-26-tests-core-current-v3/README.md) 中本包 **242 tests**、构建、严格类型与公开消费者通过，六包合计2410；原2证据保留原坐标。W6最终两真实链、逐ID技术接受及用户总体接受仍待，不从局部通过推到外部责任。


## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.model-response · v2`（[契约](../../../../spec/data/model-response/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/model-response`——**尚未建包**。归 `core`：它是 `data.*`，被模型请求运行时（写）与读响应体的各方（账、日志读面）消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点。它提供响应体的类型（`ResponseId` 的家）、表示层校验，以及几处副本定义的对齐测试。**写响应体、发号、脱敏、首 token 的断言、`late` 的判定都不在这里**，归模型请求运行时

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-4～S-15、S-17～S-19、S-35 的形状与 S-26～S-28 的表示层面。**不兑现**：S-16、S-20～S-24 的写入纪律（模型请求运行时）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、公开面是什么、副本定义谁来对齐   | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
