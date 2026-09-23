# 提案

本家族拥有需要持续消费的候选边界、能力覆盖与取舍。每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 新主题从本地 [topic 模板包](.templates/topic/README.md) 开始，复制为 `<topic>/`；包内为入口和 `design.md + alternatives.md + review.md`。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 从现有能力的覆盖与剩余责任推理；推荐、评审和接受分别记录。

## 主题准入与候选比较

每个正式 proposal topic 至少提供 **3 个有实质差异的 candidates**，围绕同一个可判断的选择对象比较。
每项说明责任/机制、怎样兑现必要要求、成本与风险、来源/证据及未决前提；不能将改名、参数微调或空占位符凑成候选。
候选不必最终都可采用；被约束或反例排除的真实路径仍保留排除依据，不能捏造明显无关的陪衬。

尚不能形成三个真实候选时，先保留研究或任务级探索并补齐选择空间，不以不完整 topic 冒充已达到提案准入。
已有有效决定下的普通局部工作直接沿用其依据，不为满足数量另造提案；准入不赋予接受权限。
比较方法见 `harness-design-handbook` skill 的「设计选择」。

**停止条件：**选择对象、现有能力覆盖或剩余责任尚不清楚时回到需求/研究；不足三个真实候选时留在研究或
任务探索；需要改变已接受语义时等待有权决定。作者推荐、评审通过和模板齐全都不产生接受。

