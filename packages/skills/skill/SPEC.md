# @omne-harness/skill 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `@omne-harness/skill-contract` 的 `src/`，本包只加一个类型 `SkillPorts`。三个服务的行为条款归契约与组页，本文件不复制它们，只写本包怎样切分、哪些地方由本包决定。公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本规格是候选，尚未取得技术接受。「本版本」指成员版本 0.0.0。

| 依据 | 修订 | 本规格采用的范围 |
| --- | --- | --- |
| [契约 SPEC](../skill-contract/SPEC.md) | 与本文件同一提交 | 「检查 Skill 包」全节；「读取的形状规则」全节（含 `bodyOffsetOf` 与请求终点）；「需求端口」的映射补充与「端口答复的统一处置」；「目录的匹配规则」；「符合性套件」的 `skillAccessConformance` 与 `skillCatalogConformance` |
| [组工程设计](../docs/architecture.md) | `b0f2ec7fb` | 「端口」的映射表；「检查与发现」；「读取」的 11 步与版本语义；「失败种类」 |
| W2 Skill 线实施规格与第 1 轮评审裁定 | 2026-11-03 | 已定事项 1–10、15、16，其中 3（`gate` 收 `signal`）与 8（`describe` 带依据时依据所指材料）按第 1 轮裁定修正；映射三列；请求终点；读取判定答复在集合外答 `unknown` |
| W3 Skill 线实施规格（reduce 裁定）、第 2 轮裁定 R1–R3、R5、R7 与第 3 轮裁定 S1、S3 | 2026-11-04 | 已定事项 1–5、7、8（实现部分）、10（删除重复定义）、13；端口答复在边界上完整解析（R1）；空的 `capabilities`（R2）；重复身份保留第一条（R3）。端口 reject 与畸形答复的统一处置取代 W2 的「端口抛出的错误原样抛出」 |
| W3 闭包 w3-skill-fix 的 reduce 裁定（卡 #1119 r1） | 2026-11-04 | 裁定 1（引用身份一致，S7）、2（`inspect` 的映射按调用点分格）、3（没有合法头部的正文）、4（中止的前提）、6（成员导航） |

## 结果与不变量

<a id="stages"></a>

### 阶段

组页「读取」的 11 步切成下面的阶段。每个阶段是 `src/access/` 的一个导出函数，只依赖端口参数，可以单独测。

| 阶段 | 步 | 失败类型 | 结束于此的操作 |
| --- | --- | --- | --- |
| `gate(ports, access, scope, capability, basis?, signal?)` | 1、2、3 | `DescribeFailure`，带 `signal` 时加 `aborted` | `describe`（不传 `signal`） |
| `materialOf(gated)` | 5 | `unsupported` | — |
| `pin(ports, gated, material, moved, signal?)` | 7 | 快照映射的三种、`aborted`，以及调用方交来的 `moved`（`adopted-material-changed` 或 `basis-unavailable`） | `list` |
| `verifiedBytes(ports, pinned, entry, signal?)` | 10 | `open` 映射的五种、`version-changed`、`aborted` | `read`、`export` |

