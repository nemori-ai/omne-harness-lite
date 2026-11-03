# 闭包规格 w1-skill-contract

## 身份与位置
- 闭包：w1-skill-contract
- 卡与修订：#0 r1（无卡，负责人 2026-11-03 会话内要求）
- 工作树：/home/user/omne-harness-lite/.worktrees/w1-skill-contract
- 分支：PanQiWei/skill-mcp-w1-skill-contract
- 基线：21175c9f9f05a29d1db509420b75d2b016ed2fbe
- 清晰度：定

上一层：本波 Skill 线实施规格 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/skill/spec.md 与交付计划 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/skill/plan.md。本规格与它们冲突时，以本规格为准；与组页正文冲突时停下交回。

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5，effort high。理由：契约成员首次建立公开形状，后续三个波段都依赖它；单成员，规格完整。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：把 @omne-harness/skill-contract 做成 W2、W3 能直接依赖的纯契约成员。按 spec.md 的四个切片顺序做：
1. 检查 Skill 包：值与品牌、失败联合、纯函数（toSkillName、toPackagePath、toSafeReason、computeDigest、inferMediaType、isControlFile、parseSkillPackage、projectAssetBody）。
2. 快照构造器与端口套件：./provider（三个需求端口、SkillRef、CatalogResolution、sealSnapshot）；./testing（三个端口的符合性套件与内存替身）。
3. 扩展类别端口：skillBodyContract 的可加扩展与设置声明项。
4. SPEC、schema/skill-declaration.schema.json，以及迁到 typescript-package@3.0.0 完整骨架。

形状与决定：
- 以 spec.md「已定事项」1–15 为准，逐条照做，不重新裁定。
- 形状从 DDD 草图起步：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/model/skill/values.ts、ports.ts、failures.ts、services.ts、functions.ts。草图已用 tsc 校验，且 functions.ts 的 sealSnapshot 已修正为逐级查祖先。参考实现 model/skill/access.ts 只作 W2 的参考，本闭包不实现服务。
- 建模说明 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/model/README.md 的「Skill 上下文」「建模手法」「建模发现」F6、F7、F8、F9 是本闭包的设计依据。
- 组页 packages/skills/docs/architecture.md 是技术唯一源。草图与组页不一致时以组页为准，并在交回中列出每一处差异。

不在范围内：三个应用服务的实现；SkillAccess 符合性套件；DirectorySource；组页、领域页、统一语言的修改；任何新依赖。

### 写范围
- `packages/skills/skill-contract` — 本闭包唯一的写入目录。package.json 只允许改 exports、files 与 scripts，不改 dependencies 与 devDependencies

### 排除的调用方
- `packages/skills/skill` — W2 的通用实现草稿，本闭包不改；停止条件：需要它配合时停下交回
- `packages/skills/skill-host-local` — W2 的目录来源草稿，本闭包不改
- `packages/assets/assets` — 资产成员，本闭包只读它的公开类型；停止条件：需要改资产类型才能实现时停下交回
- `pnpm-lock.yaml` — 共享文件，只由 reduce 写；停止条件：需要新依赖时停下交回
- `packages/skills/docs` — 组页由 reduce 在波末写回

