选：乙

评审对象：简报 `scratchpad/inc11/vote-brief.md`、盘点 `tmp/clean-loop/inventory-spec-versions.md`。仓库是 `.worktrees/roles-review-loop`，HEAD f3f66cd5。盘点基于 328b08b2，这个提交是 HEAD 的祖先；两者之间 `spec/`、`registry/`、`tooling/src/` 没有任何 diff，所以盘点数字对当前树仍然适用。

我自己核对过的数字标【自核】，直接取自盘点的标【盘点】，没有出处的判断标【推断】。

---

## 0. 简报本身有两处偏向，先说

1. **对乙多给了一句佐证，对甲没有。** 乙那段写了「与产品 topic 的 revision 同一做法」「本仓库……已有这样一个对账器」；甲那段没写对等的一句，例如「与现行 `expected_schema_id`、spec/README『路径即身份』一致，检查器改动最小」。
   - 而且那句佐证说过头了：现有对账器只核对指向 PF README 的「（rev N）」写法（`realization_nodes.py:268-305`，`domain_objects.py:345-355`），对规格的消费者一行都没覆盖。
   - 乙所需的规格对账器，实际上还得从零建。
2. **「OG 的 v2、v3 是并列两条线」低估了实情。**【自核】catalog 里 OG v1 仍被两个最新版消费：
   - asset-governance/v2 消费 S-22/S-26/S-38；
   - model-profile-directory/v5 消费 S-26。

   OG v3 消费 AI v1、OE v1（17 条）；asset-transfer/v2 消费 OE v1（17 条）和 OG v3（12 条）。所以真正纠缠在一起的是 {OG v1/v2/v3、AI v1/v3、OE v1/v2} 一整簇，不是两条线。

---

## 1. 选择

**选乙。**

我不认为存在明显更好的第三种终态。乙要成立，有五个前提条件，在第 5 问里落成具体批次：

- catalog 的整数 `version` 保留下来，含义改为修订号；
- acceptance.json 里已有的资源哈希改为冻结的判据（原来没人读）；
- 条款号永不复用；
- 新写进 record 的规格链接用钉提交的写法；
- 消费者复核戳按条款收窄。

---

## 2. 选乙的三条最强理由

### 理由一：甲在「只留最新」之下会引发传递性的整树重新发版；乙只需复核一跳

**机制是硬的。** 在甲之下，四个函数合起来把版本号锁进消费者的字节：

- `design_validation.py:106-108` 的 `expected_schema_id` 把 `v{N}` 写进 `$id`；
- `_schemas`（570-604）只在已登记的 `$id` 之间解析 `$ref`；
- `_markdown`（606-666）连冻结文件里的链接也核；
- `_frozen`（668-715）不许冻结文件改任何字节。

于是一个消费者只要在冻结字节里写了「X/vN」，X 发 v{N+1} 并删掉 vN 时，这个消费者自己也必须发新版；它的消费者再跟着发新版，一路传下去。每发一个新版，还要一份新的接受声明（`_acceptance` 550-568 要求每个坐标恰好声明一次）。

**规模【自核】：**

| 被修订的契约 | 最新版冻结字节里写着它旧版路径的 | 最新版之间的依赖，反向传递闭包 | 最新版 Schema 的 `$ref`，反向传递闭包 |
|---|---|---|---|
| identity-values | 43 份最新版里 37 份含字面 `identity-values/v1` | 43 / 44 | 15 / 19 |
| offer-expiry | — | 40 | 15 / 19 |
| content-blocks | — | 32 | 13 |
| asset-model | — | 30 | — |
| tool-definition | — | 27 | — |

**这种代价已经在仓库里出现过。**
- `spec/README.md:160`（D-068）原话：「旧2原字节保留；24外部消费者仍钉2，不自动迁移」。团队是靠「钉旧版」躲开连锁发版的。
- 现在 119 条「最新版→旧版」的依赖边【自核：38 个最新版指向 32 个旧版】就是这样留下来的。
- 「只留最新」恰恰禁止钉旧版，所以在甲之下，每改一份底层 data 契约，等于把大半棵树重新发一遍。

**代码里也是同一条链。**
- `packages/core/model-profile/src/schema.ts:2,4` 导入的是 `content-blocks/schema/v2` 和 `offer-expiry/schema/v1`，因为 MP6 的 Schema 按带版本的 `$id` 引用它们；
- call-accounts 的 `package.json` exports 里有 `./schema/v2`。

