选：乙

**前置说明**
- **核对对象**：工作树 HEAD `758d7775`（分支 `panqiwei/clean-loop-skeleton`）。盘点用的是 `328b08b`，两者在 `.meta_harness/design`、`packages`、`apps` 下只差 `packages/AGENTS.md` 的 3 行；`spec/`、`registry/`、`tooling/src` 完全相同，所以盘点的数字适用于当前树。
- **我亲自复核过的数字**（只读脚本，全部和盘点一致）：
  - 44 份契约、109 个版本目录、65 个旧版，109 条全部 `accepted`。
  - catalog 依赖：(新→旧) 119 条，由 38 个最新版指向 32 个旧版。
  - frozen 1104、任务 122、covers 3352；`lineage.json` 全空。
  - 最新版的 .md 里指向旧版目录的链接 918 个，分布在 46 个文件里；最新版指向产品正文、带锚点的链接 3534 个。
  - MRR v3–v11 共 65 个任务，其中 61 个的工件在 v12 里逐字节相同，而 v12 只登记了 2 个任务。
  - OG 各版本的 catalog 入依赖，见第 5 节。
- **简报是否偏袒**：基本对等。有一处不对称：乙附带了「本仓库产品 topic 已经这样做、也已有对账器」这条先例，甲没有对应的先例句。甲的先例其实就是现行制度本身和 D-066。两边都没写出各自最大的代价（甲是连锁换版，乙是静默漂移），这是留给评审的，不算偏袒。

---

## 1. 选择

**选乙。** 我没看到明显更好的第三种终态。建议在乙内部做两处细化，属于我的推断，不另立方案：
- **「核对于修订 N」按条款粒度判陈旧。** catalog 的依赖本来就逐条列 `clauses`，bindings 也是逐条款。
- **冻结哈希只留一处，放进接受声明。** 现在同一组哈希在 frozen、acceptance.json、version-migrations、provenance 四处重复，检查器只读 frozen 一处。

## 2. 选乙的三条最强理由

**理由一：在「只留一版」之下，甲每次修订都会连锁换版；乙的修订不改任何路径。**
- 版本号写进了三处受机检的身份：
  - `design_validation.py` 的 `expected_schema_id`（106–108 行）把 `v{version}` 拼进 `$id`。
  - `_catalog` 要求资源落在 `spec/{family}/{topic}/v{version}` 下（431–445 行）。
  - `_markdown` 检查设计根下全部 .md 的链接和锚点，冻结规格也在内（606–666 行）。
  - `_frozen` 对任一字节变化报 `frozen file changed`（682–683 行）。
- 甲修订 X 并删除 X/vN 时，凡是用链接或 `$ref` 指向 X/vN 的最新版目录都会断。它们的字节冻结不能改，只能也出新版，新版又让它们自己的消费者断。
- 我做了一次只读计数。方法：解析 44 个最新版目录里的 Markdown 链接和 Schema `$ref`，指向别的契约的任一版本目录就算一条边，再算反向传递闭包。结果：
  - 修订 offer-expiry 要带动 41/44 份契约。
  - identity-values、content-blocks、asset-model、tool-definition、messages、loop-extension 等各带动 40/44。
  - 只算 `$ref`，offer-expiry 也要带动 13 份。
- **先例**：D-066 第 4 条「#9 的其余 33 份 v1 随精确引用闭包行政迁移为 v2」。一次行政改号动了 33 份契约（version-migrations.json 里 146 个资源）。
- 现存的 119 条依赖、31 条 `$ref`、918 个链接，正是过去用「消费者钉旧版」躲开连锁的残留（D-068 原句：「24外部消费者仍钉2，不自动迁移」）。新裁决取消的恰恰是这条退路。
- 乙的路径和 `$id` 不含版本。修订只改被修订契约自己的字节，依赖方的字节不动，链接和 `$ref` 照常解析。

**理由二：裁决要求「形式化正版持续维护保存」，而版本目录复制在本仓库已经把形式任务丢在了旧版里。**
- MRR v3–v11 共 65 个任务，其中 61 个的工件在 v12 里逐字节相同，但 v12 只登记了 `ack-lifecycle` 和 `ack-progress` 两个任务，另有 12 个 .tla 没有任何任务（盘点 7.1；61 和 2 我已复核）。
- MRR 的 11 个版本目录共 536 个文件，v12 只有 105 个；v3–v12 是在 PR #17 里一次合入的。
- `harness-design-handbook/.../spec-evolution.md` 第 29 行：「在已发布目录追加一个规范模型也要新版本」。在甲下，补一个 `.cfg` 就等于一次新版本加一次连锁迁移，形式化维护会被系统性地抑制。
- 乙的工件路径稳定，任务登记一次就一直有效；补模型就是一次就地修订。同一模型文件的演化用 `git log -p` 就能连续看到。甲下每次修订是整目录复制再删除，要靠 rename 检测才能把历史接上（我的推断，未实测）。

