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
