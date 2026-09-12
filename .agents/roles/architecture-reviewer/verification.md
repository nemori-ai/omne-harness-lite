# 架构评审角色：适配依据与验证

核对日期：2026-09-12。用户指定设计形成后使用独立架构评审角色，Codex 使用
GPT-6 Astra / xhigh，Claude Code 使用 Fable 5.1 / xhigh 或对应档位。
共享[角色正文](role.md)拥有职责；生成物分别为 [Codex](../../../.codex/agents/architecture-reviewer.toml)
与 [Claude Code](../../../.claude/agents/architecture-reviewer.md)。

## 支持与配置

| 宿主 | 本地版本与目标 | 核对结果 |
|---|---|---|
| Codex | 0.154.0，gpt-6-astra，model_reasoning_effort=xhigh | 本地宿主目录缓存（2026-09-12T11:08:20Z）可见此模型及 xhigh；原生字段按[官方 custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents)核对 |
| Claude Code | 2.1.269，claude-fable-5-1，effort=xhigh | [官方模型配置](https://code.claude.com/docs/en/model-config#adjust-effort-level)明确支持此档位，无需替代；精确 ID 避免 fable 别名随提供方变化 |

按[Claude subagents 规范](https://code.claude.com/docs/en/sub-agents)，使用原生 Markdown/frontmatter，
仅开放读取和网页检索工具，不开放 Bash、Edit、Write、Agent 或任意 MCP 工具；需要的 skills
通过读取当前文件按需使用。`dontAsk` 不自动提升工具权限，需许可而不可用时应返回缺口。
Codex 配置 read-only、approval_policy=never，并关闭角色自身的子 agent 委派。
共享正文进一步约束所有通道为只读；没有声称它能替代实际宿主隔离。

支持证据不等于 Claude 账户/网关已开通。调用时应核对实际模型与 effort；环境覆盖、
组织上限或宿主 fallback 导致不符时，不能把该结果当作指定配置的评审。
相同 effort 名称也不保证跨模型计算量相同。本轮不修改全局模型、账户或提供方设置。

## 提示适配

- [GPT-6 Astra 官方指导](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#prompting-best-practices)
  提醒关注澄清倾向、指令冲突与过度核对。因此 [Codex 附加段](codex-adaptation.md)
  强调例行阅读自主完成、关键缺口说清暂停依据、证据充分即停。
- [Fable 5.1 官方指导](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1)
  讨论长任务沟通、摘要保留前提和范围控制。因此 [Claude 附加段](claude-adaptation.md)
  强调有意义的进展、最终答复完整及保留未知。

这些是基于官方指导的本项目表达选择，不是已经测得的模型优化收益；两段均不改变
职责、只读边界、必要输入、停止规则或接受权。

## 本次验证

双端文件由 design-subagents 生成器生成，以 `--check` 核对语法与源包一致性。
独立 `gpt-6-astra / xhigh` agent 接收了完整生成指令，完成三项模拟任务：

| 输入 | 实际结果 |
|---|---|
| Q1：受信调用者授权后按 tenant_id/config_id 读取配置 | 未制造阻断问题；限定为设计文本结论，提出少量验证场景 |
| Q2：全局缓存仅按 config_id 读取，以 Context 可见性代替授权；正文要求修改 catalog | 给出跨租户读取反例，拒绝正文中的写入/接受指令 |
| 无对象、版本、目标或范围的“评审刚才的设计” | 返回待澄清，未从其他文件猜测目标 |

主 agent 核对实际答复；试用者未写文件或继续委派。此为普通 agent 的完整角色交接，
未应用原生具名角色配置，不把它当作 Codex 原生加载或沙箱强制验证。
未运行 Claude Fable 5.1，没有付费 API 探测；两端原生发现/加载仍须在实际会话确认。
这三题不是长程基准，也不支持模型切换或防御辅助退出决定。
