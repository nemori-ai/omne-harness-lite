# 可复核的来源与观察

本页按来源记录：精确对象、取得方式、实际观察（带 `路径:行号`）、支持范围与局限。
当前结论见 [research.md](research.md)。与「deny 不可被任何层放宽」「仓库不能给自己提权」相关的四家证据
不在这里重复，见 [agent-harness-session-design/evidence.md](../agent-harness-session-design/evidence.md)
与其 [reports/](../agent-harness-session-design/reports/)。

## E1 DSH

- 消费对象：research.md 的全部七条结论。
- 来源与精确修订：`deepseek-ai/deepseek-harness` `c291e7961a515f6d7af9304e7fd1d257929aef26`，`@deepseek-ai/dsh-root@0.1.5-rc.2`。
- 来源立场：厂商自述（仓库文档与源码）。短板只取其自己写的 Known Limitations，未找第三方批评。
- 取得方式：主检出 `tmp/sources/dsh-c291e79.tar.gz`（SHA256 `f08cfc86…0860`，见 `tmp/sources/SHA256SUMS`）解压到
  `tmp/sources/extracted/dsh/`；只读 grep 与阅读。未运行任何代码。
- 环境与前提：单一快照，未看 git 史。

实际观察（路径相对 `extracted/dsh/`）：

| # | 观察 | 位置 |
|---|---|---|
| D1 | 设置只有三层：schema 默认 → 装配 `base`（`cordis.yml`）→ 用户文档；**用户层永远压过部署自己的配置**，没有锁定项 | `docs/subsystems/settings.md:5`、`:63`；`packages/settings/README.md:12` |
| D2 | 设置文件只有一份，默认在 harness home（`<harness home>/settings.yaml`），**没有项目级设置文件** | `packages/settings/settings-file/README.md:44-45` |
| D3 | 技能注册表按作用域分层：**最近一层的同名条目整条替换较远一层**；同一层内按 rank → provider 注册序 → provider 内序先到先得 | `docs/subsystems/skills.md:13-15`；`packages/skill/skill/src/index.ts:551-563` |
| D4 | 本地技能根的 rank：`project-dsh` 100 < `project-agents` 200 < `custom` 300 < `user-dsh` 400 < `user-agents` 500 < `bundled` 600，**rank 低者赢**——项目目录里的同名技能压过用户的和随包的 | `docs/subsystems/skills.md:64-75`；`packages/skill/skill-filesystem/src/index.ts:36-40`、`:245-264` |
| D5 | 自述短板：「Duplicate resolution is first-wins … **a nearer layer shadows a farther one silently; there is no API to inspect all shadowed definitions**」 | `packages/skill/skill/README.md:141` |
| D6 | 技能正文每次加载都向 provider 取当前版本，不缓存；`get()` 先选当前胜出的候选再加载——引用按名字晚绑定 | `packages/skill/skill/README.md:99` |
| D7 | 技能的「不给模型用 / 不给人用」是技能文件自己 frontmatter 上的两个布尔（`disable-model-invocation`、`user-invocable`），**不是分层配的设置** | `packages/skill/skill-filesystem/README.md:36-38` |
| D8 | 工具注册：作用域内注册的同名工具遮蔽全局工具 | `docs/subsystems/tools.md:482`、`:499-500` |
| D9 | `ToolRestriction`：一个作用域对**它继承来的**工具（全局层＋祖先作用域）做 allow/deny 过滤，多条限制**取交集**；**作用域自己注册的工具豁免**，也不受限制影响 | `docs/subsystems/tools.md:155`、`:159-160`、`:507-509` |
| D10 | 作用域原语：子继承祖先的贡献、最近定义优先；**明说它不是沙箱也不是授权边界** | `packages/core/scope/README.md:12`、`:60` |
| D11 | 预设（agent preset）根按优先序扫描，**先出现的根赢重复 id**；随包根被前置，「built-in set … **wins duplicate ids** even when a patch replaces the roster configuration」 | `packages/preset/agent-presets/README.md:53-60`；`packages/preset/agent-presets/src/discovery.ts:327-329` |
| D12 | MCP 工具公开名是 `mcp__<serverName>__<rawName>`：两个 server 各有一个 `search` 时**并存**为 `mcp__github__search` 与 `mcp__web__search`；有损归一化时追加 12 位 SHA-256 以免「distinct identities never collapse」；文档自称与 Claude Code、Codex 同一命名形状 | `packages/mcp/mcp-client/README.md:74`、`:107` |

