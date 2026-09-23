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

## 后续核对

升级任何一个来源的对照版本时，在本页 grep 旧 token（`6263fed5`、`c291e796`、`2.1.280`、`1.17.41`）即得需要重核的记录。
