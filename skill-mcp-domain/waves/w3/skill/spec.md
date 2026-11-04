# W3 Skill 线实施规格：`SkillCatalog`、契约回写与真实来源示例

格式沿 `claim` 技能 `references/spec-template.md`，方法 Matt `to-spec`。只写差额，共用部分引用。与 [MCP 线规格](../mcp/spec.md)同骨架。

- 卡：[#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)（交付修订 1）；波包 [w3/wave-pack.md](../wave-pack.md)；F0 `05f281394c9179ecb9427fb1d5b97cc2f808a789`
- 上一层：[线级地图](../../line-skill/context-map.md)；[共用约束](../../constraints.md)；[范式 r2](../../operating-model.md)；W1、W2 规格的已定事项继续有效，与本页冲突时以本页为准；[W2 带回的契约可加调整](../../w2/schema-check.md#w2-skill-带回的契约可加调整w3-prep-回写-skill-contract)
- 主工作类型：feature → poteto-mode Feature
- 风险级别：L3。`SkillCatalog` 决定无权主体能不能从摘要列表推知一个身份存在；任一身份 `unknown` 必须让整次 `unknown`，不能压成空列表

## Problem Statement

W2 之后，知道能力标识的调用方能描述、读取、导出一份 Skill，但没有人能问「我现在能用哪些 Skill」或「哪份 Skill 讲的是 X」。`SkillCatalog` 只有接口。契约与实现之间还有三处重复定义和一处处置不对称：常量与 `sameCapability` 在 `skill` 里各写了一份；读取判定一侧对畸形答复答 `unknown`，来源一侧抛 `TypeError`；`open` 答 `entry-unreadable` 的映射只在源码里。最后，没有一个用真实目录把检查、目录与读取串起来的示例。

## Solution

一个闭包 `w3-skill-catalog`，从 F0 起，与 MCP 线并行：

- `skill-contract` 可加：导出常量与 `sameCapability`；SPEC 写明端口答复不在封闭集合内或以 reject 失败时的统一处置；补 `open` 的 `entry-unreadable` 映射条款；`./testing` 加 `skillCatalogConformance()`。
- `skill` 公开根加 `createSkillCatalog(ports)`；删除与契约重复的定义，改用契约导出；统一畸形答复的处置。
- `skill-host-local/examples/` 加一个真实目录示例：`createDirectorySource` + `createPackageInspection` + `createSkillCatalog` + `createSkillAccess`，读取判定与解析用 `./testing` 替身，作为可运行的测试。

## 依据与已定事项

| 依据 | 精确修订 | 本规格采用的范围 |
| --- | --- | --- |
| 组页 `packages/skills/docs/architecture.md` | F0 | 「应用服务」`SkillCatalog` 行与「检查与发现」后两段、决定表第三行；「失败种类」`unknown` 行 |
| 成员 SPEC `packages/skills/skill-contract/SPEC.md` | F0 | 「需求端口」「符合性套件」；`SkillResolution.adopted` 与 `CatalogResolution` |
| 成员 SPEC `packages/skills/skill/SPEC.md` | F0 | 映射表、正文与范围、无披露 |
| 契约源码 `skill-contract/src/{services,ports,names,testing-*}.ts` | F0 | `SkillCatalog`、`CatalogEntry`、`CatalogQuery`、三个内存替身 |

已定事项（reduce 裁定，写者照做）：

1. **端口参数**：`createSkillCatalog(ports)` 收 `Pick<SkillPorts<P, S>, 'readCheck' | 'resolution'>`。不收来源：目录不读字节。
2. **集合来源**：只用 `SkillResolution.adopted(access, scope)`。它答 `unknown` 或不可用时整次答 `unknown`。答空集合时答空列表。
3. **逐个核验**：对集合里每个身份调用 `SkillReadCheck.check(access, scope, capability)`。`granted` 进入结果，`refused` 不出现，任一 `unknown` 使整次答 `unknown`。核验可以并发发出；整次结果不随完成次序变化。同一能力标识在集合里出现多次时只核验一次、只出一条（按 `sameCapability` 判同）。
4. **条目组装**：`adopted` → `{ kind: 'adopted', capability, name, description?, dependencies }`，`dependencies` 取自 `declared`（资产正文声明投影）；`known-unavailable` → `{ kind: 'stand-in', capability, name, description?, reason }`，取最后合法的 name、说明与替换件原因。条目次序不承载含义；实现按能力标识的规范文本排序，使同一输入得到同一输出（便于测试与比较），SPEC 写明次序不是承诺。
5. **`capabilities` 过滤**：给出时只交其中属于当前合法集合且 `granted` 的身份；不在集合里的不交，也不说明原因。重复项去重。给出空数组时答空列表，不调用读取判定。过滤先于核验：不在请求里的身份不核验（减少端口调用，不改变答复）。
6. **`search` 的匹配规则**（契约只写「按 name 与说明」，本波定死并写进 skill-contract SPEC）：查询文本与 name、说明都先做 Unicode NFKC 规范化再转小写（`toLowerCase()`，与区域设置无关）。查询按空白切成词；每个词都是 name 或说明（两者拼接时中间加一个换行）的子串时，该身份匹配。没有词（空串或只有空白）时匹配全部，等同 `summaries` 不带过滤。匹配先于核验：不匹配的身份不核验。`search` 不排序打分。
7. **无披露的证明**：对同一主体，「身份被拒」与「身份不在集合里」两种世界下 `summaries` 与 `search` 的答复深度相等；对 `capabilities` 点名一个被拒的身份与点名一个不存在的身份，答复深度相等。
8. **端口答复的统一处置**（契约 SPEC 新增一条，`skill` 照做）：需求端口的答复不在它的封闭集合内，或以 reject 失败时，实现不抛出：`SkillReadCheck` 与 `SkillResolution` 的这种答复当作 `unknown`；`SkillPackageSource` 的这种答复按映射表的 `unavailable` 一行处置（检查答 `source-unavailable`，读取答 `source-unavailable`）。改掉 `skill` 现在来源一侧抛 `TypeError` 的分支，并补用例。调用方自己的前提违反（字节范围非法、伪造快照）仍抛 `TypeError`，不变。
9. **`open` 的 `entry-unreadable`**：契约 SPEC 的映射条款补一行：`open` 答 `entry-unreadable` 时，`inspect` 答 `source-unavailable`，`read`/`list`/`export` 答 `source-unavailable`。这是 `skill` 源码的现行行为（`mapping.ts`），本波只补条款，不改行为。若写者核对发现源码与这一行不同，停下交回。
10. **契约导出**：`skill-contract` 公开根导出 `MANIFEST_PATH`、`DECLARATION_PATH`（已在 `names.ts`，核对是否已从根导出）、`PAGE_LIMIT`（新增，65536，SPEC「读取的形状规则」已写此值）与 `sameCapability`（从 `testing-resolution.ts` 移到公开根的非测试模块，`./testing` 继续可用）。`skill` 删除 `inspection.ts`、`access/service.ts` 里的路径常量、`access/range.ts` 的 `PAGE_LIMIT` 定义与 `access/gate.ts` 的 `sameCapability`，改为导入契约。
11. **`skillCatalogConformance()`**：放在 `skill-contract/src/testing-catalog.ts`，形状同其他套件（`ConformanceCase<CatalogFixture>[]` + `node:assert`）。用例至少覆盖已定事项 2–7：空集合、`refused` 不出现、任一 `unknown` 整次 `unknown`、`stand-in` 条目、`capabilities` 过滤与去重、空 `capabilities`、`search` 的规范化与多词、无披露两组 `deepStrictEqual`。`skill` 的测试用三个内存替身跑它；用一个违约实现（例如把 `refused` 也列出）证明套件会变红。
12. **真实来源示例**：`packages/skills/skill-host-local/examples/directory-journey.ts`（可运行）与 `examples/README.md`；`tests/examples.spec.ts` 运行它并断言：临时目录里放两个合法包与一个非法包；`inspect` 两个通过一个拒绝；`summaries` 只列被授予的那个；`search` 能按说明找到它；`read` 正文第一页与 `SKILL.md` 正文一致。读取判定与解析用 `skill-contract/testing` 的替身，SPEC 与 README 写明示例不是产品装配。
13. **类/函数**：`createSkillCatalog` 返回对象字面量；无类、无 `as`（`as const` 除外）、无 `any`。

## 原则与约束

| ub-mode 条目 | 本规格的取舍 |
| --- | --- |
| 先做对 | 无披露与整次 `unknown` 先有红用例；再写组装 |
| 其余 | 按 ub-mode 全文 |

| 判断或约束 | 拥有者 | 本规格的具体条目 |
| --- | --- | --- |
| 轴与拥有者 | `engineering-taste.md` | 合法集合归 `SkillResolution`；读取权归 `SkillReadCheck`；排序、呈现、常驻、可用性归调用方。`SkillCatalog` 只做过滤与组装 |
| 领域边界 | `layers-and-dependencies.md` | 无新增外域概念；MCP 动作不进入 Skill 的能力标识组合 |
| 面向契约 | 成员 SPEC | 契约改动全部可加；`sameCapability` 移位保持 `./testing` 仍可导入 |
| 防御与失败语义 | `docs/defensive-patterns.md` | 见下 |
| 演进政策 | `publication.md` | 删除 `skill` 里的重复定义，不留别名 |

### 跨域概念的五问

不适用：本波不新增跨域概念。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | 只列 `granted` 的身份；`stand-in` 带原因 | `skill` | 套件 |
| 失败 | 无失败种类，只有 `unknown` | `skill` | 套件 |
| 未知 | 集合或任一核验 `unknown` → 整次 `unknown`；畸形答复与 reject → `unknown` | `skill` | 用例 |
| 取消与清理 | `SkillCatalog` 不收 `signal`（契约如此），不持有资源 | — | — |
| 外部效果 | 无 | — | — |

## User Stories

1. 作为 Agent，我要列出我现在被授予读取的 Skill 摘要，以便选择要读哪一份。
2. 作为 Agent，我要按说明里的词找 Skill，大小写与全角半角不影响结果。
3. 作为别的租户的主体，我从摘要与检索里推不出任何我无权读取的 Skill 存在。
4. 作为调用方，端口一时答不上来时，我得到 `unknown`，而不是一个看起来完整的短列表。
5. 作为宿主装配者，我有一个用真实目录跑通检查、目录与读取的示例可以照抄。

## Implementation Decisions

- `skill-contract`：`src/index.ts`（导出）、新文件 `src/capability.ts`（`sameCapability`）或放进现有非测试模块、`src/access-limits.ts`（`PAGE_LIMIT`，命名写者可定）、`src/testing-catalog.ts`、`src/testing.ts`；`SPEC.md`「需求端口」与「符合性套件」两节、`search` 匹配规则、映射条款。
- `skill`：新文件 `src/catalog.ts`；`src/index.ts` 导出 `createSkillCatalog`；删重复定义；`tests/catalog.spec.ts`（跑套件）、`tests/port-answers.spec.ts`（统一处置）。
- `skill-host-local`：`examples/`、`tests/examples.spec.ts`；SPEC 验证节加示例一行。

## Testing Decisions

- 先写红；红灯输出存闭包 tmp 的 `red/`。证明变红时先还原源码并**重建 dist** 再跑。
- 接缝：服务 + 三个内存替身；套件 + 违约实现；示例 + 真实临时目录。
- 先例：`skill-contract/tests/conformance.spec.ts`、W2 `skill/tests/access-conformance.spec.ts`。
- 传感器：三个成员 build/typecheck/test、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`metrics --coverage --base F0`、`mutation --base F0`。L3 热点（`catalog.ts` 的过滤与 `unknown` 传播）由 reduce 逐行读并派 implementation-reviewer 实跑探针。
- 不能声称的事：真实读取判定与解析端口；内容存储来源；大集合的性能。

## 判据

| ID | 判据 | 证据 |
| --- | --- | --- |
| SK3-1 | `summaries`：空集合答空列表；`refused` 不出现；任一 `unknown` 整次 `unknown`；集合 `unknown` 整次 `unknown`；`stand-in` 条目带原因 | 套件 |
| SK3-2 | `capabilities` 过滤：只交属于集合且 `granted` 的；去重；空数组不调用读取判定（替身计数 0）；不在请求里的身份不核验 | 套件；替身计数 |
| SK3-3 | `search`：NFKC 与小写规范化、多词全部命中、空查询匹配全部；不匹配的身份不核验 | 套件 |
| SK3-4 | 无披露：两组 `deepStrictEqual`（已定事项 7） | 套件 |
| SK3-5 | `skillCatalogConformance()` ≥ 12 条，内存替身全过，违约实现变红 | `catalog.spec.ts` |
| SK3-6 | 端口畸形答复与 reject：读取判定、解析、来源三类各一例，答复符合已定事项 8，不抛出 | `port-answers.spec.ts` |
| SK3-7 | 契约导出四项；`skill` 里重复定义删除（`grep` 为空）；W2 全部用例原样通过 | 用例；`grep` |
| SK3-8 | 契约 SPEC 有 `search` 匹配规则、统一处置、`open` 的 `entry-unreadable` 映射三处条款 | SPEC diff |
| SK3-9 | 真实目录示例作为测试运行通过 | `examples.spec.ts` |

## 待决事项

| 缺口 | 影响的切片 | 处置 |
| --- | --- | --- |
| 无 | — | — |

## Out of Scope

- 内容存储来源；`SkillCatalog` 的 `signal`；排序与打分；常驻筛选；依赖在不在场；Cordis 服务键（W4）；组页写回（波末）。
