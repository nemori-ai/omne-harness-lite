# 规格版本并存的现状盘点（只读）

> 这是 [D-113](decision.md) 落字之前做的现状盘点，原样保留作依据：它描述的是提交 `328b08b24` 上的树，只列事实，不含方案。
> 由一个只读的调查 agent 完成；三位独立评审各自复算过其中的主要计数（契约、版本目录、依赖四分、冻结、任务、覆盖、冻结链接），与这里一致。
> 文中提到的「中间数据」（逐版本文件表、逐旧版消费者表、引用明细等）与取数脚本是当时主检出 `tmp/` 与会话临时目录里的工作文件，
> 没有入库；要复核就照「元信息与口径」一节的口径重新数。

## 摘要

1. **现状**：44 份契约，109 个版本目录，其中旧版 65 个（data 29、capabilities 27、compositions 9）。
   - 版本目录共 1107 个文件，1104 个在 `frozen.json` 里；没登记的 3 个是 OG v2、AR v2、GCE v2 的 `formal/README.md`。
   - catalog 109 条全部 `accepted`，没有 `superseded` 或 `withdrawn`。
   - registry 里没有「推荐版本」或「被取代」字段。检查器虽然允许 `superseded` 状态，但没有一条用到。
   - 另有一个 `model-request-runtime/v-next/`（15 个已跟踪文件），不在任何登记里。
2. **冻结怎么识别**：只靠 `registry/frozen.json` 里「路径（含 vN）→ SHA-256」的逐文件清单，检查时重算比对，不看 git 历史。
   - 同样的哈希还存了三份，检查器都不读：acceptance.json 里 814 个、version-migrations 里 146 对、投影 provenance.json 里若干。
3. **检查器**：`design_validation.py` 里和这件事有关的失败信息有这些：
   - 冻结：`frozen file changed`（文件缺失也报这句）、`frozen path is not a catalog resource`、`accepted catalog resources are not frozen`。
   - `--previous-frozen` 专用：`previous frozen registration changed or was removed`、`resources were added to an already frozen version`。
   - 依赖：`unknown exact coordinate`、`accepted contract depends on non-accepted coordinate`。
   - Schema：`has wrong $id`、`unresolved schema resource`。
   - 链接：`broken local link`、`missing Markdown anchor`，范围是设计根下全部 .md，冻结的规格也在内。
   - 形式任务：`artifacts must identify existing files/catalog resources`。
   - `realization_nodes.py` 还要求 architecture.md 坐标列里的坐标都在 catalog 里。
   - `GATE` 只作用于 `lineage.json`，而它是空的，所以现在不起任何作用。常规的 `make check` 不传 `PREVIOUS_FROZEN`。
   - 三类判定（冻结、catalog、形式任务）每类都只报第一处错误。
   - 没有测试覆盖删版本、删条目或 `superseded`。
4. **最新版自己就钉着旧版**（都写在冻结字节里）：
   - catalog 依赖：119 条边，38 个最新版指向 32 个旧版。被依赖最多的是 offer-expiry v1（17 条）、asset-model v2 和 content-blocks v2（各 12 条）。
   - Schema `$ref`：13 份最新 Schema 指向 14 个旧版，共 31 条边。
   - Markdown 链接：46 个冻结的最新版文件里有 918 个链接指向旧版目录。
5. **旧版消费者**：65 个旧版每个都还有消费者（指删旧版后仍会留下的文件）。按类别：
   - registry：covers 2308 条、formal task 89 个。
   - realization：45/52 个节点，2077 处引用；bindings 里有 268 行条款坐标是旧版，涉及 21 个节点，其中 13 个只绑旧版。
   - architecture.md 坐标列：apps/cli 有 10 个旧坐标，tenancy-host 有 6 个。
   - 产品投影：8 个 topic 的 18 个投影版本，3803 个链接。
   - 规格 topic 的 README/verification：3129 个链接。
   - record：decisions 1248 处、proposals 580 处、evidence 17949 处。
   - packages/apps/tools：约 25 个测试按版本路径读旧规格比字节；约 20 个随包发布的 Schema 的 `$id` 写的是旧版路径；stream-assembly 和 core-verification 的测试直接读 frozen.json。
   - product 正文 33 处、统一语言 7 处；domain_objects、basis、docs 和根 AGENTS.md 都是 0。
   - 设计根内共 9320 个链接（271 个文件）指向旧版目录，删掉之后 check_design 和 docs-check 都会报断链。
6. **组织治理的 v2 和 v3 是并列的两条线，不是前后版本**：
   - D-066 原话是「OG3 不是 OG2 的功能超集」；当前治理实现钉的是 v1/v2。
   - 所以对这份契约，「数字最大就是最新」不成立。
7. **反向链接**：冻结规格里有指向产品小节锚点的链接 10721 个（最新版 3534 个，在 57 个文件里），「PF-nnn rev N」写法 1495 处。
8. **形式工件**：
   - 122 个任务，指向旧版的 89 个。
   - 其中 61 个（model-request-runtime v3–v11）检的模型在 v12 里逐字节相同，但 v12 只登记了 2 个任务。
   - 只在旧版里有、最新版没有的形式文件：32 个，按（契约, 文件名）去重是 28 个，分属 OG、MRR v2 的 Invocation、session-log v2、cli-entry v1、client-ops v1。
   - OG v3 没有 `formal/`，正文写明沿用 v1 的模型；identity-values v1 的结构检查也落在 OG v1 的 `Affiliation.als`。
   - 最新版里有 13 个模型文件没有被任何任务引用。`docs/verification.md` 说这种情况会判失败，但代码里没有这项判定。
9. **现行决定**：D-023/028/029/040/055/061/066/068/069/070/086/090/099 都写着旧版保留、冻结字节不改、不自动升级。2026-10-01「只保留最新一版」这条裁决在 `record/` 里还没有记录。
10. **先例**：D-066 已经把 33 份 v1 迁成了 v2。现在仍有 4599 处文字引用指向已经不存在的目录，检查照样通过，因为检查器只拦 Markdown 链接和登记文件。

---

## 0. 元信息与口径