在甲之下，每次上游修订都要改这些导入。

**乙为什么只需一跳。**
- 修订一份契约，消费者的字节不变。
- catalog 里 743 条依赖边全部带着所消费的 `clauses`【盘点，自核结构】，对账器可以只点名「消费了这次改动条款」的直接消费者。
- 消费者更新复核戳只是改登记，不升自己的修订号，所以不会继续向上传。

### 理由二：形式化「正版持续维护」在乙下是结构性的；甲所依赖的「随版本拷贝过去」已经失败过

【自核】formal-tasks.json 中 MRR 各版本的任务数：

| v2 | v3 | v4 | v5 | v6 | v7 | v8 | v9 | v10 | v11 | v12 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 6 | 6 | 10 | 10 | 10 | 11 | 6 | 3 | 2 |

- v12/formal 下有 Adaptation、FinalPlan、RecoveryTiming、Settlement、UsageCalibration 等十余个模型。
- 我用 `cmp` 核了 `RecoveryTiming.tla`：v9 与 v12 逐字节相同，但 v12 没有对应任务。

【盘点】还有几组数字：
- 61 个任务检的模型在 v12 里字节相同，但没跟过去；
- 最新版里有 13 个模型没有任何任务；
- 438 个形式文件在各版本之间逐字节重复；
- OG v3 没有 `formal/`，README 写明「沿用 v1 模型」。

【自核】`docs/verification.md:84` 承诺「新增 .tla/.als 却没有任务覆盖时检查失败」，但 `tooling/src` 里没有这项判定（grep `UNCOVERED` 只命中 stories.py），即 C19。

甲的每次修订都要重新拷一遍 `formal/`、重新登记任务路径，而这正是已经漏掉 61 次的那一步。乙下模型只有一个固定路径，任务不需要跟着改；在固定集合上补一条覆盖判定也很简单。

### 理由三：乙与设计链其他各区的既有做法一致，指进来的链接也稳定，包括只许追加的 record

**设计链其余各区早就是「原地改 + 修订号 + 复核戳 + 对账器」。**
- 产品：`PF-001/README.md` 的 front-matter 是 `revision: 25`，配一份 `changelog.md`；
- `realization_nodes.py:48`（REVISION_RE）、139-140（`_stale`），以及 `--stale` 缺省为 fail（460 行）；
- `ubiquitous_language/conventions.md:120-131` 定了「（rev N）」写法；
- `realization/README.md:107,122` 把 `alignment_checked` 和「绑定复核过期……这是上游变动传播到设计的唯一通路」写成规矩，bindings 里有 349 处 `alignment_checked`【自核】。

只有 spec 一区例外。乙把这套做法延伸过来，符合 AGENTS.md「同一概念只有一个权威定义」。

**指向最新版目录的链接【自核】：**

| 来源 | 链接数 | 文件数 |
|---|---|---|
| product | 2385 | 12 |
| realization | 806 | 104 |
| 规格 topic 的 README/verification | 1744 | 79 |
| record | 80 | 19 |

- 在甲之下，每次修订都会弄断指向被修订那份契约的链接。
- record 按 `record/AGENTS.md:12,40` 只追加、不改写，可 `_markdown` 又核 record 里的链接。所以甲之下，每份接受 vN 的决定都会在 v{N+1} 发布时断链。例如 `decisions/session-log-tail-condition-adoption/decision.md:3` 链的是 `session-log/v3/contract.md`。
- 这在甲之下是反复发生的规则冲突；在乙之下，只在迁移那一次断一次，之后只有标题改动会碰断锚点。

**C7 也一样。** 最新版冻结字节里有 3534 个带锚点的产品链接【盘点】。在甲之下，产品改一个标题就得给规格发新版，再引发连锁发版；在乙之下原地修订即可。

---

## 3. 对乙最强的三条反证

### 反证一：一次性改写全部身份，推翻已明文声明的不变量

