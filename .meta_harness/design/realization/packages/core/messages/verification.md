## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 17 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# messages 验证与证据

## v6 当前格式迁移候选义务

本节对应 [v6-design.md](v6-design.md) 的 M6-P1～P6。MS6/MP5 尚待发布、登记和采用；本节没有运行通过声明、没有新增 binding，不改写既有证据。

| 编号 | 必须执行的验收 | owner／当前状态 |
| --- | --- | --- |
| M6-V1：Schema 闭包 | 实际包制品加载 MS6、MP5、CB3、CB2、CA2、IV1、OE1 七份原字节 Schema；编译全部 43 定义、核对 `$id`/资源 hash；故意缺一个传递资源必须失败，不能远程补取或旧 id 指新字节 | messages/profile owner；待最终资源、实现与运行 |
| M6-V2：缺字段与拒绝边界 | 已出门快照缺 `inputConstraints`、`upstreamInputLimits` 或其必填/适用成员时，真实文本/root judge 均 malformed，返回前后输入不变；不补 unknown/default。合法 shape 但 cap 大于已知 fact 的快照不额外重跑 MP5 S-33，写入者责任另验 | messages owner；待运行 |
| M6-V3：原数与完整复制 | 经公开严格文本入口读取、品牌恢复和序列化，新增两对象及嵌套配置大整数/小数精确往返；重复键拒绝，调用后改原对象不改返回值；对象换键序相等、数组换序不同、1/1.0 数值相等、相邻超安全整数不等。两处绑定仅改任一层成员应由完整 judge 拒绝 | messages owner；待运行，不以 JSON.parse fixture 冒充原数文本 |
| M6-V4：现有语义与跨包 | 当前规范实例、十四拒绝顺序、参数重建、七消息/五记录/三收场、可读名单配对回归；MS6 与 MR7 自定义副本对齐。接收记录仍不能证明日志唯一、耐久或跨记录同绑 | messages/response owner；待运行 |
| M6-V5：公开制品与消费者 | 清理 dist 后 build/typecheck，独立制品 root/schema 可用；`/v3` 与私有旧执行文件不可导入；`/schema/v2`、`/schema/v3` 保留原字节供设计点名的现行精确依赖，不进入本包 MS6 运行图，也不被用来降级接收旧 model 记录。设计消费者清单全部采用或报告精确受阻条款，不改冻结 `$ref` 假装迁移；当前 runtime/demo 集成拒绝旧格式且旧数据字节不变 | 集成者与各消费者 owner；待采用及运行 |
| M6-V6：双语文档示例 | messages README/README_ZH 更新当前版本、两面边界与完整快照示例，真实执行公开导入示例；移除旧版本使用示例，其他修改包同样维护双语 README | 各包 owner；待实现 |

### v6 覆盖缺口

- **M6-G1**：MS6 S-37/S-49、MP5 S-27 最终规范资源、catalog 与采用未完成，hash 不预填。受阻消费者为本包及设计清单中的当前链；契约 owner 发布、主线接受后核对本稿坐标与字段再施工。
- **M6-G2**：本包及清单中旧入口消费者尚未迁移；资产三处与 session-tenancy-table 均仅使用 SessionRef，迁 root 纯值面时须验证该子集形状同构。现行 connector2 及 MR7→LC6→AM3→LC3 等精确 Schema 依赖保留必要原字节资源，不扩资产平台；仅当发现要求旧模型执行 codec 的具体条款才报主线，本节点不改契约、不保留兼容替身。
- **M6-G3**：MS6 S-49 写入者完整快照、跨记录同绑与发前耐久，以及 S-9/S-32 身份/唯一仍归 runtime 和日志 owner 的真实组合；没有新增产品 app，也没有本节点证据覆盖这些外部责任。当前代际已接纳调用的未完成责任不因删除旧格式 codec 而消失。


## v4 候选证据义务

本节只对应 [v4-design.md](v4-design.md) 的 M4-P1～M4-P7；messages4/profile3 尚为 candidate。既有473项等运行继续只说明原输入。本节列的是验收义务，尚无 v4 产品源码运行、技术接受或新增绑定。

