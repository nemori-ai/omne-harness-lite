# PF-002 变更历史

记录**产品设计本身**的演进：哪一版改了什么含义、为什么改、下游要复核什么。
错别字、链接修复、段落搬家不记这里。

技术投影用 `provenance.json` 引用具体 rev，所以这里的 rev 不准会直接传导到实现侧。

## rev 3 — 2026-09-19

**补入第八类资产：Loop Extension（拓展件）。**七类变八类，随
[PF-001 rev 7](../PF-001-identity-scope-and-agent-constraints/changelog.md) 一同修订。

**这一版推翻了 rev 1 立的一句 PM 推导**——「Hooks、Rules 是 Plugin 的组合成员，不是第六类」。
Rules 那一半仍然成立，**Hooks 那一半被改判**。

### 改了什么

| 地方 | rev 2 | rev 3 |
|---|---|---|
| 资产的种类 | 七类 | **八类**，补入 **Loop Extension** |
| Loop Extension 是什么 | 没有位置。挂件按 [Plugin 的成员](decisions.md#二pm-推导)处理 | **一类资产**：挂在 loop 某个位置上的一段判断或动作，声明位置、情形与干预力 |
| Connector 那句「唯一方向相反」 | 「其余六类回答能做什么」 | **改写**。八类里 Connector 仍是唯一回答「从哪里被触达」的，但「其余」不再整齐——**拓展件回答的是第三个问题**：推进的时候在哪些位置插手 |
| Plugin 能组合什么 | Skill、Tool、Slash Command、MCP、Connector + Hooks、Rules | 同前，**Hooks 换成 Loop Extension 正式列入**，Rules 仍按声明性成员 |
| Agent Definition 能组合什么 | 全部七类 | **全部八类** |
| 「谁能组合谁」矩阵 | 7×7 | **8×8**。Loop Extension 那一行全空，**但空的理由与 MCP、Connector 不是一种**，正文分开写了 |
| §5.1 的组合图 | 没画 MCP、Connector | **补全**，并加上 Loop Extension——三者都是叶子 |
| §8 边界 | 「除 PF-001 与 PF-003 外都还没有产品设计」 | **过时了，重写**：装配归 [PF-004](../PF-004-agent-definition-and-assembly/README.md)，拓展点位置归 [PF-012](../PF-012-agent-loop-and-run/README.md)，只剩「资产的开发与发布」没有主 |

### 为什么值得推翻一条已立的推导

rev 1 那条推导**在当时是对的**：挂件没被列进那几类，而组合关系已经成立，
「成员」与「独立资产」不再互斥——按成员处理是唯一自洽的读法。

**变的是前提。**产品负责人要求挂件能被**租户与组织超管各自装、各自覆盖**，
而 [Plugin 的成员不取得独立的顶层生命周期](design.md#plugin)——它拿不到独立的持有与层级求值。
于是只剩两条路：**给成员补一套治理**，或者**让它成为资产**。
后者不新增任何机制，**这就是选它的全部理由**。

### 一条最容易做错的实现

**同一个位置挂多个拓展件，彼此不构成[同标识覆盖](../PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)。**
覆盖的单位是**能力标识**，位置不是标识。
不点破，实现会按「一个位置一个挂件」做，**而那会让第二个挂件被静默丢掉**。

### 下游要复核

- 任何按「资产恰有七类」实现的枚举、校验或界面；
- **[PF-004](../PF-004-agent-definition-and-assembly/README.md) 的装配**：组装时要多认一类资产，
  且**拓展件不进[动作空间](../../ubiquitous_language/terms/capabilities-and-composition.md#ul-action-space--动作空间--action-space)**；
- **[PF-012](../PF-012-agent-loop-and-run/README.md) rev 2** 里「拓展点不是资产」那几处，**已经不成立**，
  该 topic 的 rev 3 一并修订。

本次一并把下游正文里「资产七类」的措辞同步为「八类」（PF-004、PF-005、PF-006、PF-007
与词表），**那些 topic 的实质内容未变，因此不递增它们的 rev**；
词表里只有 [UL-connector](../../ubiquitous_language/terms/capabilities-and-composition.md#ul-connector--连接件--connector)、
[UL-plugin](../../ubiquitous_language/terms/capabilities-and-composition.md#ul-plugin--插件--plugin)、
[UL-agent-definition](../../ubiquitous_language/terms/capabilities-and-composition.md#ul-agent-definition--agent-定义--agent-definition)
三条实质受影响，出处的 rev 标注随之更新，其余保持旧 rev——**那样才看得出哪些条目真被复核过**。

## rev 2 — 2026-09-17

**补入两类资产：MCP 与 Connector。**五类变七类，随
[PF-001 rev 6](../PF-001-identity-scope-and-agent-constraints/changelog.md) 一同修订。

| | rev 1 | rev 2 |
|---|---|---|
| 资产的种类 | 五类 | **七类**，补入 MCP 与 Connector |
| 外部工具来源 | 没有位置 | **MCP**：一批动作的来源，本身不可调用。**它带来的动作不是独立资产** |
| 外部消息来源 | 没有位置 | **Connector**：把外部消息送进来，**方向与其余六类相反** |
| Plugin 能组合什么 | Skill、Tool、Slash Command | 再加 **MCP、Connector** |
| Agent Definition 能组合什么 | 全部五类 | **全部七类** |
| 组合关系表 | 5×5 | **7×7**，MCP 与 Connector 两行**全空** |

### 两条要点

**MCP 的形状等同于「多命令 tool 与它的子命令」**：接入点是资产，内容随它治理。
反过来做——每个 MCP 工具各算一份资产——会让**资产身份随对端版本漂移**，
而资产是要被持有、覆盖、转移的东西，身份必须稳定。

**Connector 是七类里唯一方向相反的一类**，它回答「agent 从哪里被触达」。
这扩展了「组装」的含义，扩展与撤回条件记在
[PF-001 decisions 第四节](../PF-001-identity-scope-and-agent-constraints/decisions.md#四已知的来源问题)。

### 下游要复核什么

- **不要为每个 MCP 工具登记资产。**
- **Connector 的权限必须回答「送进来的消息按什么身份处理」**——不定这一项，
  租户隔离会在入口处破掉。
- Plugin 可打包 MCP/Connector 这一条是 **PM 推的**，见
  [decisions.md 第二节](decisions.md#二pm-推导)，可撤。

## rev 1 — 2026-09-17

**首版。**把 [PF-001](../PF-001-identity-scope-and-agent-constraints/README.md)
里的设置、权限、资产三者展开。

### 这一版确定了什么

| 方面 | 结论 |
|---|---|
| 三者的地位 | 只有**资产**是独立对象；**设置与权限是资产的两种属性** |
| 身份层的设置 | 是**视图**，即该身份持有的资产集合上的投影。最小单位是（身份层，具体资产，属性项）→ 值 |
| 资产的种类 | **五类且穷尽**：Skill、Tool、Plugin、Agent Definition、Slash Command |
| 组合 | **只有一种关系**，贯穿资产之间、资产到 agent、资产到它的属性 |
| 谁能组合谁 | 只有 Agent Definition 能组合全部五类；Plugin 组合 Skill/Tool/Slash Command；Skill 与 Tool 互相引用；Slash Command 绑定 Skill |
| 引用 | 指向**能力标识**，不指向具体资产。组合与依赖同一条规则 |
| 默认与强制 | 一个 `immutable` 标记，管设置、权限、资产替换**三处** |
| 求值 | **四步且顺序不能换**：资产求值 → 组装 → 投影 → 层级计算 |
| 设置页 | **长出来的**，随资产自动增删；分「界面偏好」与「资产设置与权限」两块 |
| 不让用 | **移除**与**禁用**是两个动作，判据是成员该不该知道它存在 |

### 下游要注意的四处

- **不要为「组织设置」建一张独立的字段表。**它会与资产各自演化，最终对不上。
  设置页是持有关系的函数，不需要维护。
- **四步顺序不能换。**项的存在性由组装决定，所以生效值**不可能**在组装之前算出来。
- **引用必须指向能力标识。**指向具体资产的话，组织换上的安全组件进不了 plugin，
  `immutable` 就白标了——漏洞正好留在 plugin 里面。
- **plugin 作者不能假定自己包里的零件不被替换。**他应当面向能力标识编写。
  这是"资产可被自定义替换"的固有代价，不是缺陷。

### 本版刻意不做的三种组合

Skill 套 Skill、Plugin 套 Plugin、Plugin 装 Agent Definition。

三者都**没有已知需要**，且各自会带来环检测或跨层治理的负担。
**加是加法，不用改已有结构**——真实需求出现时再加，不必改动现有形状。

### 本版留下的缺口

- **未决项：无。**
- **待裁决：无。**

被排除的内容在 [design.md §2 非目标](design.md#非目标)，那是**边界**——
发现它们缺失不算缺陷。下游遇到本文档没回答的问题，应当停下来问，
而不是挑一个看起来合理的实现。

---

## 怎么记下一版

改变含义就递增 rev 并在这里加一节。判断标准：
**读者需要据 rev 判断自己手上的理解是否还成立吗？**需要，就记。

每节至少说清三件事：改了什么含义、为什么、下游要复核什么。
