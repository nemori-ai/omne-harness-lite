# Developer 输入契约强化：2026-09-26

状态：本次 W0 技术检查与独立前向试用完成；不表示所有模型/宿主的无条件行为保证。

## 对象与依据

用户要求五个 developer roles 的 system prompt 明确技术规格与 realization 输入，持续遵循已完成设计，同时保留未定技术栈/第三方库的实施调研自主权。共享源修订为 `0bf83cd7`；检查对象是 [developer-contract](../../roles/developer-contract.md)、[派发说明](../../roles/developer-task.md)，经 `assembly.toml` 内联到五个角色。

实际调整未更换模型、权限或角色职责。另将既有 canonical 研发品味中的策略配置和公开函数面要求重新投影，修正本地未跟随源更新的生成配置。生成物按工作区规则不入 Git，独立检出须从 canonical 重新生成。

## 实际证据

- 静态生成与项目链接：`make agents-check`，168 个生成文件/三条链接通过；这只证一致性，不证宿主已加载。
- 导航：`make docs-check`，1225 份 Markdown 通过。
- 受影响工具测试：`uv run --locked pytest .meta_harness/tooling/tests/test_role_sources.py .meta_harness/tooling/tests/test_compile_agents.py -q`，34 项通过；新增结构测试检查五个角色均恰一次内联共享实施契约，且其位置在研发品味之后。
- 独立行为试用：`/root/w0_role_trial`，capability-developer，实际读取生成完整提示后执行五个只读场景；[观察与范围](trial.md)。主调度按实际动作审核，各场景符合本轮输入/遵循/恢复边界。

试用读取的生成提示 SHA256：`b655973c58bad4761627904f3d74bc53c389fb9c2f378c3593ffd6017d3fd7fb`。开始时 main 为 `bb3d8bc4`，结束时为 `0bf83cd7`。行为结果来自独立角色的工具读取及返回，不是对五个角色、两宿主和所有模型的全矩阵评估，也不证明已启动的 agent 会热重载系统提示。

静态原始日志暂存执行 HUB 的 `tmp/core-delivery/w0-role-static.log`、`w0-role-tests.log`；它们是本次可恢复的执行日志，不是另一份提示权威。本文记录已发生的有界观察。
