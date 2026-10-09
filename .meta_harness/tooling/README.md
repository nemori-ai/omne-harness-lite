# 设计与 Agent 工具入口

本目录维护现行设计导航、领域对象与故事卡对账，以及 skills／roles 的宿主生成和接入。模块接口、薄规格及验证资源由实际包／应用拥有，工具不建立另一份中央契约或实现映射。

## 现行源检查

`check_sources.py` 检查现行设计的本地文件、Markdown 锚点和显式模块拥有者：

```sh
python tooling/src/check_sources.py --root design
python tooling/src/check_sources.py --root design --source-root /explicit/execution-checkout
```

`--source-root` 是明确的执行检出，不从安装位置或父目录猜测。模块链接只允许实际 workspace 的 packages／apps 成员，目标与 package.json 必须在该检出内；排除成员、非法声明、缺文件、错锚点及越界软链接非零。没有 source-root 时不放行外部模块路径。

过程材料不能作为现行源，别名不能绕过归属。spec、realization、registry 三个旧根不得重新出现，空目录、普通文件或悬空软链接同样拒绝。其他本地链接只能指向有效设计、Agent／research 源或设计工作区根入口。外部 URL 不在本工具中抓取或核实。

该工具不判断条款等价性、采用状态、实现符合性或模型覆盖。公开 Schema 身份、规范输入及形式模型的正负控由真实拥有者维护并执行；单次原始输出归执行工作树 tmp。根 `make design-check` 组合本检查、领域对象及故事卡对账，不隐式执行形式模型。

## 领域对象对账

`domain_objects.py` 对账三家之间的对应关系——统一语言词条、领域对象条目、产品 topic——
并生成派生总表 `design/views/domain-object-map.md`：

```sh
python tooling/src/domain_objects.py --root design                  # 对账，并核对总表是不是最新
python tooling/src/domain_objects.py --root design --write          # 重新生成总表
python tooling/src/domain_objects.py --root design --stale report   # rev 落后只列出，不判失败
```