## 验收清单
- A1 公开根、./provider、./testing 三个入口存在；导出键集合与 spec.md「Implementation Decisions」一致；公开根不导入 ./testing（判据 SC1）。
- A2 tests/fixtures/packages/ 下每个拒绝原因至少一个包样本；同时违反两条时给出次序靠前的那条（SC2）。
- A3 纯函数的边界穷举：toSkillName 覆盖官方 name 词法的每条边界；toPackagePath 拒绝绝对路径、.. 段、反斜杠、空段；toSafeReason；computeDigest；projectAssetBody（SC3）。
- A4 sealSnapshot 拒绝重复路径与前缀冲突，用例含 a、a-b、a/b 三个条目；摘要与条目次序、包根名无关（SC4）。
- A5 三个符合性套件对内存替身全绿；另有一个故意违反「对无权主体答复不随身份是否存在而变」的替身，证明套件会变红（SC5）。
- A6 tests/contract.spec.ts 与 tests/public-entry.spec.ts 的原有断言不改且通过；新增可加字段的接受与拒绝用例；deriveDeclarations 对每项设置产出 setting:<类别>:<名字>（SC6）。
- A7 成员是 3.0.0 完整骨架；pnpm package:template scan --member packages/skills/skill-contract --json 除草稿标记外无缺项，或剩余项在交回中逐条说明（SC7）。
- A8 SPEC 封闭 spec.md「已定事项」1–15 与组页第 71、77、87、324、346、491、524、539 行列给本成员的未定项；schema/skill-declaration.schema.json 与已定事项 8 一致（SC8）。
- 收尾门禁：pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract；pnpm run preflight；pnpm run format:check；pnpm run lint:rules。失败时先在基线上复跑同一命令，区分既有失败与本闭包引入的失败。
- 接受级别 L2。提交 trailer：Harness: claude-code、Agent-Role: developer；作者用环境变量里的 PanQiWei 身份，不写 Co-Authored-By。按切片提交，至少四个提交。

## 实施规格
负责人原则：Skill 领域只交付领域内部与用 Skill 的词表达的对外契约；契约与 SPEC 不点名调用方。Skill 不判定依赖可用性，不交设置值，不执行脚本。

### 命名账本
- 值：SkillName、PackagePath、EntryDigest、PackageDigest、AssetVersion、SafeReason、MediaType、PackageEntry、SkillPackageSnapshot、PackageLocator、SkillManifest、ScriptDeclaration、SettingDeclaration、SkillDeclaration、SkillDefinition、DeclaredProjection、ScriptIdentity、SkillMaterialBasis、SkillRef、StandIn。
- 失败：SkillFailure；按操作收窄的 GateFailure、DescribeFailure、PinFailure、ListFailure、ReadFailure、ExportFailure；InspectFailure 与 InspectRejectionCode（manifest-missing、name-mismatch、declaration-format-unsupported、outside-package、tool-ref-invalid、setting-category-unknown、malformed，按此次序）。
- 端口（./provider）：SkillPackageSource、SourceFailure、SkillResolution、Resolution、CatalogResolution、SkillReadCheck、ReadVerdict、Reply、sealSnapshot、SnapshotDefect。
- 服务接口：PackageInspection、SkillCatalog、SkillAccess，及结果值 CatalogEntry、CatalogQuery、MaterialState、SkillDescription、ReadTarget、ByteRange、ReadContent、ReadResult、ResourceListing、ExportedEntry、SkillExport。
- 套件（./testing）：describeSkillPackageSourceConformance、describeSkillResolutionConformance、describeSkillReadCheckConformance；替身 createMemorySource、createMemoryResolution、createMemoryReadCheck。

## 性质及证据义务
- 无披露：SkillResolution 与 SkillReadCheck 的套件必须有一条用例，比较「无权主体问已存在的身份」与「无权主体问不存在的身份」的答复完全相同。交回中贴出这条用例的名字与变红证据。
- 快照一致：除 sealSnapshot 外，没有任何导出能构造 SkillPackageSnapshot。交回中说明类型上怎样保证。
- 品牌授予：每个品牌只由一个校验函数授予；源码里 as 只出现在校验之后。交回中列出全部 as 的位置。

