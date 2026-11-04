# @omne-harness/skill 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `@omne-harness/skill-contract` 的 `src/`，本包只加一个类型 `SkillPorts`。三个服务的行为条款归契约与组页，本文件不复制它们，只写本包怎样切分、哪些地方由本包决定。公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本规格是候选，尚未取得技术接受。「本版本」指成员版本 0.0.0。

| 依据 | 修订 | 本规格采用的范围 |
| --- | --- | --- |
| [契约 SPEC](../skill-contract/SPEC.md) | 与本文件同一提交 | 「检查 Skill 包」全节；「读取的形状规则」全节（含 `bodyOffsetOf` 与请求终点）；「需求端口」的映射补充与「端口答复的统一处置」；「目录的匹配规则」；「符合性套件」的 `skillAccessConformance` 与 `skillCatalogConformance` |
| [组工程设计](../docs/architecture.md) | `b0f2ec7fb` | 「端口」的映射表；「检查与发现」；「读取」的 11 步与版本语义；「失败种类」 |
| W2 Skill 线实施规格与第 1 轮评审裁定 | 2026-11-03 | 已定事项 1–10、15、16，其中 3（`gate` 收 `signal`）与 8（`describe` 带依据时依据所指材料）按第 1 轮裁定修正；映射三列；请求终点；读取判定答复在集合外答 `unknown` |
| W3 Skill 线实施规格（reduce 裁定）与第 2 轮裁定 R1–R3、R5、R7 | 2026-11-04 | 已定事项 1–5、7、8（实现部分）、10（删除重复定义）、13；端口答复在边界上完整解析（R1）；空的 `capabilities`（R2）；重复身份保留第一条（R3）。端口 reject 与畸形答复的统一处置取代 W2 的「端口抛出的错误原样抛出」 |

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

- 第 4 步（`describe` 的结果）、第 6 步（`read` 的路径校验）、第 8 步（`list` 的结果）、第 9 步（条目查找）与第 11 步（字节范围）在 `service.ts` 的操作里。`read` 的次序是：范围校验（抛 `TypeError`）→ 第 1–3 步 → 第 5 步 → 第 6 步 → 第 7 步 → 第 9 步 → 第 10 步 → 第 11 步，与组页一致：没有可读的包加坏路径答 `unsupported`，无权主体加坏路径答 `not-available-to-you`，坏路径加材料已变答 `bad-path`。
- 「材料已变」的失败值由操作交给 `pin`：`read`、`list` 不带依据时是 `adopted-material-changed`，带依据时是 `basis-unavailable`；`export` 总是 `basis-unavailable`。编译器据此证明 `export` 不会答 `adopted-material-changed`。
- 每次操作新调用各阶段，调用之间不保留任何判定结果。

<a id="mapping"></a>

### 映射

来源答复到服务失败只有一张表，`src/mapping.ts` 的 `sourceFailureTo(op, failure, basis?)`。三列：`inspect`（不收 `basis`）、`snapshot` 与 `open`（`read`、`list`、`export` 的两次来源调用）。表的内容是组页「端口」的映射表加契约「需求端口」的映射补充，这里不复制；`snapshot` 列对 `entry-not-found` 与 `bytes-mismatch` 答 `source-unavailable`：快照不对某一个条目作答，这样作答的来源不守端口契约，本包把它当作此刻不可用（第 1 轮裁定，组页波末补行）。

对应端口的五种答复在 `gate` 里映射，不在表里：`adopted` 通过，`known-unavailable` 组装替换件，`basis-not-lawful` 答 `basis-unavailable`，`none` 答 `not-available-to-you`，`unknown` 答 `unknown`。

<a id="closed-sets"></a>

### 端口答复在运行期也封闭