**理由三：乙复用仓库里已经在运转的机制，而且条款身份本来就和版本无关。**
- **产品 topic 已经这样做**：
  - 产品 topic 用 README front-matter 的 `revision`（PF-013 是 `revision: 17`）加一份 changelog。
  - `domain_objects.py` 的 `_stale` 和 `realization_nodes.py` 的 `cited`，在「（rev N）」落后时缺省判失败（`--stale` 缺省 `fail`，分别在 476 行和 460 行）。
  - 「链接后面跟（rev N）」是整条设计链的约定，见 `ubiquitous_language/conventions.md` 第 120、131 行。
- **条款编号跨版本稳定**：account-identity 从 v1 到 v3 保留了 S-1…S-40，新增的 S-44、S-45 是追加的，没有复用编号。D-066 第 4 条也写明行政迁移时「条款稳定编号……均不改」。所以 `contract#S-n` 本来就是稳定身份，版本号只是附加的修订信息。
- **「核对于修订 N」已有现成落点**：
  - catalog 的 743 条依赖必须带非空 `clauses`（484–485 行）。
  - bindings 已有 `alignment_checked` 字段（见 `apps/tenancy-host/bindings.yaml`）。
  - 投影的 provenance 已经用 `snapshot_commit` 加 `snapshot_sha256` 钉住来源（见 PF-013 `projection/v9/provenance.json`）。精确性靠提交号而不靠路径，正是乙的做法。
- **符合裁决「避免认知负担」的本意**：甲会让 v12、v8 这样的数字继续出现在每条路径和坐标里，而 OG 已经说明这个数字不可靠：v3 不是 v2 的超集，「数字最大就是最新」不成立（C12）。

## 3. 对乙最强的三条反证

**反证一：一次性迁移面最大，而且没法分批。代价落在主线和工具维护者身上。**
- **工具要改的地方**：
  - `Coordinate` 要求 `version` 是正整数（31–46 行），catalog 的稳定键是 (baseline, contract, version)。
  - `_schemas` 从路径里解析版本（581–584 行）；`--previous-frozen` 按 `parts[:4]` 识别版本目录（692–704 行）。
  - `tools/spec-tools` 的 `catalog.schema.json` 和 `frozen.schema.json` 用正则锁死了 `/v[1-9][0-9]*/`。
- **数据面要改的地方**：
  - frozen 1104 个键、122 个任务路径、3352 条带 `version` 的 covers、348 行 bindings。
  - packages/apps/tools 里有 68 个 .ts 和 41 个 .json 写着版本路径（我的 grep，含指向最新版的）。
  - stream-assembly 和 core-verification 的测试直接读 `frozen.json`。
  - `record/decisions` 下 36 个 `acceptance.json` 按 (contract, version) 声明坐标，`_acceptance` 要求每个坐标恰好声明一次，而 record 按规矩不改。
- 引用图几乎强连通（理由一的 40/44），按契约逐个搬做不到，只能一次原子切换。`spec/README.md` 的「路径即身份……目录结构不随组织方式调整而变动」（C20）会被正面推翻。

**反证二：静默语义漂移。代价落在消费者（实现节点、依赖方契约）和评审者身上。**
- 乙的修订就地生效，所有没带修订号的引用都会自动指向新语义，包括设计根内成千上万的 Markdown 链接和整张 `$ref` 图。
- 例子：messages v8 的 `$ref` 指向 content-blocks 的 `#/$defs/ContentBlock`。content-blocks 一改，messages 的校验行为就跟着变，而 messages 自己的字节和修订号都没动。
- 能兜住它的只有对账器，而今天的对账面很薄：
  - `check_bindings` 不核条款坐标（C9）。
  - design_review 对依赖和覆盖缺失只报告、不判失败（盘点 4.5）。
  - 冻结、catalog、形式任务三类检查各自只报第一处错误（C18）。
