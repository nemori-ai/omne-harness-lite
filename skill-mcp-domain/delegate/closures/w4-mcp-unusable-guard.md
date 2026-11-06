# 闭包规格 w4-mcp-unusable-guard

## 身份与位置
- 闭包：w4-mcp-unusable-guard（W4 MCP 线切片 01 的守护写者）
- 卡与修订：#1119 r1，波段 W4
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable
- 分支：PanQiWei/skill-mcp-w4-mcp-unusable
- 基线：78d8505050fa68a47a66d801478e27e5e1292409
- 清晰度：界

基线是同一分支上产品写者的最终提交 `78d850505`；整个闭包的基线仍是 F `60acfc28b640a1535585df1ebccd22bdc87e4d7c`。

产品写者已在本分支给传输答复加了可选标记 `unusable`（决策层写入，两种传输与脚本化传输原样交出），并用全函数 `lostOf`（`packages/mcp/mcp/src/internal/lost.ts`）决定答复对连接的后果。它为了让符合性套件在新形状下通过，按派发者裁定改了套件里三处比较点，标记的期望值由 `unusableCauseOf`、`refusedAfter`（`packages/mcp/mcp-contract/src/testing-transport.ts` 第 808 行一带）从 T8 表推出。本闭包给出独立于产品写者的证据：套件能拦住漏标与错标的传输，探索器能拦住「不带标记也转 `lost`」的连接表。