编译器只证明端口类型的封闭集合，运行期不证明。本包在边界上把每个端口答复完整解析一次，核对的内容见契约[端口答复的统一处置](../skill-contract/SPEC.md#port-answer-closed)。

- 每个端口方法有一个解析函数：`src/port-answer.ts` 的 `parseVerdict`（`check`）、`parseResolution`（`resolve`）与 `parseLawfulSet`（`adopted`）；来源两处由 `src/source-answer.ts` 的 `sourceAnswer` 核对，`snapshot` 的 `ok` 经契约的 `isSealedSnapshot`，`open` 的 `ok` 经 `isBytes`（`Uint8Array`）。载荷字段的解析在 `src/answer-values.ts`。
- 解析函数交出重新构造的值。能力标识经 `capabilityId` 重新构造，品牌值只经契约的守卫取得，端口对象本身不往下传，所以端口事后改它的对象也改不了已解析的值。
- `answered(call, parse)` 在同一个 `try` 里调用端口并解析答复。reject、同步抛出、解析不收与读取答复时抛出，都答 `undefined`，即没有作答。
- 读取判定或对应端口没有作答时，`gate` 与目录都答 `unknown`，不放行。`adopted` 的答复有一项不合时，目录整次答 `unknown`。来源没有作答时当作 `unavailable`，再按映射表的那一行处置。
- 解析之后的值才进入服务的逻辑。`gate` 与目录按封闭集合 `switch`，`default` 分支以 `never` 做编译期穷尽：端口类型新增一种答复而这里没有分支时，编译失败。

<a id="no-disclosure"></a>

### 无披露

第 1 步依据的能力标识不等于目标、第 2 步 `refused`、第 3 步 `none`：三条路径都答同一个冻结的对象 `{ kind: 'not-available-to-you' }`，没有 `detail`。第 1 步不调用端口。

<a id="basis"></a>

### 依据所指的材料

`describe` 带依据且对应端口答 `adopted` 时，`material.basis` 就是调用方交来的依据（能力标识、来源层、资产版本与内容摘要都取依据的）；不带依据时取 `SkillRef` 的。`read`、`list`、`export` 所钉的材料用同一规则（`materialOf`），结果里的 `basis` 是所钉材料。

<a id="body"></a>

### 正文与范围

- `read` 正文时，第 10 步核对整个 `SKILL.md` 条目，第 11 步从契约 `bodyOffsetOf(bytes)` 给出的正文起点切页。字节没有合法的头部定界时，`bodyOffsetOf` 答 `undefined`，本包把整个条目当作正文，不另报失败（第 1 轮裁定，组页第 11 步波末写明）。
- 字节范围由 `src/access/range.ts` 的纯函数 `sliceRange(bytes, encoding, requested?, bodyOffset?)` 实现，逐条按契约「读取的形状规则」。请求终点是请求起点加请求长度，不随实际起点后移而变；实际终点前移到不大于请求终点的上一个字符边界，早于实际起点时实际范围为空。文本条目的编码只有快照说的 `text`（严格 UTF-8）一种，字符边界按 UTF-8 续字节判断。
- 范围的起点或长度为负数或非整数时，`read` 在调用任何端口之前抛 `TypeError`。

<a id="inspect"></a>

### 检查

`createPackageInspection(source)` 的 `inspect`：一次 `snapshot`；只对快照列出的控制文件各调一次 `open`，带快照的内容摘要；把快照、控制字节与 `expectedName` 原样交给 `parseSkillPackage`。控制字节与快照是否对应由 `parseSkillPackage` 核对，本包不重复核对。来源失败按映射表的 `inspect` 列，不分调用点。

<a id="catalog"></a>

### 目录

`createSkillCatalog(ports)` 收 `SkillPorts` 的 `readCheck` 与 `resolution` 两项，不收来源：目录不读字节。规则归契约[目录的匹配规则](../skill-contract/SPEC.md#catalog-search)，这里只写本包怎样做。

1. `summaries` 给出空的 `capabilities` 时直接答空列表，不调用任何端口。
2. `SkillResolution.adopted(access, scope)` 给出当前合法集合，经 `parseLawfulSet` 解析。它答 `unknown` 或没有作答时整次答 `unknown`；答空集合时答空列表。
3. 每个答复按组页「检查与发现」组装成条目：`adopted` 带 `declared.tools` 作为 `dependencies`，`known-unavailable` 带最后合法的 name、说明与原因。`description` 缺省时条目没有这个字段。同一能力标识（`sameCapability`）只保留端口答复中的第一条。条目按能力标识的规范文本 `<category>:<name>` 排序，使同一输入得到同一输出；次序不是承诺。
4. 过滤先于核验：`summaries` 带 `capabilities` 时只留请求里的身份，请求里的重复不产生重复条目；`search` 只留 `src/match.ts` 的 `matches(query.text, name, description)` 为真的身份。
5. 对留下的每个身份调用 `SkillReadCheck.check`。调用一起发出（`Promise.all`），答复按条目次序读取，所以完成次序不改变结果。全部答复都是 `granted` 或 `refused` 时，只交 `granted` 的条目；任一答复是 `unknown` 或没有作答时整次答 `unknown`，不压成空列表。

无披露见契约 [SC7](../skill-contract/SPEC.md#catalog-search)。

## 所有权、失败与生命周期

本包没有状态、没有资源、没有外部效果。三个工厂交出普通对象，没有要释放的东西。三个端口的所有权归集成方。

- 取消：`read`、`list` 与 `export` 在每次调用端口（`check`、`resolve`、`snapshot`、`open`）之前与每次端口返回之后各查一次 `signal`（`src/access/checkpoint.ts`）。已中止时答 `aborted`，不再调用端口，不交部分内容；已中止的 `signal` 使四个端口都不被调用。端口自己收不到 `signal`，一次已经发出的端口调用由端口跑完。`describe` 不收 `signal`。
- 不交部分内容：`aborted`、`version-changed` 与 `export` 的任一条目失败都只交失败对象，结果里没有内容字段。
- 抛出：只有字节范围非法时抛 `TypeError`（调用方的错误，在任何端口之前）。来源的 `snapshot` 交来不是 `sealSnapshot` 造出的快照时，`inspect` 先经 `isSealedSnapshot` 核对，答 `source-unavailable`，不把它交给 `parseSkillPackage`。端口 reject、同步抛出或答复不合时本包不抛出：读取判定与对应端口当作 `unknown`，来源当作 `unavailable`，见[端口答复在运行期也封闭](#closed-sets)与契约[端口答复的统一处置](../skill-contract/SPEC.md#port-answer-closed)。
- 目录：`createSkillCatalog` 交出普通对象，不收 `signal`，不持有资源。一起发出的读取判定由端口各自跑完。

## 组合与验证

| 义务 | 测试 | 反例（改了什么会红） |
| --- | --- | --- |
| 公开根只导出三个工厂；每个阶段只答它那几步的失败种类；`export` 不会答 `adopted-material-changed` | `tests/public-entry.spec.ts`、`tests/types.spec-d.ts` | 多导出一个名字；把 `pin` 的 `moved` 改成固定联合 |
| 映射表的每一行、三列 | `tests/mapping.spec.ts` | 任一格改值（M1：检查列 `entry-unreadable` → `outside-package`） |
| `inspect` 对合法包与每种来源失败，只读快照列出的控制文件 | `tests/inspection.spec.ts` | 不读 `.omne/skill.json`（M11）；open 失败当作文件不在（M15） |
| 第 1–3 步每个分支；集合外答复；两次端口调用前后的检查点 | `tests/gate.spec.ts` | 第 2 步注释掉（M5）；`none` 答 `unknown`（M12）；集合外答复放行；去掉任一检查点 |
| `describe` 的两态、依据所指材料、不读字节 | `tests/describe.spec.ts` | 依据的 digest 改取 `SkillRef` 的 |
| 第 5、7 步每个分支与中止 | `tests/pin.spec.ts` | 去掉快照摘要比较（M2）；`unsupported` 改答别的（M13） |
| 第 10 步每个分支与中止 | `tests/bytes.spec.ts` | 去掉条目摘要比较（M7） |
| 字节范围六条规则、请求终点、正文起点 | `tests/range.spec.ts` | 终点不前移（M4）；请求终点按实际起点算（P5） |
| `read` 与 `list` 的次序（第 5 步在第 6 步前、范围校验在端口前）、失败、不缓存 | `tests/read.spec.ts` | 第 6 步提到第 5 步前；忽略正文起点（M10）；不过滤控制文件（M9） |
| `export` 整包或失败 | `tests/export.spec.ts` | 跳过失败条目（M8） |
| `skillAccessConformance()` 在本实现上、在两个世界（对应端口对 stranger 隐藏 / 对所有人作答）全绿；跳过第 2 步的服务在后者恰好 A1–A3 变红 | `tests/conformance.spec.ts` | 第 2 步注释掉（M5） |
| `skillCatalogConformance()` 在本实现上全绿（`NotApplicable` 计为失败）。把 `refused` 也列出的实现恰好红四条：SC3「lists a granted identity and not a refused one」、SC5「filters to the identities of the request that are lawful and granted」与 SC7 的两条。把 `unknown` 压成空列表的实现恰好红两条：SC2「answers unknown when the lawful set is unknown」与 SC3「answers unknown when the read check of one identity is unknown」。核验按两种完成次序释放时答复相同 | `tests/catalog.spec.ts`、`tests/catalog-world.ts` | 过滤 `granted` 改成过滤非 `unknown`（W3-M1）；任一 `unknown` 改答空列表（W3-M2）；去掉排序（W3-M5）；匹配忽略说明（W3-M13）；只规范化查询一侧（W3-M14） |
| 空的 `capabilities` 不调用任何端口；合法集合里重复的身份保留第一条 | `tests/catalog.spec.ts` | 去掉空请求的直接作答（W3-M23）；保留最后一条（W3-M24） |
| `matches` 的规范化、分词与全词命中 | `tests/match.spec.ts` | 去掉 NFKC（W3-M3） |
| 三类端口的判别值与载荷：集合外的答复、残缺的载荷、reject、同步抛出、读取时抛出，答复都按契约统一处置，不抛出 | `tests/port-answers.spec.ts` | 来源调用还原为直接查表、reject 原样上抛（W3-M4）；解析移出 `try`（W3-M17、W3-M17b）；列表跳过不合的项（W3-M18）；`open` 的 `ok` 接受文本（W3-M19）；`isSealedSnapshot` 不查登记（W3-M20）；JSON 节点不核对（W3-M21）；说明上限放宽一个字符（W3-M22b）；没有作答的核验当作 `refused`（W3-M25） |

M 编号是交付时的手工变异记录（W2 在 `tmp/closures/w2-skill/mutations/`，W3 在 `tmp/closures/w3-skill-catalog/mutations/`），不随本文件维护。未覆盖：真实的读取判定、对应与来源；对同一个包的并发写入；内容存储来源；大集合下目录的性能。替身通过不证明真实端口的行为。