| 编号／来源 | 必须出现的正反证据 | 当前状态／owner |
|---|---|---|
| M4-V1：S-37、S-49；M4-P1 | 三版 Schema 原字节、`$id`、43 个定义名及完整引用图；删除顶层 adaptation、删除快照 adaptation、values 缺席/null/数组、绑定多余成员必须拒绝；类型消费者缺必填也不能编译 | 待实现；messages owner 与 profile owner |
| M4-V2：S-39、S-40、S-49；M4-P2/P4 | 对 Schema 通过的输入分别只改 implementation 名/修订、definition 模型/修订、configuration 修订/值，完整 judge 必须 malformed；两处绑定一致但 modelId≠profile.routeName 仍拒绝；调用前后输入与拒绝对象不被修补。证明 shape-only 入口的通过不能替代完整 judge | 待实现；messages owner |
| M4-V3：S-37、S-49 与 profile3 S-29；M4-P3 | 重排对象键应相等，重排数组不同；1 与 1.0、-0 与 0 按精确数值相等；true 与 1 不同；9007199254740992 与 9007199254740993 不同；深层数值变化不可被修订相同掩盖。须经公开文本入口保留精度，不能先 JSON.parse 再声称覆盖原文 | 待实现；messages owner |
| M4-V4：S-37、S-49；M4-P3 | 配置任意嵌套重复键及非严格 JSON 被拒；大数和小数精确往返；调用者在返回后改原配置，已返回值不变；不能凭浅冻结或 TS readonly 通过 | 待实现；messages owner；落盘/回读那一跳归 runtime 与日志 owner |
| M4-V5：S-1～S-40、S-49、S-50；M4-P4/P5 | 全部本版规范实例、14个命名拒绝及组合优先级、参数处置重建、五种记录、三支收场和前缀判定回归；其他四种记录不得错误要求 adaptation；新记录不得混入 Message/OutboundMessage | 待实现；messages owner |
| M4-V6：S-37、S-49；M4-P6 | 与 response4 四个自定义副本及 dropped 项形状对齐；故意改动任一受约束形状须失败。不引反向 Schema/运行时依赖 | 待实现；response owner 主测，messages owner 配合 |
| M4-V7：精确版本采用；M4-P7 | 实际打包制品同时 import root4、v3，三份 schema 各编译完整图，v3类型声明不误用profile3代替旧2；旧 dispatched 经 v3完整judge及旧2/3 Schema通过而经4拒绝，新4 dispatched 不被旧图偷偷接受；旧2仅Schema范围不标成完整judge。删除任一传递资源或错接默认版本必须失败 | 待实现，受 M4-G2 阻断；各包和既有消费者 owner |
| M4-V8：S-49 的外部义务 | 同一调用跨次发出和响应采用同一完整绑定；先写耐久 dispatched 再发送；旧绑定注册缺席仍可读历史、不换最新；有序恢复及首内容锚点故障交错。纯函数测试不能签这组 | 待 runtime/日志真实装配；本节点无持久状态 |

上述测试只在实现后取得实际失败能力，才可按精确坐标登记绑定。Readable 的名单结构模型不覆盖新增绑定比较，不能据模型引用给 S-49 新增 binding。

### v4 实际执行与范围

规格侧已有[研究运行](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md)中的 messages-v4 Schema/纯值探针，归规格起草证据；它们不导入本包 v4 产品实现，也不替代 M4-V1～M4-V8。**本节点 v4 源码验证尚无**。设计结构检查的本次实际输出由起草交付报告给出，不据结构检查提高语义/实现状态。

### v4 覆盖缺口

| 缺口 | 受阻条款／消费者 | owner 与闭合条件 |
|---|---|---|
| M4-G1：契约与节点未接受、v4源码未实现 | messages4 S-37/S-39/S-49；新 response4/runtime3 的实施采用 | 主线完成独立审阅与精确接受；messages 实施者完成 M4-V1～V7，运行原始证据归 record/evidence |
| M4-G2：保留 profile2 的公开纯值与 Schema 端口未实施 | messages2/3 Schema图及 v3 的 ModelProfileSnapshot 类型、参数判定；loop-extension3 与 response3 保留消费者 | profile owner 交付精确2端口；消费者显式接线且实际制品通过 M4-V7，不能把新profile3当旧2 |
| M4-G3：未来2消费者的采用范围未由本节点决定 | messages2 S-37/S-39；尚未实施而仍钉2的消费者需要的完整判定责任 | 主线/对应消费者按独立采用决定选Schema读取或演进契约；本批保留面仅现有schema/v2，不新增messages2/CB2纯函数。不阻断本节点4/3实现，不能据资源存在声称未来2消费者已具备实现 |
| M4-G4：耐久及身份不是纯值模块的责任 | messages4 S-9/S-33/S-49 的身份壳、唯一、跨记录绑定、出门前锚点；新runtime服务/恢复消费者 | runtime 写入者、session-log owner及主线指定的真实验收装配完成 M4-V8。新验收装配尚未建立；不把Schema、配置字符串扫描或旧单元测试当作授权/秘密检测/日志耐久证明 |

