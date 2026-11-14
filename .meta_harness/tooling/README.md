# 设计与 Agent 工具入口

本目录维护现行设计导航、领域对象对账，以及 skills 的宿主生成和接入。模块接口、完整必要行为规格及验证资源由实际包／应用拥有，工具不建立另一份中央契约或实现映射。

## 现行源检查

`check_sources.py` 检查现行设计的本地文件、Markdown 锚点和显式模块拥有者：

从仓库根运行。本仓库的设计树链接到检出里的 docs 与成员，所以要带 `--source-root`，`pnpm run check:design` 的第一步就是这条：

```sh
uv run --locked python .meta_harness/tooling/src/check_sources.py --root .meta_harness/design --source-root .
uv run --locked python .meta_harness/tooling/src/check_sources.py --root .meta_harness/design --source-root /explicit/execution-checkout
```

`--source-root` 必须指向设计根所在的同一执行检出，不从安装位置或父目录猜测。
工具校验该检出的根登记和发现的局部登记。docs、组及仅有文档的成员 Markdown 按精确注册文件准入，
不放行目录或同级未登记文件。另允许两个精确的非 Markdown 目标
`docs/engineering/github-delivery.json` 和 `docs/architecture/constraints.json`。

实际 packages 与 apps 当前成员的文件，包括 Markdown SPEC，
可由 workspace 包含及排除声明和有效 manifest 确认出处。目标与 manifest 必须留在该检出内。
`ModuleSources.owns()` 与 `origin()` 只认当前成员，`origin()` 返回 `current-member` 或 None。tools 不属于产品成员，其 Markdown 按精确登记准入。
坏登记、非法声明、缺文件、错锚点和越界链接均使检查失败。

未提供 `--source-root` 时，仅检查设计根、既有 meta agents/research 来源和 meta 根入口，
不准入外部 docs 或成员路径。模板可被合法引用，但不扫描模板正文。tmp、record、跨检出及其别名被拒绝。
spec、realization、registry 三个旧根不得重新出现，空目录、普通文件或悬空软链接同样拒绝。
外部 URL 不在本工具中抓取或核实。