- `design/AGENTS.md` 自己就写着：「不复核就改 rev 等于把检查关掉」。甲下指向旧版的引用会在路径上断掉、被机检拦住；乙把这层机检换成了纪律加对账器。

**反证三：只有一份正文，「候选与已接受并存」和并行修订都变难。代价落在集成者身上。**
- 甲在修订期间可以让 v{N} 和 v{N+1} 同时在树上；乙只有一份，草稿只能放在分支上（另设候选目录就又成了两份）。
- 如果把唯一的 catalog 条目改成 candidate，已接受的依赖方会触发 `accepted contract depends on non-accepted coordinate`（495–497 行）。
- 原地修订号在并行分支上会撞号，已有两次：
  - D-066 第 2 条：PF-001 两侧都出了 rev 17，被迫把一侧改记为 rev 19 再合并。
  - PF-013 changelog 的「rev 16 — 并行产品修订整合」，整合的是两条 rev 14。
- 两条较次要的代价：
  - **多版 Schema 导出**：`@omne-harness-lite/messages` 同时导出 `./schema/v2`、`v3`、`v6`，这在乙下无法保留。不过所有包都是 `private: true`，没有对外的 `$id` 稳定性义务，代价较小（我的推断）。
  - **冻结边界不再直观**：冻结边界从「vN 目录里全部冻结」变成「topic 目录里按资源清单冻结」，README 和 verification 会与冻结文件同目录。现在已有 3 个 `formal/README.md` 漏登（盘点 2.3），说明靠清单识别边界会漏。

## 4. 甲最致命的一条

**甲把「版本号写在路径里、冻结字节不可改」和「只留一版」叠在一起，每次修订都必须让所有引用它的契约连锁换版。在本仓库的引用图上，这几乎就是全树。**
- 现行制度能运转，是因为允许依赖方继续钉旧版，119 条依赖、31 条 `$ref`、918 个链接就是证据。裁决取消旧版之后，这条退路就没了。
- 举例：offer-expiry 的最新版有 17 条依赖入边、8 份最新 Schema 用 `$ref` 指向它。修订它一次，同一个变更里要给最多 41 份契约出行政新版，再把这些契约的 bindings、测试、包内 `$id`、投影、topic README 全部改号。每次修订都是一次 D-066 规模的迁移。
- 结果只能二选一。要么大家回避修订，连补形式模型也回避（spec-evolution.md 第 29 行），规格和形式化随之陈旧，违背裁决后半句；要么绕过冻结。版本号也会退化成行政编号，认知负担不降反增。
- 要避开连锁，只能把跨契约链接改成不带版本、把跨契约 `$ref` 改成内联复制。前者已经是在往乙走，后者违背「同一概念只有一个权威定义」。

## 5. 从现状走到乙

**总原则**：语义迁移在现行规则下拆成小卡做完。这时旧目录都还在，每张卡都能保持全绿。机械换形则压成一次能用脚本复核的原子提交。

**批 0：把决定写进 record（只新增文件）**
- 新建一份决定，按范围取代 D-023/028/029/040/055/061/066/068/069/070/086/090/099 里「旧版保留、不自动升级」的条款（C22），但不改写它们已发生的接受事实。
- 写明终态乙、各契约的幸存版本（默认是最新版，OG 待批 3 合并），以及要负责人另裁的两件事：record 里的链接怎么处理、旧投影版本怎么处理（见第 6 节）。
- **保持全绿**：只加文件，链接可解析。

**批 1：条款级差异报告（只读工具，进 `make design-review`，只报告）**
- 对每一对「旧版→最新版」逐条款号比较正文，比较时规范化掉版本路径段；对每个 `$ref` 目标比较 JSON Pointer 指向的子 Schema。
- 据此把 119 条新→旧依赖、31 条 `$ref`、268 行 bindings、2308 条 covers 分成「相同／有变化／缺失」三类。
- 这个工具在批 4 之后就是乙的对账器核心，可以按条款粒度判陈旧。
- **保持全绿**：新工具配 pytest，不碰 spec。

