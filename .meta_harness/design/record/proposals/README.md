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
| [`governance-production-mechanisms/`](governance-production-mechanisms/README.md) | 有限登录/改密/身份一致性与最新恢复事实的机制 | 四条恢复候选；首稿独立评审有两项未闭合阻断，未接受 | 后续精确规格与提供者设计；不供完整生产实现直接消费 |
| [`governance-production-baseline/`](governance-production-baseline/README.md) | 公司内网治理 CLI/TUI 首发所需的登录/凭据生命周期与恢复保证 | 产品目标已纳入 PF-001 rev17／PF-016 rev6／PF-017 rev3；登录与恢复分别保留三个实质候选，恢复机制未接受 | 本轮产品基线来源与评审记录；不作为新规格或实现采用依据 |
| [`identity-values-v1/`](identity-values-v1/README.md) | 身份值与隔离义务写成一份共用数据契约时，边界画在哪 | 三份独立起草的完整候选包（`candidates/A|B|C`），**已由主线合并落盘**为 [`spec/data/identity-values` v1](../../spec/data/identity-values/README.md)，[合并件经四轮 spec-reviewer 评审、第四轮 0 阻断](identity-values-v1/review.md)；**合并件已由 [D-023](../decisions/tenant-domain-design-acceptance/README.md) 接受**（2026-09-22），三份原件本身未被独立评审、不在接受范围 | 该契约在 [catalog](../../registry/README.md) 为 `accepted`、资源已冻结，四份同批契约登记了对它的依赖 |
| [`tenant-capability-split/`](tenant-capability-split/README.md) | 租户领域的语义边界怎么切：维持「两 data、两能力、一组合」还是合并两能力（及两种第三拆法） | 四个实质候选；**三票独立评审全投维持（A）**，主线裁「A + 修两处瑕疵」（当前租户身份「归一不搬家」、改写拆分理由），两处修正已落回 `spec/`；**已由 [D-023](../decisions/tenant-domain-design-acceptance/README.md) 接受**（2026-09-22）——五份边界与依赖方向被接受，候选 C 与「再切治理侧」仍是候选 | 五份契约在 catalog 为 `accepted`、资源已冻结；翻盘走新决定 |
| [`cli-tui/`](cli-tui/README.md) | 第一个交付面（面向生产分发的 CLI-TUI 应用）**用什么技术做、大框架什么形状**：十一个决定点各有 3 个以上实质候选，外加由它们合成的拓扑、分层、通信与进程模型 | **十一个推荐一条都没有被接受**；已发生的接受只有交付形态那五条（[D-022](../decisions/cli-tui-delivery-form/README.md)），它们是本提案的**前提**不是结论。已记录[两次独立评审](cli-tui/review.md)——D2 的强制二选一投票与 fable 对整套草案的 26 条发现；**评审不是接受** | 下游是[应用节点](../../realization/README.md) `apps/cli/architecture.md` 的技术栈采用一节（未接受项在那里标 `candidate` 并回链本包）与未来的前端契约；**前端契约尚未起草，区分实验 E1–E5 一个都没跑** |
| [`tool-definition-baseline/`](tool-definition-baseline/README.md) | 工具定义的**数据契约起点**：minimal-runtime 契约拓展、DSH `core/tools` fork、omne-next 形状移植，还是按 PF-006 §5.3 自研 JSON Schema 并逐字段借用 | 四个实质候选；**已由 [D-031](../decisions/tool-definition-baseline/README.md) 接受（2026-09-23）**：D（按 PF-006 §5.3 自研），A/B/C 只作参考、可照抄——接受的是起点方向，**不是契约**；提案未经独立评审，四项待区分调查未做 | 下游是块 B 的工具契约起草与 MCP 动作映射；起草前要做的区分调查列在 alternatives |
| [`tool-execution-runtime-baseline/`](tool-execution-runtime-baseline/README.md) | 承载「一次工具执行」的**运行时实现起点**：fork DSH jobs、拓展 minimal-runtime local-execution、自研，还是混合 | 四个实质候选对十条必要性质与四条附带约束的矩阵；**已由 [D-032](../decisions/tool-execution-runtime-baseline/README.md) 接受（2026-09-23）**：C（自研），DSH jobs 与 local-execution 只借鉴避坑，两源已知失败情形列为测试义务——接受的是起点方向，**不是契约**；提案未经独立评审；登记的产品张力同日另有产品裁决，归 PF-012／PF-006 正文，不在 D-032 范围 | 下游是块 B 的工具运行时契约与提供者节点；X-1～X-7 区分实验未跑 |
| [`mcp-client-adoption/`](mcp-client-adoption/README.md) | MCP 客户端这一层**用什么实现、支持到哪一步**：整包复用 DSH mcp-client、fork 并剥离、官方 SDK 上自写薄桥，还是不用 SDK 自写协议层 | 四个实质候选；**已由 [D-037](../decisions/mcp-client-adoption/README.md) 接受（2026-09-23）**：C（官方 SDK 上自写薄桥）、桥接范围按复选卡片（含 OAuth，偏离作者建议）、stdio 本版一律据点机拉起（N-11 不成立为本版性质）——接受的是路径、范围与落点，**不是契约**；提案未经独立评审；SDK 协议版本已由研究第三轮核出，其余能力**未取证** | 下游是块 B 的 MCP 桥接契约；三项不归本包的缺口已指明负责方 |
| [`hooks-compat-baseline/`](hooks-compat-baseline/README.md) | Claude Code / Codex hooks 配置翻译成本项目拓展件的**兼容层起点**：DSH hook-protocol 的 matcher/codec/merge 起步、fork 两个桥、全自研，还是只做离线转换 | 四个实质候选；**已由 [D-033](../decisions/hooks-compat-baseline/README.md) 接受（2026-09-23）**：A（fork hook-protocol 无运行时一半 + 自写 runner／导入／映射／交付），区分实验（改动超半改 C）保留、未跑——接受的是起点与 fork 边界，**不是契约**；G1–G11 推迟到拓展点协议起草时裁 | 下游是阶段 3/4 的拓展点协议与兼容层节点；本包**不定**本项目自己的拓展点协议 |
| [`skill-spec-adoption/`](skill-spec-adoption/README.md) | 本项目 Skill 的**规格形状起点**：omne_skill_spec 移植、Agent Skills 开放格式直接采用、DSH skill 子系统 fork，还是自研最小规格；扩展声明放哪的子选择 | 四个实质候选；**已由 [D-034](../decisions/skill-spec-adoption/README.md) 接受（2026-09-23）**：B（开放格式 + 规则层自持）与 B-2b（扩展声明走包内定义记录），叠加参考 omne-next 与 Codex 的兼容扩展——接受的是起点方向，**不是契约**；挡接受的原文钉存已由研究 skill-spec-sources rev 1 补上 | 下游是块 B 的 Skill 包契约与导入器；调用面开关走资产属性是主线已定前提 |
| [`message-and-stream-baseline/`](message-and-stream-baseline/README.md) | 消息与块的**数据契约、到达语法、流装配器**三层各以谁为起点：DSH `llm/llm` 起步、pi-ai 类型起步、全自研，还是混合 | 四个实质候选；[Codex 独立架构评审](message-and-stream-baseline/review.md)判 D 成立后，**已由 [D-035](../decisions/message-and-stream-baseline/README.md) 接受（2026-09-23）**：D（数据契约自研、语法借 StreamChunk 骨架并条款化、装配器自写、pi-ai 止步传输适配）——接受的是三层起点，**不是契约**；评审上交的下游缺口列为保留前提 | 下游是块 D 共用契约，先于块 B、C 契约定型；建议按 tenant-capability-split 先例做独立评审或投票 |
| [`slash-command-parsing-baseline/`](slash-command-parsing-baseline/README.md) | 交付面上斜杠命令的**识别、解析与展开逻辑起点**：omne-next 前缀分类器、Codex 做法、Claude Code 做法，还是按产品正文自研统一解析器 | 四个实质候选（另保留 DSH 的排除依据）；**已由 [D-036](../decisions/slash-command-parsing-baseline/README.md) 接受（2026-09-23）**：D（按产品正文自研统一解析器）——接受的是起点方向，**不是契约**；提案未经独立评审；同日 Q3／Q7／Q8 与三项产品未决的作答是产品正文修订，不在 D-036 范围 | 下游是 PF-016/PF-014 的解析契约与导入器；对 [cli-tui](cli-tui/README.md) D7「共用一份命令定义」有收窄影响 |
| [`governance-center-entry/`](governance-center-entry/README.md) | 治理中心的**入口层**（客户端 ↔ 中心的接入与身份核实）与**运维面**（只在中心所在机器可读的完整体检）在 Cordis 装配里落在哪、由谁拥有 | 四个实质候选：入口层三个落点（A 独立 fiber、B 并入装配、C 三扇门）加运维面一个替代（D 进程外命令），关键反例互不重复；**主线裁定方向 A，尚无接受、尚无评审**；输入基线含 [PF-017](../../product/PF-017-governance-center-as-deployable-application/README.md) rev 1（**草稿，未接受**），依赖它的结论都是候选依据 | 下游是待立的组合契约 `spec/compositions/governance-center-entry` v1 与待立的 realization 节点 `packages/tenancy/governance-center-entry`，以及 [apps/tenancy-host](../../realization/apps/tenancy-host/README.md)、`apps/cli` 两个节点的修订；接受走新决定 |
| [`capability-split-assets/`](capability-split-assets/README.md) | 块 A **资产、设置与权限**的能力拆分：一个插件提供四份契约、纯部分落 core + 治理与流转一个插件、治理与流转两个插件、按中心／据点两侧拆，还是按记录与持有拆 | 五个实质候选（另有 B 的契约层变体）；**作者推荐 B**（`data.asset-model` 与四步求值为 core 纯模块、资产治理与资产流转由中心一个插件提供），改票条件逐候选列明；装配草图与 N-1～N-8「为什么不拆、为什么不合」在此有长期的家；**尚无接受、尚无评审**；依赖主线裁定 MR-1～MR-10（待决定记录） | 下游是 `packages/core/{asset-model,asset-evaluation}`、`packages/assets/asset-governance` 三个 realization 节点与 `apps/tenancy-host` 修订；领域名与包布局待产品负责人拍板 |
| [`capability-split-tools/`](capability-split-tools/README.md) | 块 B **工具运行时**的能力拆分：一个插件承载全部、五个插件同在 `tools`、五个插件按拥有者分领域、执行宿主拆两条 fiber，还是派发器并进 agent loop 的提供者 | 五个实质候选；**作者推荐 C**（执行运行时、注册表、MCP 桥、放行接口归 `tools`；派发器与 hooks 兼容层归 agent loop 一侧的领域），改票条件逐候选列明；「装配草图与为什么这样切」在此有长期的家；**尚无接受、尚无评审**；依赖账本里标「主线裁定，待确认」的多项 | 下游是 `packages/tools/*`、`packages/core/{tool-definition,loop-extension,mcp-endpoint}` 与据点装配节点；领域名、loop 侧领域名与装配节点归属待产品负责人拍板 |
| [`capability-split-model/`](capability-split-model/README.md) | 块 C **模型请求运行时**三个落点 #8 对象的能力拆分：档案目录（独立插件／并入组织治理 v2／并入运行时）、模型请求运行时（选择与调用同在／选择独立／调用做 fiber／传输做服务）、模态转换（独立登记表／并入 runner／并入运行时／每件独立拓展件） | 每对象三到四个实质候选；**作者推荐 A／A／A**（三份能力契约：目录在中心、运行时与模态转换在据点；调用是宿主 effect 不是 fiber；传输适配与投影都不做服务；转换件每键一条子插件），改票条件逐候选列明；「装配草图与切分理由」在此有长期的家；**尚无接受、尚无评审** | 下游是 `packages/model/*` 三个 realization 节点、中心侧 `apps/tenancy-host` 与据点装配修订、入口组合契约 v2；领域名 `model` 与包布局待产品负责人拍板 |

