# 验证、工具与证据

本页定义检查的边界：每个入口覆盖什么、**不能**据此声称什么。
命令的准确目标由根 [Makefile](../Makefile) 与 [scripts/check.sh](../scripts/check.sh) 维护，
实际参数与退出语义以各 CLI 的 `--help` 为准。

## 检查入口

组合入口 `make check` 调用 [scripts/check.sh](../scripts/check.sh)，依次执行下表前五项，
任一步失败即停止。该脚本也支持从其他工作目录通过绝对路径调用，供本地与 CI 共用。

| 入口 | 覆盖 | **不能**声称 |
|---|---|---|
| `make agents-check` | 从 canonical 源与角色源重新计算产物，核对文件内容、权限及三个根相对软链接 | 宿主已发现配置、原生权限已生效或模型行为符合预期 |
| `make docs-check` | 跨仓库 Markdown 本地链接与锚点、Codex/Claude 技能镜像一致 | 内容正确、设计成立或因果理由充分 |
| `make design-check` | 设计链的身份、资源、引用、冻结登记与形式任务登记（`.meta_harness/design/`）；统一语言、领域对象条目与产品 topic 三家的对账——形态与条目一一对应、出处与依据的 rev 等于 topic 当前 rev、词条索引与分卷一致、派生总表是最新的；实现映射节点的形状对账——kind 与目录名及 `bindings.yaml` 一致、assembly 才有 `architecture.md`、源码位置与节点同名、交付面 PF 的 rev、技术栈采用的状态与依据链、契约坐标在 catalog 里、交付面仍是 draft 时不得登记绑定 | 登记等于执行；`--formal registered` 只确认任务存在。对账通过**不代表**任何条目或节点的内容正确，也查不出「产品正文里冒出一个新对象却没人立词条」；节点通过**不代表**某条绑定的证据真能支持那条条款，也查不出一条应用间的边只写了一侧 |
| `make test` | 仓库检查器、Meta Harness 编译/链接工具与 `design-subagents` 生成器的离线测试 | 宿主加载与模型行为已验证 |
| `make product-check` | TS/JS 格式与格式化适配器自测；全部 TS 成员的构建、类型检查（含 `*.spec-d.ts` 类型测试）与 vitest 运行时测试——契约纯模块对 spec `examples.md` 的机检、Cordis 4.0.4 的 8 条 probe、存储一致性套件在 **sqlite** 上的 15 组用例、租约时钟的回拨与重启用例；`tools/ts-checks` 的结构规则扫描 `packages/`（条数与清单以 [tools/ts-checks](../tools/ts-checks/README.md) 的规则表为准） | 产品能力已端到端验证——tenancy 插件的包内场景已是真实测试，但装配 `apps/tenancy-host` 未建、跨包真实组合只到注册组合那一层；pg 方言未运行（缺 `OMNE_TEST_PG_URL` 时 `describe.skip`，**跳过不是通过**）；跨进程重启的持久证据、真实外键存在性（归装配）与端到端流程都不在其中；结构规则只看文本，不做类型分析 |
| `make formal-tools` | Java 与 `TLA2TOOLS_JAR`、`ALLOY_ANALYZER_JAR` 指向的实际 JAR 可用 | 任何模型已经跑过 |

`make design-check` 的三个形式模式含义不同：`FORMAL=registered`（默认）只确认任务与工件已登记，
`FORMAL=skip` 记录本次明确跳过，**`FORMAL=run` 才真正调用 runner** 并传播缺工具、超时和非零退出。
前两种**都不是**模型已通过的证据。`GATE=release` 作为切换/冻结门，对任一 blocked relation、
unknown consumer 或缺 release evidence 的关系失败。

对账那两支默认把「rev 落后」判为失败：某个产品 topic 升了 rev，引用它的词条出处、对象条目依据
与实现映射节点的交付面就要逐条复核后才能把 rev 改到当前值。本地迭代时可用 `STALE=report`
（节点检查里 `warn` 是它的同义词）只列出待复核队列而不失败；**它不是通过的证据**，交付前仍须以默认模式通过。

> **留档区不在检查范围内。**`design_legacy/`、`research/legacy_backup/` 与 `agents/research/`
> 保持原件搬来时的相对链接——改写它们就会篡改「当初那份材料实际写了什么」。
> 各区入口说明了这一点。

## 环境与实际执行