- `spec/README.md:9-17`「路径即身份……这一层的目录结构不随组织方式调整而变动」，即 C20。
- 要同时改的东西：
  - 52 个规格 Schema 的 `$id`；
  - 包里 36 个带规格 `$id` 的文件【自核】；
  - 1104 个 frozen 键；
  - 122 个任务路径；
  - 74 个引用规格路径或 frozen.json 的 TS 文件【自核】；
  - 指向版本目录的 Markdown 链接：规格版本目录内约 1.59 万、topic 文件 4873、product 6217、realization 2102、record 221【自核】；
  - `realization_nodes.check_coordinates` 的 `contract_id/vN` 格式、`Coordinate.version` 的含义、design_review、merge_design_candidates，以及 test_design_validation 的固件。
- 冻结、catalog、形式任务三类判定都只报第一处错（C18），大批量迭代会非常痛苦。
- record 只许追加，那 221 个链接要么一次性机械改写（需要显式授权），要么改用钉提交的写法；record 和证据里的路径文字会变成悬空文字，D-066 已留下 4599 处这样的先例（C23）。
- 代价落在执行迁移的人和审那份巨型 diff 的人身上。

### 反证二：对账器没建成之前，乙会把「响亮的失败」换成「静默的漂移」

- 在乙之下，`contract#S-n` 永远解析得到，即使 S-n 的含义已经变了。
- 而今天这几处都没人核：
  - `check_bindings`（`realization_nodes.py:406-440`）完全不核条款坐标，即 C9【自核】；
  - catalog 依赖没有复核戳；
  - `provenance.json` 没有任何检查器读；
  - check_design 不核 covers（C13）。
- 所以乙的安全性完全建立在新工具加「条款号永不复用」规则上。只要缺一样，13 个只绑旧版的节点（含 apps/cli、apps/tenancy-host）会静默地看起来像是绑着现行语义。甲至少还会以断链或「unknown coordinate」报错。
- 包的 `$id` 不再带版本、内容却会变，外部消费者无法凭 `$id` 区分修订。不过影响有限：各包自建 Ajv 实例（model-profile `schema.ts:33-43` 注释「Only fixed owned schemas are compiled」），同一进程里不会撞 `$id`；包的 semver 可以承载修订信息。
- 代价落在实现者和消费者身上。

### 反证三：「不可变」从结构保证变成流程保证

- 在乙之下，冻结的含义是「哈希等于已接受修订的哈希」。
- `--previous-frozen` 的只追加保护（`design_validation.py:684-704`）失去意义。
- D-066 明文禁止「通过重算旧坐标 hash 让冲突消失」，乙却把重算哈希变成正常的修订路径。区分正当修订和洗哈希，只能看接受记录是不是由有权的人写的。
- 可以缓解：让 acceptance.json 里已有的 814 个资源哈希【盘点 C15】成为判据，使「字节变了」必须伴随 record 里新增一份接受声明。但签署权仍是人和流程的事。
- 另外两个后果：
  - 正在起草的修订不能和已接受的正文同树并存（现有 MRR `v-next/` 有 15 个文件），起草要挪到分支或 tmp；
  - D-023 到 D-099 这 13 份决定都要被一份新决定取代（C22）。
- 代价落在负责人和评审者身上。

---

## 4. 甲最致命的一条

**传递性的整树重新发版**，见第 2 问理由一。

它由 `expected_schema_id`、`_schemas`、`_frozen`、`_markdown` 四个函数在结构上强制，不是写法习惯：

- 改一次 identity-values，要让 37 到 43 份契约同批发新版、各自补接受声明、各自换路径；
- 还要同步改测试路径、包导出和 `$id`。

现实里只会出现两种结局：

1. 违反「同批迁移全部消费者」，重新钉旧版，回到今天 119 条最新版→旧版依赖的状态；
2. 小修订被拖着不做。

无论哪种，都违背了这条裁决「避免认知负担」的本意。record 只许追加，又与甲「每次删版」反复冲突，这是同一个缺陷的另一面。

---

## 5. 从现状走到乙：分八批

全程原则：每批之后 `make check` 全绿。复核戳在规定时段内用现有的 `--stale report` 机制只报告；报告出来的红项逐条列出，不藏起来。

### 第 0 批：决定与提案（只新增 record）

- 新决定记下 10-01 裁决和乙的规则：修订号、按修订接受、复核戳、条款号永不复用、形式覆盖，以及 record 链接的处置方式。
- 写明取代哪些旧决定、取代到什么范围：D-023/028/029/040/055/061/066（「禁止重算 hash」一句限定范围）/068/069/070/086/090/099。
- 按 `design/AGENTS.md`「至少三个实质候选」，提案列甲、乙、现状三个候选。
- 全绿依据：只新增 md，链接可解析即可。

