# 闭包规格 w3-skill-catalog

## 身份与位置
- 闭包：w3-skill-catalog
- 卡与修订：#1119 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/w3-skill-catalog
- 分支：PanQiWei/skill-mcp-w3-skill-catalog
- 基线：05f281394c9179ecb9427fb1d5b97cc2f808a789
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：无披露与整次 `unknown`（策略 `security-sensitive` → 顶档、上限 high）；单一服务、规则已定，不是 hardest。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：实现 `SkillCatalog`（`summaries`、`search`），把 W2 带回的 Skill 契约可加调整写回 `skill-contract`，统一端口畸形答复的处置，并加一个用真实目录跑通检查、目录与读取的示例。按 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/skill/plan.md 的切片 01→03 顺序做。

形状与决定：
- 以 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/skill/spec.md「已定事项」1–13 为准，逐条照做，不重新裁定。
- `skill-contract` 只做可加改动。
- Skill 领域不依赖任何工具、不管脚本设施；示例只用三个 Skill 成员与 `./testing` 替身。

不在范围内：MCP 成员；内容存储来源；`SkillCatalog` 的 `signal`、排序打分、常驻与可用性；组页；新依赖。

### 写范围
- `packages/skills/skill-contract/` — 可加改动：`src/`、`tests/`、`SPEC.md`、`README.md`、`README_ZH.md`、`documentation.json`
- `packages/skills/skill/` — `src/`、`tests/`、`SPEC.md`、`README.md`、`README_ZH.md`、`documentation.json`、`acceptance/`、`examples/`
- `packages/skills/skill-host-local/examples/`、`packages/skills/skill-host-local/tests/examples.spec.ts`、该成员 `SPEC.md` 验证节、`README.md`/`README_ZH.md` 的示例一句
- 三个成员的 `package.json` 只允许改 `exports`、`files`、`scripts`

### 排除的调用方
- `packages/mcp/*` — 另两位写者在改；不碰
- `packages/skills/skill-host-local/src/` — W2 成果；只读。停止条件：示例需要改来源实现时停下交回
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写（`skill-host-local` 的测试依赖 `@omne-harness/skill` 已在基线）
- `packages/skills/docs/`、`docs/domains/skills/` — 波末写回

## 验收清单
每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract --filter=@omne-harness/skill --filter=@omne-harness/skill-host-local` 退出 0；W2 的用例全部通过（报告给出前后用例数）。
2. SK3-1–SK3-4：`skillCatalogConformance()` 覆盖已定事项 2–7，用例名带事项号；`skill/tests/catalog.spec.ts` 用三个内存替身跑全部用例，`not-applicable` 计为失败。
3. SK3-5：套件 ≥ 12 条；一个违约实现（把 `refused` 也列出）使无披露与过滤用例变红；另一个违约实现（把 `unknown` 压成空列表）使整次 `unknown` 用例变红。变异记录存 `tmp/closures/w3-skill-catalog/mutations/`。
4. SK3-2 的替身计数：空 `capabilities` 时读取判定替身调用 0 次；`capabilities` 与 `search` 的未命中身份不被核验。
5. SK3-6：`skill/tests/port-answers.spec.ts`：读取判定、解析、来源三类端口各给一个畸形答复与一个 reject，答复符合已定事项 8，不抛出。变异：恢复来源一侧的 `TypeError` 分支 → 用例变红。
6. SK3-7：契约公开根导出 `MANIFEST_PATH`、`DECLARATION_PATH`、`PAGE_LIMIT`、`sameCapability`；`grep -rn "const MANIFEST_PATH\|const DECLARATION_PATH\|const PAGE_LIMIT\|function sameCapability" packages/skills/skill/src` 为空。
7. SK3-8：契约 SPEC 三处条款（`search` 匹配规则、统一处置、`open` 的 `entry-unreadable` 映射），报告给出条款位置。
8. SK3-9：`pnpm --filter @omne-harness/skill-host-local test -- examples` 通过，示例断言见 spec 已定事项 12。
9. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`、`git ls-files --eol | grep -c w/crlf` 为 0。
10. `src/` 无 `class`、无 `as`（`as const` 除外）、无 `any`。

