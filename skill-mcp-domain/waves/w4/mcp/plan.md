# #1119 交付计划：MCP 线（revision 1，attempt `W4（波段）`）

本文件按 claim 模板与 Matt to-spec／to-tickets 写成。格式取 `.meta_harness/agents/skills/claim/canonical/references/plan-template.md`。切法取 Matt `to-tickets`，固定源 `skills-b0618bc436ad`，按已安装路径直接读正文，不经宿主触发：每个切片是一条完整的纵向路径，写阻塞边。项目差异按 `docs/engineering/skills.md`「三层分工」与「项目差异与负责边界」：切分由 reduce 自定，不请人批准；本计划写成员、文件与验收命令；首版前不做 expand–contract，消费者同波迁移。本卡没有线父卡、binding 与 gate，用波段代替 attempt（[范式 §3](../../operating-model.md#3-变通)）。规格见 [spec.md](spec.md)。

## 进度总览

进度：[■■■■■■■■■■] 3/3 切片完成，W4 已收波 · 更新 2026-11-06 21:39 UTC · 父分支 head 41d7b6529（已推送）
当前（21:39）：波末读数在 `7e2e9e2df` 上 admission、acceptance、`metrics --coverage` 都退出 0；`41d7b6529`（文档对齐与 MC-10 已知限制）上 acceptance 与 `loop:status --strict` 退出 0。W4 报告 #1119 6696174914，D-01 请求 6696179052，D-02 请求 6696183666，卡正文已更新并读回。进展页与实现架构页已在本地重新生成，重发布要 claude.ai 登录，本会话没有，待登录后发布。记录分支已推送。等负责人做 D-01、D-02。
20:25 时：#1156 已关卡（20:21，评论 #1156 6694600826）。r2 窄复核发现夹具作第二写入方的同根问题，改结构：对端只留一个写入方、对端回报读过字节数（`8f49cdafe`、`7e2e9e2df`），r3 复核六条闭合，负载对照 20/20。03 写回经两轮复核闭合（`b310a9891`、`b1f827095`、`09d5b389b`）。波末 admission、acceptance、`loop:status --strict --base F`、`metrics --coverage` 在 `7e2e9e2df` 上依次后台运行（`tmp/closures/w4-wave-end/final/`）。待做：Skill 组工程设计 :590「暂不进应用插件树」同类表达（等准入跑完再改）；W4 报告、D-01、D-02 请求（草稿在 `tmp/closures/w4-wave-end/`）；卡正文、进展页、records-sync、清理。
19:5x 时：#1156 修复 `2957c076c`（屏障与环境变量；红 10/10、绿 10/10，成员 485 通过，四项门禁 0），窄复核进行中。03 写回 `b310a9891` 经 review-docs（阻断 3）在 `b1f827095` 处置，记录 `reviews/mcp-writeback-r1.md`，窄复核进行中。波末 admission、acceptance、`loop:status --strict --base 60acfc28b` 在 `b1f827095` 上后台运行（`tmp/closures/w4-wave-end/`）；跑完后在同一头重跑 `metrics --coverage`（Skill 两成员 dist 已重建）。
19:26 时：#1156 实施在 `fc4f3e0f2`（已推送，证据评论 #1156 6693213394）；交付边界评审 C1–C4 达到，冲突项 2（背压时同步行越过 web 流队列）与 4（延迟变量从外部环境继承）成立，修复在工作树里，等波末度量跑完再跑用例，记录 `reviews/card-1156-r1.md`。切片 03 写回提交 `b310a9891`（五份文件），`check:docs` 通过，`review-docs` 评审进行中。波末度量（`--coverage`，基线 `60acfc28b`）在 `fc4f3e0f2` 上跑，`skill-host-local` 与 `skill-cordis-contract` 的覆盖率运行退出 1，待查。
此前：切片 01（PR #1159）18:40 合入父分支 `b7005bdc2`，关口结果评论 #1119 6692490293。切片 02（PR #1158）在其后合入 `8078ad6ec`，`mcp-host-local/SPEC.md` 自动合并无冲突；合并结果上六项门禁与三成员快层通过（契约 690、`mcp-host-local` 482、插件契约 12），`mcp-host-local` 慢层 266 条通过（8 跳过）；合入记录 #1119 6692710725。台账补了 W4 MCP 16 行（`ledger.py check` 通过）。下一步：切片 03（组页与领域页写回）、#1156、波末读数与准入。切片 02（PR #1158）关口已收口（`8f0a7c54f`，评论 #1119 6690327367），等 01 先合入。Skill 线 W4 已完成。

- 02 关口结果（汇总与裁定 `reviews/mcp-cordis-r1.md`，四面原文 `mcp-cordis-r1-{A,B,C,E}.md`）：
  - A 正确性：无阻断，非阻断 3。探针证实撤除时 `dispose()` 等 `closeAll` 结算、`AggregateError` 进日志；`metrics` 改动函数超 warn 1 个（`validate` 圈复杂度 11）。
  - B 表达：阻断 1 簇（B1：`mcp-host-local` 的 SPEC、README、`docs/object-model.md`、`docs/architecture.md` 与新入口矛盾或缺新入口，写范围不够），非阻断 7。
  - C 设计与实践：非阻断 7（C-1 撤除时丢掉进程未确认停止的报告；配置 Schema 的原型判据、按位置解构、类型手抄；定义成员只装两个类）。
  - D 差分变异（派发者）：定义成员 7/7；`mcp-host-local` 0/161，测量无效：用例整份在慢层，差分变异只跑快层。
  - E 交付边界：未达到 5 项，都是证据或用例缺口；冲突项 5 条已裁。
  - 裁定：写范围扩大，`mcp-host-local/SPEC.md` 加「Cordis 插件」一节作插件行为的唯一规范正文；撤除不加期限，只披露；采纳 C-1～C-7；用例拆快层与慢层；变红验证重做并留运行输出。W4 MCP 规格第 118、131 行两处全称句已更正（14:50）。
  - 14:59 派修复轮写者（developer，Opus 5.5 high，新开），规格 `delegate/closures/w4-mcp-cordis.md` 追加 2（简报检查退出 0）。修完后：B 面窄复核、`scan` 复跑、最终 head 重跑差分变异、关口结果评论。
- 02 关口（派发时）：写者 14:33 交回 `cd7d6a5f1`（27 条装配用例连跑三次全过；与验收原文两处差异派发者认可：探针断言 `AggregateError` 装着的错误、落点缺席 H4 等价）。派发者改 `mcp-cordis-contract/package.json` 的草稿 `description`（`f5ead35f4`；Skill 同类成员的在父分支 `fbe2008f0`），在 head 上复跑 typecheck、lint:rules、lint:oxlint、lint:deps 全部退出 0。14:35 开 PR #1158，证据评论 #1119 6687353835。14:36 派 A、B、C、E 四面（简报 `reviews/mcp-cordis-r1-briefs.md`），D 等 CPU 空出后自跑。合入仍在切片 01 之后。
- 01 守护写者：14:06 已提交违约实现（`22841d0f9`）与 P15（`06773cbcb`），14:36 在改两处说明与 `verification/README.md`、跑测试。

- 01 产品写者：13:49 交回，head `78d850505`。七条验收里第 1–5、7 条通过，第 6 条只有 `lint:deps` 因组外未构建成员报 8 条（与本闭包无关）。全函数 `lostOf`、三处调用点、写者自定四件与契约改动整理在 `reviews/mcp-unusable-handback.md`。派发者认可写者自定第 1 件（就绪连接上 `discover` 的错误答复转 `degraded`，符合全函数第 3 条）。
- 01 守护写者：13:52 派出（developer verification，Opus 5.5 high），规格 `delegate/closures/w4-mcp-unusable-guard.md`（简报检查退出 0）：独立核对推导函数、漏标与错标两个违约实现、探索器性质 P15 与负控、两处过时说明。14:06 已有提交 `06773cbcb`。守护写者交回后开 PR，按 `reviews/mcp-unusable-r1-briefs.md` 做关口。
- 02 写者：13:18 派出，基线 `8446c4588`。
  - 进展：13:29 提交 `9fd44721e`（七个抽象 Service 与键常量）；13:31 提交 `d0714b7a5`（`createMcpPlugin` 与 `./cordis`），同时合入共享写（`065d0acc0`）；13:34 提交 `63613ac30`（改用 `definePlugin`，用例覆盖每个服务方法）；13:40 提交 `44c8a6dd5`（两个成员的规格与文档）；13:48 提交 `cd7d6a5f1`（端口缺席用例补上端口后再刷新）。14:11 在跑交回前门禁。
  - 13:30 追加 1：Skill 关口评审暴露的问题提前同步给 02，共五条：插件经 `definePlugin`（IC-14）；每个转发方法都要有能区分它的用例；配置的接受与拒绝两半都要有用例；采用端口换代用例；类型位置不写键名字面量。
- 02 不再等 01 合入：两者在 `mcp-host-local` 只在 `SPEC.md` 重叠，已把它移出 02 的写范围（`./cordis` 一行由派发者在两者合入后补），合入顺序 01 → 02。派发前派发者查实两项（Cordis 卸载 `await` 撤除函数并把拒绝写日志；脚本化对端有 `silent` 答复），写进规格。小卡 #1155 已做完关卡（`f31894d95`、`8446c4588`，父分支已推送到 `8446c4588`；评审 `reviews/card-1155-r1.md`；#1155 评论 6685117741，Project 置 Accepted），切片 03 不再含它。共享写已提交并推送（`60acfc28b`，两个 Cordis 草稿成员与依赖；门禁、preflight 读数在 `tmp/closures/w4-shared/`）。闭包规格简报检查退出 0，按顾问提示补了 X02、S07 两条断言与表里同名 `unusable` 标志的说明。

| 切片 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- |
| 01 | HTTP 上单个请求失败之后连接仍可用；传输不再可用时连接转 `lost`。偏离表删空 | W4-1 验收四条（M4-1、M4-2、M4-3、M4-5） | 已合入 `b7005bdc2`（PR #1159，关口结果 #1119 6692490293） |
| 02 | 宿主在真实 Cordis `Context` 上装 MCP 插件，消费者按键取服务走「刷新 → 调用」，撤除经 `closeAll` 收口 | C5 第 1–4 条的 MCP 部分（M4-4、M4-5） | 已合入 `8078ad6ec`（PR #1158，关口结果 #1119 6690327367） |
| 03 | MCP 组页与领域页按实际成员写回；波末读数、交接报告与 D-01、D-02 的请求 | C5 第 5 条的 MCP 部分；C6；W4-4（M4-6、M4-7） | 待做 |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `w4-mcp-unusable` | Opus 5.5@high | 定 | `.worktrees/w4-mcp-unusable` | `PanQiWei/skill-mcp-w4-mcp-unusable` | 已交回（12:36 派出，基线 F `60acfc28b`；12:48 按停止条件停在 `71a0fe978`，12:50 裁定后续用原写者；13:49 交回 `78d850505`） | 1 | 1 | `reviews/mcp-unusable-handback.md` |
| `w4-mcp-unusable`（守护） | Opus 5.5@high | 界 | 同上，产品写者交回之后 | 同上 | 已交回（13:52 派出，基线 `78d850505`；14:06 头 `06773cbcb`；15:00 追加 1（`wide` 超时与 CPU 负载）；15:32 交回 `11b5d4ff5`；派发者 `559be1514` 补 P15 进成员 SPEC；PR #1159） | 1 | 1 | `reviews/mcp-unusable-r1.md`（在评） |
| `w4-mcp-unusable-fix` | Opus 5.5@high | 定 | `.worktrees/w4-mcp-unusable` | `PanQiWei/skill-mcp-w4-mcp-unusable` | 已合回 `b7005bdc2`（16:26 派出，基线 `559be1514`；16:38 追加 1，裁定 (b)；17:47 交回 `0961b30e9`；派发者 `4209b33a7`、`b29f5f70e`、`77b3c07e4`） | 1 | 1 | `reviews/mcp-unusable-r1.md` |
| `w4-mcp-cordis` | Opus 5.5@high | 定 | `.worktrees/w4-mcp-cordis` | `PanQiWei/skill-mcp-w4-mcp-cordis` | 修复轮（13:18 派出，基线 `8446c4588`；13:30 追加 1；13:31 合入共享写 `9a1089645`；14:33 交回 `cd7d6a5f1`；派发者 `f5ead35f4`；PR #1158；14:56 追加 2，14:59 派修复写者） | 2 | 2 | `reviews/mcp-cordis-r1.md`（四面原文 `mcp-cordis-r1-{A,B,C,E}.md`） |

## 角色与模型分配

本会话宿主：Claude Code，版本 2.1.318。本会话是 reduce，兼 Skill 线与 MCP 线的负责人（[范式 §1](../../operating-model.md#1-前提)）。

派发做法按 `delegate`「选模型」。规则与钉值归 `.meta_harness/agents/roles/README.md`「模型配置与本次派发」与 `dispatch-policy.json`（策略版本 947.1）。派发时用 `render_pair.py --resolve claude_code --policy-version 947.1` 按表中的 work 与 risk 解析一次，把解析结果与实际派发值都写进闭包规格。

写者档位按负责人的分档规则定，它优先于策略解析（负责人 2026-10-21、2026-10-30 定）：
- Fable 只用到 high，不用 xhigh。Fable 写者只做重性能与算法实现，以及两轮不过之后的结构诊断。
- 跨多个模块的实现用 Opus 5.5 high。
- 方案与规格写定的单成员开发、转写与修复轮用 Sonnet 5.5 high。
- 新契约形状与新设计不派写者，由本会话先写进 spec。

2026-11-06 解析值是 01 产品 Fable xhigh、01 守护 Fable xhigh、02 Fable high。下表按上面的规则改为实际派发值。命令：

```sh
uv run --locked python .meta_harness/agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source .meta_harness/agents/roles/developer --resolve claude_code \
  --policy-version 947.1 --work-kind <work> --risk <risk> [--risk <risk>]
```

| 切片或环节 | 工作性质与复杂度 | 清晰度 | 角色与 implementation_kind | 模型与 effort | 理由 |
| --- | --- | --- | --- | --- | --- |
| 调度 | 规格、计划、简报、裁定、读 diff、共享写、合入 | — | 本会话 | 当前会话模型（Opus 5.5） | 需要全局上下文。共享文件只由 reduce 写（范式 §2 第 2 条） |
| 上下文补差 | 读多写少 | — | Explore 子代理 | Haiku，见 `delegate`「选模型」 | 只补 W3 合入后与[上下文包](../context-pack.md)的差额 |
| 01 产品 | 跨三个成员改连接生命周期的判断条件：work `capability`，risk `multi-package`、`cross-module-lifecycle` | 定 | developer，product | Opus 5.5，high | 跨三个成员的实现。新形状（可选字段 `unusable`）与转 `lost` 的条件已写进 spec，写者不做设计，也不是重算法 |
| 01 守护 | 探索器加性质与变异：work `verification`，risk `cross-module-lifecycle` | 界 | developer，verification | Opus 5.5，high | 在已有探索器上加一条性质与负控，接缝由规格给出（D-W4M-2）。跨连接生命周期，不降到 Sonnet |
| 02 | 新成员加提供者插件，有撤除的生命周期：work `provider`，risk `multi-package` | 定 | developer，product | Opus 5.5，high | 写两个成员（新的 `mcp-cordis-contract` 与 `mcp-host-local`）。撤除次序由决定 4 定死，但撤除与在途调用、端口缺席要在真实 `Context` 上做对，按跨模块实现派 |
| 03 | 组页、领域页写回与波末 | — | 本会话 | 当前会话模型 | 组页与领域页是共享文件，只由 reduce 写 |
| 评审 | C-SM-08 的一次关口：A 正确性、B 表达、C 设计与实践、D 差分变异、E 交付边界 | — | A implementation-reviewer；B design-reviewer（表达）；C、D 按 `review-code`；E 按 `review-delivery` 的只读子代理 | A、C、E：Opus 5.5 high（方案 §4.2 评审默认 Opus，A 用 `model` 参数覆盖角色钉值 Fable 5.1）。B：Opus 5.5 xhigh（`--resolve` 的 expression 下限）。D：reduce 自跑 | 方案 §4.1、§4.2 |
| 独立验收（按风险） | 不派 | — | — | — | L2。判据由用例与命令读数核对，E 面按 spec.md 判据核对（范式 §3 把 `review-delivery` 改为按本波 spec 核对） |
| 修复轮 | 评审阻断 | — | developer | 同原切片的模型与档位 | 关口之后至多一轮修复，复审只核阻断（C-SM-08）。同一类阻断第二次出现，做结构诊断（方案 §4.1 第 4 条），不开补洞轮 |

并发上限：同时最多两个写者（方案 §4.2）。见「顺序与并行」。

## 切片

### 01：单个请求失败不拆连接

- **交付：** 调用方在 HTTP 服务端偶发一次 5xx 或一个流断开之后，仍能调用同一端点的其他动作，不用等下一次 `refresh`。stdio 进程退出之后，下一次调用答「没有发出」，连接转 `lost`，清单被标记。成员 SPEC 不再有比契约宽的偏离。
- **被谁阻塞：** W4-0 开波同步、reduce 共享写与冻结 F（[方案](../plan.md) §4.4 W4-0；本页「顺序与并行」）。之后无，可立即开始。
- **对应判据：** W4-1 验收第 1–4 条（M4-1、M4-2、M4-3、M4-5）。
- **成员与文件：**
  - `packages/mcp/mcp-contract/`：答复类型的可选字段 `unusable` 与 `UnusableCause` 去掉 `abandoned`（`src/` 下的传输端口类型与决策层）；`SPEC.md` 的 T 段、S5 两句、S5「失败」一句按全函数改写、建连中 `discover` 的一句、R1、S2 的冲突句、R7 的定义；脚本化传输填标记（`src/testing-scripted-transport.ts`）；契约自己的用例（`tests/`）随形状更新（spec 第 1–7 条）。
  - `packages/mcp/mcp-host-local/`：`src/` 两种传输把决策层的 `unusable` 填进答复；`tests/`（含 `tests/fixtures/`、`tests/model/`）里断言答复精确形状的用例随之更新；`SPEC.md` 与 `verification/` 写到答复形状的地方同步。
  - `packages/mcp/mcp/`：`src/internal/lost.ts` 用 spec 第 4 条的全函数取代按原因的三个映射；`src/calls.ts`、`src/tasks.ts`、`src/discovery.ts` 改用它；`tests/` 相应用例；`SPEC.md` 偏离表三行删除，MC-16、MC-17 的步骤随之改；`verification/README.md` 的变异表更新（spec 第 4–6 条）。`src/internal/build.ts` 不改（spec 第 4 条末段）。
  - 守护（另一个写者，产品写者交回之后）：契约符合性套件的「标记」条款与漏标、错标两个违约实现（`mcp-contract/src/testing-transport*.ts` 及其用例）；`packages/mcp/mcp/tests/model/` 的性质、场景与探索器；`verification/README.md`「两种证据能变红」加一行（spec 第 3、8 条，D-W4M-2）。符合性条款与违约实现不由产品写者写，使它们成为对传输实现的独立证据。
- **验收：**
  - [x] M4-1：读回 `packages/mcp/mcp/SPEC.md`「与已定事项和契约的偏离」整节（`awk '/^### 与已定事项和契约的偏离/{f=1;print;next} f&&/^##/{exit} f' packages/mcp/mcp/SPEC.md`），表格没有数据行，或整节改为一句「没有偏离」。另 `grep -c '比契约 S7 宽\|波末小卡 K7' packages/mcp/mcp/SPEC.md` 输出 `0`。两条输出贴卡。
  - [x] M4-2：`grep -nE 'export function (lostOfNotSent|lostOfNoAnswer|lostOfOutcome)' packages/mcp/mcp/src/internal/lost.ts` 无输出；`grep -nE 'lostOfNotSent|lostOfNoAnswer|lostOfOutcome' packages/mcp/mcp/src/calls.ts packages/mcp/mcp/src/tasks.ts packages/mcp/mcp/src/discovery.ts` 无输出。`git grep -n -E 'loseOn\(|loseInScope\(' -- packages/mcp/mcp/src ':!packages/mcp/mcp/src/internal/lost.ts'` 列出每个调用点，评审 A 面逐一读回调用点之前的判断，确认取自 spec 第 4 条的全函数（人工判读，记录调用点清单）。`internal/build.ts` 的同名私有函数不在本判据内。输出贴卡。
  - [x] M4-3：正控：`pnpm turbo run test --filter=@omne-harness/mcp` 退出 0，探索器的新性质无违例。负控：按 `verification/README.md` 把「不带标记也转 `lost`」放进源码，`pnpm turbo run build --filter=@omne-harness/mcp` 后同一命令退出非 0，探索器报新性质违例。按字节还原后重建，再跑一次退出 0。三次的退出码与日志哈希贴卡。若加了 TLA+ 配置，另跑 `TLA2TOOLS_JAR=/opt/tlaplus/tla2tools.jar node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py <正控> <负控>` 退出 0。
  - [x] M4-5：`pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --filter=@omne-harness/mcp-host-local` 退出 0；同一组 `--filter` 的 `pnpm turbo run test:slow` 退出 0。
  - [x] 七项轻门禁退出 0：`pnpm run typecheck`、`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`，加上一条成员门禁。
  - [x] 契约用例（守护写者）：符合性套件对漏标、错标的违约实现各变红一条，对两种传输与脚本化传输都通过。
  - [x] `mcp` 用例（产品写者）：调用、任务、`refresh` 的页请求各有「带标记转 `lost`、不带不转」的用例，建连中的 `discover` 带不带标记建连都失败（2026-11-06 15:51 更正：原写「页请求与 `discover`」，就绪连接上没有 `discover`，见 spec 第 1 节第 4 条的更正）；全函数第 2 条（`authorization-required`）一例；HTTP 5xx 与流断开各一例；`refresh` 上不带标记的 `not-sent` 答 `kept`（`page-failed`）与 `degraded`。
- **七步待办：**
  - [x] （11:25 本会话直接补：目标已知，几次 grep 即可，按 `delegate`「何时不派」不派）1. 纯读的便宜模型（见 `delegate`「4 选模型」）补本切片上下文，只补差额：W3 合入后 `lost.ts` 的调用点、T8 表的行号、`Calls.tla` 能否表达新性质（承担：Explore，Haiku）
  - [x] 2. 写闭包规格 `delegate/closures/w4-mcp-unusable.md`：按 `delegate`「写规格」，`node --experimental-strip-types tools/dev-flow/src/delegate/brief-check-cli.ts --spec <规格> --base <F>` 退出 0。规格写明守护的接缝（D-W4M-2）与 `AggregateError` 落在 S5 还是 S8（承担：调度）
  - [x] 3. 写者实施；最后一次改动后重跑全部门禁，报告日志时间与提交号。产品写者交回后，守护写者在同一分支加性质与变异（承担：developer product，Opus 5.5 high；守护 developer verification，Opus 5.5 high）
  - [x] 4. 复跑功能门禁，核对写范围；写者声称的删除与改名用 `grep` 逐条核实（范式 §5 W2 教训）（承担：调度）
  - [x] 5. 闭包最终 head 一次关口（C-SM-08）：A（转 `lost` 的判断处逐行读，加探针）、E 必做；B（改了两份 SPEC）；C 只看标记字段与转 `lost` 的条件；D 在最终 head 只打热点（承担：评审子代理，见角色表；D 由调度跑）
  - [x] 6. 阻断集中修复，至多一轮，复审只核阻断；同一类阻断第二次出现时做结构诊断（承担：developer，同原模型）
  - [x] 7. 推送闭包分支，开 PR 到 `PanQiWei/skill-mcp`，merge commit 合入，读回父分支头；更新进度总览；署名与 trailer 按 `CONTRIBUTING.md`（作者 PanQiWei，`Harness: claude-code`，`Agent-Role`）（承担：调度） 已办：PR #1159 18:40:58 合入 `b7005bdc2`；验收与关口证据见 #1119 评论 6692490293

### 02：按服务键取 MCP 服务，撤除经 `closeAll` 收口

- **交付：** 宿主在真实 Cordis `Context` 上装 MCP 插件。消费者按三个服务键取到服务，在本地传输与脚本化对端进程上走「刷新 → 调用」。他域端口缺席时，依赖它的操作答 `unknown`。撤除插件时，连接与进程经 `closeAll` 收口，`dispose()` 在收口之后才返回。
- **被谁阻塞：** reduce 共享写（下面第一项）。原写「01 合入父分支」，2026-11-06 13:18 改为与 01 并行：两者在 `mcp-host-local` 只在 `SPEC.md` 重叠，已移出 02 的写范围；合入顺序 01 → 02（`decisions.tsv` 同时刻一行）。
- **对应判据：** C5 第 1–4 条的 MCP 部分（M4-4）；M4-5。
- **成员与文件：**
  - reduce 共享写（派发任何闭包之前，与 Skill 线的一次做完，见「顺序与并行」）：`pnpm package:template create --group mcp --name mcp-cordis-contract --variant service-contract --write`，`scan` 读数记下；`mcp-cordis-contract` 的依赖段加 `@omne-harness/mcp-contract`（spec 第 10 条的抽象 Service `implements` 契约接口），用例要用契约 `./testing` 时同时进 devDependencies；`mcp-host-local` 的依赖段（加 `@deepseek-ai/cordis`、`mcp-cordis-contract`；`mcp` 从 devDependencies 移到 dependencies）；一次 `pnpm install` 更新锁文件。写者不改锁文件与依赖段；`exports` 的 `./cordis` 一项由写者与 `src/cordis.ts` 同一提交加（见波包 §3.3）。
  - `packages/mcp/mcp-cordis-contract/`（新成员，写者填内容）：`src/cordis.ts` 三个服务键与四个端口键的抽象 Service、`Context` 增补；`src/index.ts` 根入口；`SPEC.md`、`docs/cordis.md`（依赖分类表、IC 符合性映射、验证义务）；`tests/public-entry.spec.ts`、`tests/cordis-entry.spec.ts`（spec 第 9、10 条）。
  - `packages/mcp/mcp-host-local/`：变体清点（spec 第 12 条），读数写进闭包规格；`src/cordis.ts` 插件工厂、配置 Schema、四个端口适配器、撤除函数（spec 第 11 条）；`tests/cordis-entry.spec.ts`；`docs/cordis.md` 改写。
- **验收：**
  - [x] C5 第 1 条：`pnpm package:template scan --member packages/mcp/mcp-cordis-contract --json` 报完整结构 `pass`、集成无 `deviation`（D-W4M-1）。读数贴卡。
  - [x] C5 第 2 条：`mcp-cordis-contract` 的 `tests/cordis-entry.spec.ts` 断言每个键常量等于类的 `provide`，导出集合恰为三个服务类、四个端口类与七个键常量（取自各类的 `provide`，IC-2）；`tests/public-entry.spec.ts` 断言根入口无运行导出、不导入 Cordis。同一 `scan` 读数里 IC-2、IC-4 无 `deviation`。
  - [x] C5 第 3 条：`mcp-host-local` 的 `tests/cordis-entry.spec.ts` 在真实 `Context` 上装插件，按三个服务键取到服务，在本地传输与脚本化对端进程上走通「刷新 → 调用」（D-W4M-3）。四个端口键逐个缺席时，依赖它的操作答 `unknown`。配置缺一项时加载失败。
  - [x] C5 第 4 条：同一文件的撤除用例断言 `dispose()` 返回时 `closeAll` 已结算、脚本化对端进程已停、句柄已释放、三个键取不到；撤除时的在途调用得到 S8 的答复；`closeAll` 以 `AggregateError` 拒绝时 `dispose()` 照常返回、日志收到这个错误。
  - [x] M4-5：`pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-cordis-contract` 退出 0；同一组 `--filter` 的 `pnpm turbo run test:slow` 退出 0；`pnpm run lint:deps` 无违规。
  - [x] 七项轻门禁退出 0（同切片 01）。
- **七步待办：**
  - [x] 1. 纯读的便宜模型补本切片上下文，只补差额：切片 01 合入后 `mcp-host-local` 的工厂参数与选项、`mcp-host-local` 的 `scan` 现行读数（承担：Explore，Haiku；`scan` 由调度跑，读数超过 120 秒时记录）。补到的上下文已写进闭包规格 `delegate/closures/w4-mcp-cordis.md`；由谁补的，本计划没有单独记录
  - [x] 2. 写闭包规格 `delegate/closures/w4-mcp-cordis.md`：键名全表（IC-7）、配置字段、工厂参数、变体清点结果；`brief-check` 退出 0（承担：调度）
  - [x] 3. 写者实施；最后一次改动后重跑全部门禁，报告日志时间与提交号（承担：developer product，Opus 5.5 high）
  - [x] 4. 复跑功能门禁，核对写范围（不得改锁文件与依赖段）（承担：调度）
  - [x] 5. 闭包最终 head 一次关口（C-SM-08）：A（`CredentialUse` 适配器的缺席路径与撤除函数逐行读，加探针）、E 必做；B（新 SPEC 与 `docs/cordis.md`）；C 必做（新形状与生命周期，波包 §5）；D 只打热点（承担：评审子代理；D 由调度跑）
  - [x] 6. 阻断集中修复，至多一轮，复审只核阻断（承担：developer，同原模型）
  - [x] 7. 推送、开 PR、merge commit 合入父分支，读回；更新进度总览；署名与 trailer 按 `CONTRIBUTING.md`（承担：调度） 已办：PR #1158 18:47:26 合入 `8078ad6ec`；关口证据 #1119 评论 6690327367，合入记录 6692710725

### 03：MCP 写回与波末

- **交付：** 读者从 MCP 组页「完整行为候选的正式承接缺口」表与领域页读到实际成员与状态，包括新增的 Cordis 行。负责人在卡上看到本波证据与 D-01、D-02 的请求。
- **被谁阻塞：** 02 合入父分支；Skill 线切片 02 完成（波末项要两条线都写回之后再跑）。
- **对应判据：** C5 第 5 条的 MCP 部分（M4-6）；C6 的本波一次；W4-4（M4-7）。
- **成员与文件：**
  - `packages/mcp/docs/architecture.md`「完整行为候选的正式承接缺口」表：W1–W3 已交付的行与新 Cordis 行按实际成员与状态写回；组 README 的成员状态。
  - （已完成，12:44 关卡，提前在写者运行期间做：写集只在 reduce 的文件）小卡 #1155（负责人 2026-11-06：W4 期间做完关卡；D-01 已定更正标注）：`docs/architecture/technical-foundations.md` 的 MCP 行写 2.4.0 与 node 适配 2.1.2；`docs/rfcs/RFC-0001-technical-foundations.md` 开头加更正标注（照 RFC-0002 第 13 行）；删 `packages/mcp/docs/architecture.md` 第 72、623、693 行与 `packages/mcp/README.md` 第 29 行的「RFC 行写 2.3.1」注句。验收按 #1155 的 C1–C4；合入父分支后在 #1155 贴证据并关卡。
  - `docs/domains/mcp/architecture.md`：成员状态写回。
  - 过程材料：进展页数据；派发流水。不写交接文档（负责人 2026-11-06：Skill 与 MCP 由本会话负责，没有接收者），证据只上卡评论。
- **验收：**
  - [x] M4-6：`pnpm run check:docs` 退出 0；`review-docs` 对写回无阻断（报告路径贴卡）。 已办：阻断 3 条修复后窄复核闭合，见 W4 报告 #1119 评论 6696174914
  - [x] C6：父分支头 `pnpm run admission`、`pnpm run acceptance`、`pnpm run loop:status --strict --base <F>` 各跑一次，基线既有失败与本波引入的失败分开报；本波成员的差分变异读数；派发流水 `python3 .meta_harness/agents/skills/delegate/canonical/scripts/ledger.py check --flows tmp/skill-mcp-domain/delegate/flow.jsonl` 退出 0（W3 做法）。 已办：W4 报告第 3 节（admission、acceptance 在 `7e2e9e2df`，`loop:status --strict` 在 `41d7b6529`，都退出 0）
  - [x] M4-7：W4 报告评论贴卡 #1119（两条线的判据证据：命令、退出码、输出尾部、日志哈希）；卡上请求 D-01、D-02 的评论已发，链接写进卡正文「成果交回」；`gh issue view 1119 --comments` 读回这两条评论，`gh issue view 1119 --json body` 读回「成果交回」里的两条链接。
- **七步待办：**
  - [x] 1. 补上下文：读两条闭包合入后的源码与 SPEC，列组页与领域页要改的行（承担：调度）
  - [x] 2. 跳过：本切片不派子代理，不写闭包规格
  - [x] 3. 写回组页与领域页（承担：调度；共享文件单写）。提交 `b310a9891`：组入口、组工程设计、组流程页、领域页、`packages/README.md`
  - [x] 4. 跑 `pnpm run check:docs`，核对写回只改组页与领域页（承担：调度）。PASS，`tmp/closures/w4-wave-end/check-docs.txt`
  - [x] 5. `review-docs` 只读子代理评审写回（承担：评审子代理，Opus 5.5 high）。19:25 派出，阻断 3、非阻断若干，`reviews/mcp-writeback-r1.md`
  - [x] 6. 阻断集中修复，至多一轮（承担：调度）。`b1f827095`，`check:docs` PASS；窄复核进行中
  - [x] 7. 提交并推送父分支；波末读数写进 W4 报告卡评论（卡正文 C6 的证据入口改为指向这条评论）；D-01、D-02 请求；卡正文「当前进展」与「成果交回」更新并读回（`gh issue view 1119 --json body`）；进展页与实现架构页按范式 §8、§9 刷新并重发布；记录分支经 `records-sync.sh` 推送；更新进度总览（承担：调度）。`41d7b6529` 已推送；W4 报告与 D-01、D-02 已贴；卡正文读回一致；两页本地已生成，重发布待 claude.ai 登录

## 集中检查

- 结构读数：两条线的 Cordis 闭包（本线 02、Skill 线 01）都合入父分支之后，在父分支头集中跑一次 `pnpm run metrics --coverage`，两线共用这一次（命令见 `spec.md`「Testing Decisions」）。差分变异按 `review-code` 技能「差分变异」一段，在每个闭包的最终 head 上只打热点，`VITEST_MAX_WORKERS=6`。D 与 metrics 只由 reduce 跑，只在没有写者跑门禁、没有别的 vitest 时开始；有写者在跑时先排后面，不抢（方案 §4.2）。工具不覆盖的写「未测量」，不写零。
- 常规评审：每个闭包在最终 head 上一次关口（C-SM-08，见切片第 5 步）。L2：派实现评审；纯文档写回只跑 `review-docs`；交付边界按本波 spec 核对（范式 §3）。
- 准入：不跑卡级准入。波末在父分支头只跑一次 `admission`、`acceptance`、`loop:status --strict --base <F>`，只作质量读数（范式 §3、§6；波包 §5），放在切片 03。准入与全量测试只由本会话跑，同一时刻一个（方案 §4.2）。全机准入经 `scripts/with-test-slot.mjs` 的运行名额排队。期间不提交、不做占 CPU 的事。闭包合入父分支前跑涉及成员的门禁与 `pnpm run preflight`（范式 §6）。

## 交回清单

- [x] 进度总览改成最终状态，与父分支的提交历史一致
- [x] 候选固定，父分支 head：41d7b65293b91d1b320d962acc812ff350fefd48
- [x] 每个闭包：推送闭包分支，开 PR 到 `PanQiWei/skill-mcp`，merge commit 合入（范式 §3：PR 是给负责人看差异的载体，不是 gate）。线父卡、binding、route：不适用（范式 §3、§4）
- [x] 卡 #1119 评论：W4 报告，判据证据（命令、退出码、输出尾部、日志哈希），两条线各一小节。不写交接文档
- [x] 卡正文「当前进展」与「成果交回」更新；D-01、D-02 的请求链接写进「成果交回」
- [x] `line-handoff` 交回记录：不适用，范式 §4 删除线会话与线父卡评论
- [x] 记录分支：`bash tmp/skill-mcp-domain/records-sync.sh "<提交说明>"` 推送 `PanQiWei/skill-mcp-records`（范式 §5）
- [ ] 进展页与实现架构页按范式 §8、§9 刷新并重发布（本地已生成；重发布要 claude.ai 登录，本会话没有）
- [x] 停写；对话里向负责人报本波摘要，不自行开下一波（范式 §2 第 8 条）

## 顺序与并行

- 01 → 02 → 03 串行。01 与 02 都写 `mcp-host-local`。03 写共享文件，等两条线的闭包都合入。
- 小卡 #1156（夹具 12 ms 静默窗口，负责人 2026-11-06：W4 期间做完关卡）由本会话自己做：01 合入父分支之后、在父分支上直接改（`mcp-host-local/tests/fixtures/scripted/stdio.ts`、`stdio-peer.mjs` 与一条新的确定性用例），与 02 的写集（`src/cordis.ts`、`tests/cordis-entry.spec.ts`、`docs/cordis.md`）不相交，可与 02 并行。验收按 #1156 的 C1–C4；合入后在 #1156 贴证据并关卡。
- 01 的产品写者与守护写者在同一分支先后进行，写者一次一个。
- 与 Skill 线：01 与 Skill 线切片 01 写集不相交，并行。02 可以与 Skill 线切片 01 并行。
- reduce 的共享写（两个新成员的草稿与依赖段、两个 host-local 的依赖段与 `exports`、锁文件）在派发任何闭包之前一次做完，作为一个提交进父分支。冻结输入 F 是这个提交之后的父分支头，三个闭包都从 F 切出。这个提交只含草稿成员与依赖：草稿成员的 `scan` 与 preflight 读数在提交前由 reduce 跑一次，读数失败（例如 `./cordis` 导出指向尚未存在的 `dist/cordis`）归 reduce 处置，不算任何闭包的失败。01 合入前的 preflight 若因这个中间态失败，同样归 reduce。
- 写者同时最多两个（方案 §4.2）：01 产品写者与 Skill 线切片 01 的写者可以同时跑；01 守护写者等 01 产品写者交回；02 等 01 合入。
- 各闭包只依赖冻结输入 F 与父分支上已合入的提交，不读别的闭包未合入的提交。