它查什么、为什么查，权威正文在 [domain_objects/conventions.md](../design/domain_objects/conventions.md#对账)；
被点名之后怎么逐条复核，归 `ubiquitous-language` 与 `domain-objects` 两份 skill。这里只记工具自己的边界：

- **rev 的权威是各 topic `README.md` front-matter 的 `revision`。**`design.md` 抬头
  若写了 rev，必须与它相等；没写不算错。产品区两张手写的 rev 表——`product/README.md` 的 topic 一览与
  `product/architecture-core.md` 的清单——每一行同样必须与它相等。
- `ubiquitous_language/conflicts.md` 里的 rev **不查**：那是记下冲突时看到的那一版，是一条观察的时间戳，不是对齐凭据。
- 词条「出处」、条目「依据」、待裁「牵涉」读的是[同一条写法](../design/ubiquitous_language/conventions.md#rev-怎么写怎么读)：
  指向产品正文的链接后面跟着它那个 topic 的 `（rev N）`，同一个 topic 连着的几条链接可以共用后面那一个；
  一个括号里并列几个 rev 的，按前面 topic 出现的次序配，个数配不上就报错。
- 总表比对时**忽略生成时间那一行**，所以隔天重跑不会因为日期而判过期。
- `--stale report` 供本地迭代看待复核队列，**不是通过的证据**。
- 链接与锚点是否存在由 `check_sources.py` 统一查，本工具不重复；
  它也**不判断任何条目的内容对不对**，更查不出产品正文里新冒出来、却没人立词条的对象。

测试用一棵含一个 topic、一卷四个词条（含一个变体）、三条对象条目与一项待裁的小型设计树，覆盖：
一致时通过且总表可往返、只改生成时间不判过期、对象词条缺条目与条目缺对象词条、条目缺词条或缺必填字段、
rev 落后（含 topic 内三处 rev 不一致）及其 report 模式、依据缺 rev 或指向非产品正文、
形态缺失/非法/变体的父无效、未定词条须同时出现在 pending 与 conflicts、索引与分卷不一致、待裁缺 owner。

## 故事卡对账

`stories.py` 核 `design/product/PF-*/stories.md` 里每张故事卡的形状，以及卡与验收场景的对应；
`.templates/` 与 `archive/` 不是 topic，不参与对账：

```sh
python tooling/src/stories.py --root design
```

卡该长什么样、场景怎么编号，权威正文在[故事卡的格式契约](../design/product/conventions.md)；这里只记工具自己查到哪：

- **卡号**：标题写成 `### ST-<三位>-<两位> · 一句话`；卡号全区唯一，中间三位等于所在 topic 的编号。
  以 `ST-` 开头却不合写法的标题会被点名，不会被悄悄当成普通小节。
- **已发到**：每份 `stories.md` 有且只有一行 `**已发到**：ST-<三位>-<两位>`（冒号全角半角都认），
  它的中间三位等于所在 topic 的编号，文件里每张卡的序号都不超过它。**只有这一行、一张卡都没有的文件是合法的**——卡都交付完了。
- **字段**：价值、覆盖场景、演示、不含、前置、就绪六个都要有且不为空；同一个字段不得写两次。
- **覆盖场景**：至少一条链接，链接文字是场景编号，目标是某个 topic 的 `acceptance.md`；
  那份文件里要有一行第一格是这个编号（加粗、反引号都认），且这个编号在那份文件里不重复。
- **一条场景至多属于一张卡**，按（topic，编号）算，跨 topic 引用也算在内；同一张卡里重复链接同一条不算。
- **前置**：字段里出现的卡号都要存在、不是自己；全部卡的前置关系不成环。
- **演示**：至少一个缩进的编号步骤，每步都有「→」隔开的两半。
- **就绪**：以「是」开头，或以「否」开头并写着缺什么。

围栏代码块里的卡与「已发到」是示例，不参与对账。有 `stories.md` 的 topic（队列空了的也算）里**还不属于任何卡的带编号场景**以 `NOTE:` 列出，不判失败：
它们要么已经交付、卡退场了，要么还没切到；两者怎么分，要看执行仓库里有没有验收覆盖它，由那边的检查给出。

它**不判断卡切得好不好**：查不出一张卡是不是只证明一件事、演示照着做不做得出来、顺序排得对不对；
它只读眼前这一版，**看不到「已发到」有没有被改小、删卡的提交带没带 trailer**——那由执行仓库对一段提交范围的检查来看。
链接的锚点由 `check_sources.py` 统一查。没有编号的场景行它看不见——一个 topic 的场景都没编号时，「还不属于任何卡」那一条不会出现。

测试用一棵含两个 topic 的小型设计树，逐条覆盖每条规则的通过与失败，外加没有 `stories.md`、缺 `product/`、跨 topic 的引用与前置。

## Agent 编译

生成器从一个 `agents/` 源根按宿主策略编译四处目录，并提供独立的相对软链接工具。
`projection.py` 解析源和适配并产生内存产物，`compile_agents.py` 负责 CLI 与预检写入，
`link_agents.py` 暴露项目入口。没有安装更新器、发布事务或知识图谱依赖。

## 使用

需要 Python 3.12+ 与 PyYAML；运行测试另需 pytest。选择已准备好这些依赖的解释器，
以下命令从明确的 `.meta_harness` 工作区根运行。若执行仓库已提供锁定环境，
可以使用该环境的 `uv run --locked python` / `uv run --locked pytest`，不从父目录猜测环境。

```sh
python tooling/src/compile_agents.py --source agents --output .
python tooling/src/compile_agents.py --source agents --output . --check
PYTHONDONTWRITEBYTECODE=1 pytest -p no:cacheprovider \
  tooling/tests agents/skills/design-subagents/canonical/scripts
```

输出根必须显式指定，正常产物留在 `.meta_harness/`。可用 `--host codex` 或
`--host claude-code` 单独生成，默认 `all`。不同宿主原生目录分别保留在输出根下。
相同内容与权限可重复生成；不同内容或权限的既存文件会使
整个预检失败，不覆盖、不删除。修改源后使用新的暂存目录比较。`--check` 只读检查
应生成文件是否存在且一致；它不把输出目录中的其他文件当成本工具所有，不检查或删除它们。

输出根可包含源目录（如 `.meta_harness/agents`），但具体生成路径不得与源重叠；
输出根不得放在源内。工具拒绝源/目标符号链接和越界输出；所有源与目标冲突先预检。
写入过程中发生磁盘等故障仍可能留下部分新文件，不承诺四个目录跨文件事务；
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

## 宿主钩子

`agents/hooks/hooks.yaml` 存在且列表非空时，编译另产出两端的项目级钩子文件：Claude Code 的
`.claude/settings.json`（只有 `hooks` 一段）与 Codex 的 `.codex/hooks.json`，内容相同；`--host` 只出所选那端。
每条声明有 `id`、`events`（只认 `Stop`、`SubagentStop`）、`command`（shell 形式）、`timeout`（正整数秒），
可选 `subagent_types`（须是 `agents/roles/` 下已有的角色名，只收窄 `SubagentStop`，生成为 `|` 连起来的 matcher）。
未知事件或字段、空命令、非正整数超时、重复 id 都报错并带出那条的 id。输出确定（键排序、两空格缩进、末尾换行），
`--check` 逐字节比对。没有 `hooks/` 或列表为空时不产出这两个文件，其余产物不变。
生成不等于宿主已加载或已信任这条钩子；声明的含义与怎么关见 [agents/hooks](../agents/hooks/README.md)。

## 根软链接

先生成完整 all 产物，再在允许接入的产品根运行：

```sh
python .meta_harness/tooling/src/link_agents.py --project-root .
python .meta_harness/tooling/src/link_agents.py --project-root . --check
```

工具预检三个目标后，创建 `.claude`、`.agents`、`.codex` 到 `.meta_harness/` 内同名目录的
相对链接；正确链接可重复运行，其他链接或实体路径一律拒绝，不删除、不搬迁、不覆盖。
工具不迁移既存内容；目标根若有实体目录，须按相应任务授权先处理，再创建链接。
创建、冲突保护、只读核对和整体目录移动后的相对链接有效性由工具测试覆盖。