- 第 4 步（`describe` 的结果）、第 6 步（`read` 的路径校验）、第 8 步（`list` 的结果）、第 9 步（条目查找）与第 11 步（字节范围）在 `service.ts` 的操作里。`read` 的次序是：范围校验（抛 `TypeError`）→ 第 1–3 步 → 第 5 步 → 第 6 步 → 第 7 步 → 第 9 步 → 第 10 步 → 第 11 步，与组页一致：不带依据时，没有可读的包加坏路径答 `unsupported`。带依据时第 5 步总是通过（端口带回依据的内容摘要，PR3），所以没有可读包的材料加坏路径答 `bad-path`；这一处取代组页第 5 步「带不带依据都答 `unsupported`」，见契约[与组页的差异](../skill-contract/SPEC.md#group-differences)。无权主体加坏路径答 `not-available-to-you`，坏路径加材料已变答 `bad-path`。
- 「材料已变」的失败值由操作交给 `pin`：`read`、`list` 不带依据时是 `adopted-material-changed`，带依据时是 `basis-unavailable`；`export` 总是 `basis-unavailable`。编译器据此证明 `export` 不会答 `adopted-material-changed`。
- 每次操作新调用各阶段，调用之间不保留任何判定结果。

<a id="mapping"></a>

### 映射

来源答复到服务失败只有一张表，`src/mapping.ts` 的 `sourceFailureTo`。三列：`inspect`、`snapshot` 与 `open`（`read`、`list`、`export` 的两次来源调用）。`inspect` 一列按它的两个调用点（`snapshot` 与 `open`）各有一格，`sourceFailureTo('inspect', failure, call)` 收调用点；另两列收 `basis`。表的内容是组页「端口」的映射表加契约「需求端口」的映射补充，这里不复制。

- 快照阶段的 `entry-not-found` 与 `bytes-mismatch` 在每个操作里都答 `source-unavailable`，`inspect` 也是：快照不对某一个条目作答，这样作答的来源不守端口契约，本包把它当作此刻不可用（第 1 轮裁定；w3-skill-fix 裁定 2 把 `inspect` 的这一格从 `version-changed` 改成同一理由的 `source-unavailable`）。
- `version-changed` 只出现在 `open` 一格：快照列出的条目的字节变了。

对应端口的五种答复在 `gate` 里映射，不在表里：`adopted` 通过，`known-unavailable` 组装替换件，`basis-not-lawful` 答 `basis-unavailable`，`none` 答 `not-available-to-you`，`unknown` 答 `unknown`。

<a id="closed-sets"></a>

### 端口答复在运行期也封闭

编译器只证明端口类型的封闭集合，运行期不证明。本包在边界上把每个端口答复完整解析一次，核对的内容见契约[端口答复的统一处置](../skill-contract/SPEC.md#port-answer-closed)。

- 每个端口方法有一个解析函数：`src/port-answer.ts` 的 `parseVerdict`（`check`）、`parseResolution(request)`（`resolve`）与 `parseLawfulSet`（`adopted`）；来源两处由 `src/source-answer.ts` 的 `sourceAnswer` 核对，`snapshot` 的 `ok` 经契约的 `isSealedSnapshot`，`open` 的 `ok` 经 `isBytes`（`Uint8Array`）。载荷字段的解析在 `src/answer-values.ts`。
- 解析函数交出重新构造的值。能力标识经 `capabilityId` 重新构造，品牌值只经契约的守卫取得，端口对象本身不往下传，所以端口事后改它的对象也改不了已解析的值。
- `answered(call, parse)` 在同一个 `try` 里调用端口并解析答复。reject、同步抛出、解析不收与读取答复时抛出，都答 `undefined`，即没有作答。代价：本包解析代码自己抛出的异常也算没有作答。方向是拒绝而不是放行，调用方看到的是「此刻无法判定」（`unknown`，来源一侧是 `source-unavailable`），看不到本包的缺陷。被吞掉的异常没有诊断出口，这一点留给与观测拥有者的后续议题。
- 判别字段与载荷字段只认答复对象的自有属性。脚本参数的 JSON 树逐节点重新构造并冻结，嵌套不超过契约的 `DECLARATION_LIMITS.maxDepth`；每层只递归一次，所以深的或成环的树在上限处结束，不会栈溢出。
- 读取判定或对应端口没有作答时，`gate` 与目录都答 `unknown`，不放行。`adopted` 的答复有一项不合时，目录整次答 `unknown`。来源没有作答时当作 `unavailable`，再按映射表的那一行处置。
- 引用身份一致（S7）：`parseResolution` 收请求（身份与可选的依据），只放行关于它的答复：`adopted` 的引用指向所请求的身份，带依据时来源层、资产版本（依据带时）与内容摘要等于依据的（引用必须带内容摘要）；`known-unavailable` 的能力标识是所请求的身份。不合的答复与畸形答复同样是没有作答，`gate` 答 `unknown`，不调用来源。核对在边界解析里做一次，`gate` 的分支与之后的阶段不再判断。条款见契约[端口答复的统一处置](../skill-contract/SPEC.md#port-answer-closed)。
- 解析之后的值才进入服务的逻辑。`gate` 与目录按封闭集合 `switch`，`default` 分支以 `never` 做编译期穷尽：端口类型新增一种答复而这里没有分支时，编译失败。

<a id="no-disclosure"></a>

### 无披露

第 1 步依据的能力标识不等于目标、第 2 步 `refused`、第 3 步 `none`：三条路径都答同一个冻结的对象 `{ kind: 'not-available-to-you' }`，没有 `detail`。第 1 步不调用端口。

<a id="basis"></a>

### 依据所指的材料

`describe` 带依据且对应端口答 `adopted` 时，`material.basis` 就是调用方交来的依据（能力标识、来源层、资产版本与内容摘要都取依据的）；不带依据时取 `SkillRef` 的。`read`、`list`、`export` 所钉的材料用同一规则（`materialOf`），结果里的 `basis` 是所钉材料。边界解析已保证引用与依据在能力标识、来源层与内容摘要上一致；依据不带资产版本而引用带时，所钉材料也不带资产版本。

<a id="body"></a>

### 正文与范围

- `read` 正文时，第 10 步核对整个 `SKILL.md` 条目，第 11 步从契约 `bodyOffsetOf(bytes)` 给出的正文起点切页。
- 字节没有合法的头部定界时，`bodyOffsetOf` 答 `undefined`，`read` 正文答 `source-unavailable`，不交内容（w3-skill-fix 裁定 3，取代第 1 轮的「整个条目当作正文」）。理由：正文起点不明的字节不是已知的正文，把它当正文会交出头部之外的未知字节。可达条件：所钉材料来自 `inspect` 通过的包时不可达，因为第 10 步核对了条目摘要，而 `inspect` 拒绝没有合法头部的 `SKILL.md`；只有资产记下的内容摘要不来自检查通过的包时才可达。这时来源交出的不是一个可用的 Skill 包，所以答「来源此刻不可用」。同一材料的资源不受影响。
- 字节范围由 `src/access/range.ts` 的纯函数 `sliceRange(bytes, encoding, requested?, bodyOffset?)` 实现，逐条按契约「读取的形状规则」。请求终点是请求起点加请求长度，不随实际起点后移而变；实际终点前移到不大于请求终点的上一个字符边界，早于实际起点时实际范围为空。文本条目的编码只有快照说的 `text`（严格 UTF-8）一种，字符边界按 UTF-8 续字节判断。
- 范围的起点或长度为负数或非整数时，`read` 在调用任何端口之前抛 `TypeError`。

<a id="inspect"></a>

### 检查

`createPackageInspection(source)` 的 `inspect`：一次 `snapshot`；只对快照列出的控制文件各调一次 `open`，带快照的内容摘要；把快照、控制字节与 `expectedName` 原样交给 `parseSkillPackage`。控制字节与快照是否对应由 `parseSkillPackage` 核对，本包不重复核对。来源失败按映射表的 `inspect` 列，按调用点取格。检查结果里的兼容提示由契约的 `parseSkillPackage` 给出，本包原样交出。

<a id="catalog"></a>

### 目录

`createSkillCatalog(ports)` 收 `SkillPorts` 的 `readCheck` 与 `resolution` 两项，不收来源：目录不读字节。规则归契约[目录的匹配规则](../skill-contract/SPEC.md#catalog-search)，这里只写本包怎样做。

1. `summaries` 给出空的 `capabilities` 时直接答空列表，不调用任何端口。
2. `SkillResolution.adopted(access, scope)` 给出当前合法集合，经 `parseLawfulSet` 解析。它答 `unknown` 或没有作答时整次答 `unknown`；答空集合时答空列表。
3. 每个答复按组页「检查与发现」组装成条目：`adopted` 带 `declared.tools` 作为 `dependencies`，`known-unavailable` 带最后合法的 name、说明与原因。`description` 缺省时条目没有这个字段。同一能力标识（`sameCapability`）只保留端口答复中的第一条。条目先按能力标识的类别、再按名字排序（UTF-16 码元序），使同一输入得到同一输出；次序不是承诺。
4. 过滤先于核验：`summaries` 带 `capabilities` 时只留请求里的身份，请求里的重复不产生重复条目；`search` 只留 `src/match.ts` 的 `matches(query.text, name, description)` 为真的身份。
5. 对留下的每个身份调用 `SkillReadCheck.check`。调用一起发出（`Promise.all`），答复按条目次序读取，所以完成次序不改变结果。全部答复都是 `granted` 或 `refused` 时，只交 `granted` 的条目；任一答复是 `unknown` 或没有作答时整次答 `unknown`，不压成空列表。

无披露见契约 [SC7](../skill-contract/SPEC.md#catalog-search)。

## 所有权、失败与生命周期

本包没有状态、没有资源、没有外部效果。三个工厂交出普通对象，没有要释放的东西。三个端口的所有权归集成方。

- 取消：`read`、`list` 与 `export` 在每次调用端口（`check`、`resolve`、`snapshot`、`open`）之前与每次端口返回之后各查一次 `signal`（`src/access/checkpoint.ts`）。已中止时答 `aborted`，不再调用端口，不交部分内容；已中止的 `signal` 使四个端口都不被调用。端口自己收不到 `signal`，一次已经发出的端口调用由端口跑完。`describe` 不收 `signal`。
- 中止的活性有一个前提：每次端口调用都会结束（性质账本 P0）。中止的响应时间受端口时间限制；端口不结束时，操作不答复。本包不让端口调用与 `signal` 竞争：竞争会让迟到的答复无主，这是与端口拥有者的后续议题（w3-skill-fix 裁定 4，GS-05）。
- 不交部分内容：`aborted`、`version-changed` 与 `export` 的任一条目失败都只交失败对象，结果里没有内容字段。
- 抛出：只有字节范围非法时抛 `TypeError`（调用方的错误，在任何端口之前）。来源的 `snapshot` 交来不是 `sealSnapshot` 造出的快照时，`inspect` 先经 `isSealedSnapshot` 核对，答 `source-unavailable`，不把它交给 `parseSkillPackage`。端口 reject、同步抛出或答复不合时本包不抛出：读取判定与对应端口当作 `unknown`，来源当作 `unavailable`，见[端口答复在运行期也封闭](#closed-sets)与契约[端口答复的统一处置](../skill-contract/SPEC.md#port-answer-closed)。
- 目录：`createSkillCatalog` 交出普通对象，不收 `signal`，不持有资源。一起发出的读取判定由端口各自跑完。

## 组合与验证

| 义务 | 测试 | 反例（改了什么会红） |
| --- | --- | --- |
| 公开根只导出三个工厂；每个阶段只答它那几步的失败种类；`export` 不会答 `adopted-material-changed` | `tests/public-entry.spec.ts`、`tests/types.spec-d.ts` | 多导出一个名字；把 `pin` 的 `moved` 改成固定联合 |
| 映射表的每一行、三列，`inspect` 按调用点的两格 | `tests/mapping.spec.ts` | 任一格改值（M1：检查列 `entry-unreadable` → `outside-package`）；检查的快照格 `bytes-mismatch` 改回 `version-changed`（F3） |
| `inspect` 对合法包与每种来源失败（快照与 `open` 各一张表），只读快照列出的控制文件 | `tests/inspection.spec.ts` | 不读 `.omne/skill.json`（M11）；open 失败当作文件不在（M15）；检查不分调用点（F3） |
| 引用身份一致：别的身份、别的类别、带依据时别的来源层、资产版本与内容摘要，替换件的别的身份，都答 `unknown` 且不调用来源；一致的引用照常通过 | `tests/ref-identity.spec.ts`、`tests/answer-parse.spec.ts` | 去掉身份核对（F1a）、来源层核对（F1b）、资产版本核对（F1c）、内容摘要核对（F1d）、替换件身份核对（F1e） |
| 没有合法头部的 `SKILL.md` 正文答 `source-unavailable`，同一材料的资源照读 | `tests/read.spec.ts` | 正文起点退回 0（F4） |
| 第 1–3 步每个分支；集合外答复；两次端口调用前后的检查点 | `tests/gate.spec.ts` | 第 2 步注释掉（M5）；`none` 答 `unknown`（M12）；集合外答复放行；去掉任一检查点 |
| `describe` 的两态、依据所指材料、不读字节 | `tests/describe.spec.ts` | 依据的 digest 改取 `SkillRef` 的 |
| 第 5、7 步每个分支与中止 | `tests/pin.spec.ts` | 去掉快照摘要比较（M2）；`unsupported` 改答别的（M13） |
| 第 10 步每个分支与中止 | `tests/bytes.spec.ts` | 去掉条目摘要比较（M7） |
| 字节范围六条规则、请求终点、正文起点 | `tests/range.spec.ts` | 终点不前移（M4）；请求终点按实际起点算（P5） |
| `read` 与 `list` 的次序（第 5 步在第 6 步前、范围校验在端口前）、失败、不缓存 | `tests/read.spec.ts` | 第 6 步提到第 5 步前；忽略正文起点（M10）；不过滤控制文件（M9） |
| `export` 整包或失败 | `tests/export.spec.ts` | 跳过失败条目（M8） |
| 没有可读包的材料带依据（PR3）：`describe` 交回依据，`read`、`list`、`export` 取快照后答 `basis-unavailable` 且不 `open`，坏路径答 `bad-path` | `tests/no-package.spec.ts` | 内存解析对无包材料不带回依据的内容摘要（第 3 轮手工变异 R3-2，5 例变红） |
| `skillAccessConformance()` 在本实现上、在两个世界（对应端口对 stranger 隐藏 / 对所有人作答）全绿；跳过第 2 步的服务在后者恰好 A1–A3 变红 | `tests/conformance.spec.ts` | 第 2 步注释掉（M5） |
| `skillCatalogConformance()` 在本实现上全绿（`NotApplicable` 计为失败）。把 `refused` 也列出的实现恰好红四条：SC3「lists a granted identity and not a refused one」、SC5「filters to the identities of the request that are lawful and granted」与 SC7 的两条。把 `unknown` 压成空列表的实现恰好红两条：SC2「answers unknown when the lawful set is unknown」与 SC3「answers unknown when the read check of one identity is unknown」。核验按两种完成次序释放时答复相同 | `tests/catalog.spec.ts`、`tests/catalog-world.ts` | 过滤 `granted` 改成过滤非 `unknown`（W3-M1）；任一 `unknown` 改答空列表（W3-M2）；去掉排序（W3-M5）；匹配忽略说明（W3-M13）；只规范化查询一侧（W3-M14） |
| 空的 `capabilities` 不调用任何端口；合法集合里重复的身份保留第一条 | `tests/catalog.spec.ts` | 去掉空请求的直接作答（W3-M23）；保留最后一条（W3-M24） |
| `matches` 的规范化、分词与全词命中 | `tests/match.spec.ts` | 去掉 NFKC（W3-M3） |
| 三个解析函数逐字段的畸形答复（缺失、类型不对、值域外）、只认自有属性、JSON 树的重新构造、冻结、深度上限与数字词法 | `tests/answer-parse.spec.ts` | 删掉任一字段的核对、放宽它的值域、改认原型链上的属性、去掉深度上限（第 3 轮的差分变异） |
| 三类端口的判别值与载荷：集合外的答复、残缺的载荷、reject、同步抛出、读取时抛出，答复都按契约统一处置，不抛出 | `tests/port-answers.spec.ts` | 来源调用还原为直接查表、reject 原样上抛（W3-M4）；解析移出 `try`（W3-M17、W3-M17b）；列表跳过不合的项（W3-M18）；`open` 的 `ok` 接受文本（W3-M19）；`isSealedSnapshot` 不查登记（W3-M20）；JSON 节点不核对（W3-M21）；说明上限放宽一个字符（W3-M22b）；没有作答的核验当作 `refused`（W3-M25） |

M 与 F 编号是交付时的手工变异记录（W2 在 `tmp/closures/w2-skill/mutations/`，W3 在 `tmp/closures/w3-skill-catalog/mutations/`，F 在 `tmp/closures/w3-skill-fix/mut/`），不随本文件维护。未覆盖：真实的读取判定、对应与来源；对同一个包的并发写入；内容存储来源；大集合下目录的性能。替身通过不证明真实端口的行为。

<a id="properties"></a>

## 性质与证据

下面七条性质是本包读取与目录的关键安全性质。完整的定理（参与者、前提、结论）、证据与状态由[性质账本](verification/README.md#ledger)维护，本节只给每条的结论与证据状态。共同前提：每次端口调用都会结束；两个判定端口对无权主体守 PC3、PR5。对应端口的引用可以指向别的身份或别的材料，这时由 S7 处置；剩下的前提只有一条：引用写明的身份与它的包定位、内容摘要相符，本包无从核对它（性质账本 S7 的前提 R1）。

| 性质 | 结论 | TLA+ 模型 | 探索器 |
| --- | --- | --- | --- |
| S1 无披露 | 对没有读取权的主体，身份存在且被拒、读取判定准许而对应端口不认识、身份被删除三种世界，六个操作的答复深度相等；依据指向另一身份时与被拒读取同答 | 有限范围通过 | 有限范围通过 |
| S2 整次 unknown | 第一个没有作答的端口答复决定整次答复：判定端口为 `unknown`，来源为 `source-unavailable`；之后不再调用端口，不抛出；目录对留下的身份同样整次 `unknown` | 有限范围通过 | 有限范围通过 |
| S3 不拼版本 | 成功的 `read`、`list`、`export` 只交所钉材料的字节，结果的依据等于所钉材料；来源途中变化时答失败，失败不带内容 | 有限范围通过 | 有限范围通过 |
| S4 范围正确 | 实际范围的两端在字符边界上，长度不超过 `PAGE_LIMIT`，`complete` 当且仅当终点不小于总长，正文从 `bodyOffsetOf` 起算；非法范围在端口之前抛 `TypeError` | 模型未覆盖 | 有限范围通过 |
| S5 次序无关 | 目录的答复不随读取判定的完成次序变化 | 有限范围通过 | 有限范围通过 |
| S6 中止不交部分 | `signal` 在第 `k` 个端口答复时中止，操作恰好调用 `k` 次端口并答 `aborted`；中止的 `signal` 上从不调用端口 | 有限范围通过 | 有限范围通过 |
| S7 引用身份一致 | 成功的操作只交所请求身份的材料：结果的身份是所请求的身份，交出的字节来自该身份的材料。引用指向别的身份，或带依据时指向别的材料，整次答 `unknown`，不调用来源 | 有限范围通过 | 有限范围通过 |

模型是 [verification/models/ReadGate.tla](verification/models/ReadGate.tla)，在 TLC 2.19 上检查，配置与状态数见 [verification/models/README.md](verification/models/README.md)。探索器在 [tests/model/](tests/model/README.md)，驱动 `dist` 中的真实服务，端口是内存替身加故障包装。两者都是有限范围的结果，不是无条件证明。真实端口与本包的组合没有验证。
