# 验证、工具与证据

本规范定义检查的边界，落实 [D-001](../decisions/D-001-documentation-system.md)。命令由根 `Makefile` 提供：`make agents-check`、`make docs-check`、`make spec-check`、`make spec-tools` 和 `make test`。文档与规格检查实现在独立的 [spec-tools 开发包](../../tools/spec-tools/README.md)，agent 编译与链接检查归 [Meta Harness 工具](../../.meta_harness/tooling/README.md)；Python 工具使用 Python 3.12+，由根 [uv workspace](workspace.md) 管理。实际参数与退出语义以各 CLI 的 `--help` 为准。

组合入口 `make check` 调用 [scripts/check.sh](../../scripts/check.sh)，依次执行 agent 产物与根链接检查、文档检查、
规格检查、Python 工具测试和产品包检查，任一步失败即停止。该脚本也支持从其他工作目录通过绝对路径调用，
供本地与 CI 共用；`make check BASELINE=<git-ref>` 将基线传给文档检查。
当前已配置独立的 [TS/JS 格式检查 workflow](../../.github/workflows/format.yml)，
尚无完整检查或产品发布流水线；配置存在不代表托管任务已经运行。
自动化职责见 [scripts/](../../scripts/README.md)。

| 层次 | 覆盖 | 不能声称 |
|---|---|---|
| `agents-check` | 从 canonical/角色源重新计算产物，核对预期文件内容与权限，以及三个根相对软链接 | 宿主已发现配置、原生权限已生效或模型行为符合预期；不清理输出中的其他文件 |
| `docs-check` | Markdown 本地链接/锚点、需求 ID 唯一性与主副维度引用、决定来源、取代字段、冻结基线 | 设计正确或因果理由充分 |
| `spec-check` | catalog 结构、正式版本路径及精确引用、Schema 结构；发现并实际执行声明的 TLA+/Alloy 任务 | 未建模部分已经证明 |
| `product-check` | 产品职责包的构建、严格类型检查、来源/组合测试、依赖边界、原件完整性及逐包隔离 tarball 消费 | live-agent v1、D-008 目标能力或完整智能体产品已经实现 |
| 实现符合性 | 绑定源码版本的场景、集成测试或运行证据 | 所有实现、配置或部署天然等价 |

`make docs-check BASELINE=<git-ref>`（或 `omne-docs-check --baseline <git-ref>`）必须用于审阅已发布规范或冻结表同时变更的提交。`make spec-check` 缺省执行全部已登记形式任务，是发版与合并前的门；日常修改用 `make spec-check FORMAL=changed BASELINE=<git-ref>`（或 `omne-spec-check --formal changed --baseline <git-ref>`）只执行工件相对基线有差异或未跟踪的任务，`FORMAL=none` 只做结构检查；被跳过的任务在输出里逐条标明，跳过不构成该任务通过的证据。`omne-spec-check` 要将结构检查和 TLA+/Alloy 的实际执行分开报告：没有模型任务是明确覆盖缺口，声明了任务却缺少工具或执行失败是失败或未执行，绝不能假通过。提案和 archive 可单独检查，其结果不改变接受状态。

关键规则在其语义契约中有可引用 ID，并映射到适用的模型性质、Schema 约束、验收场景和证据或明确缺口。TLA+表达行为及状态演化，Alloy 在有限范围寻找结构反例，JSON Schema 约束数据形状；它们与文字规范互补，冲突时修正规格而不以单项检查覆盖冲突。场景应包含初始条件、动作、可观察结果和规则。

可复用验证证据至少记录：契约与模型版本、源码 commit、工具与版本、命令或配置、输入边界/假设和结果。通过、失败、不确定和未覆盖均须如实保留。有限测试或模型检查不能表述为无条件证明。

Markdown 检查覆盖根 README、CONTRIBUTING、AGENTS/CLAUDE 入口，docs/spec、
packages/apps/tools/scripts、`.meta_harness/` 与根 agent 配置入口；
跳过依赖目录、构建产物与临时结果。历史原件按归档哈希核对。扩大源码目录时同步
维护检查范围，避免目录有了入口文档却没有进入引用检查。

原来按工具分类的 `spec/tla/`、`spec/alloy/`、`spec/schemas/` 和 `spec/scenarios/` 不再是有效规格入口；相应工件随其数据、能力或组合契约保存。验收场景与跨工件追踪要求由本规范和契约内的 `verification.md` 承接；已迁移的 agent-core 提案追踪记录见 `docs/proposals/agent-core/v1/traceability.md`，它的候选身份不改变本规范的验证边界。