## 施工计划
1. 在基线上跑收尾门禁中的成员门禁，存输出。
2. 切片 01：先写变红的测试与包样本，再实现值、失败与纯函数。提交。
3. 切片 02：./provider 与 ./testing，先写违反无披露的替身证明套件会变红。提交。
4. 切片 03：扩展 skillBodyContract。提交。
5. 切片 04：迁骨架、写 SPEC 与 schema。跑全部验收与门禁。提交。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖。推送与 PR 由 reduce 做。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w1-skill-contract。另一位写者并行写 packages/mcp/mcp-contract，写范围不相交。派发者唯一合回。可以用 SendMessage 向派发者提澄清问题；派发者的回答会记进本规格「追加记录」。改变范围的要求只以「追加记录」为准。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w1-skill-contract/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/skill/spec.md 全文；/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/line-skill/context-map.md「先读什么，读到哪停」所列范围；/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/constraints.md。
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100。
- 模板：pnpm package:template 的 typescript-package@3.0.0；成员文档要求见 docs/member-documentation.md。

## 当前认知
- 已确认：基线上本成员 build、typecheck、test 通过（2 个测试文件，6 个用例）；yaml 2.9.1 与四个公共成员已由 reduce 声明为依赖。
- 假设：yaml 2.9.1 的重复键检测足以实现「头部 YAML 映射在整个图中键唯一」。不成立时停下交回。
- 未知：无。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果（含日志时间与提交号）；草图与组页的差异表；全部 as 的位置；无披露用例名与变红证据；未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/w1-skill-contract/tmp/w1-skill-contract/。

## 已知会受影响的现有用例
- `packages/skills/skill-contract/tests/contract.spec.ts`、`tests/public-entry.spec.ts`：原有断言不改。public-entry 的导出键集合会增加，按新集合更新这一条断言，并在交回中说明。

## 停止条件
- 必须改写范围外文件或新增依赖才能通过检查时停下交回。
- 组页与本规格冲突时停下交回，不自行选一边。
- yaml 库不能检出重复键时停下交回。

## 追加记录

### 第 2 轮（2026-11-03，reduce 追加；依据 waves/w1/reviews/decisions-r1.md）

第 1 轮评审（正确性、设计与实践、SPEC 表达、交付边界）的裁定如下。全部照做；每条标了裁定编号，不重新裁定。差分变异与结构读数的处置见本节末尾「第 2 轮补充」（reduce 收到报告后追加）。基线不变（21175c9f9），在现有分支上继续提交。