自动化入口需要 Git、Bash、Make，以及 [uv](https://docs.astral.sh/uv/getting-started/installation/)
与根 `package.json` 指定的 Node/pnpm。`uv sync --locked` 依据锁文件准备 Python 3.12+
及 JSON Schema、Markdown、YAML 验证依赖，并以 editable 方式安装 workspace 工具包。
`make test` 的临时目录为 `tmp/test-runs/`，只用于本仓库测试。

形式工具链**装在系统全局路径**，不依赖任何仓库内的临时目录：

```text
/opt/java/jdk-21.0.12.1+1-jre      JRE
/opt/tlaplus/tla2tools.jar         TLA+ / TLC
/opt/alloy/alloy-6.2.0.jar         Alloy Analyzer（alloy.jar 指向它）
/usr/local/bin/{java,tlc,tla2sany,alloy}
```

`JAVA_HOME`、`JAVA_BIN`、`TLA2TOOLS_JAR`、`ALLOY_ANALYZER_JAR` 在 `/etc/environment`
与 `/etc/profile.d/tlaplus.sh` 中声明，**登录后的 session 自动继承**；
非登录 shell（某些 CI 步骤、`bash -c`）读不到 `/etc/environment` 之外的文件，
需要时显式传入。JAR 来自
[TLA+ 官方发行页](https://github.com/tlaplus/tlaplus/releases)与
[Alloy 官方发行页](https://github.com/AlloyTools/org.alloytools.alloy/releases)。

**环境存在不等于已验证。**`make formal-tools` 只报告工具可用，报告应记录工具版本与文件
SHA-256；当前环境是否安装、仓库是否定义了模型，是两个问题。

形式任务的命令登记在设计链的 `registry/formal-tasks.json`：唯一任务 ID、`tla|alloy`、
输入 `artifacts` 与参数数组 `command`，可声明 `timeout_seconds`。参数支持环境变量展开，
**未设置的变量导致失败，不经过 shell**。工具若用退出码 0 表示「找到反例」，
任务必须通过专属验证适配器把期望性质的失败映射为非零，
**不能只运行 GUI 或随意命令充当模型检查**。

正式版本新增 `.tla` 或 `.als` 却没有任务覆盖时检查失败；没有任何任务时明确报告
`UNCOVERED`，**不能宣称 TLA+/Alloy 已跑过**。

## 证据能支持什么

选择工具根据所需性质，**不把多种证据排成可互相替代的分数等级**。

| 证据 | 能支持的结论与必要边界 |
|---|---|
| 正确性论证或人工审阅的证明 | 说明命题、定义域、前提和推导；只有完整证明才报告为证明，草图与未闭合义务分别标明 |
| 模型检查 | 说明模型、实际探索范围、配置、被检性质及结果；**有限实例未发现反例不能扩展为任意规模或真实实现正确** |
| 机器检查的演绎证明 | 固定命题、证明工件、工具及依赖，实际检查通过；列出公理、环境假设、信任边界及未消解义务 |
| 实现符合性证据 | 固定实际包/fork、源码、配置、装配和环境，观察契约要求的结果；契约测试、故障注入及实机结果分别说明范围 |

检查器未执行、占位证明、跳过目标，或把目标本身当成未验证假设，**都不能报告该目标已经证明**。
实际失败和工具不支持也分别记录。

形式模型与实现之间要能解释：哪些状态和事件对应，哪些实现步骤被抽象成一个动作，
哪些环境或提供者行为被假定。行为的权威是所采用的 TLA+ 规格；
采用其他表示时说明映射，**不建立另一套相冲突的行为**。
没有精化证明时如实说明符合性由哪些场景或轨迹核对支持，**不把模型证明自动延伸到代码**。

可复用证据至少记录：契约与模型版本、源码 commit、工具与版本、命令或配置、
输入边界/假设和结果。通过、失败、不确定和未覆盖均须如实保留。
**有限测试或模型检查不能表述为无条件证明。**

## 分别表述这六种状态

尚未形式化、模型未覆盖、已声明但未执行、执行失败、有限范围通过，
以及实现尚未存在或真实组合未验证——**它们是六件事，不能合并成一个百分比**。

某个模型通过不能扩展为整份契约已验证；结构检查、语义审阅、有限模型、
公共产物消费和真实组合属于不同证据范围。记录后两者时固定实际发行物、
所消费接口及应用装配；**上游源码测试不自动代表实际采用的包**，
单组件和替身通过不代表跨能力动作链闭合。

实现、契约、装配或假设变化后，旧证据保留原范围并标出当前失效部分，
**不让新入口把过往结果投影为当前通过**。

## 交付时说明什么

保留失败的实际输出与影响判断，修正后运行受影响检查。
交付说明检查针对哪个源码状态、配置和范围；已有证据仍覆盖同一状态时可引用，
变化使其失效时补跑。临时日志放在 `tmp/`，清理工作树前保留任务需要的证据。
