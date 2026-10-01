# Meta Harness 工具

本目录只依赖工作区内部路径执行确定性生成与设计检查，不从承载产品仓库发现
`docs/`、`spec/` 或配置。将完整 `.meta_harness/` 复制到另一目录后，显式传入其中的
`design/` 仍可运行；产品消费者观测通过重基清单传入，不因邻近源码而升级采用状态。

## 设计信息包检查

`check_design.py` 检查新设计谱系的身份、资源、引用、冻结和形式任务登记：

```sh
python tooling/src/check_design.py --root design --formal registered
python tooling/src/check_design.py --root design --formal skip
python tooling/src/check_design.py --root design --gate release --formal run
```

三个形式任务模式含义不同：`registered` 只确认任务与工件已登记；`skip` 记录本次明确
跳过执行；`run` 才调用清单中的 runner，并传播缺工具、超时和非零退出。前两种模式
都不能作为 TLC、Alloy 或其他模型已通过的证据。`--previous-frozen PATH` 可核对同一
baseline 先前冻结登记未被改变或移除，也没有向已冻结版本目录追加资源；新增规范工件
必须进入新版本。

`--gate internal` 检查仍在编辑的信息树内部一致，允许保留可核对的 blocked relation 和
`unknown` consumer；`--gate release` 作为切换/冻结门，对任一 blocked relation、unknown
consumer 或缺少 release evidence 的关系失败。不能通过暂时删掉 catalog dependency 来绕过
尚未释放的重基关系。

设计根必须包含五份清单；路径均相对设计根，禁止绝对路径、`..` 和符号链接逃逸：

| 文件                | 持续含义与关键字段                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `baseline.json`     | `format=1`、稳定 `baseline_id`、输入 `snapshot_id`、Schema `schema_namespace`、旧谱系清单及显式 `version_policy` |
| `catalog.json`      | 当前谱系的精确三元组、family/topic、状态、版本资源、接受决定和条款级依赖                                         |
| `lineage.json`      | 旧→新条款关系、退出身份、`freeze_gate` 与实际产品消费者的旧/新谱系观察                                           |
| `frozen.json`       | 已接受 catalog 资源的 SHA-256；发布后只追加，新内容必须新版本                                                    |
| `formal-tasks.json` | 模型种类、已登记工件、可注入 argv runner 和超时；结果不写回规范                                                  |

catalog 的稳定键是 `(baseline_id, contract_id, version)`。本次重基的 baseline 使用
`{"kind":"initial-uniform","version":1}`，后续稳定演化切换为 `{"kind":"evolving"}` 后可
新增 v2，不能改写 v1。资源位置为 `spec/{family}/{topic}/v{version}/...`；同一坐标重复登记直接
拒绝，即使两个文件内容不同。`accepted` 条目必须链接实际 `decisions/` 文件，全部版本
资源必须冻结；候选状态和接受状态不能靠文件存在相互提升。

依赖必须带精确坐标和实际消费条款。当前谱系坐标须在 catalog 中存在；旧谱系坐标须
引用一条精确重基关系。关系声明源/目标 clauses、逐条 mapping、实际 consumers、release
evidence 及 freeze gate。accepted 旧依赖只可映到 accepted 精确目标，且消费 clauses 必须
完全落在关系覆盖内。`freeze_gate.blocked=true` 会阻断采用，退出身份不能作为当前
依赖复活；先把其被消费条款映射到当前活体能力，再让 catalog 依赖当前坐标。产品包仍
消费旧 Schema 时，以 `consumer_observations.status=observed-legacy` 保存事实，不能标为
`verified-current`。每项 consumer evidence 固定 source commit/path/hash，并指向设计树内
可按 hash 核对的 snapshot；`verified-current` 坐标必须真实存在，`unknown` 不能通过 release gate。

accepted catalog 条目引用 decision topic 内的 `acceptance.json`。该声明必须链接同 topic 的
决定正文，并以 exact coordinate 和非空 `scope_clauses` 声明接受范围；决定文件存在本身
不能使契约成为 accepted。