## 实施规格
- `skill-contract/src/testing-catalog.ts`：`skillCatalogConformance<P, S>(): ConformanceCase<CatalogFixture<P, S>>[]`；`CatalogFixture` 给出 `catalog`、已知主体与作用域、被授予/被拒/未知/替换件的身份，以及一个计数读取判定调用的探针。名可调，写进报告。
- `skill-contract`：`sameCapability` 移到公开根的非测试模块，`testing-resolution.ts` 改为导入它；`PAGE_LIMIT` 新增于合适的非测试模块；`index.ts` 导出四项。
- `skill/src/catalog.ts`：`createSkillCatalog(ports)`；`search` 的规范化是一个纯函数（例如 `matches(query, name, description)`），单独穷举测试。
- `skill/src/index.ts` 导出 `createSkillCatalog`。
- `skill-host-local/examples/directory-journey.ts` 导出一个 `async function runDirectoryJourney(root: string)`，返回各步结果；`tests/examples.spec.ts` 在 `mkdtemp` 临时目录里建包并调用它。
- 命名账本：`createSkillCatalog`、`skillCatalogConformance`、`CatalogFixture`、`matches`、`PAGE_LIMIT`、`sameCapability`、`runDirectoryJourney`。

## 性质及证据义务
- L3：对同一主体，「被拒」与「不存在」两种世界下 `summaries`、`search` 与带 `capabilities` 的答复深度相等；任一 `unknown` 整次 `unknown`，不压成空。
- 结果不随核验完成次序变化：用 deferred 以两种次序完成核验，答复深度相等。

## 施工计划
1. 切片 01：契约导出与条款；套件先写，先用内存替身组装一个参考实现让套件可跑（参考实现可以就是切片 02 的 `createSkillCatalog`，先红）。红灯输出存 `tmp/closures/w3-skill-catalog/red/01.txt`。
2. 切片 02：`catalog.ts`；删除重复定义；统一处置；`port-answers.spec.ts`。
3. 切片 03：示例与测试。
4. 门禁、文档、交回。证明变红时先还原源码并重建 dist 再跑。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、破坏性契约改动。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w3-skill-catalog。另两位写者并行写 `packages/mcp/mcp-contract/` 与 `packages/mcp/mcp/`。派发者唯一合回。不跑 `admission` 与仓库全量测试；差分变异由 reduce 在最终 head 跑。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w3-skill-catalog/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/skill/spec.md 全文与同目录 plan.md；组页 `packages/skills/docs/architecture.md`「应用服务」「检查与发现」；`packages/skills/skill-contract/SPEC.md`「需求端口」「符合性套件」；`packages/skills/skill/SPEC.md` 映射表与无披露。
- 源码：`skill-contract/src/{services,ports,names,testing,testing-case,testing-resolution,testing-read-check}.ts`；`skill/src/{mapping,inspection,ports}.ts`、`src/access/*.ts`；`skill-host-local/src/directory-source.ts`。
- 必须加载：ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。

## 当前认知
- 已确认：`SkillCatalog`、`CatalogEntry`、`CatalogQuery`、`CatalogResolution` 已在契约；`MANIFEST_PATH`、`DECLARATION_PATH` 已在 `names.ts`（是否从根导出待核）；`sameCapability` 在 `testing-resolution.ts`；`skill` 里有四处重复定义（`inspection.ts`、`access/service.ts` 的路径常量，`access/range.ts` 的 `PAGE_LIMIT`，`access/gate.ts` 的 `sameCapability`）。
- 假设：`SkillResolution.adopted` 的答复里 `known-unavailable` 带最后合法的 name、说明与替换件原因。不成立时停下交回。
- 未知：无。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果；自定裁定与理由；变红证据路径；写者声称的结构性改动清单（reduce 逐条 `grep` 核实）；未覆盖项。过程输出留工作树 `tmp/closures/w3-skill-catalog/`。

## 已知会受影响的现有用例
- `skill-contract/tests/public-entry.spec.ts`、`skill/tests/public-entry.spec.ts`：导出集合按新增改写（不算放宽）。
- `skill` 中断言来源畸形答复抛 `TypeError` 的用例（如有）：按已定事项 8 改为断言 `source-unavailable`，报告列出。

