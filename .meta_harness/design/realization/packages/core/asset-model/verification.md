## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 17 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
新原始运行与逐项签收记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# asset-model 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.asset-model/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/asset-model` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**422 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。原始执行、制品与范围。
- 逐项技术接受：本节点 11 项 core-local、6 项 core-composition 的本阶段责任已经主调度接受；精确 ID、坐标和前提。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/asset-model/verification.md`](../../../../spec/data/asset-model/verification.md#证据义务)（V-1～V-7、SC-1～SC-6）。
本页只登记**落在本节点上的那一部分**；写路径、存储与读面上的义务归资产治理节点。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～14 节逐行（含变体行）过包内校验，比对「Schema」一列；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内可复跑测试核对本行观察；单次输入与结果留本工作树 tmp |
| V-2 拒绝值的具名与次序 | 每个拒绝行，`judgeAssetValue` 给出的值与「拒绝值」一列逐字相同；第 13 节十四行专验次序；嵌着的正文值原名进次序 | 未开始；嵌着的那一半要六个正文包的端口实现 | 本节点 |
| V-3 Schema 管不到的约束（examples 第 14 节） | 版本编号连续、`item` 不重复、作者与所有者同属一个组织、正文名与 `capability.name` 一致等**接收边界能判的**逐行得 `malformed` 或具名值 | 未开始 | 本节点只闭合接收边界能判的那几行；「持有与记录一致」「`organization` 支外层确有同一份持有」这类要看存储的行归资产治理 |
| V-4 规范场景 S-29～S-35 | 每条一正一反；真实接收边界、真实存储 | 未开始 | S-29（名字里的斜杠）、S-30、S-31、S-32 的形状面本节点可做单元级演练；S-33～S-35 要存储，归资产治理 |
| S-4 例外支、S-19 `carrier` 支（本节点的导法） | `carrierRecordId` 对不同的 `(WorkspaceKey, capability)` 给不同的号、与 `generateOpaqueIdentifier()` 的输出不相交、同一对恒得同一个号；`contentFingerprint` 对成员次序不同的同一内容给同一指纹 | 未开始 | 本节点 |
| S-24 第 6 条（成员名重复） | `parseWorkspaceManifestText` 对含重复成员名的清单文本得 `malformed`，对 `JSON.parse` 能静默接受的那种输入同样拒 | 未开始 | 本节点；读入方用不用它见 design [AM-4](design.md#实施缺口与消费者影响) |
| 端口按类别判别（M51） | 类型测试：把一类实现交到另一类键下的那一行标 `@ts-expect-error`，类型检查通过即证那一行确实报错（判别被放宽时这条测试失败）；缺一类的构造抛出另有一条运行期用例 | 未开始 | 本节点 |
| V-5 消费者路径走查 CS-1～CS-8 | 结构化走查 | 未开始 | 本节点与资产治理、求值、流转节点共同走查 |
| V-7 中的 SC-6 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |

**不在本节点**：V-6（跨进程，本版装配下无法演练）；SC-1～SC-5（存储写路径与读面，归资产治理与流转）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面、写明 `BodyContracts` 端口是可替换构件，不新增语义，上表证据义务不变；AM-6 改指接口契约 `capability.credential-custodian/v2`。这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **嵌着的正文拒绝值要端口实现才测得了**：V-2 的那一半与六个正文包同时落地才闭合。owner：本节点与六个正文包。
- **空白码点集合**（AM-1，实现期事项）：identity-values 补导出之前，S-2 第 2 条的测试只能对着一份自抄的集合跑——那样的测试证不了「与 identity-values 同一集合」。owner：identity-values 节点落包时。

## D-068 当前验证epoch

当前设计输入为 `data.asset-model · v3`，规范资源在 acceptance.json 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。
