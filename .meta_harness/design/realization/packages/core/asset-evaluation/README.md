## 2026-09-27 工作区产品修订的影响

当前 AE3 的 C3／PRE-5、readWorkspaceCarrier、S-27／S-28 及兼容 hook 的租户格例外不能直接承载新版工作区输入。需等待相关身份／资产／读入契约接续，再更新本节点与验证。现有显式输入的求值测试不证明双来源选择、真实目录发现或关系授权；既有权限过滤规则继续有效。

[核对依据与消费者边界](../../../../../research/workspace-product-technical-impact/research.md)。本次只更新适用范围与缺口，不改冻结规范、既有采用或历史验证，也不展开 PF-020 技术设计。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 11 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# asset-evaluation

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`capability.asset-evaluation/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/asset-evaluation` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**168 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 10 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `capability.asset-evaluation · v3`，精确 [规范](../../../../spec/capabilities/asset-evaluation/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/asset-evaluation` 已采用3；作者 `211cb4f0` 已集成至 HUB `7ee9bb36`。本节点没有自有Schema，依赖六数据3和明确保留2资源；默认装配为五个真实正文端口。
- 实际验证：[当前源 HUB 复验](../../../../record/evidence/2026-09-26-tests-core-current-v3/README.md) 中 **168 tests**、构建、严格类型、27规则及独立公开消费者通过；实际完整工作区域、整输入指纹和四结果分支有原始记录。Connector正文仍延期、Skill SP3仍待裁决；最终W6两链、逐ID接受和用户总体门仍待。


本次局部技术接受：五项完整core-local与四项明确NonConnector当前部分已由主调度签收，见 [逐项范围](../../../../record/evidence/2026-09-26-tests-core-current-v3/AE-local-technical-acceptance.json)。四项原整条及Connector部分不随之提升，最终五正文W6组合另验。

## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，同日按 [D-060 §八 M31、M32、M41、M45、N-21](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 对齐契约终稿，并单独导出 S-23 的界与挑选；兑现 `omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v2`（[契约](../../../../spec/capabilities/asset-evaluation/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/asset-evaluation`——**尚未建包**。归 `core`：契约是纯计算（[S-11](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-11-纯计算)），被 `assets`（资产治理的设置视图）、`tools`（注册表、MCP 桥）、`agent-loop`（拓展件派发）与据点装配消费（[D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md) 接受 assets 候选 B：「资产模型与求值进 `core` 作数据契约与纯计算」）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——两个操作都是输入的函数，不读存储、时钟、文件与进程状态，没有在途工作（[S-11](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-11-纯计算)、[S-30](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-30-本能力没有在途工作)）。**组输入**（一致读、分享此刻成立、调用方已核实、清单就是目录里那份）是前提 PRE-1～PRE-9，归组输入的一方，不在本节点。除两个操作外，另导出 S-23「界与挑选」的三个纯函数，供资产治理的写时守卫用，与 `evaluate` 第 4 步共用同一实现

## 分层状态

**本轮交付边界（2026-09-26，用户进一步明确仅 Connector 一种资产纵线延期）**：其他资产类型的 `evaluate`、`readWorkspaceCarrier`、权限构件与整输入指纹完整实施、交付和验收；只延期 Connector 正文及其相关纵线。当前默认装配不提供 Connector，不用替身宣称六真实正文齐全；五个已提供正文的完整 AM／AE 组合继续。此前整份 AE 两操作延期的口径已作废；技术可用性投影经独立架构复审细化，原冻结领域规则与完整设计接受事实不改。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-5～S-28、S-38～S-42 的求值与读入规则（四步、两轮、三条层序、组合根引用集、输入一致性 C1～C14、三个失败值 `invalidInput` → `compositionCycle` → `categoryUnsupported` 与判出结果分开、清单读入与留痕），以及规范场景 S-33～S-37、S-41、S-43、S-44 的实现侧。本版组合里有 plugin 或 sub-agent 的 agent 按契约以 `categoryUnsupported` 失败（[G-3、G-21](../../../../spec/capabilities/asset-evaluation/v2/contract.md#十一已知缺口) 的范围），不是本节点的缺口。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task（`Evaluation.als` 是 Alloy 模型，不是 formal task，不可绑定）；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、正文规则从哪来、哪里兑现不了     | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