`make product-check` 调用 pnpm workspace 的 check；[产品成员](../../packages/README.md)
按依赖顺序构建并针对官方 Cordis 发行物验证，测试不使用源码 alias。
[package-checks](../../tools/package-checks/README.md)核对能力族/叶子布局、真实 import
（含 type-only 与声明扩展）的依赖和导出边界、无环闭包及来源；负例必须被拒绝。
每包在独立仓库外目录仅安装它及声明的传递产品依赖 tarball，以当前 pnpm store
离线解析，strict tsc 和 Node 消费均须成功。另运行多包实际组合，覆盖唯一 scope
的路由/父链/撤回、Session/流/文件读写及通过公开入口扩展 Session 和投影类型。
这些检查不向 npm 发布，也不代表已兑现目标产品语义。

根 `pnpm format:check` 使用 `package.json` 固定的本地 Prettier 和共享根配置，检查
受维护 `packages/`、`apps/`、`tools/`、`scripts/` TS/JS 源码、测试及所属配置与根
TS/测试配置；`pnpm format:write` 写入同一范围。显式文件参数
只接受该范围内的仓库相对文件，agent 必须进一步收窄到本次写权限。`spec/`、上游原件、
provenance、JSONL 黄金文件、依赖、构建输出、生成物和临时目录不在格式化范围。
根产品检查和独立格式 CI 都调用同一检查入口；CI 只按退出码检查，不写代码或提交。

`pnpm format:staged` 从 Git index 读取已暂存 blob，不用工作区副本推断提交是否合格，
也不修改 index、工作区或 stash。`pnpm test:format` 在临时独立 Git 仓库验证 RED→write→
GREEN、幂等、空格路径、排除范围、部分暂存与安装器不覆盖已有 hook。该测试验证仓库
适配器边界，不证明 Prettier 内部算法；编辑器配置和 workflow 的本地检查也不代表真实
宿主保存动作或 GitHub 托管运行已经发生。

## 证明与实现证据