- **盘点对象**：工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/roles-review-loop`，分支 `panqiwei/story-cards`，HEAD 是 `328b08b245d849edeafc1590d54e09654f9f4c9d`，工作树干净。
- **一致性核对**：开工和收尾各核对一次 HEAD、`git status` 和 `registry/*.json` 的 SHA-256，两次一致；没有发现同一文件前后读到的内容不一样。`spec/` 和 `registry/` 最后一次改动是提交 `46e29deef`。
- **标记**：【事实】是读到或数出来的，【推断】是我的判断，【未覆盖】是没查的范围。没有标记的数字都是事实。

| 名词 | 含义 |
|---|---|
| 契约 | `spec/{data,capabilities,compositions}/<topic>/` 一个目录，对应一个 contract_id |
| 版本目录 | `v<数字>` 子目录（不含 `v-next`） |
| 最新版 | 数字最大的 vN，和 catalog 里最大的 version 一致（109/109）。OG 例外，见 5.1 |
| 旧版 | 不是最新版的 vN。registry 没有「被取代」字段，这里按数字算 |
| 引用 | 三种写法：① Markdown 链接，解析后落在 `spec/<fam>/<topic>/vN/` 下；② 路径文字，正则 `(data\|capabilities\|compositions)/<topic>/vN`；③ 坐标文字，`(data\|capability\|composition).<topic>` 后面接 `/vN`、空格 vN、`· vN` 或 `@N`。同一行同一目标只记一次，链接优先。结构化坐标（catalog、covers、formal-tasks、frozen、acceptance.json）单独解析 |
| 扫描范围 | `git ls-files` 共 12638 个文件，排除 design_legacy、`.meta_harness/.claude\|.agents\|.codex`、tmp/、docs/blogs、node_modules、dist 后剩 11090 个。其中跳过 207 个：188 个不是 UTF-8，19 个大于 8MB，主要是 record 下的 `.tar.gz` |
| 不识别 | 简称（RT12、MS8、OG2、AI1、EC3……）；脚本拼出来的路径只人工核了一部分 |

## 1. 一页结论

| 项 | 数 | 怎么数的 |
|---|---|---|
| 契约 | 44（data 16、capabilities 23、compositions 5） | `spec/*/<topic>/` |
| 版本目录 | 109，与 catalog 一一对应 | `v<数字>` |
| 旧版 | 65；只有一个版本的契约 21 份，有旧版的 23 份 | 109−44 |
| 版本目录里的文件 | 1107：旧版 721，最新版 386；其中 frozen 登记 1104 | — |
| frozen 里属于旧版的 | 719 / 1104 | 按路径里的版本号判 |
| catalog 状态 | 109 条全部 accepted | `catalog.json` |
| 指向旧版的形式任务 | 89 / 122 | `formal-tasks.json` |
| 只在旧版里有的形式工件 | 28 个（契约, 文件名）/ 32 个文件，分属 5 份契约 | 见 7.2 |

**引用旧版的存活消费者**：

| 类别 | 引用 | 文件 | 其中 Markdown 链接 |
|---|---|---|---|
| 最新版规格目录（已冻结） | 2706 | 104 | 918（46 个文件） |
| 规格 topic 的 README/verification（可改） | 3821 | 77 | 3129 |
| catalog 依赖 | 119 条边（38 个最新版 → 32 个旧版） | — | — |
| covers | 2308 条 | — | — |
| formal-tasks | 89 个 | — | — |
| realization | 2077 | 194（45/52 个节点） | 1296 |
| bindings 条款行 | 268（21 个节点；13 个只绑旧版） | — | — |
| 产品投影 | 4381 | 33（8 个 topic、18 个投影版本） | 3803 |
| product 正文 / 统一语言 | 33 / 7 | 8 / 2 | 29 / 4 |
| domain_objects/basis/foundation/views | 0 | 0 | 0 |
| record/decisions | 1248 | 52 | 15 |
| record/proposals | 580 | 42 | 92 |
| record/evidence | 17949 | 888 | 34 |
| packages/apps/tools | 1124 | 121 | 10 |
| .meta_harness/agents、research、tooling | 213 | 55 | 16 |
| docs/、根 AGENTS.md | 0 | 0 | 0 |

**删旧版之前必须先迁移的几大块**（数字是事实，排序是我的判断）：

1. **最新版自己引用旧版，而且写在冻结字节里。** catalog 依赖 119 条，Schema `$ref` 31 条，Markdown 链接 918 个。
2. **实现映射。**
   - bindings 里有 268 行条款坐标是旧版：tenancy/governance-center-entry 75 行、tenancy/account-identity 35、pi-ai-transport 28、apps/tenancy-host 25、tenancy/organization-governance 23、account-registration 19、model-request-runtime 16。
   - 两个应用的 architecture.md 坐标列里共有 16 个旧坐标，检查器会按 catalog 核。
3. **代码。**
   - 约 25 个测试按版本路径读旧规格，比原字节或比 frozen 哈希。
   - 约 20 个随包发布的 Schema，`$id` 写的是旧版路径。
   - stream-assembly 和 core-verification 的测试直接读 `frozen.json`。
4. **形式化。**
   - 89 个任务指向旧版，其中 61 个的模型在 MRR v12 里还在，但 v12 没有对应任务。
   - OG v3 和 IV1 依赖 OG v1 的模型。
5. **链接。** 设计根内 9320 个链接（271 个文件）指向旧版目录。
6. **覆盖关系。**
   - covers 有 2308 条指向旧版。
   - 6 份契约共 80 个需求条款只在旧版上有覆盖，其中 5 份的最新版 covers 是 0。

## 2. 版本并存现状（问题 1）

### 2.1 总表

形式工件指 `formal/` 下的 .tla、.cfg、.als。

| 契约 | 版本 | 最新 | 旧版数 | 形式工件所在版本 |
|---|---|---|---|---|
| data.agent-definition | v1 | v1 | 0 | — |
| data.arrival-events | v2 | v2 | 0 | — |
| data.asset-model | v2,v3 | v3 | 1 | — |
| data.call-accounts | v2–v4 | v4 | 2 | — |
| data.connector | v2 | v2 | 0 | — |
| data.content-blocks | v2,v3 | v3 | 1 | — |
| data.identity-values | v1 | v1 | 0 | — |
| data.loop-extension | v2–v6 | v6 | 4 | — |
| data.mcp-endpoint | v2 | v2 | 0 | — |
| data.messages | v2–v8 | v8 | 6 | v2–v8（各有一个 Readable.als） |
| data.model-profile | v2–v6 | v6 | 4 | — |
| data.model-response | v2–v11 | v11 | 9 | — |
| data.offer-expiry | v1,v2 | v2 | 1 | v2 |
| data.skill-package | v2,v3 | v3 | 1 | — |
| data.slash-command | v2 | v2 | 0 | — |
| data.tool-definition | v2,v3 | v3 | 1 | — |
| capability.account-identity | v1–v3 | v3 | 2 | v3 |
| capability.assembly-manifest | v2–v4 | v4 | 2 | — |
| capability.asset-evaluation | v2–v4 | v4 | 2 | v2,v3,v4（.als） |
| capability.asset-governance | v2 | v2 | 0 | — |
| capability.asset-registry | v2–v4 | v4 | 2 | — |
| capability.asset-transfer | v2 | v2 | 0 | v2 |
| capability.center-connection | v2 | v2 | 0 | — |
| capability.client-local-state | v1 | v1 | 0 | v1 |
| capability.credential-custodian | v2 | v2 | 0 | v2 |
| capability.execution-environments | v2 | v2 | 0 | — |
| capability.hooks-import | v2 | v2 | 0 | — |
| capability.loop-extension-runner | v2–v5 | v5 | 3 | v3,v4,v5 |
| capability.mcp-bridge | v2 | v2 | 0 | — |
| capability.modality-projection | v2 | v2 | 0 | — |
| capability.model-profile-directory | v2–v5 | v5 | 3 | — |
| capability.model-request-runtime | v2–v12（另有 v-next） | v12 | 10 | v2–v12、v-next |
| capability.organization-governance | v1–v3 | v3 | 2 | **v1,v2（v3 没有）** |
| capability.run-attempt-facts | v2 | v2 | 0 | — |
| capability.session-log | v2,v3 | v3 | 1 | v2,v3 |
| capability.session-tenancy | v2 | v2 | 0 | — |
| capability.stream-assembly | v2,v3 | v3 | 1 | v2,v3 |
| capability.tool-admission | v2 | v2 | 0 | — |
| capability.tool-execution-runtime | v2 | v2 | 0 | v2 |
| composition.account-registration | v1,v2 | v2 | 1 | v1,v2 |
| composition.governance-center-entry | v1–v3 | v3 | 2 | v1,v2,v3 |
| composition.governance-center-entry-https-json | v1–v3 | v3 | 2 | — |
| composition.governance-cli-entry | v1,v2 | v2 | 1 | v1,v2 |
| composition.governance-client-operations | v1,v2 | v2 | 1 | v1,v2 |

**合计**：44 份契约，109 个版本目录，65 个旧版。每个 topic 在版本目录外都另有 README.md 和 verification.md，可改，不在 frozen 里。

**文件种类**（共 1107 个）：

| 种类 | 个数 |
|---|---|
| contract.md | 109 |
| *.schema.json | 52 |
| examples* | 105 |
| .tla | 109 |
| .cfg | 621（其中 validity-check/ 下 341） |
| .als | 13 |
| formal/README.md | 45 |
| formal/ 下其他 | 2：asset-evaluation v4 的 check-root-settings.py、MRR v12 的 ACK-README.md |
| 版本目录内的 verification.md | 10 |
| 其他 | 41：consumer-impact 16、source-alignment 8，以及若干 *-examples.json、commands.json、forms.json、scenarios.md |

逐版本的明细在 `per-version-table.md`（附录 A）。

### 2.2 两个旁支事实

- **`capability.model-request-runtime/v-next/`**：15 个已跟踪文件，最后一次改动是提交 99d8a08af。不在 catalog，不在 frozen，也不在任何任务里。`spec/README.md` 原句：「`v-next` 不可作为发布版本。」
- **`spec/archive/`**：只有一个 `.gitkeep`。

### 2.3 版本目录里没登记的文件

OG v2、AR v2、GCE v2 各有一个 `formal/README.md`，不在 resources 里也不在 frozen 里。`make design-review` 的 unregistered-file 会报它们，但这一项只报告、不判失败。

## 3. 身份清单与冻结登记（问题 2）

### 3.1 registry/ 下的文件

| 文件 | 结构 | 条数 |
|---|---|---|
| baseline.json | `baseline_id`=`omne-harness-lite-design-2026-09-15`；`legacy_baseline_ids`；`version_policy`={kind: evolving} | 1 |
| catalog.json | `contracts[]{coordinate, family, topic, status, contract_path, resources, acceptance, dependencies[]{coordinate, clauses, rebase_relation}}` | 109 条，全部 accepted；依赖 743 条，`rebase_relation` 全为 null；acceptance 指向 31 个文件 |
| frozen.json | `files{path: sha256}` | 1104（最新版 385、旧版 719），路径全部存在 |
| covers.json | `covers[]{requirement{topic, clause}, target{contract_id, version, clauses}, reviewed, note}` | 3352（最新版 1044、旧版 2308；reviewed 为 true 的 87、false 的 3265），覆盖 100 个坐标 |
| formal-tasks.json | `tasks[]{id, kind, artifacts, command, timeout_seconds}` | 122（tla 121、alloy 1；最新版 33、旧版 89） |
| lineage.json | `retired_identities` / `relations` / `consumer_observations` | 三项全空 |
| version-migrations.json | D-066 的行政迁移：`contracts[]`、`resources[]{source_path, source_sha256, target_path, target_sha256}` | 34 份契约（clause_mapping 全是 identity）、146 个资源 |
| id-namespaces.json | 编号前缀 | 10 |

### 3.2 四种状态登记在哪

- **接受**：catalog 的 `status: "accepted"`，再加 `acceptance` 指向 `record/decisions/*/…json`。那份 JSON 的 `accepts[].coordinate` 必须恰好声明一次这个坐标。
  - 36 个声明文件共 152 个坐标声明：最新版 45 个，旧版 74 个，另有 33 个的版本目录已经不存在。
  - 资源哈希共 814 个（最新版 227、旧版 587），全部和 frozen.json 一致。
- **冻结**：`frozen.json` 按文件登记，没有「某个坐标已冻结」这样的字段。共 1104 项。
- **推荐版本**：没有字段，只在正文里出现，比如「推荐／接受新版本不自动升级消费者」。
- **被取代**：没有登记。
  - 检查器允许 `superseded`/`withdrawn` 两种状态，但用到的是 0 条。
  - `lineage.retired_identities` 只用于旧 baseline，现在为空。
  - 投影的 `provenance.json` 有个 `supersedes` 字段，但那属于投影层，不是规格。

**registry/README 的计数已经过时**：两张表还写着 63 / 351 / 1496 / 37，实际是 109 / 1104 / 3352 / 122。文件顶部按事件追加的流水和 frozen 的实数对得上（970+134=1104）。

### 3.3 与版本、冻结、发布有关的规矩（原句）

- **根 AGENTS.md**：「已发布规格不可原地覆盖。修改发布新版本，推荐版本不自动升级消费者。归档原件与未接受候选不作为有效契约登记。」
- **.meta_harness/AGENTS.md**：「发布后规范不可原地覆盖。」
- **spec/README.md**：
  - 「失效事件：语义变更。已发布规格不可原地覆盖，修改发布新版本。」
  - 「资源位置 `spec/{family}/{topic}/v{version}/...` 是 `contract_id` 与版本的派生拼写……Schema 的 `$id` 为 `{schema_namespace}/{baseline_id}/spec/{family}/{topic}/v{version}/{resource}`，`frozen.json` 逐文件登记 SHA-256，两者都以此路径为准。」
  - 「因此**这一层的目录结构不随组织方式调整而变动**。」
  - 「`v-next` 不可作为发布版本。」
  - 「接受/采用信息从 registry 的 catalog 引用；可变验证结果不写入已冻结的规范目录。」
  - 「v1 目录任何字节变化都会被检查器报 `frozen file changed`，语义改动发布 v2」
  - 「旧2原字节保留；24外部消费者仍钉2，不自动迁移。」
- **registry/README.md**：
  - 「catalog 的稳定键是 `(baseline_id, contract_id, version)`……`accepted` 条目必须链接实际 `record/decisions/` 文件，全部版本资源必须冻结」
  - 「`version_policy` 决定能否新增版本。……切换为 `{"kind":"evolving"}` 后可新增 v2，且不能改写 v1。」
  - frozen 那一行：「后续修改须出新版本」
  - 「现有通用检查器不读取新的行政迁移清单」
- **design/README.md 状态词表**：frozen =「已接受版本的精确资源 hash 进入不可原地改写的发布集合」。
- **design/AGENTS.md**：「已经触发的证明义务必须闭合或明确阻断。」这份文件没有单独写「不可原地覆盖」。
- **tooling/README.md**：
  - frozen.json「发布后只追加，新内容必须新版本」
  - 「`--previous-frozen PATH` 可核对同一 baseline 先前冻结登记未被改变或移除，也没有向已冻结版本目录追加资源」
- **产品投影模板**（管投影，不管规格）：「发布新版本，不原地改旧版」「旧版本保留并标注被谁取代；不删除。」

## 4. 检查器（问题 3）

### 4.1 Makefile 与 check.sh

`design-check` 依次跑四个脚本：

```
check_design.py --root .meta_harness/design --formal $(or $(FORMAL),registered) $(if $(GATE),--gate "$(GATE)") $(if $(PREVIOUS_FROZEN),--previous-frozen "$(PREVIOUS_FROZEN)")
domain_objects.py
realization_nodes.py
stories.py
```

| 参数 | 作用 |
|---|---|
| FORMAL | 缺省 `registered`，只核任务已登记；`skip` 显式跳过；`run` 才真正执行，变量未设、工具缺失、超时或非零退出都会失败 |
| GATE | 缺省 `internal`；`release` 只对 lineage 里的 relation 和 observation 多判 blocked、unknown、缺证据。lineage 现在全空，所以 GATE 当前不起任何作用 |
| PREVIOUS_FROZEN | 和一份旧 frozen 比：旧项不能改也不能删，已冻结的版本目录不能新增资源 |
| STALE | 只影响 domain_objects 和 realization_nodes 的 rev 判定，和版本无关 |

`scripts/check.sh` 用缺省参数依次跑 agents-check、docs-check、design-check、test、product-check。远程 CI 是关着的。没有任何地方常规地传 PREVIOUS_FROZEN 或 GATE。

### 4.2 冻结靠什么识别

只看 `frozen.json` 的路径→SHA-256，检查时重算比对；不读 git 历史。同样的哈希还有三份副本，检查器都不读：acceptance.json、version-migrations、provenance.json。

### 4.3 design_validation.py

| 函数 | 判什么 | 失败信息 |
|---|---|---|
| `_baseline` | `version_policy` 只能是 initial-uniform 或 evolving | `version_policy.kind must be initial-uniform or evolving` |
| `_catalog` | 路径必须在 `spec/{family}/{topic}/v{version}` 下且存在；一个文件只能属于一个坐标；坐标不能重复；status 只能取四种之一；initial-uniform 时版本号必须一致 | `contract_path must be below`、`resources[i] must be below`、`does not exist`、`resource registered by two coordinates`、`duplicate coordinate`、`must use initial migration version` |
| `_acceptance` | acceptance 文件里恰好声明一次本坐标 | `must declare this exact coordinate exactly once` |
| `_dependencies` | 依赖的坐标必须存在；accepted 的契约不能依赖非 accepted 的坐标 | `has unknown exact coordinate`、`accepted contract depends on non-accepted coordinate` |
| `_schemas` | `$id` 必须等于按路径推出的值；`$ref` 只在已登记的 Schema 之间解析 | `has wrong $id: expected …`、`duplicate schema $id`、`unresolved schema resource` |
| `_markdown` | 设计根下所有 .md 的链接与锚点（只排除 .templates，冻结规格和 record 都在内） | `broken local link`、`missing Markdown anchor`、`link escapes design root` |
| `_frozen` | 每个 frozen 路径都是 catalog 资源；哈希相等；所有 accepted 资源都已冻结 | `frozen path is not a catalog resource`、`invalid SHA-256`、`frozen file changed`（文件缺失也报这句）、`accepted catalog resources are not frozen` |
| `_frozen` + previous | 旧清单里的项都原样保留；旧版本目录不新增资源 | `previous frozen manifest belongs to another baseline`、`previous frozen registration changed or was removed`、`resources were added to an already frozen version` |
| `_formal` | 工件存在且是 catalog 资源，并带有 .tla 或 .als | `artifacts must identify existing files`、`artifacts must all be catalog resources`、`has no .tla model` |
| `_rebase*` | lineage 与 release gate | `retired contract identity was revived`、`blocked at release`、`unknown and blocks the release gate`、`has no release evidence` |

- `_frozen`、`_catalog`、`_formal` 都在循环里 raise，所以每类只报第一处错误。
- **文档和代码不一致**：`docs/verification.md` 说「正式版本新增 .tla/.als 却没有任务覆盖时检查失败；没有任务时报告 UNCOVERED」，但代码里没有这项判定。

### 4.4 design-check 里的另外三支

- `realization_nodes.py check_coordinates`：assembly 节点 architecture.md 里「契约坐标」或「精确形状归谁」两列的坐标必须在 catalog 里。失败信息：「契约坐标 `X/vN` 不在 registry/catalog.json 里」。
- `realization_nodes.py check_links`：失败信息「链接解析不到」。
- `check_bindings`：只核 node、kind 和 bindings 条数，**不核 clause 坐标在不在 catalog 里**。
- `domain_objects.py`、`stories.py`：不读 spec 或 registry。

### 4.5 只报告、不判失败的 design_review.py

- `unregistered-file`：「版本目录里的 X 不在 resources 里」。
- `stale-product-rev`：带 `FROZEN=1` 时会附注「已冻结，不能原地改」。
- `dependency-clause-missing`：「依赖 X 不在当前 catalog（旧谱系或未登记）」。
- `covers-target-missing`：「覆盖指向的坐标 X 不在 catalog 里」。

### 4.6 不在 design-check 里的工具

merge_design_candidates.py（写死 initial-uniform v1）、rebase_resources.py、normalize_formal_commands.py。

### 4.7 测试（.meta_harness/tooling/tests/）

- **test_design_validation.py**：
  - `test_current_frozen_content_and_previous_registration_are_immutable`：覆盖 frozen file changed、previous … removed、resources were added。
  - `test_evolving_baseline_allows_new_version_without_overwriting_v1`：v1 和 v2 并存，release gate 通过。
  - release gate 与 lineage：`test_release_gate_cannot_bypass_blocked_relation_or_unknown_consumer`、`test_direct_retired_dependency_needs_mapping_and_blocked_gate_stops_acceptance`、`test_unblocked_rebase_relation_requires_its_exact_catalog_target`、`test_accepted_legacy_dependency_requires_clause_coverage_and_accepted_target`、`test_verified_current_consumer_requires_exact_catalog_coordinate`、`test_retired_identity_cannot_be_revived_in_current_catalog`、`test_realistic_small_tree_resolves_schema_links_and_tracks_legacy_consumer`。
  - 其余：`test_duplicate_exact_coordinate_is_rejected_even_if_content_paths_differ`、`test_namespace_and_legacy_catalog_mix_are_rejected`、`test_decision_acceptance_must_name_exact_coordinate_and_scope`、`test_acceptance_declaration_may_live_under_record_decisions`、`test_unresolved_json_pointer_is_rejected_with_source_location`、`test_workspace_navigation_rejects_missing_targets_anchors_and_escapes`、`test_formal_registration_skip_and_actual_execution_are_distinct`、`test_formal_runner_failure_is_propagated`。
- **test_design_review.py**：`test_accepted_contract_is_only_checked_with_include_frozen`、`test_file_in_version_directory_outside_resources_is_reported`、`test_cover_on_a_coordinate_missing_from_catalog_is_reported_in_a_full_run`、`test_dependency_consuming_a_missing_clause_is_reported_at_its_line`。
- **test_realization_nodes.py**：`test_contract_coordinates_must_exist_in_the_catalog`、`test_relative_links_must_resolve`。
- **没有测试覆盖的**：删除版本目录或 catalog 条目；superseded 或 withdrawn 状态；evolving 下删旧留新。测试固件几乎都是 initial-uniform。

## 5. 谁在消费旧版（问题 4）

### 5.1 例外：organization-governance

OG 的 topic README 原句：「**v3 不是 v2 的功能超集。** 数字后移不升级任何当前治理消费者」。

- v2 是 draft 那条线，消费 AI3/OE2；「当前治理实现、AR2、EC2/EC3 及其运输/客户端保持此坐标」。
- v3 是「#9 原 v2 的行政迁移……仍消费 AI1/OE1」，资产转移 v2 钉的是它。
- 【推断】对 OG 来说，「数字最大就是最新」不成立。

### 5.2 别的契约

**catalog 依赖**：743 条边，按（依赖方是否最新, 被依赖方是否最新）分：(新,新) 129、**(新,旧) 119**、(旧,新) 233、(旧,旧) 262。

38 个最新版依赖旧版，按依赖的旧版个数排：

- **10 个**：tool-execution-runtime/v2
- **7 个**：asset-governance/v2、loop-extension-runner/v5
- **6 个**：asset-registry/v4
- **5 个**：hooks-import/v2
- **4 个**：
  - governance-client-operations/v2、model-profile-directory/v5
  - mcp-bridge/v2、modality-projection/v2、tool-admission/v2
  - connector/v2、loop-extension/v6
- **3 个**：
  - assembly-manifest/v4、asset-evaluation/v4、center-connection/v2、execution-environments/v2、run-attempt-facts/v2、session-log/v3
  - arrival-events/v2、call-accounts/v4、mcp-endpoint/v2、skill-package/v3、slash-command/v2
- **2 个**：
  - asset-transfer/v2、credential-custodian/v2、governance-cli-entry/v2
  - model-request-runtime/v12（asset-registry/v3、offer-expiry/v1）
  - organization-governance/v3（account-identity/v1、offer-expiry/v1）
  - messages/v8、model-profile/v6、model-response/v11
- **1 个**：
  - client-local-state/v1、session-tenancy/v2、stream-assembly/v3
  - account-registration/v2 → OG v2
  - governance-center-entry/v3 → OG v2
  - agent-definition/v1、asset-model/v3

被最新版依赖最多的旧版：offer-expiry/v1 17、asset-model/v2 12、content-blocks/v2 12、messages/v2 10、call-accounts/v2 8、tool-definition/v2 8、loop-extension/v2 7。逐边明细在 `catalog-deps.json`。

**Schema `$ref`**：解析了 52 个带 `$id` 的 Schema。跨版本 `$ref` 的出现次数：(新→新) 167、**(新→旧) 163**、(旧→旧) 490、(旧→新) 277；没有解析不到的。13 份最新 Schema 引用了 14 个旧版：

| 最新 Schema | 引用的旧版 |
|---|---|
| messages/v8 | model-profile/v5、offer-expiry/v1 |
| model-response/v11 | model-profile/v5、offer-expiry/v1 |
| loop-extension/v6 | call-accounts/v2、messages/v6、model-profile/v5、offer-expiry/v1 |
| model-profile/v6 | content-blocks/v2、offer-expiry/v1 |
| call-accounts/v4 | content-blocks/v2、offer-expiry/v1 |
| asset-model/v3 | loop-extension/v3、offer-expiry/v1、skill-package/v2 |
| skill-package/v3 | asset-model/v2、content-blocks/v2、tool-definition/v2 |
| mcp-endpoint/v2 | asset-model/v2、offer-expiry/v1、tool-definition/v2 |
| connector/v2 | content-blocks/v2、messages/v2、offer-expiry/v1 |
| arrival-events/v2 | call-accounts/v2、content-blocks/v2、loop-extension/v2 |
| slash-command/v2 | asset-model/v2 |
| agent-definition/v1 | model-profile/v3 |
| governance-client-operations/v2 | governance-center-entry/v2、governance-client-operations/v1 |

**最新版规格目录里的文字与链接**：

- 共 2706 处引用旧版：Markdown 链接 918，坐标文字 1709，路径文字 79。
- 链接分布在 46 个文件里，涉及 40 个最新版。
- 同 topic 的 66 处，例如 `account-identity/v3/contract.md` 里的 `../v2/contract.md`；跨 topic 的 2640 处。
- 链接最多的：tool-execution-runtime/v2 132、asset-governance/v2 68、modality-projection/v2 68、governance-center-entry/v3 62、organization-governance/v3 61。

### 5.3 realization

**引用面**：52 个节点里 45 个引用旧版，另外还有 `realization/README.md`。按文件类型：

| 文件 | 引用 | 文件数 |
|---|---|---|
| design.md | 1164 | 43 |
| bindings.yaml | 318 | 27 |
| verification.md | 214 | 28 |
| README.md | 156 | 32 |
| architecture.md | 42 | 2 |
| 附页（如 v3-design.md） | 183 | 62 |

其中 Markdown 链接共 1296 个。

**bindings 的 clause 行**：

- 共 348 行，指向旧版 268 行、最新版 80 行。
- 31 个有绑定的节点里，21 个含旧版，13 个只绑旧版：
  - 应用：apps/cli、apps/tenancy-host
  - 模型：model/model-request-runtime
  - 租户：account-identity、account-registration、credential-verification
  - 前端与基础设施：frontend/governance-center-client、infra/clock
  - core：asset-evaluation、call-accounts、loop-extension、messages、model-profile、model-response，各只有 1 行

**architecture.md 坐标列**（用 `realization_nodes.py` 自己的表格解析函数取）：

- apps/cli：28 个坐标中 10 个是旧版——AI v2、asset-registry v2、MPD v2、MRR v2、OG v1、OG v2、AR v1、EC v1、model-response v2、OE v1。
- apps/tenancy-host：12 个坐标中 6 个是旧版——AI v2、MPD v2、OG v1、AR v1、EC v1、OE v1。

逐节点明细在 `realization-table.md`（附录 B）。不引用任何旧版的 7 个节点：core/kernel-basis、core/storage、frontend/client-local-state、infra/execution-environments-host、session/session-tenancy-table、util/unix-format、util/xml-format。

### 5.4 产品投影

- 8 个 topic、18 个投影版本引用旧版：PF-001 v1–v3、PF-002 v3、PF-003 v3、PF-006 v3、PF-009 v1、PF-013 v3–v8、PF-016 v1–v3、PF-017 v1–v2。
- projection.md 里 3821 处（15 个文件，其中链接 3803 个）；provenance.json 里 560 处（18 个文件）。
- provenance 的 `sources[]` 记的是 `resource`（含 vN 的路径）、`snapshot_commit`、`snapshot_sha256`。
- PF-002 v3、PF-006 v3、PF-013 v3 各引用 24 个旧版，是 D-066 迁移时重新固定的那批投影。
- 没有检查器读 provenance.json。

### 5.5 product、统一语言、领域对象、record、basis

| 区 | 引用 | 文件 | 明细 |
|---|---|---|---|
| product 正文（不含投影） | 33 | 8 | PF-001 的 changelog 和 decisions；PF-012 的 decisions；PF-013 的 changelog；PF-017 的 changelog、decisions 和两份 interviews |
| ubiquitous_language | 7 | 2 | conflicts.md、decisions.md |
| domain_objects、basis、foundation、views | 0 | 0 | — |
| record/decisions | 1248 | 52 | 链接 15 个；acceptance.json 里另有旧版坐标 74 个、旧版资源哈希 587 个 |
| record/proposals | 580 | 42 | 链接 92 个 |
| record/evidence | 17949 | 888 | 链接 34 个，其余是日志、快照、清单里的路径 |

### 5.6 产品代码与测试

**按版本路径读旧规格文件的测试**：

| 成员 | 读的旧版 | 文件 |
|---|---|---|
| apps/cli | governance-cli-entry v1 的 commands.json；governance-client-operations v1 的 examples.json | tests/input.spec.ts、tui-forms.spec.ts |
| core/agent-definition | model-profile/v3 | tests/resource-closure.spec.ts |
| core/asset-model | asset-model/v2、tool-definition/v2；ports.ts 按 topic 拼出 v2/v3（含 loop-extension/v3） | versioned-schema.spec.ts、ports.ts |
| core/call-accounts | call-accounts/v2 | tests/v3.spec.ts |
| core/content-blocks | content-blocks/v2 | spec-fixtures.ts、versioned-schema.spec.ts |
| core/identity-values | OG v1 的 Alloy 模型 | tests/fixtures/affiliation-alloy.ts |
| core/loop-extension | loop-extension v2、v3 | d068-normative.spec.ts、versioned-schema.spec.ts |
| core/mcp-endpoint | loop-extension/v3、skill-package/v2 | body-resource.spec.ts |
| core/messages | messages v2、v3、v4、v6 | normative、prefix、d068-normative、adaptation、versioned-schema；alignment 和 schema-graph-v7 从 `$id` 反推路径 |
| core/model-profile | model-profile v2、v5 | v5.spec.ts、adaptation.spec.ts、v6-resource.spec.ts |
| core/model-response | 从 `$id` 反推 | schema-graph-v10.spec.ts |
| core/skill-package | skill-package/v2 | adopted-v3.spec.ts |
| core/stream-assembly | **读 frozen.json 和 catalog.json**，按 frozen 哈希核 15 个资源，含 call-accounts v2、content-blocks v2、loop-extension v2、offer-expiry v1、asset-model v2、tool-definition v2、messages v2、model-profile v2、skill-package v2 | tests/fixtures.spec.ts |
| frontend/governance-center-client | governance-center-entry/v2 | tests/health.spec.ts |
| frontend/governance-client-operations | governance-client-operations/v1 | actions.spec.ts、cache.spec.ts |
| model/model-request-runtime | messages/v7 | reference-consumer.spec.ts |
| tenancy/governance-center-entry | https-json/v2 | tests/bytes.spec.ts |
| tools/core-verification | **读 frozen.json**；w6-coverage.json 里有 messages/v3 | src/w6-packed-consumer.ts、tests/w1-public-consumer.spec.ts |

另有约 30 个测试文件读的是最新版。

**随包发布的 Schema，`$id` 或 `$ref` 写的是旧版路径**：

- core/asset-model：asset-model.v2、resources/tool-definition.v2
- core/call-accounts：schema/v2
- core/content-blocks：content-blocks.v2
- core/loop-extension：loop-extension.v2、v3
- core/messages：messages.v2、v3、v6
- core/model-profile：根 Schema 和 v2、v3、v6 子目录的四份，都 `$ref` 到 content-blocks v2 和 offer-expiry v1
- core/offer-expiry：offer-expiry.v1
- core/skill-package：skill-package.v2
- core/tool-definition：tool-definition.v2，以及 src/declarations.ts
- frontend/governance-center-client：EC v2
- frontend/governance-client-operations：EC v2、CO v1

`realization/packages/core/messages/public-definition-resource-closure-followup.md` 写明这些旧资源仍有真实当期引用。原句：「MR10 保留 LC6.FailureCause 原资源有真实当期引用；若下一轮连该旧LC文件也要删除，须单独迁MR后继引用」。

**源码注释和 README**：

- tenancy/account-registration 的 src 下 index/registration/types 三个文件，注释里写 AR v1 的路径。
- tenancy/organization-governance：src/index.ts 写 OG v1，types.ts 写 OG v2。
- apps/tenancy-host/tests/e2e 下三个文件写 EC v1、HB v1。
- model/model-request-runtime 的 README.md 和 README_ZH.md，各有 5 个链接指向 RT v4/v5/v7/v8，docs-check 会核这些链接。
- packages/README.md 里有 5 个旧坐标。
- tools/ts-checks 的 `core-scoped.ts` 规则出处里写了 16 个旧坐标，其中有几个对应的目录已经不存在。

逐成员的坐标文字清单在 `code-refs.json`。

### 5.7 docs、根文件与 .meta_harness 其他区

- docs/ 和根文件：0。
- .meta_harness/agents：130 处，36 个文件，全在 evaluation 用例集里，另有 skills 里的 expression.md 一处。用例集的 flow.json 每个用例都带 `"base": "<commit>"`。
- research：74 处，17 个文件，其中链接 16 个。
- tooling：merge 工具和 realization 测试的固件里各有若干。

### 5.8 逐个旧版的消费者计数

逐行数据在 `old-version-consumers-table.md`。列依次是：catalog 入依赖（来自最新版/来自旧版）、covers、formal 任务、bindings 条款行，后面几列是各类去重文件数，最后一列是 design 内 md 链接。

**合计**：

- 最新版 → 旧版的依赖 119 条，涉及 32 个旧版。
- covers 2308 条，涉及 62 个旧版。
- formal 任务 89 个，涉及 21 个旧版。
- bindings 268 行，涉及 21 个旧版。
- 被最新版规格文件引用的旧版 53 个，被 realization 引用的 61 个，被代码引用的 40 个。

**没有一个旧版是零消费者。** 如果只看「最新版规格、realization、bindings、代码」四类，只有 data.model-response/v6 一处都没被引用。

引用最多的几行：

| 旧版 | 最新 | catalog 入依赖 | covers | formal | bindings | design 内 md 链接 |
|---|---|---|---|---|---|---|
| OG v1 | v3 | 2/5 | 32 | 1 | 25 | 617 |
| GCE v1 | v3 | 1/1 | 42 | 1 | 70 | 407 |
| AR v1 | v2 | 0/1 | 12 | 3 | 21 | 380 |
| AI v1 | v3 | 1/2 | 19 | 0 | 7 | 378 |
| asset-model v2 | v3 | 12/11 | 54 | 0 | 0 | 336 |
| AI v2 | v3 | 0/1 | 23 | 0 | 37 | 334 |
| messages v2 | v8 | 10/9 | 78 | 0 | 0 | 317 |
| asset-evaluation v2 | v4 | 2/3 | 41 | 0 | 0 | 314 |
| MRR v2 | v12 | 0/1 | 55 | 2 | 6 | 301 |
| OE v1 | v2 | 17/46 | 10 | 0 | 16 | 263 |

### 5.9 反过来：各最新版被谁引用

逐行数据在 `latest-consumers-table.md`。几个特点：

- 被引用最多的是 identity-values/v1：catalog 入依赖 100 条，其他规格版本目录 1861 处，realization 120 处，代码 271 处。
- **最新版 covers 为 0 的有 6 个**：offer-expiry/v2、account-identity/v3、client-local-state/v1、account-registration/v2、governance-cli-entry/v2、governance-client-operations/v2。
- MRR v12 的 catalog 入依赖是 0，代码引用也是 0。

### 5.10 先例：已经不存在的版本目录

- 有 4599 处引用指向不存在的版本目录：路径文字 3792、坐标文字 807，没有一个是 Markdown 链接。分布在 203 个文件里：record 4430、registry 145、spec 13、tools 8、realization 3。
- 指向的目标：
  - D-066 之前的 33 份 v1，例如 content-blocks/v1 有 980 处。
  - modality-projection/v3 有 234 处，全在一次检查的 logs 里。
  - identity-values/v2 有 13 处，是 topic 文件里「留给 v2」这类说法。
- 这些都不拦检查：既不是链接，也不在任何登记文件里。

## 6. 反向链接：冻结规格 → 产品正文（问题 5）

在 281 个冻结的 .md 文件里数（最新版 110 个、旧版 171 个）：

| 项 | 最新版 | 旧版 |
|---|---|---|
| 指向 product/ 且带 #锚点的链接 | **3534**（57 个文件） | 7187（102 个文件） |
| 指向 product/ 不带锚点的链接 | 52 | 52 |
| 「PF-nnn … rev N」写法（正则 `PF-(\d{3})[^\n]{0,40}?rev\s*(\d+)`） | 513（63 个文件） | 982（109 个文件） |
| 「（rev N）」括注 | 62 | 102 |

锚点链接落在 18 个产品 topic 的 44 个文件里。例子：

- identity-values/v1/contract.md（最新版）：`../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号`
- 同一文件：链接文字「PF-002 rev 10 §5.2」，目标是 `product/PF-002-assets-settings-and-permissions/design.md` 的「5.2 设置与权限是资产的两种属性」小节锚点；以及「产品依据以 **PF-001 rev 15** 为准」
- offer-expiry/v1/contract.md（旧版）：链接文字「§2 分支与异常」，目标是 `product/PF-001-identity-scope-and-agent-constraints/flows.md` 的「二、分支与异常」小节锚点，后面跟着「（PF-001 rev 15）」

这些锚点 `_markdown` 会逐个核，而文件本身又被 `frozen file changed` 锁住。

## 7. 形式工件（问题 6）

### 7.1 任务登记

122 个任务，每个任务的工件都在同一个版本目录里。

| 契约/版本 | 状态 | 任务 |
|---|---|---|
| account-identity v3 | 最新 | lifetime、commit、revision |
| asset-evaluation v4 | 最新 | root-settings（唯一的 alloy 任务，命令是 python3 check-root-settings.py） |
| asset-transfer v2 | 最新 | transfer、share、revival |
| client-local-state v1 | 最新 | choice |
| credential-custodian v2 | 最新 | sweep |
| loop-extension-runner v3 / v4 / v5 | 旧 / 旧 / 最新 | 4 / 5 / 5 个 |
| MRR v2 | 旧 | invocation、invocation-no-fallback |
| MRR v3 | 旧 | content-gate、adaptation-binding、adaptation-lifecycle |
| MRR v4、v5 | 旧 | 各 6 个（上面 3 个 + settlement ×3） |
| MRR v6–v8 | 旧 | 各 10 个（再加 final-plan ×2、pending-reply、retry-history） |
| MRR v9 | 旧 | 11 个（再加 recovery-timing） |
| MRR v10 | 旧 | usage ×6 |
| MRR v11 | 旧 | referencelifecycle、publication、openedorder |
| MRR v12 | 最新 | ack-lifecycle、ack-progress |
| OG v1、v2 | 旧 | 各一个 membership |
| session-log v2 / v3 | 旧 / 最新 | 1 / 3 个 |
| stream-assembly v2 / v3 | 旧 / 最新 | 各一个 assembly |
| tool-execution-runtime v2 | 最新 | 2 个 |
| AR v1 / v2 | 旧 / 最新 | 各 3 个 |
| GCE v1 / v2 / v3 | 旧 / 旧 / 最新 | 1 / 3 / 5 个 |
| cli-entry v1 / v2 | 旧 / 最新 | 各 1 个 |
| client-ops v1 / v2 | 旧 / 最新 | 各 1 个 |
| offer-expiry v2 | 最新 | settlement |

**旧版任务和最新版的关系**（把任务的工件按文件名映到最新版目录，比字节）：

| 情形 | 任务数 |
|---|---|
| 工件在最新版里字节相同，最新版也有对应任务 | 15 |
| 工件在最新版里字节相同，**但最新版没有任务** | **61**（全是 MRR v3–v11） |
| 工件在最新版里字节不同，最新版没有任务 | 4（MRR v6/v7 的 final-plan） |
| 工件在最新版里字节不同，最新版有任务 | 3 |
| 只有部分工件在最新版里 | 2（cli-entry v1 exit、client-ops v1 lifecycle） |
| 工件在最新版里不存在 | 4（OG v1/v2 membership；MRR v2 invocation ×2） |

没被任何任务引用的模型文件：

- 最新版 13 个：messages v8 的 Readable.als，以及 MRR v12 下的 Adaptation、AdaptationBinding、ContentGate、FinalPlan、OpenedOrder、PendingReply、Publication、RecoveryTiming、ReferenceLifecycle、RetryHistory、Settlement、UsageCalibration（都是 .tla）。
- 旧版 27 个。

### 7.2 只在旧版里有的形式工件（逐条）

比较方法：旧版 `formal/` 下的 .tla/.cfg/.als（含 validity-check）按相对路径去最新版里找。结果：字节相同 438 个，同名但不同 32 个，**最新版里没有的 32 个**，按（契约, 文件名）去重是 28 个。

| 契约（最新版） | 只在旧版里的文件 | 所在旧版 | 对应任务 |
|---|---|---|---|
| OG（v3 没有 formal/） | Membership.tla、Membership.cfg | v1、v2 | OG v1/v2 membership |
| 同上 | Membership_NoSerialization.cfg、Affiliation.als | v1、v2 | 无 |
| MRR（v12） | Invocation.tla、Invocation.cfg、Invocation_NoFallback.cfg | v2 | v2 invocation、no-fallback |
| 同上 | Invocation_Reach_FallbackThenComplete、Reach_ResumeThenComplete，以及 Validity_AbortBeforeIntent、NoGuard_Fact、NoGuard_Spoke、NonIdempotentSettle、SendBeforeAnchor、SpokeAfterObserve（都是 .cfg） | v2 | 无 |
| session-log（v3） | SessionLog_NoSerialization_Fence、NoSerialization_Key、Reach_DuplicateRejected、Reach_StaleRejected、VolatileDedupe（都是 .cfg） | v2 | 无 |
| cli-entry（v2） | TerminalExit.tla | v1 | cli-entry v1 exit |
| 同上 | bad-echo、bad-invoke、bad-output、bad-restore、bad-tail（都是 .cfg） | v1 | 无 |
| client-ops（v2） | UseLifecycle.tla | v1 | client-ops v1 lifecycle |
| 同上 | bad-flatten.cfg | v1 | 无 |

**正文写明沿用旧版模型的**：

- OG v3 的 contract.md 链到 `../v1/formal/Affiliation.als`、`Membership.tla`、`README.md`。topic README 原句：「v3 只发布正文，沿用 v1 模型」。
- MRR v12 的 contract.md 链到 `../v2/formal/Invocation.tla` 和 `.cfg`；它的 `formal/README.md` 链到 `../../v9/formal/README.md`。
- AR v2 的 contract.md 链到 `../v1/formal/README.md`。
- identity-values 的 verification.md 链到 `OG v1/formal/README.md`。README 原句：结构约束「由**组织治理契约的结构模型**检查……本契约不另造一份平行模型」。
- 另有 12 份 topic 的 README/verification 链到旧版 formal/，其中 GCE 的 verification 11 个、session-log 的 verification 7 个。

## 8. record/ 里的现行决定（问题 7）

| 决定 | 路径 | 一句话 |
|---|---|---|
| D-023 | record/decisions/tenant-domain-design-acceptance/decision.md | 「已发布规格不可原地覆盖——评审期间『直接落在 v1 上』的做法**自本决定起终止**，改动发布 v2」；version_policy 改为 evolving |
| D-028 | record/decisions/governance-center-design-acceptance/decision.md、README.md | 「PF 再升 rev 带来语义变化时，已发布规格不可原地覆盖，发布新版本」；AI v1 与 v2 并存，不自动升级 |
| D-029 | record/decisions/governance-center-transport-binding-acceptance/decision.md | 「以 registry 为准（冻结不可原地改）」 |
| D-040 | record/decisions/governance-identity-offer-contracts/decision.md | 「账号v1/v2及邀约v1继续保留给精确旧消费者……推荐新版本不自动升级」 |
| D-055 | record/decisions/governance-online-maintenance-adoption/decision.md | 「冻结资源不原地覆盖旧v1/v2」 |
| D-061 | record/decisions/assets-runtimes-contract-acceptance/README.md | OG v3 不自动升级 v1 的消费者 |
| D-066 | record/decisions/pr9-pr10-coordinate-reconciliation/decision.md | 「旧版正式资源不就地覆写，保存在原 main 的完整快照；当前 catalog 只采用新坐标」；「**OG3 不是 OG2 的功能超集**」；「禁止……通过重算旧坐标 hash 让冲突消失」 |
| D-068 | record/decisions/core-implementation-spec-reconciliation/decision.md | 「推荐／接受新版本不自动升级任何消费者」 |
| D-069 | record/decisions/skill-yaml-key-resolution/decision.md | 「冻结 `data.skill-package/2` 三资源及既有记录不原地改。发布 …/3」 |
| D-070（模型绑定） | record/decisions/model-adaptation-binding-acceptance/decision.md | 「旧规范继续冻结」 |
| D-086 | record/decisions/model-runtime-tail-settlement-adoption/decision.md | 「保持冻结字节，旧条目及关系不覆写」 |
| D-090 | record/decisions/model-headers-v5-adoption/ | 「原根与历史消费者不自动升级」 |
| D-099 | record/decisions/model-input-limit-consumer-contract-adoption/decision.md | 「旧六版本与 MP3 的规范、冻结摘要及已发生证据保持原样」 |

- 2026-10-01「只保留最新一版」的裁决在这棵树的 record/ 里还没有记录：grep「只保留最新」「只留最新」「最新一版」，在 record/decisions、spec 和 registry 的 README 里都没有命中。
- 有一句相关的现行表述，在 `realization/packages/core/messages/public-definition-resource-closure-followup.md`：「不允许用『只留最新』跳过精确规范变更」。

## 9. 约束清单

每条格式：事实 ／ 出处 ／ 让什么做不了。

- **C1. 冻结、catalog、目录三者绑在一起。**
  - 事实：冻结按「含 vN 的文件路径 → SHA-256」逐文件登记；每个 frozen 路径必须是 catalog 资源，每个 accepted 资源必须已冻结。
  - 出处：`_frozen`、frozen.json。
  - 让什么做不了：版本目录、catalog 条目、frozen 条目必须同一次一起删；只删其中一样就会报 `frozen file changed`、`frozen path is not a catalog resource` 或 `accepted … not frozen`。
- **C2. `--previous-frozen` 只许追加。**
  - 事实：带这个参数时，旧清单里任何一项被删或被改都会失败。
  - 出处：`_frozen`；tooling/README「发布后只追加」。
  - 让什么做不了：删冻结登记，和这个参数的语义直接冲突。
- **C3. 冻结文件一字节都不能改。**
  - 事实：任何冻结文件的任何字节变化都会失败，检查器不区分最新版和旧版。
  - 出处：`_frozen`。
  - 让什么做不了：不能原地改最新版的冻结文件，哪怕只是改它指向旧版的链接或 `$ref`。
- **C4. 最新版依赖着旧版的 catalog 条目。**
  - 事实：依赖必须指向 catalog 里存在的坐标，accepted 的契约不能依赖非 accepted 的坐标；现在有 119 条边，38 个最新版指向 32 个旧版。
  - 出处：`_dependencies`。
  - 让什么做不了：既不能删这些旧版的 catalog 条目，也不能把它们改成 superseded；而最新版正文（已冻结）里同样写着这些依赖。
- **C5. Schema 的 `$id` 和 `$ref` 都和版本路径绑死。**
  - 事实：`$id` 由版本路径推出；`$ref` 只在已登记的 Schema 之间解析；13 份最新 Schema 有 31 条 `$ref` 边指向 14 个旧版。
  - 出处：`_schemas`；spec/README「路径即身份」。
  - 让什么做不了：删这些旧版会出现 `unresolved schema resource`；改 `$ref` 就撞上 C3；把 Schema 挪出 vN 路径，所有 `$id` 都会变。
- **C6. 两个检查器都核全部链接。**
  - 事实：`_markdown` 核设计根下全部 .md，冻结规格和 record 都在内；docs-check 核全仓 .md，只排除 legacy、retained 和 .templates。
  - 出处：`_markdown`；check_docs.py 的 `ROOTS`/`RETAINED`。
  - 让什么做不了：删旧版目录会断掉设计根内 9320 个链接（271 个文件）和设计根外 26 个链接（9 个文件）；其中 918 个在冻结的最新版文件里，改它们又撞上 C3。
- **C7. 冻结规格里有大量产品锚点。**
  - 事实：冻结规格里有 10721 个带锚点的产品链接，其中最新版 3534 个，`_markdown` 逐个核锚点。
  - 出处：第 6 节。
  - 让什么做不了：产品正文一改标题，冻结规格就报错，而冻结文件又不能改；原地修订规格时，这些链接和 rev 标注得一起动。
- **C8. 应用的 architecture.md 坐标要在 catalog 里。**
  - 事实：apps/cli 有 10 个旧坐标，apps/tenancy-host 有 6 个。
  - 出处：`check_coordinates`。
  - 让什么做不了：这两份文档改完之前，删 catalog 条目会让 design-check 失败。
- **C9. bindings 钉的是精确的旧条款，而且没人核。**
  - 事实：bindings 的 clause 是精确的 `contract/vN#S-n`；268 行指向旧版，13 个节点只绑旧版；检查器不核这些坐标。
  - 出处：realization/README「`clause` 精确契约坐标加条款号」；`check_bindings`。
  - 让什么做不了：删旧版时检查不会报错，但这些绑定会指向不存在的条款；要等价迁移就得逐条对到新的条款号。
- **C10. 形式任务和模型挂在旧版目录上。**
  - 事实：89 个任务的工件在旧版目录里，而工件必须存在且是 catalog 资源。
    - 61 个任务检的模型在 MRR v12 里字节相同，但 v12 没有对应任务。
    - OG v3 和 IV1 依赖 OG v1 的模型；MRR v12 正文链到 v2 的 Invocation 模型。
  - 出处：`_formal`；第 7 节。
  - 让什么做不了：删目录，任务就失败；删任务，就丢了这些模型唯一的登记；另有 28 个工件名在最新版里没有副本。
- **C11. 代码直接读旧规格和 frozen.json。**
  - 事实：约 25 个测试按版本路径读旧规格，比字节或比 frozen 哈希；约 20 个随包发布的 Schema `$id` 写着旧版路径；stream-assembly 和 core-verification 的测试直接读 frozen.json（前者还读 catalog）。
  - 出处：5.6。
  - 让什么做不了：删了之后 `make test` 和 `product-check` 都会失败；包的公开 Schema 还被其他包按旧 `$id` 解析。
- **C12. OG 的 v2 和 v3 是并列的两条线。**
  - 事实：v3 不是 v2 的超集；当前治理实现、AR2、EC2/EC3 钉 v2；资产转移 v2 钉 v3。
  - 出处：OG 的 topic README；D-066 第 3 条。
  - 让什么做不了：「按数字留最大」会删掉现行治理实现所钉的那一版。
- **C13. 有些需求只在旧版上有覆盖。**
  - 事实：2308 条 covers 指向旧版；6 份契约共 80 个需求条款只在旧版上有覆盖——OE 10、AI 23、OG 30、AR 12、cli-entry 1、client-ops 4。
  - 出处：covers.json。
  - 让什么做不了：删旧版后这些条款就没有覆盖目标了；check_design 不核 covers，只有 design-review 会报。
- **C14. 投影钉着旧版，模板又不许删旧投影。**
  - 事实：18 个投影版本引用旧版；provenance 按路径+提交+哈希钉住；投影模板写「旧版本保留……不删除」。
  - 出处：product/*/projection/；投影模板。
  - 让什么做不了：删旧版会断掉 3803 个投影链接（见 C6），provenance 只能靠提交号回溯。
