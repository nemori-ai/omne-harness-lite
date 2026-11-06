# 工具链｜差分变异把运行器自身的失效记成「没跑测试」「运行错误」，整次测量无效，且沙箱目录挡住同树的 metrics

**接手本卡**

1. 先读当前修订、评论、条件和现存attempt。在本Issue评论声明认卡，写明负责的人、会话/agent实例、权限依据及现存执行核对结果。
2. 已获本卡派发时按该授权接手；尚未派发时向指定调度者请求领取。由授权调度者登记并读回唯一attempt，不能凭Assignee或认卡留言抢占执行。
3. 开工前核对[当前执行与交接](#当前执行与交接)中的分支、基线、写范围和task context。不涉及Git交付时明确不适用，仍须履行认卡和状态更新。
4. 在开工、关键进展、阻塞或范围变化、可审阅候选、暂停/接续和交付时及时交回事实。获授权的正文单写者更新摘要，指定调度者更新Project Stage。已有权限时直接执行并读回，不重复请示。
5. 交付时给出成果、验证和剩余责任，由有权者接受。有效决定读回后完成关闭与看板对账。部分接受不销整卡。

具体规则归[交付操作](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/agent-delivery.md)和[交付协议](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/delivery.md)。

## 身份与责任

- 交付层级：subtask
- 主工作类型：bug
- 交付线：engineering-toolchain
- 性质：impl
- 契约变更：none
- 交付修订：1
- 创建操作标识：test-runner-mutation-20261106-1
- 父交付卡：https://github.com/nemori-ai/omne-harness-lite/issues/979
- 责任范围：`tools/test-runner` 的差分变异（`make mutation` 的运行器）对 Stryker 失效结果的分类与复核，以及 Stryker 沙箱目录的位置。可能涉及 `vitest.tiers.mts` 中的未处理拒绝守卫。
- 卡负责人、主结果接受者及授权依据：PanQiWei。PanQiWei 于 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”。卡 #1119 的执行者在 W3 波末按此登记。该授权只覆盖建卡与登记，不授权实现、派发或接受。
- 受影响语义拥有者：工程工具链（`tools/test-runner`）拥有者 PanQiWei。不涉及产品或契约成员。
- 调度者：未指定，由 PanQiWei 或其委派者派发时指定。
- 正文单写者：首次发布由 Claude Code 会话代 PanQiWei 撰写。后续正文单写者由调度者指定。

判定理由：

- 交付线取 engineering-toolchain。`tools/test-runner` 在线归属表 `docs/engineering/delivery-lines.json` 的该线路径 `tools` 之下。父卡取 #979（M2 L-ENG，同线，与 #1136 的父卡相同）。
- 主工作类型取 bug。预期依据是 `tools/test-runner` 已有的承诺：运行器要把“没跑测试”与“超时未复核”区分出来，使测量只在有效时给分（`tools/test-runner/src/mutation/report.ts` 第 125 行注释与 #405）。实测现象是运行器自己的失效让整次测量无效。
- 性质取 impl，契约变更取 none。工具链线没有契约成员。

## 目标与范围

差分变异在 W3 三个 MCP 成员的评审关口上多次得不到有效分数。无效的原因不是用例没测出变异，而是运行器或 Stryker 自身的失效被记成“没跑测试”“运行错误”或“超时未复核”。本卡让这几类失效不再使整次测量无效，或者至少让它们有可核对的单独读数。

- 本次结果：下面 C1 至 C5 描述的五类场景，在运行器上得到有效读数或明确的单列读数。
- 与父卡的关系：本卡是 #979 下的一个独立工具缺陷修复。父卡和其他子项的范围不变。
- 包含：
  - 把“每个用例都挂住”“构造时抛出”这类使整个成员失效的变异体，判为被杀或单列，不使整次测量无效。
  - 处理 Stryker 的 vitest runner 在 `errorToString` 上崩溃的运行错误。
  - 让第一遍有“没跑测试”或“运行错误”时，不再因此跳过“超时未复核”的复核，或明确说明为何仍跳过。
  - 把 Stryker 沙箱目录放到 `packages/` 之外，或让同树的依赖与度量命令排除它。
- 不含：
  - 改 Stryker 或 `@stryker-mutator/vitest-runner` 的上游代码。可以在运行器一侧绕开或分类。
  - 改变差分变异的范围选择、增量机制或评分公式。
  - 改变 `recheckMaxMutants` 的默认值 8。
  - 修各成员自己的变异测试缺口。
  - 撤除成员侧 `setupFiles`。若本卡把未处理拒绝的守卫移到 `vitest.tiers.mts`，`mcp-host-local` 与 `mcp-contract` 的 `vitest.config.ts` 里的 `setupFiles` 随后要删。那两个文件在 tool-exec 线的路径内，本卡写不了，由 tool-exec 线另立卡承担，本卡交回时点名。
- 类型补充（bug）：
  - 预期依据：见“身份与责任”的判定理由。
  - 实测现象：见 I-01 至 I-05 和各判据。
  - 影响：W3 的 `w3-mcp-call`、`w3-mcp-host`、`w3-mcp-lifecycle` 的差分变异都没有可用分数，靠评审者手工复现和逐个复核补读数。成员侧已加规避，见 I-03，但长期归属在运行器。
  - 推断，未经验证：C1 的“挂住”与 C3 的“构造时抛出”可能是同一类机理，即变异体让每个用例在 Stryker 记账之前失败。两者的直接复现读数不同（见 C1、C3），所以没有合并。

## 依据与实施输入

- 现行依据或获准问题：I-01 至 I-06。本卡不沿用父卡的全部范围。

| 输入ID | 唯一源或获准问题 | 精确修订/提交及采用状态 | 本次适用条款或范围 |
| --- | --- | --- | --- |
| I-01 | `tools/test-runner/src/mutation/report.ts` 第 125 至 126 行、第 379 至 382 行、第 672 至 674 行 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | `notRun`：“报成存活、有用例覆盖、却一条用例都没跑完：运行器没跑测试，不是测试没测出来（#405）”。`classify` 对 `ranNoTests` 的变异体直接返回 `invalid`。错误消息：“N 个变异体有用例覆盖、却一条用例都没跑完，Stryker 报成了存活。判为运行出错” |
| I-02 | `tools/test-runner/src/mutation/member.ts` 第 197 至 201 行 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | 注释“只因时限到了而超时的，在上限内单独复核一遍。第一遍已无效（RuntimeError、没跑测试）时不再花这份时间”。条件 `first.runtimeErrors === 0 && first.invalid.every(isUnchecked)` 才复核。`test-runs.config.json` 第 206 行 `recheckMaxMutants: 8` |
| I-03 | 成员侧规避：`packages/mcp/mcp-host-local/vitest.config.ts`、`packages/mcp/mcp-contract/vitest.config.ts` 的 `setupFiles: ['./tests/unhandled.ts']` | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用。加入提交 `c8a78f888`（host-local）与 `dc0ecb927`（contract） | 让未处理拒绝和未捕获异常在每个用例文件里变成用例失败。长期归属在 `vitest.tiers.mts` 或 test-runner，尚未决定 |
| I-04 | `tools/test-runner/src/mutation/stryker.ts` 第 41 至 48 行与第 100 行 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | `sandboxContainer` 把容器放在成员的上两级，副本与成员同深度。注释写明这样放的原因。`tempDirName` 取此值。实测路径形如 `packages/.stryker-tmp-packages__mcp__mcp-164346/sandbox-*/package.json` |
| I-05 | 评审与交回记录，W3 各关口 | 任务过程材料，观察记录，不是规范 | 关键读数见下表和各判据。原件在 #1119 W3 波的本机任务 tmp，接手者可能读不到，所以读数已抄进本卡 |
| I-06 | 卡 #1119 评论 [6657605963](https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6657605963) | 任务过程材料，观察记录，不是规范 | `w3-mcp-lifecycle` 第 3 次提交交回。写“没跑测试 `table.ts:467`（工厂返回 `{}`）：本会话把这个变异直接放进源码跑快层，vitest 报 176 条失败、退出 1、没有挂起。用例杀得死它，‘没跑测试’是变异运行器的报告缺陷” |

I-05 的关键读数：

| 来源 | 范围与时点 | 读数 |
| --- | --- | --- |
| `w3-mcp-call` 第 4 轮 D 面 | 提交 `2b895ea2a`，2026-11-06 07:54 至 08:01 UTC，`mutation --base b2ba7dc89 --since 5204d3799` | `mcp`：变异体 338，被杀 304，存活 30，没跑测试 4，分数不给。4 个是 `calls.ts:132`（`{ ...send.request, args }` 换成 `{}`）、`internal/caller-values.ts:7`（块换成 `{}`）、`tasks.ts:141`（`answered.kind === 'answered'` 换成 `false`）、`tasks.ts:209`（`'failure' in answer` 换成 `true`）。评审者写“`calls.ts:132` 把请求换成 `{}`，每条调用口用例都挂住，实际是被杀” |
| `w3-mcp-host` 第 4 轮 D 面 | 提交 `ebfedc98a`，账本 `tmp/mutation-ledger/ebfedc98a/20261106-080628` | `mcp-contract`：353 个变异体，没跑测试 2（`connection.ts:37`、`discovery.ts:65`），超时未复核 54。`mcp-host-local`：138 个，超时未复核 7，超出复核上限 8。均测量无效 |
| `w3-mcp-host` 第 3 轮 D 面 | 提交 `720a5d08a`，账本 `tmp/mutation-ledger/720a5d08a/20261106-022559/`（相对仓库根，仅本机） | `mcp-contract`：1675 个变异体，运行错误 1，没跑测试 27，超时未复核 50。`mcp-host-local`：1205 个，没跑测试 1，超时未复核 83。均无效 |
| `w3-mcp-call` 第 2 轮 D 面 | 见 `reviews/mcp-call-r2.md` | 2 个 RuntimeError（`calls.ts:216`、`calls.ts:252`），原因是 Stryker 的 vitest runner 在 `errorToString` 里抛 `TypeError: Cannot convert object to primitive value`。另有 5 个“有覆盖却没跑完”（含 `calls.ts:105`、`:229`、`:281`、`:303`）。测量无效 |
| `w3-mcp-host` 第 1 轮 D 面 | 见 `reviews/mcp-host-r1.md` | `mcp-host-local` 2 个运行错误（`session.ts:355`、`stdio-line.ts:59`），契约 3 个没跑测试（`readers.ts:144`、`:200`、`wire.ts:263`，评审者推测可能是抖动）。均无效 |
| `w3-mcp-lifecycle` 第 3 次提交 | 提交 `0418cd72b`，账本 `tmp/mutation-ledger/0418cd72b/20261105-115135` | 75 个变异体，没跑测试 1（`table.ts:467`），超时未复核 3，运行错误 `table.ts:350`（“Stryker 格式化错误对象时自己崩了”）。无效 |
| `w3-mcp-call` 第 4 轮 A 面 | 07:54 UTC | `pnpm run metrics --coverage --base b2ba7dc89` 退出 2。原因：D 面变异的沙箱 `packages/.stryker-tmp-packages__mcp__mcp-164346/sandbox-*/package.json` 与 `@omne-harness/mcp` 同名，turbo 报“Failed to add workspace…already exists”。等 D 面结束、沙箱清掉后重跑，08:32 UTC 退出 0。同一阶段 `pnpm run lint:deps` 退出 0，没有受影响 |

- 实施输入与约束：
  - 分类只能依据 Stryker 报告与运行器自己能观察的事实。判为“被杀”须有可复核的依据，例如变异体对应的直接运行结果。不能因为想要分数就把无法判定的变异体计为被杀。
  - 分数公式、评分入口和失败退出码语义保持。变化须在 `tools/test-runner` 的 README 与 SPEC 中写明。
  - 本卡不假定唯一修法。实施者先在 C1 至 C3 的最小复现上确认机理，再选择。机理确认前不改分类规则。
- 受影响消费者：`make mutation` 与差分变异的所有调用者，`review-code` 技能的固定变异步骤，`pnpm run metrics` 与 `pnpm run lint:deps`（同树并行时）。
- 持续成果落点：`tools/test-runner/src/mutation/` 源码、`tools/test-runner/README.md`、`README_ZH.md`、相关 spec（现有 `tests/mutation-stryker-*.spec.ts` 与 `tests/mutation-guard.spec.ts` 等）。必要时 `vitest.tiers.mts`。以上路径都在 `engineering-toolchain` 线的路径内。
- 可恢复输入：I-01 至 I-04 在仓库中可读。I-06 在 GitHub 上可读。I-05 的原件只在本机任务 tmp，关键读数已写进上表。最小复现需要实施者在新分支上重建，见各判据。

## 验收与测试

| 判据ID | 依据ID | 成功及禁止结果 | 验证方法与所需证据 |
| --- | --- | --- | --- |
| C1 | I-01、I-05、I-06 | 变异使每个用例挂住或整体失效时，例如 `table.ts:467` 与 `calls.ts:132` 那类“工厂或请求换成 `{}`”，运行器不把它记成“没跑测试”并使整次测量无效。该变异体判为被杀，或单列且不阻止其余变异体计分。禁止：把无法判定的变异体静默计为被杀。 | 新增用例：夹具里一个让所有用例失败的变异体，期望的分类与分数。修复前该用例失败。再对 `w3-mcp-call` 的 `calls.ts:132` 变异做一次复现，写明直接运行的结果。本卡不预设该变异体直接运行的结局（超时或失败），以实施者复现的结果为准。已有的直接运行读数只有 I-06 的 `table.ts:467`：176 条失败、退出 1、没有挂起 |
| C2 | I-05 | Stryker 的 vitest runner 在 `errorToString` 里对序列化后没有原型的错误对象调用 `String()` 而抛 `TypeError: Cannot convert object to primitive value`，该变异体不再记为运行错误并使整次测量无效。 | 夹具里一个让用例以无原型对象失败的变异体。期望得到可核对的分类。需要记录机理证据，例如崩溃处的调用栈。见 I-05 `call` 第 2 轮与 `host` 第 1、3 轮 |
| C3 | I-05 | 变异体在模块加载或构造时抛出，例如 `mcp-host-local` 的 `options.ts:17`（`version === ''` 换成 `version !== ''`），每个构造工厂的用例都抛 `RangeError`。运行器不再把它记成“存活、10 条覆盖、0 条跑完”。判为被杀或单列。 | `options.ts:17` 是最小复现。评审者手工复现读数：快层 7 项用例失败，错误是 `RangeError: clientInfo.version must be a non-empty text`。新增夹具用例覆盖“构造时抛出” |
| C4 | I-02、I-05 | 第一遍存在“没跑测试”或“运行错误”时，仍对“超时未复核”给出可计分的读数，或者报告明确列出为何没有复核及剩余数量。读数里的“超时未复核”不再把整批不能计分当作静默结果。 | 现状：`member.ts` 第 197 至 201 行在第一遍无效时跳过复核，所以三次关口的 54、50、83 个超时全部无法计分。新增用例：第一遍含 `notRun` 与超时时的复核行为。`recheckMaxMutants` 默认 8 不变 |
| C5 | I-04、I-05 | 变异运行期间，同一棵树上的 `pnpm run metrics` 与 `pnpm run lint:deps` 不因沙箱目录而失败。沙箱放在 `packages/` 之外，或这两个命令排除 `.stryker-tmp-*`。沙箱副本仍与成员同深度，成员的相对引用不受影响，或者保持深度的理由被另一个机制取代。 | 夹具：一个变异在跑，同时在同一检出上跑 `metrics`，期望不报 turbo 重名。保持深度的约束在 `stryker.ts` 第 41 至 48 行的注释中，须先核对 |

| 测试/验证拥有者 | 类型 | 大致覆盖 | 真实依赖或替身及不覆盖 | 执行入口/所需环境 |
| --- | --- | --- | --- | --- |
| tools/test-runner | 单元与契约 | 报告分类（`classify`）、复核条件、沙箱路径的纯逻辑 | 用 Stryker 报告 JSON 夹具作替身。不覆盖真实 Stryker 的运行 | `tools/test-runner/tests/mutation-*.spec.ts` 及该包的测试命令 |
| tools/test-runner | 集成 | C1 至 C3 的最小夹具成员在真实 Stryker 下的分类，C5 的同树并行 | 真实 Stryker 与 vitest。夹具成员要小，避免长运行 | 实施者在 spec 中放小型夹具并写明命令。运行占用机器名额。名额规则以 `docs/engineering` 与 `tools/test-runner` 的现行说明为准，本卡未核对具体条款 |

- 独立复核与接受：按风险做一次代码评审（`review-code`）和一次交付边界核对（`review-delivery`）。差分变异只打本卡改动的热点。接受者是 PanQiWei 或其按授权委派者。
- 未覆盖或环境缺口：真实 Stryker 的 `errorToString` 机理在本卡建立时只有评审者的观察。W3 契约成员的 27 个“没跑测试”只复现了 2 个，其余是推测，没有逐个核对（`mcp-host-r3.md`）。运行需要独占的机器名额。

## 交付条件

无

## 当前执行与交接

### 认领与派发

- 认卡声明：未认领
- 派发情况：未派发
- 执行实例：未指定
- 工作树：未创建

### 分支、基线与task context

未登记binding。计划路线：交付线 `engineering-toolchain` 的线轨道 `m2-toolchain`，最终终点由调度者派发时确定。待定输入：调度者、正文单写者、执行者、派发时的 taskBase。

| 开工读回项 | 实际值/回执 |
| --- | --- |
| 本次直接合入分支全名 | 未派发 |
| 实际开工HEAD | 未派发 |
| 本次读回的目标HEAD | 未派发 |
| task context路径与核验 | 未生成 |

### 当前进展

- 最近更新：2026-11-06，尚未开工。
- 已完成事实与保存位置：事实已在本卡核对。引用的代码行取自父分支 `PanQiWei/skill-mcp` 的提交 `70615269032b96255dbde69dc679dc4637b90248`。
- 阻塞与范围变化：无。
- 下一步及责任：调度者决定何时派发，并指定调度者与正文单写者。
- Project对账：待发布后加入 Project 4，Stage 为 Backlog。Wave 与日期字段由 dev-flow 在开工时写入。

### 成果交回

- 固定成果：未交付
- 判据与证据：未交付
- 集成观察：不适用，尚未交付
- 请求接受及剩余责任：未交付

## 决定与剩余责任

- 有效决定：本卡只有一项决定，即 PanQiWei 于 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”。尚无实现、派发或接受的决定。
- 剩余责任：全部实现与验收，由派发后的执行者和调度者承担。
- 收尾对账：未接受，保持活动。

本子任务接受不自动接受父交付卡。父子关系不自动成为阻塞条件。
