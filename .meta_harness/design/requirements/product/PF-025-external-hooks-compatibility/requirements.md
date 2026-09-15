---
kind: product-feature
id: PF-025
primary_dimension: agent
secondary_dimensions: [user]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/agent/PF-025-external-hooks-compatibility.md
source_sha256: d6e6455ff97f3b11d279766e8e5e8b294a73c8a82a4cf3a7601a4d3764ba3270
source_anchor: "heading:# PF-025：兼容外部命令式 hooks 体系"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-025：兼容外部命令式 hooks 体系

[智能体维度](../by-agent.md) · 六系统循环、事件与 hooks 研究（迁移坐标：`.meta_harness/design/research/agent-loop-events-and-hooks/README.md`）

2026-09-14，用户在 run-driver 的 Loop hook 讨论中明确："deepseek harness 原版的
hook 设计，面向 codex 和 claude code 的 hooks 体系留了兼容性，我们这个也要的哈"；
随后确认本页 C1/C2 的措辞。主维度为智能体：它约束 Agent Loop 的扩展点如何被外部
命令式 hook 消费。副维度为用户：hook 由用户或组织以上游习惯编写与装配。

## 已确认要求

- **PF-025.C1：兼容外部命令式 hooks 体系。** 系统提供与 Claude Code、Codex hooks
  体系兼容的适配层：用户以上游的事件名、配置形状与 stdin/stdout JSON 协议编写的
  hook，能在本系统对应的循环站点运行并取得上游语义中可兑现的效果。适配层是
  进程内扩展点的一个消费者，不获得扩展点之外的权力：它只能收紧准入或选择进入
  模型的投影，不能改写已耐久的输入、参数与结果。每个上游事件与决定字段的兑现、
  降级或不支持须在兼容说明中逐项可查，不静默忽略。
- **PF-025.C2：hook 的来源、主体与失败可辨认。** hook 配置作为租户资产的声明性
  成员发现与装配，执行主体是装配者；每次运行的事件、handler、状态与阻断理由
  可观察；失败不静默，阻断理由对用户与模型可见；续跑类 hook 有明确刹车。

"可兑现的效果"以本系统扩展点的权力为上限：上游允许而本系统扩展点不允许的效果
（例如改写工具参数、阻止 Run 结算）按降级处理并可查，不因兼容而扩大扩展点权力。

## 来源补充与设计输入

DeepSeek Harness（固定提交 `c291e79`）以 `dsh-hooks-claude-code` 与 `dsh-hooks-codex`
两个插件把上游六种事件映射到自己的进程内事件：退出码 2 阻断并把 stderr 作为模型
可见原因，多 hook 决定取最严格，同事件串行，卸载时中止未完成进程并排空；细节见
DSH 笔记（迁移坐标：`.meta_harness/design/research/agent-loop-events-and-hooks/notes/dsh.md`）。Claude Code 与
Codex 的事件全集、输出协议、配置来源与信任模型分别见
Claude Code 笔记（迁移坐标：`.meta_harness/design/research/agent-loop-events-and-hooks/notes/claude-code.md`）与
Codex 笔记（迁移坐标：`.meta_harness/design/research/agent-loop-events-and-hooks/notes/codex.md`）。这些是事实
依据；上游的事件名、退出码约定与配置文件位置不因引用自动成为本项目契约，具体
兑现范围由设计与兼容说明固定。

## 产品场景

| 场景 | 应有表现 |
|---|---|
| 用户把在 Claude Code 里用的 `PreToolUse` 脚本装进本系统 | 脚本在工具准入前运行；deny/ask 生效，`updatedInput` 被记录为不支持并可查，工具参数不变 |
| 用户的 `Stop` hook 要求 Agent 继续工作 | Agent 按 hook 给出的理由继续下一轮工作；连续续跑达到上限后停止并可见原因，Run 结算事实不被 hook 阻止 |
| hook 脚本崩溃或超时 | 运行结果记录为失败且可查；按事件的失败语义决定是否阻断，不出现无法解释的默认行为 |
| 组织管理员限制只允许受管 hook | 装配时按资产来源与租户策略拒绝其余来源的 hook，拒绝可辨认 |

## 与其它要求的关系

hook 配置作为 Plugin/Skill 的声明性成员沿 [PF-010](../PF-010-organization-personal-assets-and-permissions/requirements.md)
管理，其版本、启停与在途绑定沿 [PF-016](../PF-016-agent-developed-cordis-plugins-and-live-deployment/requirements.md)。
工具站点的 hook 只作用于 [PF-003](../PF-003-tool-execution-observation-and-control/requirements.md)
定义的单次调用；Run 级控制的传播沿 [PF-013](../PF-013-session-run-lifecycle-and-pending-input-control/requirements.md)，
hook 不能暗中扩大成 Session 级停止。hook 命令在
live-agent v1（迁移坐标：`.meta_harness/design/spec/capabilities/live-agent/v1/contract.md`） 的执行信任前提下
运行；需要隔离时沿 [PF-012](../PF-012-computer-browser-shell-sandbox-and-native-use/requirements.md)
的沙盒能力，兼容层本身不声称隔离。每次 hook 运行的记录沿 SYS-OBSERVABILITY。

待设计：上游事件到本系统循环站点的逐项映射与降级表、handler 类型的首版集合、
输入字段中本系统无对应物（如转录文件路径）的处理、续跑刹车的具体形式、程序化
作答的主体资格。当前循环扩展点的权力边界由
run-driver v2（迁移坐标：`spec/capabilities/run-driver/v2/contract.md`） 与
tools v1（迁移坐标：`spec/capabilities/tools/v1/contract.md`） 定义；本页只确认要求，
未接受具体架构或发布规格。
