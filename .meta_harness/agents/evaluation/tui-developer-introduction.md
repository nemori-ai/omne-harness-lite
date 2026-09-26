# tui-developer 源包与静态验证

日期：2026-09-24。任务来源：本次治理 CLI/TUI 交付与补齐 TUI 开发角色；
源在 [tui-developer](../roles/tui-developer/role.md)，方法使用
[design-subagents](../skills/design-subagents/canonical/SKILL.md)。

角色消费已接受的应用契约与施工计划，实现终端交互及自身回归；
不取得产品规则、后端状态机、独立验收判据或最终接受权。
终端资源还原、身份呈现、输入秘密及输出通道是专门职责；
一般实施输入、停止与交接规则复用 developer-contract，研发品味也从共同源内联。

## 宿主与模型边界

- 本机 `codex --version`：0.156.1；`claude --version`：2.1.281。
- 沿现有 application-developer / tui-qa 的目标：Codex `gpt-6-sol`、Claude `claude-opus-5-5`，默认 high，可由派发设置调整。
- 宿主支持依据沿用 [2026-09-23 支持记录](../skills/design-subagents/canonical/references/model-support.json)。这是有日期的记录，不是本次账户实时枚举。
- 已读取两端规范及 [OpenAI](../skills/design-subagents/canonical/references/openai-models.md)、[Anthropic](../skills/design-subagents/canonical/references/anthropic-models.md) 适配记录；没有新增模型专属适配段，没有更换主力模型，也没有以提示词声称路径强制隔离。

## 实际检查

| 检查 | 结果与范围 |
|---|---|
| `compile_agents.py --source .meta_harness/agents --output .meta_harness` | 生成器处理 170 个文件；新增两端角色产物，由根软链接暴露 |
| `make agents-check` | 170 个产物一致，三处相对软链接正确 |
| `uv run --locked pytest -q .meta_harness/tooling/tests/test_role_sources.py .meta_harness/agents/skills/design-subagents/canonical/scripts` | 36 passed；共享品味准入和成对 renderer 的静态行为 |
| `make docs-check` | 939 个 Markdown 的本地链接与 skill 镜像检查通过 |

以上不证明当前会话已加载具名角色，也不是精确目标模型的行为评估。
独立角色试用、真实终端产品实现及独立 TUI 验收尚未执行。
没有提交、推送、发布或部署动作。