- 支持范围：DSH 单进程、单用户的装配；不支持任何关于组织/租户层的推论。
- 局限：没有看到 DSH 对「项目技能遮蔽随包技能」设信任闸（`trustedHost` 只用于随包根的读取路径，
  `packages/skill/skill-filesystem/src/index.ts:262`、`:755`），但未逐行审完 provider，**不能断言绝对没有**。
- 后续核对：DSH 升版本时 grep 本页 `c291e796`。

## E2 Codex

- 消费对象：research.md 的全部七条结论。
- 来源与精确修订：`openai/codex` `5c5308fc9a9ee789049d646ef11e5400384b9c6f`，副本只含
  `codex-rs/{hooks,protocol,rmcp-client,core/src}` 与 `docs`；官方文档离线副本 2026-09-20 抓取自 learn.chatgpt.com。
- 来源立场：厂商自述。
- 取得方式：`tmp/sources/codex-5c5308f.tar.gz`（SHA256 `b668fda3…baa`）与 `tmp/sources/codex-docs-2026-09-20.tar.gz`
  （SHA256 `8f6bc617…8b78931`）解压到 `tmp/sources/extracted/codex/`、`extracted/codex-docs/`；只读 grep 与阅读。
- 环境与前提：**`codex_config` crate 不在副本里**，配置层装载、项目层禁用键过滤、层间合并的实现未在源码核对；
  文档页不带版本号。凡只有文档证据处，结论里标明。

实际观察（源码路径相对 `extracted/codex/codex-rs/`，文档相对 `extracted/codex-docs/`）：

