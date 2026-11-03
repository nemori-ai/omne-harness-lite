# W1 Skill 线实施规格：`@omne-harness/skill-contract`

格式沿 `claim` 技能 `references/spec-template.md`，方法 Matt `to-spec`。只写差额，共用部分引用。

- 卡：无卡，负责人 2026-11-03 会话内要求；波包 [w1/wave-pack.md](../wave-pack.md)；F `21175c9f9f05a29d1db509420b75d2b016ed2fbe`
- 上一层：[线级地图](../../line-skill/context-map.md)；[共用约束](../../constraints.md)；[范式 r1](../../operating-model.md)
- 主工作类型：feature → poteto-mode
- 风险级别：L2。契约成员首次建立公开形状，后续波段都依赖它；读取关口的无披露要求在 W2 实现时按 L3 读

## Problem Statement

W2 的通用实现与本地来源、W3 的目录与导出都要依赖 Skill 的值、失败、端口与服务接口。现在 `skill-contract` 只有 `skillBodyContract`，组页写的值、纯函数、端口和符合性设施都还只是正文里的候选，且有十多项「归 skill-contract 的规格」尚未封闭。没有它们，W2 的写者只能各自猜形状。

## Solution

把 `skill-contract` 做成后续波段能直接依赖的纯契约成员：公开根给调用方（值、失败、服务接口、纯函数、类别端口），`./provider` 给端口实现方（三个需求端口与 `SkillRef`），`./testing` 给实现方自测（三个端口的符合性套件与内存替身）。成员 SPEC 封闭组页列给本成员的全部未定项。

## 依据与已定事项

| 依据 | 精确修订 | 本规格采用的范围 |
| --- | --- | --- |
| 组工程设计 `packages/skills/docs/architecture.md` | F | 「模型」「资产正文与 Skill 包」「端口」「应用服务」「检查与发现」「包格式规则」「读取」「失败种类」「验证」 |
| 组入口 `packages/skills/README.md` | F | 「成员与依赖」 |
| DDD 与 SOLID 建模 `tmp/skill-mcp-domain/model/README.md` | 2026-11-03 本地 | 「Skill 上下文」全节；「建模发现」F6、F7、F8、F9 |
| 类型草图 `tmp/skill-mcp-domain/model/skill/{values,ports,failures,services,functions}.ts` | 2026-11-03 本地，`tsc` 通过 | 形状的起点。与组页冲突时以组页为准 |
| 资产公开类型 `packages/assets/assets/src/identity.ts` | F | `BodyContract`、`CapabilityId`、`JudgeContext`、`Declarations` |
| 官方 Agent Skills 规格 | https://agentskills.io/specification | name、description 字段规则；目录结构 |

已定事项（reduce 裁定，写者照做）：

1. **入口**：`exports` 为 `.`、`./provider`、`./testing` 三个，都写 `source`、`types`、`import`。`./testing` 不被公开根导入。
2. **内容摘要算法**：条目摘要是 `sha256:` 加小写十六进制的 SHA-256（对条目原字节）。快照摘要对按包内路径（UTF-16 码元序）排序后的每个条目拼接 `<路径>\0<条目摘要>\n` 再做 SHA-256，同一前缀。包根目录名不进入摘要。
3. **`SafeReason`**：品牌字符串，只由 `toSafeReason(text)` 授予：长 1 到 256 个字符，不含控制字符。
4. **读取内容**：`ReadContent` 是文本或字节两种（见草图 `services.ts`）。Skill 不产出 `ContentBlock`，内容块的组装归接收方。字节范围的单位是字节。文本条目交出的实际范围向内收到完整 UTF-8 字符边界，并在结果里如实写出实际范围。
5. **正文起点**：正文从闭合定界行的行终止符之后开始。读正文时，内容摘要核对整个 `SKILL.md` 条目，字节范围相对正文起点（建模发现 F7）。
6. **默认读取上限**：65536 字节一页。上限值写进 SPEC，W2 的服务按它实现。
7. **中止**：失败种类 `aborted`。
8. **`.omne/skill.json` 的形状**：`{ "formatVersion": 1, "dependencies": [{ "category": "tool", "name": … }], "scripts": [{ "entry": 包内路径, "runKind": …, "facilities": [ … ], "parameters"?: JSON }], "settings": [{ "name": …, "category": … }] }`。`formatVersion` 不是 1 时拒绝为 `declaration-format-unsupported`。`runKind` 与设施名的词法是 `^[a-z][a-z0-9-]{0,31}$`，Skill 不解释它们。`parameters` 原样保存为 `JsonValue`。三个数组都可以缺省，缺省按空数组处理；这是形状规则，不是「补缺省值」。
9. **设置类别**：取值恰为统一语言「设置项类别」的四个：`preference`、`binding`、`placement-identity`、`governance`。其他值拒绝为 `setting-category-unknown`。
10. **声明项编码**：`deriveDeclarations` 对每项设置声明产出一个条目 `setting:<类别>:<名字>`。依赖与脚本不产出声明项。
11. **读取声明的 JSON 预算**：`maxBytes` 65536、`maxDepth` 16、`maxItems` 4096、`maxMembers` 256、`maxStringLength` 4096、`maxNumberLength` 32。写进 SPEC。
12. **YAML 头部**：用 `yaml` 2.9.1（已由 reduce 声明依赖）解析，开启重复键检测；只解释 name、description、license、compatibility、metadata、`allowed-tools`，其余字段原样保存在 `extra`，不解释。
13. **`skillBodyContract` 的扩展**：只做可加扩展：可选的 `description`、`scripts`、`settings`、`package.digest`。旧正文仍合法，现有两个测试文件不改断言。
14. **`SkillResolution.adopted`**：答复类型收窄为 `CatalogResolution`（建模发现 F6）。
15. **`sealSnapshot`**：快照只能经它构造，导出在 `./provider`（建模发现 F8）。前缀冲突用逐级查祖先的算法，不靠排序相邻（草图 `functions.ts` 已修正这一点）。