### 第 1 批：工具（规格树不动）

- 检查器支持整棵树切换的 `version_policy.kind: "revision"`。在这个模式下：
  - `_catalog` 期望目录为 `spec/{family}/{topic}/`，每个 contract_id 只能有一条；
  - `expected_schema_id` 去掉版本段；
  - `_frozen` 要求 frozen 哈希等于 catalog 所指 acceptance.json 里的资源哈希。
- 所有判定报全部错误，而不是第一处，解决 C18。
- 核对 bindings、依赖、covers 里的条款号真实存在（锚点存在），解决 C9 和 C13。
- 复核戳对账：catalog 依赖、covers、bindings 加 `checked_revision`；architecture.md 坐标列改为 `contract_id（rev N）`；复用 `_stale` 和 `--stale`，并按消费的 clauses 收窄点名范围。
- 形式覆盖判定，包括「预期出反例」这一类任务，解决 C19。
- 两种模式都配测试固件。
- 全绿依据：树仍是 evolving 模式，新模式只在固件上测。

### 第 2 批：版本化世界里本来就合法的清理，加一份等价账本

- formal-tasks.json 不在冻结范围内：
  - 把 61 个 MRR 任务改指 v12 中逐字节相同的工件（这些工件已是 catalog 资源，`_formal` 能过）；
  - 给 13 个没有任务的最新版模型登记任务；
  - 删掉最新版已有对应任务的 15 个旧任务；
  - 跑一遍 `FORMAL=run`。
- 在 tmp/ 或 record/evidence 里做等价账本，逐项判「相同／改号／改义／删除」，覆盖：119 条依赖、31 条 `$ref`、918 个冻结链接、268 行 bindings、2308 条 covers、80 个只在旧版上有覆盖的需求条款、28 个只在旧版里有的形式工件。

### 第 3 批：代码先行

- 消费旧版导出的包先迁到最新版，按开发者切片做：
  - model-profile 用的 content-blocks v2、offer-expiry v1；
  - stream-assembly 用的 CA2；
  - messages 的 v2/v3/v6 子路径；
  - 前端的 CO v1、EC v2；
  - apps/cli 的 cli-entry v1。
- 一时迁不动的，记为实现缺口。
- 硬条件：只要还有仓内消费者在导入某个旧导出，切换就不能做。
- 全绿依据：常规 `make test`。

### 第 4 批：OG/AI/OE 语义收敛（最危险的一批，见本问末尾）

- 负责人裁定唯一语义：合并 OG v2（拒绝与共同参与，消费 AI3/OE2）、v3（两个时刻、资产分享不复活，消费 AI1/OE1）和 v1 的模型（IV1 依赖其中的 Affiliation.als）。
- 确定 AI 和 OE 各取哪一版作为唯一正文。
- 逐条映射消费者的条款：asset-transfer/v2 的 OE1 17 条和 OG3 12 条、asset-governance/v2 与 MPD/v5 消费的 OG1 条款、AR2、GCE3、GCE-https3、CO2、cli-entry。
- 以候选稿形式写在分支或 tmp，由 design-reviewer 审，在第 5 批的决定里接受。
- tenancy/organization-governance 按 v2 实现、不写两个时刻，记为实现缺口。

### 第 5 批：切换（原子、脚本化、一个 PR，附一份仿 D-066 的行政迁移决定）

- **搬目录。** 最新版目录的内容提到 topic 根（OG/AI/OE 用第 4 批的稿件），删掉其余版本目录。版本目录内的 10 份 verification.md 与 topic 级 verification.md 合并。
- **身份与登记。**
  - catalog：44 条，修订号沿用原版本号，例如 MRR 为 rev 12，保持连续；
  - frozen：约 386 个键；
  - 新写一份 acceptance.json，声明 44 份契约的当前修订和资源哈希；
  - lineage 和 version-migrations 退役，解决 C16。
- **最新版字节里引用旧版的地方（119/31/918）。** 账本判「相同」的，机械改为不带版本的写法；判「改义」的，消费者的戳置空，进入 stale 报告。
  - `$ref` 有硬兜底：`_schemas` 加 `resolve_pointer` 会在本 PR 里拦下目标中缺失的 `$defs`，必须当场修，要么在目标里保留定义，要么修订消费者。