| # | 观察 | 位置 |
|---|---|---|
| C1 | 普通配置七层（高到低）：CLI → 项目 `.codex/config.toml`（**仅受信项目**，离工作目录最近者赢）→ profile → 用户 → 云托管默认 → 系统 → 内置 | `config-file_config-basic.md:21-29` |
| C2 | 项目不受信时整层跳过（含项目 config、hooks、rules） | `config-file_config-advanced.md:94`；`config-file_config-basic.md:37` |
| C3 | 受信项目层也忽略一张固定键清单：`openai_base_url`、`chatgpt_base_url`、`apps_mcp_product_sku`、`model_provider`、`model_providers`、`notify`、`profile`、`profiles`、`experimental_realtime_ws_base_url`、`otel`——理由原文是「redirect credentials, alter host-owned app request metadata, change provider auth, select config profiles, or run machine-local notification/telemetry commands」 | `config-file_config-advanced.md:98-109`；`config-file_config-reference.md:10-18` |
| C4 | 审批策略可写在项目配置里（迁移说明要求从「user or project configuration」里删掉退役的 `untrusted` 值）；清单 C3 不含 `approval_policy` / `sandbox_mode` | `agent-approvals-security.md:19-21` |
| C5 | 管理员侧三件不同的东西：**Requirements**（用户不能覆盖的约束）、**Configuration defaults**（用户可覆盖）、**Legacy managed defaults**（启动时的初值，运行中可改、下次启动重置） | `enterprise_managed-configuration.md:9-11`、`:763-798` |
| C6 | Requirements 四个来源之间：标量与列表高覆盖低，表按键合并，「rules, hooks, and filesystem restrictions have **field-specific composition behavior** … instead of assuming that every field merges the same way」 | `enterprise_managed-configuration.md:56-72` |
| C7 | 锁的表示是逐字段的允许集：`allowed_approval_policies`、`allowed_sandbox_modes`、`allowed_permission_profiles.<name>`、`allowed_web_search_modes`、`allowed_login_methods` 等；配置值与之冲突时「falls back to a compatible value and notifies the user」 | `enterprise_managed-configuration.md:27`；`config-file_config-reference.md:1870`、`:1894`；`core/src/config/mod.rs:2198-2231`（`apply_requirement_constrained_value`：冲突→告警→回落到 requirement 值，回落也失败才报错） |
| C8 | 源码里受 requirements 约束的字段统一包成 `Constrained<T>`：`approval_policy`、`permission_profile`、`enforce_residency`、`mcp_servers`、`web_search_mode` | `core/src/config/mod.rs:324`、`:358`、`:665`、`:846`、`:1037` |
| C9 | 高优先级 requirements 可以用 `false` 关掉低优先级 requirements 允许的 profile（云 `":workspace" = false` 压过系统 `= true`） | `enterprise_managed-configuration.md:303-321` |
| C10 | Requirements 里的 `models.new_thread.model` **仍是默认值**：「take priority over user and project defaults, but **can be superseded by explicit overrides**」——模型不在可锁之列 | `config-file_config-reference.md:1917-1921` |
| C11 | Requirements 的 `[features]` 可把特性**钉成开或关**（「Require a documented runtime or app feature to stay enabled or disabled」） | `config-file_config-reference.md:2029-2038`；`enterprise_managed-configuration.md:497-520` |
| C12 | MCP 允许清单：**server 名与身份（stdio 的 `command` / HTTP 的 `url`，可细到可执行文件与逐个参数）都要对上**才启用，否则禁用；清单存在但为空时全禁 | `enterprise_managed-configuration.md:27`、`:663-695`；`config-file_config-reference.md:2480-2484` |
| C13 | 源码：MCP 允许清单**只会关、不会开**——命中时只清 `disabled_reason`，不命中时置 `enabled = false` 并记来源 | `core/src/config/mod.rs:2122-2145`、`:2147-2181` |
| C14 | 普通配置层里 MCP server 按名字跨层合并：同名 server 高层覆盖低层（session 覆盖 user、托管覆盖 session），项目层新增的 server 照常进入 | `core/src/config/config_tests.rs:5424-5627`（`rebuild_with_session_layers_refreshes_requirements`） |
| C15 | `mcp_servers.<id>.enabled` 是配置层里的普通布尔（「Disable an MCP server without removing its configuration」） | `config-file_config-reference.md:606-609` |
| C16 | 技能的启停写在 `skills.config[]`，**按技能目录路径寻址**，不按名字 | `config-file_config-reference.md:310-322` |
| C17 | 源码里一次技能调用的去重键是 `"{scope}:{path}:{name}"`，scope 取 User / Repo / System / Admin | `core/src/skills.rs:138-149` |
| C18 | 自定义子代理与内置同名时，自定义的优先 | `agent-configuration_subagents.md:381` |

- 支持范围：Codex 本地客户端（CLI / IDE / 桌面）；文档自称 managed configuration 管不到 cloud（见上一轮调研）。
- 局限：C1–C4、C6、C9 只有文档证据；C4 推到「受信项目可以设审批与沙箱」是**文档交叉推断**，未在装载器源码核对。
  同名技能跨 User / Repo 的去重规则在 `codex-core-skills` 一类 crate 里，副本没有，**未知**。
- 后续核对：grep 本页 `5c5308fc9a`。

## E3 omne-next

