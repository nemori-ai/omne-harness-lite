# 来源、确认与变化

| 可恢复输入 | 确认与迁入范围 | 对应正文定位 | 尚未确认的解释 |
|---|---|---|---|
| `docs/requirements/system/constraints.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`；SHA-256 `6e959ebecc755643f3a1988573a5135cf973bd06cf2aff765396965008650991`；`# 已确认的跨系统约束` | 保持源文件中已确认条款、显式边界和未决项；本次仅改变知识归属与链接表达 | [requirements.md](requirements.md)：`SYS-IDENTITY`、`SYS-KERNEL`、`SYS-SPEC`、`SYS-DEPLOY`、`SYS-TENANT`、`SYS-LLM`、`SYS-EXPERIMENT` | 正文列出的待澄清、待设计和未采用范围继续保持原状态 |

## 本轮变化

| 新基线 | 变化 | 受影响消费者 | 仍待闭合 |
|---|---|---|---|
| `omne-harness-lite-design-2026-09-15` | 等价整理为自包含 topic；身份和条款不变，没有接受新政策 | 能力覆盖、精确规格、提供者和装配的后续拥有者 | 由各纵线提交条款级覆盖及引用映射，并由集成阶段核对 |

| `omne-harness-lite-design-2026-09-15` | **2026-09-25 新增 `SYS-OPEN`**（产品负责人原话见 `tmp/assets-runtimes/pending-user-rulings.md` §二′ 与本 topic 正文）：核心能力是可公开的独立函数闭包，runtime 只是一种消费者，按开源框架角度提供最大自定义灵活度 | 本程全部 provider 节点（须区分公开函数面与服务面）、实施边界稿、后续所有节点模板 | 各节点补「公开面」一节；节点模板加该栏 |

若后续发现语义差异，必须回到有权接受者；本记录不能把迁移评审升级成新需求确认。

## 2026-09-28：纠正 DeepSeek 复用边界

- 来源：产品负责人在首篇博客「抉择」章节修订任务中明确指出：「我们事实上只用了 deepseek 的 cordis，连 agent 原语我们也不会复用（因为我们完全自主设计了我们自己的 agent runtime，也就是 agent loop）」。本段保留当次原话以恢复确认依据。
- 已确认范围：`SYS-KERNEL` 仅采用 Cordis 官方包；不采用 DSH `agent` 原语，自主设计 Agent Runtime（Agent Loop）。取代旧条款的 agent 原语复用与其他 DSH 组件 fork 安排，不改变 Cordis 的官方包采用方式。
- 同步消费者：项目根 README、AGENTS.md 与博客「抉择」章节。
- 后续复核：`record/proposals/cli-tui/`、`realization/apps/cli/` 仍有 DSH 原语采用或跨进程复用前提；`ubiquitous_language/terms/architecture-core-and-extension.md` 的上游内核说明仍沿用旧范围。上述表述不能继续作为采用 DSH 原语的依据，须由各自 owner 在后续修订中按本条核对；历史记录不改写。本次未修改契约或宣称实现完成。

## 2026-10-01：重定 Cordis 的定位

- 来源：负责人在当日「整洁之道各条取舍」的问答里写下：「Cordis 依然是内核，但是在对它有了更深刻的理解后，我认为 Cordis 提供的是一套能过让我们有条件实现完全动态系统的全系统集成装配时候需要面向满足和遵循的契约规范，就是不再是以它为视角进行建模，而是架构设计和实现出来的东西需要满足它的契约规范能过以 fiber plugin service inject 的方式来集成来装配」。本段逐字保留当次原话以恢复确认依据。
- 已确认范围：`SYS-KERNEL` 增补定位一段；复用范围（仅 Cordis、官方发布包、不用 DSH `agent` 原语）不变。
- 同步消费者：`SYS-DYNAMIC.C2` 与 SYS-COMPOSITION 的确认记录、根 AGENTS.md 项目心智、设计工作区的 AGENTS.md、设计手册主线及其评审判据、相关角色；逐处见 [D-112](../../record/decisions/cordis-as-assembly-contract/decision.md#四取代与修订的范围)。
- 后续复核：已接受契约正文里的内核机制词、九份固化投影的小节标题、几份产品 topic 的措辞，都留到各自下次修订时改，清单在 D-112；历史记录不改写。本次未修改契约，也不宣称已有的架构材料已按新定位重写。
