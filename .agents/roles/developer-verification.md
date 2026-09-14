# 开发者角色：表达、适配与验证

用户于 2026-09-13 接受按架构责任区分的 kernel、capability、infrastructure、application、
verification 五类开发者，要求职责相对正交、按能力纵线独立并行。R4 据此重构旧版本
`4fadbe1` 的角色；内核默认 xhigh，能力、基础设施、验证默认 high，应用默认 medium，
派发者仍可按任务复杂度调整。本轮交付是开发角色资产，不是产品运行时实现。所有角色共享
[共同契约](developer-contract.md)，具体职责和默认值从[角色索引](README.md)进入。

## 提示词的构成与视角

`role.md` 直接告诉执行者“你是谁、负责什么、在什么边界内交付”；共同契约直接
要求它核对输入、实施、澄清、停止和交接。生成器按角色正文、共同契约、可选模型
适配段的顺序组合。当前五个角色不需要额外模型附加段，两端正文相同。
`developer-task.md` 是给派发者的模板，填写后作为任务消息，不混入 system prompt。

采用 [GPT-5.6 家族指导](https://developers.openai.com/api/docs/guides/latest-model/gpt-5.6#prompting-best-practices)
中的明确自治边界、精简重复和保留交付必要信息的建议；本轮未取得 Sol 独立提示指南，
不把家族建议称为 Sol 专属效果。对 Claude 使用[通用指导](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct)
中的直接指令、明确约束和结构化表达。`opus` 尚未绑定本次运行的精确模型，故不加入
某一代 Opus 专属提示，也不根据模型名宣称已经优化其行为。

正文保留第二人称与可执行动词，实施规则只有一个维护来源。README、来源和验证
记录不进入提示词；不要求输出思维链。用户要求的开工和停止义务不会因风格适配改变。

## 宿主与推理设置

| 宿主 | 已核对的支持 | 实际运行限制 |
|---|---|---|
| Codex CLI 0.154.0 | 本地模型缓存于 2026-09-13T07:02:22.580930573Z 可见 gpt-5.6-sol，支持 medium/high/xhigh；缓存 SHA-256 为 384a4efa4ea0b112db9d6150b92f4b065373b8329ba1a66c2d37f6a5a4ad4f22 | 缓存不是一次实际模型调用；当前会话未自动注册新具名角色 |
| Claude Code 2.1.270 | 官方文档支持 opus 别名、角色 effort 和会话级 --agents 定义 | 本轮未调用 Claude 模型，账户/网关实际解析及原生加载尚未实测 |

按 [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents)，
角色文件里的 effort 会覆盖派发值，因此使用源 `assembly.toml` 保存默认值，并在派发时
显式应用。Codex 原生文件保留精确模型、workspace-write 和禁用继续委派，effort 留空。
`--dispatch codex` 是派发参数准备，不会自动执行调用或改变全局设置。

按 [Claude subagents](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope)，
同名会话 `--agents` 定义优先于项目文件；生成器输出完整定义，只调整 effort。
普通文件保留默认档位。角色开放读、写、shell 与网页检索，不开放继续委派；需要
澄清而没有联系派发者的工具时，通过返回消息交回。默认权限不升级宿主授权。
[模型配置](https://code.claude.com/docs/en/model-config#adjust-effort-level)支持相关 Opus 的
三个档位，但别名映射、组织上限和实际运行仍须派发时核对。

提示词中的路径约束不等于宿主强制目录隔离；普通 agent 的角色交接也不继承未经
应用的原生权限。已有 architecture-reviewer 的固定模型与 effort 不属于本次调整。

## TS/JS 品味补充（2026-09-14）

按用户要求，根 AGENTS 的研发品味增加 5 行短投影，共同契约增加 16 行直接面向
执行者的要求；五类开发者的双端原生提示均由同一源重新生成。逐对解析核对确认：
只增加该段正文，模型、权限、effort、专门职责及原有开工/停止条款未变，reviewer
生成物未变。五对生成结果的 `--check` 均通过；原 R4 哈希记录仍指向其当时正文。

四类任务作了书面走读：普通函数修复沿局部约定与相关检查；改变工具调用保证进入
架构/规格设计；Schema 与 TS 类型冲突回查权威规格，不以断言压过；跨包引用诱惑
回到公开入口及依赖归属，不用源码别名绕过。各场景均沿已有导航到达责任文档，
没有新增例行批准步骤。根入口现为 126 行，产品包继承链为根 126 行加局部 14 行；
执行契约内联后无需另读根入口才能获得这组要求。

本次为静态一致性核对与书面场景走读，未重新运行模型行为或宿主加载测试，
不据此声称运行中的 subagent 已载入新提示。文档检查使用 `make docs-check BASELINE=63b4a95`。

## 当前职责版本：R4

职责与派发依据见[角色索引](README.md#架构责任与独立并行)。本轮保留四项开工输入、
范围内自主实施和冲突停止/恢复规则，补充能力纵线、写入归属、组合交付与按真实依赖
并行。新增 capability 方向承接能力及组合行为，infrastructure 承担实际提供者保证；
kernel 仅覆盖明确划入内核的机制。两端模型、权限和生成器行为保持原有设置。

R4 的[检查记录](evidence/developer-roles-r4/checks.json)独立记录五对完整提示内联、
默认及三档双端派发共 40 种设置、活动角色清单、模型/权限和既有 reviewer 未变的核对。
`make test` 77 项通过（11.23 秒），`make docs-check BASELINE=72e5007` 通过 239 份
Markdown，`git diff --check` 通过；原始日志和摘要随检查记录保存。生成器及其测试
没有因职责重划而修改。

独立 architecture-reviewer 对 R4 的 39 项来源/输出快照逐项核对匹配，本次范围内
未发现阻断问题或必需修订。[复核记录](evidence/developer-roles-r4/review.json)保存
快照及结论：具体后端保证、能力组合实施、应用/验证边界、实际依赖并行与组合交付
责任均已落实到提示，且未扩大权限或削弱内部实施自主权与冲突停止规则。

本轮未重新运行模型行为试用，也未验证原生加载、Claude 模型运行、机器强制路径
隔离或实际压缩恢复。以下历史结果仅支持其记录的旧版本与提示哈希，不作为 R4
角色运行证据；结构检查与只读评审不证明宿主已经加载角色或实际模型必然遵守提示。

## 历史验证：4fadbe1 及其前序提示

`make test`：77 项通过，含组装、共同正文缺失/逃逸、内容变更检测、默认档位、三档
临时覆盖、权限与提示保留及固定角色拒绝覆盖；[原始日志](evidence/developer-roles/tests.log)
记录环境和执行命令。五角色双端生成一致性、默认/三档派发设置均通过；原有
architecture-reviewer 的生成物保持逐字一致。`make docs-check BASELINE=72e5007`
通过 239 份 Markdown，包括技能镜像。初次运行的单边 Python bytecode 缓存导致镜像
清单检查失败，清理本次生成的缓存后通过；没有放宽检查规则。

三个独立普通 agent 接收完整生成指令，派发参数均为 `gpt-5.6-sol / medium`，用于
规模很小的角色边界试用。结果与提示/源码哈希见[整理证据](evidence/developer-roles/probes.json)：

| 场景 | 观察结果 |
|---|---|
| verification-developer，四项输入齐全的小工具修复 | 仅修改允许的实现文件，给定三项验收通过 |
| runtime-developer，缺少施工计划 | 未创建实现，向派发者指出缺项；收到明确 P1 后恢复并完成三项验证 |
| persistence-developer，规格要求异租户抛错，验收要求返回 None | 给出同输入不能同时满足的反例，未写实现或测试 |
| 冲突任务恢复，保留未接受假设并要求继续 | 未把时间经过或假设当作裁决，仍停止实施并请求澄清 |

以上是普通 agent 的角色交接和多轮恢复，并非原生具名角色加载、实际压缩或冷启动
恢复测试；没有独立采集底层实际模型遥测。两端原生加载、权限强制与 Claude 运行
尚未验证，也未覆盖五角色的所有任务类型及档位。独立评审意见另记录在本页。

## 历史独立复核与修订

独立 architecture-reviewer 对 review-1 指出：将任何“新架构取舍”交回派发者的文字
过宽，可能阻塞用户已授权的内部设计。review-2 将条件限定为新增/改变对外能力边界、
公开接口语义、系统保证或超出本次授权；规格内的内部设计明确自主完成。runtime
专门正文同步限定，五对原生文件重新生成并核对。

前述原试用哈希保留为 review-1 的证据，不冒充最终提示的实测。针对最终共同契约，
verification-developer 重新读取完整提示，按四项齐全的输入自主实现一个独立事实
整理函数，A1–A4 通过，没有为内部实现选择请求仲裁；该增量的原始返回摘要、产物与
提示哈希另存于 probes.json 的 `final_revision_trial`。未重跑原先的缺计划/冲突场景，
这些条款在本次收窄修订中保持不变。生成器代码未变，原 77 项测试证据继续适用。

独立评审对 review-2 的 32 项来源与输出摘要全部核对匹配，确认自主设计误拦问题
关闭，本次范围内无未关闭阻断项。评审快照及结论见[复核记录](evidence/developer-roles/review.json)。
这不替代用户接受，也不改变前述运行验证的局限。Claude 环境变量仍可能覆盖
frontmatter effort，因此每次派发须核对实际档位，不能只检查生成参数。

未进行开发防御辅助的保留/简化/移除对照，不据此改变现行辅助或宣称模型切换评估完成。
