## v3 增量候选（2026-09-27）

- kind：`provider`，节点和源码路径均为 `packages/core/model-profile`；现有包已实现 v2，本次不是新建包。
- 对象与设计修订：[`v3-design.md`](v3-design.md) 候选，消费 `(omne-harness-lite-design-2026-09-15, data.model-profile, 3)`；[catalog](../../../../registry/catalog.json) 当前登记 `candidate`。既有已接受 [design.md](design.md) 保持 v2 范围。
- 共同分工：纯类型、固定 Schema、表示判断与引用匹配；目录拥有历史配置判重，runtime/transport 拥有注册可用性、调用快照冻结与在途资源。

### v3 分层状态

| 层次 | 当前事实 |
| --- | --- |
| 语义接受 | **无本版接受**。v2 的接受和 core 阶段签收不传递给 v3；本稿待主线独立评审 |
| 可实施范围 | 候选投影 MP3-1～MP3-7 已给出，实施须以精确契约及本节点接受为前提。v3 尚未实现；root/schema 切换需与旧消费者显式采用 v2 端口同步 |
| 绑定与证据 | 当前共 1 条绑定，仍只支持 v2 S-16；**v3 新增绑定 0 条**。本版纯值与制品义务 V3-1～V3-7、外部 owner 义务另列，不复用旧证据提升状态 |
| 实际验证 | **尚无本版产品实现验收**。已有 v3 的 321 项 Schema 自检，仅支持候选 Schema 的列举输入；完整 judge、严格 JSON 接收、双版制品与真实调用不在其内 |

本版阅读入口：[增量投影与取舍](v3-design.md)、[v3 验证义务及缺口](verification.md#v3-候选的证据义务)、[精确版本绑定](bindings.yaml)。MP3-G1～G4 的 owner 与受阻消费者见增量设计。以下 2026-09-26 的接受和运行记录仍属于 v2。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 12 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# model-profile

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.model-profile/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/model-profile` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**185 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 12 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码 `cd67215b`），2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.model-profile · v2`（[契约](../../../../spec/data/model-profile/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/model-profile`——**已实现（`cd67215b`、HUB `735ee728`）**：公开 `.` 与 `./schema`，judge、refMatches、parameterNames与固定Schema校验面。归 `core`：它是 `data.*`，被 `model`（档案目录、模型请求运行时）、`tools`（拓展件的 `select_model`）、`agent-loop`、`assets`（档案目录的设置取值）消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点；表示层校验明写是「一次纯计算」（[S-24](../../../../spec/data/model-profile/v2/contract.md#s-24-表示层校验是一次纯计算)）。它提供档案、引用、参数词表、快照与建档内容的类型，表示层校验，以及引用的精确匹配。**建档、撞名判定、按层覆盖、在册状态的转移都不在这里**，归模型档案目录

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：已实现 S-1～S-2、S-4～S-9、S-12～S-20、S-24～S-28 的形状、词表、引用匹配与表示层面；数值采用content-blocks JsonNumber，原值精确核界。custom引用的scope由目录显式交入，快照不属于四种judge文档。**不兑现**：S-3撞名、S-10在册转移、S-11更新行为、S-21三种处置、S-22外部写入纪律与S-27原样复制。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的formal task。证据义务见 [verification.md](verification.md)，本模块范围的实际结果已登记，目录与runtime责任另列
- 实际验证：[`2026-09-26-tests-core-values`](../../../../record/evidence/2026-09-26-tests-core-values/README.md)：作者与HUB包build/typecheck/test均退出0，**185/185**、零跳过，含155冻结fixture与固定seed有界数字oracle。HUB另以公开dist消费声明／runtime、真实24规则扫描通过。首次作者环境smoke不是冻结基线验收；消费者、目录与真正模型请求责任保持在各owner，不表示用户最终接受

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、公开面是什么、引用怎样匹配       | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
