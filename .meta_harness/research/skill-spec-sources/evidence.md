# 可复核的来源与观察

取证日期一律 2026-09-23。每条的「消费对象」指向 [research.md](research.md) 的结论锚点；
逐字段对照与 PF 条款对照表在 [reports/2026-09-23-skill-spec-sources.md](reports/2026-09-23-skill-spec-sources.md)。

**三个来源的钉法**：

| 来源 | 精确 token | 取得方式 |
|---|---|---|
| omne-next | commit `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（`git status` 干净） | 本机 `/data/qiwei/repos/omne-next` 直接读；**本机路径不钉，会失效**（见主检出 `tmp/sources/README.md`） |
| DSH | commit `c291e7961a515f6d7af9304e7fd1d257929aef26`，`package.json` `0.1.5-rc.2` | 主检出 `tmp/sources/dsh-c291e79.tar.gz`（SHA256 `f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860`）解包于 `tmp/sources/extracted/dsh/`；下文路径相对该根 |
| Agent Skills 本机实例 | Claude Code `2.1.280`（`claude --version`）；本仓库主检出 `2c1a108`；`~/.claude/plugins/known_marketplaces.json` 里 `claude-plugins-official` `lastUpdated 2026-09-23T04:35:46.202Z`、`ljg-skills` 缓存 `1.17.41` | 本机文件直接读；**marketplace 目录不是 git 检出，没有 commit 可钉** |

omne-next 与 DSH 以外，没有读任何网络上的 Agent Skills 规格原文；本机实例里对规格的说法都是插件作者自己的文字，按厂商或社区自述标注。

## omne-next

### E1. `omne_skill_spec` 0.1.0 是 core_v1 spec 的转发壳，转发前后逐字相同

- 消费对象：[omne_skill_spec 与 core_v1 spec 不是分叉](research.md#omne_skill_spec-与-core_v1-spec-在-6263fed-上是同一份实现的转发壳真正分叉的是-omne_agent_skills-的第二套校验)
- 来源与精确修订：omne-next `6263fed5`；`omne_skill_spec/pyproject.toml`（`version = "0.1.0"`，注释「Phase 4 shim: implementation lives in omne-core-v1」）；转发提交 `9a18efa6f0f1092ee81e6c6d24cc5331d7f927c8`（2026-04-20）；原件首提交 `ee48223003b1b2fbcb0f4e01fc6d2319b377373c`（2026-03-05）
- 来源立场：本项目前身的自有代码（作者即本项目负责人一方）
- 取得方式：`cat -n omne_skill_spec/omne_skill_spec/{__init__,models,enums,validator}.py`；
  `git diff 9a18efa6f^:omne_skill_spec/omne_skill_spec/<f>.py 6263fed5:omne_core_v1/libs/omne_core_v1/omne_core_v1/agentic/skill/spec/<f>.py`（`<f>` 取 models、enums、validator）
- 实际观察：四个文件全部是 `from omne_core_v1.agentic.skill.spec... import` 的再导出（`__init__.py:1-7,14-22`、`models.py:1-16`）；diff 结果 `enums.py` 无差异，`models.py`、`validator.py` 仅 import 行不同。`CHANGELOG.md` 0.1.0 条目称 schema 含「metadata, inputs, outputs, and capabilities」，模型里没有 inputs / outputs / capabilities
- 支持范围：在 `6263fed` 上两个包的字段与规则相同；**不支持**「其他时点从未分叉」——只比了转发前一刻与当前两个快照

### E2. core_v1 spec：`SkillFrontmatter` 字段与 `SkillSpecificationValidator` 规则

- 消费对象：[三源载体与必填](research.md#三源的-skill-都以一个-skillmd-加可选资源目录为载体frontmatter-必填只有-name-与-description)、[工具声明](research.md#三源都没有把skill-要用到的-tool作为必需依赖参与可用性判定)、[JSON Schema 成本](research.md#把-core_v1-的-pydantic-模型翻成语言无关-schema只带得走-frontmatter-的形状规则的大半在校验代码里)
- 来源与精确修订：omne-next `6263fed5`，`omne_core_v1/libs/omne_core_v1/omne_core_v1/agentic/skill/spec/`（`omne-core-v1` 版本为 `dynamic`，以 commit 为准）
- 来源立场：自有代码
- 取得方式：`cat -n spec/{models,validator,enums}.py`
- 实际观察：
  - `models.py:32-51` `SkillFrontmatter`（frozen）：`name` 1–64、`description` 1–1024、`license?`、`compatibility?` ≤500、`allowed_tools: list[str]`（文档串 `:40`「Pre-approved tool names (declarative hint, NOT enforced)」）、`metadata: dict[str, Any]`；`models.py:20` `SkillFiles = Mapping[str, str | bytes]`；`models.py:95,103` `tool_hint_warnings`
  - `validator.py:22` 名字正则 `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`；`:23` 标准目录 `references / scripts / assets`；H-001 SKILL.md 存在 `:42-52`；H-002 frontmatter `:56-77`；H-003 名字 `:79-89`（文案「no leading/trailing/consecutive hyphens」）；H-004 名等于目录名 `:91-100`；H-005 描述 `:102-112`；H-006 正文非空 `:114-123`；S-001 非标准子目录软警告 `:125-136`；`validate_tool_hints` 只返回缺失名单 `:140-150`；`parse_frontmatter` 读键 `allowed_tools` `:170`；定界 `content.find("---", 3)` `:177-183`
  - `enums.py:12-23` 三级：full（无警告装载）/ partial（带警告装载）/ non_compliant（「Rejected — not loaded」）
- 支持范围：规则的位置与内容；运行行为见 E7

### E3. core_v1 resolver：身份、版本与租户列举

- 消费对象：[身份落在 name](research.md#三源的-skill-身份都落在-name-上但同名的判定各不相同)、[版本](research.md#三源的-skill-规格本身都不带不可变的已发布版本)、[取用侧](research.md#skills-的-read-三源都有search-与-exec_script-三源的-skill-子系统里都没有)
- 来源与精确修订：omne-next `6263fed5`，`.../agentic/skill/resolver.py`
- 来源立场：自有代码（协议，无实现）
- 取得方式：`cat -n resolver.py`；行号用 `grep -n` 复核
- 实际观察：`:36` `SkillId = NewType("SkillId", str)`；`:40-51` `SkillSource` developer / user / agent，注「Origin of a skill — owner / permission dimension」；`:54-65` `SkillStatus` enabled / disabled / deprecated，注「Lifecycle status of a skill version」；`:69-99` `ResolvedSkill` 字段 `skill_id, version, name`（「Human-readable display name」）`, description, frontmatter`（自由 dict，「Validation is the consumer's responsibility」）`, source, status, content_hash, resolved_at, metadata`，**无正文字段**；`:118-128` `resolve(skill_id, *, version=None)`，None「selects the latest enabled version per the backend's policy」；`:139` `list_for_tenant(tenant, *, agent_id=None)`；`:156-173` `exists`
- 支持范围：协议形状；**不支持**任何实现行为（本轮未读实现）

### E4. core_v1 importer 与 `omne_skill_import` 转发壳

- 消费对象：[SKILL.md 开放格式的兼容点与冲突点](research.md#skillmd-开放格式与身份是-name兼容但与产品正文在四处不对齐)（导入来源）
- 来源与精确修订：omne-next `6263fed5`，`.../agentic/skill/importer/{models,enums,pipeline,protocols}.py`；`omne_skill_import/pyproject.toml` `0.1.0`（Phase 4 shim）
- 来源立场：自有代码
- 取得方式：`cat -n`
- 实际观察：`enums.py:21-27` 来源格式 `agent_skills_spec, skills_sh, github, claude_code, cursor, openhands, native`；`models.py:116-135` `ImportProvenance`；`models.py:159-177` `NormalizedSkillBundle(frontmatter, files, validation, provenance)`；`pipeline.py:56-138` 解析 → subpath 过滤 → 发现所有 `SKILL.md` → 校验 → 打包，**全程不调用 `FormatAdapter`**（协议定义在 `protocols.py:47-80`）；`_guess_source_type` 只凭 URL 含 `github.com` 判 github，否则 native（`pipeline.py:153-159`）
- 支持范围：导入管线只接受已是 SKILL.md 形态的来源；外部格式枚举值没有对应的适配步骤

### E5. `omne_agent_skills` 0.3.1：第二套数据形状与校验

- 消费对象：[真正分叉的是第二套校验](research.md#omne_skill_spec-与-core_v1-spec-在-6263fed-上是同一份实现的转发壳真正分叉的是-omne_agent_skills-的第二套校验)、[Tool 带配套 skill](research.md#反向的tool-带配套-skill只在-omne_agent_skills-有对应物且形态是工具即技能)
- 来源与精确修订：omne-next `6263fed5`，`omne_agent_skills/pyproject.toml` `version = "0.3.1"`，依赖 `pyyaml`、`omne-core`（**不依赖** `omne-skill-spec` / `omne-core-v1`）
- 来源立场：自有代码；`types.py:4,19` 引 `https://agentskills.io/specification` 的约束——**这是 omne-next 代码里的转述，本轮未核原文**
- 取得方式：`cat -n omne_agent_skills/{types,load,protocols}.py`；`mixin.py` 用 `grep -n` 定位
- 实际观察：
  - `types.py:20-27` 常量 64 / 1024 / 500 / 10MB / 正文 500 行 / 允许目录；`:34` `SkillFiles = dict[str, str]`；`:38` `SkillSource = Literal["user", "project", "toolset"]`；`:41-70` `SkillMetadata`（`allowed_tools: str | None`，「Space-delimited」）
  - `load.py:69` 名字正则 `^[a-z0-9]+(-[a-z0-9]+)*$`；`:71-72` 名等于目录名；`:146-149` allowed_tools 非空串；`:225` 读键 `allowed-tools`；`:230-238` 正文 >500 行报问题；`:246-264` 顶层目录与深度规则；`:295` 定界正则；`:316-324` 描述超长截断；`:326-331` 文件型扫描只填 name / description / path / source；`:333-337` 「warn but don't reject」
  - `protocols.py:20-134` `SkillableToolsetProtocol`：`skill_name`、`skill_description`、`build_skill_content()`（「Default implementations typically concatenate tool descriptions」）、`build_skill_files()`、`get_skill_metadata()`、`tools_list`
