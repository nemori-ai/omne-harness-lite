## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 15 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

## D069当前3实施证据义务

当前15本地／组合责任须在新3源重核；旧2结果不可重标。新增14文本＋3目录规范例子，目录已定escape>M16，双版自身ref正反、真实旧2consumer入口、严格3无undetermined、5自有defs／两Schema字节、真实tarball／W6链/公开类型／private路径／27规则均按actual run登记。旧4/5资源集合不承诺AM2全25defs；普通unknown对照必保留。实际证据尚未运行。

# skill-package 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.skill-package/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/skill-package` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**406 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 8 项 core-local、3 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。
- 未闭合：`skill-package.markdown-yaml`、`skill-package.normalized-package`、`skill-package.walkthrough-cs-3-core-step`、`skill-package.walkthrough-cs-6-core-step`。未知 YAML 自定义标签键的 canonical 判等仍为 SP3，普通已确定输入通过不等于完整 S20／CS6；不将 `undetermined` 偷改为 `malformed`。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/skill-package/verification.md`](../../../../spec/data/skill-package/verification.md#证据义务)（V-1～V-9、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

**2026-09-26 实施状态说明**：源码已进入 HUB，普通数据／正文端口和包内验证已有实际运行；以下原「未开始／规则不存在／无源码」状态是设计接受时的证据基线，尚待逐项回填持久 evidence 与绑定，不能解读为当前源码缺席，也不意味着整个模块已经验收完成。SP-3 读入缺口见下。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～5、7～9 节逐行（含变体行）过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值的具名与次序 | 每个拒绝行逐字相同（含 M 编号）；第 7 节八行各验一个值，第 8 节专验次序 | 未开始 | 本节点 |
| V-3 Schema 管不到的约束 | examples 第 9 节逐行 | 未开始 | 本节点 |
| V-4 文本形式的读法 | examples 第 6 节十五行，比对读出的 `manifest`、`body` 与拒绝值本身；同时核 `yaml` 库的三条行为（SP-1） | 未开始 | 本节点 |
| V-5 目录形式的读法 | examples 第 10 节八行：纯函数那一半用构造好的条目跑；「真实文件系统、执行位、成环链接」那一半归读目录的一方 | 未开始 | 本节点与读目录的节点 |
| V-9 中的 SC-1、SC-4 | 见 [design](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |
| V-7 消费者走查 | CS-1～CS-8 结构化走查 | 未开始 | 本节点与各消费者节点共同走查 |

**不在本节点**：V-6（规范场景，要真实接收边界、读入方与放行判断）、V-8（跨进程，本版装配下无法演练）；SC-2、SC-3。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

本批已有包内及 HUB 实际运行；持久 evidence 与逐项技术签收尚待登记，不以作者自报代替绑定。

## 覆盖缺口

- **SP-3 仍未闭合**：文本读入在自定义 scalar 标签键的 canonical 知识不足时返回技术层 `undetermined`，目录读入承接，消费者不得把它作为成功清单。V-4 的普通 Core／冻结十五行通过不等于 S-20 全输入域通过；实际测试与受阻消费须分列登记。

- **证据登记未完成**：源码与包内测试已存在，空绑定表尚不承载实际结果；逐项保全原始结果、核对范围再绑定。owner：本节点与主调度。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。本节点的 `yaml` 新依赖列在批的「范围外」一项，按 [D-060 §八 M55](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 标为候选依赖（design「实现路径」、依赖表、SP-1），不是对本节点的发现。