每个 catalog Schema 的 `$id` 必须为
`{schema_namespace}/{baseline_id}/spec/{family}/{topic}/v{version}/{resource}`。检查器解析所有
`$ref`/`$dynamicRef` 的资源和 JSON Pointer；旧命名空间、缺资源与缺 pointer 都非零退出。
它也核对设计根内 Markdown 文件和锚点，因此 requirements 与 decision 信息包的接受链
可在独立副本中检查。当前实现不执行完整 JSON Schema 实例校验；迁移纵线仍须为具体
Schema 提供 Draft 2020-12 结构和正反实例验证。

`rebase_resources.py` 只复制显式列入清单且源 SHA-256 匹配的资源：

```sh
python tooling/src/rebase_resources.py \
  --source-root /path/to/source-checkout \
  --design-root design \
  --manifest /path/to/rebase-files.json
```

清单格式为 `{"format":1,"files":[...]}`；每项给出 `source`、`target`、
`source_sha256` 和 `replacements`。每个替换必须写出精确 `from`、`to` 与预期 `count`，
数量不符、源漂移、目标碰撞时在写入前整体拒绝。无替换的二进制工件逐字节复制；带替换
的文件必须是 UTF-8。`--check` 只读核对全部目标与当前渲染一致。这个工具不决定条款
等价性、不自动改版本字符串；条款筛选和重基关系由内容拥有者给出，最终由设计检查器
核对精确身份、依赖和引用。

测试使用含 core-work 跨身份 `$ref`、command-input 退出身份重基、多个 RunDriver cfg、
requirements/decision 链及旧产品 Schema 消费观察的小型设计树。它同时覆盖 namespace
混用、同坐标碰撞、冻结漂移、阻断 gate、断链、runner 错误传播及复制到仓库外运行。

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

- **rev 的权威是各 topic `README.md` front-matter 的 `revision`。**`design.md` 抬头与 `changelog.md`
  最新一节若写了 rev，必须与它相等；没写不算错。产品区两张手写的 rev 表——`product/README.md` 的 topic 一览与
  `product/architecture-core.md` 的清单——每一行同样必须与它相等。