- **bindings（268 行；13 个节点只绑旧版）。** 改写为 `contract#S-n`。账本判 S-n 相同的打当前修订戳，否则置空。节点 README 写明「实现依据是旧语义（Git <commit> 中的 vN），与现行修订的差异见账本」。
- **测试和包。**
  - 第 3 批之后，读旧版的约 25 个测试随旧导出一起删除；
  - 读最新版的测试改路径；
  - 36 个包 Schema 文件的 `$id` 改为不带版本；
  - stream-assembly 和 core-verification 改用新的 frozen 键。
- **形式化（89 个任务；28 个只在旧版里有的工件）。** 第 2 批已经处理了 61 个以上。最新正文仍在主张的性质（OG v3、MRR v12、AR v2、IV 都链着这些工件），把对应工件带进 `formal/`：OG 的 Membership/Affiliation、MRR v2 的 Invocation 一组、session-log v2 的 cfg、cli-entry 的 TerminalExit、client-ops 的 UseLifecycle。不再主张的，在决定里写明删除理由。最后 `FORMAL=run`。
- **record 里的 221 个链接。** 按第 0 批的授权，一次性机械改写或改成钉提交的写法。
- **全绿依据：** `STALE=report` 只用于新的复核戳，其余判定全部为 fail。

### 第 6 批：逐条复核 stale 清单

做必要的契约修订和绑定修正，然后把复核戳改回 fail。

### 第 7 批：删除过渡物，改写规矩

- 删掉 evolving 模式、`--previous-frozen`、不再需要的 lineage/rebase 机制、version-migrations.json、merge_design_candidates 写死的 initial-uniform，以及 `v-next` 模板。
- 同步改写：根 AGENTS.md 和 `.meta_harness/AGENTS.md` 的「不可原地覆盖」、spec/README「路径即身份」、registry/README 的过时计数（C21）、tooling/README、docs/verification.md、手册「规格演进」。

### 最危险的一批：第 4 批，以及它对第 5 批的耦合

1. **它是语义工作，不是机械工作。** D-066 原话「OG3 不是 OG2 的功能超集」。
2. **影响面最大。** 它牵动现行的治理实现和两个应用，13 个只绑旧版的节点大多在这一簇里；而且通过 OE v1 牵到资产线。
3. **出错时没有检查器能抓到。** 条款文字和坐标文字都不受检（C9、C23）。

第 5 批的风险主要是体量，第 1 批「报全部错误」和第 2 批的账本已经把它压低了。

---

## 6. 没核对到的事实，以及结论依赖的假设

**没核对到：**
- 没跑 `make check`、design-check 和测试，不确定当前树是否全绿。
- 没逐项复核盘点的这些数字：918 个链接、268 行 bindings、89 个任务、约 25 个测试、2308 条 covers、3534 个锚点。
- 没核对旧条款与新条款在语义上是否等价，盘点也没做；第 5 批的工作量取决于这件事。
- 没读 D-066 和 D-068 决定原文，只读了 OG README 和 spec/README 里的转述。
- 没读 `doc_support.validate_link`，不确定 docs-check 是否也核锚点。
- 没读手册「规格演进」和 engineering-taste 全文。

**结论依赖的假设：**
- 条款号 S-n 跨版本稳定、不被复用。这一点只从 bindings 注释（例如 account-identity「S-13/S-14/S-38 在 v2 里与 v1 逐字相同」）和 README 推断，没有全局核过。如果条款号曾被复用，乙的「`contract#S-n` 加复核戳」需要先补一道重新编号映射。
- 连锁发版的规模，我用 catalog 依赖图、`$ref` 图和字面串 `identity-values/v1` 来估。这里假设甲的作者无法把跨契约引用写成不带版本的形式。`$ref` 这部分是强制的；Markdown 链接和坐标文字理论上可以改写法，但那样就是乙换了个外形。
- 包现在没有外部消费者（发布前阶段）。如果已有外部消费者，反证二中「不带版本的 `$id`」这一条会更重。
- record 链接的一次性改写可以由新决定授权。如果负责人坚持 record 一个字节都不能动，就只能把 record 移出断链检查，或改用永久链接，这需要另外裁定。
- 盘点的扫描口径（排除范围、跳过的 207 个二进制文件、对缩写不识别）我照单接受，没有复扫。