**批 2：可变消费者迁到最新版（现行规则下，按节点、按包逐卡并入）**
- **bindings（268 行，13 个只绑旧版的节点）**：按批 1 报告逐行处理。条款相同的改绑到最新版坐标；有变化的解绑，并在节点的 verification/README 记具名缺口、下调层次。实现照旧版写的事实如实留在缺口里，补实现另立卡。
  - 13 个只绑旧版的节点逐个出卡：apps/cli、apps/tenancy-host、MRR、account-identity、account-registration、credential-verification、governance-center-client、infra/clock，以及 6 个各只有 1 行的 core 包。
  - 两个应用 architecture.md 里的 16 个旧坐标改到最新版。
  - 给 `check_bindings` 加「条款坐标在 catalog 里、条款号存在」这条检查，这一批先只报告。
- **形式任务**：
  - 61 个 MRR 任务改指 v12 里逐字节相同的工件，可用哈希机证。
  - 删掉 15 个在最新版已有同名任务的旧任务。
  - 4 个 final-plan 任务的字节不同，先判断是否已被 v12 的 FinalPlan 取代。
  - 给 13 个无任务的最新版模型补任务。
- **covers**：条款相同的改指最新版；80 个只在旧版上有覆盖的需求条款逐条复核。
- **代码**：
  - 只为旧版语义存在的测试和旧版 Schema 导出直接删除（阶段政策：删除被替代的实现），其余改读最新版。
  - 引入一个按 contract_id 经 catalog 解析资源的测试辅助，让测试不再手写 vN。
- **topic README/verification**：本来就可改，里面指向旧版的 3129 个链接改指最新版。
- **保持全绿**：旧目录都在，改指的目标都存在；每卡跑受影响成员，并入前跑全量 `make check`。

**批 3：语义新版（现行规则下，用今天的流程出版本）**
- **OG 合并**：出一份同时拥有 v2 的拒绝与共同参与（AI3/OE2）和 v3 的两个时刻与分享不复活的新版，先作为 v4 候选。这是语义决定（D-066 原话「OG3 不是 OG2 的功能超集」），需要 design-reviewer 判表达、负责人接受。
  - 合并时把 OG v1 的 `Membership.tla/.cfg`、`Affiliation.als` 并入 v4 的 formal/；IV1 和 OG v3 的结构检查本来就落在这份模型上。
  - 当前治理实现钉的是 v1/v2，对 v3 的时刻语义记缺口。
- **有实质变化的新→旧边**：批 1 报告里消费条款或被引 `$defs` 有变化的那部分，在所在契约出语义新版并评审，让批 4 只剩机械改写。
- **保持全绿**：这就是现行的 evolving 流程（接受、冻结、登记、任务），消费者此时仍可钉旧版。

**批 4：原子切换（最危险），一个提交，脚本驱动**
- **工具**：
  - `Coordinate` 改为 contract_id 加 revision；catalog 每份契约一条。
  - 资源路径和 `$id` 去掉版本段。
  - 冻结改为「字节等于当前修订接受声明里的哈希」。
  - catalog 依赖、bindings、covers、provenance 都带 `checked_revision`（可加条款哈希），沿用 realization_nodes/domain_objects 的 stale 写法，缺省判失败。
  - `check_bindings` 转为判失败。
  - 同步改 spec-tools 的两份格式 Schema 和 tooling 的测试固件。
- **数据**：
  - 把幸存版本的文件移到 `spec/<fam>/<topic>/`，删除全部 vN 目录（MRR 的 `v-next` 一并处置）。
  - 把最新正文仍链接或仍需要的旧版独有工件移入幸存目录并登记任务：MRR v2 的 Invocation、AR v1 的 formal README、cli-entry v1 的 TerminalExit、client-ops v1 的 UseLifecycle、session-log v2 中仍需要的 cfg。validity-check 一类反例 cfg 按各自 formal README 决定留或删。
  - 全仓把 `<topic>/vN/` 改写为 `<topic>/`。
  - 重新生成包内 Schema 副本（`$id` 去版本）；只需改批 2 引入的测试辅助；stream-assembly 和 core-verification 改读新登记。
