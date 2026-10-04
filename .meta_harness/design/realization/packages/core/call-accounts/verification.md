## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 8 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# call-accounts 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.call-accounts/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/call-accounts` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**602 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 7 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/call-accounts/verification.md`](../../../../spec/data/call-accounts/verification.md#证据义务)（V-1～V-9、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～8 节正反实例逐条过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值与判定次序 | 同一批反例逐字得「契约判定」一列，含 `malformed` 组合约束那一半 | 未开始 | 本节点 |
| 契约 G-9 的闭合条件（精确十进制） | `0.1 + 0.2 = 0.3`；超 17 位有效数字的金额经读、加、写不丢位——**一条会在丢位时失败的测试** | 未开始；依赖 content-blocks 的严格无损读写 | 本节点 |
| V-5、V-6 补账与汇总 | `effectiveCost`、`summarize` 对 examples 第 9 节手算逐项相等；平局、孤立补账、重复的账三种失败 | 未开始 | 本节点（求值那一半）；「核原响应体的字节」那一半归补账的写入者 |
| 契约验证入口 SC-2、SC-3 的类型面 | 见 [design](design.md#静态检查义务怎么承载)；采用实际 SC 编号，不另设 V-10 | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |

**不在本节点**：V-3、V-4、V-7、V-8（要运行时、节流方、组装的真实演练）、V-9 其余各行（装配选型声明）；SC-1、SC-4。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **精度的端到端证据缺一半**：模块内测试证不了每一跳都走了无损读写（content-blocks CB-2）。owner：主线分派。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

## CA3 候选增量（2026-09-29）

对象为 [v3-design.md](v3-design.md)，固定语义为 `3f597c18` 中 `data.call-accounts/v3` contract/Schema，candidate。源码已存在，但下列 CA3 义务均未执行；原 CA2 运行与绑定不迁移为新证据。本次新增绑定 0，原绑定不改。以下 V3 编号仅是本节点验收义务，不是已登记测试或 formal task。

### CA3 证据义务

| 义务／条款 | 正例与必须失败的反例 | owner 与状态 |
|---|---|---|
| V3-1：S-4～S-18/S-27～S-29/S-37～S-39 | 最终采用 CA3 Schema 的字节副本、原规范正反实例和判定次序；新 `$id` 可被消费者解析。错误旧 URI、漏字段、未知枚举或组合矛盾必须失败，不能改为 unknown | 本包实施者；未开始 |
| V3-2：S-5/S-26 | 无损读入→选中账值→纯求值→写出保留超 17 位金额，`0.1 + 0.2 = 0.3`；将任一边界替换成浮点解析/相加必须触发差异 | 本包负责纯计算；runtime/存储负责逐跳；未开始 |
| V3-3：S-22～S-24/S-40 | 将同 ResponseId 的 ready 或 final 分别投影为唯一显式账值，两次独立求值相等；误交两项必须为重复账失败；同 CallKey 的不同 ResponseId 分别计数 | 本包实施者；未开始；显式输入不证明真实来源选择 |
| V3-4：S-10/S-17/S-24/S-41 | ready 原账 + 工具镜像 + 最新有效补账只算一份有效模型费用，final 接替后相同；目标仍原 ResponseId；补账平局/孤立目标必须失败，预先覆写原 Cost 为 later_correction 不得准入 | 本包实施者；未开始；同组及镜像真实引用由外侧证明 |
| V3-5：S-4/S-23/S-40～S-42 | 合法 unknown 保留未知笔数；费用与用量分别走既有入口；坏表示明确拒绝。负控把未知填零、跳过坏值或把工具镜像加入权威和均必须失败 | 本包实施者；未开始；不据纯函数成功声称无源也可汇总 |
| V3-6：S-40/S-42 | 真实日志前缀 P 只有 ready，读取期间 final 进入 P′；P/P′ 各一笔且相同。ready 已发布但 payload 丢失/损坏时必须 unavailable，不能跳过或混入较新前缀；同前缀复读相同 | runtime/日志成本读面 owner；未开始；须真实并发及故障注入 |
| V3-7：S-25/S-38～S-42 | 原 Run ready 在新 Run 查询仍归原壳；final 接替原账、不重赋归属；ready 无 late 不推不迟到。跨 Session/租户壳、伪造补账 sessionLog、未授权或撤权读取不得成功返回总账 | runtime/成本读面与真实授权提供者；未开始；core 输入无 Session，不能以其测试替代 |
| V3-8：S-19～S-21/S-40/S-42 | 已知发出无 ready/final 由原在途/恢复流程明确解释，不能静默消失；无人处分的 ready 仍计费；诊断可解释 ResponseId/阶段但不泄漏 payload，账/marker 不进模型上下文 | runtime/成本读面及上下文消费者；未开始；不虚构完整 Run/ToolRuntime 交付 |
| V3-9：S-5/S-22～S-24/S-27～S-29/S-40～S-42 | 打包公开 JS、声明与 root `./schema`→CA3、候选 `./schema/v2`→原字节 CA2。MR10/MS7 新图、LC6/AE3 及保留 MS/LC 旧资源混合图全部解析；stream-assembly 经 AE3 的公开消费运行。负控删 CA2 注册/出口或用 CA3 冒充其 $id 必须失败。双语 README 例子按实际入口执行，含唯一值、补账及 unknown；无私有源码依赖、旧执行入口或杜撰查询 API | 本包及消费者实施者、验证 owner；未开始；精确 Schema 资源保留不是兼容执行面 |

V3-6 的两条交错是 [并发章节](v3-design.md#状态并发与失败) 的真并发演练；纯数组排列测试不能取代。不存在本节点跨 owner 写入或共同存储对象证明义务。外侧原批唯一、payload 留存等义务仍归外侧节点，不因 CA 没有存储而消失。

### CA3 实际执行与证据限制

本次只核对源码公开面、CA2/CA3 Schema 身份差异、catalog 坐标和设计文档。没有运行本包产品测试、形式模型或付费模型请求；CA3 实际验证尚无。文档检查结果不提升上述义务状态。

2026-09-29，使用本工作树 `.venv/bin/python` 运行 `check_design.py --root .meta_harness/design --formal skip --gate internal`，实际输出 `PASS: design tree`、`passed gate=internal; formal=skip.`。该检查核设计树内部一致性，所有 formal 明确跳过，不是 CA3 实现或运行态验证。首次用系统 `python3` 因版本不支持 `PurePosixPath.is_relative_to` 中止，随后改用本工作树 Python 环境完成。

### CA3 覆盖缺口

| 缺口 | 条款与受阻消费者 | owner／闭合条件 |
|---|---|---|
| G3-1 | S-1～S-42：全批采用和来源复核未闭合，阻止 CA3 正式采用及依赖实施 | 规格 owner、主线完成全批 gate 与明确采用 |
| G3-2 | S-40～S-42 / G-13：实际来源完整、唯一选择、权限与归组没有证据，完整总账消费者受阻 | runtime/日志成本读面 owner 完成 V3-6～V3-8；不由纯 sum 或现有 CA2 绑定关闭 |
| G3-3 | S-25/S-26/S-38/S-42：生产授权、日志/内容读取与原归属装配尚无应用承接者 | 主线指定生产 owner；本批不新建 apps，开发示例不充当生产 Session/Run；独立纯计算不受阻 |
| G3-4 | S-5/S-22～S-24/S-27～S-29：CA3 Schema、消费图、类型与双语示例未迁移/复验 | 本包及各消费者实施者完成 V3-1～V3-5/V3-9，登记真实制品与运行证据后才考虑新绑定 |

新增上游待核对主张为 0；本包无 Cordis 依赖。节点未自评审、未接受，独立 architecture-reviewer 与后续技术接受由主线安排。

## CA4 ACK 来源候选义务

对应[v4](v4-acknowledgement-design.md)，全部待执行，新增bindings0。

| 编号 | 验证 | 范围 |
| --- | --- | --- |
| A4-V1 | CA4 13公开defs/四实际资源冷编译、逐资源缺失负控、packed声明及跨包消费 | 不新增MR/MS反向依赖 |
| A4-V2 | 原Usage/Cost/Correction精确数与unknown、reasoning/upstream_inference optional往返、原纯有效费用/汇总回归 | 原算法未变的证据按精确diff复用，不冒新来源组合 |
| A4-V3 | runtime同源final→ACK witness→ready切换恰一次；同时来源矛盾明确拒绝；多个dispatch分别计；没有合法ACK的缺payload不可成功总账 | 真日志/来源属于runtime组合验收 |
| A4-V4 | unknown在ACK/删除后保持未知笔数；迟到补账仍原ResponseId/租户/Run/credentialScope；重ACK不加镜像/费用 | 不从当前请求者迁账，不用hash或当前价格补数 |