- `ubiquitous_language/conflicts.md` 里的 rev **不查**：那是记下冲突时看到的那一版，是一条观察的时间戳，不是对齐凭据。
- 词条「出处」、条目「依据」、待裁「牵涉」读的是[同一条写法](../design/ubiquitous_language/conventions.md#rev-怎么写怎么读)：
  指向产品正文的链接后面跟着它那个 topic 的 `（rev N）`，同一个 topic 连着的几条链接可以共用后面那一个；
  一个括号里并列几个 rev 的，按前面 topic 出现的次序配，个数配不上就报错。
- 总表比对时**忽略生成时间那一行**，所以隔天重跑不会因为日期而判过期。
- `--stale report` 供本地迭代看待复核队列，**不是通过的证据**。
- 链接与锚点是否存在由 `check_design.py` 统一查，本工具不重复；
  它也**不判断任何条目的内容对不对**，更查不出产品正文里新冒出来、却没人立词条的对象。

测试用一棵含一个 topic、一卷四个词条（含一个变体）、三条对象条目与一项待裁的小型设计树，覆盖：
一致时通过且总表可往返、只改生成时间不判过期、对象词条缺条目与条目缺对象词条、条目缺词条或缺必填字段、
rev 落后（含 topic 内三处 rev 不一致）及其 report 模式、依据缺 rev 或指向非产品正文、
形态缺失/非法/变体的父无效、未定词条须同时出现在 pending 与 conflicts、索引与分卷不一致、待裁缺 owner。

## 实现映射节点对账

`realization_nodes.py` 核 `design/realization/apps/<node>/` 与 `design/realization/packages/<group>/<node>/` 每个节点的形状
（`packages/` 是[两层布局](../design/realization/README.md#packages-的两层布局)：第一层没有 `README.md` 的目录是 group，节点在它下面一层）；
`.templates/` 不是主题，不参与对账：

```sh
python tooling/src/realization_nodes.py --root design                # 对账
python tooling/src/realization_nodes.py --root design --stale warn   # 交付面 rev 落后只列出，不判失败
```

节点该长什么样，权威正文在 [realization/README.md](../design/realization/README.md) 与
[AGENTS.md](../design/realization/AGENTS.md)；这里只记工具自己查到哪：

- **kind 与身份**：README 的 `- kind：` 只能是 `provider` 或 `assembly`，`bindings.yaml` 的
  `node` 等于目录名、`kind` 与 README 一致；assembly 必须有 `architecture.md`，provider 不得有。
- **源码位置**：`- 源码位置：` 里的 `apps/<node>` 或 `packages/<group>/<node>`，必须与节点在 `realization/` 下的路径逐字相同；
  整行写「尚未建包」且不含路径时放行。
- **交付面 rev**：assembly 的 `- 交付面：` 行与 `architecture.md` 的「交付面与非目标」一节，
  指向 `product/PF-*/README.md` 的链接后面必须跟它那个 topic 的「（rev N）」，
  读法与[领域对象条目的依据](../design/ubiquitous_language/conventions.md#rev-怎么写怎么读)完全相同（正则就复用那一份）。
  漂移默认判失败，`--stale warn`（或 `report`，同义）降为只列出——**不是通过的证据**。
- **技术栈采用**：该节表里「状态」只有 `已采用` 与 `candidate`；前者的「依据」必须链到存在的
  `record/decisions/<topic>/decision.md`，后者必须链到存在的 `record/proposals/<topic>/` 下的文件。
- **契约坐标**：表头叫「契约坐标」或「精确形状归谁」的列，反引号里的 `contract_id/vN` 必须在
  `registry/catalog.json` 里存在（只比 contract_id 与 version，节点不写 baseline）；契约未立写「待立：…」放行。
- **draft 不得登记绑定**：交付面 PF 的 front-matter `status` 是 `draft` 时，`bindings.yaml` 的 `bindings` 必须为空。
- **相对链接**：节点内 markdown 的本地相对链接要能解析（带文件与行号）。锚点、以及设计根内其他文件的链接，
  仍由 `check_design.py` 统一查，本工具不重复。

它**不判断任何节点的内容对不对**：查不出一条绑定的证据是否真能支持那条条款、
`assumptions` 写得对不对、某条应用间的边是否只写了一侧；表列改名之后对应的检查会静默跳过。
`bindings.yaml` 只读 `node`、`kind`、`bindings` 三个顶层键，其余字段无人校验。
工具只读 `--root` 指向的设计根，不从承载仓库发现 `apps/` 或 `packages/` 源码。

测试用一棵含一个产品 topic、一个 catalog、一个 assembly 与一个 provider 节点的小型设计树，
逐条覆盖每条规则的通过与失败，外加空目录通过、缺 `realization/`、缺 catalog、YAML 读不出来。

## 故事卡对账

`stories.py` 核 `design/product/PF-*/stories.md` 里每张故事卡的形状，以及卡与验收场景的对应；
`.templates/` 与 `archive/` 不是 topic，不参与对账：

```sh
python tooling/src/stories.py --root design
```

卡该长什么样、场景怎么编号，权威正文在[故事卡的格式契约](../design/product/conventions.md)；这里只记工具自己查到哪：

- **卡号**：标题写成 `### ST-<三位>-<两位> · 一句话`；卡号全区唯一，中间三位等于所在 topic 的编号。
  以 `ST-` 开头却不合写法的标题会被点名，不会被悄悄当成普通小节。
- **字段**：价值、覆盖场景、演示、不含、前置、就绪六个都要有且不为空；同一个字段不得写两次。
- **覆盖场景**：至少一条链接，链接文字是场景编号，目标是某个 topic 的 `acceptance.md`；
  那份文件里要有一行第一格是这个编号（加粗、反引号都认），且这个编号在那份文件里不重复。
- **一条场景至多属于一张卡**，按（topic，编号）算，跨 topic 引用也算在内；同一张卡里重复链接同一条不算。
- **前置**：字段里出现的卡号都要存在、不是自己；全部卡的前置关系不成环。
- **演示**：至少一个缩进的编号步骤，每步都有「→」隔开的两半。
- **就绪**：以「是」开头，或以「否」开头并写着缺什么。

围栏代码块里的卡是示例，不参与对账。有 `stories.md` 的 topic 里**还不属于任何卡的带编号场景**以 `NOTE:` 列出，不判失败。

它**不判断卡切得好不好**：查不出一张卡是不是只证明一件事、演示照着做不做得出来、顺序排得对不对；
链接的锚点由 `check_design.py` 统一查。没有编号的场景行它看不见——一个 topic 的场景都没编号时，「还不属于任何卡」那一条不会出现。

测试用一棵含两个 topic 的小型设计树，逐条覆盖每条规则的通过与失败，外加没有 `stories.md`、缺 `product/`、跨 topic 的引用与前置。

## 设计评审报告

`design_review.py` 对契约做确定性的机械核对，并给出 catalog 依赖图的结构读数，供派发者附进设计评审简报：
评审者不再用眼睛重做这些核对，只对报出的每一条判断成立与否。

```sh
python tooling/src/design_review.py --root design                                  # 全部坐标
python tooling/src/design_review.py --root design --contract data.messages/v8 --format json
python tooling/src/design_review.py --root design --include-frozen                 # 已接受契约的产品依据 rev 也看
```

**它不是门禁**：报出问题时退出码仍为 0，只有用法错误（如 `--contract` 的坐标不在 catalog 里）、
清单或配置读不了才非零。它只读设计根，不写任何文件，也不接进 `check_design.py` 的判定。
给了 `--contract` 时，逐份核对项只看这些坐标，登记类核对项只看涉及它们的 catalog 依赖与 covers 条目，依赖图始终算全图。

输出四节，次序固定：「成立的问题」「未能判定」「依赖图」「未覆盖」。每条一行
`[<核对项>] <相对设计根的路径>:<行号>  <坐标>  <说明>`。**写法认不准的一律归「未能判定」并写明原因，不猜。**

| 核对项 | 判据 |
|---|---|
| `bare-clause-ref` | 「本契约定义了哪些条款」= 代码块外以 `S-n` 开头的标题（现有契约全部这样写；一条也没有的契约归未能判定）。正文里本契约没有的 `S-n`，若同一句（句号、问号、叹号之间，段落可折行；表格一行算一句）里写出了别的契约——契约身份或 catalog 里的 topic 名、`topic/vN`、指向别的契约正文的链接——就不报；`#S-n` 前文同一段写出过别的契约的也不报。紧跟在简称后的（`EC S-34`、`runtime7 S-67/S-76`）、句中有这类简称的、所在小节标题写的是别的契约的，归未能判定；写着「本契约」或链接到本文件锚点的照报 |
| `analysis-id-in-contract` | 正文里出现 `INV-n`、`SAF-n`、`LIV-n`；代码块与引用块里的归未能判定 |
| `stale-product-rev` | 「产品依据」那一句（到第一个句号为止，去掉全角与半角括号里的补充说明）里的 `PF-nnn rev k` 与该 topic README front-matter 的 `revision` 不同。默认只看 `candidate`；`--include-frozen` 全看，冻结了的在说明里注明。找不到「产品依据」或写的是 rev 区间的归未能判定 |
| `dependency-clause-missing` | catalog 依赖消费的 `S-n` 不在目标契约的条款里；目标不在当前 catalog 或认不出条款的归未能判定 |
| `covers-target-missing` | covers 的 `target.clauses` 不在目标契约里；`target` 坐标不在 catalog 里；`requirement.clause` 指的产品文件或小节锚点不存在 |
| `unregistered-file` | 已登记坐标的版本目录里有不在 `resources` 里的文件 |
| `nine-items` | 只判 capability／composition 里有「# \| 写什么」两列定义表（首列是圈号）的契约：从定义表读出要求的项，再核每张「# \| 内容」操作表是否逐项有行、有内容（「无」「不发」算有内容，只写破折号的归未能判定）。没有定义表的契约、首列是圈号却不是这种两列格式的表，归未能判定 |
| `open-failure-set` | 上一项认出的操作表里，定义表写着「失败」的那一格，列举（第一个句号之前）的最后一项恰是「其他／其它（错误、失败……）」「等」「等等」「etc」「…」。最后一项以「其他」开头但不止于此的（如「其他沿原失败集合」）归未能判定。**契约有操作表却没有定义表时，这一项同样没核**，报告在「未能判定」里另列一条说明，不让读者以为核过了 |

依赖图的节点是 catalog 坐标，边是当前谱系的 `dependencies`：强连通分量多于一个节点或有自环的列为环；
不稳定度 `I = 出边数 / (入边数 + 出边数)`，边 `A → B` 上 `I(B) - I(A)` 超过 `unstableDependencyMargin` 的列出；
按 `入 + 出` 取前 `fanTop` 个列出扇入扇出。两个阈值在 [`design-review.config.json`](design-review.config.json)，
代码里不写死，配置缺失或不合法时明确报错退出。

**报出问题不等于契约有错**，没报出也不等于没有这类问题。它不判断：一句话有没有两种读法、同名不同义、
用词是不是统一语言的词条、状态词有没有混用、业务选择对不对、Schema 与正文在语义上是否一致；
也不核带坐标的条款引用在目标契约里是否存在，不解析简称指向哪份契约。这些在输出的「未覆盖」一节原样列出。

测试用现造的小设计树逐项覆盖每个核对项与依赖图每种读数的报与不报（含同一句里先写坐标、段落折行、
外层链接包着指向别处的内层链接、简称串、否定句里的「其他」、阈值恰好相等），配置的各种非法写法，
命令行四节次序与 JSON 形状，以及跑完之后设计树逐文件哈希不变。

## 旧版规格的消费者盘点

`spec_retention.py` 回答一个问题：**每个旧版规格目录还被谁消费，删掉它之前要先迁走什么。**
依据是[规格只留最新一版](../design/record/decisions/spec-single-revision/README.md)的过渡规矩：旧版目录是一笔要还的债，消费者迁完才删。

```sh
python tooling/src/spec_retention.py --root design                         # 全部契约
python tooling/src/spec_retention.py --root design --contract data.messages --format json
```

**它只读、只报告，不是门禁**：数到多少引用退出码都是 0，只有清单读不了或 `--contract` 的身份不在 catalog 里才非零；不写任何文件，也不接进 `check_design.py`。

对每份契约，数字最大的版本算「最新」，其余都算旧版。每个旧版目录各数：

| 列 | 数的是什么 |
|---|---|
| 最新版依赖它 / 旧版依赖它 | catalog 里别的契约的 `dependencies` 指向这个坐标的条数，按发起方是不是它自己契约的最新版分开 |
| 覆盖登记 | covers 里 `target` 是这个坐标的条目数 |
| 形式任务 | formal-tasks 里工件路径落在这个版本目录下的任务数 |
| 绑定行 | 各实现节点 `bindings.yaml` 里 `clause` 写着这个坐标的行数 |
| 链接（三列） | Markdown 里指进这个版本目录的链接数，按出处分：各契约最新版的规格文件、别的规格文件、其余设计文档 |

行按「登记里的引用」（前五列之和）从少到多排，最容易迁走的在前；五列与三列链接全为零的列为「可以先删」。
另列出**最新版里没有任何形式任务引用的模型文件**（`.tla`、`.als`）——形式化的正版要持续维护，模型没有任务就没有人在跑它。

**不能声称**：数到零就可以删——它不数正文里没做成链接的路径与简称（`RT12`、`OG2`）、`packages/`／`apps/`／`tools/` 里按版本路径读规格的代码与随包的 Schema 副本、
设计根以外的 Markdown；引用可以直接改指最新版——旧条款与最新版同号条款是否等价它不判；数字最大的就是唯一现行的一条线——并列的两条线会被算成一新一旧。
这些在输出末尾「没有数的」一节原样列出。

## Agent 编译

本轮实现从一个 `agents/` 源根按宿主策略编译四处目录，并提供独立的相对软链接工具。
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
身份不匹配均拒绝。本轮不实现 cc-master 的 stub、partial overlay 或完整发布事务。

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
当前承载 worktree 的旧实体已单独留档退役，并实际完成三个链接，见
[接入记录](../agents/evaluation/host-entry-retirement/README.md)。工具本身仍不迁移既存内容；
其他目标根若有实体目录，须按相应任务授权先处理来源与退役。创建、冲突保护、只读核对和
整体目录移动后的相对链接有效性另有临时夹具验证。

三个链接不是跨文件事务；并发创建或磁盘故障可能留下部分新链接，错误不会伪报成功。
重新运行或 `--check` 可检查剩余工作；正式安装更新器仍未实现。

## 复用边界

角色编译复用工作区内部 `agents/skills/design-subagents/canonical/scripts/render_pair.py`，
通过其 `render(source)` 接口取得原生内容；支持记录随该 skill 完整保留，生成算法不另写副本。
默认相对本工具所属 `.meta_harness` 定位；`--role-renderer PATH` 可显式提供同接口的 Python 模块。
该参数是可信的本地编译器代码，不是供不可信输入动态加载的插件接口。

只有存在角色源时才加载角色生成器。整个工作区移到不含原仓库的目录后，生成与只读检查
通过独立夹具验证；代码和运行资源已闭合，但 Python 依赖环境仍需明确准备，并未新增安装更新器。

## 验收边界

- 无 slot 的 skill 文本及二进制资源在两端逐字节一致，局部 slot 只改变所选宿主的声明片段。
- 临时角色夹具同时生成两端原生配置，保留共享正文、引号、Unicode 与权限字段。
- 全部源预检、输出冲突、重名、路径逃逸与只读检查具有可重复测试。
- 可执行资源可以直接执行；模式漂移被只读检查发现。
- 相对链接可重入、可随项目一起搬动；既有根目录不会被链接工具替换。
- 产物留在本工作区；当前 worktree 根入口已接入，产品需求、设计和 spec 正文没有整体迁移。

这些是静态生成与文件操作证据，不证明宿主已发现配置、权限已生效或模型行为符合预期。

## 设计候选整合

`merge_design_candidates.py` 将已审阅的累积候选快照合成同一套五清单。它固定本轮
`omne-harness-lite-design-2026-09-15`、Schema namespace、legacy baseline、统一 v1、
23 个目标坐标（包括账号身份与注册组合）以及仅允许从声明的 legacy baseline 退役的
`capability.session-run` 和 `proposal.outbound-stream`；最终 `snapshot_id` 必须由调用者
在锁定修订后显式传入，工具不会写临时 hash。

```sh
python tooling/src/merge_design_candidates.py \
  --design-root design \
  --snapshot-id <final-locked-revision> \
  --input F=/path/to/f/candidate-design \
  --input S=/path/to/s/candidate-design \
  --replacements /path/to/replacements.json \
  --output /path/to/candidate-output
```

相同 coordinate、relation id、退役身份、consumer id 或 task id 且内容逐字等价时去重；内容不同必须在
replacement plan 中按键选择来源。这个机制用于表达 L 对 S lifecycle placeholder 的替换等
真实语义收敛，禁止把累积快照机械 append。退役身份保留 `baseline_id`、`contract_id` 和 `reason`；
同一身份的不同 reason 需要 `retired_identities` 替换选择。输出前整体检查重复键/资源路径、资源与形式工件
存在性、跨 baseline、固定 allowlist、退役身份和替换计划。任何 `accepted` 坐标或 frozen 文件
还必须由 `--adoption-authorization` 以 coordinate→接受记录路径/hash 和资源→hash 精确授权；
工具只据此把对应 candidate 提升为 accepted 并生成完整冻结集合。决定文件存在、旧接受或旧冻结
hash 都不能自行提升新 baseline 状态。既存输出内容不同时拒绝覆盖，`--check` 只读核对确定性结果。

`normalize_formal_commands.py` 只为 TLC 2.19 命令生成审阅候选：从 argv 删除精确 token
`-noGenerateSpecTE`，保留 task id、artifacts、coverage、exclusions、timeout 和所有其他字段，
并另外输出逐 task 的 before/after diff。候选仍须由任务 owner 核对并在最终 manifest 上实际执行；
生成成功不表示 TLC 通过，也不修改历史 delta 原件。