命名、裁剪与跨家族引用遵循 [信息包约定](../../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

本节按实际子目录链接 topic README，并标明选择对象、候选/接受边界与当前消费范围；未被索引的任务草稿不因此成为正式提案。

| topic | 选择对象 | 候选／接受边界 | 当前消费范围 |
|---|---|---|---|
| [`identity-values-v1/`](identity-values-v1/README.md) | 身份值与隔离义务写成一份共用数据契约时，边界画在哪 | 三份独立起草的完整候选包（`candidates/A|B|C`），**已由主线合并落盘**为 [`spec/data/identity-values` v1](../../spec/data/identity-values/README.md)，[合并件经四轮 spec-reviewer 评审、第四轮 0 阻断](identity-values-v1/review.md)；**合并件已由 [D-023](../decisions/tenant-domain-design-acceptance/README.md) 接受**（2026-09-22），三份原件本身未被独立评审、不在接受范围 | 该契约在 [catalog](../../registry/README.md) 为 `accepted`、资源已冻结，四份同批契约登记了对它的依赖 |
| [`tenant-capability-split/`](tenant-capability-split/README.md) | 租户领域的语义边界怎么切：维持「两 data、两能力、一组合」还是合并两能力（及两种第三拆法） | 四个实质候选；**三票独立评审全投维持（A）**，主线裁「A + 修两处瑕疵」（当前租户身份「归一不搬家」、改写拆分理由），两处修正已落回 `spec/`；**已由 [D-023](../decisions/tenant-domain-design-acceptance/README.md) 接受**（2026-09-22）——五份边界与依赖方向被接受，候选 C 与「再切治理侧」仍是候选 | 五份契约在 catalog 为 `accepted`、资源已冻结；翻盘走新决定 |
| [`cli-tui/`](cli-tui/README.md) | 第一个交付面（面向生产分发的 CLI-TUI 应用）**用什么技术做、大框架什么形状**：十一个决定点各有 3 个以上实质候选，外加由它们合成的拓扑、分层、通信与进程模型 | **十一个推荐一条都没有被接受**；已发生的接受只有交付形态那五条（[D-022](../decisions/cli-tui-delivery-form/README.md)），它们是本提案的**前提**不是结论。已记录[两次独立评审](cli-tui/review.md)——D2 的强制二选一投票与 fable 对整套草案的 26 条发现；**评审不是接受** | 下游是[应用节点](../../realization/README.md) `apps/cli/architecture.md` 的技术栈采用一节（未接受项在那里标 `candidate` 并回链本包）与未来的前端契约；**前端契约尚未起草，区分实验 E1–E5 一个都没跑** |
| [`tool-definition-baseline/`](tool-definition-baseline/README.md) | 工具定义的**数据契约起点**：minimal-runtime 契约拓展、DSH `core/tools` fork、omne-next 形状移植，还是按 PF-006 §5.3 自研 JSON Schema 并逐字段借用 | 四个实质候选；作者推荐自研 + 借用清单，**未评审、未接受** | 下游是块 B 的工具契约起草与 MCP 动作映射；起草前要做的区分调查列在 alternatives |
| [`tool-execution-runtime-baseline/`](tool-execution-runtime-baseline/README.md) | 承载「一次工具执行」的**运行时实现起点**：fork DSH jobs、拓展 minimal-runtime local-execution、自研，还是混合 | 四个实质候选对十条必要性质与四条附带约束的矩阵；作者推荐自研（唯一无冲突格的路径），**未评审、未接受**；另登记一处产品张力（PF-012 §5.7 与 PF-006 §6.12 在据点进程整体停机下的收场） | 下游是块 B 的工具运行时契约与提供者节点；X-1～X-7 区分实验未跑 |
| [`mcp-client-adoption/`](mcp-client-adoption/README.md) | MCP 客户端这一层**用什么实现、支持到哪一步**：整包复用 DSH mcp-client、fork 并剥离、官方 SDK 上自写薄桥，还是不用 SDK 自写协议层 | 四个实质候选；作者推荐官方 SDK 上自写薄桥并给出「支持到哪一步」表，**未评审、未接受**；SDK 发布包的协议版本与能力**未取证** | 下游是块 B 的 MCP 桥接契约；三项不归本包的缺口已指明负责方 |
| [`hooks-compat-baseline/`](hooks-compat-baseline/README.md) | Claude Code / Codex hooks 配置翻译成本项目拓展件的**兼容层起点**：DSH hook-protocol 的 matcher/codec/merge 起步、fork 两个桥、全自研，还是只做离线转换 | 四个实质候选；作者推荐 hook-protocol 四件起步 + 自写 runner 与映射，**未评审、未接受**；G1–G11 是无论选谁都要另定的映射项 | 下游是阶段 3/4 的拓展点协议与兼容层节点；本包**不定**本项目自己的拓展点协议 |
| [`skill-spec-adoption/`](skill-spec-adoption/README.md) | 本项目 Skill 的**规格形状起点**：omne_skill_spec 移植、Agent Skills 开放格式直接采用、DSH skill 子系统 fork，还是自研最小规格；扩展声明放哪的子选择 | 四个实质候选；作者推荐开放格式 + 规则层自持、扩展声明走包内定义记录，**未评审、未接受**；**挡接受的一项：开放格式原文未钉存** | 下游是块 B 的 Skill 包契约与导入器；调用面开关走资产属性是主线已定前提 |
| [`message-and-stream-baseline/`](message-and-stream-baseline/README.md) | 消息与块的**数据契约、到达语法、流装配器**三层各以谁为起点：DSH `llm/llm` 起步、pi-ai 类型起步、全自研，还是混合 | 四个实质候选；作者推荐混合（数据契约自研、语法借 StreamChunk 骨架并把伴件检查升为必选、装配器自写、pi-ai 只在传输适配翻译），**未评审、未接受**；三层可分开选、依赖单向 | 下游是块 D 共用契约，先于块 B、C 契约定型；建议按 tenant-capability-split 先例做独立评审或投票 |
| [`slash-command-parsing-baseline/`](slash-command-parsing-baseline/README.md) | 交付面上斜杠命令的**识别、解析与展开逻辑起点**：omne-next 前缀分类器、Codex 做法、Claude Code 做法，还是按产品正文自研统一解析器 | 四个实质候选（另保留 DSH 的排除依据）；作者推荐自研并借各家零散规则，**未评审、未接受**；Q1–Q9 待区分，三项产品未决挡住测试用例集 | 下游是 PF-016/PF-014 的解析契约与导入器；对 [cli-tui](cli-tui/README.md) D7「共用一份命令定义」有收窄影响 |
| [`governance-center-entry/`](governance-center-entry/README.md) | 治理中心的**入口层**（客户端 ↔ 中心的接入与身份核实）与**运维面**（只在中心所在机器可读的完整体检）在 Cordis 装配里落在哪、由谁拥有 | 四个实质候选：入口层三个落点（A 独立 fiber、B 并入装配、C 三扇门）加运维面一个替代（D 进程外命令），关键反例互不重复；**主线裁定方向 A，尚无接受、尚无评审**；输入基线含 [PF-017](../../product/PF-017-governance-center-as-deployable-application/README.md) rev 1（**草稿，未接受**），依赖它的结论都是候选依据 | 下游是待立的组合契约 `spec/compositions/governance-center-entry` v1 与待立的 realization 节点 `packages/tenancy/governance-center-entry`，以及 [apps/tenancy-host](../../realization/apps/tenancy-host/README.md)、`apps/cli` 两个节点的修订；接受走新决定 |

存量 topic 尚未从 `design_legacy/proposals/` 迁入；原索引见那份留档，
**迁入时逐条恢复并核对链接与接受状态**，不整批复制。

判断方法按需读 `harness-design-handbook` skill 的「能力覆盖与演化」。
返回 [系统设计链](../../README.md)。
