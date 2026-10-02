# Cordis 定位影响盘点（只读）

> 这是 [D-112](decision.md) 落字之前做的现状盘点，原样保留作依据：它描述的是提交 `328b08b24` 上的树，
> 其中标为 A 的各处有一部分已随 D-112 改写，改了哪些见[决定正文第四节](decision.md#四取代与修订的范围)。它只列事实，不含方案。
> 由一个只读的调查 agent 完成，主会话抽查过手册、角色与 foundation 各处的原句。

- 盘点时间：2026-10-01
- 读取位置：提交 `328b08b24`（当时的分支 `panqiwei/story-cards`），开工与收尾各核对一次
- 新定位（负责人 2026-10-01 裁决的转述）：领域与能力独立于 Cordis 建模；Cordis 的契约规范（fiber、plugin、service、inject）是装配时必须满足的约束，作为一道符合性核对。Cordis 仍是内核。
- 搜索词：`Cordis|cordis|fiber|Fiber|插件|plugin|Plugin|inject|服务键|effect|isolate|ctx\.|视角|投影`，另加 `机制读数|落点|内核|范式`。先搜索，再读命中段落，然后归类。
- 本报告只盘点现状，不提出改写方案。

## 归类口径

| 标记 | 含义 |
|---|---|
| **A** | 把 Cordis 当作建模、分解或定义能力的出发点（实质依赖） |
| **A·依** | 本身不直接说「Cordis 视角」，但引用了 A 的产物（落点编号、C1 对象分解、机制读数），A 改了它跟着失效 |
| **A·措** | 只有措辞或标题带旧定位，比如「Cordis 建模」「向 Cordis 的技术设计」，所指的实际内容是装配或提供者设计 |
| **B** | 装配、提供者设计、实现映射时要满足的东西，与新定位一致 |
| **C** | 上游事实、版本、来源核对、probe、测试描述 |
| **D** | 说不准，需要负责人或主会话判断 |
| **同形** | 与 Cordis 无关的同形词，例如产品资产「Plugin」、loop 拓展件结论 `inject`、字段名 `effective*`、PM「视角」、读面「投影」。只计数，不归类 |

---

## 1. 一页结论

**A 类共 51 处**：A 实质 13 处，A·依 21 处，A·措 17 处，分布在 20 份文件（另有 3 份现行决定，单列在第 4 节）。

| 文件 | A | A·依 | A·措 |
|---|---|---|---|
| 根 `AGENTS.md` | 1 | | |
| `.meta_harness/AGENTS.md` | | | 1 |
| `foundation/fully-dynamic-system/requirements.md` | 1 | | |
| `foundation/definition-and-runtime-composition/changes.md` | 1 | | |
| 手册 `SKILL.md` | 6 | 7 | 1 |
| 手册 `references/reconciliation.md` | 1 | 2 | |
| 手册 `references/handoff.md` | | 2 | |
| 手册 `references/workspace-context.md` | 1 | | |
| 手册 `references/review/choice.md` | 2 | 3 | |
| `product-design` skill `SKILL.md` | | | 1 |
| `roles/README.md` | 1 | | |
| `roles/design-reviewer/role.md` | | 1 | |
| `roles/spec-drafter/role.md` | | 1 | |
| `design/product/AGENTS.md`、`design/product/README.md`、`PF-001/README.md` | | | 3 |
| `PF-004/decisions.md`、`PF-004/interviews/2026-09-17-…` | 2 | | |
| `PF-012/decisions.md` | 1 | 1 | |
| `PF-004/design.md`、`PF-012/design.md` | | | 2 |
| 9 份固化的 `projection.md`（「## 5. Cordis 建模」标题） | | | 9 |

D 类 13 组。其中「新增独立维度须给出独立插件边界」这一条规则在 11 处重复出现，算一组。

**几个结构性事实**

- **手册里新旧两层并存。**S1–S8 参考页（`intake` / `decompose` / `define` / `project` / `handoff`）与 `architecture/` 参考包已经是「先现有能力与组合、再未覆盖责任、再契约、最后投影到 Cordis 插件」，Cordis 只在 S6 出现，基本与新定位一致。A 类集中在后加的 **A–G 主线**（`SKILL.md` 步骤 C–E、G，以及配套的 `reconciliation.md` 与 `review/choice.md`）。在这层里，机制读数 C 和领域读数 B 平级，必须先做；「是不是新能力」由 C2 落点分类的 #8（plugin + service）判定，然后才进入 S2–S5 的能力推导。
- **有几处已经按新定位写好了**（2026-10-01）：
  - `design/realization/README.md` 与节点模板 `design.md` 的「Cordis 符合性核对」（原话：「Cordis 是装配时要满足的契约规范」）
  - `roles/realization-drafter/role.md` 的「Cordis 符合性核对表是必交的。Cordis 是装配时要满足的契约规范」
  - `roles/README.md` 的「这条分界正是领域建模独立于 Cordis 的落点」
- **同一份文件里新旧说法相邻。**`roles/README.md` 第 69–73 行把「机制读数」列为「系统该怎么切」的判断本身（A），第 79 行又说「领域建模独立于 Cordis」（新定位）。

**改写工作量最大的前五处**

1. **`harness-design-handbook/canonical/SKILL.md`**（14 处 A/A·依/A·措）。步骤 C 的 C1 粒度、C2 落点表、C3 六问，再加上：
   - 引用落点编号的 E 路由表（#0/#1/#2/#4/#8/#9）
   - 表 D 的「半径异常（落点 #6/#7）」
   - 「仍须走完整推导：新增能力维度 → 落点 #8」
   - 返回边「自证 → C」「表 C 三行 → C1」
   - G 表的「涉及的领域对象 ← C1 对象清单」和「Cordis 建模」一行
   - frontmatter description 与第 13 行主线图

   这些互相引用，改其中一处，主线步骤的顺序和路由就要跟着改。
2. **`references/review/choice.md`**（5 处）。页内明写「前四行是对账四表，第六行是主线 F 步的四问——**评的判据要和写的判据是同一套**」，所以主线一改，它必须同步改。评审对象「领域读数与机制读数」、审读数纪律（「对象分解给出至少一种别的切法」「落点分类里『为什么前面几个不是』」）都会跟着变。
3. **`references/reconciliation.md`**（3 处 A，表 A、表 B 归 D）。走查示例按 Cordis 落点给领域对象分类（「订阅 #3 effect；连接 #7 fiber」），D1 自证要求「换一种对象分解重走 C→D」，表 C 第三行的返回边是「C1 → C2/C3 → D」。
4. **产品区的三条已记录裁决及其推导**：
   - PF-004 2026-09-17「设计时要带着 **Cordis 视角**」
   - PF-012 2026-09-23「要从 Cordis 的视角把拓展件视作 plugin」，以及由它推出的结论（decisions 第 259 行「这条裁决 + 本项目以 Cordis 为内核」）
   - PF-012 §5.8 的理由「装与卸是一件插件的生命周期」（D）

   这些是产品负责人原话的落点，改写会牵涉需求确认记录。
5. **foundation 的两条已确认需求文字**：
   - SYS-DYNAMIC.C2 2026-09-13 的澄清：「从 Cordis 视角考虑能力绑定和依赖」
   - SYS-COMPOSITION `changes.md`：「确认建模视角为 Cordis」

   根 `AGENTS.md` 第 17 行「站在 DSH Cordis 的视角建模完全动态系统」自称是 foundation 的「简短投影」，所以上下游顺序是 foundation 在前、根 `AGENTS.md` 在后。

**会牵动别处的改写**

- **手册主线步骤顺序。**C 是 D 的输入（表 A 对到「C 的装配草图」），E 的路由按落点编号走，G 的领域对象取自 C1。C 的定位一变，A→G 的依赖链（「B 封存后才开始 C」、双盲「一次性装置」、返回边）都要重排。
- **评审判据。**`review/choice.md` 与 `roles/design-reviewer/role.md` 的「选择」一行，审的就是「领域读数与机制读数」。
- **角色的必交产出与输入。**
  - `roles/README.md` 与手册 `workspace-context.md` 的分工表都把「C 机制读数」列为主线或负责人亲写。
  - `roles/spec-drafter/role.md` 的开工前提是「主线已经做完领域读数、机制读数与对账」。
  - `roles/realization-drafter/role.md` 的必需输入含「机制读数的装配草图或对应提案」。
- **生成物。**roles 与 skills 是源，要重新编译成 `.claude/`、`.codex/`、`.agents/`。手册 description 会出现在宿主的 skill 列表里，影响何时触发加载。
- **固化投影。**9 份 `projection.md` 的「## 5. Cordis 建模」标题来自手册 G 表那一行。按「出新版，不原地改」，只能在新版里改。
- **现行决定。**D-059、D-023、D-028 的接受以 A→G 主线或落点 #8 为方法前提（见第 4 节）。

---

## 2. 逐范围清单

### 2.1 范围 1：根文档、docs、packages/apps、tools

| 文件 | 原句或片段 | 归类 | 为什么 | 若是 A：依赖的旧前提 |
|---|---|---|---|---|
| `AGENTS.md`（项目心智第 1 段） | 「以 DeepSeek 提出的 Cordis 为内核」 | C | 内核身份不变（裁决原话「Cordis 仍是内核」） | |
| `AGENTS.md` | 「从 DeepSeek Harness 仅复用 Cordis，不复用 DSH `agent` 原语…」 | C | 复用范围 | |
| `AGENTS.md` | 「Cordis 直接使用官方发布包。维护边界归 SYS-KERNEL…」 | C | 采用方式 | |
| `AGENTS.md` | 「**站在 DSH Cordis 的视角建模完全动态系统**：能力的定义、实现、绑定和组合关系都应能动态演化。可替换能力通过有生命周期、作用域和所有权的插件或服务，以及 Context、依赖注入和类型化事件组合。…也不把 Cordis 的运行时对象直接当作数据契约。」 | **A** | 首句明说建模视角是 Cordis。第二句讲用插件、服务、Context 组合，本身是装配（B），但挂在首句下面。末句与新定位一致 | Cordis 是建模视角。段尾自称是 foundation 的「简短投影」，源头是 SYS-DYNAMIC.C2 的澄清（见 2.3） |
| `AGENTS.md` | 「目录不直接对应插件、服务、进程或数据库表」 | B | 装配与目录分离 | |
| `AGENTS.md` | 「Cordis 特性、生命周期和 API 语义优先查官方文档…上游约定不自动成为本项目约定」 | C | 来源核对 | |
| `AGENTS.md`（任务表） | 「核对 Cordis API、依赖、插件或生命周期 → 来源核对」 | C | | |
| `README.md` | 「`omne-harness-lite` 以 DeepSeek 提出的 Cordis 为内核」 | C | | |
| `README.md`（技术基础） | 「从 DeepSeek Harness 仅复用 Cordis…」 | C | | |
| `README.md`（技术基础） | 「**动态组合。**可替换能力以具有生命周期、作用域和所有权的插件或服务组合；定义、运行实例、持久状态与物理部署分别建模。」 | B | 讲能力怎样组合与装配，没说以 Cordis 为视角。「分别建模」的对象是定义、实例、状态、部署，不是 Cordis | |
| `packages/AGENTS.md` | 「不由目录名称推导新的插件、服务或部署边界」 | B | | |
| `docs/workspace.md` | 「目录和包的划分不直接决定插件、服务或部署边界」「也不要求每个 Cordis 插件单独成包」「不机械地为每个插件或每种角色创建包」「Cordis 共用件与 probe」「tenancy 插件与公开服务实现」 | B / C | 包布局与装配分离；目录说明 | |
| `docs/defensive-patterns.md` | 「每个注册、监听、任务、effect、临时资源和外部句柄都应能说明创建者、释放责任和失效时机」「子进程、插件和工具只获得明确授权的…」 | B | 实现与装配的资源纪律 | |
| `docs/verification.md` | 「Cordis 4.0.4 的 8 条 probe」「tenancy 插件的包内场景已是真实测试」 | C | 验证范围 | |
| `tools/model-probe/README*.md` | 「传入…已安装的 `@deepseek-ai/cordis` 4.0.4 的 `Context`…检查真实 effect 释放」 | C | 实验说明 | |
| `tools/core-verification/README_ZH.md` | 「公开 definePlugin…fiberIsActive…Cordis 4.0.4」「PluginDefinition…FiberStateValue」 | C | 测试描述 | |
| `tools/ts-checks/README*.md` | 「`no-bail-control`…不得调用 `ctx.bail(`」「`ops-event-whitelist`…Cordis 上下文…的 `on`／`once`」「`og-s42-dynamic-resolve`…经 `ctx.get(…)`…`inject`…解析只许在 AR」「`ctx.plugin(localCredentialLookupPlugin…)`」 | C / B | 结构规则对装配的机检 | |

`CONTRIBUTING.md`、`apps/AGENTS.md`、`docs/development.md`、`docs/README.md`、`tools/spec-tools` 没有命中。

### 2.2 范围 2：`.meta_harness` 与 `design` 的入口

| 文件 | 原句或片段 | 归类 | 为什么 | 若是 A：依赖的旧前提 |
|---|---|---|---|---|
| `.meta_harness/AGENTS.md` | 标题「## 从需求长出能力，再投影到 Cordis」，以及「**需求的可观察结果 → 现有能力与组合覆盖 → 未覆盖责任 → 能力演化 → 语言无关契约与动作链 → Cordis 插件及组合 → 回到需求核对。**」 | **A·措** | 顺序已是先能力、后契约、最后 Cordis，实质接近新定位。但标题把整个方法表述成「投影到 Cordis」，Cordis 成了设计链的终点形态，而不是「装配时的符合性核对」 | 设计的目标形态是 Cordis 插件 |
| `.meta_harness/AGENTS.md` | 「新增独立维度须给出独立插件边界；正交不等于无依赖或任意可交换」 | D | 见 D1 规则族 | |
| `.meta_harness/AGENTS.md` | 「**目录、类、服务键和插件数量不能代替能力模型**」 | B | 与新定位一致 | |
| `.meta_harness/AGENTS.md`（任务表） | 「新需求、能力边界或插件设计 → 加载 `harness-design-handbook`」 | B | | |
| `.meta_harness/README.md` | 「basis/ 内核与上游的机制语义条目及其 probe」 | C | | |
| `design/AGENTS.md`（红线） | 「产品条款先投影到现有能力及组合；只有合理组合或扩展仍不能拥有剩余独立责任时才提出新能力维度及独立插件边界」 | D | 前半句是能力先行（与新定位一致），后半句属 D1 规则族 | |
| `design/README.md` | 「机制读数失效是因为上游换版本」「basis 内核与上游的机制语义条目及其 probe」 | C | | |
| `design/README.md`（准入表） | realization 一行：「哪个精确契约条款由哪个具体插件、服务或应用兑现」 | B | | |
| `design/README.md`（模板示例） | 「design.md 现有能力覆盖、演化与契约/插件设计」 | B | | |
| `design/README.md`（知识消费） | 「机制读数从 basis 取，不在每次分析里重推」 | C | 用的是手册的「机制读数」概念，但本句只讲读数的来源 | |
| `design/README.md`（知识消费） | 「新独立维度给出独立插件边界；精确承诺归规格，具体兑现归 realization」 | D | D1 规则族 | |

### 2.3 范围 3：foundation

| 文件 | 原句或片段 | 归类 | 为什么 | 若是 A：依赖的旧前提 |
|---|---|---|---|---|
| `foundation/fully-dynamic-system/requirements.md`（SYS-DYNAMIC.C2） | 「2026-09-13 用户进一步澄清 C2 的设计含义：**从 Cordis 视角考虑能力绑定和依赖**，应同时考虑相关生命周期、激活产生的效用及卸载后的逆效用撤回；tool–skill 关系是其中一个例子…」 | **A** | 已确认的需求正文里明写「从 Cordis 视角」。实质要求（生命周期、效用、逆效用撤回）本身不依赖 Cordis | 能力绑定与依赖从 Cordis 视角考虑 |
| `foundation/definition-and-runtime-composition/changes.md`（来源表第 1 行） | 用户原话「…你必须完全站在 Cordis 的模型和系统建模思想的角度来思考」，确认列写「确认本条成立并归 `foundation/`；**确认建模视角为 Cordis**」 | **A** | 现行需求的确认记录直接把「建模视角为 Cordis」登为已确认 | 建模视角为 Cordis（2026-09-17 确认） |
| `definition-and-runtime-composition/requirements.md` C3 | 「能力被声明为必需，不等于 Agent Loop 必须直接 inject 其具体提供者」 | B | 装配关系的限定 | |
| 同上 C4 | 「退役并重建，在 Cordis 的依赖与所有权生命周期下衔接，并显式保存业务连续性」 | B | 装配层衔接 | |
| 同上 C5 | 「撤除的次序与失败的可感知性，不是内核免费提供的」 | C / B | | |
| 同上「机制边界：内核给什么、不给什么」 | 「『依赖注入』在 Cordis 里有精确语义，照字面实现会出事」，以及四行读数（inject、effect、isolate、bail） | C | basis 读数，标为有条件 | |
| 同上 | 「**C1–C4 是建模决定**，即使四条读数全被推翻，『定义是数据、活体是装配产物』依然成立——它的理由…**与内核无关**」 | B（已一致） | 正文自己已经声明建模决定独立于内核，与 changes.md「确认建模视角为 Cordis」口径不一 | |
| 同上「与已有要求的关系」 | SYS-KERNEL 行：「本条陈述建模决定，**不选择具体的内核机制**」；SYS-TENANT 行：「隔离不靠内核的 `isolate`」 | B / C | | |
| `definition-and-runtime-composition/changes.md` | 「2026-09-29…**具体依赖和所有权由 Cordis 技术设计落实**」 | B | 措辞「Cordis 技术设计」偏旧，实指装配与提供者 | |
| `definition-and-runtime-composition/changes.md` | 「`SYS-KERNEL`…**不触碰**」「`SYS-TENANT`…本条明确隔离不靠内核 `isolate`」 | C / B | | |
| `definition-and-runtime-composition/README.md` | 「机制读数落在 `basis/cordis/` 四条目」「内核实际给什么、不给什么」 | C | | |
| 8 份 foundation 子包 README | 「…明确未决项，不选择能力边界、Cordis 插件或提供者。」 | B | 套话 | |
| `cross-system-constraints/requirements.md` SYS-IDENTITY | 「以 Cordis 为内核」 | C | | |
| 同上 SYS-KERNEL | 「从 DeepSeek Harness 仅复用 Cordis，直接使用官方发布包…实际采用的 Cordis 版本与实现映射仍需固定」，以及 2026-09-28 的纠正 | C | 只写采用边界，**没有写 Cordis 的定位**（既没写建模视角，也没写装配契约） | |
| 同上 SYS-OPEN | 「每个节点须区分『公开函数面』与『Cordis 服务面』，前者不得被后者吞没」 | B | | |
| `cross-system-constraints/changes.md` | 「仅采用 Cordis 官方包…」，以及后续复核项 | C | 历史 | |
| `observability-and-logging/requirements.md` | 「关联实际模型、插件/配置版本」「重要配置/权限/插件变更」「新增或修改能力、插件和跨边界流程时…」 | B | 观测对象 | |
| `foundation/README.md` | 「SYS-COMPOSITION：定义、装配与活体三段结构，以及内核实际给什么」 | C | | |

### 2.4 范围 4：手册

逐节判断见第 3 节，这里只列有命中的句子。

| 文件 | 原句或片段 | 归类 | 为什么 | 若是 A：依赖的旧前提 |
|---|---|---|---|---|
| `SKILL.md` frontmatter description | 「先识别它是谁的延伸，**再分别做领域读数与机制读数**，经对账决定落地、补契约还是把代价送回需求方，**最后投影为 Cordis 插件设计**并反向核对」 | **A** | 机制读数作为与领域读数平级的建模读数，是对账的输入 | 能力设计要先经过 Cordis 机制读数 |
| `SKILL.md` 主线一句和流程图 | 「**前身识别 → 领域读数（封存）→ 机制读数 → 对账四表 → …**」，图中「C 机制读数（分解+落点+六问）」 | **A** | 同上 | 同上 |
| `SKILL.md` 纪律「双盲」 | 「领域读数在**任何机制视角之前**完成并封存；步骤 A 也不得使用 fiber/service/effect/label 等机制词汇」 | B（已一致，表述有前提） | 方向与新定位一致（领域先行、不用机制词），但措辞默认存在一个与领域读数对照的「机制视角」 | |
| `SKILL.md` 纪律「契约写性质，提供者设计写绑定」 | 「把机制写进语言无关契约，等于把上游语义焊进领域承诺」，以及 `ctx.intercept` 的例子 | B / C | 与新定位一致 | |
| `SKILL.md` 步骤 A | 「**不做落点分类**」「本批节点落在哪个领域名与包布局下」「装配节点…是否随本批建立」 | B | A 步已经不碰 Cordis | |
| `SKILL.md` 步骤 B | 「精确的机制绑定要等 D 对账通过后才写，在 B 写绑定等于提前看了 C」 | B（已一致） | | |
| `SKILL.md` C1 | 「**粒度**：拆到每个对象能独立回答一次落点提问为止」「C1 对象分解（一切计量的基础）」 | **A** | 对象分解的粒度由 Cordis 落点提问决定，后续计数都以它为基础 | 对象分解以 Cordis 落点为标尺 |
| `SKILL.md` C2 | 落点表 #0–#9：「2 service 条款」「3 effect…宿主 fiber」「4 event…`emit`/`bail`/`serial`/`waterfall`」「5 inject 边」「6 label」「7 fiber」「**8 plugin + service** 独立变化原因且独立消费者」 | **A** | 每个对象按 Cordis 原语逐级判落点；#8 就是「新能力」的判定口 | 能力是否成立由 Cordis 落点决定 |
| `SKILL.md` C2 | 「从大往小问，人会倾向答『这是个新能力』；从小往大问，逼你先证明现有的装不下」 | **A** | 「新能力」的举证用的是 Cordis 落点阶梯 | 同上 |
| `SKILL.md` C3 | 六问：数据还是服务（有没有需要被别人 `inject` 的行为）、哪一层 fiber、要不要 isolate、谁 inject 谁、事件是通知还是控制、装载效应与撤除责任配对 | **A**（按位置） | 内容是装配设计问题（B），但放在对账之前，产出的装配草图作为表 A 的输入 | 装配形状在对账前就定 |
| `SKILL.md` C 结论 | 「对象为什么这样拆、**落点为什么是 #1 而不是 #8**、装配草图为什么三组不拆、**值为什么不进 ctx**——这些会被提供者设计与投影当作依据引用」 | **A·依** | | C 步产物 |
| `SKILL.md` 表 A | 「把 B 的每条性质对到 C 的装配草图上」 | D | 见 D2 | |
| `SKILL.md` 表 B | 「内核不提供：跨 fiber 事务、可靠投递、…」 | D | 见 D3 | |
| `SKILL.md` 表 C | 「不成立且需求正当 → 对象边界画错，**回 C1 重新分解**」 | **A·依** | 返回到 Cordis 落点分解 | C1 |
| `SKILL.md` 表 D | 「先自证（**换一种分解重走 C→D**…）」「**半径异常（落点 #6/#7** 但可观察结果只涉数据或权限差异）」 | **A·依** | 信号以落点编号为触发线 | C2 |
| `SKILL.md` 表 D | 「组合爆炸（实例数是两个以上身份维度的乘积）」 | D | 见 D4 | |
| `SKILL.md` E | 「四表全过，落点 #0/#1 → 直接落地」「落点 #2/#4 → 不得直接落地」「**落点 #8 → 能力覆盖与演化 + 契约与完整动作链**」「落点 #9 → 出主线」 | **A** | 能力推导（S2–S5）只从 Cordis 落点 #8 进入 | 新能力由 Cordis 落点识别 |
| `SKILL.md` F | 四问：dispose 时在途归谁、依赖消失谁被卸载、事件跨边界泄漏、跨进程后哪些保证失效，以及「装配给／协议给…写进契约」 | B | 装配的符合性与反向核对 | |
| `SKILL.md` G 表 | 「涉及的领域对象 \| **C1 对象清单**」 | **A·依** | 投影里的领域对象取自 Cordis 落点分解 | C1 |
| `SKILL.md` G 表 | 「**Cordis 建模**：插件边界、服务面、inject 关系、effect 装卸配对、事件派发模式、装配草图 \| 提供者设计」 | **A·措** | 内容是提供者或装配设计（B），叫「Cordis 建模」 | |
| `SKILL.md` 完整推导触发表 | 「新增能力维度 \| **落点 #8**」 | **A** | 同 E | 同上 |
| `SKILL.md` 返回边 | 「表 C 三行 → C1；**自证 → C**；回询 → B」 | **A·依** | | C 步 |
| `SKILL.md` 双盲一次性 | 「第二遍 B 的执行者已看过机制，产物必须区分…」 | B（已一致） | | |
| `SKILL.md` 最小内核模型引言 | 「投影之前必须知道内核会兑现什么、不会兑现什么，**否则契约会落在错误的边界上**」 | D | 见 D5 | |
| `SKILL.md` 最小内核模型正文与原语表 | 「Fiber 是所有权单位…」「加载由依赖声明驱动…」「只有 effect 注册的副作用被纳管」「服务身份是『服务名 + isolate 标签』」「事件是五种派发」「配置沿上下文向下注入」，以及原语表 | C | 带版本和行号的上游事实 | |
| `SKILL.md` 同节末 | 「纯数据或纯计算不必制造 Fiber；插件数量和服务键数量都不表示能力维度」 | B（已一致） | | |
| `SKILL.md` 取参考页 | 「**落点 #8**，要判断组合、扩展还是新增能力 → 能力覆盖与演化」 | **A·依** | | C2 |
| `SKILL.md` 取参考页 | 「要把契约落实为插件、提供者与装配 → 提供者与装配投影」「某项 Cordis/DSH 行为影响选择 → 最小内核模型 / 来源核对」 | B / C | | |
| `SKILL.md` 贯穿边界 | 「内核给的是运行时的组合与生命周期；租户授权…不因采用 Cordis 而获得」 | B / C | | |
| `SKILL.md` Taste | 「不能只把需求名改成插件名」「投影保留语义对应」 | B | | |
| `references/reconciliation.md` 表 A | 「把领域读数的每条性质，逐条对到**机制读数的装配草图**上」，结果表「能：机制无条件保护该性质…」，以及第二行例子「由子 fiber 的 dispose 级联保护」 | D | 见 D2 | |
| `references/reconciliation.md` 表 B | 「内核不提供 \| 需要时谁来兑现」九行，以及「上游新增原语时须随采用版本复核本表」 | D（清单内容为 C） | 见 D3 | |
| `references/reconciliation.md` 表 C | 「第三行的返回边范围：只重做 **C1 → C2/C3 → D**，不重做领域读数」 | **A·依** | | C1–C3 |
| `references/reconciliation.md` D1/D2 | 「至少换一种对象分解**重走 C→D**」「半径异常 \| **落点到 #6/#7**」「全部依赖 C1 的对象清单」 | **A·依** | | C1、C2 |
| `references/reconciliation.md` 走查示例 | 「**C2 落点**：帧 #1 数据；**订阅 #3 effect；连接 #7 fiber**；游标 #1 数据」 | **A** | 示范把领域对象按 Cordis 原语分类 | 领域对象以 Cordis 落点归类 |
| `references/reconciliation.md` 走查示例 | 「步骤 F：连接 fiber dispose 时未确认的帧不重发…『订阅随连接消失』是装配给的保证」 | B | | |
| `references/project.md`（全页「S6 提供者与装配投影」） | 「需要将契约投影到 Cordis 插件」「从能力维度确定插件边界」「由责任推导运行时形状」「装卸必须成对设计」「落为提供者与应用设计」 | B | 全页是装配与提供者设计 | |
| `references/project.md` | 「新增独立能力维度 \| 定义独立插件承载它的实现、依赖与生命周期」 | D | D1 规则族 | |
| `references/decompose.md` | 「通用关注点和当前插件目录清单不能代替它」「『契约怎样投到 Cordis』是不同的映射」 | B | 全页是能力先行，Cordis 无关 | |
| `references/decompose.md` | S3 表「新增 → …独立插件设计」；「确认新增独立维度后，为它定义**独立的 Cordis 插件实现**」 | D | D1 规则族 | |
| `references/define.md` | 「关键语义明确后做 Cordis 投影」「没有运行行为的记录无需插件」 | B | | |
| `references/intake.md` | 「用户要求『用 Cordis』是设计前提」「不从『新能力』措辞直接推导插件」「插件投影」 | B | | |
| `references/handoff.md` 拥有者表 | 「**步骤 C 的分解理由、落点与装配草图** \| `record/proposals/<topic>/`…」 | **A·依** | | C 步产物 |
| `references/handoff.md` 评审分工 | 「选择 \| 能力边界、…、实现映射节点、**读数**」 | **A·依** | 「读数」含机制读数 | C 步 |
| `references/handoff.md` S8 | 「插件投影与组合责任」「不能按插件数量验收」 | B | | |
| `references/handoff.md` S8 | 「检查新增插件是否只拥有那部分独立责任」 | D | D1 规则族 | |
| `references/handoff.md` 风险分级 | 「L3…内核原语」 | C | | |
| `references/workspace-context.md` 分工表 | 「**B 领域读数、C 机制读数、能力拆分提案（≥3 候选）** \| 主线或负责人亲写…『**系统该怎么切』是判断本身**。B 先写完并封存…再开始 C」 | **A** | 把机制读数算进「系统该怎么切」 | 系统切分包含 Cordis 机制读数 |
| `references/workspace-context.md` | 「设计投影（步骤 G）」「basis 内核与上游的机制语义条目」「不能从插件目录…反推完整范围」「区别于 Cordis 运行时服务/贡献注册表」 | B / C | | |
| `references/review/choice.md` 开头 | 「待审的是…**主线或负责人亲写的领域读数与机制读数**、一次能力边界的选择、…」 | **A·依** | | C 步 |
| `references/review/choice.md` 维度表 | 承载与边界「要求是否先投影到了现有能力与组合」；反向核对；投影对齐 | B | | |
| `references/review/choice.md` 维度表 | 性质承载「对到装配草图上」；内核负面清单「跨 fiber 事务…」 | D | 同 D2、D3 | |
| `references/review/choice.md` 维度表与「对账四表，逐张扫」 | 代价「半径异常、组合爆炸、边界连锁…」；表 D「设计有没有先自证（**换一种分解重走**）」 | **A·依** | | C1、C2 |
| `references/review/choice.md` | 「前四行是对账四表…**评的判据要和写的判据是同一套**」 | （牵动） | 主线一改，本页必须跟着改 | |
| `references/review/choice.md` 待审对象表 | 「**领域读数与机制读数** \| …机制读数引用的 basis 条目 \| …对象分解有没有另一种站得住的切法；**落点分类里『为什么前面几个不是』成不成立**」 | **A** | 评审的对象就是 Cordis 落点分类 | 同 C2 |
| `references/review/choice.md` 待审对象表 | 「**能力边界的选择** \| …领域读数产物（性质表）与**机制读数产物（对象分解、落点）**」 | **A** | 评审能力边界时输入是 Cordis 落点 | 能力边界由落点给出 |
| `references/review/choice.md` 待审对象表 | 「realization 节点 \| …节点的 Cordis 符合性核对表」 | B（已按新定位） | | |
| `references/review/choice.md` 三条纪律 | 「双盲…性质表里出现 fiber／service／effect／label 等机制词」「契约条款里出现 `ctx.intercept`、`serial`、服务键、插件名」 | B（已一致） | | |
| `references/review/choice.md` 审读数纪律 | 「**对象分解给出至少一种别的切法**…机制读数里推导上游行为而没有引 basis 条目的，标为未取证的假设」 | **A·依** | | C1 |
| `references/review/choice.md` 审 realization 节点 | 「绑定对齐先于一切…`intercept`」「装卸配对」「派发模式…`bail`」「装配给 vs 协议给」「**Cordis 符合性核对表**：节点自己填的那张表逐行核」 | B | | |
| `references/review/expression.md` | 「依据在 `design/basis/cordis/async-control-not-bail.md`」「capability 契约…不放具体服务键」「提供者 / 装配设计 \| 具体服务键、插件入口、接线」 | B / C | | |
| `references/review/plan.md` | 「不能仅凭增加插件文件就判新能力交付」「…提供者、插件、服务和模块可并行联合开发」 | B | | |
| `references/topics.md` | 「怎样划插件边界 → 能力边界」「不确定 Cordis 机制能承担哪部分保证 → Cordis 映射」「投影和交付的完整小例子」 | B / C | | |
| `references/source-check.md`（全页） | 「核对 Cordis 与复用原语的实际语义」 | C | | |
| `references/spec-evolution.md` | 「capability 规格…不放具体服务键」「库、服务键、公开接口…改变 → 提供者/装配设计」 | B | | |
| `references/design-decisions.md`、`information-packages.md` | 「投影页」「providers \| 精确能力契约到插件/服务…符合性映射」 | B | | |
| `architecture/foundations/paradigm.md` | 「能力契约定义可观察含义，插件提供者兑现它」「Cordis 投影要能从实际插件、服务、依赖与效应反查能力责任」 | B（已一致） | 全页是能力先行建模 | |
| `architecture/foundations/paradigm.md` | 「新维度…经契约组合，并以独立插件实现进入系统」 | D | D1 规则族 | |
| `architecture/foundations/concepts.md` | 「插件定义」「包／部署单元…与能力、服务、插件实例不要求一一对应」「能力契约到 Cordis 插件的实现映射…由运行时投影说明」「受管 effect」 | B | | |
| `architecture/modeling/capabilities.md` | 「服务或贡献接口是能力对消费者的表面，插件承载该维度的一项具体实现」「语义依赖和撤除政策属于能力契约；具体插件入口、服务键、注入…属于提供者设计」 | B | | |
| `architecture/modeling/capabilities.md` | 「在本方法中，确认新增独立能力维度后，**要定义独立的插件提供者**」 | D | D1 规则族 | |
| `architecture/modeling/state-and-storage.md`、`assurance/*`、`runtime/*` | 「插件卸载就不能隐式删除它」「Context、服务键或 disposer 的存在本身不证明行为」「设计可装卸的插件时…」「不要求每个插件最终成为微服务」 | B / C | | |
| `architecture/reference/cordis-mapping.md` | 「指南正文先定义语言无关的含义，本页记录其与具体内核机制的对应，**供实现核对使用**」 | B（已一致） | | |
| `architecture/reference/cordis-mapping.md` | 「**本指南采用的动态组合视角受 Context 范式启发**」 | D | 见 D6 | |
| `architecture/examples/queue-view.md`、`delivery-growth.md` | 「## Cordis 投影：S6」「投影为独立插件并回到需求」 | B（delivery-growth 属 D1 规则族） | 示例走的是 S1–S8 能力先行路线 | |

`references/delivery-planning.md`、`architecture/runtime/interaction.md`、`modeling/identity-and-scope.md`、`assurance/specification.md`，以及 `examples/model-switch.md`、`prompt-bindings.md`、`storage-replacement.md` 没有命中。

### 2.5 范围 5：其它 skill 的 canonical 源

| 文件 | 原句或片段 | 归类 | 为什么 | 若是 A：依赖的旧前提 |
|---|---|---|---|---|
| `product-design/canonical/SKILL.md` 末段 | 「产品设计完成之后，**向 Cordis 的技术设计**沿 `harness-design-handbook` skill 展开」 | **A·措** | 把整个技术设计称作「向 Cordis 的」 | 技术设计的目标是 Cordis |
| `ubiquitous-language/canonical/SKILL.md` 取名表 | 「`Context`…给模型看的上下文、Cordis Context——一个词三个所指 → `Runtime Context`」 | C / 同形 | 撞名示例 | |
| `design-subagents/canonical/assets/examples/architecture-designer/role.md` | 「涉及 Cordis 实现语义时核对采用版本的官方证据」 | C | | |
| 同上 | 「新增独立维度给出独立插件边界」 | D | D1 规则族 | |
| `domain-objects`、`worktree-discipline`、`write-agents-md`、`write-blog` | 「视角」「isolated」「effectively」「插件」（博客追问示例） | 同形 | | |

### 2.6 范围 6：角色源

| 文件 | 原句或片段 | 归类 | 为什么 | 若是 A：依赖的旧前提 |
|---|---|---|---|---|
| `roles/README.md`「架构、规格与实现映射的起草」 | 「**架构归人。**领域读数、**机制读数**与能力拆分提案由主线或负责人亲自写…**这三样是『系统该怎么切』的判断本身**」，以及「先写完领域读数并封存…再开始机制读数」 | **A** | 机制读数被列为系统切分判断的一部分 | 系统切分包含 Cordis 机制读数 |
| 同上 | 「它对读数找遗漏的性质与混进来的机制视角」 | B（已一致） | | |
| 同上 | 「**这两个角色不合并**（2026-10-01 定）：一个写『契约承诺什么性质』，一个写『用 Cordis 怎么兑现』，**这条分界正是领域建模独立于 Cordis 的落点**…」 | B（已按新定位） | | |
| 同上 | 「realization-drafter 另有一项必交产出：…**Cordis 符合性核对表**」「（Cordis 版本、存储抽象、配置错误收场）、装配草图或提案」 | B（已按新定位） | 装配草图来自 C 步，见 D12 | |
| 同上「按判断对象选择 reviewer」 | 「选择 \| …插件与组合能否兑现」 | B | | |
| 同上「开发责任与并行」 | 「使用 Cordis、拥有 runtime 或被复用不自动归内核」 | B / C | | |
| `roles/design-reviewer/role.md` | 判断表「选择 \| **领域读数与机制读数**、一次能力边界的选择、…」 | **A·依** | | C 步 |
| `roles/spec-drafter/role.md` 开头 | 「**主线已经做完领域读数、机制读数与对账，裁定了契约怎么拆**，并写了一份施工简报」 | **A·依** | 契约拆分的前提里包含机制读数 | C 步 |
| `roles/spec-drafter/role.md` | 「**契约写性质，不写机制。**…`inject`／`effect`／`isolate` 这类词出现在契约正文里就是越界」 | B（已一致） | | |
| `roles/realization-drafter/role.md` | 「**Cordis 符合性核对表是必交的。Cordis 是装配时要满足的契约规范**：节点怎样切成插件、服务怎样声明与注入…」「不把 Cordis 的机制写回契约」 | B（已按新定位） | | |
| `roles/realization-drafter/role.md` 任务输入 | 「**机制读数的装配草图**或对应提案」 | D | 见 D12 | |
| `roles/realization-drafter/role.md` | 「先加载 handbook：三条纪律、『Cordis 最小内核模型』…」「一条 fiber 还是拆、必需 inject 还是可选」「插件边界、服务面」 | B / C | | |
| `roles/realization-drafter/claude.yaml`、`codex.toml` description | 「design with the contract-to-Cordis projection」 | B | | |
| `roles/developer/role.md` | 「使用 Cordis 官方发布包的组合机制…一个机制有 runtime、用了插件或被多个能力复用，都不使它归内核」「也不要求每个数据对象成为插件」 | B / C | | |
| `roles/developer-contract.md` | 「消费插件、服务或跨能力交接时…」「Cordis/DSH 事实沿 source-check 核对」「不把『新增一个函数/插件文件』当作新能力」 | B / C | | |
| `roles/engineering-taste.md` | 「每个能力分清『公开函数面』与『Cordis 服务面』」「编译选项按实际 Node/Cordis 依赖验证」 | B / C | | |
| `roles/verification-developer/role.md` | 「不要求每个插件运行统一场景集」 | B | | |
| `roles/drafter-contract.md`、`implementation-review-checklist.md`、`developer-task.md` | — | 无命中 | | |

### 2.7 范围 7：`design/product`

这个区命中的绝大多数是**产品资产「Plugin」**（PF-001/002/003/004/006/020 共约百处）与免责句，属同形或 B。下表只列真正涉及 Cordis 的。

| 文件 | 原句或片段 | 归类 | 为什么 | 若是 A：依赖的旧前提 |
|---|---|---|---|---|
| `product/AGENTS.md`「与技术设计的交接」 | 「产品设计完成之后，**向 Cordis 的技术设计**沿 `harness-design-handbook` skill 展开，产物按其步骤 G 落回本 topic 的 `projection/`」 | **A·措** | | 技术设计是「向 Cordis」 |
| `product/README.md` 目录示意 | 「projection/ **向 Cordis 的技术设计投影**，按版本固化」 | **A·措** | | 同上 |
| `PF-001/README.md` 目录示意 | 「projection/ 向 Cordis 的技术设计投影，按版本固化（派生快照，不是权威）」 | **A·措** | | 同上 |
| `product/architecture-core.md` | 「与 Cordis 的『内核层』不是一回事」 | 同形 / C | 辨义 | |
| `PF-004/decisions.md`（2026-09-17 行） | 「设计时要带着 **Cordis 视角**与对 live-agent 架构模型的理解去分析顺不顺 \| 用户直接指示 \| 作为**分析方法**生效，不作为正文内容」 | **A** | 现行产品裁决明确把 Cordis 视角定为分析方法 | Cordis 是分析（建模）视角 |
| `PF-004/interviews/2026-09-17-definition-assembly-liveness.md`，以及 interviews/README 的索引行 | 「标题：要带着 Cordis 视角与 live-agent 的架构模型去分析」「虽然我们在做产品设计，但是其实你设计的时候还是要带着 Cordis 视角」 | **A**（历史访谈） | 已发生的记录 | 同上 |
| `PF-004/interviews/2026-09-29-agent-runtime-assembly.md` | 「产品上的处置只给原则，并且应当是在 **Cordis 范式**或者说框架下合理的处置原则」 | D（历史访谈） | 见 D8 | |
| `PF-002`、`PF-004`、`PF-012`、`PF-014`、`PF-015` 的 `decisions.md`（2026-09-29 同一段） | 「撤销、卸载与不可用只规定 **Cordis 范式下合理的产品原则**」 | D | 见 D8 | |
| `PF-002`、`PF-004`、`PF-006`、`PF-010`、`PF-012`、`PF-015` 的 `decisions.md`（2026-09-29 同一组段落） | 「**框架核对依据**：Cordis 4.0.4 必需服务提供者变化读数区分提供者换代／不可用…**这里只据此约束产品原则**，不指定 inject、effect、插件层次或 API」，以及「PM 推导…故不从它推出提供者换代或 Loop 重建」 | D | 见 D9 | |
| `PF-004/design.md` | 「具体装卸顺序、等待、回退和重试由 **Cordis 范式下的技术设计**落实」 | **A·措** | | 技术设计以 Cordis 为范式 |
| `PF-004/design.md` | 「这里的『注入』…不指定 Cordis service 名称、plugin 切分或 inject 配置。**Session 是长期数据与归属，不是一个天然存在的 fiber。**」「Skill 数据不天然对应一个 fiber」 | B（已一致） | 用机制词作否定式辨义 | |
| `PF-012/decisions.md`（2026-09-23 行） | 「所有拓展件都视作 opt-in 的可插拔服务…；**要从 Cordis 的视角把拓展件视作 plugin**」，原话「你从 Cordis 的视角和架构思想来思考一下可能就清楚得多了，把拓展件视作 plugin」 | **A** | 产品规则（不可用即卸载）明确从 Cordis 视角推出 | Cordis 是产品与领域规则的推理视角 |
| `PF-012/decisions.md`（推导表） | 「不可用＝视作卸载…\| 『把拓展件视作 plugin』这条裁决 **+ 本项目以 Cordis 为内核：插件的依赖不在，它就不被装载**」 | **A·依** | | 上一行 |
| `PF-012/decisions.md` | 「框架核对依据：Cordis 4.0.4 必需服务提供者变化读数…这里只据此约束产品原则」 | D | 同 D9 | |
| `PF-012/design.md` §5.8 理由 | 「**为什么这样分**：装与卸是一件插件的生命周期，『它此刻在不在』是事实」 | D | 见 D10 | |
| `PF-012/design.md` | 「撤销、卸载与不可用只给产品原则；具体衔接归 **Cordis 范式下的技术设计**」 | **A·措** | | 同 PF-004 |
| `PF-012/design.md`；`PF-009/design.md`（三处）；`PF-009/README.md` | 「将来会有的其他视角（链到 PF-007 §6.12 `Cordis()`）」「十三扇门与常驻预算、**Cordis 视角的 scope**」 | D | 见 D11 | |
| `PF-012/interviews/2026-09-18-agent-loop.md` | 「（…organization context、account context…也就是 **Cordis 视角的 scope**）发生变动也是事件」 | D（历史访谈） | 同 D11 | |
| `PF-012/interviews/2026-09-19-loop-extension-points.md` | 14 处 Cordis 机制词 | 只统计 | 未逐句读 | |
| `PF-007` 的 design / flows / acceptance / README / decisions / changelog / interviews | 元能力 **`Cordis()`**：「通向系统自身的装配（定义完整，本版不实现）」「**有哪些插件活着**，以及它们的父子关系」「能被看见的东西，由各个插件自己贡献」「本节按 DSH 的同名工具完整复刻」 | D | 见 D11 | |
| `PF-007/decisions.md`（2026-09-17 请示获准一行） | 用户原话括注「也是一种 Cordis scope 注入在 agent runtime」，处置「**括号里的 Cordis scope 与分类模型属技术实现，产品正文不写**」 | B（已一致） | 当时已排除出正文 | |
| `PF-011/decisions.md` | 「**内核的地基**：内核有 supervision tree 的形状，没有 supervision escalation 的语义：fiber 父子链只管生命周期归属…」「`design/basis/cordis/` 下有一条的结论成立、机制说反了」 | C | 上游事实用作产品取舍的背景 | |
| `PF-001`、`PF-002`、`PF-006`、`PF-000` 的辨义段 | 「不是 Cordis 的 `Context`」「**Plugin 不是 Cordis plugin**」「不是 Cordis service」「Cordis plugin 不在其中」 | 同形 / B | 辨义，与新定位一致 | |
| `PF-002/design.md` 非目标表 | 「Cordis plugin、Service、Middleware 等实现概念 \| 技术设计。产品正文出现它们，只会让读者以为自己需要理解运行时」 | B（已一致） | | |
| `PF-015/design.md` | 「产品上说『给 Session 注入』…**不意味着 Session 本身是一个 Cordis fiber**…具体 inject 边、插件与作用域布局归技术设计」 | B（已一致） | | |
| `PF-002`、`004`、`006`、`007`、`010`、`012`、`015` 的 README 修订行 | 「本轮为产品规则与消费边界的修订，**未据此接受具体 Cordis 插件划分或实现**」 | B | 免责 | |
| `PF-020/design.md` | 「规定所有资产包内部的完整格式、Schema 或 Cordis 装载实现」（非目标） | B | | |
| `PF-021/design.md` | 「插件、服务数量与部署位置由后续架构决定」「协议、存储、进程划分…插件数量与具体 hook 绑定 \| 归后续架构与规格」 | B | | |

### 2.8 范围 8：统一语言与领域对象

| 文件 | 原句或片段 | 归类 | 为什么 |
|---|---|---|---|
| `ubiquitous_language/index.md`、`terms/architecture-core-and-extension.md` | 「架构内核…**与 Cordis 的『内核层』不是一回事**」 | 同形 / C | 辨义 |
| `terms/architecture-core-and-extension.md` | 「与上游内核不是一回事。那指 **Cordis 与 DSH `agent` 原语**」 | C（**已过时**） | 与 SYS-KERNEL 2026-09-28 纠正不一致（已不复用 DSH `agent` 原语），`cross-system-constraints/changes.md` 已点名待复核。与建模视角无关 |
| `terms/capabilities-and-composition.md`（UL-plugin） | 「**不是 Cordis plugin**——那是运行时的代码装载单元，属技术设计」 | 同形 / B | |
| `terms/capabilities-and-composition.md`（UL-model-adaptation-binding） | 「与模型档案的范围身份、凭据以及 Cordis fiber 实例身份不同」 | 同形 / B | |
| `terms/agent-runtime-loop.md`（UL-runtime-injection、UL-incremental-loading） | 「**不是依赖注入**（DI）」「必需能力声明本身不等于 Cordis inject 边」 | B（已一致） | |
| `terms/scope-and-resolution.md`、`record-and-context.md`、`reach-and-availability.md` | 「不是 Cordis 的 `Context`…指它时必须写全 `Cordis Context`」「指前者时必须写全 `Cordis service`」 | 同形 / B | |
| `conflicts.md` C-1 | 「再加上 Cordis 的 `Context`（依赖注入容器）」 | 同形 | |
| `conflicts.md`（C-47 处置） | 「撤销、卸载和不可用只规定产品原则，**具体衔接归 Cordis 技术设计**」 | B（措辞偏旧） | |
| `terms/grounding-and-isolation.md` | 「isolated」「effects do not persist」 | 同形 | |
| `decisions.md` | 「根 AGENTS.md 已经用『内核』指 Cordis 与 DSH 原语那层技术底座」「两块运行时 inject 的每个依赖」 | C | 历史 |
| `domain_objects/**` | 没有 Cordis 机制词；「视角」「身份机制」均为同形 | 无 | **没有条目依赖 Cordis 概念** |

结论：没有词条或对象条目的**定义**依赖 Cordis 概念。Cordis 只以「别混」辨义的形式出现。

### 2.9 范围 9：`design/spec`（只做统计）

`contract.md` 共 112 份。用 `Cordis|fiber|ctx\.|服务键|\binject\b|\bisolate\b` 计数，命中 49 份。按性质分三类：

**(a) 同形，与 Cordis 无关**

- `data.loop-extension/v2–v6`（每份 16）、`capability.loop-extension-runner/v2–v5`（每份 10）、`capability.hooks-import/v2`（12）：`inject` 是拓展件的**结论种类**。例句：「`record` \| `inject`：一条以本件名义的『本件这一次没跑成』提醒」（LR5）。
- `composition.governance-center-entry-https-json/v3`、`composition.governance-center-entry/v3`：`restore-isolated` 是运维工具名。
- 资产契约（asset-model v2/v3、asset-registry v2–v4、asset-evaluation v2–v4、asset-governance v2、asset-transfer v2）中约 470 处 `plugin`、98 处「插件」：产品资产「Plugin」。
- `effect` 绝大多数是 `effective*` 字段；裸词 `effect` 共 28 处。

**(b) 服务键候选名，提供者层信息进了契约正文**

| 契约坐标 | 处数 | 例句 |
|---|---|---|
| `capability.assembly-manifest/v2` | 3 | 「服务键候选 `assemblyManifest`」「`dependencyPresence` 在本契约里是 `assemblyManifest` 的一个查询，不另设服务键」 |
| `capability.assembly-manifest/v3`、`v4` | 各 1 | 「服务键沿用节点候选名 `assemblyManifest`」 |
| `capability.credential-custodian/v2` | 1 | 「服务键 `credentialCustodian` 见 D-060 §八 M69」 |
| `capability.execution-environments/v2` | 1 | 「账本只给了服务键 `executionEnvironments`」 |
| `capability.run-attempt-facts/v2` | 2 | 「服务键候选 `runAttemptFacts`」 |
| `capability.session-log/v2`、`v3` | 2 / 1 | 「服务键沿用节点候选名 `sessionLog`」 |
| `capability.session-tenancy/v2` | 2 | 「服务键候选 `sessionTenancy`」 |

**(c) Cordis 机制作为契约推理或辨义**

| 契约坐标 | 处数 | 例句 |
|---|---|---|
| `data.identity-values/v1` | 6 | 「运行实例身份（如 Cordis 的 `Fiber.uid`）只在本次 registry 内有效」「服务可见性隔离（Cordis `isolate` 一类）隔的是服务实例的可见性」（辨义、否定式） |
| `capability.organization-governance/v1–v3` | 各 3 | 「**本契约 inject 账号能力的读面**，账号提供者换代本来就会重跑本契约」（用 Cordis 重跑半径论证边界） |
| `composition.account-registration/v1`、`v2` | 6 / 3 | 「必需服务换提供者会使插件体先卸载再重跑（basis）」「**跨 fiber 事务** / 跨边界原子提交 \| …不用」（内核负面清单进契约） |
| `composition.governance-center-entry/v1` | 3 | 「**装配给**：入口层对它消费的每一个面都是必需依赖…（`inject-has-no-optional-form`）」「同一棵上下文树里任何插件都解析得到」 |
| `capability.stream-assembly/v2`、`v3` | 2 | 「宿主因所依赖的服务换了提供者而重建时，它手里的值随之丢失（basis：必需服务换提供者会使插件体重跑）」 |
| `capability.model-request-runtime/v3–v12` | 各 1–2 | 「纯函数独立消费…**未装 Cordis**/会话/目录/存储也能执行」（SYS-OPEN） |
| `capability.model-profile-directory/v3–v5` | 1 | 链接锚点 `#cordis-投影与生命周期` |
| `data.model-profile/v3–v6` | 1 | 「不得用运行时对象的实例编号（包括 Cordis Fiber uid）替代修订」 |
| `data.skill-package/v2`、`v3`；`data.tool-definition/v2`、`v3` | 1 | 「**不是 Cordis service**」 |

### 2.10 范围 10：realization、basis、projection（只做统计）

| 区 | 文件总数 | 含机制词 | 含字面「Cordis」 | 把 Cordis 说成「建模视角」的句子 |
|---|---|---|---|---|
| `design/realization/**` | 333 | 269 | 253 | **未找到**。用 `Cordis…视角/建模/范式/角度` 双向正则搜索，唯一命中是 `model-request-runtime/v20-reference-lifecycle-design.md` 的「DSH registry 范式仅是提案的对比输入」，与此无关 |
| `design/basis/**` | 11 | 9（8 条 `cordis/` 条目与 README） | — | 未找到。`basis/README.md`「设计分析的机制读数从这里取」属 C |
| 各 topic 的 `projection/**`（共 67 个文件，其中 28 份 `projection.md`） | 67 | 35 | 31 | **9 份 `projection.md` 的标题是「## 5. Cordis 建模」或「## 5. Cordis 建模、存储与装卸」**，属 A·措：PF-001 v1/v2/v3、PF-002 v3、PF-003 v3、PF-006 v3、PF-013 v3、PF-017 v1/v2。抽读 PF-001 v1 §5，内容是「插件与服务面」「依赖与重载」等提供者设计摘要（B）。这些是固化版本，按规矩不原地改 |
| `design/views/**` | — | 1（domain-object-map 资产行的「插件」，同形） | — | — |

`design/projection/` 这个目录不存在，投影挂在各 topic 下。

已经按新定位写的：

- `realization/README.md`：「**Cordis 符合性核对表**（2026-10-01 起）：Cordis 是装配时要满足的契约规范…它只核节点对 Cordis 的符合性」
- `realization/.templates/node/design.md`：「## 能力到 Cordis 的投影」「## Cordis 符合性核对」及模板提示
- `realization/AGENTS.md`：「不把机制写回契约」

目前只有模板与 README 提到这张核对表，没有既有节点填过。

### 2.11 范围 11：record

见第 4 节。

---

## 3. 手册主线专节（A–G 现状）

| 步 | 现在 Cordis 处在什么位置 | 独立于 Cordis 的领域与能力建模部分 | 装配时的符合性核对部分 | 已与新定位一致的判据 |
|---|---|---|---|---|
| **纪律** | 三条纪律中只有「契约写性质，提供者写绑定」直接谈机制，并以 `ctx.intercept` 为反例 | — | 绑定成立前「先验证对齐」；跨 owner 同提交要指出共同存储对象 | **双盲**（领域读数在机制视角之前封存、步骤 A 不用 fiber/service/effect/label）；**契约写性质**（机制不进契约）。双盲的措辞默认「机制视角」是与领域读数对照的一种读数 |
| **A 前身识别** | 明确排除：「不做落点分类」、不用机制词 | 装配基准声明、相关需求条款、领域对象（取自 `domain_objects`） | 「本批节点落在哪个领域名与包布局下」「装配节点…是否随本批建立」属于实现映射的规划，不涉及 Cordis 原语 | 全步已不依赖 Cordis |
| **B 领域读数** | 不出现 Cordis；只在「在 B 写绑定等于提前看了 C」里把 C 当后继 | 确认状态、可观察结果、三类性质及责任归属层 | — | 全步已不依赖 Cordis。封存的理由（「机制的形状会反向裁剪性质集合」）与新定位同向 |
| **C 机制读数** | **核心建模步**：C1 对象分解的粒度由「能否独立回答一次落点提问」定；C2 用 Cordis 原语阶梯（service/effect/event/inject/label/fiber/plugin+service）给每个对象判落点，#8 即新能力；C3 六问在对账前定装配形状，产出「装配草图」；结论要落进 `record/proposals` | C1 的「名字、领域含义、生命周期特征」与「以 `domain_objects` 为共同基线、差异报给维护者」本身不依赖 Cordis；C2 的 #0「什么都不改」、#1「数据」、#9「非结构性」是领域层判断 | C3 六问的问题本身（数据还是服务、哪一层 fiber、要不要 isolate、谁 inject 谁、事件通知还是控制、装卸配对）是装配设计问题，与 `project.md`、realization 节点模板的符合性核对表大体重合 | 无。C 整步按旧定位写成，影响面最大 |
| **D 对账四表** | 表 A：领域性质对到 **C 的装配草图**；表 B：Cordis 不提供的九类保证（内核负面清单）；表 C：复查已有对象，第三行回 C1；表 D：自证（换分解重走 C→D）与四信号，「半径异常」以落点 #6/#7 为触发线 | 表 C 的问题（原有不变式是否仍成立、收紧需求还是边界画错）、表 D 的回询四段格式、「需求未要求的钉死」与四条「违背设计理念」判据（能力独立演化、装卸对称、依赖显式、生命周期有主）都可以不经 Cordis 表述 | 表 A 的实质（机制是否承载某性质、有哪些前提）和表 B（是否误以为内核兑现了某保证）性质上是装配时的符合性核对，但现在放在对账位置，结果还会经返回边改变对象分解 | 「这四张表不评判需求正当性，它们给需求标价」；表 A「第一、二行也必须产生契约条款」（性质一律进契约） |
| **E 展开** | 路由表按落点编号分流：#0/#1 直接落地，#2/#4 走规格演进，**#8 才进入能力覆盖与演化（S2–S3）和契约与动作链（S4–S5）**，#9 出主线 | 被路由到的 S2–S5（`decompose.md`、`define.md`）本身是能力先行、不依赖 Cordis 的完整方法 | 「表 A 一/二行 → 性质入契约、绑定入提供者设计」 | S2–S5 参考页整体 |
| **F 反向核对** | 四问都用运行时语汇（dispose、卸载、事件泄漏、跨进程） | 「跨进程后哪些保证失效」的结论写进契约 | 四问本身就是装配后的符合性与在途归属核对，与 `review/choice.md`「审 realization 节点」和节点模板的符合性核对表同类 | 「装配给的保证在分布式演化时须由协议重新兑现」 |
| **G 投影视图** | `projection.md` 必含表中「涉及的领域对象 ← **C1 对象清单**」与「**Cordis 建模**：插件边界、服务面、inject 关系、effect 装卸配对、事件派发模式、装配草图 ← 提供者设计」 | 需求条款、确认状态、三类性质、操作的九件事、未决 gap | 「Cordis 建模」一行的内容就是提供者设计的装配部分 | 「在 realization 节点的独立评审闭合之后再落」「出新版，不原地改」 |
| **主线外围** | 「仍须走完整推导：新增能力维度 ← 落点 #8」；返回边「自证 → C」「表 C 三行 → C1」；参考页路由「落点 #8 → 能力覆盖与演化」；「Cordis 最小内核模型」的引言称「投影之前必须知道内核会兑现什么…否则契约会落在错误的边界上」 | — | 最小内核模型的正文（Fiber、加载、effect、服务身份、事件、配置、原语表）是 C 类事实，供装配核对使用 | 「纯数据或纯计算不必制造 Fiber；插件数量和服务键数量都不表示能力维度」；贯穿边界「租户授权…不因采用 Cordis 而获得」；Taste「不能只把需求名改成插件名」 |

**受影响的连带页**

- `references/review/choice.md`：「评的判据要和写的判据是同一套」，与主线 C/D/E 同步。
- `references/workspace-context.md`：分工表的「C 机制读数 \| 主线或负责人亲写」。
- `references/handoff.md`：「步骤 C 的分解理由、落点与装配草图」的归属、评审分工里的「读数」。
- `references/reconciliation.md`：全页。

S1–S8 参考页与 `architecture/` 参考包里，除「新增独立维度 → 独立插件」规则族（D1）外，没有 A。

---

## 4. 现行有效的相关决定（范围 11，以及作为需求或产品依据的裁决记录）

| 记录 | 状态 | 一句话摘要 | 与旧定位的关系 |
|---|---|---|---|
| `record/decisions/assets-runtimes-split-and-rulings/`（**D-059**） | 已接受（拆分、领域名、装配落点；契约另行接受） | 接受资产、工具、模型三块的能力拆分：assets 取 B（「治理与流转合成一个插件」），tools 取 C（「五份能力契约各一插件，执行宿主只 inject 存储与时钟」），model 取 A·A·A | 来源提案 `capability-split-tools/README.md` 的选择对象是「块 B **机制读数判为落点 #8（plugin + service）**的五个对象」；`capability-split-model` 是「机制读数给出的三个落点 #8 对象」。能力拆分以 Cordis 落点为入口，拆分结果用插件或 inject 表述。**依赖最强** |
| `record/decisions/tenant-domain-design-acceptance/`（**D-023**） | 已接受（设计链，止于设计） | 接受租户领域五份契约 v1、能力拆分「维持五份 + 两处修正」、六个 provider 节点设计与投影 v1 | 方法前提写明「`harness-design-handbook` 主线 A→G 走完」。来源提案 `tenant-capability-split` 部分用 Cordis 重跑半径论证边界（「治理 inject 账号读面，账号提供者换代本来就会重跑治理；A 买到的是反方向的半径收敛」） |
| `record/decisions/governance-center-design-acceptance/`（**D-028**） | 已接受（设计链） | 接受入口契约 v1、账号能力 v2、「③ **能力边界选择：入口层作为独立 fiber（候选 A）**」与六个节点设计 | 方法前提「主线 A→G 走完」。来源提案的选择对象是「入口层与运维面**在 Cordis 装配里落在哪**」，实质是装配落位（B），但决定把它记为「能力边界选择」（见 D13） |
| `record/decisions/model-request-image-preparation-adoption/`（D-109）、`model-runtime-reference-lifecycle-adoption/`（D-110） | 已接受（技术采用） | 接受提供者技术方案与契约版本 | 来源提案带独立的「C 机制读数」（落点 #0/#1/#2 分类），但接受对象是提供者或装配设计（B）。**依赖弱**，只是方法上走过 C |
| `record/decisions/assets-runtimes-node-acceptance/`（D-062） | 已接受（节点设计） | 接受 32 个新节点与 3 处修订的设计：「插件边界、服务键、inject 边…effect 装卸配对、事件派发模式」 | B（装配设计的接受），不以建模视角为前提 |
| `record/decisions/cordis-adoption-version/`（D-025） | 已接受 | Cordis 采用版本 4.0.4 | C |
| `record/decisions/mainline-self-rulings-2026-09/`（D-060）、`message-and-shape-rulings/`（D-058） | 已接受 | 主线自定裁决汇编、形状裁决 | 只做了关键词统计：D-060 有 33 处插件、inject 等词，没有「Cordis/机制读数/落点 #」字样。未逐条判断 |
| `foundation/definition-and-runtime-composition/changes.md`（需求确认记录，非 record） | 现行 | 2026-09-17 确认 SYS-COMPOSITION 成立，「**确认建模视角为 Cordis**」 | A。新决定若取代，需要声明对这一行的取代范围 |
| `foundation/fully-dynamic-system/requirements.md`（需求正文中的澄清） | 现行 | 2026-09-13 澄清 SYS-DYNAMIC.C2：「**从 Cordis 视角考虑能力绑定和依赖**…」 | A |
| `product/PF-004-…/decisions.md` 2026-09-17 行（产品裁决） | 现行 | 「设计时要带着 **Cordis 视角**…作为分析方法生效」 | A |
| `product/PF-012-…/decisions.md` 2026-09-23 行（产品裁决） | 现行 | 「拓展件不可用即卸载…**要从 Cordis 的视角把拓展件视作 plugin**」，下游是 PF-012 §5.8 与 UL「拓展件不可用处置」 | A |
| PF-002/004/012/014/015 的 2026-09-29「直接裁决」段 | 现行 | 「撤销、卸载与不可用只规定 **Cordis 范式下合理的产品原则**」 | D（见 D8） |

---

## 5. D 类清单（需要负责人或主会话判断）

| # | 位置 | 为什么说不准 |
|---|---|---|
| D1 | 「新增独立维度须给出独立插件边界」规则族，共 11 处：`.meta_harness/AGENTS.md`、`design/AGENTS.md`、`design/README.md`、`decompose.md`（S3 表与「为它定义独立的 Cordis 插件实现」两处）、`project.md`、`handoff.md` S8、`paradigm.md`、`capabilities.md`、`examples/delivery-growth.md`、`design-subagents` 示例 role | 能力维度先行，这一点与新定位一致；但规则把能力维度与 Cordis 插件绑成一对一，并把它当作能力建模的必交产出。可以读作「装配时的符合性要求」（B），也可以读作「能力边界要以插件边界表达」（A） |
| D2 | 表 A 性质承载：`SKILL.md`、`reconciliation.md`、`review/choice.md` | 实质是「机制承载哪些性质、带什么前提」，即符合性核对；但在主线里位于对账、对的是 C 的装配草图，结果还会改变对象分解 |
| D3 | 表 B 内核负面清单，以及 E「表 B 命中 → 在相应契约补写保证，**并写明内核不兑现这一点**」 | 清单内容是 C；作为提问器，接近「装配时核对是否误以为内核兑现」。但「契约写明内核不兑现」会让语言无关的契约提到内核（例如 `composition.account-registration` 里的「跨 fiber 事务…不用」） |
| D4 | 表 D「组合爆炸（实例数是两个以上身份维度的乘积）」 | 字面是通用判据，但「把优先级覆盖误读成叉乘」的语境指的是 isolate/label 实例 |
| D5 | `SKILL.md`「Cordis 最小内核模型」引言「否则契约会落在错误的边界上」 | 可以读作「契约要写清内核不给的东西」（B），也可以读作「内核决定契约边界」（A） |
| D6 | `cordis-mapping.md`「本指南采用的动态组合视角受 Context 范式启发」 | 说的是方法论的思想来源（论文），不是 Cordis API；「视角」一词是否在新定位下保留，需要判断 |
| D7 | `.meta_harness/AGENTS.md` 标题「从需求长出能力，再投影到 Cordis」 | 已按 A·措计入。若负责人认为「投影」可以视为装配映射，则属 B |
| D8 | PF-002/004/012/014/015 的 2026-09-29 段「Cordis 范式下合理的产品原则」，以及访谈原话「应当是在 Cordis 范式或者说框架下合理的处置原则」 | 「合理」可以理解为与装配契约相容（B），也可以理解为以 Cordis 范式推导产品原则（A）。属于产品负责人原话的落点 |
| D9 | 6 份产品 `decisions.md` 的「框架核对依据：Cordis 4.0.4 必需服务提供者变化读数…**这里只据此约束产品原则**」 | 产品原则的约束来源是内核读数。新定位下内核读数是否还能约束产品原则，需要判断 |
| D10 | PF-012 §5.8 理由「装与卸是一件插件的生命周期」 | 产品规则本身用产品语言写成，理由沿用 2026-09-23 的「Cordis 视角」裁决 |
| D11 | PF-007 元能力 `Cordis()`（「有哪些插件活着」「检视面由插件自己贡献」「按 DSH 的同名工具完整复刻」），以及 PF-009/PF-012「Cordis 视角的 scope」的引用 | 一项产品能力以内核命名，内容是装配树检视。在新定位下检视装配不冲突，但产品概念依赖 Cordis 的插件父子结构，「Cordis 视角的 scope」也成了产品用语 |
| D12 | `roles/realization-drafter/role.md` 的必需输入「机制读数的装配草图或对应提案」，以及 `roles/README.md` 派发表的「装配草图或提案」 | 装配草图本身是装配产物（B），但现在由 C 步产出 |
| D13 | D-028「能力边界选择：入口层作为独立 fiber」 | 选择对象实为装配落位，决定把它称作能力边界 |

---

## 6. 没覆盖到的

- **spec**：112 份 `contract.md` 只做了关键词统计与抽样（第 2.9 节），没有逐处归类；`examples.md`、`verification.md`、Schema、形式工件没有看。
- **realization**：333 个文件只做了统计和视角措辞的正则搜索，没有逐份读节点 `design.md`；`落点 #` 在 offer-expiry 与 model-request-runtime 的 v5/v15/v20 设计里有引用，未展开。
- **projection**：67 个文件只做了统计、标题正则和 PF-001 v1 §5 抽读。
- **record/proposals**：没有盘点。只读了支撑 D-059、D-023、D-028 的几份提案的开头和候选标题。`record/proposals` 下有 20 余个文件使用「机制读数」或「落点」，属已发生的事，未逐份归类。D-058、D-060 只做了关键词统计，D-061 没有读。
- **产品区**：`interviews/` 与 `changelog.md` 只读了含 Cordis 字面的行。`PF-007/interviews/2026-09-17-survey-of-harnesses.md`（12 处）、`PF-012/interviews/2026-09-19-loop-extension-points.md`（14 处）只计数。产品资产「Plugin」的约百处同形命中没有逐条列出。
- **范围外但相关**（未读全）：
  - `harness-design-handbook/.design/README.md` 自述「harness-design-handbook 是需求到 Cordis 设计的渐进式上下文地图」
  - `agents/evaluation/role-merge-2026-10-01.md` 含「机制读数」
  - 手册 `adapters/` 与 `.claude`、`.codex`、`.agents` 生成物未检查
  - `design_legacy/`、`research/` 按要求未看
- **搜索词局限**：没有用「运行时视图」「内核视角」「装配视角」之类的近义说法单独搜索。用「视角」「范式」「建模」与 Cordis 的邻近组合补搜过，但可能有漏。
- **分支漂移**：两次核对都在 `panqiwei/story-cards`（`328b08b24`）。若工作树在读取间隙切换过分支，个别行的内容可能略有差异。报告给的是原句而不是行号。