依据是 W4 MCP 规格第 1 节第 3、8 条与 D-W4M-2。产品写者的交回在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w4-mcp-unusable.md` 的追加记录之后由派发者转述，本规格「当前认知」列出要点。

## 模型与推理强度
developer，implementation_kind verification，Claude Opus 5.5（claude-opus-5-5），effort high。policy_version 947.1，policy_revision 0fe161ac874e0b538876a8b1e580b5c15e9bdd492178f703aaa9bcabedac3f67，role_source_revision c0a49e85629301ba225d65c857d6e9a88a14e75affcec153d11e333488c41299，宿主 Claude Code。策略按 work `verification`、risk `cross-module-lifecycle` 解析为 Fable 5.1 xhigh。实际按负责人分档规则派 Opus high：在已有探索器与违约套件上加一条性质、两个违约实现与负控，接缝由规格给出（W4 MCP plan「角色与模型分配」）。

## 目标边界
目标：漏标、错标的传输让符合性套件变红；把「不带标记也转 `lost`」放进源码时，探索器报新性质违例。产品源码不改。

### 已定的事（不重新裁定）

1. **独立核对推导函数。** 先逐行对照契约 `SPEC.md` 的 T1（标记的含义与单调性）与 T8 表，核对 `testing-transport.ts` 的 `unusableCauseOf`、`refusedAfter` 与 `checkCall` 的期望：带「传输不再可用」的行，该请求与之后每个请求的期望带标记，原因按行（`no-answer` 取自身原因，`not-sent`（`session-ended`）取 `session-ended`，X02 的 `not-sent`（`connection-unavailable`）取 `stream-broken`）；其余行的期望不带这个字段。`close()` 之后的答复不带标记。发现不一致时停下交回，不改（停止条件第 2 条）。
2. **两个违约实现。** 写在 `packages/mcp/mcp-contract/tests/transport-conformance.spec.ts` 的「the suite fails a transport that breaks the contract」一组里，写法同现有的 `resendingCalls`（包一层 `McpTransportFactory`）：
   - **漏标**：把交出的每个失败答复与 `SentCall.answer` 里的 `unusable` 去掉。
   - **错标**：给一个线路仍可用的失败答复加上标记（例如 HTTP 上单个 POST 的 5xx 或流断开），或把标记的原因换成别的 `UnusableCause`。两种写法选一种做违约实现，另一种写进交回的「未覆盖」并说明理由。
   每个违约实现断言套件的失败清单恰为它破坏的那些行（`toEqual` 精确清单，同现有两条），不是「至少有一条失败」。在两种传输上跑（`['streamable-http', 'stdio']`，同现有写法）。
3. **探索器的新性质。** 在 `packages/mcp/mcp/tests/model/properties.ts` 加 `P15`：就绪连接上一个请求得到不带 `unusable` 的失败答复（不带标记的 `not-sent`（`connection-unavailable`）或 `no-answer`），而且答复不是 `not-sent`（`authorization-required`）时，这一步之后该连接的状态不是 `lost`，清单不被标记。性质写成对探索轨迹的检查，形状同现有 P1–P14。
4. **场景与替身。** `tests/model/ports.ts` 现在的 `NOT_SENT` 与 `STREAM_BROKEN` 都带 `stream-broken` 标记（产品写者加的，让探索器仍经过转 `lost` 的交错，不改）。加不带标记的同类失败值，在 `tests/model/scenarios.ts` 加一个场景（或扩一个现有调用场景），让调用口、任务操作或 `refresh` 的页请求在就绪连接上遇到不带标记的失败，同时保留带标记的分支，使同一场景里两种结局都出现。场景的规模按现有场景的界，不放大探索空间。
5. **负控。** 源码变异：把 `lost.ts` 的 `lostOf` 第 3 条改为「不带标记的 `not-sent` 或 `no-answer` 也转 `lost`」（或在调用口的判断处做等价改动），构建 `@omne-harness/mcp` 后探索器报 `P15` 违例；按字节还原并重建后无违例。变异只在工作树里临时改，不提交。
6. **TLA+。** D-W4M-2 把探索器定为必做接缝。`Calls.tla` 只有在不改抽象就能表达 P15 时才加配置；核实后在交回写明能或不能及理由，默认不加。
7. **记录。** `packages/mcp/mcp/verification/README.md`「两种证据能变红」加一行 P15 与负控（新序列名自定，例如 U15 或 G1，写明序列的意思）；`packages/mcp/mcp-contract/verification/`（若有对应页）记下两个违约实现。
8. **顺手修两处过时说明**（产品写者交回时点出，本闭包的文件邻居）：`packages/mcp/mcp/docs/architecture.md:25` 关于 `internal/lost.ts` 的句子改为「`lostOf`：传输答复对就绪连接的后果，按 `unusable` 标记与 `authorization-required` 判断（S5、S7）」一类的现状；`packages/mcp/mcp/README.md:82` 关于偏离的句子改为现状（偏离一节写的是没有偏离）。

### 写范围
- `packages/mcp/mcp-contract/tests/transport-conformance.spec.ts` — 第 2 条
- `packages/mcp/mcp-contract/verification/` — 第 7 条，仅当已有对应页
- `packages/mcp/mcp/tests/model/properties.ts` — 第 3 条
- `packages/mcp/mcp/tests/model/explore.ts` — 第 3 条，仅当新性质要在这里接线
- `packages/mcp/mcp/tests/model/ports.ts` — 第 4 条，只加值，不改已有两个值
- `packages/mcp/mcp/tests/model/scenarios.ts` — 第 4 条
- `packages/mcp/mcp/tests/model/calls.spec.ts` — 第 4 条，仅当新场景要在这里登记
- `packages/mcp/mcp/tests/model/lifecycle.spec.ts` — 同上
- `packages/mcp/mcp/verification/README.md` — 第 7 条
- `packages/mcp/mcp/verification/models/` — 第 6 条，仅当加 TLA+ 配置
- `packages/mcp/mcp/docs/architecture.md` — 第 8 条，只改第 25 行一带
- `packages/mcp/mcp/README.md` — 第 8 条，只改第 82 行一带

### 仓库之外的任务产物
无。

### 排除的调用方
- 三个成员的 `src/` 全部文件：产品源码不改。负控变异只临时改，按字节还原，不提交。
- `packages/mcp/mcp-contract/src/testing-transport.ts`、`testing-transport-table.ts`：第 1 条只核对，不改；不一致就停下。
- 三个成员的 `SPEC.md`：产品写者已改，本闭包不碰。
- `packages/mcp/mcp-host-local/` 全部文件。
- 简报检查对 `unusable`、`lost`、`not-sent`、`no-answer` 等通用词报的 `caller-outside-scope` 是规格说明里的同名匹配：本闭包不改任何产品符号的定义，只加用例、性质、场景与记录。

## 验收清单
1. `VITEST_MAX_WORKERS=6 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --filter=@omne-harness/mcp-host-local` 退出 0（正控：探索器含 P15 无违例）；同一组 `--filter` 的 `pnpm turbo run test:slow` 退出 0。
2. 两个违约实现：各一条用例断言套件的失败清单（精确清单）；正常的两种传输与脚本化传输上套件照常通过。
3. 负控：放进第 5 条的变异后，构建 `@omne-harness/mcp`，`pnpm turbo run test --filter=@omne-harness/mcp` 退出非 0，输出里探索器报 `P15`；按字节还原、重建后同一命令退出 0。三次运行的退出码与日志哈希写进交回。
4. 第 1 条的核对结果：逐行（T8 的每一行与 T1 的「之后每个请求」「`close()` 之后」）写一致或不一致。
5. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 退出 0；`lint:deps` 的 `no-unresolvable` 若只来自组外未构建成员，列出不处理。
6. `git diff --name-only 78d850505..HEAD` 只含写范围内的文件。

## 实施规格
- 违约实现只包一层工厂，不改套件本身的比较逻辑。
- 性质检查只读探索轨迹里的外部可见状态（连接状态、清单标记），不读连接表的内部字段，形状同现有性质。
- 成员测试导入 `dist`：改了 `src/` 的负控变异，先构建再跑；还原后再构建一次。
- 用例标题是可读的英文句子，写出条号（T1、T8、S7、P15）。中文文档按 asd-ste100 的语言无关规则，只写现状与依据。

## 性质及证据义务
- 「传输把标记如实交出」由符合性套件承担：本闭包证明套件能拦住漏标与错标（验收第 2 条）。
- 「单个请求失败而传输仍可用时连接不转 `lost`」由 `lostOf` 第 3 条承担：本闭包给出探索器的独立证据与负控（验收第 1、3 条）。
- 差分变异由派发者在最终 head 上跑，不在本闭包。

## 施工计划
1. 读方法入口；读产品写者的提交（`git log 60acfc28b..78d850505`）与 `lost.ts`、`testing-transport.ts` 的推导函数、T1 与 T8 表；做第 1 条核对。
2. 两个违约实现与用例。
3. 探索器：替身值、场景、P15；正控。
4. 负控；TLA+ 的核实（第 6 条）。
5. 记录与两处说明；验收第 1–6 条；交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；三个成员的构建、类型检查、快层与慢层；负控变异（临时改源码、构建、运行、按字节还原）；本地提交。不允许：推送、开 PR、合并、提交对 `src/` 的改动、改写范围外文件、跑 `admission`、仓库全量测试与差分变异。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable，已构建三个 MCP 成员。同时有 MCP 切片 02 的写者在另一棵树上跑门禁，派发者也可能在 Skill 闭包的树上跑差分变异，共用 CPU：单个用例文件用 `VITEST_MAX_WORKERS=4 pnpm exec vitest run <文件>`，整组只在交回前跑一次。HTTP 夹具只用 20000–59999 的端口。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- W4 MCP 规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/spec.md（第 1 节第 1–4、8 条，D-W4M-2）
- 产品写者的闭包规格与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w4-mcp-unusable.md（已定的事与追加 1）
- 契约：`packages/mcp/mcp-contract/SPEC.md` T1、T8（`<a id="t8"></a>` 到 `<a id="t8-end"></a>`）、S5、S7
- 现有违约实现：`packages/mcp/mcp-contract/tests/transport-conformance.spec.ts` 第 197 行起
- 探索器：`packages/mcp/mcp/tests/model/`（`properties.ts`、`scenarios.ts`、`ports.ts`、`explore.ts`）；`packages/mcp/mcp/verification/README.md`「两种证据能变红」
- 必须加载：verification-facility、ub-mode、asd-ste100、pstack:typescript-best-practices

## 当前认知
- 已确认（产品写者交回）：`lostOf(answer: TransportFailure | PeerAnswer): Lost | undefined`，按 `kind` 穷尽；三处调用点（`calls.ts:311`、`tasks.ts:152`、`discovery.ts:106`/`:154`）都只经它判断；`build.ts` 不改，建连中的失败不论带不带标记都让建连失败。
- 已确认：产品写者的探索器替身两个失败值带标记，`tests/model/` 全部 22 条在新形状下通过；没有加新性质。
- 已确认：产品写者把 stdio 的 X02 夹具改成「进程关闭 stdin 但仍然存活」，X02 的原因定为 `stream-broken`。
- 未知：P15 在现有场景的界内能否让「不带标记的失败」与「带标记的失败」在同一场景出现；`Calls.tla` 能否不改抽象表达 P15。

## 返回与恢复
每个提交号；第 1 条的逐行核对表；两个违约实现的名字与断言的失败清单；P15 的定义与场景；正控、负控三次运行的命令、退出码与日志哈希；TLA+ 核实结论；验收各条的输出尾部与日志哈希；未覆盖项。

## 已知会受影响的现有用例
- `transport-conformance.spec.ts` 的「the suite fails a transport that breaks the contract」一组：新增两条，现有两条不改。
- `tests/model/` 的现有场景：新替身值只加不改，现有 22 条应原样通过。

## 停止条件
- 需要改写范围外的文件，或要提交对 `src/` 的改动。
- 第 1 条核对发现推导函数与 T1、T8 不一致。
- 漏标或错标的违约实现没有让套件变红（说明套件在这一行不比较标记），或变红的行与预期不符。
- P15 在正控下报违例。
- 基线 `78d850505` 上的用例在本工作树失败。

## 追加记录

- 2026-11-06 15:00 追加 1（派发者看工作树发现：写者的负控还原后复跑 14:34–14:49 退出 1，`tests/model/lifecycle.spec.ts` 的 `wide` 场景超过 600 s 时限；14:07–14:18 的正控复跑通过。写者此刻把 P15 暂时撤掉在给 `wide` 计时。消息先发出（14:59），本条随后补记，次序与「追加留痕」不符，记为派发者的缺陷）。
  1. 事实：还原后复跑的时段与三次占 CPU 的运行重叠：派发者的差分变异（14:37–14:43，6 个工作进程）、A 面评审的 `lint:deps`（约 14:39–14:41）与 `metrics --coverage`（14:53–14:55）。正控复跑时没有这些负载。CPU 争用与 P15 扩大状态空间都是候选原因。
  2. 在同一台空闲机器上只做一次对照计时：有 P15 与没有 P15 各跑一次 `wide`，然后停。另一棵树 `.worktrees/w4-mcp-cordis` 有修复轮写者用 `VITEST_MAX_WORKERS=4` 跑单个用例文件，负载轻，计时记录里写明。
  3. 结束后用 `git checkout HEAD -- <文件>` 把 P15 还原到已提交的字节，索引也要干净。
  4. P15 本身使 `wide` 接近 600 s 时，停下交回两次计时与建议。不自行调大时限，也不缩小场景。

- 2026-11-06 15:36 派发者对交回的裁定（写者 15:32:49 交回，head `11b5d4ff5`）。
  1. 验收第 3 条判为达到。还原后同一命令的第一次运行（`79cdbe00dc2e`）只有 `wide` 在负载下超时，其余 501 条通过；之后在同一份字节上运行的三成员组运行（`build typecheck test --force`，含同一个 `@omne-harness/mcp#test` 任务）退出 0（`3fb7238ccb0f`）。两者是同一任务、同一份源码，差别只是同时构建的其他成员。
  2. P15 写进成员 SPEC「性质与证据」：由派发者在 `559be1514` 补上（定理一条、调用口证据表一行、负控段一句）。
  3. `Calls.tla` 第 14–16 行的注释先不改：按惯例，模型文件的字节一变就要重跑 29 个配置并更新记录里的 SHA。等模型下次真改时一并改，记为待清理项。
  4. `wide` 单独运行约 360 秒，离 600 秒的时限不远；README 的 158.1 s 没有记 head，不能归因。交给关口 A 面在 F 与 head 上对照状态数。