以下继续保留旧版本的实际事件与义务，不据“未开始”的历史段落否定已有 v3 实现，也不据旧签收提升本节。

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.messages/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/messages` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**473 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 15 项 core-local、2 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前3实际形式执行（2026-09-26）

[2026-09-26-formal-core-v3](../../../../record/evidence/2026-09-26-formal-core-v3/README.md) 保存本次正式3输入的实际模型、指定变异、原始输出与完整封存。主调度核32冻结资源、630 SHA、631归档字节及263主Alloy／28 XML读数，独立spec-reviewer核对应性无阻断。原6命令2 run SAT/4 check UNSAT，五变异各规定check有反例；恰6/5条消息与前缀范围，不把fact/类型吸收的名单/配对/块不变前提当接收或写入保护。Alloy未登记正式task，不增formal binding。旧证据保留原输入；本次模型执行不签收产品实现、W6真实组合或人的最后总体门。

契约侧的证据义务权威在 [`spec/data/messages/verification.md`](../../../../spec/data/messages/verification.md#证据义务)（V-1～V-12、SC-1～SC-6）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 参与机检的各节逐行过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值的具名与两段次序 | 每个拒绝行逐字相同；第 12 节六行专验第一段的次序 | 未开始 | 本节点 |
| V-3 单条消息里 Schema 管不到的约束 | 工具消息两个 `callId` 相等等；`block_id_duplicate` 含嵌套与派生表示 | 未开始 | 本节点 |
| S-37 读 JSON 文本的口径（M36） | examples 新加的两例：顶层 `type` 出现两次的文本得 `malformed`（不取任一个）；含 `12345678901234567890` 的记录经 `readJsonStrict`／`writeJsonLossless` 往返逐字相同 | 未开始 | 本节点做模块内那一半；会话日志落盘与回读那一跳归日志写入方（content-blocks CB-2） |
| V-4 日志层的判定（名单 ② ③ ⑤ ⑥、配对与唯一 ①～⑦） | 给定日志前缀，判一次追加合不合法 | 未开始；⑤ ⑥ 受阻于调用方给不出输入（MSG-2） | 本节点提供判定；演练在日志写入方（下一程） |
| V-5 此刻模型可读 | examples 第 11 节五条消息，算出的可读集合与手算逐块相同；三个变体各跑一次 | 未开始 | 本节点（纯函数那一半）；「真实组装」那一半归 PF-010 的组装（无契约） |
| V-11 结构模型 `Readable.als` | Alloy | 契约侧记录，**不是 formal task、不可绑定** | 契约 owner |
| V-12 与别处逐字相同的定义 | `ResponseId` 等四份副本 | 放在 model-response 节点 | model-response |
| V-10 中本节点承载的 SC-3、SC-4、SC-5 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |

**不在本节点**：V-6（规范场景，要真实接收边界与落盘）、V-7（出门三条义务，归传输适配）、V-8（走查，与消费者共同做）、V-9（跨进程，本版装配下无法演练）；SC-1、SC-2、SC-6。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；`judgeCompactionList` 的第三个参数由 `ctx` 改名 `inputs`（候选名，免与 Cordis Context 混读）；MSG-1、MSG-2 改指接口契约 `capability.session-log/v2`，V-4 ⑤ ⑥ 仍受阻于 MSG-2。这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **Alloy 模型不可绑定**：S-28 的实现侧证据只能是 V-5。
- **名单判定的 ⑤ ⑥ 没有可测的输入**（MSG-2），随会话日志契约留给下一程。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

## D-068 当前验证epoch

当前设计输入为 `data.messages · v3`，规范资源在 [acceptance.json](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。

## 2026-09-26 typed表示恢复的实际旧2范围复验

[HUB独立实际运行](../../../../record/evidence/2026-09-26-tests-core-opaque-restoration/README.md)保存四包1700测试/build/type/27规则、原两项TypeError与八组built消费者的输出及精确2输入。只证指定恢复路径/表示与完整业务分离，非全仓opaque数据流/性能/外部runtime/后续3采用。当前3完整回归与逐ID接受仍待，不将旧2运行重标。
