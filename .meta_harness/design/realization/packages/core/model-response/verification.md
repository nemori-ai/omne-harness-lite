## v4 候选验证边界（2026-09-27）

对象为 [v4-design.md](v4-design.md) 所列候选映射和 `data.model-response/v4`。本版没有生产实现运行，也没有新增绑定；下方 v3 的实际验证只支持原采用范围。规格证据不等于本节点提供者证据。

### v4 候选证据义务

| ID／条款与投影 | 所需证据与必须能失败的反例 | 当前状态 | owner 与关闭条件 |
|---|---|---|---|
| MR4-V1：S-4～S-19、S-26～S-28、S-35；P1 | 全部规范正反实例通过生产 `validate`/`judgeModelResponse`；完整原 Schema 逐字节一致；元 Schema及传递 `$ref` 解析成功 | 未开始；旧 v3 回归不覆盖 | 本包实施者；记录源码、精确资源和实际结果 |
| MR4-V2：S-36 前两项；P2 | 分别改变 implementation/definition/configuration 修订或一个嵌套值均拒绝；完整绑定相等通过，modelId 与 routeName 错配拒绝；`upstreamModel` 不参与比较 | 仅规格有限检查已有；生产未验 | 本包实施者；删除任一比较后对应反例须红，不仅测同一对象引用 |
| MR4-V3：S-27/S-28；P2/P3 | 新绑定错配分别叠加全部既有成员/具名跨字段失败，仍返回契约第一拒绝；`inBand` 缺码与具名失败叠加不抢先；不改变调用结局、不改输入 | 未开始 | 本包实施者；覆盖次序表及多处同时违规，禁止把 `validate` 顺序当 oracle |
| MR4-V4：S-19、S-37/S-38；P4/P5 | servingProvider 缺席、非空原串、空串/非串；别名/大小写不同保持原值且不直接判供应商违规；缓存正数/零/unknown 分别接受，缺失/额外镜像拒绝；大整数、极小费用无损，已知其他用量加未知缓存仍可为 upstream | 未开始 | 本包实施者；与 call-accounts/2 真实纯值组合，禁用浮点后再比较 |
| MR4-V5：S-6/S-9/S-11/S-26；P1/P6 | 默认 root/schema 固定 v4；`./v3` 保留现有 v3 纯函数/类型并钉 messages/3、profile/2 等精确依赖，同进程独立消费；v2 只核已有 Schema 资源闭包；规范字节/$id 核对；副本断言比较中的约束变异和同名实例字段变异必须被检测 | 未开始 | 本包与依赖包实施者；源码测试、构建产物测试、独立制品消费者同时闭合，依赖私有路径不可用；不新增 v2 纯函数 API |
| MR4-V6：S-28、SYS-OPEN；纯模块边界 | 不依赖 Cordis/runtime/存储/凭据；输入先严格无损快照，调用后无变异或静默修补；对象成员换序相等、数组换序不等、数字与布尔不等、大整数邻值不同、相等十进制不同词法相等 | 仅规格脚本含其中 5 个值变异；生产未验 | 本包实施者；正例加有针对性的反例；静态检查结合真实独立包消费 |

所有新增测试名和接口落点均待实施，不写成已存在的 `test:` 绑定。纯单文档性质不另建与 Schema 重复的行为模型。

### v4 已有实际执行

| 运行 | 输入与配置范围 | 实际结果 | 可支持的结论 |
|---|---|---|---|
| 2026-09-27 response-v4 规格检查 | [完整归档](../../../../record/evidence/2026-09-27-probe-model-request-runtime/response-v4.tar.gz)：43 份输入快照、脚本、命令、环境、stdout/stderr、摘要；规范输入以归档原件为准 | 退出 0；58 个完整实例：22 通过、36 拒绝；12 个新增绑定判定与 5 个精确 JSON 值变异符合各自预期 | 给定规格实例的 Schema 与新增比较检查；不运行产品包、不覆盖 S-27 全部次序，不自动覆盖后来变动的输入 |
| 本节点设计静态检查，2026-09-27 | 执行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，cwd 为本执行工作树根；包含本次四件套 | 退出 0；末行原文 `PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.meta_harness/design passed gate=internal; formal=skip.` | 链接/登记/节点结构检查；所有 formal 明确跳过，不是纯值实现验收 |

