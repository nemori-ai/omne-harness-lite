# W2 Skill 线实施规格：`@omne-harness/skill` 与 `@omne-harness/skill-host-local`

格式沿 `claim` 技能 `references/spec-template.md`，方法 Matt `to-spec`。只写差额，共用部分引用。

- 卡：无卡，负责人 2026-11-03 会话内「W2 开工」；波包 [w2/wave-pack.md](../wave-pack.md)；F `b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01`
- 上一层：[线级地图](../../line-skill/context-map.md)；[共用约束](../../constraints.md)；[范式 r1](../../operating-model.md)；[W1 规格](../../w1/skill/spec.md)已定事项 1–15 继续有效
- 主工作类型：feature → poteto-mode Feature
- 风险级别：`w2-skill` L3（读取关口决定无权主体看到什么、依据能不能冒充访问、快照竞争能不能拼出两个版本）；`w2-skill-host` L2（只交字节，失败集合封闭，权限类失败用注入接缝测）

## Problem Statement

W1 之后，调用方拿到的只是接口：没有人能检查一个真实目录里的 Skill 包，也没有人能在核验读取权之后把正文或资源按页读出来。W3 的目录与导出、M2 之后的会话与 Agent 读取（#322）都要先有这两样。

## Solution

两个成员，三个工厂：

