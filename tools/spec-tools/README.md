# omne-harness-lite-spec-tools

开发期 Python 工具包，属于根 uv workspace，负责文档导航检查、文档目标与缺项计量、形式工具环境检查和开发模型评估报告检查。
它不是产品运行时依赖。源码与测试归本包；评估政策和任务包归
[开发模型评估入口](../../.meta_harness/agents/evaluation/developer-model/README.md)。
模块承诺与系统约束的归属见[架构维护入口](../../.meta_harness/design/architecture/README.md)。

## 规格编写与本工具的分工

编写或修订规格从[研究与设计场景](../../docs/engineering/scenarios/research-and-design.md)进入。
接口与模块边界设计使用 `pstack:architect`；综合已经讨论的内容时按需使用 Matt `to-spec`；技术表达使用 `pstack:technical-writing` 与 `pstack:unslop`，并遵循项目写作要求。
精确版本、正文指针、宿主加载方式和项目采用差异统一归[技能引用与采用边界](../../docs/engineering/skills.md)，不在本包复制技能方法或版本表。

单次交付规格与长期规格的用途、归属及承接规则归[文档治理](../../docs/engineering/documentation.md#单次交付规格与长期规格)，成员契约的完整内容要求归[成员文档规范](../../docs/member-documentation.md)。
本包提供链接、登记、结构和环境检查，不生成规格，也不判定行为契约是否完整、设计是否被接受或实现是否符合规格。

## 使用与开发

`pnpm run check:docs`、`pnpm run check:formal-tools`、`pnpm run test:python` 提供单项入口。
也可从仓库根显式选择成员：

```sh
uv run --locked --package omne-harness-lite-spec-tools omne-docs-check
uv run --locked --package omne-harness-lite-spec-tools omne-spec-tools-check
uv run --locked --package omne-harness-lite-spec-tools omne-evaluate-developer-model REPORT
uv build --package omne-harness-lite-spec-tools --out-dir .dist/spec-tools
```

涉及仓库材料的命令（docs、evaluation）默认从当前工作目录向上定位受检仓库，
也接受 `--root PATH`，不会把安装位置当作受检仓库。
环境检查仅检查本机 Java/JAR。评估政策与格式从目标仓库的实际评估入口读取；
无目标材料时明确报错，wheel 不携带项目政策或旧设计链格式的副本。

在本成员目录运行 `uv run --locked pytest` 检查包测试；根测试还覆盖 skill 生成器。
依赖在本包声明，根开发组只引用本地 workspace 成员和跨包开发工具。
检查支持的结论与形式验证覆盖见[验证规范](../../docs/verification.md)。

## 文档目标与缺项计量

```sh
pnpm run docs:inventory
pnpm run docs:inventory --out tmp/my-documentation-report
# --base 必须是独立目录，含自己的登记与源；不是 commit 参数，也不是当前源副本回填。
pnpm run docs:inventory --base /path/to/baseline --out tmp/comparison
uv run --locked omne-documentation inventory --root . --out tmp/documentation-report
```

默认读取受检根的 `docs/documentation.json`，并发现 `docs/domains/`、`packages/`、`apps/`、`tools/` 下同名局部登记。跳过依赖、构建、临时、模板与符号链接目录；显式 `--registry` 可重复指定受检根相对路径，替代默认发现。未跟踪目标文件也读取，不依赖 Git 已跟踪清单。要求依据和临时留空范围归[文档治理](../../docs/engineering/documentation.md)，不由工具自行采用。

### 格式与源边界

[bindings v2 Schema](src/omne_harness_lite_spec_tools/formats/documentation-bindings.schema.json)随工具发布。候选 v1 未曾在本仓库发布；v1、未知版本、未知字段与缺必要字段拒绝，不暗中转换。v2 用于文档库存及本页角色查询的目标选择；完整 audit/context/gate 的候选格式不是当前消费协议。

每份登记有 owner（稳定 id、project/domain/member、可读依据源），documents 条目有稳定局部 id、path、kind、required、visibility、basis、applicability、expectationSource、inspectionProfile 和 requiredSections。basis 为 adopted/candidate/unknown，applicability 为 applicable/unknown/not-applicable；not-applicable 必须由所指依据明确说明，不由文件缺失推断。可选 gapAllowanceSource 指向持续留空依据。章节有稳定 id 与 anchor。身份按 owner/document/section 元组定位，不按行号。

所有路径以受检根为基准；目标可以尚未存在，owner、expectation、allowance 必须可读且所给锚点可达。拒绝根外路径、软链接逃逸、临时／过程材料、重复 owner、重复目标身份／路径和重复章节。根登记与局部登记不能重复维护同一目标。登记不存完成状态；basis 指目标要求的采用依据，不表示目标正文被接受。

### 受支持的 Markdown 观察

解析使用本包已有 CommonMark AST。`prose-v1` 以非空段落、列表、引用或表格中的文本为可检查正文；`reference-v1` 另外接受非空代码块。元数据、标题、注释及仅有页内链接的自动目录不算正文。HTML-only 或代码-only 的普通说明不判就绪；不支持 profile 保留 unknown。单句或一张表达到 inspectable 仍不表示内容充分。

`<!-- documentation:placeholder -->` 在独立行标记未完成内容。位于首个二级或更深标题之前，标记整文件；位于必要章节内，标记该章节。补写并采用相应内容后由维护者移除标记；带有“现行源见…”说明的骨架仍报告占位，不靠字数变绿。未使用此格式的自然语言 TODO 不承诺自动识别。

章节从其标题正文开始，包含子标题，到下一同级或更高标题结束；使用与导航一致的 Unicode 标题锚点／重复标题后缀，并支持紧邻标题前独立的 `<a id="..."></a>`。其它 HTML 锚点位置不作为本 profile 的必要章节边界。

观察状态为 missing-file、empty-body、placeholder-only、missing-section、inspectable、unknown、not-applicable 或 error。文件与每个必要章节独立列出；父文件缺失、空白或占位时，章节缺项注明依赖，在独立根因计数中不重复累加。采用／适用未知仍可附物理观察，但义务状态保持 unknown。允许留空不会消除缺项，可选位置单独分组。

### 报告与比较

stdout 默认是完整 JSON，`--summary` 只打印同报告的执行与计数摘要。`--out` 写 inventory.json 与由它生成的 inventory.md；输出仅允许受检根 tmp 或源外显式目录，不写正文与登记。JSON 包含实际输入散列／缺失、要求依据、拥有者、观察、依赖和方法／Schema 散列。读取时输入变动或配置／源读取失败明确返回错误，不假装完成。

报告先写目录内新临时文件，再原子替换目标文件；既有报告文件的软链接或硬链接不被追随，不会通过输出别名改写当前源或 BASE 源。

无 BASE 只报告全量现状与不可比原因。有 BASE 时分别读取两边的登记／源，既不补旧缺文件，也不沿用当前配置。相同身份、依据和方法下输出 persistent/introduced/resolved/unchanged；unknown/error/not-applicable 参与为 uncompared，要求、profile、路径、依据源字节或范围变化为 measurement-change。删除登记不是修复；resolved 只表示机械缺项消除。依据散列比较是保守的，不把相应源的无关编辑冒充可比收益。

正常执行退出 0，缺项／留空／unknown 仍报告；输入、执行或输出失败退出 2。`pnpm run check:docs` 的现有链接／镜像范围不变，inventory 独立运行，不新增合并硬线。单次报告留 tmp；工具不证明内容正确、接受、设计实现对齐或真实阅读体验。

## 按角色读取上下文

`omne-documentation context --root . --role integrator` 从 `docs/documentation.json` 的
`project-documentation` 项目拥有者、`docs#README` 文档及其 `requiredSections` 选择角色。
角色 ID 由该登记维护。目标必须为 `docs/README.md`。完整登记元数据仍须有效；查询只读取所选文档及拥有者的依据，不读取其他目标的私有依据或留空来源。

命令向 stdout 输出一份 JSON。`identity` 标明角色和锚点，`scope` 保留登记范围及依据，
`structure` 复用库存观察，`excerpt` 返回该标题到下一同级或上级标题前的原文，包含子节。
缺文件、缺章节或空正文时片段为 null。占位、候选和 unknown 不遮蔽可定位的原文。
`directReferences` 按出现顺序列出直接链接，不递归展开，不抓取远端。
`inputs` 列出实际读取文件的路径、存在性和 SHA-256。运行内同时核对实际解析路径。

身份、登记、链接、路径或输入变化错误退出 2，错误写入 stderr，stdout 不返回成功 JSON。
缺项和 unknown 是观察结果，可以退出 0。直接链接的目标缺失或锚点不存在仍是执行错误。
结构和依据不证明操作支持、内容接受、实现完成或读者体验。

共同 URI 解析拒绝坏编码、file URI、根逃逸及过程材料别名。登记路径保护与普通模板导航分开。
二进制图片只冻结字节；Markdown 必须可按 UTF-8 解码。库存 v2 的输出字段与统计口径保持兼容。
持续反例见 `tests/test_documentation_context.py`、`tests/test_documentation_inputs.py`、
`tests/test_documentation_markdown.py` 和 `tests/test_doc_support.py`。