## 停止条件
- 已定事项 9 与源码不符。
- 契约改动只能是破坏性的。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-04T06:10Z 第 1 轮停在开工核对（停止条件「已定事项 9 与源码不符」命中，报告 `tmp/closures/w3-skill-catalog/report.md`）。reduce 核实源码后裁定**候选 A**：条款写成「`open` 答 `entry-unreadable` 时，`inspect` 拒绝为 `malformed`（与 `snapshot` 一格），`read`/`list`/`export` 答 `source-unavailable`」，不改行为；spec 已定事项 9 已改。写者报告里「能自己定」的四项照报告做：根导出 `MANIFEST_PATH`/`DECLARATION_PATH`；`skill/SPEC.md`「端口抛出的错误原样抛出」一句按已定事项 8 改；来源答复不在集合内或 reject 统一按 `unavailable` 一行处置（`mapping.ts` 不在表内的键答 `unavailable` 一行，来源调用的 reject 收束为同一行）；SK3-6 的变异改为「还原为直接查表、reject 原样上抛」。同一写者续做，轮次仍记 1。
- 2026-11-04T07:00Z **第 2 轮输入**（评审汇总 `waves/w3/reviews/skill-catalog-r1.md`：L3 无阻断但 N1/N2；设计 B1–B3、S1–S8；表达 B1–B3、N1–N10）。reduce 裁定如下，逐条先写会因预期原因变红的用例（不是「模块不存在」），证明变红前先还原源码并重建 dist：
  - **R1 封闭集合覆盖载荷**（设计 B1/B2、L3 N1、表达 B1）：每个端口的答复在 `skill` 的边界上一次性完整解析（每端口一个解析函数，返回解析后的值或「没有作答」），不只看 `kind`/`'ok' in`。`answered` 改为交出 `unknown` 由解析函数收窄。`adopted` 每项完整核对（能力标识经 `capabilityId` 重建、`isSkillName`、`isSafeReason`、`isBoundedText`、`ref`、`declared.tools` 逐项），任一项不合 → 整次 `unknown`；`resolve` 残缺 → `unknown`；`open` 的 `ok` 不是 `Uint8Array` → `source-unavailable`；`snapshot` 的 `ok` 不是 `sealSnapshot` 造出的 → `source-unavailable`（端口违反 PS1，不是调用方前提违反）。为此 `skill-contract/./provider` 可加一个不抛出的守卫（例如 `isSealedSnapshot(value: unknown): value is SkillPackageSnapshot`），`assertSealed` 与 `parseSkillPackage` 对直接调用方仍抛 `TypeError`。同步抛出与 reject 同样处置。契约 `#port-answer-closed` 按此重写：逐端口列出核对什么（判别与载荷），「例如」去掉；`skill/SPEC.md:47`「`ok` 原样交出」与 `:94` 同步。代价（来源缺陷表现为「此刻不可用」）写进 SPEC。
  - **R2 空 `capabilities`**（设计 S2、L3 待裁 1、表达 N2）：给出空数组时直接答空列表，不调用任何端口。契约写明这条优先于「集合 `unknown` 整次 `unknown`」。
  - **R3 次序与重复**（表达 N3）：采用表达评审的措辞；「同一输入」= 同一主体、同一请求、端口答复（含 `adopted` 项的次序）相同；结果不随读取判定完成次序变化写进规范条款；重复身份保留端口答复中的第一条，写明。
  - **R4 空白**（表达 N4）：取 ECMAScript 正则 `\s`（与 `match.ts` 现状一致），写明。
  - **R5 套件**（设计 B3、S1，表达 B2、N5、N8，L3 N2）：SC6 加两条——按 `granted` 说明里一个 name 中没有的词检索答 `[granted]`；该词写成全角或大写后检索仍答 `[granted]`；以「忽略说明」「只规范化查询一侧」两个变异作红灯证明。夹具给出 `refused` 在合法集合答复中的 name 与说明；约束写成「`refused` 与 `standIn` 的 name 与说明经 NFKC 与小写后都不含 `granted` 的 name」，`granted` 必须带说明且说明含一个 name 中没有的词；SC7 用夹具给出的 `refused` name 检索。契约 SC7 与 SC 编号的措辞按表达 N5、N8；`skill/SPEC.md:86` 只引用契约 SC7。
  - **R6 示例**（设计 S3/S4/S5，表达 B3）：补跑两个未跑过的变异（只去掉 `{ basis }`；把被拒的包当空包）。不变红就加强 `examples.spec.ts` 的断言（例如断言读取结果的 `basis` 等于 `describe` 钉下的依据；断言被拒的包不进摘要且没有被当作空包读取），再证明变红；做不到的声明从 host-local SPEC 删去。测试改用真实构造（`capabilityId`、`organizationCodec`/`accountCodec`/`tenant`/`access`；`@omne-harness/assets` 与 `@omne-harness/legal-identity` 测试依赖已由 reduce 在 2c3f9d863 加好），删掉 `as unknown as`；`Reader.access` 写 `Access<P>`。示例不自造 `unsupported` 失败：没有钉下的依据时不带 `basis` 调 `read`，让服务作答。D1 签名（替身由调用方注入）认可。
  - **R7 小项**：设计 S6（用例名与断言）、S7（解析函数里 `switch` + `never`，删 `LAWFUL_KINDS`）、S8（删 `skill` 里重复的套件形状检查）；表达 N6（a 删 `list`；b 读控制文件时 `open` 答 `entry-unreadable` 与快照阶段同样以 `malformed` 结束，写明；c 写明契约只在 `snapshot` 定义 `entry-unreadable`，`open` 答它是防御性映射；d「三条补充」改「映射补充」）、N7（`sameCapability` 判同规则、三个常量的值，`#296` 改引 `PAGE_LIMIT`）、N9（依据写到具体提交、host-local 依据表加 W3 行、示例替身的说法）、N10（「三个工厂」、「恰好」列出用例）。
  - **R8 与组页的差异**（表达 N1）：契约「与组页的差异」表加两行（过滤与匹配先于核验；`open` 也可答 `entry-unreadable`）；契约:346 与 :348 按表达 N1 的建议改。组页本身不改（波末写回）。
  - **R9 写范围扩大**：三个成员的 `docs/`（`public-api.md`、`architecture.md`、`flows.md`、`object-model.md` 中需要同步的部分）与 `skill-host-local/tests/README.md`、`tests/index.md` 加入写范围（第 1 轮漏列，写者已列出交接项）。
  同一写者续做，轮次记 2。返工原因：评审发现、规格（R1 的边界与 R2 是规格缺口）。