- 支持范围：两套实现的规则差异；运行行为见 E7

### E6. `omne_agent_skills` 中间件：加载模型与取用入口

- 消费对象：[三级渐进披露](research.md#三源都是三级渐进披露名与描述对所有-skill-常驻正文按名按需读资源按需另取)、[脚本执行权](research.md#三源都没有运行-skill-自带脚本的专门动作脚本经通用-shell-或文件工具执行)、[取用侧](research.md#skills-的-read-三源都有search-与-exec_script-三源的-skill-子系统里都没有)
- 来源与精确修订：omne-next `6263fed5`，`omne_agent_skills/omne_agent_skills/middleware.py`（`MIDDLEWARE_VERSION = "0.2.0"`，`:70`）；`README.md:19-26`
- 来源立场：自有代码与自有 README
- 取得方式：`sed -n` 分段读；`grep -n` 定位
- 实际观察：README `:19-22` 三级：Metadata 常驻（约 100 token/skill）、Instructions 按需、Resources 按需；`middleware.py:73` 唯一工具名 `read_skill`；`:76-129` 注入系统提示的模板（`scripts/` 注为「Executable helpers the skill may reference」）；`:214-243` `ReadSkillInput(skill_name, file)`；`:414-478` `file=None` 返回剥掉 frontmatter 的 SKILL.md、`"."` 列目录、相对路径读文件并做穿越检查、文件型从沙箱读；`:560-579` 所有 skill 平铺为 `<skill name=...>描述</skill>`；`:635-718` 先扫 user 再扫 project，同名后者覆盖、两者都覆盖 toolset；`:725-790` 每次模型调用注入
- 支持范围：没有运行脚本的入口；脚本由 agent 经其他工具在沙箱执行是推断（本轮未读 `skillsets/code_execution.py`）

### E7. 实测：同一输入在两套 omne-next 校验下的结论

- 消费对象：[两套校验对同一输入给出不同结论](research.md#两套-omne-next-校验对同一输入给出不同结论)
- 来源与精确修订：omne-next `6263fed5` 工作树（干净）；import 路径解析到仓库内源文件（`.../skill/spec/validator.py`、`omne_agent_skills/omne_agent_skills/load.py`）
- 来源立场：复现实验（本轮执行）
- 取得方式：`/data/qiwei/repos/omne-next/.venv/bin/python`（Python 3.12.13、PyYAML 6.0.3、pydantic 2.12.5）以 stdin 脚本直接调用 `SkillSpecificationValidator().validate/parse_frontmatter` 与 `validate_skill_name/validate_skill_files`；无文件写入
- 环境与前提：只测纯函数；未经过 importer 或中间件
- 实际观察（输入 → core_v1 / omne_agent_skills）：
  1. frontmatter 写 `allowed-tools: Read Grep` → core_v1 `parse_frontmatter().allowed_tools == []`；写 `allowed_tools: [Read, Grep]` → `['Read', 'Grep']`
  2. `name: a--b`（目录同名）→ core_v1 `FULL` / omne_agent_skills `(False, 'name must be lowercase alphanumeric with single hyphens only')`
  3. `description: see a---b here` → core_v1 `FULL`，但解析出 `description='see a'` / omne_agent_skills 无问题
  4. 空正文 → core_v1 `NON_COMPLIANT` / omne_agent_skills 无问题
  5. 顶层多一个 `README.md` → core_v1 `FULL` / omne_agent_skills 报「files should be organized in scripts/, references/, or assets/ directories」
  6. 描述 1100 字 → core_v1 `NON_COMPLIANT`（omne_agent_skills 的截断行为见 E5 `load.py:316-324`，本轮未另测）
- 支持范围：这些分歧在当前代码上可复现；**不支持**「生产里触发过」——未查运行记录

### E8. `omne_agent_capabilities`：版本与取用侧的线索（超出派发清单）

- 消费对象：[版本](research.md#三源的-skill-规格本身都不带不可变的已发布版本)、[取用侧](research.md#skills-的-read-三源都有search-与-exec_script-三源的-skill-子系统里都没有)
- 来源与精确修订：omne-next `6263fed5`，`omne_agent_capabilities/libs/omne_agent_capabilities/omne_agent_capabilities/` 与 `.../omne_agent_capabilities_agentic/agent_toolkits/`
- 来源立场：自有代码；**只做了文件级观察，未通读**
- 取得方式：`grep -n` 与 `sed -n`
- 实际观察：`domain/entities.py:26` `VERSION_CAP = 20`、`:30-53` `SkillVersion`（frozen，「Immutable version snapshot」，含 `content_hash`）、`:56-126` `Skill` 聚合同时含 `frontmatter` 与 `status / install_mode / upstream / publish_policy / agent_editable`，不变式 I-4 要求 `user_id` 与 `agent_id` 非空；`persistence/blob_stores/gitea_skill_store.py:25` `MAX_VERSIONS = 20`、`:177-200` `_prune_old_versions`「Delete oldest version tags if the count exceeds max_keep」、`:265-266` 每次提交后调用；`meta_tools/manage_skills.py:49-59` 命令分层 `help / activate / edit, commit, register / history, diff, rollback, tree, cat`；`commands/runtime.py:30-47` `activate`「reads its SKILL.md, and returns the content」；`meta_tools/discover_capabilities.py:26-32` 检索结果对 skill 提示用 `activate`；`domain/events/validation_events.py:20` 定义 `SkillToolHintWarning`，全仓非测试代码无实例化（`grep -rn "SkillToolHintWarning("`）
- 支持范围：存储实现会删旧版本；**不支持**对 omne_agent_capabilities 整体语义的任何结论

## DSH

### E9. `dsh-skill` registry：数据形状、同名解析、渲染

- 消费对象：[三源载体与必填](research.md#三源的-skill-都以一个-skillmd-加可选资源目录为载体frontmatter-必填只有-name-与-description)、[身份](research.md#三源的-skill-身份都落在-name-上但同名的判定各不相同)、[资源取用方式](research.md#三源都没有正文变体资源取用方式只在-dsh-有每个-skill-一份的对应物)、[DSH 耦合](research.md#dsh-的-registry-与文件系统发现分属两个包但资源寻址与热更新依赖文件系统路径)
- 来源与精确修订：DSH `c291e796`，`packages/skill/skill/src/index.ts`、`packages/skill/skill/README.md`、`packages/skill/README.md`
- 来源立场：上游作者源码与作者文档
- 取得方式：`sed -n`、`grep -n`
- 实际观察：`index.ts:21` `SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`；`:40` `SkillSource` 取值与「prompt-visible metadata, not precedence by itself」；`:43-46` `SkillResourceBase` directory / url / opaque；`:49-54` `SkillInvocationPolicy`；`:57-74` `SkillSummary`；`:77-84` `SkillCandidate`（`rank` 越小越优先、`locator`、`metadata?`）；`:87-92` `SkillDefinition`（`content`）；`:170-210` `renderSkillContent` 与资源提示文案；`:247-268` `SkillProvider{name, list, get}`；`:351-352` 「the nearest layer's entry wins a duplicate name outright」。README `:99`「Definitions are never cached — every load asks the provider for the current body」；`:141`「there is no API to inspect all shadowed definitions」
- 支持范围：registry 的形状与解析规则；registry 不含任何 version、工具声明或脚本字段（在 `index.ts` 全文检索 `version`、`allowed`、`script` 未见对应字段）

### E10. `dsh-skill-filesystem`：文件格式、根与热更新

- 消费对象：[三源载体与必填](research.md#三源的-skill-都以一个-skillmd-加可选资源目录为载体frontmatter-必填只有-name-与-description)、[DSH 正文不版本化](research.md#dsh-每次加载都重读当前正文正文改动不形成版本也不标记已读结果过时)、[DSH 耦合](research.md#dsh-的-registry-与文件系统发现分属两个包但资源寻址与热更新依赖文件系统路径)
- 来源与精确修订：DSH `c291e796`，`packages/skill/skill-filesystem/{README.md,src/index.ts}`
- 来源立场：上游作者源码与作者文档
- 取得方式：`sed -n`、`grep -n`
- 实际观察：README `:34-42` 格式（`<name>/SKILL.md` 或 `<name>.md`；必填 name、description；可选 whenToUse、metadata、disable-model-invocation、user-invocable；「every load re-reads the current file, so editing a skill body needs no versioning or cache invalidation」）；README 根与 rank 表（project-dsh 100 … user-agents 500，bundled 600）；`:81` 资源子树改动不触发刷新、一方 write/edit 工具同步失效 provider；`:85,150` 非法条目带警告消失、模型分不出「没有」与「坏了」；`:148` 只扫一层；`:152` 「No body revision protocol」。源码 `src/index.ts:797-839` `parseSkillFile` 只取上述键；`:1001-1005` 拒收旧的驼峰写法；`:725-750` 每个候选的 `resourceBase = { kind: 'directory', path: locator.directory }`
- 支持范围：文件型 provider 行为；「不检查 name 与目录名一致」是检索未命中的负面结论（在 `src/index.ts`、本包 README、`docs/subsystems/skills.md` 以 `directory name`、`match.*directory`、`basename` 检索）

### E11. `dsh-tool-skill`、`dsh-skill-badge` 与子系统文档

- 消费对象：[三级渐进披露](research.md#三源都是三级渐进披露名与描述对所有-skill-常驻正文按名按需读资源按需另取)、[脚本执行权](research.md#三源都没有运行-skill-自带脚本的专门动作脚本经通用-shell-或文件工具执行)、[版本](research.md#三源的-skill-规格本身都不带不可变的已发布版本)
- 来源与精确修订：DSH `c291e796`，`packages/skill/tool-skill/{README.md,src/index.ts}`、`packages/skill/skill-badge/src/index.ts`、`docs/subsystems/skills.md`
- 来源立场：上游作者源码与作者文档
- 取得方式：`sed -n`、`grep -n`
- 实际观察：`tool-skill/src/index.ts:82-85` 工具 `skill`，唯一参数 `name`；`:161` `ctx.tools.register(skillTool)` 为本包唯一注册的工具；README `:12,54,88` 目录消息、`/name` 注入、`disable-model-invocation` 的 skill 只能经 `/name` 进入；README「Skill catalog template」一节给出目录消息原文。`skill-badge/src/index.ts:17-50` 一个 bundled 候选，正文从包内 `assets/dsh-badge.md` 读。`docs/subsystems/skills.md:79`「registers one immutable `bundled` candidate」；`:233` 「`resourceBase` resolves explicitly referenced scripts, references, and assets only as needed; the loaded result does not enumerate a skill directory」
- 支持范围：DSH 的「immutable」指随包发布的内容，不是版本机制

### E12. DSH 作者笔记：skill 系统决策与延后项

- 消费对象：[工具声明](research.md#三源都没有把skill-要用到的-tool作为必需依赖参与可用性判定)、[三级渐进披露](research.md#三源都是三级渐进披露名与描述对所有-skill-常驻正文按名按需读资源按需另取)
- 来源与精确修订：DSH `c291e796`，`.agents/notes/archived/feature/2026-07-05-skill-system.md`（Status: implemented，Archived: 2026-09-04）
- 来源立场：上游作者的决策记录（含 Alternatives considered）
- 取得方式：`cat -n`
- 实际观察：`:10` 作者称 Codex、Claude Code、OpenCode、Kimi Code 都「separate discovery metadata from complete instructions」（作者转述，未逐家核对）；`:18` 「Dedicated packaged providers can contribute immutable skills」；`:24` 字段清单；`:30` 资源「load only as needed, without directory enumeration」；`:36` 否决「每次请求注入全部正文」；`:40` 否决「把文件扫描放进 registry」；`:46` 否决递归发现；`:58` 延后 `context: fork`、`arguments`/`argument-hint`、`allowed-tools`/`disallowed-tools`，「do not parse, advertise, or enforce these fields」
- 支持范围：作者自述的取舍；未读 `2026-07-28-skill-invocation-policy.md` 与 `2026-08-08-user-explicit-skill-invocation.md` 原文

## Agent Skills 本机实例

### E13. 本机 SKILL.md 的实际字段与插件自带说明

- 消费对象：[三源载体与必填](research.md#三源的-skill-都以一个-skillmd-加可选资源目录为载体frontmatter-必填只有-name-与-description)、[工具声明](research.md#三源都没有把skill-要用到的-tool作为必需依赖参与可用性判定)、[SKILL.md 开放格式](research.md#skillmd-开放格式与身份是-name兼容但与产品正文在四处不对齐)、[版本](research.md#三源的-skill-规格本身都不带不可变的已发布版本)
- 来源与精确修订：本仓库主检出 `2c1a108` 的 `.meta_harness/agents/skills/*/canonical/SKILL.md`（7 个）；`/data/qiwei/.claude/plugins/` 下 `find -name SKILL.md -not -path "*/node_modules/*"` 得 115 个（marketplace 与 cache 有重复副本）；marketplace 更新时刻见本页开头
- 来源立场：`claude-plugins-official` 为厂商官方插件（厂商自述）；`ljg-skills` 为社区插件；本仓库 canonical 为自有
- 取得方式：对每个文件取首个 `---` 到下一个 `---` 之间的顶层键（`awk` + `grep -oE "^[a-zA-Z_-]+:"`），计数去重；再逐个读样例
- 实际观察：
  - canonical：`name`、`description` 7/7，`metadata:` 4/7（值 `status: draft`）；`design-subagents/canonical/` 下有 `references/ scripts/ assets/`
  - 插件：键计数见 [reports 第四节](reports/2026-09-23-skill-spec-sources.md#四agent-skills-本机实例实际出现了哪些字段)；`user_invocable` 与 `user-invocable` 两种拼写并存
  - `marketplaces/claude-plugins-official/plugins/example-plugin/skills/example-skill/SKILL.md:1-5,51-54`（description「Trigger conditions - describe when Claude should use this skill」；version「Semantic version number」）；`skills/example-command/SKILL.md:1-6,28-32`（name「matches directory name」；allowed-tools「Pre-approved tools for this skill (reduces permission prompts)」；model）；`README.md:25,50`（skill 同为 slash command 的首选格式；旧 `commands/*.md`「loaded identically」）
  - `external_plugins/discord/skills/configure/SKILL.md:4-10`（`user-invocable: true`，`allowed-tools` 含 `Bash(ls *)`）；`plugins/claude-security/skills/claude-security/SKILL.md:4-5`（`disable-model-invocation: true`）；`plugins/claude-code-setup/skills/claude-automation-recommender/SKILL.md:4` 与 `plugins/claude-md-management/skills/claude-md-improver/SKILL.md:4`（`tools:` 逗号串）
  - `cache/ljg-skills/ljg-skills/1.17.41/skills/ljg-card/SKILL.md:4-5`（`user_invocable: true`、`version: "2.3.0"`）；`cache/claude-plugins-official/frontend-design/` 下 9 个哈希命名的目录并存
- 支持范围：这些键**在本机出现过**；**不支持**「宿主识别这些键」——宿主对 `tools`、`user_invocable`、`version` 的处理本轮未探针；缓存目录并存不等于有版本不可变承诺

### E14. 本会话宿主对 skill 的呈现（Claude Code 2.1.280）

- 消费对象：[身份](research.md#三源的-skill-身份都落在-name-上但同名的判定各不相同)、[三级渐进披露](research.md#三源都是三级渐进披露名与描述对所有-skill-常驻正文按名按需读资源按需另取)
- 来源与精确修订：Claude Code `2.1.280`；本次调研会话收到的 Skill 工具定义与技能清单提醒
- 来源立场：厂商产品的实际行为（一手观察，非文档）
- 取得方式：阅读本会话上下文中宿主注入的内容
- 实际观察：技能清单逐条为「名: 描述」；插件技能名为 `plugin:skill`，同时列出 `skill-creator:skill-creator` 与 `anthropic-skills:skill-creator`；目录作用域技能以路径前缀列出（`.meta_harness:design-subagents` 与 `design-subagents` 并列），Skill 工具说明写「when both scoped and unscoped variants of a name exist, pick the one whose directory contains the files you're working on (most specific wins; unscoped otherwise)」；Skill 工具说明「the skill's instructions load into the turn」
- 支持范围：本会话这一次的呈现；**不支持**对资源、脚本或权限行为的任何结论（未调用 Skill 工具做探针）

## 第二轮：开放格式原文与三家扩展（2026-09-23）

本轮钉法（字节与哈希在 [sources/provenance.json](sources/provenance.json) 与 [sources/SHA256SUMS](sources/SHA256SUMS)）：

| 来源 | 精确 token | 取得方式 |
|---|---|---|
| Agent Skills 开放格式 | agentskills/agentskills HEAD `69ef37e9424c0a7ea9dd2293b559e43ec8176379`（2026-08-09）；`docs/specification.mdx` 最后改动 `217be54873`（2026-08-04）；**规格无版本号** | 站点 `https://agentskills.io/specification.md` 与 GitHub raw 于 2026-09-23 约 10:5xZ 抓取，11:01:02Z 重抓站点页字节不变；原样存 `sources/` |
| 参考库 skills-ref | 同 commit，`skills-ref/pyproject.toml` `0.1.0`；`validator.py` / `parser.py` 最后改动 `547831f3a2`（2025-12-18） | 同上；本轮在 uv venv（Python 3.12.13、strictyaml 1.7.3）里实跑 |
| omne-next | commit `6263fed5`（同首轮，工作树干净） | 本机仓库直接读；**路径不钉，会失效** |
| Codex | openai/codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f` | 本机另一会话 scratchpad 里的同 SHA 克隆（工作树干净，路径不钉）`git archive` 出所读路径，钉存 `sources/codex-5c5308f-skills.tar.gz`（sha256 `dd04ceb0…7bd550`）；与主检出 `tmp/sources/codex-5c5308f.tar.gz` 共有的三个文件 `cmp` 一致 |
| Codex 文档 | `codex-docs-2026-09-20`（主检出 `tmp/sources/`） | 离线副本 `manual.md` |
| 本机实例 | Codex CLI `0.156.1`（本机安装，不是 `5c5308f` 的构建）；Claude Code `2.1.280` | 本机文件直接读；marketplace 与缓存目录不是 git 检出，无 commit |

### E15. 开放格式规格原文：六个字段、name 规则、metadata、allowed-tools

- 消费对象：[开放格式的字段与必填](research.md#开放格式只定义六个-frontmatter-字段必填只有-name-与-description)、[name](research.md#开放格式的-name-规则五条字符集表述自相含糊参考库接受-unicode-字母)、[metadata](research.md#开放格式规定-metadata-值只许字符串实现与生态实例多处不守)、[allowed-tools](research.md#开放格式的-allowed-tools-是实验性字段没有要求宿主必须执行)、[定界与正文](research.md#开放格式没有规定闭合定界行必须独占一行参考库与-omne-next-core_v1-都会截断)
- 来源与精确修订：`sources/agentskills-specification-mdx-69ef37e.txt`（= GitHub `docs/specification.mdx` @ `69ef37e`）；站点渲染版 `sources/agentskills-specification-2026-09-23.txt`
- 来源立场：规格维护方文档（仓库 `skills-ref` 作者邮箱为 anthropic.com；规格本身不署组织）
- 取得方式：`curl -sL` 原样字节；站点版与 GitHub 源逐词比对（去掉列表符号、表格对齐与 `theme={null}` 后）只差页头包装与 `\~`、`\<` 转义
- 实际观察：`:21`「must contain YAML frontmatter followed by Markdown content」；`:25-32` 概览表六字段，`name`、`description` Required Yes，其余 No；`:60-65` name 五条（`:62`「May only contain unicode lowercase alphanumeric characters (`a-z`, `0-9`) and hyphens」、`:64` 不得连续连字符、`:65`「Must match the parent directory name」）；`:94` description 1–1024；`:126` compatibility「Must be 1-500 characters if provided」；`:150-152` metadata「A map from string keys to string values」「Clients can use this to store additional properties not defined by the Agent Skills spec」「We recommend making your key names reasonably unique」；`:166-167` allowed-tools「A space-separated string of tools that are pre-approved to run」「Experimental. Support for this field may vary between agent implementations」；`:178` 正文「There are no format restrictions」；`:189`「may contain any files and directories beyond the required `SKILL.md`」；`:224`「Keep your main `SKILL.md` under 500 lines」；全文无版本字段、无宿主合规条款、无关于未知顶层键的语句（全文检索 `unknown`、`additional`、`extra`、`ignore`、`reject`：只有 `:151` 一处 `additional properties`）
- 支持范围：该 commit 的规格文字；**不支持**「所有宿主按此实现」

### E16. 客户端实现指南：解析、宽松校验、同名、过滤

- 消费对象：[未知键](research.md#开放格式对未知顶层键未作规定参考校验器拒收两家宿主静默忽略)、[name](research.md#开放格式的-name-规则五条字符集表述自相含糊参考库接受-unicode-字母)、[定界与正文](research.md#开放格式没有规定闭合定界行必须独占一行参考库与-omne-next-core_v1-都会截断)
- 来源与精确修订：`sources/agentskills-adding-skills-support-mdx-69ef37e.txt`（= `docs/client-implementation/adding-skills-support.mdx` @ `69ef37e`，最后改动 `22d6aeb353` 2026-03-10）
- 来源立场：规格维护方的实现者指南（建议性，不是规格正文）
- 取得方式：同 E15
- 实际观察：`:81-87` 同名「project-level skills override user-level skills」为「universal convention」，同 scope 先到或后到皆可、须告警；`:91` 建议项目级 skill 受信任门控；`:111-113` 定界「Find the opening `---` at the start of the file and the closing `---` after it」「Everything after the closing `---`, trimmed, is the skill's body」；`:117-126` 建议对未加引号的冒号值做修复重试；`:128-140` 宽松校验：name 不等于目录名、超 64 字符都「warn, load anyway」，description 缺失则跳过，并注明「deliberately relaxes these」；步骤 2 只说「Extract `name` and `description` (required), plus any optional fields」，**全文没有未知顶层键的处理**；`:226` 以 `disable-model-invocation` 为「opted out of model-driven activation」的例子（该键不在规格六字段里）；`:251` 专用激活工具可「Enforce permissions or prompt for user consent」；`:312` 建议把 skill 目录加进文件读取白名单
- 支持范围：维护方的建议；不是规格要求

### E17. 参考库 skills-ref：白名单、强转与截断（实跑）

- 消费对象：[未知键](research.md#开放格式对未知顶层键未作规定参考校验器拒收两家宿主静默忽略)、[metadata](research.md#开放格式规定-metadata-值只许字符串实现与生态实例多处不守)、[name](research.md#开放格式的-name-规则五条字符集表述自相含糊参考库接受-unicode-字母)、[allowed-tools](research.md#开放格式的-allowed-tools-是实验性字段没有要求宿主必须执行)、[定界](research.md#开放格式没有规定闭合定界行必须独占一行参考库与-omne-next-core_v1-都会截断)
- 来源与精确修订：`sources/skills-ref-{validator,parser,models}-69ef37e.txt`；README 自述「intended for demonstration purposes only. It is not meant to be used in production」
- 来源立场：规格维护方的参考实现
- 取得方式：源码阅读 + 复现实验；脚本与完整输出在 `sources/skills-ref-probe-2026-09-23.txt`（每个用例建临时目录、写 `SKILL.md`、调用 `validate()` 与 `parse_frontmatter()`）
- 环境与前提：Python 3.12.13、strictyaml 1.7.3（满足 `pyproject` 的 `>=1.7.3`）；`errors.py` 取自同 commit、未钉
- 实际观察：`validator.py:14-22` `ALLOWED_FIELDS` 六键；`:104-115` 多出的顶层键报「Unexpected fields in frontmatter」；`:37-58` name 先 NFKC 再逐字符 `isalnum() or '-'`；`parser.py:23` 接受 `SKILL.md` 或 `skill.md`；`:45` `content.split("---", 2)`；`:53` strictyaml；`:62` `metadata` 值 `str(v)` 强转；`models.py:16` allowed_tools 注释「Tool patterns the skill requires」。探针结果（编号同脚本）：2 `user-invocable` → 错误；3、4、9 流式 `[a, b]` → YAML 错误；5 `name: 日本語` → 通过；6 name≠目录 → 错误；7 `a--b` → 错误；8 `description: see a---b here` → 通过，description=`see a`、正文=`b here\n---\nbody`；10 空正文 → 通过；11 未引号冒号 → YAML 错误；12 块写法嵌套 metadata → 通过，值成 `"{'tools': ['a', 'b']}"`；13 `1.0`、`true` → `'1.0'`、`'true'`；14 块写法 `allowed-tools` 列表 → 通过
- 支持范围：该 commit 参考库的行为；**不支持**「claude.ai 上传或任何宿主用了这个库」

### E18. 规格仓库的 issue 与 PR 状态

- 消费对象：[metadata](research.md#开放格式规定-metadata-值只许字符串实现与生态实例多处不守)、[未知键](research.md#开放格式对未知顶层键未作规定参考校验器拒收两家宿主静默忽略)、[allowed-tools](research.md#开放格式的-allowed-tools-是实验性字段没有要求宿主必须执行)
- 来源与精确修订：GitHub REST API，2026-09-23 约 10:55Z；#474 原样 JSON 存 `sources/agentskills-issue-474-2026-09-23.json`
- 来源立场：社区报告与维护者合入记录（独立第三方为主）
- 取得方式：`curl` GitHub API；commit `3f3bbec813` 的 patch 经 API 读取
- 实际观察：#474「Clarify whether SKILL.md metadata supports arbitrary values or only strings」2026-08-01 closed，正文举严格 Go 解析器报 `cannot unmarshal !!map into string`；PR #479 合入 `217be54873`（2026-08-04），patch 只改概览表 metadata 一行，追加「(a map from string keys to string values)」；仍 open：#514（2026-08-21，「a shipping runtime stores nested maps and booleans there」，举 Hermes 文档，4 条评论）、#350（2026-04-30，skills-ref `--allow-field`）、#485（2026-08-07，提议机器可求值的 `dependencies` 字段，all/any 语义）、#520 / #144（allowed-tools 字符串还是列表；#520 称约 14% 社区 skill 用列表写法）、#105（2026-01-24，提议吸收 Claude Code 的 `disable-model-invocation`、`model`、`context`、`agent` 等，19 条评论）
- 支持范围：抓取时刻的状态；open issue 是提议与报告，**不是规格**；#520 的 14%、#514 的 Hermes 文档内容均为**转述，未核原文**

### E19. omne-next 的扩展：复读与补读

- 消费对象：[omne-next 在 SKILL.md 之上的扩展](research.md#omne-next-的扩展都在-skillmd-之外或以不同键名出现)
- 来源与精确修订：omne-next `6263fed5`：`omne_agent_skills/omne_agent_skills/{types,load}.py`；`omne_core_v1/.../agentic/skill/spec/validator.py`；`omne_agent_capabilities/libs/omne_agent_capabilities/omne_agent_capabilities/domain/{entities,enums,install_models,publish_models,value_objects}.py`
- 来源立场：自有代码
- 取得方式：`sed -n`、`grep -n`
- 实际观察：omne_agent_skills `types.py:41-70` `SkillMetadata.metadata: dict[str, str] | None`、docstring 引「per Agent Skills spec」；`load.py:132-143`（`:133` 取值、`:141` 报错文案）metadata 键或值非字符串即报「all keys and values must be strings」；`load.py:208-225` 只取 name / description / license / compatibility / metadata / allowed-tools 六键，其余顶层键不读也不报。core_v1 `validator.py:152-175` `parse_frontmatter` 只取六键（其中 `allowed_tools` 为下划线），其余不读；`:177-192` 定界 `content.find("---", 3)`（`:180`、`:189`）。omne_agent_capabilities：`value_objects.py:13-24` 的 `SkillFrontmatter` 从 `omne_skill_spec` 再导出（即 core_v1 那份）；`entities.py:26` `VERSION_CAP = 20`、`:30-53` `SkillVersion`（frozen，`content_hash`、`commit_description`、`created_by`）、`:56-126` `Skill` 聚合含 `implementation`、`status`、`compliance_level`、`validation_warnings`、`call_count`、`last_invoked_at`、`agent_editable`、`install_mode`、`upstream`、`import_provenance`、`publish_policy`，不变式 I-4（租户）、I-5、I-8、I-9、I-10（订阅型须有 upstream）；`enums.py:15-50`（`:15`、`:29`、`:41`）`SkillSource`（developer 注「Immutable, stored in codebase」）、`SkillImplementation`（code_based 仅 developer）、`SkillStatus` active / disabled；`install_models.py:11-35` `InstallMode` subscribed / detached、`UpstreamSyncStatus` pristine / diverged / ahead / conflicted、`UpstreamInfo`；`publish_models.py` `PublishTrigger` manual / on_tag / on_commit、`SkillPublishPolicy`（enabled、trigger、`target_tenant_name`、`auto_version_from_tag`）、`TenantPublishSettings`
- 支持范围：字段与不变式的形状；**未读** application 与 agentic 层，不支持对订阅、发布流程行为的结论

### E20. Codex `5c5308f`：frontmatter 解析、名字与定界

- 消费对象：[Codex 的扩展放在侧车文件](research.md#codex-的-skill-扩展全在侧车文件-agentsopenaiyamlfrontmatter-只读三处)
- 来源与精确修订：`sources/codex-5c5308f-skills.tar.gz` 内 `codex-rs/skills/src/parser.rs`、`codex-rs/ext/skills/src/loader/{mod,host}.rs`
- 来源立场：厂商源码
- 取得方式：`cat -n`、`grep -n`
- 实际观察：`parser.rs:4` `MAX_NAME_LEN = 64`；`:7-14` `SkillFrontmatter` 只有 `name?`、`description?`、`metadata`，未设 `deny_unknown_fields`；`:17-18` `metadata` 只读 `short-description`；`:52` YAML 失败时 `repair_frontmatter_scalar_fields` 重试（给含 `: ` 的标量加单引号）；`:69` name 缺省时调 `default_name`；`:84` description 为空报 MissingField；name 只做长度校验（全文无字符集检查）；`:200-215` 定界：首行 trim 后为 `---`，下一个 trim 后为 `---` 的行闭合。`loader/host.rs:394-405` `default_skill_name` 取 `SKILL.md` 父目录名；`:320` 插件内 `qualify(&skill.name)` 为 `<namespace>:<name>`；`loader/mod.rs:23` `MAX_QUALIFIED_NAME_LEN = 129`
- 支持范围：源码阅读，**未编译运行**

### E21. Codex `5c5308f`：侧车文件 `agents/openai.yaml`

- 消费对象：[Codex 的扩展放在侧车文件](research.md#codex-的-skill-扩展全在侧车文件-agentsopenaiyamlfrontmatter-只读三处)、[调用面开关一处在内容一处在配置](research.md#codex-的调用面开关一处在侧车内容里一处在配置层)
- 来源与精确修订：`sources/codex-5c5308f-skills.tar.gz` 内 `codex-rs/ext/skills/src/loader/{mod,metadata}.rs`、`codex-rs/skills/src/{model,interface}.rs`、`codex-rs/skills/src/assets/samples/skill-creator/references/openai_yaml.md`、`codex-rs/ext/skills/src/loader/{host_merge,environment}.rs`；文档 `codex-docs-2026-09-20/manual.md:22605-22628`
- 来源立场：厂商源码与文档
- 取得方式：`cat -n`、`grep -n`
- 实际观察：`loader/mod.rs:20-21` 路径 `agents/openai.yaml`；`metadata.rs:28-35` 顶层 `interface`、`dependencies`、`policy`；`:83` 注释「Fail open: optional metadata should not block loading SKILL.md」，读失败、解析失败都只 `warn` 并返回空；`interface.rs:13-22` 六个 interface 字段，`:77-122` 图标须为 `assets/` 下相对路径（插件可 `..` 到插件级 `assets/`），`:180-197` `brand_color` 须 `#RRGGBB`；`model.rs:63-68` `SkillPolicy{allow_implicit_invocation, products}`，`:65` 注释「TODO: Enforce product gating in Codex skill selection/injection instead of only parsing and storing this metadata」，但 `host_merge.rs:152`、`environment.rs:184` 加载时按 `restriction_product` 过滤；`openai_yaml.md:3`「an extended, product-specific config intended for the machine/harness to read, not the agent. Other product-specific config can also live in the `agents/` folder」，`:42`「Only `mcp` is supported for now」，`:47-49` `allow_implicit_invocation` false 时不注入目录、`$skill` 显式仍可；`manual.md:22628` 同义
- 支持范围：源码阅读与文档；**未核**：`skills.read` 或目录渲染是否把 `agents/` 从资源列表里排除

### E22. Codex `5c5308f`：`dependencies` 的实际用途

- 消费对象：[Codex 的 dependencies 只认 mcp](research.md#codex-的-dependencies-只认-mcp用途是点名时提示安装不参与可用性判定)
- 来源与精确修订：`sources/codex-5c5308f-skills.tar.gz` 内 `codex-rs/core/src/mcp_skill_dependencies.rs`、`codex-rs/core/src/session/turn.rs`、`codex-rs/ext/skills/src/provider/host.rs`
- 来源立场：厂商源码
- 取得方式：`sed -n`、`grep -n`
- 实际观察：`mcp_skill_dependencies.rs:40-83` `maybe_prompt_and_install_mcp_dependencies` 的输入是 `mentioned_skills`（用户显式点名的 skill）；`:48` 非第一方客户端直接返回；`:57` 需特性开关 `SkillMcpDependencyInstall`；`:69-71` 先经托管策略准入；`:279` 提问文案「The following MCP servers are required by the selected skills but are not installed yet: … Install them now?」，选项「Install」「Continue anyway」；`:493` 非 `mcp` 类型跳过；`:379-396` 以 transport + url/command 做规范键，`transport` 缺省 `streamable_http`；`:398-473` 把依赖转成 `McpServerConfig` 写入配置。`turn.rs:984-994` 被点名 skill 的 mcp 依赖名并入本轮 required servers。`provider/host.rs:142` 目录条目只挂 `with_dependencies`。在克隆的 `ext/skills/src` 全目录检索 `dependencies`：命中只在加载（`loader/`）、目录条目挂载（`catalog.rs:187,246`、`provider/{host,executor}.rs`）与动态选择器把依赖名当检索词项（`dynamic_skill_selector/routing_card_lexical.rs:87-166`）三类，未见按依赖隐藏或禁用 skill 的代码（`catalog.rs` 与 `dynamic_skill_selector/` 不在钉存归档内）
- 支持范围：该 SHA 的源码路径；「不参与可用性判定」是**读遍 `ext/skills/src` 与 `core/src` 相关引用未见**的负面结论，未构造反例

### E23. Codex `5c5308f`：配置层开关、身份与同名、取用与脚本判定、MCP skill 导入

- 消费对象：[调用面开关](research.md#codex-的调用面开关一处在侧车内容里一处在配置层)、[身份与同名](research.md#codex-以-skillmd-路径为身份同名并列)、[逐资源摘要](research.md#openai-插件从-mcp-导入-skill-时逐资源带-sha256-摘要并取静态快照文档级)
- 来源与精确修订：`sources/codex-5c5308f-skills.tar.gz` 内 `codex-rs/config/src/skills_config.rs`、`codex-rs/ext/skills/src/loader/host_merge.rs`、`codex-rs/skills/src/name_counts.rs`、`codex-rs/ext/skills/src/tools/read.rs`、`codex-rs/ext/skills/src/catalog_prompt.rs`、`codex-rs/ext/skills/src/invocation.rs`；文档 `manual.md:22056-22171`、`:22480-22600`
- 来源立场：厂商源码与文档
- 取得方式：`cat -n`、`sed -n`
- 实际观察：`skills_config.rs:18-47` `SkillConfig{path?, name?, enabled}`、`SkillsConfig{bundled, include_instructions, max_context_tokens, config}`，挂在分层配置 `ConfigLayerStack` 上；`host_merge.rs:232-233` 只按 `path_to_skills_md` 去重，`:244-249` 按 scope Repo < User < System < Admin 再按 name、path 排序，`:262-269` `scope_rank`；`name_counts.rs:8-25` 统计同名次数供 `$name` 歧义判断；`manual.md` 「If two skills share the same `name`, Codex doesn't merge them; both can appear in skill selectors」；`tools/read.rs:34-66` 工具 `skills.read(package, resource?, cursor?)`，说明「pass the file's complete skill:// identifier as resource」；`catalog_prompt.rs:12` 「do not treat `skill://` identifiers as filesystem paths」，主机来源 skill 的提示让模型展开路径后读文件；`invocation.rs:59-63` 执行的文件位于 skill 目录 `scripts/` 下即记为该 skill 的隐式调用；`manual.md:22056-22171` 插件提交时从 MCP server 导入 skill，「currently supports a bounded, static subset of the draft SEP-2640 Skills extension」，条目含 `skill://` URI、「`frontmatter` containing every entry」、每个资源「SHA-256 digest … `sha256:<64 lowercase hexadecimal characters>`」，「The directory containing `SKILL.md` must match the skill name」，上限 100 文件 / 256 KiB / 1 MiB / 5 MiB，「Skills imported from MCP are submission-time snapshots, not live runtime resources」；`:22486-22494` 初始目录 ≤ 上下文 2% 或 8,000 字符，超出先截描述
- 支持范围：配置、去重与读取为源码；MCP 导入为**文档级**，源码未核

### E24. 本机实例对开放格式规则的机械套用统计

- 消费对象：[本机实例统计](research.md#本机实例对开放格式规则的机械套用结果)
- 来源与精确修订：`~/.codex/`（Codex CLI `0.156.1`；含 `skills/.system`、`plugins/cache/`、`.tmp/plugins/` 等 marketplace 副本）与 `~/.claude/plugins/`（同首轮 E13）
- 来源立场：厂商官方与社区插件（`.tmp/plugins/plugins/` 下有 Vercel、NVIDIA、Adobe 等第三方）
- 取得方式：PyYAML `safe_load`，按「首行 `---`、下一个独占 `---` 行闭合」切 frontmatter；name 按 `^[a-z0-9]+(-[a-z0-9]+)*$` 且 ≤64；未知键按规格六键白名单；侧车按顶层与二级键 `grep` 计数
- 实际观察：Codex 侧 562 份全部可解析，name 语法合规 561（例外 `.tmp/plugins/plugins/zotero/skills/zotero/SKILL.md` 的 `Zotero`），等于目录名 513，含规格外顶层键 59（`version` 33、`disable-model-invocation` 15、`tier` 9、`tools` 5，其余各 1：`context`、`maintainer`、`command`、`requires_bin`、`references`、`user-invocable`、`permissions`），带 `metadata` 106 份中 71 份含非字符串值（`priority` int、`docs`/`bashPatterns`/`pathPatterns`/`importPatterns`/`tags` list、`promptSignals` dict 等，集中在 `vercel` 插件），`allowed-tools` 字符串 12、列表 3；538 份 `agents/openai.yaml`：`interface` 538、`policy` 155（`allow_implicit_invocation` 154、`products` 1）、`dependencies` 2。Claude 侧 115 份全部可解析，name 语法合规 115、等于目录名 114，含规格外顶层键 68，无 `metadata`，`allowed-tools` 全为列表（8）
- 支持范围：**规格规则的机械套用，不是任何宿主的实际加载结果**；含重复副本，不代表去重后的 skill 数

### E25. Claude Code 文档的 frontmatter 全表（照引同程钉存字节）

- 消费对象：[Claude Code 在开放格式之上的键](research.md#claude-code-在开放格式之上另加十四个键并放宽-metadata-与-allowed-tools-的类型)、[未知键](research.md#开放格式对未知顶层键未作规定参考校验器拒收两家宿主静默忽略)
- 来源与精确修订：[`../slash-command-parsing-sources/sources/claude-code-slash-commands-2026-09-23.txt`](../slash-command-parsing-sources/sources/claude-code-slash-commands-2026-09-23.txt)（sha256 `4868ac94…2eb162`，页内最高版本注记 v2.1.280）
- 来源立场：厂商文档（自述）
- 取得方式：`grep -n`、`sed -n`，未重抓
- 实际观察：`:19`「Claude Code skills follow the Agent Skills open standard … extends the standard with additional features」；`:316`「Field names use lowercase words separated by hyphens, except `when_to_use`」；`:329`「Claude Code ignores a field it doesn't recognize without reporting an error」；`:331` 开头 `---` 须在首行，YAML 解析失败时 skill 照载、字段全空；`:333` 布尔取值在 v2.1.218 放宽；`:337-356` 字段表：`name`（No）、`description`（Recommended）、`when_to_use`、`argument-hint`、`arguments`、`disable-model-invocation`、`user-invocable`、`allowed-tools`（「during the turn that invokes this skill. The grant clears when you send your next message. Accepts a space- or comma-separated string, or a YAML list」）、`disallowed-tools`、`model`、`effort`、`context`、`agent`、`background`、`hooks`、`paths`、`shell`、`metadata`（「Free-form YAML map … drops a value that isn't a map」）、`license`、`compatibility`（后两者「accepts the field but doesn't act on it」）；`:358-373` claude.ai 上传、Skills API 与 `package_skill.py` 只收规格六键，多出即「Unexpected key(s) in SKILL.md frontmatter」硬错误；`:603`「The `` !`<command>` `` syntax runs shell commands before the skill content is sent to Claude」；`:639` `disableSkillShellExecution`；`:405-414` 正文变量替换
- 支持范围：文档级；本机未探针（同首轮局限）

## 后续核对

升级任何一个来源的对照版本时，在本页 grep 旧 token（`6263fed5`、`c291e796`、`2.1.280`、`1.17.41`、`69ef37e`、`217be54873`、`5c5308f`、`0.156.1`）即得需要重核的记录。
