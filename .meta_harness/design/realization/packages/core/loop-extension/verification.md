## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 6 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# loop-extension 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.loop-extension/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/loop-extension` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**581 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 6 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/loop-extension/verification.md`](../../../../spec/data/loop-extension/verification.md#证据义务)（V-1～V-11）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～5、7 节正反实例逐条过包内校验；第 6 节四个走查里的 JSON 过对应的 `$defs`；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 两张合法组合表机检 | 13 个位置（含维度）× 8 种结论 × 3 档逐一构造 `Conclusion`，比对 Schema 与 S-20、S-21 的 ✓／✗ 及拒绝值 | 未开始 | 本节点 |
| S-40 推出规则 | 三档声明各推一次，`power` 的取值域是声明档及其以下；不产出 `disabled`、`usableBy` | 未开始 | 本节点 |
| S-11、S-41 执行环境句柄（M38） | 十一个位置的输入都带 `environment`，缺了即 `malformed`；句柄是不透明串、合 identity-values S-31 的交换表示；本包公开面里没有解析它的函数 | 未开始 | 本节点（形状与公开面）；解析与「解析不出不回退」归 runner |

**不在本节点**：V-3～V-11（回放一致、不可用与报错两分、每件必留、不合法结论按报错处置、没有放宽、`select_model` 与 `retry` 的判定、被拦的内容不进日志、跨进程、落终态之后不复活——派发器、兼容层与模型请求运行时）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；`judgeConclusion` 的第二个参数由 `ctx` 改名 `inputs`（候选名，免与 Cordis Context 混读）。这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

## D-068 当前验证epoch

