# 项目 subagents

角色源包在本目录维护，原生文件分别生成到 `.codex/agents/` 和 `.claude/agents/`。
共享正文拥有职责与边界，宿主配置和模型适配单独维护；不把生成文件当作独立来源。

| 角色 | 使用时机与交付 | 定义与配置 |
|---|---|---|
| architecture-reviewer | 完成一次架构设计、已有可识别的待审稿后，独立返回有依据的问题和未决事项；只读，不批准或修复 | [共享正文](architecture-reviewer/role.md)、[Codex](../../.codex/agents/architecture-reviewer.toml)、[Claude Code](../../.claude/agents/architecture-reviewer.md) |
| runtime-developer | 实现内核运行时、Agent 原语、Loop、动态装配与运行控制；默认 xhigh | [专门职责](runtime-developer/role.md)、[Codex](../../.codex/agents/runtime-developer.toml)、[Claude Code](../../.claude/agents/runtime-developer.md) |
| persistence-developer | 实现状态、日志、持久化和恢复；默认 high | [专门职责](persistence-developer/role.md)、[Codex](../../.codex/agents/persistence-developer.toml)、[Claude Code](../../.claude/agents/persistence-developer.md) |
| integration-developer | 接入模型、多模态、工具与执行环境提供者；默认 high | [专门职责](integration-developer/role.md)、[Codex](../../.codex/agents/integration-developer.toml)、[Claude Code](../../.claude/agents/integration-developer.md) |
| application-developer | 实现应用装配和 API/CLI/Web 用户流程；默认 medium | [专门职责](application-developer/role.md)、[Codex](../../.codex/agents/application-developer.toml)、[Claude Code](../../.claude/agents/application-developer.md) |
| verification-developer | 开发跨模块验证、故障注入、形式工具适配和构建检查设施；默认 high | [专门职责](verification-developer/role.md)、[Codex](../../.codex/agents/verification-developer.toml)、[Claude Code](../../.claude/agents/verification-developer.md) |

## 开发者的提示词与派发

五个开发者共享[行动契约](developer-contract.md)。生成器将各角色 `role.md` 与共同契约
直接组合为完整角色提示词；`assembly.toml` 拥有共用来源及默认 effort。共同契约和角色
正文都面向执行者，不混入给维护者的说明，也不依靠执行者二次读取来获得开工与停止边界。
[派发模板](developer-task.md)面向派发者，填写后成为本次任务消息，不进入固定提示词。

实施前必须齐备完整目标边界、验收标准清单、实施规格和施工计划。开发者可在给定
约束内自主选择方案；发现验收不合理、不可达或必须破坏规格时，停止实施并上报。
派发者负责归并澄清、协调共享文件和接口、安排集成及接受，不让 worker 自行修改判据。
角色划分表示专长，不固定包划分或任务数量；租户隔离和自身变更的测试是共同职责。

Codex 使用 `gpt-5.6-sol`，Claude Code 使用 `opus`。各角色 description 明示默认档位，
派发者可按工作规模和复杂度在 medium/high/xhigh 中调整。按角色源配置生成本次设置：

```sh
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/roles/runtime-developer --dispatch codex --effort high
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/roles/runtime-developer --dispatch claude --effort high
```

省略 `--effort` 即选择该角色默认值。命令仅输出 JSON，不发起调用。

- Codex：原生文件省略会覆盖派发值的 effort；派发者将 JSON 中的角色、模型及
  reasoning_effort 传给支持这些参数的派发工具，并另行附上完整任务消息。
  **直接调用角色却不传 effort，会沿宿主规则继承，不保证使用本项目的角色默认值。**
- Claude Code：原生文件带默认 effort；临时调整用生成的完整 JSON 作为该次启动的
  `--agents` 参数，同名会话定义覆盖项目文件。并行任务使用各自会话定义，不能反复
  改同一份项目文件。此 JSON 包含正文、模型和工具设置，不可只用一个 effort 字段替换它。
- 两端都核对实际模型、档位与组织限制；参数不可应用时返回派发能力缺口，不静默
  换模型或把提示词里的档位文字当成已生效。Claude 的 `opus` 按宿主/提供方解析。

模型支持、表达依据及本次实际验证范围见[开发者验证记录](developer-verification.md)。

## 架构评审派发

派发时提供仓库/检出位置、待审文件或设计正文、可识别的版本/快照、设计目标和评审范围。
附上相关需求的确认范围与采用快照；比较修订时再提供比较基线。接受状态可以仍是候选，实施计划不是这个评审角色的前置要求。
例如：“使用 architecture-reviewer，评审当前检出中指定提案的本轮设计；目标与约束见所附材料，
范围限于变量提供者撤除和在途使用，仅返回意见。”仅修改链接或文字不触发一次架构评审。

## 生成与宿主加载

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