- 2026-11-04T09:55Z 第 2 轮换写者：原写者（claude-fable-5-1@high）撞 Fable 用量上限，尚未改动（工作树干净，head 2c3f9d863）。按 delegate「升级与降级」记一次降级：改派 claude-opus-5-5@high（默认档；策略要求顶档的理由是 security-sensitive，Fable 不可用时以 Opus 加 L3 逐行复审补足），输入不变（本规格全文 + 07:00Z 的 R1–R9 + 第 1 轮报告 `tmp/closures/w3-skill-catalog/report.md`）。轮次仍记 2。
- 2026-11-04T10:55Z **第 3 轮输入**（增量评审与差分变异，见 `waves/w3/reviews/skill-catalog-r1.md`「第 2 轮」）。同一写者（opus）续做，范围小：
  - **S1 参数树重新构造**（阻断 B1、N4、D2-5）：`isJsonValue` 改为构造函数：逐节点只取列出的字段、重新构造并冻结；深度上限沿用声明 JSON 预算的 `maxDepth`（`parse/declaration.ts`），超出即「没有作答」；`number` 节点的 `lexeme` 按 JSON 数字词法核对。判别与字段存在用自有属性（不接受原型链上的 `kind`/`ok`）。用例：嵌套多余字段不交出；端口事后改动不影响已交出的值；深度超限答 `unknown` 不栈溢出；非法 `lexeme` 答 `unknown`；原型链上的 `kind` 不被接受。
  - **S2 存活变异**：给 `answer-values.ts`、`port-answer.ts` 写逐字段的畸形答复表（每个被核对的字段一行：缺失、类型不对、值域外），把差分变异里这几个文件的存活与无覆盖逐条杀掉或逐条说明为等价变异（说明能否改夹具或代码使其可判定）；`catalog.ts`、`match.ts`、契约 `snapshot.ts`、`capability.ts` 的存活同样处理。契约 `testing-catalog.ts` 的存活与无覆盖是套件代码，由 `skill` 跑套件覆盖，不要求在契约成员内杀掉，报告里列出即可。存活清单：`/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/evidence/w3-skill-catalog/reduce-r2/mutation.txt`。
  - **S3 措辞**：N1 报告更正为 21；N2 改为「不按相关度排序，不打分；条目次序见下一条」；N3 写明「缺省与 `undefined` 同等」只适用于载荷字段，判别看自有属性在不在；N4 把 D2-1 的代价写进 `skill/SPEC.md`（本包解析时的异常也算没有作答，方向是拒绝；调用方看到的是「此刻无法判定」）；N5 写明夹具不满足约束时用例失败；N6 第 79 行改为「`open` 答 `entry-unreadable` 时本页给出防御性映射」。
  - **裁定**：D2-12 认可（成员 docs 内同步「三个工厂」在范围内）。D2-1 的可观测性（被吞异常没有诊断出口）不在本波：记为 M2 之后与观测拥有者的议题。
  轮次记 3。返工原因：评审发现、变异读数。