## 原则与约束

无新增，见[共用约束](../../constraints.md)。

### 跨域概念的五问

1. 需要的外域概念：能力标识、来源层、资产版本。缺少能力标识就无法定位身份；缺少来源层与资产版本就无法向调用方指明材料。
2. 它们的含义与权威状态归 assets；Skill 只搬运，不解释、不保存。
3. 能力标识用 `@omne-harness/assets` 的 `CapabilityId`；来源层用四格字面量联合；资产版本是 Skill 不解释的品牌字符串。
4. 正常、失败、未知的交接都经 `SkillResolution` 的答复，映射表见组页「端口」。
5. 换掉调用方或 assets 的实现时，读取次序、无披露与版本语义不变。反例：调用方用旧依据读已撤权的能力，仍得到 `not-available-to-you`。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | 纯函数返回 `ok` | 本成员 | 穷举测试 |
| 失败 | 返回封闭集合里的失败；不抛出（类别端口按 assets 约定在判断失败后抛出的除外） | 本成员 | 每种失败一个反例 |
| 未知 | 端口答 `unknown` 时服务失败为 `unknown`，不压成拒绝或空 | W2 的实现；本波由符合性套件约束端口 | 套件用例 |
| 取消与清理 | 本成员没有异步资源 | — | 不适用 |
| 外部效果 | 无 | — | 不适用 |

可配置的策略：读取上限、声明的 JSON 预算，见已定事项 6、11。

## User Stories

1. 作为 Skill 包的作者，我要在加载时就知道包是否合法以及第一个拒绝原因，以便修正包。
2. 作为来源实现方，我要一个唯一的快照构造器，以便我交出的快照摘要必然与条目一致。
3. 作为来源实现方，我要一套符合性套件，以便证明我的来源与其他来源行为一致。
4. 作为对应与读取权的实现方，我要符合性套件核对「对无权主体答复不随身份是否存在而变」。
5. 作为调用方，我要按操作收窄的失败类型，以便只处理真会出现的失败。
6. 作为调用方，我要材料依据不含包定位，以便我无法借依据指定包的位置。
7. 作为资产治理，我要 `skillBodyContract` 派生设置声明项，以便配值能落到正确的类别。
8. 作为后续波段的写者，我要成员 SPEC 封闭全部未定项，以便不用猜形状。

## Implementation Decisions

- 模块：`values`、`failures`、`functions`（含 `parse` 的子模块）、`services`、`contract`（现有类别端口）、`provider`、`testing`。按责任拆，单文件不超过约 300 行。
- 公开根导出：值、失败、服务接口与结果值、纯函数（`sealSnapshot` 除外）、`skillBodyContract`。
- `./provider` 导出：`SkillPackageSource`、`SkillResolution`、`SkillReadCheck`、`Resolution`、`CatalogResolution`、`SourceFailure`、`Reply`、`SkillRef`、`PackageLocator`、`sealSnapshot`、`SnapshotDefect`。
- `./testing` 导出：`describeSkillPackageSourceConformance`、`describeSkillResolutionConformance`、`describeSkillReadCheckConformance`（参数为实现工厂与样本），以及内存替身 `createMemorySource`、`createMemoryResolution`、`createMemoryReadCheck`。套件基于 vitest 的 `describe`/`it`。
- `schema/skill-declaration.schema.json`：`.omne/skill.json` 的 JSON Schema，与已定事项 8 一致。
- 服务接口（`PackageInspection`、`SkillCatalog`、`SkillAccess`）只写接口与结果值，不写实现，也不写占位实现。
- 形状从草图 `model/skill/*.ts` 起步；与组页不一致时以组页为准，并在交回中列出差异。

## Testing Decisions

- 先写变红的测试，再实现。
- 包样本：`tests/fixtures/packages/` 下每个拒绝原因至少一个包，另有合法包若干（含 CRLF、未知头部字段、二进制资源、嵌套目录）。拒绝次序用「同时违反两条」的包验证。
- 纯函数穷举：`toSkillName`（官方词法的每条边界）、`toPackagePath`、`sealSnapshot`（重复路径、不相邻的前缀冲突 `a`/`a-b`/`a/b`、次序无关、包根名无关）、`computeDigest`、`projectAssetBody`、`toSafeReason`。
- 符合性套件对三个内存替身全绿；另写一个故意违反「无披露」的替身，证明套件会变红。
- `skillBodyContract`：现有两个测试文件原样通过；新增可加字段的接受与拒绝用例。
- 测试接缝：公开入口（包名导入），不深导入内部模块。

| 检查 | 命令 | 何时跑 |
| --- | --- | --- |
| 成员门禁 | `pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract` | 每次提交前 |
| 预检 | `pnpm run preflight` | 交回前 |
| 结构扫描 | `pnpm package:template scan --member packages/skills/skill-contract --json` | 交回前 |
| 差分变异 | `pnpm run mutation`，范围本成员 | reduce 在合入前跑 |

- 不能声称：读取权、解析、耐久已验证（替身通过不证明这些）。

## 待决事项

无。

## Out of Scope

- 三个应用服务的实现与 `SkillAccess` 符合性套件（W2）。
- 目录来源 `DirectorySource`（W2，skill-host-local）。
- 修改组页、领域页、统一语言（reduce 在波末做）。

## Further Notes

- 判据 SC1–SC8 见 [plan.md](plan.md)「切片」。
