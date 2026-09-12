# 项目 subagents

角色源包在本目录维护，原生文件分别生成到 `.codex/agents/` 和 `.claude/agents/`。
共享正文拥有职责与边界，宿主配置和模型适配单独维护；不把生成文件当作独立来源。

| 角色 | 使用时机与交付 | 定义与配置 |
|---|---|---|
| architecture-reviewer | 完成一次架构设计、已有可识别的待审稿后，独立返回有依据的问题和未决事项；只读，不批准或修复 | [共享正文](architecture-reviewer/role.md)、[Codex](../../.codex/agents/architecture-reviewer.toml)、[Claude Code](../../.claude/agents/architecture-reviewer.md) |

## 派发与维护

派发时提供仓库/检出位置、待审文件或设计正文、可识别的版本/快照、设计目标和评审范围。
附上相关需求的确认范围与采用快照；比较修订时再提供比较基线。接受状态可以仍是候选，实施计划不是这个评审角色的前置要求。
例如：“使用 architecture-reviewer，评审当前检出中指定提案的本轮设计；目标与约束见所附材料，
范围限于变量提供者撤除和在途使用，仅返回意见。”仅修改链接或文字不触发一次架构评审。

选择宿主原生的同名角色。若当前调用面不支持具名角色，可以在授权范围内交接完整
生成指令和任务，但须说明这是普通 agent 试用，没有继承未经应用的原生权限配置。
文件写入不保证正在运行的会话已发现角色；模型实际选择和 effort 还需在调用时核对。

修改源包后，使用 [design-subagents 生成器](../skills/design-subagents/references/packaging.md)
在新暂存位置生成、比较，再同步原生文件。当前结果可只读核对：

```sh
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/roles/architecture-reviewer --output . --check
```

模型、权限选择依据和本次验证边界见[适配记录](architecture-reviewer/verification.md)。