- `@omne-harness/skill` 公开根导出 `createPackageInspection(source)` 与 `createSkillAccess(ports)`。前者经来源取一次一致的快照与两份控制文件字节，交给 `parseSkillPackage`。后者把[组页「读取」](../../../../packages/skills/docs/architecture.md#读取)的 11 步写成三段（`gate` → `pin` → `verifiedBytes`），四个操作各在自己那一步结束，失败类型逐段收窄。
- `@omne-harness/skill-host-local` 公开根导出 `createDirectorySource(options?)`：只读当前目录、不缓存，链接与非常规文件按 SPEC 的来源失败集合答复，权限类失败经注入的文件系统接缝可测。
- `skill-contract/testing` 可加 `skillAccessConformance()`：以后替换 `SkillAccess` 实现的人拿到同一组判据。

## 依据与已定事项

| 依据 | 精确修订 | 本规格采用的范围 |
| --- | --- | --- |
| 成员 SPEC `packages/skills/skill-contract/SPEC.md` | F | 「读取的形状规则」「需求端口」「快照」「检查 Skill 包」全节；失败集合 |
| 组页 `packages/skills/docs/architecture.md` | F | 「端口」（含 `DirectorySource` 段与映射表）「应用服务」「检查与发现」「读取」 |
| DDD 建模 `tmp/skill-mcp-domain/model/README.md` | 2026-11-03 本地 | 「Skill 上下文」应用服务三段结构；F6、F7、F8 |
| 参考实现草图 `tmp/skill-mcp-domain/model/skill/access.ts` | 2026-11-03 本地 | 三段的分法与失败类型逐段扩大。它写在 W1 之前，与 F 的契约不一致处以契约为准 |
| 契约源码 `skill-contract/src/{services,ports,failures,values,testing-source}.ts` | F | 接口签名、`createMemorySource`、`skillPackageSourceConformance` |
| 官方 Agent Skills 规格 | https://agentskills.io/specification | 目录结构；正文从闭合定界行之后开始 |

已定事项（reduce 裁定，写者照做）：

1. **`createSkillAccess` 的端口参数**是一个对象 `SkillPorts<P, S> = { readCheck: SkillReadCheck<P, S>; resolution: SkillResolution<P, S>; source: SkillPackageSource }`。`createPackageInspection(source)` 只收来源。不收 `access`、不收作用域、不收配置。
2. **`export` 提前到本波**（W1 波包写 W3）：它与 `read` 共用 `gate`、`pin` 与逐条目的 `verifiedBytes`，分开做反而要两次打开同一段代码。W3 的 `w3-skill-catalog` 只做 `SkillCatalog`。
3. **三段结构固定**：`gate(access, scope, capability, basis?)` 做第 1–3 步，失败是 `DescribeFailure`；`pin(gateResult, signal?)` 做第 5、7 步，失败是 `PinFailure`；`verifiedBytes(pinned, path, signal?)` 做第 9–10 步，失败是 `ByteFailure`（`resource-missing`、`version-changed`、来源映射）。`describe` 在 `gate` 后结束，`list` 在 `pin` 后结束，`read` 与 `export` 走完三段。每段是一个导出的纯异步函数（只依赖端口参数），可以单独测。
4. **`signal` 的检查点**是一个辅助函数 `checkpoint(signal)`，在每次调用端口之前与每次端口返回之后各调一次；已中止时操作答 `aborted`，不再调用端口，不交部分内容。`describe` 不收 `signal`。
5. **正文起点**：`read` 正文时字节范围相对正文起点（闭合定界行的行终止符之后）。`skill-contract` 现有 `frontmatterOf` 只交出 YAML 文本，没有字节偏移。`w2-skill` 在 `skill-contract/src/parse/manifest.ts` **可加**导出 `bodyOffsetOf(bytes: Uint8Array): number | undefined`（没有合法头部时 `undefined`），并从公开根导出；`readManifest` 内部改用它取头部范围不算改行为，但现有用例必须原样通过。
6. **字节范围的实现**按 SPEC「读取的形状规则」逐条：页上限 65536；文本条目的实际起点是不小于请求起点的第一个字符边界，终点前移到上一个字符边界；请求长度短于起点处一个字符时收成空范围并后移起点；起点或长度为负或非整数抛 `TypeError`；BOM 保留；`complete` 当且仅当实际终点不小于总长。文本条目的编码以快照条目的 `encoding` 为准；二进制每字节都是边界。
7. **`inspect` 的控制文件读取**：`snapshot` 之后用 `open(locator, snapshot.digest, path)` 读 `SKILL.md`，`.omne/skill.json` 存在时也读；`parseSkillPackage` 收 `{ snapshot, control, expectedName }` 并自己核对控制文件字节的摘要（不符答 `version-changed`），`inspect` 不重复核对。来源答复映射：`package-not-found`/`entry-not-found`/`unavailable` → `source-unavailable`；`bytes-mismatch` → `version-changed`；`snapshot` 的 `entry-unreadable` → 拒绝 `malformed`；`snapshot` 或 `open` 的 `outside-package` → 拒绝 `outside-package`。
8. **`describe` 的 `material`**：`SkillRef` 有内容摘要时 `pinned`，依据是 `{ capability, layer, version?, digest }`；没有时 `no-readable-package`。`describe` 不读字节。
9. **无披露**：第 1 步依据的能力标识不等于目标时，对外 `not-available-to-you`；`SkillReadCheck` 答 `refused` → `not-available-to-you`；`SkillResolution` 答 `none` → `not-available-to-you`。三者对调用方不可区分，用例要证明三条路径的答复对象深度相等（除 `detail` 外没有字段差异；本波的 `not-available-to-you` 不带 `detail`）。
10. **`skillAccessConformance()`**放在 `skill-contract/src/testing-access.ts`，形状同其他三个套件：`ConformanceCase<AccessFixture>[]`，`AccessFixture = { access: SkillAccess<P, S>; …已知的主体、作用域、能力与材料 }` 由实现方的工厂给出；内存替身由 `./testing` 已有的 `createMemorySource`、`createMemoryResolution`、`createMemoryReadCheck` 组装。至少覆盖：无披露三路径同答（A1–A3）、`basis-unavailable` 与 `adopted-material-changed` 的分野（A4、A5）、`version-changed` 不交新内容（A6）、`aborted` 不交部分内容（A7）、`unsupported`（A8）、范围规则（A9–A11）、`export` 不交部分包（A12）、`describe` 不读字节（A13，来源 `open` 抛出也成功）。
11. **`createDirectorySource(options?)`**：`options.fs` 是文件系统接缝 `DirectoryFs`（`readdir`（带类型）、`lstat`、`realpath`、`readFile`），默认是 `node:fs/promises`。`PackageLocator` 用 `{ kind: 'directory', root }`；收到 `content-store` 定位答 `package-not-found`（本来源不持有按内容存放的包）。
12. **`DirectorySource` 的失败映射**（W2 裁定，写进 host 成员 README「行为」节）：根目录不在或不是目录 → `package-not-found`；根目录不可读（EACCES、EIO）→ `unavailable`；条目是设备、管道、套接字，链接无法解析或成环，或条目不可读（EACCES）→ `entry-unreadable`；链接 `realpath` 落在根目录 `realpath` 之外 → `outside-package`（根目录自己是链接时，以它解析后的位置为根）；`open` 时文件不在 → `entry-not-found`，解析后落在根外 → `outside-package`，不可读 → `unavailable`。空目录与隐藏文件都是普通条目。`.omne` 目录照常进快照。
13. **快照的条目集合**：递归目录下的全部文件（含 `.omne/skill.json`、`SKILL.md`），路径用 `/` 分隔的包内相对路径，交给 `sealSnapshot(rootName, files)`，`rootName` 是根目录（解析后）的最后一段。目录不是条目。
14. **竞争**：`open` 读此刻的字节，不比对快照；字节是否变了由 Skill 核对。host 成员的测试要有「取快照后改文件再 open」的用例，证明来源原样交出新字节（Skill 一侧报 `version-changed` 的用例在 `w2-skill`）。
15. **内存替身只能装进测试**：`@omne-harness/skill` 的测试用 `./testing` 的三个替身；`skill-host-local` 的符合性测试用真实临时目录（`node:fs` 的 `mkdtemp`）。
16. **类/函数**：三段与四个操作都是函数；`createSkillAccess` 返回对象字面量。无类、无 `as`（`as const` 除外）、无 `any`。品牌只由契约的守卫授予。

## 原则与约束

| ub-mode 条目 | 本规格的取舍 |
| --- | --- |
| 先做对 | 读取 11 步逐步对应用例；每步的失败分支都有变红证据后再优化 |
| 其余 | 按 ub-mode 全文 |

| 判断或约束 | 拥有者 | 本规格的具体条目 |
| --- | --- | --- |
| 轴与拥有者 | `engineering-taste.md`「维度分解与正交」 | 三条轴：访问判定（端口拥有）、材料一致性（Skill 拥有：快照摘要与条目摘要核对）、字节来源（host 拥有）。Skill 不让字节来源决定访问判定 |
| 领域边界 | `layers-and-dependencies.md` | 无新增外域概念；`Access<P>`、`CapabilityId` 继续经契约引入 |
| 面向契约 | 成员 SPEC | `w2-skill` 实现 SPEC「读取的形状规则」与组页「读取」；`contract:` 级别 candidate |
| 防御与失败语义 | `docs/defensive-patterns.md` | 见下 |
| 演进政策 | `publication.md` | 没有被替代实现；新增消费者是本组自己的测试 |

### 跨域概念的五问

不适用：本波不新增跨域概念、公开字段或端口。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | 四个操作按 11 步答结果 | `skill` | 服务 + 内存替身的用例 |
| 失败 | 每步失败按映射表答封闭集合中的一种，不吞成空结果 | `skill` | 每种失败一条用例；变异杀死映射改错 |
| 未知 | 端口答 `unknown` → `unknown`，不压成拒绝或空 | `skill` | 用例 |
| 取消与清理 | `aborted`，不交部分内容；没有资源要清理 | `skill` | A7 |
| 外部效果 | 无。`DirectorySource` 只读 | `skill-host-local` | 符合性套件 |

可配置的策略：无（页上限不可配置，SPEC 已定）。

## User Stories

1. 作为来源或资产登记一侧，我要把一个目录交给 `inspect`，得到 `SkillDefinition` 或按次序的第一个拒绝原因，以便登记合法的包、拒绝非法的包。
2. 作为读者，我要 `describe` 一个能力，得到声明与材料依据，而不触碰包字节，以便决定要不要读正文。
3. 作为读者，我要按页读正文或某个资源，每页知道实际范围与是否读完，以便在上下文预算内拼出完整内容。
4. 作为读者，我要带依据读到当初那一份材料，或得到 `basis-unavailable`，以便不把旧正文与新资源拼成成功。
5. 作为无权主体，我得到的答复不随身份是否存在而变，以便没有人能靠报错探测别的租户有什么。
6. 作为导出方，我要一次拿到整包且每个条目都核对过，或一个失败，以便物化的包不是半份。
7. 作为宿主装配者，我要一个只读目录的来源实现，并能用契约的符合性套件证明它合规，以便换别的来源时判据不变。
8. 作为测试作者，我要用注入的文件系统制造权限失败，以便不靠 root 环境。

## Implementation Decisions

- `packages/skills/skill/src/`：`index.ts`（两个工厂与 `SkillPorts`）、`inspection.ts`、`access/gate.ts`、`access/pin.ts`、`access/bytes.ts`、`access/range.ts`（字节范围与字符边界）、`access/checkpoint.ts`、`access/service.ts`（四个操作的组合）、`mapping.ts`（端口答复到服务失败的映射表，一个表、一处）。
- `packages/skills/skill-host-local/src/`：`index.ts`、`directory-source.ts`、`fs.ts`（`DirectoryFs` 接缝与 `node:fs/promises` 适配）、`walk.ts`（递归、链接解析、失败分类）。
- `skill-contract` 可加：`parse/manifest.ts` 的 `bodyOffsetOf`；`testing-access.ts`、`testing.ts` 重导出。
- 映射与次序以组页「读取」与「端口」映射表为准；两份规格形态一致，MCP 线同骨架。

## Testing Decisions

- 先写红：每个切片第一步是写会红的用例，红灯输出存进 `tmp/closures/<闭包>/red/`。
- 测试接缝：服务 + 内存替身（`./testing`）；host 用真实临时目录 + 注入的 `DirectoryFs`；纯函数（范围、偏移）穷举。
- 先例：`packages/skills/skill-contract/tests/`（套件用法）、`packages/tool/tool-contract`（符合性先例）。
- 传感器与命令：同 [W1 规格](../../w1/skill/spec.md#testing-decisions)表；L3 热点（`gate.ts`、`mapping.ts`、`walk.ts` 的根外判定）由 reduce 逐行读并派 implementation-reviewer。
- 不能声称的事：没有真实的 `SkillResolution`/`SkillReadCheck` 提供者（替身）；没有内容存储来源；没有并发读写同一目录的压力测试。

## 判据

| ID | 判据 | 证据 |
| --- | --- | --- |
| SK2-1 | `inspect` 对合法目录包答 `SkillDefinition`；对每种来源失败与快照缺陷按已定事项 7 映射 | 用例表；变异杀死映射 |
| SK2-2 | 读取 11 步每个分支都有用例：第 1 步 `bad-basis`、第 2 步三种答复、第 3 步五种答复、第 5 步 `unsupported`、第 7 步两种摘要不符、第 9 步 `resource-missing`、第 10 步 `version-changed` 与四种来源失败 | 用例名对应步号 |
| SK2-3 | 无披露：三条路径答复深度相等；对无权主体，存在与不存在的能力同答 | A1–A3 |
| SK2-4 | 字节范围：页上限、字符边界、空范围后移、BOM、`complete`、`TypeError` 六条各有用例；正文起点相对闭合定界行 | `range.spec.ts`；`bodyOffsetOf` 用例 |
| SK2-5 | `skillAccessConformance()` 至少 13 条，`createSkillAccess` + 内存替身全绿；去掉第 2 步核验的变体使 A1 变红 | 套件 + 变红证据 |
| SK2-6 | `aborted` 不交部分内容；`export` 任一条目不符答 `version-changed` 不交部分包 | A7、A12 |
| SK2-7 | `describe` 不读字节：来源 `open` 抛出时 `describe` 仍成功 | A13 |
| SK2-8 | `manifest.ts:47–55` 头部扫描边界夹具补齐，W1 存活的变异被杀 | 变异读数 |
| SK2-9 | `createDirectorySource` 通过 `skillPackageSourceConformance()` 全部用例（真实临时目录） | 套件 |
| SK2-10 | 链接：包内链接读所指字节；根外链接 → `snapshot` 答 `outside-package`；成环/悬空 → `entry-unreadable`；设备/管道/套接字 → `entry-unreadable` | 用例（套接字用 `net.createServer` 的 unix socket，平台不支持时该用例 `NotApplicable`） |
| SK2-11 | 权限：注入 `DirectoryFs` 使 `readFile` 抛 EACCES → `entry-unreadable`（snapshot）/`unavailable`（open）；根目录 EACCES → `unavailable` | 用例，不依赖 root |
| SK2-12 | 竞争：取快照后改文件，`open` 原样交出新字节 | 用例 |

## 待决事项

| 缺口 | 影响的切片 | 处置 |
| --- | --- | --- |
| 无 | — | — |

## Out of Scope

- `SkillCatalog`；内容存储来源；Cordis 契约；真实提供者；脚本执行；组页写回。

## Further Notes

- `model/skill/access.ts` 写于 W1 之前：它的 `CallMode` 类比与 `Resolution[]` 形状已过时，只取三段分法。
- 两线规格同骨架；MCP 线见 [../mcp/spec.md](../mcp/spec.md)。
