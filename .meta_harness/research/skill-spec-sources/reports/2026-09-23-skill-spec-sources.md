# 2026-09-23 · Skill 规格参考来源：三源逐字段对照与产品条款对照

本报告是首轮调查的完整论证与对照表原貌。当前该信什么以 [research.md](../research.md) 为准；
每条观察的精确出处在 [evidence.md](../evidence.md)，下文用「E 编号」指向。

**本报告不写方案**：对照表里的「需改」「不可承载」是在陈述「拿这个来源的现成结构去承载该条款要付什么代价」，
不是在建议采用或不采用哪一个来源。

## 一、调查对象

| 代号 | 对象 | 精确版本 | 本轮读了什么 |
|---|---|---|---|
| **omne-next** | `/data/qiwei/repos/omne-next` | commit `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，工作树干净 | `omne_skill_spec`（`0.1.0`）、`omne_core_v1/.../agentic/skill/{spec,resolver.py,importer}`、`omne_agent_skills`（`0.3.1`）、`omne_skill_import`（`0.1.0`）；另为版本问题读了 `omne_agent_capabilities` 的少量文件（超出派发清单，只作线索，见第七节） |
| **DSH** | deepseek-ai/deepseek-harness | `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`），本仓库 `tmp/sources/dsh-c291e79.tar.gz` 的解包 | `packages/skill/{skill,skill-filesystem,tool-skill,skill-badge}` 的 `src/index.ts` 与 README、`docs/subsystems/skills.md`、作者笔记 `.agents/notes/archived/feature/2026-07-05-skill-system.md` |
| **Agent Skills 本机实例** | 本机 Claude Code 里实际存在的 `SKILL.md` | Claude Code `2.1.280`；本仓库 `.meta_harness/agents/skills/*/canonical/SKILL.md`（主检出 `2c1a108`）；`~/.claude/plugins/` 下 115 个 `SKILL.md`（marketplace 与 cache 有重复副本；`claude-plugins-official` 于 2026-09-23T04:35:46Z 更新） | 只统计实际出现的 frontmatter 键与插件自带的说明文字；**不引网络上的规格原文** |

派发时提到「两份 omne-next spec 可能已分叉」。本轮结论是：`omne_skill_spec` 与 `omne_core_v1` 的 spec **在 `6263fed` 上是同一份实现**，
真正分叉的是 `omne_agent_skills` 里的**第二套**校验与数据形状（第二节）。

## 二、omne-next：三处代码，两套规格

### 2.1 `omne_skill_spec` 是转发壳，不是第二份实现

`omne_skill_spec/omne_skill_spec/{__init__,models,enums,validator}.py` 在 `6263fed` 上全部是
`from omne_core_v1.agentic.skill.spec... import ...` 的再导出（E1）。`pyproject.toml` 注释
「Phase 4 shim: implementation lives in omne-core-v1」。

把转发前的原件（`9a18efa6f^:omne_skill_spec/omne_skill_spec/*.py`）与 `6263fed` 的
`omne_core_v1/.../skill/spec/*.py` 做 `git diff`：`enums.py` 零差异；`models.py`、`validator.py`
只差 import 路径（E1）。**字段、规则、分级一字未变。**

`omne_skill_import` 同理，是 `omne_core_v1.agentic.skill.importer` 的转发壳（E4）。

附带一处文档与代码不符：`omne_skill_spec/CHANGELOG.md` 的 0.1.0 条目写着 schema 覆盖「metadata, inputs, outputs, and capabilities」，
但模型里**没有** inputs / outputs / capabilities 字段（E1、E2）。

### 2.2 真正的两套：core_v1 spec 与 omne_agent_skills

`omne_agent_skills` 不依赖 `omne_skill_spec` 或 `omne_core_v1`（`pyproject.toml` 依赖只有 `pyyaml`、`omne-core`），
自带 `types.py` 常量与 `load.py` 校验（E5）。逐字段比对：

| 项 | core_v1 spec（`SkillFrontmatter` + `SkillSpecificationValidator`） | omne_agent_skills（`SkillMetadata` + `load.py`） | 差异后果 |
|---|---|---|---|
| **name 语法** | 模型只限长 1–64；校验正则 `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`——**允许连续连字符**，但报错文案写「no consecutive hyphens」 | `^[a-z0-9]+(-[a-z0-9]+)*$`，**禁止连续连字符** | `a--b` 在前者 FULL，在后者被拒（E7 实测） |
| **name 与目录名** | H-004 硬错误：不等即 NON_COMPLIANT | 只在文件型扫描时比对，**不等只打警告**，照样注册 | 同一个目录，一处拒、一处收 |
| **description 超长** | H-005 硬错误（>1024 即拒） | 文件型扫描**截断到 1024 并警告**后照收 | 前者拒收，后者静默改写内容 |
| **正文为空** | H-006 硬错误 | 不检查 | 空正文在后者可注册（E7） |
| **allowed_tools 的键名** | 读 `allowed_tools`（下划线） | 读 `allowed-tools`（连字符） | 同一份 SKILL.md 只会被其中一套读到（E7） |
| **allowed_tools 的形状** | `list[str]`，文档串写「declarative hint, NOT enforced」 | `str`（空格分隔），「must be non-empty if provided」 | 同一概念两种类型 |
| **metadata** | `dict[str, Any]` | `dict[str, str]`，非字符串值报错 | 前者收、后者拒 |
| **license / compatibility** | 都有，compatibility ≤500 | 都有，compatibility ≤500 | 一致；但文件型扫描出的 `SkillMetadata` **只填 name/description/path/source**，这两项与 allowed_tools 全丢（`load.py:326-331`） |
| **资源目录** | S-001 软警告：子目录应只在 `references/ scripts/ assets/` | 同一允许集，但另报「顶层非 SKILL.md 文件」「路径超过一层」「正文超过 500 行」 | 顶层 `README.md` 在前者 FULL，在后者报问题（E7） |
| **frontmatter 定界** | `content.find("---", 3)`——第一个出现的 `---`，**不要求在行首** | 正则 `^---\s*\n(.*?)\n---\s*\n`，要求闭合行 | description 里含 `a---b` 时，前者把 description 截成 `see a` 且判 FULL，后者正常（E7） |
| **判定输出** | 三级 `full / partial / non_compliant`；硬错误即拒绝装载 | 一串字符串；扫描时「warn but don't reject」 | 前者有「拒收」语义，后者几乎只有告警 |
| **文件树类型** | `Mapping[str, str \| bytes]` | `dict[str, str]` | 二进制资源只在前者可表达 |
| **来源枚举** | resolver 的 `SkillSource`：developer / user / agent（注明「owner / permission dimension」） | `Literal["user", "project", "toolset"]`（位置来源） | 同名不同义的两个 `SkillSource` |

**实测**：在 omne-next 自带 `.venv`（Python 3.12.13、PyYAML 6.0.3、pydantic 2.12.5）里直接 import 两套实现，
对同一组输入跑出上表中标 E7 的五处分歧（E7 记录了完整输入与输出）。

### 2.3 core_v1 的 resolver 与 importer

- **resolver**（`resolver.py`）：身份是 `SkillId`（`NewType(str)`），`name` 注明为「Human-readable display name」；
  `ResolvedSkill` 带 `version`、`content_hash`、`status`（enabled / disabled / deprecated，「Lifecycle status of a skill version」）、
  `frontmatter`（**自由 dict，注明「Validation is the consumer's responsibility」**），**不带正文**；
  `resolve(skill_id, version=None)` 缺省取「latest enabled version per the backend's policy」；`list_for_tenant(tenant, agent_id=None)`（E3）。
- **importer**：`SourceSpec → SourceResolver → 发现所有含 SKILL.md 的目录 → 校验 → NormalizedSkillBundle`。
  `ImportProvenance` 记来源格式、位置、ref、时间。**`FormatAdapter` 协议有定义，但 `ImportPipeline.run()` 不调用它**——
  外部格式（`claude_code`、`cursor`、`openhands` 等枚举值）在管线里实际没有适配步骤（E4）。

## 三、DSH：registry / provider / consumer 三包

- **数据形状**（`packages/skill/skill/src/index.ts:40-101`）：`SkillSummary` = `name`、`description`、`whenToUse?`、
  `invocation{modelInvocable, userInvocable}`、`source`、`provider`、`path?`、`resourceBase?`；
  `SkillCandidate` 加 `rank`、`locator`、`metadata?`；`SkillDefinition` 加 `content`（正文）。**没有 version、没有工具声明、没有脚本字段**（E9）。
- **身份与同名**：kebab-case `name` 是唯一寻址键（`index.ts:21,35-37`）；同名先按 scope 层「nearest layer wins」，
  层内再按 `rank`、provider 注册序、provider 内序 first-wins（`index.ts:351-352`、README:141）。被遮蔽的定义**没有 API 可查**（E9）。
- **文件系统 provider**：`<root>/<name>/SKILL.md` 或 `<root>/<name>.md`，只扫一层；五个根按 rank 100–500；
  frontmatter 只收 `name`、`description`、`whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`；
  **不检查 name 与目录名一致**（本轮在 `skill-filesystem/src/index.ts`、README、`docs/subsystems/skills.md` 检索未命中）；
  非法条目**带警告消失**，模型「cannot distinguish an absent skill from an invalid one」（E10）。
- **正文不版本化**：「every load re-reads the current file, so editing a skill body needs no versioning」；
  已读结果是普通工具历史，「No body revision protocol」（E10）。
- **consumer**：会话开始前追加一条 durable 的 `<system-reminder>` 目录（名 + 截到 500 字的描述）；
  模型调 `skill({name})` 取回 `<skill_content>`（含 `<skill_resources>` 与 `<skill_instructions>`）；
  用户在输入里写 `/name` 直接注入同一渲染；`tool-skill` 只注册 `skill` 这一个工具（`tool-skill/src/index.ts:82-85,161`）（E11）。
- **资源寻址**：`resourceBase` 三种——`directory`（给出绝对路径）、`url`、`opaque`；渲染文案是
  「Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.」（`skill/src/index.ts:185-210`）（E9）。
- **作者明确延后的**（笔记 `2026-07-05-skill-system.md:58`）：`context: fork`、`arguments` / `argument-hint`、
  `allowed-tools` / `disallowed-tools`——「do not parse, advertise, or enforce these fields」（E12）。

## 四、Agent Skills 本机实例：实际出现了哪些字段

**本仓库 7 个 canonical skill**：frontmatter 只有 `name`、`description`（7/7）与 `metadata.status: draft`（4/7）；
资源子目录见到 `references/`、`scripts/`、`assets/`（`design-subagents` 三者俱全）（E13）。

**`~/.claude/plugins/` 下 115 个 `SKILL.md`**（含重复副本）的顶层键计数（E13）：

| 键 | 次数 | 出现在哪 |
|---|---|---|
| `name` | 115 | 全部 |
| `description` | 115 | 全部 |
| `version` | 41 | ljg-skills（每个 skill 自带版本，如 `ljg-card` 的 `"2.3.0"`，而插件本身是 `1.17.41`）、官方 example-plugin 等 |
| `user_invocable`（下划线） | 38 | ljg-skills |
| `user-invocable`（连字符） | 13 | codex 插件、官方 discord / imessage / telegram / project-artifact |
| `license` | 10 | 官方 frontend-design 各缓存副本 |
| `allowed-tools` | 8 | 官方 discord / imessage / telegram / claude-security / example-plugin；值是**工具名列表，可带参数模式**，如 `Bash(ls *)`、`Workflow(claude-security:scan)` |
| `tools` | 2 | 官方 claude-code-setup、claude-md-management；逗号串 `Read, Glob, Grep, Bash` |
| `disable-model-invocation` | 1 | 官方 claude-security |
| `argument-hint` | 1 | 官方 example-plugin |

**官方 example-plugin 自带的说明文字**（厂商自述，E13）：

- `skills/example-skill/SKILL.md:51-54`：name（required）、**description（required）：「Trigger conditions - describe when Claude should use this skill」**、version（optional）：「Semantic version number」、license（optional）。
- `skills/example-command/SKILL.md:28-32`：name「matches directory name」、argument-hint、**allowed-tools：「Pre-approved tools for this skill (reduces permission prompts)」**、model。
- `README.md:25`：「Skills are the preferred format for both model-invoked capabilities and user-invoked slash commands」；
  `README.md:50`：`commands/*.md`「is loaded identically to `skills/<name>/SKILL.md` — the only difference is file layout」。

**本会话宿主的行为**（Claude Code 2.1.280，E14）：技能清单以「名 + 描述」列在系统提醒里；插件技能以 `plugin:skill` 命名，
**同一个基名来自不同插件时两条并列**（本会话同时列出 `skill-creator:skill-creator` 与 `anthropic-skills:skill-creator`）；
目录作用域的同名变体（`design-subagents` 与 `.meta_harness:design-subagents`）并列出现，由 Skill 工具说明**指示模型**选「most specific」。

## 五、PF 条款 × 三源对照

判据：

- **可承载**：来源的现成结构原样承载该条款的产品语义。
- **需改**：来源有对应物，但语义或形状不同；补字段或改语义后可承载。
- **不可承载**：来源的既有结构性选择与该条款的前提相冲突，承载它要改掉那个选择。
- **未覆盖**：来源里没有对应物。

产品正文版本：PF-001 rev 15、PF-002 rev 10、PF-003 rev 4、PF-004 rev 9、PF-006 rev 14、PF-007 rev 16。

| # | 产品条款 | omne-next | DSH | Agent Skills 本机实例 |
|---|---|---|---|---|
| 1 | **身份是 name**，同类同名即替代（[PF-002 §4](../../../design/product/PF-002-assets-settings-and-permissions/design.md#skill)） | **需改**：core_v1 resolver 以 `SkillId` 为身份、`name` 只是显示名；omne_agent_skills 以 name 为键、同名按 project > user > toolset 覆盖（后者可承载） | **可承载**：name 唯一寻址，同名按 scope 层与 rank 遮蔽；层序来自 Cordis scope 与 provider rank，不是租户层级 | **需改**：插件技能以 `plugin:skill` 区分，同基名并列而不替代；目录作用域同名由模型按提示选择 |
| 2 | 主体是**可读指引正文** | **可承载**：SKILL.md 正文；core_v1 要求非空 | **可承载**：`SkillDefinition.content` | **可承载**：SKILL.md 正文 |
| 3 | 可带**资源文件** | **可承载**：`SkillFiles` 文件树，`references/ scripts/ assets/` | **可承载**：`resourceBase` 指向目录 / URL / 不透明来源；资源不作为 skill 的成员被建模，只给一个基址 | **可承载**：同名子目录约定 |
| 4 | **读取≠运行脚本**（[PF-002 §4](../../../design/product/PF-002-assets-settings-and-permissions/design.md#skill)、[PF-007 §6.2](../../../design/product/PF-007-meta-capabilities/design.md#62-skills通向任意技能)） | **可承载**：`read_skill` 只返回文本 | **可承载**：`skill` 工具只返回文本 | **可承载**（依据本会话 Skill 工具说明，未对脚本行为做探针） |
| 5 | **不自动装载全部附件** | **可承载**：`read_skill` 缺省只给正文，`file="."` 才列目录 | **可承载**：「resources load only as needed, without directory enumeration」 | **可承载**（同上，未做探针） |
| 6 | 自带设置：**正文变体** | **未覆盖** | **未覆盖** | **未覆盖** |
| 7 | 自带设置：**资源的取用方式** | **未覆盖**：取用方式对所有 skill 相同（`read_skill(file)`），不是每个 skill 的设置 | **需改**：`resourceBase` 是每个 skill 一个的取用方式，但由 provider 决定，不是分层配置的设置值 | **未覆盖** |
| 8 | 自带权限：**谁可以使用它** | **需改**：core_v1 `SkillSource`（developer/user/agent）标为「owner / permission dimension」，`list_for_tenant` 按租户与 agent 过滤；无按主体的使用权限 | **需改**：`invocation` 只分「模型可调 / 用户可调」两个面，不分主体；写在 frontmatter 里 | **需改**：`disable-model-invocation`、`user-invocable` 同 DSH，写在内容里 |
| 9 | **能组合 Tool**，引用指向**能力标识**（[PF-002 §6.3](../../../design/product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)） | **需改**：core_v1 `allowed_tools: list[str]` 是「hint, NOT enforced」；omne_agent_skills 读 `allowed-tools` 字符串，文件型扫描把它丢弃 | **未覆盖**：作者明确延后，不解析 | **需改**：`allowed-tools` 语义是**权限预批准**，值是具体工具名且可带参数模式，不是能力标识 |
| 10 | 依赖**只有且、只有必需**，缺一项即不可用（[PF-006 §4 依赖](../../../design/product/PF-006-tools-and-skills/design.md#依赖)、[可用性](../../../design/product/PF-006-tools-and-skills/design.md#可用性)） | **需改**：`validate_tool_hints` 只返回缺失名单；`tool_hint_warnings` 字段从不被填，`SkillToolHintWarning` 事件从不被发出——缺工具只到「告警」为止 | **未覆盖** | **未覆盖**（本机实例里没有依赖语义的字段） |
| 11 | 不可用时装**同名替换件**，只换说明（[PF-006 §6.3](../../../design/product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)） | **未覆盖**：没有可用性；不合规的直接拒收（`non_compliant`「Rejected — not loaded」） | **未覆盖**：非法条目带警告消失，模型分不出「没有」与「坏了」 | **未覆盖** |
| 12 | 常驻标记在**引用条目**上；非常驻**不占槽位**（[PF-006 §4 常驻](../../../design/product/PF-006-tools-and-skills/design.md#常驻)） | **未覆盖**：omne_agent_skills 把全部 skill 的名与描述注入每次模型调用 | **未覆盖**：目录列出全部模型可调 skill | **未覆盖**：宿主列出全部技能的名与描述 |
| 13 | 带脚本的 skill **声明执行环境需求**（[PF-006 §6.4](../../../design/product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)） | **需改**：`compatibility` 是 ≤500 字的自由文本「Environment requirements」，不是结构化设施声明 | **未覆盖** | **未覆盖**（115 个文件里没有 `compatibility` 键） |
| 14 | `Skills()` **search**；依赖不满足也搜得到并说明缺什么 | **需改**：core_v1 `list_for_tenant` 只有列举；omne_agent_skills 没有搜索 | **未覆盖** | **未覆盖**（宿主直接列清单） |
| 15 | `Skills()` **read 是读取不是激活**，不改系统提示词 | **需改**：omne_agent_skills 的 `read_skill` 可承载；但 core_v1 `ResolvedSkill` 不带正文，协议里没有取正文的操作 | **可承载**：结果是普通工具历史 | **可承载**（依据本会话 Skill 工具说明「instructions load into the turn」） |
| 16 | `Skills()` **exec_script 只跑自带脚本**，执行权随 skill 走 | **未覆盖**：只注册 `read_skill`；脚本由 agent 经别的工具在沙箱里跑 | **未覆盖**：只注册 `skill`；资源给的是绝对目录路径，脚本经通用工具执行 | **未覆盖** |
| 17 | **已发布版本不可变**，旧版本查得到、回退得回去（[PF-001 §6.7](../../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)、[PF-003 §6.6](../../../design/product/PF-003-asset-transfer-and-sharing/design.md#66-重复复制全量覆盖替换)） | **需改**：resolver 有 `version` + `content_hash`、可钉版本，但无不可变承诺；存储侧保留上限 20、超出删最旧（见第七节线索） | **未覆盖**：正文每次重读，没有版本 | **需改**：`version` 是作者自报的 semver，出现在 41/115 个文件，宿主是否据此做任何事未观察到 |
| 18 | 复制时**内容覆盖、配置不动**（[PF-003 §6.7](../../../design/product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)） | **未覆盖**：spec 里没有配置层 | **不可承载**：调用面开关写在 SKILL.md 里，覆盖内容就覆盖了这些开关 | **不可承载**：`disable-model-invocation`、`user-invocable`、`allowed-tools` 都在内容里 |
| 19 | agent 创建修改：要授权、产物是资产、当场能用（[PF-006 §6.9](../../../design/product/PF-006-tools-and-skills/design.md#69-agent-创建与修改工具技能本版只定三条)） | **需改**：`SkillSource.AGENT` 只是来源标签 | **需改**：agent 用一方 write/edit 写 SKILL.md 后，provider 被同步失效、下一步即可见；授权即文件写权限，产物是文件而非资产 | **未覆盖** |
| 20 | 反向：**Tool 组合 Skill**，「有些工具必须与 skill 配套」（[PF-002 §4 Tool](../../../design/product/PF-002-assets-settings-and-permissions/design.md#tool)） | **需改**：omne_agent_skills 的 `SkillableToolsetProtocol` 让一个 toolset **把自己暴露为一份 skill**，正文缺省由工具说明拼成；是「工具即技能」，不是工具引用另一份 skill | **未覆盖** | **未覆盖** |
| 21 | Skill 与 **Slash Command** 分开，绑定多对多（[PF-002 §4 Slash Command](../../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command)） | **未覆盖**（skill 包内没有命令概念） | **需改**：`/name` 直接以 skill 名作入口，一个 skill 一个入口，按名一一对应 | **不可承载**：官方插件说明把 skill 与 slash command 合成同一种文件格式，旧 `commands/*.md`「loaded identically」 |

**不可承载 / 未覆盖行汇总**：

- 三源**全部未覆盖**：#6 正文变体、#11 同名替换件、#12 常驻在引用条目上、#16 exec_script。
- 三源**无一可承载**（都在需改、不可承载或未覆盖）：#7 资源取用方式、#8 谁可以使用、#9 组合 Tool 指向能力标识、#10 依赖决定可用性、#13 执行环境声明、#14 search、#17 已发布版本不可变、#18 内容覆盖配置不动、#19 agent 创建修改、#20 Tool 组合 Skill、#21 与 Slash Command 分开。
- **不可承载**只出现在两处：#18（DSH、本机实例——权限类开关在内容里）、#21（本机实例——skill 与 slash command 合一）。

## 六、加载模型与取用侧命令

| | omne-next（omne_agent_skills） | DSH | 本机实例（Claude Code 2.1.280） |
|---|---|---|---|
| 常驻的是什么 | 全部 skill 的名 + 描述，每次模型调用注入系统提示（`middleware.py:725-790`） | 全部模型可调 skill 的名 + 截到 500 字的描述，作为一条 durable 用户消息，变化时追加整份替换 | 全部技能的名 + 描述，在系统提醒里 |
| 取正文 | `read_skill(name)`，剥掉 frontmatter | `skill({name})`，`<skill_content>` 包裹 | Skill 工具按名加载 |
| 列资源 | `read_skill(name, file=".")` | 无；「without directory enumeration」 | 未观察到专门入口 |
| 取资源 | `read_skill(name, file="references/x.md")`，带路径穿越检查，从沙箱读 | 无专门入口；给基址，模型用通用文件工具按路径读 | 未观察到专门入口 |
| 运行脚本 | 无专门入口 | 无专门入口 | 无专门入口 |
| 用户直接调起 | 无 | 用户输入里的 `/name` 注入同一渲染 | skill 即 slash command |

对照 [PF-007 §5.2](../../../design/product/PF-007-meta-capabilities/design.md#52-一张总表) 的 `Skills()` 三命令：
`read` 三源都有；`search` 三源的 skill 子系统里都没有；`exec_script` 三源都没有，
PF-007 给出的两条理由——资源不在 agent 文件系统视野里（寻址）、执行权随 skill 走（权限粒度）——
**恰好是三源都没做的两件事**：DSH 直接把绝对目录路径交给模型，omne_agent_skills 与本机实例的脚本都经通用 shell 执行。

## 七、未纳入派发清单的线索：omne_agent_capabilities

为回答版本问题读了 `omne_agent_capabilities` 的少量文件（同一 commit），**只到文件级观察，未通读**（E8）：

- `domain/entities.py`：`SkillVersion` 为 frozen 的「Immutable version snapshot」；`Skill` 聚合 `version_count ≤ VERSION_CAP = 20`；
  同一实体里既有内容（`frontmatter`）也有生命周期与配置类字段（`status`、`install_mode`、`upstream`、`publish_policy`、`agent_editable`）。
- `persistence/blob_stores/gitea_skill_store.py:25,177-200,265-266`：`MAX_VERSIONS = 20`，每次提交新版本后**删掉最旧的版本 tag**。
- `agent_toolkits/meta_tools/manage_skills.py`：多命令工具，`activate`（读 SKILL.md 返回内容）、`history/diff/rollback/tree/cat`、`edit/commit/register`、`install/pull/detach/publish/upstream`，按配置分层可见。
- `agent_toolkits/meta_tools/discover_capabilities.py`：对工具与 skill 统一自然语言检索，结果提示 skill 用 `manage_skills(command="activate")`、「pinned」工具可直接调用。

这组线索与 #14（search）、#17（版本）、#19（agent 创建修改）最接近，也带着与产品正文相反的做法（删旧版本、「activate」一词）。
是否纳入需另派一轮调查。

## 八、对照时发现的产品正文张力（只报告，不裁决）

1. **skill 摘要是否一律常驻**：[PF-004 §5.2](../../../design/product/PF-004-agent-definition-and-assembly/design.md#52-三段结构是递归的) 的表写技能「摘要常驻，正文按需取」，
   [§5.4](../../../design/product/PF-004-agent-definition-and-assembly/design.md#54-为什么系统提示词必须落在第三列) 写「装了哪些技能，就得有对应的摘要」；
   [PF-006 §4 常驻](../../../design/product/PF-006-tools-and-skills/design.md#常驻) 则说常驻是引用条目上的标记，「没标常驻的……不占位置，经取用入口够得着」。
   两处对「未标常驻的 skill 是否有摘要进系统提示词」说法不一。三源都是前一种（全部摘要常驻）。
2. **`Skills()` 没有取非脚本资源的命令**：[PF-002 §4](../../../design/product/PF-002-assets-settings-and-permissions/design.md#skill) 说 skill 可带资源文件、有「资源的取用方式」设置；
   [PF-007 §6.2](../../../design/product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) 只有 search / read / exec_script，并说资源「不在 agent 的文件系统视野里」。
   于是 `references/` 下的参考文档这类非脚本资源，按现有产品正文**没有一条取用路径**。omne_agent_skills 用 `read_skill(file=...)` 覆盖了这一路。
3. **「已发布版本不可变」的出处**：[PF-003 §6.4](../../../design/product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象) 写「PF-002 的整个版本模型建立在『已发布版本不可变』之上」，
   但这句在 PF-002 rev 10 里检索不到，实际在 [PF-001 §6.7「其余」](../../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)。
4. **skill 的「说明」不在身份里、却承担检索与替换**：PF-002 把说明文字归实现；[PF-006 替换件](../../../design/product/PF-006-tools-and-skills/design.md#替换件) 对 skill「只换说明」；
   PF-007 `search` 回答「这类事情有没有现成的方法」。产品正文没有定义 skill 的说明**用来做什么**；三源里 description 的定位是「何时触发」（本机实例说明原文）或「routing description」（DSH）。
5. **name 的语法**：三源都把 skill name 限为 kebab-case ≤64（omne-next、DSH），或示例要求「matches directory name」（本机实例）；
   产品正文的「身份是 name」没有对 name 语法作任何约定，也没有说 name 是否可以是中文。