**A. 契约形状（合入前改，之后只做可加改动）**
1. [G3] `PackageInspection` 接口移到 `./provider`。公开根不再带出 `PackageLocator`。
2. [#9/C18] 符合性套件改为与 tool-contract、mcp-contract 一致的无框架形态：每个套件是函数 `skill<Port>Conformance(): ConformanceCase<F>[]`（`skillPackageSourceConformance`、`skillResolutionConformance`、`skillReadCheckConformance`），用例用 `node:assert/strict` 失败；每个用例收一份新的 fixture（工厂函数）；提供 `ConformanceCase`、`NotApplicable`、`runConformanceCase`、`isNotApplicable`（沿 `packages/tool/tool-contract/src/testing-case.ts` 的形状，本成员自己一份）。`./testing` 不再导入 vitest。删除 `tests/conformance-red.spec.ts` 的子进程与 `tests/fixtures/violations/`，变红证明改为进程内：对违约替身跑套件、收集失败用例名并断言恰好是无披露的两条。
3. [设计 2] 品牌授予规则：只做检查的值公开 `isX(value: unknown): value is X`；会变换输入或失败原因多于一个时才公开 `toX → Outcome`。据此：`toSkillName`、`toSafeReason`、`toAssetVersion`、`toPackageDigest` 改为公开 `isSkillName`、`isSafeReason`、`isAssetVersion`、`isPackageDigest`（原 `toX` 删除）；`toPackagePath` 保留（它规范化 `.` 段），另公开 `isPackagePath`。
4. [C19] `ReadVerdict` 改为判别联合 `{kind:'granted'} | {kind:'refused'} | {kind:'unknown'}`。
5. [E10] `SourceFailure` 增加 `'entry-unreadable'`：来源在 `snapshot` 时遇到设备、管道、套接字、无法解析或成环的链接时答它。`inspect` 的映射是 `rejected: malformed`，`read`/`list`/`export` 的映射是 `source-unavailable`。写进 SPEC 的端口要求与映射表。
6. [C21/设计 3] 「只能由构造器造出」统一写法：品牌类型 + 模块私有 WeakSet + 一个「登记并收窄」的私有守卫；去掉 `snapshot.ts:81-82` 走不到的分支与只为它存在的 `SnapshotFields`/`isSealed` 分叉；`entries` 冻结到集合层。伪造快照仍抛 TypeError。

**B. 行为修正**
7. [C1] `parseSkillPackage` 收到的控制字节与快照条目摘要不符时，返回 `{kind:'version-changed'}`，不抛。TypeError 只留给伪造快照（`assertSealed`）。
8. [C2] 含 `..` 段的脚本入口（如 `scripts/../run.sh`）判 `malformed`，不判 `outside-package`。
9. [E1] `SkillResolution` 端口不核对内容摘要：带资产版本核资产版本，不带核来源层；摘要由 Skill 在读取第 7 步核。套件里「改 digest 答 basis-not-lawful」的用例改为「资产版本不合法答 basis-not-lawful」；内存替身同步。
10. [C5/E3] `SkillPackageSource.open` 的 `digest` 义务：按内容摘要存放的来源找不到该 digest 时答 `package-not-found`；不按内容摘要存放的来源可以忽略它，字节由 Skill 按条目摘要核。套件补一例：内存来源（按摘要存放）对外来 digest 答 `package-not-found`。
11. [设计 5] `parse/shape.ts` 的 `findings` 出参改为每个读取函数返回 `{ value, findings }`，在 `parseSkillPackage` 合并。行为测试不变。

**C. SPEC 与 schema**
12. [E2] 字节范围：65536 是每页封顶也是缺省长度；`length` 超过封顶向内收到 65536；`start` ≥ 总长交空内容且 `complete: true`；负数或非整数是前提违反，抛 TypeError；零长度交空内容，`complete` 按 `start ≥ 总长` 判。本版本不可配置；README 删「可覆盖的策略值」。
13. [E5] 写明 `isSafeReason` 只判词形；在 `SkillResolution` 的端口要求里写明 `known-unavailable.reason` 的披露义务归端口实现。
14. [E6] 中止：每次端口调用前与返回前各检查一次 `signal`，任一次已中止即答 `aborted`，不交部分内容。
15. [E7] 文本条目保留 BOM（`ignoreBOM: true`）。
16. [E8] `export` 本版本没有上限，写明。
17. [E9] 资产正文的 `scripts`/`settings` 适用同一套跨项规则：重复判 `malformed`，入口必须已规范化。
18. [C3] 写明 `description`、`scripts`、`settings`、`package` 从此是 `skillBodyContract` 的保留字段。
19. [C20/E4] 写明 WeakSet 登记是进程内凭证：不可序列化传输；同一成员被加载为两份实例时互不承认，装配方须保证单实例。
20. [E11] 增加「与组页的差异」一节（每条附裁定编号与日期）和「组页行号 → 本规格条款」封闭表（参照 mcp-contract 的 SPEC）。
21. [E13] 类型是形状的唯一来源：删去 SPEC 里逐项抄写的联合与对象字面量，只保留行为句与「何时出现」；封闭集合（拒绝原因、失败种类）保留为代码列表，并加一条测试钉住它与类型相等。
22. [E14] 依据改引「负责人 2026-11-03 裁定」并把决定写全，不引任务 tmp，不出现波次名。
23. [C4/E12] schema：`formatVersion` 用 `"type":"integer","const":1`，description 写明词形必须是 `1`；description 补列 `1.0`/`1e0`、只由 `.` 段组成的入口、孤立代理项三项解析器拒绝而 schema 不表达的差异；长度单位统一写「按码点计」；`sealSnapshot` 要求 `rootName` 非空且不含 `/`；L239/L240 之间补空行。
24. [#7] `package.json` 的 `description` 改为「Pure Skill contract: values, failures, package inspection, ports, service interfaces, and conformance suites」。

**D. 测试与骨架**
25. [交付 1] 加 `tests/provider-types.spec-d.ts`，用 `expectTypeOf` 列出 `./provider` 的类型导出集合。
26. [交付 2] `tests/public-entry.spec.ts` 的导入遍历改读 `src`（用 TypeScript 编译器 API 或同时匹配两种引号），不读 `dist`。
27. [设计 7] `tests/parse-package.spec.ts` 按拒绝原因拆成几个文件。
28. `acceptance/` 四个文件由 reduce 以 main 角色补建，写者不建。

验收追加：A1–A8 照旧，且 A5 的变红证明改为进程内；新增 A9：`skillPackageSourceConformance` 对外来 digest 的用例存在且通过；A10：`provider-types.spec-d.ts` 存在且通过。收尾门禁照旧。按本节的 A、B、C、D 分别至少一个提交。

**E. 第 2 轮补充：结构读数（依据 reviews/r1-structure.md）**
29. `interpret`（`parse/manifest.ts`）拆分：抽 `boundedText(value, max)` 供 description 与 compatibility 共用，抽 `manifestOf(name, fields)` 做组装；`interpret` 只留校验顺序。
30. `convert`（`parse/yaml-value.ts`）拆分：抽 `sequence(...)` 与 `mapping(...)`，主函数只留别名展开、预算、深度与四路分派。
31. `parseSkillPackage` 保留在一个函数里（拒绝顺序是契约），在 JSDoc 写明保留理由；可以抽 `nameMismatch(name, rootName, expected)`。
32. `frontmatterOf`：核实 `for` 条件 `start <= text.length` 是否不自退、末尾 `return undefined` 是否走不到；是则改 `for (;;)` 并补覆盖这一分支的用例，否则在代码里注释说明。
33. 包内重复：`DESCRIPTION_MAX` 与「1..N 码点文本」检查合到一处（`parse/shape.ts`），`contract.ts` 与 `parse/manifest.ts` 共用。
34. 与 tool-contract 的 25 行克隆（`stringField`/`field`/`isObject`）本轮保留，不抽；14 行克隆保留。

**F. 第 2 轮补充：差分变异（依据 reviews/r1-mutation.md；完整存活清单在 /home/user/omne-harness-lite/tmp/mutation-ledger/5982f2be5/20261103-144713）**
35. 补用例杀掉可判定的存活：`names.ts:13` 与 `isSafeReason` 的控制字符边界（U+001F、U+007F、U+009F 各一例，含与不含）；`snapshot.ts:31` 排序比较器（逆序输入，断言输出次序与摘要）；`contract.ts:99-101` 正文 `description` 长度 0 与 1025 的拒绝；`contract.ts:23-31` 断言类别端口交出的 `schema` 读出值（字段名与类别枚举）；`parse/yaml-value.ts:41/55/56`（非 map 节点、null 值、数值）；`parse/declaration.ts:60-61`（`formatVersion` 缺失、非数值）；`parse/manifest.ts:73/77/108/122-125`（metadata 非文本映射、`compatibility` 非文本、可选字段缺省与存在各一例）；`parse/package.ts:75`（带 `expectedName` 且与根名相等时通过）。
36. 记为等价并在测试或代码注释写明理由：`names.ts:11` `index <= text.length`（`charCodeAt(length)` 是 NaN）；`snapshot.ts:31` 的 `<→<=`（路径唯一）；`digest.ts:25/42` 的 SHA-256 后防御断言；`snapshot.ts:82` 随 C21 删除。
37. 错误说明文字（`detail`）与 schema 文本的 StringLiteral 存活不追：SPEC 写明 `detail` 是给人看的说明，不是契约字段，调用方不得据它分支。
38. 变异把 `new TextDecoder('utf-8', …)` 的编码改成 `''` 使模块加载抛错，工具判整次无效。不为此改代码；reduce 在合入后复跑一次确认存活数下降即可。
