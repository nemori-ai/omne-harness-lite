## 2026-09-30 源码依赖对账（A1 core 集成后）

AR2 Schema 精确引用 CA2，依赖见 [design.md](design.md)「依赖、作用域与绑定」的 `data.call-accounts` v2 行。A1 把 call-accounts 根换为 CA4 后，本包从 owner 保留的 `@omne-harness-lite/call-accounts/schema/v2` 取 CA2 原字节，依据 [call-accounts v3-design](../call-accounts/v3-design.md)「本包 Schema 与元数据」行与迁移表 `arrival-events/src/schema.ts` 行（D-110 采用）；AR2 不因 CA4 自动升级（[call-accounts v4 ACK 映射](../call-accounts/v4-acknowledgement-design.md)迁移段）。包依赖边不变，`core-pure-imports` 表随此对齐；新增 binding 0。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 10 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# arrival-events

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.arrival-events/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/arrival-events` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**673 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 7 项 core-local、3 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前源码与验证（2026-09-26）

明确保留 `data.arrival-events · v2`，源码 `packages/core/arrival-events` 已实现；其冻结Schema仍指向完整旧2资源，CB3扩展不自动升级本节点语义。表示判断与归约可从公开包独立调用，序列判定仍归Stream Assembly。

主调度在最终六数据源码后实际通过 **673 tests**、严格类型与 **202组对照**，26输入实际进入CB3扩展形状而AR输出不变，见 [当前 core 复验](../../../../record/evidence/2026-09-26-tests-core-current-v3/README.md)。三项真实流组合、逐ID技术接受及用户总体门仍待；生产者节流、封口、宿主路由和持久化不由本包测试证明。

本次局部技术接受：主调度实际接受本节点 **7项 core-local义务**，见 [逐项范围与证据](../../../../record/evidence/2026-09-26-tests-core-current-v3/local-technical-acceptance.json)。最终真实组合、外部宿主义务及用户总体接受不随之提升。

## 原设计记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.arrival-events · v2`（[契约](../../../../spec/data/arrival-events/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/arrival-events`——**尚未建包**。归 `core`：它是 `data.*`，被 `model`（传输适配、模型请求运行时）与 `tools`（发帧入口、工具执行运行时）两侧的生产者与 [stream-assembly](../stream-assembly/README.md) 消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——到达事件不是记录条目（[S-4](../../../../spec/data/arrival-events/v2/contract.md#s-4-到达事件不是记录条目)），契约没有操作与提交点。它提供信封与六种事件的类型、一块的归约、表示层校验（九个拒绝值）。**序列语法的判定与命名归 stream-assembly**（S-24「由消费一方判定并命名」），节流与「封口块等于归约」归生产者

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-4～S-16、S-19 的形状与归约，S-26～S-29 的表示层面。**不兑现**：S-17～S-18、S-21、S-23～S-24 的序列判定（stream-assembly）、S-20 与 S-22 的生产者义务（传输适配与发帧入口）、S-25 左列（宿主）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、要借开块的两项怎样判             | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## 2026-10-03 固定Schema技术采用

[D-116](../../../../record/decisions/fixed-schema-precompile/README.md)与[本节点固定图装配](fixed-schema-precompile-design.md)补充现行设计。只改变固定图编译/装载时机；本机制实施、实际绑定与验证未完成，原契约和历史run的状态不据此改写。
