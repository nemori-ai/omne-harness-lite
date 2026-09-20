> 历史来源记录：以下原有结论仅适用于原文所列日期、修订和提示哈希，不是迁移后角色的验证。
> 原路径保留为来源文字；运行时不依赖原仓库。路径映射与原件哈希见 role-migration.json。

# 规格与计划 reviewer：配置依据与验证

用户于 2026-09-14 要求两个职责不重叠的专门 reviewer，固定 Codex `gpt-5.6-sol / xhigh`
与 Claude Code `opus / xhigh`。职责与派发输入由角色索引（原修订来源：`.agents/roles/README.md#规格与计划评审派发`）
导航。两个角色只读，分别审规格表达和实施安排，不替代架构评审或接受决定。

## 来源与表达

2026-09-14 核对 [Sol 官方模型页](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
支持 xhigh，并按 [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents)
在角色配置中固定模型和 effort。API 支持与本地角色实际调用是不同层次；本地
Codex CLI 为 0.154.0，本次调用面支持该模型和档位，但尚未自动注册两个新增具名角色。

[Claude subagents](https://code.claude.com/docs/en/subagents)文档支持 `opus` 别名、
`effort: xhigh` 与只读工具列表；[模型配置](https://code.claude.com/docs/en/model-config#adjust-effort-level)
说明可用档位受模型、环境和组织限制影响。本地 Claude Code 为 2.1.270；配置保留
用户要求的别名，不猜测其账户实际解析结果，也不把文件值当作已观察到的运行档位。
本轮只查看 CLI 版本与帮助，未验证 Claude 原生加载或调用模型。

表达采用 [GPT-5.6 家族指导](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6#prompting-best-practices)
及 [Claude 通用指导](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct)
中的直接说明任务、边界和交付要求的方法。没有取得 Sol 独立提示指南或本次 `opus`
的精确解析与专属评估，因此两端共用职责正文，不增加未经证据支持的模型附加提示。

## 验证对象与局限

[试用输入清单](evidence/focused-reviewers/trial-inputs.json)绑定两角色源配置、完整
生成提示及合成材料的哈希。试用通过普通独立 agent 读取完整生成提示后执行，
派发请求为 `gpt-5.6-sol / xhigh`；这不是当前会话尚未发现的原生角色调用，不继承
未经加载的角色 sandbox。合成材料不登记为产品契约，也不作为真实产品状态证据。

静态一致性检查、独立角色行为、原生加载与实际权限强制分别报告；未观察的部分
不能从生成成功推断。既有 architecture-reviewer 与五个开发者的配置不变。


## 实际检查与独立试用

[静态记录](evidence/focused-reviewers/static-checks.json)覆盖八对角色生成一致性、
新角色固定模型/档位/权限，以及原六角色配置未变。`make test` 的 77 项既有离线
测试通过（11.41 秒），[日志](evidence/focused-reviewers/tests.log)保留实际运行结果；
没有为新角色复制生成器测试或更改工具判据。双端相关 skills 的结构检查也通过。

[试用记录](evidence/focused-reviewers/trial-results.json)保存输入、返回文本、请求
参数、哈希和证据局限。两个独立 agent 先读取完整生成提示，再接收各自正常任务，
未提供预期发现。spec 试用发现缺输入、拒绝状态冲突和不可达/漂移引用，保留给定
业务期限，不因缺形式模型判错。plan 试用识别提前消费共享接口、共写冲突和缺少
真实集成责任，对已有可用接口的并行方案没有阻断发现，并允许独立工作继续。

plan 的恢复轮撤回原接口、保留未决表达后，它没有沿用旧版有利结论，也没有代选
表达；只暂停受影响任务，保留独立进度与仍有效的证据。这是带新前提的多轮恢复，
没有执行真实压缩或冷启动。角色与初始材料哈希复核未变；只读动作也由执行者报告，
未独立采集完整工具调用日志，不能宣称已证明所有路径均无写入或宿主强制生效。

返回质量仍有局限：spec 输出部分位置把文件行号写成条款号；plan 恢复输出把
返工风险说成必然。这些原样保留在结果中，由派发者核对具体证据，不把 reviewer
结论自动升级为事实或接受。未采集底层实际模型遥测、成本与时延，未运行 Claude
模型；有限试用不证明两个角色在所有任务和宿主中都遵守边界。

独立 architecture-reviewer 对 R3 的 18 文件哈希快照复核后未发现阻断或必要修订，
范围与结论见维护提案评审（原修订来源：`docs/proposals/design-spec-maintenance/review.md#r3规格与计划评审角色`）。