检查冻结扫描集合、源正文、登记、依据、workspace、实际用到的 manifest、目标字节与实际路径，
收尾发现变化时失败。图片等二进制目标只读字节，Markdown 必须能按 UTF-8 解码。
持续正控与拒绝反例位于 `tests/test_source_links.py`。
角色上下文入口见 [spec-tools](../../tools/spec-tools/README.md#按角色读取上下文)。

该工具不判断条款等价性、采用状态、实现符合性或模型覆盖。公开 Schema 身份、规范输入及形式模型的正负控由真实拥有者维护并执行；单次原始输出归执行工作树 tmp。根 `pnpm run check:design` 组合本检查与领域对象对账，不隐式执行形式模型。

## 领域对象对账

出处锚点读取复用已安装的项目`omne-harness-lite-spec-tools`及其Markdown解析依赖；执行仓库用锁定的uv环境提供。对象对账不维护另一套围栏或标题解析。

`domain_objects.py` 对账三家之间的对应关系——统一语言词条、领域对象条目、产品 topic——
并生成派生总表 `design/views/domain-object-map.md`：

在仓库根运行，有两种写法。`pnpm run check:design` 先跑上面的现行源检查，再对账；
`--stale <值>` 只交给对账：

```sh
pnpm run check:design
pnpm run check:design --stale report
```

只要对账时，直接调用脚本，由锁定的 uv 环境提供解释器与依赖：

```sh
uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design                  # 对账，并核对总表是不是最新
uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design --write          # 重新生成总表
uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design --stale report   # rev 落后只列出，不判失败
```

`tests/test_readme_commands.py` 读本 README 代码块里每条 `uv run --locked python <脚本> …` 命令，查两件事：

- 每个脚本的 `--help` 退出 0。脚本名写错或脚本搬走时，用例变红。
- 每条命令照原样交给脚本的 argparse 解析，解析完立即退出，不执行脚本。参数名写错、缺必填参数或取值不在可选值里时，用例变红。

它不验证脚本收到参数之后做什么，也不验证 `pnpm run`、`pytest` 等其他命令。

它查什么、为什么查，权威正文在 [domain_objects/conventions.md](../design/domain_objects/conventions.md#对账)；
被点名之后怎么逐条复核，归 `ubiquitous-language` 与 `domain-objects` 两份 skill。这里只记工具自己的边界：

- **rev 的权威是各 topic `README.md` front-matter 的 `revision`。**`design.md` 抬头
  若写了 rev，必须与它相等；没写不算错。当前产品从slug目录的README元数据发现，核对PD身份、正整数修订、状态、正文及根内路径。封存PF出处另核修订、文件与锚点，不进入当前采用或反链。
- `ubiquitous_language/conflicts.md` 里的 rev **不查**：那是记下冲突时看到的那一版，是一条观察的时间戳，不是对齐凭据。
- 词条「出处」、条目「依据」、待裁「牵涉」读的是[同一条写法](../design/ubiquitous_language/conventions.md#rev-怎么写怎么读)：
  指向产品正文的链接后面跟着它那个 topic 的 `（rev N）`，同一个 topic 连着的几条链接可以共用后面那一个；
  一个括号里并列几个 rev 的，按前面 topic 出现的次序配，个数配不上就报错。
- 总表比对时**忽略生成时间那一行**，所以隔天重跑不会因为日期而判过期。
- `--stale report` 供本地迭代看待复核队列，**不是通过的证据**。
- 当前导航的链接与锚点由`check_sources.py`核对；封存出处的文件和锚点由本工具在明确legacy根核对；
  它也**不判断任何条目的内容对不对**，更查不出产品正文里新冒出来、却没人立词条的对象。

测试用一棵含一个 topic、一卷四个词条（含一个变体）、三条对象条目与一项待裁的小型设计树，覆盖：
一致时通过且总表可往返、只改生成时间不判过期、对象词条缺条目与条目缺对象词条、条目缺词条或缺必填字段、
rev落后及topic内已声明修订不一致及其 report 模式、依据缺 rev 或指向非产品正文、
形态缺失/非法/变体的父无效、未定词条须同时出现在 pending 与 conflicts、索引与分卷不一致、待裁缺 owner。

## Agent 编译

生成器从一个 `agents/` 源根按固定 host_layout 编译各宿主目录，源里有 `cloud/<host>/` 时一并编译该宿主的三份 Cloud Agent 运行时文件，并提供独立的相对软链接工具。
`host_layout.py` 拥有宿主清单与路径，`projection.py` 解析源和适配并产生内存产物，`compile_agents.py` 负责 CLI 与预检写入，
`link_agents.py` 暴露项目入口，`resident_card.py` 把 pqw-skills 的常驻卡片写进根入口，`initialize_agents.py` 串接生成、接入与常驻卡片。没有安装更新器、发布事务或知识图谱依赖。

## 使用

需要 Python 3.12+ 与 PyYAML；运行测试另需 pytest。执行仓库提供锁定环境。
以下命令从仓库根运行，用 `uv run --locked` 取得解释器与依赖，不从父目录猜测环境。

```sh
uv run --locked python .meta_harness/tooling/src/compile_agents.py --source .meta_harness/agents --output .meta_harness
uv run --locked python .meta_harness/tooling/src/compile_agents.py --source .meta_harness/agents --output .meta_harness --check
PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest -p no:cacheprovider .meta_harness/tooling/tests
```

输出根必须显式指定，正常产物留在 `.meta_harness/`。可用 `--host codex` 或
`--host claude-code` 或 `--host cursor` 单独生成，默认 `all`。不同宿主原生目录分别保留在输出根下。
各宿主的技能目录（`.claude/skills`、`.agents/skills`、`.cursor/skills`）归本工具所有：生成时把它们收敛到与源一致，内容或权限不同的文件被替换，源里已经没有的技能与文件被删除；旧版生成过、源已不再产出的目录（`.claude/agents`、`.codex/agents`、`.cursor/agents`）也一并删除。所以改源之后直接重跑，不需要先清目录。
技能目录以外的生成文件（钩子文件、Cursor 包与云端文件）内容不同时整个预检失败，不覆盖、不删除；宿主自己写在这些根下的文件（例如 `.claude/settings.local.json`）不归本工具，不检查也不动。
`--check` 只读，一次报出全部问题：缺少的、内容不同的、技能目录里多出来的和退役目录还在的。

输出根可包含源目录（如 `.meta_harness/agents`），但具体生成路径不得与源重叠；
输出根不得放在源内。工具拒绝源/目标符号链接和越界输出；所有源与目标冲突先预检。
写入过程中发生磁盘等故障仍可能留下部分新文件，不承诺多个目录跨文件事务；
失败会非零退出，重跑或检查可发现未完成的输出。

## Skill 策略

每个所选宿主都需要 `agents/skills/<name>/adapters/<host>/strategy.yaml`：

```yaml
version: 1
host: codex
skill: example-skill
mode: copy
slots:
  '{{HOST_GUIDANCE}}': slots/host-guidance.md
```

`slots` 可省略。替换文件相对当前 adapter，不能越界；仅替换 canonical 中 Markdown 的
大写 `{{NAME}}` slots，做一遍替换，不递归执行模板。维护者入口 `AGENTS.md`、`CLAUDE.md`、
`.design/`、`evals/` 与缓存不进入产物。脚本保留可执行性，普通文件规范为 0644、可执行文件为 0755。

`mode: unsupported` 必须提供非空 `reason`，使所选宿主构建失败并说明缺口；
不是自动丢弃或发一个看似可用的空 skill。当前仅支持这两种模式；未知字段、版本、模式和
身份不匹配均拒绝。生成器不支持 stub、partial overlay 或完整发布事务。

## 外部技能集

`agents/vendor/<技能集>/` 放钉了提交的外部技能集（git 子模块），每个 `skills/<name>/SKILL.md` 是一个技能。
它们宿主无关，没有 adapter 与 slots：生成器原样复制到每个所选宿主的技能目录，排除维护者材料，
保留可执行位，`SKILL.md` 照样核 frontmatter。与 `agents/skills/` 里的项目技能同名时项目技能优先，
外部的那份不生成；项目删掉自己的那份后，外部的接手。两个技能集有同名技能时整体预检失败。
新检出先 `git submodule update --init`；没有初始化的子模块是空目录，生成器预检失败并提示这条命令，不会悄悄少生成一整套技能。
每个来源固定在哪个版本、项目采用它的哪一部分，见下面的[来源与采用](#来源与采用)。

### pqw-skills 只钉接入约定的版本

pqw-skills 把项目要跟着改的三样（接入节的槽位名、交接信息包的节名、常驻卡片）列在它的 `design/consumer-contract.json`，带一个整数 `version`。本项目在 `agents/pqw/contract-version` 记下自己满足的那个版本。子模块提交是下限；技能正文与脚本读「约定版本相同的最新发行版」，所以 pqw-skills 发一版正文，本仓库不用提交。

```sh
uv run --locked python .meta_harness/tooling/src/pqw_contract.py --project-root .
uv run --locked python .meta_harness/tooling/src/pqw_contract.py --project-root . --check
```

- 不带 `--check`：拉 pqw-skills 的 tag，找约定版本等于所钉版本、并且在子模块提交之后的最新 tag，把它解到 `.meta_harness/.vendor-float/pqw-skills/`（不进 Git）。没有更新的就删掉这个目录，读子模块。拉不到 tag 时用本机已有的。`--offline` 不拉。`initialize_agents.py` 第一步就跑它。
- 读哪一份只有一条规则：浮动目录的约定版本等于所钉版本就读它，否则读子模块。生成器、常驻卡片与 [pqw-adapter](../../tools/pqw-adapter/README_ZH.md) 都按这条规则读，技能正文与脚本不会各读一版。
- `--check` 只读：子模块的约定版本等于所钉版本；根 `AGENTS.md`「pqw-skills 接入」有约定列出的每个槽位；卡模板的二级标题等于约定的节名。`pnpm run check:agents` 的第一步就是它。
- pqw-skills 的约定版本涨了：浮动停在旧约定的最后一版。要用新版时，在一个 PR 里把子模块指到新版、改 `contract-version`，再按 `--check` 报的逐条改接入节与卡模板。
- 没有网络的环境（gate、CI）读子模块。约定版本相同，接入节与卡模板对两份都成立。

### 来源与采用

研发方法分三层：工作流程用 pqw-skills；交付方案与实施规格的写法用 Matt 的三项，经 pqw `spec-and-plan` 加载；写或改代码时的判断以 ub-mode 为基础，项目独有的补充在 [研发品味](../agents/roles/engineering-taste.md)。采用一种方法不替代正式的语义接受，也不扩大任务权限。

| 体系 | 固定来源 | 采用范围 |
| --- | --- | --- |
| pqw-skills | [PanQiWei/pqw-skills](https://github.com/PanQiWei/pqw-skills)，子模块 `agents/vendor/pqw-skills`，只钉接入约定的版本（上一节） | 工作流程。由生成器原样投影进三个宿主，与项目技能同名时项目技能优先 |
| pstack port | 0.9.79，[michael-denyer/pstack-claude@60ae9e25610744bccd45bd405c211413a471aaf8](https://github.com/michael-denyer/pstack-claude/tree/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack) | Codex 与 Claude Code 上 pqw 引用的环节方法，以及不够格走 pqw 流程的小改动 |
| Cursor 官方 pstack | 0.15.20，[cursor/plugins@1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def) | Cursor 上同一范围，不覆盖 port 0.9.79 |
| Matt skills | 1.3.1，[mattpocock/skills@b0618bc436ad893b3c5e84e55fba86586d34a404](https://github.com/mattpocock/skills/tree/b0618bc436ad893b3c5e84e55fba86586d34a404/skills) | `to-spec`、`to-tickets`、`writing-for-agents` 三项的写法；其余入口按需 |
| ub-mode | [unclebob/ub-mode@57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f](https://github.com/unclebob/ub-mode/tree/57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f) | 研发品味。它取代 poteto-mode 的原则清单：不要求逐个加载 `pstack:principle-*` |
| 项目技能 | [`agents/skills`](../agents/README.md) | 只装本项目独有的知识；canonical 源维护之后生成 |

更换上游版本之前，检查正文、必要的参考、触发、权限和语义，同步这张表与两处云端环境的脚本。新版本不静默扩大采用范围。

### 在宿主里安装

pqw-skills 随检出投影，不另装。参与研发维护之前，在自己实际使用的宿主里装好其余几样，版本取上表：Codex 与 Claude Code 装 pstack port、Matt skills 与 ub-mode；Cursor 装 Cursor 官方 pstack、Matt skills 与 ub-mode。一台机器装好，不替代新机器、云端环境或新宿主的初始化。

1. 确认实际的宿主及其版本，打开它的插件管理入口。照上表的固定版本装，不拿原版 pstack、同名技能或上游最新版代替。
2. 注册固定来源并安装两份插件。宿主支持指定 Git 版本时直接指定；只支持本地 marketplace 时，先在仓库外准备对应版本的检出，再注册它。不把插件正文复制进本仓库的技能源，也不同时装另一份同名技能。
3. 装 ub-mode。它只有一份 `SKILL.md`，上游没有声明许可证，所以不复制进本仓库：按固定提交取 `https://raw.githubusercontent.com/unclebob/ub-mode/<提交>/SKILL.md`，放进宿主的用户技能目录（Claude Code 是 `~/.claude/skills/ub-mode/`，Codex 是 `~/.codex/skills/ub-mode/`，Cursor 是 `~/.cursor/skills/ub-mode/`）。
4. 新开会话，核对两份插件的版本、启用状态与发现路径，宿主有没有发现 `ub-mode`，这次要用的技能和参考文件读不读得到。装上了、宿主发现了、正文读到了、行为照做了，是四件事，分别判断。
5. 插件自动更新之后也核对实际版本；对不上时先恢复指定版本，或由技能的拥有者明确改版，再继续依赖它的工作。

Codex CLI 的命令形态（语法以 `codex plugin --help` 为准；别的宿主照固定来源自己的安装说明，不套用这几条）：

```sh
codex plugin marketplace add michael-denyer/pstack-claude --ref <pstack 的提交>
codex plugin add pstack@pstack-claude
codex plugin marketplace add mattpocock/skills --ref <Matt 的提交>
codex plugin add mattpocock-skills@mattpocock
mkdir -p ~/.codex/skills/ub-mode
curl -fsSL https://raw.githubusercontent.com/unclebob/ub-mode/<ub-mode 的提交>/SKILL.md -o ~/.codex/skills/ub-mode/SKILL.md
```

两处云端环境与这张表的关系：Cursor Cloud 的镜像照上表的版本安装；Claude Code on the web 每次会话启动时把 pstack port、Matt 与 ub-mode 更新到上游最新版本，实际版本可能比上表新。各自的说明在 [`agents/cloud`](../agents/cloud/README.md)。

### 在宿主里怎样叫、怎样读

- Codex 上的名字是 `pstack:<name>`、`mattpocock-skills:<name>` 与 `ub-mode`。先核对当前宿主实际发现了哪些技能，再读选中的 `SKILL.md` 与它必要的参考。技能名出现在提示里不等于已经加载。
- Matt 的 `to-spec`、`to-tickets` 与 `grill-with-docs` 声明了 `disable-model-invocation: true`：宿主不会自动触发，按已安装的路径直接读正文，并在报告里写明是这样读的。
- 同名技能写明来源：`pstack:tdd` 与 Matt 的 `tdd` 是两份不同的正文。TDD 的默认来源是 ub-mode 的 TDD 一节，要展开时读 `pstack:tdd`。
- 缺入口、正文或宿主能力时，报告具体缺了什么，停下依赖它的步骤，其余照常做。

### 外部方法与本项目不同的地方

外部方法的原文与本项目的要求冲突时，先定位这条要求的范围、拥有者与接受依据，不用「外部方法优先」处理。常见的几处：

| 来源 | 原文或默认 | 本项目怎样做 |
| --- | --- | --- |
| ub-mode | 先写会失败的测试 | 先设计必要的测试与验证（判据、反例、变红验证）；写新测试时先确认它变红，再实现 |
| ub-mode | 每个函数 CRAP 小于 10；消除相似度 0.8 以上的重复；变异 | 用 pqw `slice-closeout` 的结构读数与差分变异，命令在根 `AGENTS.md` 的接入表；阈值与带位线归整洁回路，不另定数 |
| ub-mode | 术语表 | 术语归统一语言 `design/ubiquitous_language/`，不另建词表 |
| ub-mode | 最后提交并推到主线 | 提交格式与来源 trailer 归根 `CONTRIBUTING.md`；主干只经 PR 与 gate 进入，步骤在 `omne-card` 技能 |
| pstack | playbook 里的提交、PR、对外消息与发布 | 技能不授予对外动作的权限；发布要有任务授权 |
| pstack | 并行写入 | 一棵工作树同一时间只有一个写者；共享的接口、锁文件与集成由一个负责人做 |
| pstack | 写作方法删掉留有余地的说法与未知 | 按 pqw `clear-writing`：保留事实、条件与把握的程度 |
| pstack | 专用流程固定用多路并行或新增阻断 | 按风险选，不给所有任务新增固定的门 |
| pstack、Matt | 直接写宿主的技能目录 | 改 canonical 源，再生成 |
| Matt | `to-spec` 逐项确认、自动发 issue | 已经明确的输入不重复审批；发布要有任务授权 |
| Matt | `to-tickets` 默认先扩后缩 | 0.1.0 之前同一批迁移全部消费者并删掉被取代的实现 |
| Matt | `code-review` 默认只看已提交的差异 | 先说清实际的来源与覆盖，不为了适配方法擅自提交 |
| Matt | spec 与票据 | 它们只组织单次实施的输入；正式的形状、行为契约与验收归实际的拥有者 |

## 宿主钩子

`agents/hooks/hooks.yaml` 存在且列表非空时，编译另产出项目级钩子文件：Claude Code 的
`.claude/settings.json`（只有 `hooks` 一段）与 Codex 的 `.codex/hooks.json`；`--host` 只出所选那端。
两端文件按各自宿主的声明生成，内容不必相同：没有声明给某个宿主时，不产出那个宿主的文件。
每条声明有 `id`、`events`（认 `Stop`、`SubagentStop`、`SessionStart`）、`command`（shell 形式）、`timeout`（正整数秒），
可选 `hosts`（`claude-code`、`codex`、`cursor`；省略为全部）只把这条给所列宿主，`SessionStart` 只为 Claude Code 生成，
`Stop` 与 `SubagentStop` 不带 matcher，对所有子代理生效，
可选 `session_sources`（`startup`、`resume`、`clear`、`compact`、`fork`，只收窄 `SessionStart`，生成为 `|` 连起来的 matcher）。
未知事件或字段、空命令、非正整数超时、重复 id 都报错并带出那条的 id。输出确定（键排序、两空格缩进、末尾换行），
`--check` 逐字节比对。没有 `hooks/` 或列表为空时不产出钩子文件，其余产物不变。
生成不等于宿主已加载或已信任这条钩子；声明的含义与怎么关见 [agents/hooks](../agents/hooks/README.md)。

## 根软链接

先生成完整 all 产物，再在允许接入的产品根运行：

```sh
uv run --locked python .meta_harness/tooling/src/link_agents.py --project-root .
uv run --locked python .meta_harness/tooling/src/link_agents.py --project-root . --check
```

工具预检所选目标后，创建 `.claude`、`.agents`、`.codex`、`.cursor` 到 `.meta_harness/` 内同名目录的
相对链接。选择 Cursor 时，`.cursor` 的目标必须已经含有编译出的 `Dockerfile`、`environment.json` 和 `install.sh`。
正确链接可重复运行，其他链接或实体路径一律拒绝，不删除、不搬迁、不覆盖。
工具不迁移既存内容；目标根若有实体目录，须按相应任务授权先处理，再创建链接。
创建、冲突保护、只读核对和整体目录移动后的相对链接有效性由工具测试覆盖。

`agents/cloud/<host>/` 存在且本次选中该宿主时，编译把其中的运行时文件复制到该宿主的 package 根。现在只有 `cursor/`，输出是 `.cursor/`。`README.md` 留在源目录，不进入投影。
`claude-code` 例外：它的目录只有 `setup.sh` 和 `session-start.sh`，两者都必须可执行。编译检查它们，不产生投影，因为 Claude Code 从云端环境设置读取 setup 脚本。
没有 `cloud/`，或选中的宿主没有自己的目录时，不产生这三份文件。平铺在 `cloud/` 根上的运行时文件会被拒绝。`install.sh` 必须可执行。`environment.json` 的 `build.dockerfile` 必须是 `Dockerfile`，
`install` 必须是非空字符串。这三份需要提交：Cursor 在安装脚本之前从检出读取它们。
skills、agents 和 hooks 仍由 `.meta_harness/.gitignore` 排除，检出后重新编译。

## 常驻卡片

pqw-skills 发行一份[常驻卡片](../agents/vendor/pqw-skills/skills/single-session-dev-flow/resident-card.md)，项目把它分隔线以下的部分原样放进每个会话第一刻就读的入口文件。本仓库放在根 `AGENTS.md` 的受管段落里，段落由 `<!-- BEGIN:pqw-skills-resident-card -->` 与 `<!-- END:pqw-skills-resident-card -->` 两行框住，位置由根入口自己定。

```sh
uv run --locked python .meta_harness/tooling/src/resident_card.py --project-root .
uv run --locked python .meta_harness/tooling/src/resident_card.py --project-root . --check
```

写入时把两行标记之间换成钉住版本的卡片，标记以外的字节不动；`initialize_agents.py` 在链接之后跑这一步。`--check` 只读，段落与钉住的卡片有一个字不同就失败，`pnpm run check:agents` 的最后一步就是它。升级子模块之后重跑初始化，再提交根 `AGENTS.md` 的变化。标记缺失、重复或次序颠倒，卡片文件没有恰好一行 `---` 或分隔线以下为空，子模块没有初始化，都让两种模式失败且不写文件。持续检查在 `tests/test_resident_card.py`。它不核卡片里的技能名是否存在，那是 pqw-skills 自己的仓库检查。

## Cursor 原生包与项目视图

Cursor 产物根是 `output/.cursor/`，包含 `.cursor-plugin/plugin.json`、skills、hooks.json、plugin-hooks.json 和 runtime。
manifest 明确组件路径，不把维护源目录当作插件。第三方 pstack/Matt 的宿主来源归执行仓库 `docs/engineering/skills.md`，本工具不安装或复制其正文。

CLI 和 IDE 可用项目 `.cursor` 相对视图，也可安装物理原生包。CLI 的插件方式示例为 `agent --plugin-dir /absolute/package/.cursor`。
外部安装先在新的物理目录生成，只搬运 `.cursor/` 包；不使用指向维护源的链接。安装位置变化不改变包内相对引用。
同一宿主不得同时启用项目视图和同一插件包，否则 hooks 可能重复。本工具不管理宿主已安装插件清单。

从完整仓库的 clean clone 初始化 CLI、IDE 或 Cloud 项目视图，在首个模型会话前执行：

```sh
uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
uv run --locked python .meta_harness/tooling/src/initialize_agents.py --project-root . --host cursor
uv run --locked python .meta_harness/tooling/src/initialize_agents.py --project-root . --host cursor --check
```

需要全部宿主时省略 `--host cursor`。Python/PyYAML 只用于生成，native bridge 运行需要 Node、Git 和 POSIX shell。
Cloud 初始化由环境 setup 明确执行，不能等 SessionStart。命令 hooks 有 stop 与 subagentStop。
Cloud 早期只读环境不会运行 hooks。本次未运行真实 IDE/Cloud 会话，clean clone 子进程检查只支持初始化与资源可达。
初始化重复调用保持内容不变，存在不同字节/权限或真实项目目录时失败；更新仍须新 staging 比较后按任务授权更换生成物。

## Cursor hook 协议

共享 hooks.yaml 拥有事件、measurement command 与 timeout。hooks/cursor.yaml 只拥有协议版本、正整数 loop_limit 及 timeout_grace。
生成的 bridge 从自身安装路径读取声明，按原命令执行测量，不重写测量、去重或政策规则。
measurement timeout 仍由共享声明拥有；native timeout 增加配置的 timeout_grace，给 bridge 留出输出超时诊断的时间。
原 Stop/SubagentStop 映射为 stop/subagentStop；Cursor stdout 只输出 JSON 对象，合法的新 block/reason 映射为 followup_message。

bridge 要求 completed、非负整数 loop_count，SubagentStop 还要求非空的 subagent_type。
loop_count 大于零或 stop_hook_active 已真时不再测量。native loop_limit 是宿主第二道限制；项目原测量 fingerprint 继续去重。
错误和中断不声明测量通过。缺失身份/count、无效 JSON、工具异常、stderr、timeout、systemMessage 均产生结构化 stderr 诊断，stdout 无 followup。
诊断是否在具体宿主界面可见须实际验证；stderr 记录本身不等于用户已读。

workspace_roots 或 event cwd 必须唯一确定真实目标。多根且 cwd 不能唯一消歧时不选第一项；cwd 与单根冲突同样拒绝。
进程 cwd 和转交测量的 payload.cwd 都归一到目标。插件根只定位资源，不作为被测仓库。
目标须有兼容 tools/repo-toolchain/stop-hook 及 TypeScript 依赖，或 Git common 主检出有该组合；两者都没有则诊断并退出。
这是 OMNE 仓库/worktree 支持，不承诺在任意仓库安装即具备测量能力。Git common fallback 的配置仍归实际工具，不能误报为目标配置。
项目 hooks.json 的命令通过 Git 根定位 `.cursor`，支持从子目录进入，忽略继承的插件环境变量。
manifest 指向 plugin-hooks.json；原生插件命令使用准确的 `${CURSOR_PLUGIN_ROOT}` 占位符，由宿主替换为本插件安装根。
两份配置共享事件、限制和 runtime，不能用 shell 默认值表达式替代原生占位符；CLI 2026.08.04-aaa8809 只替换准确的占位符文本。

持续检查在 tests/test_cursor.py、test_compile_agents.py、test_compile_hooks.py、test_compile_cloud.py、test_link_agents.py、test_stale_skills.py 与 test_readme_commands.py。
它们覆盖文件、资源、路径、严格字段和子进程协议；真实宿主事件仍须在宿主里独立验收。