当前设计输入为 `data.loop-extension · v3`，规范资源在 [acceptance.json](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。

## 2026-09-26 typed表示恢复的实际旧2范围复验

[HUB独立实际运行](../../../../record/evidence/2026-09-26-tests-core-opaque-restoration/README.md)保存四包1700测试/build/type/27规则、原两项TypeError与八组built消费者的输出及精确2输入。只证指定恢复路径/表示与完整业务分离，非全仓opaque数据流/性能/外部runtime/后续3采用。当前3完整回归与逐ID接受仍待，不将旧2运行重标。

## LC4 提供者候选证据义务

[v4 候选设计](v4-design.md) 的契约 LC4 已由 D-073 接受，本提供者修订尚未接受/实施。旧证据状态按 README 的实际日期事件读取；原 LC3 S-37 绑定保留且不改版本，LC4 新绑定为 0。[规格侧检查](../../../../spec/data/loop-extension/verification.md#v4-模型适配绑定闭包) 不替代下列生产纯函数与消费者证据。

| 编号/来源 | 会失败的检查 | 当前状态与 owner |
|---|---|---|
| LV4-1：S-1～S-18、S-36/S-39/S-41 | 从实际制品分别导入根4与 `/v3`，编译两侧全部42定义；核 LC4/LC3/LC2 Schema 的原字节/$id；有绑定输入4过3拒、无绑定旧输入3过4拒；环境句柄必有；移掉所需精确资源必须明确失败 | 未开始；本节点实施者，LC4-G1/G2 |
| LV4-2：S-14/S-37 | 顶层 profile、各 dispatched 自身和其 profileSnapshot 中任何必填 adaptation 缺席都拒绝；Schema 能通过而单条两绑定不等或 modelId 不符时 judgeValue/subject、judgeInput 都给 malformed；混合 unknown position/power 错误仍先 malformed | 未开始；本节点实施者；必须调用 MS4 真单条判定，替为 schema-only 应有反例失败 |
| LV4-3：S-14/S-36/S-37 | 原始 JSON 任意深度重复键拒绝；配置内相邻超安全整数、小数、true/1、数组顺序保持精确；文本→共享严格读取→实际 LC4 判定→无损写回可核原值。参数/opaque JSON 内同名 dispatches 键不被误当协议路径；类型恢复不抹字段 | 未开始；本节点与 runtime/runner 接收边界 owner。预先舍入的输入不声称被恢复 |
| LV4-4：S-19～S-29/S-31/S-37/S-40 | 两合法表13变体×8结论×3档逐格核对；十拒绝混合错误次序、辅助 TypeError 与领域拒绝分离；来源 mismatch 原规则；失败位置 observed/retry 仍可、rewrite 仍拒；S-40 推出域/默认和禁止 reserved 项不变；原 LC3 回归明确经 `/v3` 跑 | 未开始；本节点实施者。有限表检查不证明 runner 行为 |
| LV4-5：版本与正文端口 | AE3/AE4、MR3/MR4 实际公开 import 钉 `/v3`/`schema/v3`，根4载入后仍编译各自固定图；ArrivalEvents2 的 FailureCause 八值与 LC2 逐项相等；两版本声明文件不误指新依赖、不引用私有路径，v3 的 schema 不能跟根4一起替换 | 未开始；本节点与 AE/MR/ArrivalEvents owner，LC4-G3；必须实际 build/打包/独立消费，源码字符串一致不足以通过 |
| LV4-6：S-14/S-30～S-35/S-41 | runtime3→runner3→默认重试件接到真实完整有序 dispatched 和调用原快照；目录更新不换旧绑定、同条记录都合法但混调用/漏一条/乱序仍由 runner 拒绝；真实落盘后回放保值，句柄由实际调用归属解析 | 未开始；runtime/runner 及验收 assembly owner，LC4-G4。本包纯 judge 可以接收尚待批次核对的值，不冒充已完整验收 |

本节点不创建批次状态机、计时/重试配置或新 formal task。现有有限表检查足以触发该纯值面的反例，实际并发、持久顺序和重放义务继续归 runner。

2026-09-27 本稿实际执行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，退出 0，输出 `passed gate=internal; formal=skip`。全部 formal 显式跳过；新 v4-design.md 的 Prettier 与节点 `git diff --check` 通过，旧 design.md 与基线无差异。没有执行 LC4 生产函数、独立制品或 runtime/runner 组合测试，以上义务仍未开始。

## LC6 直接迁移候选证据义务

对应 [v6 候选映射](v6-design.md)。全部为待实施／待验；本次不新增 bindings，不把 LC3/LC4 的历史运行迁名。候选 LC6/MP5/MS6 的正式释放、catalog 核对及采用由主线先行完成。

| ID／条款 | 必须能失败的验收 | owner／当前缺口 |
|---|---|---|
| LV6-1；LC6 S-1～S-18、S-36/S-39/S-41 | 根 Schema 逐字节比正式资源，43 defs 集合相等并全部编译；正例、缺必填、额外字段、关闭枚举、未知 modelCallId 词法负例；独立制品以公开入口完成整个精确资源图 | 本包实施；候选图未实际运行 |
| LV6-2；S-14/S-37/S-43 | 失败主体缺 retryConclusions 为 malformed；有效空序列与多条完整结论都接受；嵌套 dispatch 内部绑定/模型不等拒绝，混 modelCallId 拒绝；工具参数/配置中的同名键不误判 | 本包实施；不声称这些值测试证明日志完整 |
| LV6-3；S-30/S-31/S-37/S-42 | failure 的正常、不可用、报错三形及 observed/ask/最终结论必有正确 modelCallId，其余12组合禁止；工具 callId 不可代填；与有效辅助输入不等为 malformed；原十拒绝混错顺序及辅助输入 TypeError 边界回归 | 本包实施；特别核私有 earlyResource 条件防新约束被下标裁掉 |
| LV6-4；S-36/S-43 | 两个相同 JSON 的不同结论保留两次及原序；完整作者/计划/时刻不丢失；深层大整数、小数及配置原值无损；输入修改不能改变已判断值，输出不别名引用任何可变输入，独立二次复制仍相等 | 本包实施；单纯 readonly/freeze 不算无损独立 copy 证据 |
| LV6-5；S-30～S-35/S-42/S-43 | runtime/runner 对同一真实日志前缀验证：缺历史、重复同一条目、乱序、跨会话/调用、建议未生效被错误收入均拒绝；不同条目同值保留；已给未发 retry 保留；日志不可用不能补[]；重放最终结论不重调默认件 | runtime/runner 实施与验收；本包不能伪造日志证明，当前受阻消费者明确列于设计 |
| LV6-6；S-4/S-8/S-40 及消费者精确采用 | AE 当前默认端口、ArrivalEvents、MR7、runtime、asset-registry 真实构建/类型/制品组合；LC3 声明子集与当前共用算法的正反例、推出与拒绝保持；ArrivalEvents LC2资源字节与 FailureCause 域保持 | 各消费者 owner；不升级未受影响契约，不放宽原性质断言 |
| LV6-7；当前运行格式边界 | 独立制品 import ./v3 失败；无猜版/回退；root仅当前格式，旧主体不补值；./schema/v3和./schema/v2仅为现行固定依赖；EN/ZH 示例覆盖完整失败输入与结论判定并真实运行 | 本包及文档 owner；旧用户数据不变、新代际在途责任不因删除兼容而免除 |

覆盖边界：本节点无事务或并发存储能力，不以 LC 纯数组测试替代 LV6-5。LC6 规范未正式释放／仍有旧 codec 义务冲突时，登记为接受门缺口；不在实现内私定转换。实际 checker 输出由主线保全为交付证据，检查通过不等于实现验收。