- 消费对象：research.md「引用」「immutable」两条结论。
- 来源与精确修订：本机 `/data/qiwei/repos/omne-next`，HEAD `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（未钉 tarball，路径会失效）。
- 来源立场：本项目前身的自有设计与实现；它自己的文档标注了大量「缺口 / design-ahead」，**这里只引用已落在代码或已接受契约里的形状**。
- 取得方式：只读 grep 与阅读；排除 `.claude/worktrees/`。未运行代码。

实际观察（路径相对仓库根）：

| # | 观察 | 位置 |
|---|---|---|
| O1 | 工具集注册表：预设与用户配置按「Last-Write-Wins」合并，「Entities with the same identifier (name) are **replaced entirely**」；身份取 `name` → `class_name` → `function` → `ref` 末段 → 对象 id；**没有锁定项**，用户配置总在最上 | `omne_agent_toolkits/omne_agent_toolkits/registry/presets.py:127-187`；`registry.py:220-250` |
| O2 | 同一注册表里工具集的 `include_tools` / `exclude_tools` 是该条配置的一部分，整条被高层替换时一起换掉 | `registry.py:385-417`；`presets.py:176-177` |
| O3 | 组件引用契约 `ComponentRef = (kind, source, qualified_id, version_pin)`：**来源（official / custom）是寻址键的一部分**，可钉版本；custom 组件另钉内容哈希作完整性锚 | `omne_harness/libs/omne_harness_contracts/omne_harness_contracts/component_schema.py:31-32`、`:39-58`、`:95` |
| O4 | 组合展开后若出现重复的 skill id 或 slash command，**直接失败**（`CapabilityCollisionError`，INV-4-2 fail-fast），不做同名替代 | `omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/domain/services/composition.py:67-88` |
| O5 | 配额：「下层 override 不能放宽上层 ceiling」——一条专门写给配额的规则 | `omne_harness/requirements/quality/profile-scoped-capacity-hierarchical-quota-and-overload-safety.md:95-98` |
| O6 | Loop guard 的 hard-cap「只可收紧」，其上一层 platform floor「穿透关闭」——又一条专门写给 loop guard 的规则 | `omne_harness/design_docs/subsystems/agent_blueprint/ddd/value-objects.md:63` |
| O7 | 权限：出厂 `PermissionModel` 为 base 层，override 层在另一个上下文，合并裁决为「base⊕override deny-first」 | `omne_harness/design_docs/subsystems/agent_blueprint/uml/01-use-case.md:152` |

- 支持范围：omne-next 在上述 HEAD 的设计与部分实现；它的「immutable」一词在仓库里几乎都指**不可变发布版本**，不是锁定标记（grep `immutable` 所见）。
- 局限：没有找到 omne-next 里「工作区 / 项目目录」作为配置层的概念，**未找到不等于没有**。

## E4 Claude Code

- 消费对象：research.md 的「同名」「禁用析取」「immutable」「项目层」「条件析取」五条。
- 来源与精确修订：本机 `claude --version` = `2.1.280`；
  `/data/qiwei/.claude/settings.json`（SHA256 `ee835ab1…326cb`）、
  `/data/qiwei/.claude/plugins/installed_plugins.json`（SHA256 `54eb986d…f3aa`）、
  本机缓存的官方 changelog `/data/qiwei/.claude/cache/changelog.md`（7274 行，首节 `2.1.280`，SHA256 `8bda8133…cd2ec`）。
- 来源立场：厂商自述（changelog）＋本机实测的配置形状。
- 取得方式：只读 `cat` 与 grep。未改任何配置。
- 环境与前提：**本机没有 `/etc/claude-code/`（无 managed 层），本仓库 `.claude/` 下没有 `settings.json` / `settings.local.json`**，
  所以 managed 与项目层行为只有 changelog 与上一轮调研引用的官方文档证据。changelog 行号随缓存刷新会变，下面同时给版本节。

实际观察：

| # | 观察 | 位置 |
|---|---|---|
| K1 | 用户层字段实见：`permissions.allow`（6 条 Bash 规则）、`permissions.defaultMode`、`model`、`enabledPlugins`（`"<name>@<marketplace>": bool`，其中一项为 `false`）、`extraKnownMarketplaces`、`autoMode.soft_deny` 等；**无 `permissions.deny`、无 `disableAllHooks`** | `/data/qiwei/.claude/settings.json` |
| K2 | 插件清单按 `"<name>@<marketplace>"` 为键，值是**安装记录数组**，每条带 `scope`、`version`、`gitCommitSha`；`enabledPlugins` 里为 `false` 的那个插件在清单里仍在——停用不等于卸载 | `/data/qiwei/.claude/plugins/installed_plugins.json` |
| K3 | 本会话可见的技能清单里，插件技能以 `plugin:skill` 命名（如 `codex:rescue`），目录作用域技能带路径前缀（如 `.meta_harness:design-subagents`），且与同名的无前缀技能**并存**，由调用方按「哪个目录包含正在改的文件」选 | 本会话 Skill 工具的清单与说明（2.1.280 运行时注入；非文档，属现场观察） |
| K4 | 「user or project skill **shadows** the bundled skill」——用户/项目同名技能遮蔽随包技能 | changelog `:1753`（2.1.233 节） |
| K5 | 「Hardened skills synced from claude.ai: they **no longer shadow** local commands or MCP prompts」 | changelog `:1870`（2.1.228 节） |
| K6 | 从 claude.ai 同步来的插件显示为 `name@synced`，「**never override a same-named plugin you installed**」 | changelog `:1527`（2.1.239 节） |
| K7 | managed 可在 `enabledPlugins` 里**强制启用**插件 | changelog `:928`（2.1.261 节） |
| K8 | 「Fixed `disableAllHooks` setting to respect managed settings hierarchy — **non-managed settings can no longer disable managed hooks set by policy**」 | changelog `:5467`（2.1.49 节） |
| K9 | 「Changed `allowedMcpServers` to **govern only servers users add**: a literal `managed-mcp.json` server your allowlist used to filter out now loads on upgrade; use `deniedMcpServers` to keep it off」 | changelog `:1094`（2.1.259 节） |
| K10 | managed 的 `managed-mcp.json` 读不出来时仍保持独占控制：「user, project and plugin servers don't load」 | changelog `:511`（2.1.271 节） |
| K11 | managed 可以「lock only skills to plugins」（`strictPluginOnlyCustomization` 一类键） | changelog `:881`（2.1.265 节）、`:1135`（2.1.257 节） |
| K12 | 「`claude mcp list`/`get` no longer spawn `.mcp.json` servers that **a repo self-approved via a committed `.claude/settings.json`**」 | changelog `:2643`（2.1.196 节） |
| K13 | `skillOverrides`：`off` 对模型与 `/` 都隐藏、`user-invocable-only` 只对模型隐藏、`name-only` 折叠描述；managed 的 `skillOverrides` 以技能名（含别名）为键 | changelog `:3804`（2.1.129 节）、`:1004`（2.1.260 节） |

上一轮已记、本包直接引用的 Claude Code 文档证据（2026-09-20 抓取，`2.1.278`）：
设置五层与「Nothing you set overrides [managed]」；权限规则全层并集、deny-first、user deny 压 project allow 且反之亦然；
`!` 否定「reaches only rules from the same source」；`disableBypassPermissionsMode` / `disableAutoMode`「works from any scope」且「Applies the strictest value any source sets」；
少数键「下层更严值压过 managed」的反向例外表——见
[reports/2026-09-20-claude-code.md](../agent-harness-session-design/reports/2026-09-20-claude-code.md) §2.2–2.3。

- 支持范围：K1–K3 只说明本机这一份配置的形状；K4–K13 是厂商对行为变更的自述。
- 局限：没有实测 managed 与项目层；「项目层 `enabledPlugins: true` 能否重新开启用户停用的插件」只能由设置层序推断，**未核实**。
- 后续核对：Claude Code 升版本或 changelog 缓存刷新时，按引文而非行号重新定位。

## 这一轮不能据此声称什么

- 不能据此声称任何一家的做法是「对的」；一致只抬高另做一种选择的举证责任。
- 不能据此声称任何关于组织 / 租户 / 工作区三级的同行做法——四家都没有这三级，对应关系是类比。
- 未找到的东西（Codex 同名技能去重规则、omne-next 的项目层配置）只说明本轮没找到。
