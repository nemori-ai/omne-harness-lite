## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 6 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# offer-expiry

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.offer-expiry/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/offer-expiry` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**85 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 6 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-22 首稿，设计同日由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径；兑现 `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`（[契约](../../../../spec/data/offer-expiry/v1/contract.md)，状态 `accepted`、已冻结）
- 源码位置：`packages/core/offer-expiry`——**已实现（HUB `c9b5850`）**：`src/{time,offer,validate}.ts`，公开入口 `.`、`./schema`，以及 `./testing`（`testClock`：可控、只前推的 `Clock` 替身，供消费者演练）。归 `core`：它兑现一份 `data.*` 契约，消费者跨两个领域（租户领域的邀请与隶属请求、资产领域的复制通知与分享邀请），[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**。契约拥有的是[一条判定式、两个时刻值、一组派生状态与求值时点](../../../../spec/data/offer-expiry/v1/contract.md#s-1-本契约拥有什么)——没有操作、没有提交点、没有自己的存储。它给消费者三样：`OfferTiming` 的构造与校验（[S-4](../../../../spec/data/offer-expiry/v1/contract.md#s-4-offertiming)／[S-14](../../../../spec/data/offer-expiry/v1/contract.md#s-14-offer_ttl)）、派生状态的纯求值函数（[S-7](../../../../spec/data/offer-expiry/v1/contract.md#s-7-派生状态)／[S-8](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式)／[S-20](../../../../spec/data/offer-expiry/v1/contract.md#s-20-不可用--不存在)）、时间源接口的**形状**（[S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源)）。**求值发生在哪一次提交里（S-10）、存在性读面是谁（S-19）、失败值叫什么（S-13／S-14）——这些都在消费者节点**，本版即 [organization-governance](../../tenancy/organization-governance/README.md)

## 分层状态

- 语义接受范围：`data.offer-expiry` v1 **全部条款**（含其已知缺口作为显式缺口），依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)（产品负责人，2026-09-22）；本节点的设计随同一决定被接受为实现路径。接受不提升下面三层
- 可实施范围：本节点声称兑现的条款逐条见 [design.md「能力到 Cordis 的投影」](design.md#能力到-cordis-的投影)——值与形状（S-4、S-7、S-22）、判定式与求值次序（S-8 的两个方向、S-9 的「读时求值」那一半）、三值存在性与不可用传播（S-20）、`offer_ttl` 的两路校验（S-14），以上**已实现（HUB `c9b5850`）**，导出名逐项见 design 投影表。**不兑现**：S-5 的「同一提交内定死」与 S-10 的「同一提交内重求值」（提交点在消费者）、S-16 的「同源」与 S-17 的五行装配给保证（本节点只定接口形状，选型与兑现归装配）、S-18 后台清理（不在本节点，落点 #9）、S-19 存在性读面（归持有对象的契约）、四条规范场景（消费者跑）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——本契约不建形式工件。证据义务见 [verification.md](verification.md)，包内测试的运行结果登记在那里
- 实际验证：运行 [`2026-09-26-tests-core-foundation`](../../../../record/evidence/2026-09-26-tests-core-foundation/README.md)：产品源码本次未变，HUB `f73078ba` build／typecheck 退出 0、**31/31**。checks 最终 HUB **100/100**、24-rule scan，SC-OE-3 的 Date.now／无参 new Date／performance.now 直接调用反例已检出。纯函数、解析器与规则不替代实际时钟或邀约操作；消费者／装配义务与历史运行见 [verification.md](verification.md#本次追加验证2026-09-26)

- 本轮公开验证：另见 [`2026-09-26-tests-core-public`](../../../../record/evidence/2026-09-26-tests-core-public/README.md)：时刻／ttl／表示形状、严格截止与求值次序两项子场景及状态／Clock／readonly 严格类型组，同一 HUB 外层12/12、零跳过；按本节点 [公开追加验证](verification.md#公开消费者追加验证2026-09-26) 的条款与边界读取。具名类型完整名单与三个 opaque 品牌互赋负例尚待后续实际运行；本轮不提升整体完成或最终接受。

## 按当前问题展开

| 当前问题                                                     | 阅读入口                            |
| ------------------------------------------------------------ | ----------------------------------- |
| 公开面是什么、判定函数怎么拿输入、时间源与存在性读面怎么进来 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持                                       | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 实际跑过什么、还缺什么                                       | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

2026-09-25增量：D042/D043范围内的新版本局部实现及测试见[证据](../../../../record/evidence/2026-09-25-tests-governance-participation/README.md)。旧bindings不整批升级；新entry/host组合未验，不声明生产开闸。
