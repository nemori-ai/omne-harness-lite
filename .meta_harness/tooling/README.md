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

`realization_nodes.py` 核 `design/realization/{apps,packages}/<node>/` 每个节点的形状；
`.templates/` 不是主题，不参与对账：

```sh
python tooling/src/realization_nodes.py --root design                # 对账
python tooling/src/realization_nodes.py --root design --stale warn   # 交付面 rev 落后只列出，不判失败
```

节点该长什么样，权威正文在 [realization/README.md](../design/realization/README.md) 与
[AGENTS.md](../design/realization/AGENTS.md)；这里只记工具自己查到哪：

- **kind 与身份**：README 的 `- kind：` 只能是 `provider` 或 `assembly`，`bindings.yaml` 的
  `node` 等于目录名、`kind` 与 README 一致；assembly 必须有 `architecture.md`，provider 不得有。
- **源码位置**：`- 源码位置：` 里的 `apps/<name>` 或 `packages/<name>`，最后一段必须与目录同名，
  且 `apps`/`packages` 与节点所在目录一致；整行写「尚未建包」且不含路径时放行。
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
