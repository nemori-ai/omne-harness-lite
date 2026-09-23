# Skill 规格的三个参考来源：现在该信什么

- 调查对象与日期：omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（`omne_skill_spec` 0.1.0、`omne_core_v1` 的 `agentic/skill`、`omne_agent_skills` 0.3.1、`omne_skill_import` 0.1.0）；DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）的 `packages/skill/*`；Agent Skills 本机实例（Claude Code `2.1.280` 与本机 `SKILL.md` 文件）。2026-09-23 首轮
- 消费者：[proposal「Skill 规格采用」](../../design/record/proposals/skill-spec-adoption/design.md)
- 最近核对：2026-09-23 / 上列版本（首轮）；2026-09-23 第二轮补充开放格式原文与三家扩展，见[第二轮](#第二轮开放格式原文与三家扩展)与 [changelog](changelog.md)
- 当前结论：三源在「SKILL.md = frontmatter + 正文 + 可选资源目录、name 与 description 必填、三级渐进披露、读正文不跑脚本」上一致，能承载 PF-002 Skill 定义的主体部分；
  产品正文里更靠后的那一层——正文变体、同名替换件、常驻标记挂在引用上、依赖决定可用性、脚本执行权随 skill 走、已发布版本不可变、内容与配置分开——**三源都没有现成承载**。
  omne-next 的两份 spec 在该 commit 上并未分叉；分叉的是 `omne_agent_skills` 自带的第二套校验，实测五处结论不同。

## 问题与区分条件

派发的六个问题：

1. 三源的 skill 由哪些字段与文件构成，哪些对得上 PF-002 的「身份 name / 正文 / 资源 / 组合 tool 清单 / 正文变体 / 资源取用方式」。
2. 「读取 skill 不等于运行它带的脚本、不自动装载全部附件」——三源是渐进披露还是整包装载，脚本由谁触发。
3. skill 怎样声明「要用到哪些 tool」；反向「tool 需要配套 skill」有没有。
4. 版本与不可变、内容覆盖配置不动，三源怎么处理。
5. `Skills()` 的取用侧命令（列出、读正文、取资源、跑脚本）在三源里有没有对应形态。
6. 短板与代价：omne-next 两份 spec 的分叉、Python 模型翻成语言无关 Schema 的成本、DSH skill 与文件系统发现的耦合、SKILL.md 开放格式与「身份是 name」的兼容点与冲突点。

会改变结论的观察：某一源出现把工具声明当必需依赖、或对已发布版本作不可变承诺的实现；本机宿主对 `allowed-tools`、`version` 的实际处理与插件说明不同；omne-next 的两套校验在后续提交里合并。

对照的产品正文（均为 HUB 当前版本）：
[PF-002 §4 Skill](../../design/product/PF-002-assets-settings-and-permissions/design.md#skill)（rev 10）、
[PF-006 常驻](../../design/product/PF-006-tools-and-skills/design.md#常驻)、[依赖](../../design/product/PF-006-tools-and-skills/design.md#依赖)、[§6.3 替换件](../../design/product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)、[§6.9](../../design/product/PF-006-tools-and-skills/design.md#69-agent-创建与修改工具技能本版只定三条)（rev 14）、
[PF-007 §6.2 `Skills()`](../../design/product/PF-007-meta-capabilities/design.md#62-skills通向任意技能)（rev 16）、
[PF-003 §6.4](../../design/product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)、[§6.7](../../design/product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)（rev 4）、
词条 [UL-skill](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill)。

## 证据入口

- omne-next：[evidence E1–E8](evidence.md#omne-next)；E7 是本轮对两套校验的实测。
- DSH：[evidence E9–E12](evidence.md#dsh)。
- Agent Skills 本机实例：[evidence E13–E14](evidence.md#agent-skills-本机实例)。
- PF 条款为行、三源为列的完整对照表（21 行，含可承载 / 需改 / 不可承载 / 未覆盖的判据）与 omne-next 逐字段比对表：
  [reports/2026-09-23-skill-spec-sources.md](reports/2026-09-23-skill-spec-sources.md) 第二节与第五节。本页只收结论。
- 第二轮（开放格式原文、skills-ref 实跑、omne-next 补读、Codex、本机实例统计、Claude Code 文档照引）：[evidence E15–E25](evidence.md#第二轮开放格式原文与三家扩展2026-09-23)；盘点表在 [第二轮报告](reports/2026-09-23-round2-open-format-and-extensions.md)。

## 当前结论

### 三源的 skill 都以一个 SKILL.md 加可选资源目录为载体，frontmatter 必填只有 name 与 description

omne-next core_v1 要求 `SKILL.md` 存在、frontmatter 可解析、`name` 与 `description` 合规、正文非空（H-001～H-006），可选 `license`、`compatibility`、`allowed_tools`、`metadata`；
资源目录约定为 `references/ scripts/ assets/`（E2）。omne_agent_skills 同一组字段，另加正文 500 行与目录深度的告警（E5）。
DSH 必填 `name`、`description`，可选 `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`；除此之外的键一概不解析（E10）。
本机实例里 `name`、`description` 出现在全部 7 个 canonical 与 115 个插件 `SKILL.md` 中，其余键（`version`、`user-invocable` / `user_invocable`、`license`、`allowed-tools`、`tools`、`disable-model-invocation`、`argument-hint`）各见于少数文件（E13）。

对到 PF-002：**正文**（主体是可读指引）与**资源文件**三源都能承载；name 之外、PF-002 列为「自带属性」的项目，三源的承载情况见下面几条。
作者、触发条件、依赖工具、版本这几项：作者三源都没有字段（omne-next 的作者信息只在 `pyproject.toml`，不在 skill 里）；触发条件三源都放在 `description`（DSH 另有可选 `whenToUse`）；依赖工具与版本见后文。

- 适用范围：上列三源版本；本机实例只说明「这些键出现过」，不说明宿主识别它们
- 代价与不适用：三源都没有「作者」「依赖的外部服务」「执行环境设施」这类字段；omne-next 的 `compatibility` 是 ≤500 字的自由文本，不能被机器匹配到 [PF-006 §6.4](../../design/product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) 要求的「绑定层 + 设施」
- 来源：E2、E5、E10、E13
- 最近核对：2026-09-23

### 三源的 skill 身份都落在 name 上，但「同名」的判定各不相同

- **omne_agent_skills**：注册表以 name 为键，先扫 user 再扫 project，同名后者覆盖、两者都覆盖代码内置的 toolset skill（E6）。与 PF-002「同类同名即替代」同构，只是层序是位置（project / user / toolset），不是组织与租户。
- **DSH**：kebab-case name 是唯一寻址键；同名先按 Cordis scope 层「nearest layer wins」，层内按 rank、provider 注册序、provider 内序 first-wins；被遮蔽者没有 API 可查（E9）。同构，层序同样不是组织与租户。
- **omne-next core_v1 resolver**：身份是 `SkillId`，`name` 注明为「Human-readable display name」（E3）——身份与 name 分立，与 PF-002 不同构。
- **本机实例（Claude Code 2.1.280）**：插件技能以 `plugin:skill` 命名，同一个基名来自两个插件时**两条并列**；目录作用域的同名变体也并列，由工具说明**指示模型**挑「most specific」（E14）。同名不等于替代。

name 的语法：omne-next 与 DSH 都限 kebab-case、≤64；omne-next 还要求等于目录名（core_v1 硬错误、omne_agent_skills 只告警）；DSH 不检查目录名（检索未命中，E10）；官方示例写「matches directory name」（E13）。
PF-002 对 skill name 的语法**没有任何约定**。

- 适用范围：上列版本；Claude Code 部分只是本会话这一次的呈现
- 代价与不适用：DSH 与 omne_agent_skills 的层序都是「位置」而非「谁拥有」，把它们的遮蔽规则直接当 PF-001 的层级求值用，会把组织 / 租户 / 个人的层序换成目录优先级；DSH 被遮蔽的定义不可查，出了「为什么用的是这一份」的问题没有检视入口
- 撞上这条事实会怎样：把 Claude Code 生态的插件技能按基名导入，两个插件的同名技能会从「并列」变成「后者替代前者」，而且不报错
- 来源：E3、E6、E9、E10、E13、E14
- 最近核对：2026-09-23

### 三源都没有正文变体；资源取用方式只在 DSH 有每个 skill 一份的对应物

PF-002 给 skill 列的两项设置——**正文变体**、**资源的取用方式**——在三源里：

- 正文变体：三源都没有同一 skill 多份正文、按条件取其一的结构（三源的数据形状见 E2、E5、E9，全文无此类字段）。
- 资源取用方式：DSH 的 `resourceBase` 是每个 skill 一份的 `directory / url / opaque` 三选一，决定渲染给模型的资源提示文案（E9）；但它由 provider 填写，不是按层配置的设置值。omne_agent_skills 对所有 skill 一律用 `read_skill(name, file=...)`，不是每个 skill 的属性（E6）。core_v1 与本机实例没有对应物。

「谁可以使用它」这项权限：omne-next core_v1 只有 `SkillSource`（developer / user / agent，注「owner / permission dimension」）与按租户、agent 列举（E3）；DSH 与本机实例只有「模型可调 / 用户可调」两个调用面开关（E9、E13）。三源都没有按主体（谁）授予的使用权限。

- 适用范围：上列版本
- 代价与不适用：DSH 的 `resourceBase: directory` 把绝对路径直接交给模型——这与 [PF-007 §6.2](../../design/product/PF-007-meta-capabilities/design.md#62-skills通向任意技能)「资源不在 agent 的文件系统视野里」的前提相反
- 来源：E2、E3、E5、E6、E9、E13
- 最近核对：2026-09-23

### 三源都是三级渐进披露：名与描述对所有 skill 常驻，正文按名按需读，资源按需另取

- omne_agent_skills：README 明写 Level 1 元数据常驻（约 100 token/skill）、Level 2 正文按需、Level 3 资源按需；每次模型调用把全部 skill 的名与描述注入系统提示；`read_skill(name)` 缺省只返回剥掉 frontmatter 的 SKILL.md（E6）。
- DSH：会话首个请求前追加一条 durable 目录消息，列全部模型可调 skill 的名与截到 500 字的描述；`skill({name})` 返回正文与资源提示，「resources load only as needed, without directory enumeration」（E11、E12）。作者笔记否决了「每次请求注入全部正文」（E12）。
- 本机实例：本会话的技能清单是「名: 描述」逐条列出，Skill 工具按名加载（E14）。

三源都不在读取时执行任何脚本，也都不自动带出资源文件——**PF-002「读取≠运行脚本、不自动装载全部附件」三源都能承载**。
但三源的第一级都是**全部 skill 的摘要常驻**，没有 [PF-006「常驻标记挂在引用条目上、非常驻不占槽位」](../../design/product/PF-006-tools-and-skills/design.md#常驻)的对应物。

- 适用范围：上列版本；本机实例对资源与脚本的行为未做探针，只依据宿主工具说明
- 代价与不适用：摘要全部常驻意味着 skill 数量直接进入每次请求的固定 token 成本；DSH 以 `catalogDescriptionMaxLength`（默认 500）截描述来控制，omne_agent_skills 不截（E6、E11）
- 来源：E6、E11、E12、E14
- 最近核对：2026-09-23

### 三源都没有「运行 skill 自带脚本」的专门动作，脚本经通用 shell 或文件工具执行

omne_agent_skills 只注册 `read_skill`，系统提示把 `scripts/` 描述为「Executable helpers the skill may reference」（E6）；DSH `tool-skill` 只注册 `skill` 一个工具，资源提示让模型把相对路径解析到基址后自行使用（E9、E11）；本机实例未见专门入口（E14）。
由此：**脚本由 agent 自己决定去跑，用的是它手上的通用执行工具，执行权跟着那个通用工具走**。
omne_agent_skills 与 DSH 这一句是由「只注册了读取工具」推出的；实际经哪个工具执行本轮未读到代码（omne-next 的 `skillsets/code_execution.py` 未读）。

- 适用范围：上列版本
- 代价与不适用：[PF-007 §6.2](../../design/product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) 的 `exec_script` 与「执行权随 skill 走」在三源里没有可借用的实现；三源的做法下，「允许用这个 skill 的脚本、但不允许随意跑 shell」这个意图表达不出来——这正是 PF-007 列出的理由
- 来源：E6、E9、E11、E14
- 最近核对：2026-09-23

### 三源都没有把「skill 要用到的 tool」作为必需依赖参与可用性判定

- **omne-next core_v1**：`allowed_tools: list[str]`，文档串「declarative hint, NOT enforced」；`validate_tool_hints` 只返回缺失名单，`tool_hint_warnings` 字段从不被 `validate()` 填入，`SkillToolHintWarning` 事件在非测试代码里没有实例化（E2、E8）。键名是下划线 `allowed_tools`（E7）。
- **omne_agent_skills**：读连字符 `allowed-tools`，类型是空格分隔字符串；文件型扫描出的元数据**不带**这一项（E5）。
- **DSH**：作者明确延后，`allowed-tools` / `disallowed-tools`「do not parse, advertise, or enforce」（E12）。
- **本机实例**：`allowed-tools` 出现在 8 个文件，官方说明是「Pre-approved tools for this skill (reduces permission prompts)」，值是具体工具名且可带参数模式（`Bash(ls *)`）；另有 2 个文件用 `tools:` 逗号串（E13）。这是**权限预批准**，不是依赖声明。

对到 PF-002「能组合 Tool、引用指向能力标识」与 [PF-006 依赖「只有且、只有必需」](../../design/product/PF-006-tools-and-skills/design.md#依赖)：三源里没有一个字段同时满足「指向能力标识」与「缺了就判不可用」。

- 适用范围：上列版本；本机实例部分是插件作者的说明，宿主是否真按预批准处理未探针
- 代价与不适用：同一个英文键 `allowed-tools` 在 omne-next 是「提示」、在本机实例是「权限预批准」、在 DSH 是「不认」——导入外部 skill 时照搬这个键，读者会按各自来源的语义理解它
- 撞上这条事实会怎样：把 `allowed-tools` 当依赖清单去算可用性，会把带参数模式的权限条目（`Bash(ls *)`）当成工具名去找提供者，全部判不可用
- 来源：E2、E5、E7、E8、E12、E13
- 最近核对：2026-09-23

### 反向的「tool 带配套 skill」只在 omne_agent_skills 有对应物，且形态是「工具即技能」

omne_agent_skills 的 `SkillableToolsetProtocol` 让一个 toolset 把自己暴露为一份 skill：`skill_name`、`skill_description`，正文缺省由工具说明拼成（`build_skill_content`），可改写成带 `references/`、`scripts/` 的虚拟文件树（E5）。
它是「这组工具本身以 skill 的形式被披露」，不是「这个工具引用另一份独立的 skill」。DSH、本机实例、omne-next core_v1 都没有工具指向 skill 的字段（E9、E13、E2）。

对到 [PF-002 §4 Tool](../../design/product/PF-002-assets-settings-and-permissions/design.md#tool)「能组合 Skill——有些工具必须与 skill 配套」：omne_agent_skills 的形态里 skill 没有独立身份，不能被别处单独引用或按 name 替代。

- 适用范围：omne_agent_skills 0.3.1
- 代价与不适用：「工具即技能」下，工具换实现就连带换掉 skill 正文；PF-002 让两者各有身份、各自可替代，这一点它不提供
- 来源：E5
- 最近核对：2026-09-23

### 三源的 skill 规格本身都不带不可变的已发布版本

- **omne-next core_v1**：`SkillFrontmatter` 没有版本字段；resolver 的 `ResolvedSkill` 带 `version` 与 `content_hash`，可按版本钉取，缺省取「latest enabled version」，`SkillStatus` 是逐版本的 enabled / disabled / deprecated；协议没有不可变承诺（E2、E3）。
  存储侧线索（超出派发清单，只到文件级）：`SkillVersion` 注明「Immutable version snapshot」，但保留上限 20，每次提交新版本后**删掉最旧的版本 tag**（E8）。
- **DSH**：没有版本字段；随包发布的 bundled skill 被称为「immutable」，指的是包内容，不是版本机制（E11）。
- **本机实例**：`version` 是作者自报的 semver，出现在 41/115 个文件；skill 版本与插件版本各自独立（`ljg-card` 自报 `2.3.0`，插件 `1.17.41`）；插件缓存按哈希分目录并存（E13）。宿主据此做什么未观察到。

对到 [PF-001 §6.7](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)「已发布版本保持不可变」与 [PF-003 §6.6](../../design/product/PF-003-asset-transfer-and-sharing/design.md#66-重复复制全量覆盖替换)「旧版本照旧查得到、回退得回去」：三源都没有现成承载。

- 适用范围：上列版本；omne-next 存储侧只做了文件级观察
- 代价与不适用：omne-next 存储侧的「超 20 删最旧」与「旧版本照旧查得到」直接相反；本机实例的 `version` 是自报字段，同一版本号下内容可变
- 来源：E2、E3、E8、E11、E13
- 最近核对：2026-09-23

### DSH 每次加载都重读当前正文，正文改动不形成版本，也不标记已读结果过时

「every load re-reads the current file, so editing a skill body needs no versioning or cache invalidation」；registry「Definitions are never cached」；已加载的正文是普通工具历史，「later file edits affect later calls but neither rewrite old results nor announce that the body changed」（E9、E10）。
资源子目录（`references/`、`scripts/`、`assets/`）的改动不触发目录刷新（E10）。

- 适用范围：DSH `c291e796`
- 代价与不适用：同一会话里两次加载同一 skill 可能读到两份不同正文，而对话里没有任何标记；这是 DSH 自己列出的限制（「No body revision protocol」）
- 撞上这条事实会怎样：以 DSH 的文件 provider 承载「已发布版本」，版本号会失去意义——正文在磁盘上被改就等于被发布
- 来源：E9、E10
- 最近核对：2026-09-23

### DSH 与本机实例把调用面开关写在 SKILL.md 内容里，与「内容覆盖、配置不动」的切分方向相反

DSH 的 `disable-model-invocation`、`user-invocable` 在 frontmatter 里（E10）；本机实例的 `disable-model-invocation`、`user-invocable`、`allowed-tools` 也在 frontmatter 里（E13）。
它们都是「谁能调、调用时预批准什么」这一类权限性质的值，却是 skill 内容的一部分。

[PF-003 §6.7](../../design/product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) 要求复制时覆盖内容、不动目标组织配的设置与权限值；[PF-002 §5.2](../../design/product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性) 把设置与权限当作按层配置的值。
在 DSH 与本机实例的结构里，覆盖内容就覆盖了这些开关。omne-next core_v1 的 spec 里没有这一类键（E2）。

- 适用范围：上列版本
- 代价与不适用：保留这些键在内容里，就要回答「复制过来的 skill 自带的 `allowed-tools` 算不算目标组织的授权」；移出内容，就与本机生态的现成 SKILL.md 不再逐字兼容
- 撞上这条事实会怎样：原样导入一个带 `allowed-tools` 的外部 skill，它会把作者那边的预批准带进来，而产品规则认为权限值只由本组织各层配置
- 来源：E2、E10、E13
- 最近核对：2026-09-23

### Skills() 的 read 三源都有，search 与 exec_script 三源的 skill 子系统里都没有

对 [PF-007 §5.2](../../design/product/PF-007-meta-capabilities/design.md#52-一张总表) 的三个命令：

| 命令 | omne-next | DSH | 本机实例 |
|---|---|---|---|
| search | 无（omne_agent_skills 平铺清单；core_v1 只有 `list_for_tenant`） | 无（目录消息） | 无（宿主清单） |
| read | `read_skill(name)`；core_v1 `ResolvedSkill` 不带正文 | `skill({name})` | Skill 工具 |
| 取非脚本资源 | `read_skill(name, file=...)`，`file="."` 列目录 | 无专门入口，给基址 | 未观察到 |
| exec_script | 无 | 无 | 无 |

「read 是读取不是激活」：omne_agent_skills 与 DSH 的读取结果都是一次工具返回，没有需要维护的「已启用」状态（E6、E11）。
超出派发清单的线索：omne-next `omne_agent_capabilities` 有一个对工具与 skill 统一检索的 `discover_capabilities`，以及叫 `activate` 的读取命令（E8），与 search 最接近，本轮未通读。

- 适用范围：上列版本
- 代价与不适用：三源里能直接对上 `Skills()` 的只有 read；「依赖不满足也搜得到并说明缺什么」三源都无从谈起，因为三源都没有依赖与可用性
- 来源：E3、E6、E8、E11、E14
- 最近核对：2026-09-23

### omne_skill_spec 与 core_v1 spec 在 6263fed 上是同一份实现的转发壳，真正分叉的是 omne_agent_skills 的第二套校验

`omne_skill_spec` 0.1.0 的四个模块全部从 `omne_core_v1.agentic.skill.spec` 再导出；转发前的原件与当前 core_v1 版本 `git diff` 只差 import 路径（E1）。`omne_skill_import` 同样是转发壳（E4）。
逐字段比对两者：**无差异**。

`omne_agent_skills` 不依赖二者，自带 `types.py` 与 `load.py`，在 name 语法、目录名、描述超长、正文为空、`allowed-tools` 键名与类型、`metadata` 值类型、资源目录规则、frontmatter 定界、判定输出、文件树类型、`SkillSource` 含义十一处与 core_v1 不同（逐项见 [reports 第二节](reports/2026-09-23-skill-spec-sources.md#22-真正的两套core_v1-spec-与-omne_agent_skills)）（E5）。

- 适用范围：omne-next `6263fed5`；只比了转发前一刻与当前两个快照
- 代价与不适用：「shared kernel」的说法（`omne_skill_spec/README.md`）在该 commit 上只对 core_v1 一系成立；以 omne-next 为规格起点时，「omne-next 的 skill 规格」指哪一套需要先说清
- 来源：E1、E4、E5
- 最近核对：2026-09-23

### 两套 omne-next 校验对同一输入给出不同结论

在 omne-next 自带环境里直接调用两套实现（E7）：

1. `allowed-tools: Read Grep` 在 core_v1 解析为空列表，`allowed_tools: [Read, Grep]` 才解析得到；
2. `name: a--b` 在 core_v1 判 FULL（尽管其报错文案写「no consecutive hyphens」），在 omne_agent_skills 被拒；
3. description 里含 `a---b` 时，core_v1 把 description 截成 `see a` 并判 FULL，omne_agent_skills 正常；
4. 空正文在 core_v1 判 NON_COMPLIANT，在 omne_agent_skills 无问题；
5. 顶层多一个 `README.md` 在 core_v1 判 FULL，在 omne_agent_skills 报问题。

- 适用范围：`6263fed5` 当前代码的纯函数行为；未经过 importer 或中间件
- 代价与不适用：第 3 条是 core_v1 定界实现（`find("---", 3)` 不要求行首）的静默截断——校验通过、内容已被改变
- 撞上这条事实会怎样：同一个 skill 目录经 importer（core_v1 规则）入库、再经 omne_agent_skills 中间件加载，会出现「导入时合规、加载时告警」或反之，且 `allowed-tools` 只有一边读得到
- 来源：E7
- 最近核对：2026-09-23

### 把 core_v1 的 Pydantic 模型翻成语言无关 Schema，只带得走 frontmatter 的形状，规则的大半在校验代码里

`SkillFrontmatter` 的形状（字符串长度、列表、自由 dict）可以直接写成 JSON Schema（E2）。以下几类**不在模型里，在校验代码里**：

- name 的字符语法（H-003 正则在 `validator.py`，模型字段只有长度）；
- name 等于目录名（H-004）——这是 frontmatter 与所在目录之间的跨对象约束，单独一份 frontmatter 的 Schema 表达不了；
- 正文非空（H-006）与资源目录约定（S-001）——约束对象是 Markdown 正文与文件树，不是 frontmatter；
- 硬 / 软两级判定（full / partial / non_compliant）——JSON Schema 的结论只有通过与不通过，「带警告装载」需要另一层机制；
- `SkillFiles` 的 `bytes` 值——JSON 没有二进制类型，要另定编码；
- frontmatter 的定界文法——当前两套实现本身就不一致（E7 第 3 条）。

`ResolvedSkill`（`NewType`、`datetime`、枚举、自由 dict）与 importer 的模型都能直接映射（E3、E4）。

- 适用范围：core_v1 spec 与 resolver 在 `6263fed5` 的形状
- 代价与不适用：只翻模型会得到一份比 Python 实现宽松得多的 Schema；要等价，得另写规则层（本项目的 JSON Schema 之外的那一层），而 Python 实现里 `allowed_tools`「提示、不执行」这种语义本身没有可校验的形式
- 来源：E2、E3、E4、E7
- 最近核对：2026-09-23

### DSH 的 registry 与文件系统发现分属两个包，但资源寻址与热更新依赖文件系统路径

registry（`dsh-skill`）只定义 provider 协议 `list / get`，不读文件；作者笔记否决了「把文件扫描放进 registry」，理由是不同来源需要不同 provider（E9、E12）。`skill-badge` 是一个不经文件系统发现的 provider 实例（E11）。
耦合在两处：

- **资源**：文件 provider 给每个候选的 `resourceBase` 是 `directory` 绝对路径，模型拿路径用通用文件工具去读（E10、E9）。registry 允许 `url` 与 `opaque`，但本轮看到的两个 provider 都用 `directory`。
- **热更新**：目录变化靠 Chokidar 监听与一方 write/edit 工具的同步失效；资源子目录的改动不触发刷新（E10）。只扫一层、项目根取最近的 `.git` 祖先（E10）。

- 适用范围：DSH `c291e796`
- 代价与不适用：非文件来源的 provider 要自己实现失效（registry 无 TTL，README 自列限制）；provider 串行查询，一个慢 provider 拖住其后所有 provider（E9 README 限制节）
- 来源：E9、E10、E11、E12
- 最近核对：2026-09-23

### SKILL.md 开放格式与「身份是 name」兼容，但与产品正文在四处不对齐

兼容点：本机实例与 DSH 都以 `name` 为寻址键，`name` 之外的内容都可以换（E9、E13），与 [PF-002「身份是 name，正文、资源、组合的 tool 清单都不是」](../../design/product/PF-002-assets-settings-and-permissions/design.md#skill)一致；三级渐进披露与「读取≠运行」一致。

不对齐的四处（都是本机一手实例或 DSH 源码里看到的，不是网络规格原文）：

1. **description 承担触发语义**：官方示例说明 description 是「Trigger conditions - describe when Claude should use this skill」（E13）；DSH 称之为「routing description」并另设 `whenToUse`（E9）。PF-002 与 PF-006 没有定义 skill 说明的用途，只把说明归实现（PF-006 的替换件对 skill「只换说明」）。
2. **调用面开关与预批准在内容里**：见上面「调用面开关写在 SKILL.md 内容里」一条。
3. **`allowed-tools` 是权限而非依赖**：见上面「工具声明」一条。
4. **skill 与 slash command 合一**：官方 example-plugin 说明「Skills are the preferred format for both model-invoked capabilities and user-invoked slash commands」，旧 `commands/*.md`「loaded identically」（E13）；DSH 以 skill 名本身作 `/name` 入口（E11）。[PF-002 §4 Slash Command](../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command) 把两者分开、绑定多对多。

另有两处本机实例内部就不统一：`user-invocable` 与 `user_invocable` 两种拼写并存，`allowed-tools` 与 `tools` 两种键并存（E13）。宿主识别哪一种未探针。

- 适用范围：本机实例（Claude Code 2.1.280 与上列插件）与 DSH `c291e796`
- 代价与不适用：逐字兼容本机生态的 SKILL.md，就同时接收了上面四处语义；只接收 `name`、`description` 与正文，则多数带 `allowed-tools`、`user-invocable` 的现成 skill 会丢掉作者本意的一部分
- 来源：E9、E11、E13
- 最近核对：2026-09-23

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| 本机 Claude Code 对 `allowed-tools` 的处理与官方示例说明一致（权限预批准） | 「三源都没有把 tool 当必需依赖」中本机实例一项；「四处不对齐」第 3 条 | 未核对：没有调用 Skill 工具做探针 |
| omne_agent_skills 的脚本经其他工具在沙箱执行 | 「三源都没有运行脚本的专门动作」中 omne-next 的执行路径描述（「没有专门动作」本身不受影响） | 未核对：未读 `skillsets/code_execution.py` |
| omne-next `6263fed5` 是 omne-next 在 skill 上的最终形态 | omne-next 相关全部结论 | 未核对：用户指定该 commit 为起点，未查之后是否有提交 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| 本机宿主是否识别 `tools:`、`user_invocable`、`version`，`allowed-tools` 是否真的预批准 | 写一个带这些键的临时 skill，在隔离会话里调用并观察权限提示与清单 | 「Skill 规格采用」提案里是否以本机生态为兼容目标 | 待派发；不在本仓库留临时 skill |
| omne_agent_capabilities 的 skill 生命周期全貌（版本、发布、上游同步、`activate`、检索） | 另开一轮通读该包 domain、application、agentic 三层 | 版本不可变、search、agent 创建修改三处对照 | 待派发 |
| DSH 调用策略与用户显式调用的决策理由 | 读 `2026-07-28-skill-invocation-policy.md`、`2026-08-08-user-explicit-skill-invocation.md` | Skill 与 Slash Command 的关系 | 待派发 |
| 网络上的 Agent Skills 规格原文与本机实例是否一致 | 按本派发约束本轮不引；需要时另派并记录抓取快照 | 开放格式兼容范围 | 待派发 |

## 第二轮：开放格式原文与三家扩展

- 调查对象与日期：Agent Skills 开放格式 agentskills/agentskills `69ef37e9424c0a7ea9dd2293b559e43ec8176379`（规格页最后改动 `217be54873`，2026-08-04；**无版本号**）及参考库 skills-ref 0.1.0；omne-next `6263fed5`（复读与补读 `omne_agent_capabilities`）；Codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f`；本机 Codex CLI `0.156.1` 与 Claude Code `2.1.280` 的实例。2026-09-23
- 消费者：[proposal「Skill 规格采用」](../../design/record/proposals/skill-spec-adoption/design.md)的「接受前必须补的一项」与「会改变选择的证据」表
- 本轮问题：(1) 钉存开放格式原文，核对 frontmatter 字段与必填、name 语法与上限、`metadata` 值类型、对未知顶层键的态度、`allowed-tools` 是否宿主必须执行；(2) 盘点 omne-next、Codex、Claude Code 在 `SKILL.md` 之上的扩展，按提案的键分四类归格，逐条写与 P1–P8 的相容或相抵
- 当前结论：开放格式只定六键、必填 name 与 description；name 须等于父目录名；`metadata` 值只许字符串；对未知顶层键**规格正文未述**；`allowed-tools` 是实验性、宿主可不支持。
  实现与生态在后三项上各行其是。三家扩展里，Codex 把全部专有配置放进包内侧车文件 `agents/openai.yaml`，其中的依赖声明只用于提示安装 MCP server；omne-next 的扩展都在聚合根或不同键名上；Claude Code 在 frontmatter 顶层另加十四个键。
- 逐条盘点表（42 行，含分类与 P 相容性）在 [第二轮报告](reports/2026-09-23-round2-open-format-and-extensions.md)第三节；本节只收结论。原文字节与哈希在 [sources/](sources/provenance.json)。

### 开放格式只定义六个 frontmatter 字段，必填只有 name 与 description

`name`、`description` 必填；`license`、`compatibility`（1–500）、`metadata`、`allowed-tools` 可选（E15）。规格没有版本字段、作者字段或依赖字段；`metadata` 的示例里放了 `version: "1.0"`（字符串）。
正文「no format restrictions」，目录「may contain any files and directories」，`scripts/ references/ assets/` 是建议（E15）。

- 适用范围：`69ef37e` 的规格文字
- 代价与不适用：规格只定义文件格式，**没有宿主合规条款**——它不规定宿主必须做什么，也就不能拿来判定一个宿主「不合规」
- 来源：E15
- 最近核对：2026-09-23

### 开放格式的 name 规则五条，字符集表述自相含糊，参考库接受 Unicode 字母

五条：1–64 字符；小写字母数字与连字符；不以连字符起止；不含 `--`；**等于父目录名**（E15）。
字符集一句同时写「unicode lowercase alphanumeric」与括注 `a-z`、`0-9`；参考库按前者实现，`name: 日本語` 通过（E17 探针 5）。
维护方的实现指南对其中两条（等于目录名、≤64）建议「warn, load anyway」（E16）。

- 适用范围：`69ef37e` 的规格、指南与参考库
- 代价与不适用：以规格文字为基线写 name 规则时，字符集要在「ASCII 小写」与「Unicode 小写字母」之间二选一，规格本身不给答案
- 撞上会怎样：按 ASCII 规则校验，参考库判合格的 Unicode 名会被拒；按参考库规则，`a-z0-9` 之外的字母会进入身份键
- 来源：E15、E16、E17
- 最近核对：2026-09-23

### 开放格式规定 metadata 值只许字符串，实现与生态实例多处不守

字段节一直写「a map from string keys to string values」；概览表原写「Arbitrary key-value mapping」，issue #474 指出矛盾后，PR #479（2026-08-04 合入）把概览表补成字符串那一边（E15、E18）。
实现侧：参考库不报错、把非字符串值 `str()` 强转（嵌套映射成了 Python repr 字符串），流式写法 `[a, b]` 则整份 YAML 被拒（E17）；Claude Code「Free-form YAML map」（E25）；Codex 只读 `metadata.short-description`（E20）；omne_agent_skills 报问题、core_v1 照收（E19）。
本机 Codex 生态 106 份带 `metadata` 的 `SKILL.md` 里 71 份含非字符串值（E24）；issue #514（open）报告另一个宿主把决定 skill 是否进系统提示的结构放在 `metadata` 下（E18，转述）。

- 适用范围：`69ef37e` 规格；实现各按其版本
- 代价与不适用：在 `metadata` 里放结构化声明，与规格文字相抵；放字符串，则要自定一套字符串文法
- 撞上会怎样：结构化 `metadata` 的 skill 经参考库校验后值被改写而不报错；经严格按字符串解析的宿主则载入失败（#474 所举）
- 来源：E15、E17、E18、E19、E20、E24、E25
- 最近核对：2026-09-23

### 开放格式对未知顶层键未作规定：参考校验器拒收，两家宿主静默忽略

规格正文没有一句话说遇到六键以外的顶层键时拒、忽略或告警；唯一相关的是 `metadata` 字段节「Clients can use this to store additional properties not defined by the Agent Skills spec」（E15，全文检索确认）。实现指南也不提（E16）。
规格之外：参考库 `validate` 以六键白名单**拒**（E17 探针 2）；Claude Code 本地加载**静默忽略**，同厂商的 claude.ai 上传、Skills API、`package_skill.py` **硬拒**（E25）；Codex **静默忽略**（E20）；omne-next 两套都不读也不报（E19）。

- 适用范围：`69ef37e` 规格；各实现按其版本
- 代价与不适用：「未知键」的处置没有上游权威可依，只能由本项目的规则层自己写定
- 撞上会怎样：在顶层加本项目键的 `SKILL.md`，在 Claude Code 与 Codex 里照常加载，在 claude.ai 上传与 skills-ref 校验时被拒；本机插件实例 115 份里 68 份已带规格外顶层键（E24），同一批文件在两类路径上一收一拒
- 来源：E15、E16、E17、E19、E20、E24、E25
- 最近核对：2026-09-23

### 开放格式的 allowed-tools 是实验性字段，没有要求宿主必须执行

「A space-separated string of tools that are pre-approved to run」「Experimental. Support for this field may vary between agent implementations」（E15）。规格全文没有任何字段被规定为宿主必须执行。
同一字段三种读法：规格是「预批准」；参考库的模型注释是「Tool patterns the skill requires」（依赖），且不校类型；Claude Code 是「本轮免审批、下条消息清除」，接受串或列表（E17、E25）。

- 适用范围：`69ef37e` 规格；参考库与 Claude Code 文档按其版本
- 代价与不适用：一个宿主不执行 `allowed-tools`，按规格文字不构成不合规；但作者写下的预批准意图也就没有任何一方负责兑现
- 撞上会怎样：按参考库注释把它读成依赖清单，会把 `Bash(git:*)` 这类权限模式当工具名去找提供者（首轮已述同一后果）
- 来源：E15、E17、E18、E25
- 最近核对：2026-09-23

### 开放格式没有规定闭合定界行必须独占一行，参考库与 omne-next core_v1 都会截断

规格只说「YAML frontmatter followed by Markdown」；实现指南写「the closing `---` after it」「Everything after the closing `---`, trimmed, is the skill's body」，不要求独占一行（E15、E16）。
参考库 `content.split("---", 2)`：`description: see a---b here` 被截成 `see a`，其后文字成了正文，校验通过（E17 探针 8）——与首轮 core_v1 的实测同一现象（E7 第 3 条）。Codex 按行判定首行与闭合行（E20）；Claude Code 文档只写开头 `---` 须在首行（E25）。
正文「trimmed」：前后空白不属正文（E16）。

- 适用范围：`69ef37e` 与 omne-next `6263fed5`；Codex `5c5308f`
- 代价与不适用：以规格文字为基线时，定界的行规则要本项目自己写定；照参考库实现会继承截断
- 撞上会怎样：description 或其他单行值里出现 `---` 的 skill，正文边界随之漂移，而校验报合格
- 来源：E7、E15、E16、E17、E20、E25
- 最近核对：2026-09-23

### omne-next 的扩展都在 SKILL.md 之外，或以不同键名出现

- **键名不同**：core_v1 读 `allowed_tools`（下划线、列表），开放格式写法在它那里读成空（E7、E19）；`metadata` 值收任意结构（E19）。
- **严于规格的规则**：core_v1 正文非空硬错误、非标准子目录告警、三级判定；omne_agent_skills 正文 >500 行与目录布局告警（E2、E5）。规格允许空正文与任意目录（E15）。
- **聚合根上的扩展**（`omne_agent_capabilities`，不在 `SKILL.md` 里）：`install_mode` subscribed / detached、`upstream`（marketplace 与同步状态）、`publish_policy`（manual / on_tag / on_commit、目标租户）、`agent_editable`、`implementation` code_based / file_directory、`status`、调用计数；版本快照 `SkillVersion` frozen 且带 `content_hash`，但保留上限 20（E8、E19）。
- **来源形态**：omne_agent_skills 的「工具即技能」没有磁盘上的 `SKILL.md`，正文由工具说明拼成（E5）。
- 两套都**不读**六键以外的顶层键（E19）。

- 适用范围：`6263fed5`；`omne_agent_capabilities` 只读到 domain 层
- 代价与不适用：与 P 的逐条关系见报告 3.1：O1 与 P1 相抵、O6 与 P7 相抵、O9 的版本上限与 P5 相抵、A5 与 P5 相抵；O9 其余字段都在内容之外，与 P6 同向
- 来源：E2、E5、E7、E8、E19
- 最近核对：2026-09-23

### Codex 的 skill 扩展全在侧车文件 agents/openai.yaml，frontmatter 只读三处

frontmatter 只读 `name`（可缺省，缺省取目录名，只校长度 ≤64）、`description`（必需）、`metadata.short-description`；其余顶层键静默忽略；YAML 失败时给含 `: ` 的值加引号重试（E20）。
其余全部放在包内 `agents/openai.yaml`：`interface`（显示名、短描述、图标、品牌色、默认提示）、`policy`（`allow_implicit_invocation`、`products`）、`dependencies.tools[]`（E21）。
Codex 自述这个文件是「product-specific config intended for the machine/harness to read, not the agent」，「Other product-specific config can also live in the `agents/` folder」；缺失或解析失败只告警，不挡 `SKILL.md` 加载（E21）。

- 适用范围：Codex `5c5308f` 源码（未编译运行）与 2026-09-20 文档
- 代价与不适用：侧车里既有展示值、也有调用面开关（`policy`）与带连接端点的依赖；它们跟 `SKILL.md` 一起随目录复制。Codex 的 `name` 可缺省且不校字符集，与规格的 name 规则不同
- 撞上会怎样：以规格规则校验 Codex 生态文件，本机 562 份里 1 份 name 不合语法、49 份不等于目录名（E24）；侧车里的 `policy` 若随内容原样生效，就是随复制带过来的调用面开关
- 来源：E20、E21、E24
- 最近核对：2026-09-23

### Codex 的 dependencies 只认 mcp，用途是点名时提示安装，不参与可用性判定

`dependencies.tools[]` 每项 `type`、`value`、`description`、`transport`、`command`、`url`、`oauth.callback_port`；只有 `type: mcp` 被使用（E21、E22）。
用途：用户在输入里显式点名该 skill 时，若为第一方客户端且特性开关开启，比对已装的 MCP server，缺的弹问「Install / Continue anyway」，同意后写进配置（E22）。
负面结论：在 `ext/skills/src` 与 `core/src` 的相关引用里**未见**按依赖隐藏、禁用或判 skill 不可用的代码——读遍命中处，未构造反例（E22）。本机 538 份侧车里 2 份写了 `dependencies`（E24）。

- 适用范围：Codex `5c5308f`
- 代价与不适用：它是「安装指引」，不是「缺了就不可用」；依赖项携带的是连接端点（url 或 command）而不是能力标识
- 撞上会怎样：把它当依赖声明原样导入，作者指定的 MCP 端点会成为满足依赖的途径，且满足的动作本身会写配置
- 来源：E21、E22、E24
- 最近核对：2026-09-23

### Codex 的调用面开关一处在侧车内容里，一处在配置层

- 内容侧：`agents/openai.yaml` 的 `policy.allow_implicit_invocation`（false 时不进目录、`$name` 仍可调）与 `policy.products`（按产品过滤，加载器执行）（E21）。本机 538 份侧车里 154 份写了 `allow_implicit_invocation`（E24）。
- 配置侧：`config.toml` 的 `[[skills.config]]` 以 `name` 或 `path` 选择、`enabled` 启停，挂在分层配置上；另有 `skills.bundled.enabled`、`include_instructions`、`max_context_tokens`（E23）。

- 适用范围：Codex `5c5308f`
- 代价与不适用：同一类「能不能被调用」的值在 Codex 里分两处存放，一处随内容复制、一处随使用者配置
- 来源：E21、E23、E24
- 最近核对：2026-09-23

### Codex 以 SKILL.md 路径为身份，同名并列

加载后只按 `SKILL.md` 规范路径去重，同名不合并，按 scope Repo < User < System < Admin 排序；文本里的 `$name` 只在无歧义时选中（E23；首轮引 [CX-7](../slash-command-parsing-sources/notes/codex.md#cx-7)）。文档：「If two skills share the same `name`, Codex doesn't merge them」（E23）。
这与实现指南所称的「universal convention: project-level skills override user-level skills」不同（E16）。

- 适用范围：Codex `5c5308f`
- 撞上会怎样：同首轮对 Claude Code 的结论——并列的同名 skill 进「同名即替代」的系统会变成替代
- 来源：E16、E23
- 最近核对：2026-09-23

### OpenAI 插件从 MCP 导入 skill 时逐资源带 sha256 摘要并取静态快照（文档级）

Codex 文档所述的插件提交流程：MCP server 声明 `io.modelcontextprotocol/skills` 扩展（SEP-2640 草案的静态子集），`skills/list` 每条给 `skill://` URI、「frontmatter containing every entry」、完整资源清单与每个资源的 `sha256:` 摘要；导入时逐个取回核对摘要、要求目录名等于 name、限 100 文件 / `SKILL.md` 256 KiB / 单文件 1 MiB / 合计 5 MiB；「Skills imported from MCP are submission-time snapshots, not live runtime resources」（E23）。
同一 SHA 的 `skills.read` 工具对非主机来源的 skill 以包内 `skill://` 标识取资源，提示词明写「do not treat `skill://` identifiers as filesystem paths」（E23）。

- 适用范围：文档 2026-09-20；导入部分**源码未核**；SEP-2640 是草案，不是 MCP 稳定规范
- 代价与不适用：逐资源摘要覆盖的是导入那一刻的快照，不是运行时的版本线
- 来源：E23
- 最近核对：2026-09-23

### Claude Code 在开放格式之上另加十四个键，并放宽 metadata 与 allowed-tools 的类型

十四个：`when_to_use`、`argument-hint`、`arguments`、`disable-model-invocation`、`user-invocable`、`disallowed-tools`、`model`、`effort`、`context`、`agent`、`background`、`hooks`、`paths`、`shell`（E25）。`name` 可缺省、`description` 只是 Recommended；`metadata` 是「Free-form YAML map」；`allowed-tools` 接受串或列表、授权只到本轮结束（E25）。
正文另有 `` !`cmd` `` 动态注入（「runs shell commands before the skill content is sent to Claude」）与 `$ARGUMENTS`、`${CLAUDE_SKILL_DIR}` 等替换（E25）。首轮本机实例列过的键照旧（[首轮报告第四节](reports/2026-09-23-skill-spec-sources.md#四agent-skills-本机实例实际出现了哪些字段)）。

- 适用范围：Claude Code 文档（页内最高版本注记 v2.1.280）；本机未探针
- 代价与不适用：十四键里的调用面开关、预批准与执行设置都在内容里（报告 3.3 K4–K8 与 P6 相抵）；`` !`cmd` `` 在展开时就执行 shell（K10 与 P4、P7 相抵）
- 撞上会怎样：原样收下带 `` !`cmd` `` 的正文，展开它就等于执行了一段不经 skill 脚本入口的命令；不展开，则进日志的是含占位的原文
- 来源：E25
- 最近核对：2026-09-23

### 本机实例对开放格式规则的机械套用结果

按规格规则逐项计数（E24，**不是任何宿主的实际加载结果**，含重复副本）：

| 项 | `~/.codex/`（562） | `~/.claude/plugins/`（115） |
|---|---|---|
| name 合语法 / 等于目录名 | 561 / 513 | 115 / 114 |
| 含规格外顶层键 | 59 | 68 |
| 带 `metadata` 且含非字符串值 | 71（共 106 份带 `metadata`） | 0 |

- 适用范围：本机 2026-09-23 的文件；Codex 侧含 `.tmp/plugins/` 下的 marketplace 副本
- 来源：E24
- 最近核对：2026-09-23

### 第二轮的支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| agentskills.io 的规格页与 GitHub `69ef37e` 的 `specification.mdx` 是同一份 | 开放格式各条 | 已核：逐词比对只差渲染标记 |
| 本机 openai/codex 克隆的 `5c5308f` 与上游同 SHA 一致 | Codex 各条 | 部分核对：HEAD 为该 SHA、工作树干净；与主检出钉存 tarball 共有的三个文件 `cmp` 一致 |
| Codex 文档 2026-09-20 所述 MCP skill 导入与代码一致 | 「逐资源 sha256 摘要」一条 | 未核对：只有文档 |

### 第二轮的未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 |
|---|---|---|
| Codex 的 `skills.read` 与目录渲染是否把 `agents/` 从资源列表里排除 | 读 `ext/skills/src/render.rs` 与 `tools/list.rs` 的资源枚举 | 侧车文件对外部宿主是否可见 |
| Codex 的 `interface.default_prompt` 在调用时插到哪里、是否进模型输入 | 读 TUI 与 app-server 对 `default_prompt` 的使用 | 两条入口进日志的文字是否一致 |
| issue #514、#350、#485（结构化 metadata、`--allow-field`、`dependencies` 字段）后续是否合入规格 | 规格仓库 `docs/specification.mdx` 下一次改动 | 以规格为基线的规则表与扩展位置 |
| 本仓库 canonical 7 份的 name 合规率 | 同 E24 的统计脚本 | 不挡选择 |

## 采用与后续核对

消费者：[proposal「Skill 规格采用」](../../design/record/proposals/skill-spec-adoption/design.md)（首轮时尚未出现，第二轮时已在评审）。
升级任何一个来源时，先在 [evidence.md](evidence.md) grep 旧版本 token，再判断是否触及上面的结论；触及时按[演进事件词](../README.md#演进事件词)建 `changelog.md` 记一条。
