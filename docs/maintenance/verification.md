# 验证、工具与证据

本规范定义检查的边界，落实 [D-001](../decisions/D-001-documentation-system.md)。命令由根 `Makefile` 提供：`make docs-check`、`make spec-check` 和 `make spec-tools`。具体实现集中在 `spec/tools/`；Python 工具使用 Python 3.12，并由 `uv` 隔离依赖。工具的实际参数与退出语义以 `spec/tools/check_docs.py`、`spec/tools/check_specs.py --help` 为准。

| 层次 | 覆盖 | 不能声称 |
|---|---|---|
| `docs-check` | Markdown 本地链接/锚点、文件身份、决定来源、取代字段、冻结基线 | 设计正确或因果理由充分 |
| `spec-check` | catalog 结构、正式版本路径及精确引用、Schema 结构；发现并实际执行声明的 TLA+/Alloy 任务 | 未建模部分已经证明 |
| 实现符合性 | 绑定源码版本的场景、集成测试或运行证据 | 所有实现、配置或部署天然等价 |

`check_docs.py --baseline <git-ref>` 必须用于审阅已发布规范或冻结表同时变更的提交。`check_specs.py` 要将结构检查和 TLA+/Alloy 的实际执行分开报告：没有模型任务是明确覆盖缺口，声明了任务却缺少工具或执行失败是失败或未执行，绝不能假通过。提案和 archive 可单独检查，其结果不改变接受状态。

关键规则在其语义契约中有可引用 ID，并映射到适用的模型性质、Schema 约束、验收场景和证据或明确缺口。TLA+表达行为及状态演化，Alloy 在有限范围寻找结构反例，JSON Schema 约束数据形状；它们与文字规范互补，冲突时修正规格而不以单项检查覆盖冲突。场景应包含初始条件、动作、可观察结果和规则。

可复用验证证据至少记录：契约与模型版本、源码 commit、工具与版本、命令或配置、输入边界/假设和结果。通过、失败、不确定和未覆盖均须如实保留。有限测试或模型检查不能表述为无条件证明。

原来按工具分类的 `spec/tla/`、`spec/alloy/`、`spec/schemas/` 和 `spec/scenarios/` 不再是有效规格入口；相应工件随其数据、能力或组合契约保存。验收场景与跨工件追踪要求由本规范和契约内的 `verification.md` 承接；已迁移的 agent-core 提案追踪记录见 `docs/proposals/agent-core/v1/traceability.md`，它的候选身份不改变本规范的验证边界。