存量 topic 尚未从 `design_legacy/proposals/` 迁入；原索引见那份留档，
**迁入时逐条恢复并核对链接与接受状态**，不整批复制。

判断方法按需读 `harness-design-handbook` skill 的「能力覆盖与演化」。
返回 [系统设计链](../../README.md)。

[PR #9/#10 并行设计的坐标协调](pr9-pr10-coordinate-reconciliation/README.md)：三条路径及代价；按用户明确要求采用后移 #9 的行政坐标，见 D-066。

[治理中心 Docker 部署](governance-docker-deployment/README.md)：沿现有治理中心的停止、备份和隔离恢复保证比较三种部署承载；R4 已由 D-067 接受，实际交付验收另列。

[内容块实现接缝](content-blocks-implementation-seams/README.md)：无损数字进入 Schema 校验、普通与 pi 生产者的铸号策略协调；R2 的限定范围已由 D-068 接受；完整 pi 与其他消费者实施门仍未闭合。

[模型调用引用与生命周期](model-runtime-reference-lifecycle/README.md)：比较既有模型服务扩面、独立定位服务、耐久动作协调器三候选；作者推荐在既有服务内补模型专属解析/消费面，四表已形成，尚未接受，不扩完整 Session/Run。

[Moonshot 空串文本段](moonshot-empty-text/README.md)：精确两叶、全路由与公开配置三候选；独立选择无阻断，技术采用见 D-115。