- **修订号**：从原版本号接续（例如 MRR 从 12 起，下一次就地修订记 13），让 record 里「MRR v12」的说法能直接对上修订号（我的推断）。
- **出了冻结字节就要的接受**：用一份批量的行政接受声明，并配一个不变量脚本，逐文件机证「新字节 = 旧最新版字节去掉版本段」。只允许批 1 判为「相同」的边被自动改指，其余必须已在批 3 解决。这和 D-066 的 version-migrations 是同一种证据。
- **record 与旧投影里的链接**：record 里有 141 个链接指向旧版（decisions 15、proposals 92、evidence 34），另有产品正文 29、统一语言 4、research 16，以及投影 3803。建议按负责人的裁决改写成固定到切换前提交的永久链接。`_markdown` 会跳过带 scheme 的链接（642–643 行），而且这样比改成不带版本的相对链接更忠实于历史：后者在乙下会指向不断演化的正文。
- **同一提交里改掉直接矛盾的规则句**：根 AGENTS.md「已发布规格不可原地覆盖…」、`.meta_harness/AGENTS.md`「发布后规范不可原地覆盖」，以及 `spec/README.md` 的「路径即身份」一节。
- **保持全绿**：在分支上迭代，直到 `make check` 全绿（加 `FORMAL=run` 实跑模型）、不变量脚本通过，再并入主线。
- **为什么这一批最危险**：
  - 引用图在 40/44 的规模上连通，这一步无法拆小。
  - 冻结门的定义恰好在改动全部冻结字节的同一个提交里被重写，门最弱的时刻正是风险最大的时刻。
  - 每类检查只报第一处错误（C18），迭代会很慢。
  - 119 条依赖、31 条 `$ref`、918 个链接的语义改指，容易藏在一大片机械 diff 里。
  - 所以它只能装机械改写，语义部分必须提前在批 2、批 3 做完。

**批 5：收尾与传感器**
- 改写其余文字：handbook 的 spec-evolution.md、registry/README（计数已过时，C21）、tooling/README、`docs/verification.md`，以及模板里的 `v-next` 写法。
- 实现 C19 那条「最新版有模型却没有任务就判失败」。
- 退役已无用途的部分：`version_policy`、`lineage.json` 的重基机制、`--previous-frozen`、version-migrations.json、写死 v1 的 `merge_design_candidates.py`、`rebase_resources.py`。
- 加一个传感器：record 以外的正文里出现 `<topic>/vN` 字样就报告（对应 C23：文字引用拦不住）。
- **保持全绿**：只改文字和工具，每步都可单独验证。

**简报点名的几处怎么过，汇总：**

| 事项 | 怎么过 |
|---|---|
| 冻结字节里的 119 条依赖、31 条 `$ref`、918 个链接 | 批 1 分类；相同的在批 4 机械改写，有变化的在批 3 出语义新版；之后由 `checked_revision` 接管 |
| 268 行 bindings、13 个只绑旧版的节点 | 批 2 逐行改绑或解绑记缺口，批 4 去掉版本段并转为判失败 |
| ~25 个测试、~20 个包 Schema | 批 2 删除或改读最新版并收口到测试辅助，批 4 改辅助、重新生成 `$id` |
| 89 个形式任务、28 个旧版独有工件 | 批 2 处理 61 个改指和 15 个删除，批 3 并入 OG 模型，批 4 移入其余并登记 |
| OG 的 v2 与 v3 两条线 | 批 3 合并成一版 |

## 6. 没核对到的事实与依赖的假设

- **没跑任何检查**：`make check`、pytest、pnpm 都没跑（只读约束；pytest 还会写 `tmp/`）。
- **没逐个核的数字**：约 25 个测试、约 20 个包 Schema、9320 个链接、2308 条 covers、268 行 bindings。我只抽查了 messages、call-accounts、stream-assembly 和 tenancy-host 的 bindings。
- **闭包计数的口径是我自己定的**：只看 44 个最新版目录里的链接和 `$ref`，指向任一版本目录都算一条边，不含 topic 的 README/verification。并且假设甲的终态保留现在的引用习惯。
- **条款编号稳定只核了 account-identity 的三版**。如果别的契约复用或重排过编号，乙需要再加一条「编号永不复用」，迁移时要逐份核。
- **裁决只说了规格**。record 按规矩不改，投影模板写着「旧版本保留……不删除」；这两处的链接能不能改写，需要负责人另裁。
- **「逐卡并入主线、短分支」的出处**：这是同日整洁之道裁决里的一条（第 4 条），我是从会话记忆读到的，没在 record 里核到。乙用分支起草顺不顺手，依赖这个前提。
- **假设预发布阶段没有运行期要同时校验多版数据**：包全是 private，阶段政策也不留兼容。如果有持久化数据要按旧格式读，乙需要在实现侧自己管理格式版本。
- **没读到的代码**：没读 `check_docs.py` 是否核锚点，也没读 roleeval 是否按固定提交取材料。
- **git 历史连续性**：「甲下要靠 rename 检测才能接上历史」是推断，没有实测。