完整运行的来源与限制亦见 [规格验证入口](../../../../spec/data/model-response/verification.md#2026-09-27-v4-候选验证)。不从探针暖读、目录声明或配置通过推导生产缓存命中。

### v4 覆盖缺口与外部 owner

| ID／条款 | 本节点无法证明的事情与反例 | owner、受阻消费者与关闭条件 |
|---|---|---|
| MR4-X1：S-16、S-22～S-25、S-35、S-36 后两项 | 文档内部绑定相等，但写入者曾在重试时换绑；当前实现撤除后读历史失败；响应与已出门事实不一致；先落首内容前外露或回复/响应分开提交 | runtime 与共同会话日志 owner；真实请求、重试、恢复、旧版撤除和同一追加结算场景。受阻的是完整 runtime 与应用验收，不是本包纯值实施 |
| MR4-X2：S-19～S-21、S-37/S-38 | 供应商值来自请求而非上游、别名被误判不一致、首内容后错配误记可重发；缺失缓存被猜成零、把写入量当读取命中、费用由 TTL 估算；响应含凭据 | transport 采集与 runtime 写入 owner；请求/上游/持久记录三方对照，缺席、别名、错配前后及脱敏负例；37 模型生产路径缓存验收须使用真实计数 |
| MR4-G1/G2 | 候选契约尚未接受；v4 和 v3 纯值子面尚未实现，没有本版生产反例 oracle；既有 v2 Schema 闭包须复核 | 主线接受与本包/依赖包实施者；response/4、profile/3、messages/4 精确采用后完成 V1～V6。新 runtime 消费不可提前宣称可用；未实施的 v2 消费者另行决定采用 |
| 归装配 | 时钟、密钥、身份核实、耐久日志和最终独立验收应用不在本模块 | 主线及应用装配 owner；明确应用节点与真实提供者后执行 X1/X2。该节点尚未由本任务建立，不以假会话或合法 DTO 样本替代 |

本节点的存储要求和受管装载贡献均为 0。没有需要构造跨存储提交交错的本地性质；跨 owner 的真并发和耐久性不得转记成纯值检查已覆盖。

以下为 v3/core 阶段的历史执行及义务，保持原坐标读取。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 6 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# model-response 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.model-response/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/model-response` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**242 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 5 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/model-response/verification.md`](../../../../spec/data/model-response/verification.md#证据义务)（V-1～V-14）。
本页只登记**落在本节点上的那一部分**；写入纪律归模型请求运行时。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | 第一、二节每个 JSON 块过 `judgeModelResponse`，结果与「预期」逐一对上，拒绝的核对拒绝值；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| 与 `data.messages`、`data.call-accounts` 的副本对齐（`data.messages` 验证入口 V-12 的一部分） | `ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 的完整断言投影逐字相同；冻结注解差异、原片段 hash 与有效性反例另留证据，不声称片段同字节 | 未开始 | 本节点（[design](design.md#副本定义的对齐放在依赖方)的 Schema 位置限定比较口径） |
| 金额不经浮点 | 超出 2^53 的用量与费用金额读入再写出逐字相同 | 未开始 | 本节点（借 content-blocks 与 call-accounts 的无损读写） |

**不在本节点**：V-2～V-14（写入纪律、序列性质、首 token、脱敏、无隐藏重试、`late`，都归模型请求运行时）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

## D-068 当前验证epoch

当前设计输入为 `data.model-response · v3`，规范资源在 [acceptance.json](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。
