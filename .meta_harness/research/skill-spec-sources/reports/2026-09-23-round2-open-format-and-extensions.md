# 2026-09-23 · 第二轮：开放格式原文钉存与三家扩展盘点

本报告是第二轮调查的完整论证与盘点表原貌。当前该信什么以 [research.md 的「第二轮」](../research.md#第二轮开放格式原文与三家扩展) 为准；
每条观察的精确出处在 [evidence.md](../evidence.md) 的 E15–E25，下文用「E 编号」指向；原文字节在 [sources/](../sources/provenance.json)。

**本报告不写方案**：分类栏沿用提案 键分四类（核心 / 本项目扩展候选 / 属性类 / 未知）只为说明「这个键落在哪一格」，
「与 P 的关系」栏只写「撞上哪条、撞上会怎样」，不写该不该收。P1–P8 的原文见 alternatives.md。

## 一、调查对象与取得方式

| 代号 | 对象 | 精确版本 | 取得方式 |
|---|---|---|---|
| **开放格式** | agentskills/agentskills 的 `docs/specification.mdx`、`docs/client-implementation/adding-skills-support.mdx`、参考库 `skills-ref` 0.1.0 | 仓库 HEAD `69ef37e9424c0a7ea9dd2293b559e43ec8176379`（2026-08-09）；规格页最后一次改动 `217be54873`（2026-08-04，PR #479）；规格与仓库**都没有版本号** | 站点 `agentskills.io/specification.md` 与 GitHub raw 同日抓取，字节钉存于 `sources/`（E15–E17） |
| **omne-next** | `omne_skill_spec` / core_v1 `agentic/skill`、`omne_agent_skills` 0.3.1、`omne_agent_capabilities` 的 skill 聚合 | commit `6263fed5`（工作树干净） | 本机仓库直接读；首轮 E1–E8 的复读与补读（E19） |
| **Codex** | openai/codex 的 `codex-rs/skills`、`codex-rs/ext/skills`、`config/src/skills_config.rs`、`core/src/mcp_skill_dependencies.rs` | commit `5c5308fc9a9ee789049d646ef11e5400384b9c6f` | 本机同 SHA 克隆 `git archive` 出所读路径并钉存 `sources/codex-5c5308f-skills.tar.gz`；官方文档离线副本 `codex-docs-2026-09-20`（E20–E23） |
| **本机实例** | `~/.codex/` 下 562 份 `SKILL.md` 与 538 份 `agents/openai.yaml`；`~/.claude/plugins/` 下 115 份 `SKILL.md` | Codex CLI `0.156.1`（本机安装，**不是** `5c5308f` 的构建）；Claude Code `2.1.280` | 本机文件直接读，PyYAML 统计（E24） |
| **Claude Code** | skills 文档 frontmatter 全表 | 同程钉存字节 `claude-code-slash-commands-2026-09-23.txt` | 照引，不重抓（E25） |

## 二、开放格式原文：四问加一问

### 2.1 frontmatter 全部字段与必填性

规格概览表（`specification.mdx:25-32`）列六个字段：

| 字段 | 必填 | 规格原文约束 |
|---|---|---|
| `name` | Yes | ≤64；小写字母、数字、连字符；不以连字符起止 |
| `description` | Yes | ≤1024；非空；「Describes what the skill does and when to use it」 |
| `license` | No | 许可名或包内许可文件名 |
| `compatibility` | No | ≤500（字段节 `:126` 另写「Must be 1-500 characters if provided」）；环境要求 |
| `metadata` | No | 「a map from string keys to string values」 |
| `allowed-tools` | No | 「Space-separated string of pre-approved tools the skill may use. (Experimental)」 |

`SKILL.md`「must contain YAML frontmatter followed by Markdown content」（`:21`）；文件名在参考库里 `SKILL.md` 优先、也接受小写 `skill.md`（`parser.py:23`）。

### 2.2 name 语法与上限

字段节（`:60-65`）五条：1–64 字符；「May only contain unicode lowercase alphanumeric characters (`a-z`, `0-9`) and hyphens」；不以连字符起止；**不得含连续连字符**；**必须等于父目录名**。

两处与这五条不一致的地方：

- **字符集的表述自相含糊**：同一句里说「unicode lowercase alphanumeric」又括注 `a-z`、`0-9`。参考库按前者实现——NFKC 规范化后 `str.isalnum()` 且等于其小写（`validator.py:37-58`），探针里 `name: 日本語`（目录同名）**通过**（E17 探针 5）。`6868401b64`（2026-05-16）的提交信息是「fix name field character range to include digits」，改的是括注。
- **客户端实现指南放宽了其中两条**：「Name doesn't match the parent directory name → warn, load anyway」「Name exceeds 64 characters → warn, load anyway」，并注明「deliberately relaxes these to improve compatibility」（`adding-skills-support.mdx:128-140`）。

### 2.3 `metadata` 值的类型

**只许字符串**。字段节一直写「A map from string keys to string values」（`:150`）；概览表原写「Arbitrary key-value mapping」，issue #474 指出两处矛盾，PR #479（`3f3bbec813`，2026-08-03 提交、08-04 合入）只把概览表补成「…(a map from string keys to string values)」——**选了字符串那一边**（E18）。同节：「Clients can use this to store additional properties not defined by the Agent Skills spec」「We recommend making your key names reasonably unique」（`:151-152`）。

实现侧并不一致（E17、E18、E24、E25）：

| 谁 | 对非字符串 `metadata` 值怎么做 |
|---|---|
| 参考库 skills-ref | 不报错；`str(v)` 强转（`parser.py:62`）——块写法的嵌套映射变成 Python repr 字符串 `"{'tools': ['a', 'b']}"`，`1.0` 变 `'1.0'`，`true` 变 `'true'`（探针 12、13）；流式写法 `[a, b]` 被 strictyaml 以「ugly disallowed JSONesque flow」**拒为 YAML 错误**（探针 3、4） |
| Claude Code | 文档：「Free-form YAML map … doesn't act on its contents, and drops a value that isn't a map」——值类型不限 |
| Codex `5c5308f` | 只读 `metadata.short-description`，其余子键忽略 |
| omne_agent_skills | 非字符串值报校验问题 |
| omne-next core_v1 | `dict[str, Any]`，结构化照收 |
| issue #474 所举的严格 Go 解析器 | `cannot unmarshal !!map into string`，skill 载入失败（issue 转述） |
| 本机实例 | Codex 生态 106 份带 `metadata` 中 71 份含非字符串值（Vercel 插件的 `priority`/`pathPatterns`/`promptSignals` 等）；issue #514（open）报告 Hermes 把 `requires_toolsets`、`config`、`blueprint` 等结构放在 `metadata.hermes` 下并据此决定 skill 是否进系统提示 |

### 2.4 规格对未知顶层键的态度

**规格正文未述。**正文没有一句话说宿主遇到六键以外的顶层键时拒绝、忽略或告警；唯一相关的是 `metadata` 字段节的「Clients can use this to store additional properties not defined by the Agent Skills spec」——它给出了一个放扩展的地方，但没有说别处不许放。

规格之外的四种态度并存（E16、E17、E25、E20）：

| 谁 | 态度 |
|---|---|
| 参考库 skills-ref `validate` | **拒**：`ALLOWED_FIELDS` 六键白名单，多一个即错误「Unexpected fields in frontmatter: …」（`validator.py:14-22,104-115`；探针 2：`user-invocable` 被拒） |
| 客户端实现指南 | **不提**：步骤 2 只说「Extract `name` and `description` (required), plus any optional fields」，宽松校验清单里没有未知键一项 |
| Claude Code 本地加载 | **静默忽略**：「Claude Code ignores a field it doesn't recognize without reporting an error」 |
| claude.ai 上传 / Skills API / `package_skill.py` | **硬拒**：「Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: …」 |
| Codex `5c5308f` | **静默忽略**：`SkillFrontmatter` 只声明 `name`、`description`、`metadata`，未设 `deny_unknown_fields` |

open PR #350（2026-04-30）提议给 skills-ref 加 `--allow-field`，理由是「any skill using a custom field fails validation」。

### 2.5 `allowed-tools`：宿主必须执行，还是可选

**可选，且标为实验性**。字段节：「A space-separated string of tools that are pre-approved to run」「Experimental. Support for this field may vary between agent implementations」（`:166-167`）。规格全文没有「合规宿主」一节，对宿主行为的表述只有渐进披露一段描述句；**没有任何字段被规定为宿主必须执行**。

同一个字段在规格生态里有三种读法（E15、E17、E25）：

- 规格：预批准（pre-approved to run），实验性；
- 参考库 `models.py:16` 的注释：「Tool patterns the skill **requires**」——读成依赖；参考库对它**不做类型检查**，块写法 YAML 列表照过（探针 14）、流式 `[Read, Grep]` 因 strictyaml 被拒（探针 9）；
- Claude Code：「Tools Claude can use without asking permission during the turn that invokes this skill. The grant clears when you send your next message」，接受空格或逗号分隔串**或 YAML 列表**。

open issue #144 / PR #520 讨论「字符串还是列表」；#520 称约 14% 的社区 skill 用列表写法（未核）。

### 2.6 附带核对：定界、正文、目录

- **定界**：规格只说「YAML frontmatter followed by Markdown」；实现指南写「Find the opening `---` at the start of the file and the closing `---` after it … Everything after the closing `---`, trimmed, is the skill's body」（`:111-113`），**没说闭合 `---` 必须独占一行**。参考库 `content.split("---", 2)`（`parser.py:45`）与 omne-next core_v1 的 `find("---", 3)` 同病：`description: see a---b here` 被截成 `see a`、`b here\n---\nbody` 成了正文，且**校验通过**（探针 8）。Codex 按行判定（首行与闭合行都 trim 后等于 `---`，E20）；Claude Code 文档只说开头 `---` 须在首行（E25）。
- **正文**：「There are no format restrictions」（`:178`）；空正文参考库照过（探针 10）；「Keep your main `SKILL.md` under 500 lines」是建议（`:224`）。
- **目录**：「A skill directory may contain any files and directories beyond the required `SKILL.md`. The conventions below are recommendations」（`:189`）。`scripts/`「Contains executable code that agents can run」，没有「只有 `scripts/` 下的文件可执行」之类的约束。
- **版本**：规格没有版本字段；`metadata` 示例里有 `version: "1.0"`（字符串）。
- **同名**：实现指南：「project-level skills override user-level skills」是「universal convention」，同 scope 内先到或后到都行、须告警（`:81-87`）。

## 三、扩展盘点

**读法**：每行一个扩展字段或约定。「分类」：核心 = 开放格式六键之一；扩展候选 = 形态上对应提案的「本项目扩展」（依赖、执行环境、设置项声明、正文变体）；属性类 = 调用面开关、预批准、谁可用、执行设置这类值；未知 = 前三格都不是；非键的目录或规则约定标「约定」。
「与 P」只列有关系的几条：**同向**（不挡这条性质）/ **相抵**（原样照搬会撞上）/ **有前提**。

### 3.1 omne-next

| # | 字段/约定 | 在原处的作用 | 分类 | 与 P | 撞上会怎样 |
|---|---|---|---|---|---|
| O1 | core_v1 `allowed_tools`（下划线，`list[str]`） | 「declarative hint, NOT enforced」；`validate_tool_hints` 只返回缺失名单（E2） | 属性类（与 `allowed-tools` 同族，键名不同） | P1 相抵 | 开放格式与 Claude Code 写的 `allowed-tools` 在 core_v1 读成空列表，不报告（E7） |
| O2 | core_v1 `metadata: dict[str, Any]` | 自由结构 | 核心，值类型宽于规格 | P1 有前提；P8 同向 | 带结构化值的 skill 送到严格宿主：skills-ref 静默转成 repr 字符串，Go 严格解析器拒载（2.3） |
| O3 | core_v1 H-004「name 等于目录名」硬错误 | 目录合规 | 核心规则（规格同写 Must） | P1 同向；P8 需跨对象规则 | 规格本身要求；本项目资产不是目录时该规则无对象（提案已述） |
| O4 | core_v1 H-006「正文非空」 | 硬错误 | 约定（严于规格） | P7 相关 | 规格允许空正文；规格合规文件在 core_v1 判 NON_COMPLIANT |
| O5 | core_v1 三级判定 full / partial / non_compliant；S-001 非标准子目录软警告 | 带告警装载 | 约定（规则层） | P8 有前提 | JSON Schema 只有通过与不通过，「带告警收下」要另一层表达；S-001 对规格允许的任意目录也告警 |
| O6 | core_v1 定界 `find("---", 3)` | 解析 | 约定 | **P7 相抵** | 与 skills-ref 同病（2.6） |
| O7 | core_v1 resolver：`SkillId` 为身份、`name` 为显示名；`version`、`content_hash`、`SkillStatus`（enabled / disabled / deprecated） | 按版本钉取，缺省取「latest enabled」（E3） | 身份：未知；版本与摘要：资产层；状态：属性类 | P2 相抵（身份不是 name）；P5 有前提（有摘要，无不可变承诺） | — |
| O8 | importer `ImportProvenance`、来源格式枚举（agent_skills_spec / skills_sh / github / claude_code / cursor / openhands / native） | 记录从哪导入（E4） | 未知（导入元数据，不进内容） | P1 同向 | 枚举有值、没有对应的格式适配步骤（E4） |
| O9 | omne_agent_capabilities 聚合根：`install_mode`（subscribed / detached）、`upstream`（marketplace 名、`installed_version`、`sync_status` pristine / diverged / ahead / conflicted）、`publish_policy`（enabled、trigger manual / on_tag / on_commit、`target_tenant_name`、`auto_version_from_tag`）、`agent_editable`、`implementation`（code_based / file_directory）、`status`（active / disabled）、`call_count`、`last_invoked_at` | skill 的安装、订阅、发布与编辑权（E19） | 属性类 / 资产层（都在 `SKILL.md` 之外） | P6 同向（不在内容里）；**P5 相抵**（`VERSION_CAP = 20`，存储超限删最旧版本 tag，E8） | 订阅型要求 `upstream` 且 `agent_editable=False`（不变式 I-10）；聚合的 frontmatter 就是 core_v1 的 `SkillFrontmatter`（经 `omne_skill_spec` 再导出） |
| A1 | omne_agent_skills `allowed-tools`（连字符，空格分隔串） | 只校非空；文件型扫描不带出（E5） | 属性类 | P6 相抵方向（在内容里），但不执行 | — |
| A2 | omne_agent_skills `metadata: dict[str, str]` | 非字符串值报问题（E19） | 核心，与规格一致 | P1 同向 | Codex 生态 71 份含非字符串 `metadata` 的 skill 会被报问题 |
| A3 | 正文 >500 行告警；文件须在 `scripts/ references/ assets/` 下；目录深度规则 | 告警不拒（E5） | 约定（严于规格） | — | 规格允许任意文件，顶层 `README.md` 被告警（E7） |
| A4 | `SkillSource` user / project / toolset，project 覆盖 user、两者覆盖 toolset | 同名优先序（E6） | 约定 | 与 P 无直接关系 | 与实现指南「project overrides user」同向；与 PF-002 按归属层求值不同构（首轮） |
| A5 | `SkillableToolsetProtocol`：工具集把自己暴露成 skill，正文缺省由工具说明拼成，可给虚拟文件树 | 工具即技能（E5） | 未知（本项目没有这种来源种类） | **P5 相抵**（正文随工具实现变）；P1 有前提（磁盘上没有 `SKILL.md`） | 首轮已述：skill 无独立身份 |
| A6 | `read_skill(skill_name, file)`：`file=None` 返回去掉 frontmatter 的正文、`"."` 列目录、相对路径读文件并做穿越检查 | 取用（E6） | 约定 | P3 同向 | — |

### 3.2 Codex `5c5308f`

| # | 字段/约定 | 在原处的作用 | 分类 | 与 P | 撞上会怎样 |
|---|---|---|---|---|---|
| C1 | frontmatter `name` 可缺省，缺省取父目录名；只校长度 ≤64，**不校字符集与目录一致**；插件内限定为 `<namespace>:<name>`，≤129 | 身份与显示（E20） | 核心，规则宽于规格 | **P2 相抵**（name 非必填） | 本机 562 份中 1 份 `name: Zotero` 不合规格语法、49 份不等于目录名（E24）；导入时要补名或改名 |
| C2 | `metadata.short-description`（字符串） | UI 短描述（E20） | 未知（放在规格的 `metadata` 通道里） | P1 同向 | — |
| C3 | 未知顶层键静默忽略 | 解析宽收（E20） | 约定 | P1 同向 | 本机 Codex 实例 59 份带规格外顶层键（`version` 33、`disable-model-invocation` 15、`tier` 9…），在 Codex 里不生效也不报告（E24） |
| C4 | YAML 解析失败时逐行给含 `: ` 的标量加引号重试 | 兼容「`description: Build for AWS: ECS`」这类写法（E20） | 约定（规则层） | P8 有前提 | 与实现指南「Handling malformed YAML」建议同向；修复规则不写进规则表就不能跨语言复现 |
| C5 | 定界：首行 trim 后为 `---`，下一个 trim 后为 `---` 的行闭合 | 解析（E20） | 约定 | P7 同向 | — |
| C6 | **侧车文件 `agents/openai.yaml`**：「an extended, product-specific config intended for the machine/harness to read, not the agent. Other product-specific config can also live in the `agents/` folder」；缺失、读失败、解析失败都只告警（fail open） | 放 Codex 专有配置（E21） | 约定（包内保留路径文件；其内各键另列） | P1 同向（`SKILL.md` 不动）；P3 **未核**（`skills.read` 列资源时是否排除 `agents/`） | 形态与提案子路径 B-2b 同构；外部宿主把它当普通资源文件 |
| C7 | `interface.{display_name, short_description, icon_small, icon_large, brand_color, default_prompt}`；图标须在 `assets/` 下（插件可 `..` 到插件级 `assets/`）；`default_prompt` 须含 `$skill-name` | ChatGPT 桌面端与选择器的呈现；`default_prompt`「Default prompt snippet inserted when invoking the skill」（E21） | 未知（展示元数据） | P7 有前提 | `default_prompt` 是调用时插入的另一段文字，不是正文；两条入口进日志的文字是否一致取决于它 |
| C8 | `policy.allow_implicit_invocation`（缺省 true） | false 时不进目录（`hidden_from_prompt`），`$name` 显式调用仍可（E21、E23） | 属性类（调用面开关） | **P6 相抵**（在随包复制的侧车内容里） | 原样导入即把作者的调用面意图变成内容；本机 538 份侧车里 154 份写了它 |
| C9 | `policy.products` | 按产品（Codex / ChatGPT / Atlas…）限定可用：加载器按会话的 `restriction_product` 过滤（`host_merge.rs:152`、`environment.rs:184`）；`model.rs:65` 的注释「TODO: Enforce product gating … instead of only parsing and storing」与加载器行为不符（E21） | 属性类（在哪可用） | P6 相抵 | 同 C8 |
| C10 | **`dependencies.tools[]`**：`type`、`value`、`description`、`transport`、`command`、`url`、`oauth.callback_port` | **只认 `type: mcp`**；用户显式点名该 skill 时，若为第一方客户端且开关 `SkillMcpDependencyInstall` 开启，比对已装 MCP server，缺的弹问「Install / Continue anyway」，同意后写入配置；**不影响 skill 是否列出、能否调用**（E22） | 扩展候选（依赖声明） | P6 有前提（连接端点与 OAuth 回调端口是配置性质的值，写在内容里）；P8 同向 | 与 PF-006「指向能力标识、缺了判不可用」语义不同：Codex 的是「安装指引」。原样导入会把作者指定的 MCP 端点当成满足依赖的途径；本机 538 份侧车里 2 份带它 |
| C11 | config.toml `[[skills.config]]`（`name` 或 `path` 选择器 + `enabled`）、`skills.bundled.enabled`、`skills.include_instructions`、`skills.max_context_tokens` | 按配置层启停 skill、控制目录注入（E23） | 属性类（设置层，不在内容里） | P6 同向 | — |
| C12 | 身份 = `SKILL.md` 规范路径；按路径去重，同名**不合并、并列**；按 scope Repo < User < System < Admin 排序；`$name` 只在无歧义时选中 | 发现与选择（E23；首轮 CX-7） | 约定 | P2 有前提（name 不唯一） | 同 Claude Code：同名 skill 进「同名即替代」的系统会从并列变成替代 |
| C13 | `skills.read(package, resource?, cursor?)`：执行环境与编排器来源的 skill 以 `skill://` 包内标识取资源，提示词明写「do not treat `skill://` identifiers as filesystem paths」；主机来源 skill 仍由模型按路径读文件 | 取用（E23） | 约定 | P3 同向（非主机来源）/ 相抵（主机来源给路径） | — |
| C14 | 执行的文件落在某 skill 目录的 `scripts/` 下 → 记为该 skill 的一次隐式调用 | 调用记录与遥测（E23） | 约定 | P4 有前提 | 「`scripts/` 下即自带脚本」有判定先例，但只用于记录，不授予执行权 |
| C15 | OpenAI 插件提交时从 MCP server 导入 skill（SEP-2640 草案的静态子集）：`skill://` URI、frontmatter「every entry」、**每个资源一个 `sha256:` 摘要**、目录名须等于 name、上限 100 文件 / `SKILL.md` 256 KiB / 单文件 1 MiB / 合计 5 MiB、导入即静态快照 | 分发（文档级，E23） | 约定 | P5 同向（逐资源摘要 + 快照） | 仅文档所述，源码未核 |
| C16 | 发现根：`.agents/skills`（CWD 到仓库根逐级）、`$HOME/.agents/skills`、`/etc/codex/skills`、系统内置；扫描深度 6、每根 ≤2000 目录；初始目录 ≤ 上下文 2% 或 8000 字符，超出先截描述、再省略 | 发现（E23） | 约定 | P2 有前提（描述被截时路由依据变短） | 与实现指南的 `.agents/skills` 跨客户端约定一致 |

### 3.3 Claude Code（照引同程钉存的文档字节，未重做）

来源：[`claude-code-slash-commands-2026-09-23.txt`](../../slash-command-parsing-sources/sources/claude-code-slash-commands-2026-09-23.txt) `:314-376`（E25）。首轮本机实例已列出现过的键（[首轮报告第四节](2026-09-23-skill-spec-sources.md#四agent-skills-本机实例实际出现了哪些字段)），这里只补文档全表与它在开放格式之上的差异。

| # | 字段/约定 | 作用 | 分类 | 与 P | 撞上会怎样 |
|---|---|---|---|---|---|
| K1 | `name` 可缺省（显示名；命令名取目录名） | 显示 | 核心，必填性宽于规格 | **P2 相抵** | 同 C1 |
| K2 | `description` Recommended，缺省取正文首个非空行；`when_to_use` 追加进目录，二者合计截到 1,536 字符 | 路由 | `description` 核心；`when_to_use` 未知 | P2 有前提（路由依据分两处） | — |
| K3 | `argument-hint`、`arguments` 与正文占位 `$ARGUMENTS`、`$N`、`$name` | 斜杠命令参数 | 属性类（提案表已列 `argument-hint`） | **P7 相抵** | 正文随参数展开，同一 skill 两条入口进日志的文字不同 |
| K4 | `disable-model-invocation`、`user-invocable` | 调用面开关 | 属性类 | **P6 相抵** | 首轮已述 |
| K5 | `allowed-tools`（本轮免审批，下一条消息清除；空格或逗号串或 YAML 列表）、`disallowed-tools` | 预批准与禁用 | 属性类 | **P6 相抵**；`allowed-tools` 类型宽于规格 | 首轮已述 |
| K6 | `model`、`effort`、`context: fork`、`agent`、`background`、`shell` | 执行设置 | 属性类 | P6 相抵 | — |
| K7 | `hooks` | skill 被调用时注册、在会话剩余时间持续生效的 hooks | 未知 | P6 相抵；影响超出本轮 | — |
| K8 | `paths` | glob 限定自动加载时机 | 属性类 | P6 相抵 | — |
| K9 | `metadata`「Free-form YAML map」，不作用、非 map 值丢弃 | 用户自有数据 | 核心，值类型宽于规格 | P1 有前提 | 同 O2 |
| K10 | 正文 `` !`cmd` `` 与 ` ```! ` 块：「runs shell commands before the skill content is sent to Claude」；`${CLAUDE_SKILL_DIR}` 等变量替换 | 动态注入 | 约定（正文语法） | **P4 相抵**（展开时就执行 shell，不经 `exec_script`）；**P7 相抵**（展开结果随环境变）；P3 相抵（`${CLAUDE_SKILL_DIR}` 给出目录路径） | 可由 `disableSkillShellExecution` 关掉；claude.ai 同步来的 skill 不执行 |
| K11 | 未识别字段本地静默忽略；claude.ai 上传、Skills API、`package_skill.py` 对六键外字段硬错误 | — | 约定 | — | 同一份 `SKILL.md` 在同一厂商的两条路径上一收一拒 |

## 四、本机实例对开放格式的通过情况

用 PyYAML 按「首行 `---`、下一个独占 `---` 行闭合」解析，逐项对规格规则计数（E24）。**这是规格规则的机械套用，不是任何宿主的实际行为**；两份数据都含 marketplace 与缓存的重复副本。

| 项 | `~/.codex/`（562） | `~/.claude/plugins/`（115） |
|---|---|---|
| frontmatter 可解析 | 562 | 115 |
| name 满足 `^[a-z0-9]+(-[a-z0-9]+)*$` 且 ≤64 | 561 | 115 |
| name 等于父目录名 | 513 | 114 |
| 含六键以外的顶层键（skills-ref 会拒） | 59 | 68 |
| 带 `metadata` 且含非字符串值 | 71 / 106 | 0 / 0 |
| `allowed-tools` 的 YAML 类型 | 字符串 12、列表 3 | 列表 8 |

首轮提案「证据义务」表里「122 份实例的 name 合规率，未计量」一项，插件部分由此得数：115 份全部满足规格的 name 语法，1 份不等于目录名。本仓库 canonical 7 份本轮未重算。

## 五、这一轮对提案「会改变选择的证据」表的逐条对照（只报事实）

| 提案表中的证据 | 本轮观察 |
|---|---|
| 开放格式原文规定某个属性类键**必须**被宿主执行 | 未出现：`allowed-tools` 明标 Experimental、「Support … may vary」；规格没有宿主合规条款（2.5） |
| 开放格式原文允许 `metadata` 放结构化值 | 相反：2026-08-04 起概览表与字段节一致为字符串到字符串；但 Claude Code、core_v1 与本机 Codex 生态实例都放结构化值，issue #514（open）在追这个分歧（2.3） |
| 开放格式原文与本机实例在 name 语法或定界上有实质差异 | name：本机插件实例全部满足规格语法；规格字符集表述自相含糊、参考库收 Unicode 字母（2.2）。定界：规格未规定闭合行独占，参考库与 core_v1 同样会截断，Codex 与 Claude Code 按行（2.6） |
| 规格对未知键的态度（提案「接受前必须补的一项」） | 规格正文未述；参考校验器拒、Claude Code 本地与 Codex 忽略、claude.ai 上传硬拒（2.4） |