[组合性质指南](../architecture-guide/assurance/composability.md#证据要求何时触发)
拥有证明触发条件，本节拥有结果含义和复现要求。选择工具根据所需性质，不把
多种证据排成可互相替代的分数等级。

| 证据 | 能支持的结论与必要边界 |
|---|---|
| 正确性论证或人工审阅的证明 | 说明命题、定义域、前提和推导；只有完整证明才报告为证明，草图和未闭合义务分别标明；独立意见仍可能受遗漏影响 |
| 模型检查 | 说明模型、实际探索范围、配置、被检性质及结果；有限实例未发现反例不能扩展为任意规模或真实实现正确 |
| 机器检查的演绎证明 | 固定命题、证明工件、工具及依赖，实际检查通过；列出公理、环境假设、信任边界及未消解义务，不将目标本身作为假设来声称完成 |
| 实现符合性证据 | 固定实际包/fork、源码、配置、装配和环境，观察契约要求的结果；契约测试、故障注入及实机结果分别说明范围 |

所需证明可复用，但应定位精确来源、目标命题及适用性论证；声明的证据级别不能
高于已有结果。机器证明的结论仍以模型和信任边界为前提，不自动验证任意插件、
执行器或外部环境。检查器未执行、占位证明、跳过目标或把目标当成未验证假设，
都不能报告该目标已经证明。实际失败和工具不支持也分别记录。

形式模型与实现之间要能解释：哪些状态和事件对应，哪些实现步骤被抽象成一个
动作，哪些环境或提供者行为被假定。行为的权威仍是所采用的 TLA+ 规格；采用
其他证明表示时说明映射，不能建立另一套相冲突行为。没有实现精化证明时如实
说明符合性由哪些场景、轨迹核对或其他证据支持，不把模型证明自动延伸到代码。

现有 formal-tasks 的类型为 TLA/Alloy，现有执行任务使用 TLC；其登记及成功退出
不自动表示已接入演绎证明检查器。新证明工具的采用、可执行检查入口和结果判定
需在相关任务中明确，正式使用前补齐实际支持与测量验证；本规范不自行选定工具
或扩展格式。当前缺少工具只说明义务未完成，不构成已触发证明门槛的豁免。

证明的规范性定义、模型或命题属于已发布版本工件时遵守冻结规则；可变运行报告
位于版本目录外。每份结果保留精确对象、命令/配置、工具版本、输入与假设、
原始结果或可恢复引用、通过/失败/未知范围。改变命题、表示、依赖或环境时重新
判断适用性，不把旧证据直接标成新版通过。

## 覆盖的发现入口

从契约的可变 README 应能找到所采用版本的覆盖说明；可就地维护简短说明，或
链接版本目录外已有的 `verification.md` 与证据。说明按关键条款或性质关联模型、
场景、提供者及真实组合结果，并标明范围、假设和未完成义务；不是按文件数量
打分，也不要求每条规则生成一套相同附件。

尚未形式化、模型未覆盖、已声明但未执行、执行失败、有限范围通过，以及实现
尚未存在或真实组合未验证，需要分别表述。某个准入模型通过不能扩展为
整份授权、工具生命周期或恢复契约已验证；只有 contract.md 也不自动判为无效。
正文、模型和实际执行分别承担其证据责任。

结构检查、语义审阅、有限模型、公共产物消费和真实组合属于不同证据范围。
记录后两者时固定实际发行物或 fork、所消费接口及应用装配；上游源码测试不自动
代表实际采用包，单组件和替身通过不代表跨能力动作链闭合。检查器不自动判断
映射充分性或设计是否就绪；该判断见
[规格维护](spec-maintenance.md#设计就绪与实施入口)。

更新可变覆盖说明不改冻结规范；新增或修订规范模型、Schema 和规范场景仍遵循
[版本规则](versioning.md#契约版本)。实现、契约、装配或假设变化后，旧证据保留
原范围并标出当前失效部分，不让新入口继续把过往结果投影为当前通过。

## 环境与实际执行

自动化入口需要 Bash、Make；首次使用安装 [uv](https://docs.astral.sh/uv/getting-started/installation/)，运行
`uv sync --locked`；它依据仓库锁文件准备 Python 3.12+ 与 JSON Schema、Markdown、
YAML 验证依赖，并以 editable 方式安装根开发组引用的 workspace 工具包。
成员依赖与构建由包内 pyproject 声明，不把根聚合项目当作 spec-tools 包。
`make test` 的临时目录为 `tmp/test-runs/`，只用于本仓库测试，
重跑可清理该目录，不触碰同机其他项目的测试证据。

`make test` 同时覆盖仓库检查器、Meta Harness 编译/链接工具和 [subagent 双端生成器](../../.meta_harness/agents/skills/design-subagents/canonical/references/packaging.md)
的离线测试；不启动目标模型。`make agents-check` 核对源与产物及链接，skill 的两端文件镜像另由 `make docs-check` 核对，
生成角色的行为验证与宿主加载证据见该 skill 的[验证说明](../../.meta_harness/agents/skills/design-subagents/canonical/references/validation.md)。

`make spec-tools` 单独检查 Java 11+ 与 `TLA2TOOLS_JAR`、`ALLOY_ANALYZER_JAR`
所指向的实际 JAR，缺失任一项返回非零。JAR 从
[TLA+ 官方发行页](https://github.com/tlaplus/tlaplus/releases)和
[Alloy 官方发行页](https://github.com/AlloyTools/org.alloytools.alloy/releases)
获取，选择与所用版本兼容的 Java；报告记录工具版本和文件 SHA-256，不能仅凭环境变量存在就称已验证。
当前环境是否安装与仓库是否定义模型是两个问题。

真实模型的命令登记在 [formal-tasks.json](../../spec/formal-tasks.json)。其
[格式](../../tools/spec-tools/src/omne_harness_lite_spec_tools/formats/formal-tasks.schema.json)要求唯一任务 ID、`tla|alloy`、
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

## 需求检查与基线证据

[D-004](../decisions/D-004-requirements-foundation.md) 的需求检查核对
[元数据](metadata.md#需求正文)、身份唯一、主维度目录一致及主副维度索引引用可达。
它不判定分类是否恰当、引用解释是否充分、用户确认是否忠实或设计是否兑现要求。
需求覆盖与旧决定适用性由审阅核对。

正式消费基线另按[保留规则](requirements.md#基线保留)验证：交付保留引用后，从
不含开发分支的独立检出恢复 commit、路径与确认范围。docs-check 不自动联网、
创建 tag 或声称远端保留完成。本次实测边界见[迁移记录](migrations/2026-09-12-requirements-foundation.md)。