- **C15. acceptance 声明记着旧字节的哈希。**
  - 事实：acceptance 声明里有 74 个旧版坐标、587 个旧版资源哈希；每个 accepted 条目必须在声明里恰好出现一次。
  - 出处：record/decisions/*/acceptance.json；`_acceptance`。
  - 让什么做不了：原地修订之后，声明里的哈希描述的是旧字节；检查器不比对这些哈希，而 record 按规矩不改。
- **C16. version-migrations 没人核。**
  - 事实：146 条资源映射，其中 74 处旧版路径，检查器不读这份文件。
  - 出处：registry/README。
  - 让什么做不了：删旧版之后，这份登记会指向不存在的文件，也没有任何检查会提醒。
- **C17. 现有的 gate 承载不了删版本。**
  - 事实：GATE 只作用于空的 lineage.json；常规检查也不传 PREVIOUS_FROZEN。
  - 出处：design_validation.py、Makefile、check.sh。
  - 让什么做不了：现有的 gate 机制里，没有能承载「删版本」这件事的门。
- **C18. 批量改动时一次只看得到一处失败。**
  - 事实：冻结、catalog、形式任务三类判定每类只报第一处错误。
  - 出处：循环里的 raise。
  - 让什么做不了：批量删改时，一次只能看到一处失败。
- **C19. 形式化维护没有机器判据兜底。**
  - 事实：文档说「新增模型没有任务覆盖就判失败」，但代码里没有这项判定；最新版有 13 个模型没有任务。
  - 出处：docs/verification.md 与 design_validation.py。
  - 让什么做不了：「形式化正版持续维护」目前没有机器判据兜底。
- **C20. spec 的目录形状被声明为不变。**
  - 事实：spec 目录形状声明不变，`$id` 和 frozen 键都以 `spec/{family}/{topic}/v{version}/` 为准。
  - 出处：spec/README「路径即身份」。
  - 让什么做不了：去掉 vN 段，会同时改动全部 `$id`、frozen 键、任务路径和代码里的读取路径。
- **C21. registry/README 的计数过时。**
  - 事实：README 里的计数还是 63/351/1496/37，实际是 109/1104/3352/122。
  - 出处：registry/README.md。
  - 让什么做不了：以 README 为据描述现状会出错。
- **C22. 现行决定都写着「旧版保留」，新裁决还没进 record。**
  - 事实：第 8 节那些决定都写着旧版保留、不改、不自动升级；10-01 的新裁决还没有记录。
  - 出处：第 8 节。
  - 让什么做不了：新决定登记之前，这些仍是 record 里的现行依据。
- **C23. 检查器拦不住正文文字。**
  - 事实：D-066 已经让 33 个 v1 目录消失（原字节只留在固定快照和哈希里），但仍有 4599 处文字引用指向它们，检查照样通过。
  - 出处：5.10；D-066。
  - 让什么做不了：检查器只拦链接和登记文件，拦不住正文里的路径和坐标文字。

## 10. 没覆盖到的

- **简称引用**：RT12、MS8、OG2、AI1、EC3 这类简称没有数。例如 apps/tenancy-host/README.md 里写「当前已接入 AI3/OG2/AR2/OE2 与 EC3/HT3」。
- **脚本拼出来的路径**：只核了 5.6 列出的那几个测试；从 `$id` 反推路径的测试，没有展开到每一个资源。
- **跳过的 207 个二进制或大文件**（.tar.gz、.tgz、.bin）：没有解包。
- **record/evidence 的 17949 处**：只按目录计了数，没有区分快照、日志和叙述，也没有核哪些证据声称能按当前树复现。
- **evaluation 用例集**：【推断】它们按 flow.json 里 `base` 字段指定的固定提交取材料，不依赖当前树；没有读 roleeval 的代码确认。
- **语义层面**：没有判断旧条款和新条款是否等价，也就没有判断 bindings、covers、依赖能不能逐条对号迁移。
- **相邻的两条分支**：没有比较它们的 spec 和 registry。
- **design-review 的 stale-product-rev 实际会报多少条**：没跑（任务要求不跑 make），第 6 节只给了文本计数。
- **docs-check 的锚点**：没有读 `doc_support.validate_link`，不确定它是否也核锚点。

## 中间数据

盘点时落在主检出 `tmp/clean-loop/inventory-spec-versions/`（没有入库；其中逐旧版的消费者表随包保留为[附表](old-version-consumers.md)）：

| 文件 | 内容 |
|---|---|
| `ls-files.txt` | 本次扫描用的 git ls-files 列表 |
| `spec-versions.json` | 每个版本目录的文件清单、分类，以及与 catalog/frozen 的对照 |
| `per-version-table.md` | 附录 A：逐版本文件分类 |
| `refs.json` | 全部 83445 条引用记录 |
| `old-refs-surviving.json`、`old-version-consumers.json`、`old-version-consumers-table.md` | 5.8 的源数据与完整表 |
| `latest-consumers-table.md` | 5.9 的完整表 |
| `catalog-deps.json` | 743 条依赖边 |
| `formal-tasks-by-version.json`、`old-tasks-vs-latest.json`、`formal-old-vs-latest.json` | 第 7 节的源数据 |
| `realization-old-refs.json`、`realization-table.md`（附录 B）、`realization-nodes.txt` | 5.3 的源数据 |
| `code-refs.json`、`code-path-lines.json` | 5.6 的源数据 |

用到的脚本在会话的 scratchpad 里（inv1/refs/agg2/reg/formal/formal2/schemaref/consumers/codelines/backlinks/oldtable/latestrev/bind/arch/acc.py），不在仓库里。