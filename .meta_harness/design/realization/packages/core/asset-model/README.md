## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 17 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# asset-model

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.asset-model/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/asset-model` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**422 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 11 项 core-local、6 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `data.asset-model · v3`，精确 [规范](../../../../spec/data/asset-model/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/asset-model` 已完整采用3；作者 `29abb185` 的末段交付已集成至 HUB `fad84ef3`。默认3及完整原字节 `schema/v2` 均保留；实际 AM 固定图和保留2消费者闭包已通过。
- 实际验证：[当前源 HUB 复验](../../../../record/evidence/2026-09-26-tests-core-current-v3/README.md) 中本包 **422 tests**、构建、严格类型与公开消费者通过，六包合计2410；原2证据保留原坐标。W6最终两真实链、逐ID技术接受及用户总体接受仍待，不从局部通过推到外部责任。


## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，同日按 [D-060 §八 M36、M41、M44](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 对齐；兑现 `omne-harness-lite-design-2026-09-15 · data.asset-model · v2`（[契约](../../../../spec/data/asset-model/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/asset-model`——**尚未建包**。归 `core`：它是 `data.*`，中心的资产治理与据点的装配、注册表两侧都 import（[D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md) 接受 assets 候选 B：「资产模型与求值进 `core` 作数据契约与纯计算」）。包依赖只有 identity-values、offer-expiry、[content-blocks](../content-blocks/README.md)；六份正文契约的判定经端口注入，不 import 正文包
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约写明它[没有操作、没有提交点、没有状态转移，因此不需要插件](../../../../spec/data/asset-model/v2/contract.md#这份契约拥有什么)。它提供资产领域全部静态形状的类型、表示层校验（十个拒绝值加嵌着的正文契约的值，固定次序）、能力标识的规范串、保留的两条属性声明、工作区提供的资产的记录号导法。**标识唯一、所有者至多变一次、版本线只增、一格一份持有这些行为约束不在这里**，归资产治理的写路径与存储

## 分层状态

**本轮组合范围修订（2026-09-26，用户进一步明确仅 Connector 资产纵线延期）**：本包公开端口、类别联合、通用护栏及其他五个真实正文的 AM／AE 组合完整交付；仅 Connector 那一类正文／相关纵线与六真实正文齐全的断言延期。不用 Connector 替身签收；已存在的类别类型不是其实现完成。冻结规格与原接受事实不改，技术可用性投影另经独立架构复审细化。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-28、S-36 的**形状、词法、相等、规范串、保留声明、表示层拒绝与次序、接收边界上能判的跨成员约束**，以及 S-4 例外支（工作区提供的资产的记录号导法，契约交给实现）与 S-17 的目录规范化（契约交给实现）。**不兑现**：S-4／S-22／S-23 的「部署内唯一、不回收」、S-7 第 1～3 条、S-9「已发布不变」、S-18 的键唯一——它们归写路径与存储（资产治理）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在，没有测试。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                       | 阅读入口                            |
| ---------------------------------------------- | ----------------------------------- |
| 怎样实现、公开面是什么、怎样不 import 正文契约 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么             | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                     | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
