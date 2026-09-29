## v6 当前格式迁移候选（2026-09-28）

2026-09-28：[D-100](../../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 采用 [v6-design.md](v6-design.md) 的当前迁移范围；绑定不新增，实际组合验证待实施。

- 语义接受：**本版无**；目标 MS6/MP5 尚待候选发布、catalog 登记和主线采用。D-099 已接受的是 MS5/MP4，不能替代本版接受。
- 可实施：候选明确 root/schema 单一当前格式、完整限制快照、精确七资源闭包和当前消费者迁移；不保留旧 messages 运行入口。契约最终资源与消费者精确采用未闭合前，不提升为可正式施工。
- 绑定证据：本版 **0 条**；`bindings.yaml` 的历史 v3 单条保持原范围。
- 实际验证：**本版尚无实现验证**；本次只有窄迁移设计与结构检查，旧测试不重标。

入口：[v6 候选设计](v6-design.md) · [六项验收与受阻消费者](verification.md#v6-当前格式迁移候选义务)。以下旧段落按各自版本和日期读取；v4 的保留旧入口方向不再是本轮候选方案。

## v4 候选增量（2026-09-27）

- kind：`provider`

节点及源码位置仍为 `packages/core/messages`，已有 v3 源码。本次是[独立的 v4 增量设计](v4-design.md)，不覆盖已接受的 [design.md](design.md)。
- 语义接受：**本版无**。`data.messages/v4`、`data.model-profile/v3` 已登记为 candidate；旧2/3的接受和执行保留原坐标，不提升为4。
- 可实施：候选给出 S-37/S-39/S-49 的新固定 Schema 图、完整无损绑定比较与模型 ID 对齐；保留3纯值面及2/3 Schema的闭包要求见设计 M4-P7。接受后才能实施；旧档案2端口和实际消费者接线仍待，见 M4-G2；未来2消费者的采用责任另列 M4-G3，不新增 messages2 judge。
- 绑定与证据：本版 **0 条绑定**；历史 v3 的 **1 条**保留原适用范围。规格探针不是本节点源码证据，Alloy 未登记为可绑定任务。
- 实际验证：**本版实现尚无**。既有 v3 已实施；本次只形成待独立评审的节点稿。v4 验收与外部 runtime/日志演练未完成。

本版入口：[实现增量](v4-design.md) · [验证义务与缺口](verification.md#v4-候选证据义务) · [绑定](bindings.yaml)。以下各段均保留其日期与精确版本，不能据旧签收判断 v4 已交付。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 17 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# messages

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.messages/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/messages` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**473 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 15 项 core-local、2 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `data.messages · v3`，精确 [规范](../../../../spec/data/messages/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/messages` 已完整采用3；作者 `29abb185` 的末段交付已集成至 HUB `fad84ef3`。默认3及完整原字节 `schema/v2` 均保留；实际 AM 固定图和保留2消费者闭包已通过。
- 实际验证：[当前源 HUB 复验](../../../../record/evidence/2026-09-26-tests-core-current-v3/README.md) 中本包 **473 tests**、构建、严格类型与公开消费者通过，六包合计2410；原2证据保留原坐标。W6最终两真实链、逐ID技术接受及用户总体接受仍待，不从局部通过推到外部责任。


## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.messages · v2`（[契约](../../../../spec/data/messages/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/messages`——**尚未建包**。归 `core`：它是 `data.*`，被 `model`、`tools`、`agent-loop` 与连接件消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作、提交点与状态转移。它提供七种消息与五种运行时记录的类型、两段式表示层校验、「此刻模型可读」与「合法名单」「配对与唯一」三项纯判定。**铸 `MessageId`、追加与去重、翻译出门都不在这里**，归会话日志的写入方与模型请求运行时

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-40、S-49、S-50 的形状与判定面（S-28 此刻模型可读、S-29 合法名单、S-32 配对与唯一的判定、S-37～S-40 两段式拒绝值）。**不兑现**：S-3 的铸号与唯一、S-32 的追加与幂等、S-34～S-36 的翻译（归写入方与传输适配）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task（Alloy 模型 `Readable.als` 不是 formal task，不可绑定）；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、三项判定要调用方给什么           | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
