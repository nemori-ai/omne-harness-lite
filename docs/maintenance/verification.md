# 验证、工具与证据

本规范定义检查的边界，落实 [D-001](../decisions/D-001-documentation-system.md)。命令由根 `Makefile` 提供：`make docs-check`、`make spec-check` 和 `make spec-tools` 和 `make test`。具体实现集中在 `spec/tools/`；Python 工具使用 Python 3.12，并由 `uv` 隔离依赖。工具的实际参数与退出语义以 `spec/tools/check_docs.py`、`spec/tools/check_specs.py --help` 为准。

| 层次 | 覆盖 | 不能声称 |
|---|---|---|
| `docs-check` | Markdown 本地链接/锚点、文件身份、决定来源、取代字段、冻结基线 | 设计正确或因果理由充分 |
| `spec-check` | catalog 结构、正式版本路径及精确引用、Schema 结构；发现并实际执行声明的 TLA+/Alloy 任务 | 未建模部分已经证明 |
| 实现符合性 | 绑定源码版本的场景、集成测试或运行证据 | 所有实现、配置或部署天然等价 |

`make docs-check BASELINE=<git-ref>`（或 `check_docs.py --baseline <git-ref>`）必须用于审阅已发布规范或冻结表同时变更的提交。`check_specs.py` 要将结构检查和 TLA+/Alloy 的实际执行分开报告：没有模型任务是明确覆盖缺口，声明了任务却缺少工具或执行失败是失败或未执行，绝不能假通过。提案和 archive 可单独检查，其结果不改变接受状态。

关键规则在其语义契约中有可引用 ID，并映射到适用的模型性质、Schema 约束、验收场景和证据或明确缺口。TLA+表达行为及状态演化，Alloy 在有限范围寻找结构反例，JSON Schema 约束数据形状；它们与文字规范互补，冲突时修正规格而不以单项检查覆盖冲突。场景应包含初始条件、动作、可观察结果和规则。

可复用验证证据至少记录：契约与模型版本、源码 commit、工具与版本、命令或配置、输入边界/假设和结果。通过、失败、不确定和未覆盖均须如实保留。有限测试或模型检查不能表述为无条件证明。

原来按工具分类的 `spec/tla/`、`spec/alloy/`、`spec/schemas/` 和 `spec/scenarios/` 不再是有效规格入口；相应工件随其数据、能力或组合契约保存。验收场景与跨工件追踪要求由本规范和契约内的 `verification.md` 承接；已迁移的 agent-core 提案追踪记录见 `docs/proposals/agent-core/v1/traceability.md`，它的候选身份不改变本规范的验证边界。

## 环境与实际执行

首次使用安装 [uv](https://docs.astral.sh/uv/getting-started/installation/)，运行
`uv sync --locked`；它依据仓库锁文件准备 Python 3.12+ 与 JSON Schema、Markdown、
YAML 验证依赖。`make test` 的临时目录为 `tmp/test-runs/`，只用于本仓库测试，
重跑可清理该目录，不触碰同机其他项目的测试证据。

`make spec-tools` 单独检查 Java 11+ 与 `TLA2TOOLS_JAR`、`ALLOY_ANALYZER_JAR`
所指向的实际 JAR，缺失任一项返回非零。JAR 从
[TLA+ 官方发行页](https://github.com/tlaplus/tlaplus/releases)和
[Alloy 官方发行页](https://github.com/AlloyTools/org.alloytools.alloy/releases)
获取，选择与所用版本兼容的 Java；报告记录工具版本和文件 SHA-256，不能仅凭环境变量存在就称已验证。
当前环境是否安装与仓库是否定义模型是两个问题。

真实模型的命令登记在 [formal-tasks.json](../../spec/formal-tasks.json)。其
[格式](../../spec/tools/formats/formal-tasks.schema.json)要求唯一任务 ID、`tla|alloy`、
输入 `artifacts` 和命令参数数组 `command`，可声明 `timeout_seconds`。
输入路径相对仓库根；参数支持环境变量展开，未设置的变量导致失败，不经过 shell。
脚本只在结构与依赖检查通过后执行命令并报告输出、退出码与超时。
工具自身若用退出码 0 表示“找到反例”或其他非成功情况，任务必须通过专属验证适配器
将期望性质的失败映射为非零，不能只运行 GUI 或随意命令充当模型检查。
适配器正确性由对应模型的反例验证和审阅负责。

正式版本新增 `.tla` 或 `.als` 文件却没有任务覆盖时检查失败。没有任何任务时明确
报告 `UNCOVERED`，不能宣称 TLA+/Alloy 已跑过。形式证据还须给出模型范围、期望结果、
工具版本和完整输出；任务退出成功只是执行证据的一部分。

本地 Markdown 使用成熟解析器处理标题、围栏、引用式链接和中文锚点；历史原件只验
哈希，外层索引仍检查链接。JSON Schema 使用离线注册表解析 `$id`/`$ref`，不联网拉取
未知定义。校验库行为参考 [Markdown 解析文档](https://markdown-it-py.readthedocs.io/en/latest/using.html)
与 [JSON Schema 引用文档](https://python-jsonschema.readthedocs.io/en/stable/referencing/)。
