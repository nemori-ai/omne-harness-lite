# #1119 交付计划：Skill 线（revision 1，attempt `W4（波段）`）

本文件按 claim 模板与 Matt to-spec／to-tickets 写成。格式取 `.meta_harness/agents/skills/claim/canonical/references/plan-template.md`。切法取 Matt `to-tickets`，固定源 `skills-b0618bc436ad`，按已安装路径直接读正文，不经宿主触发：每个切片是一条完整的纵向路径，写阻塞边。项目差异按 `docs/engineering/skills.md`「三层分工」与「项目差异与负责边界」：切分由 reduce 自定，不请人批准；本计划写成员、文件与验收命令；首版前不做 expand–contract。本卡没有线父卡、binding 与 gate，用波段代替 attempt（[范式 §3](../../operating-model.md#3-变通)）。规格见 [spec.md](spec.md)。

## 进度总览

进度：[■■■■■■■■■■] 2/2 切片已完成 · 更新 2026-11-06 14:12 UTC · 父分支 head 84db0bace
当前：Skill 线 W4 完成。波末读数、W4 报告与 D-01、D-02 的请求随 MCP 线切片 03 一起做。

切片 02 已完成：写回 `fa572db49`；`review-docs`（14:09 交回）阻断 1（`skill-contract/docs/cordis.md:3` 仍写「具名文档目标」）、非阻断 7，全部在 `84db0bace` 处置，阻断用 grep 读数复核；`check:docs` PASS；已推送。报告 `reviews/skill-writeback-r1.md`，证据 #1119 评论 6686828234。

切片 01 已合入（13:59，合并提交时间）：PR #1157，父分支合并提交 `4a8e8bbf0`，闭包最终 head `33ea4d16e`。关口结果贴卡 #1119 评论 6686573784（含对 6685796575 的更正）。经过：

- 修复轮交回 `af00fe8aa`（十六项都做，R1–R15 变红验证）。派发者核对写范围与 B1 五处原句已不在。
- B 窄复审：B1 闭合，没有新阻断；4 处非阻断由派发者直接改（`33ea4d16e`）。`acceptance/` 占位写成现状（`19a87df1a`）。
- D 差分变异（`af00fe8aa`）：`skill-cordis-contract` 5/5 被杀；`skill-host-local` 72 个存活 11 个，逐个判为组合后等价或不在契约里，没有缺陷类存活。
- 最终 head 复跑 typecheck、lint:rules、lint:oxlint 退出 0；证据归档到 `tmp/closures/w4-skill-cordis/`，闭包工作树已清理，台账 +7 行（166 行 ok）。

以下是切片 01 关口期间的记录：

- 关口：派发者在 `835d4982e` 上复跑 typecheck、lint:rules、lint:oxlint、lint:deps 全部退出 0；证据评论 #1119 6685796575。四面评审都已交回，报告与裁定在 `reviews/skill-cordis-r1.md`：
  - E 交付边界（13:25）：验收 1–6、S4-1、性质义务都达到。
  - C 设计与实践（13:27）：非阻断。F1 插件没有经 `definePlugin`（IC-14）；F2–F5 用例缺口。
  - A 正确性（13:28）：无阻断。`list`、`export`、`search`、配置接受 `{}`、`adopted` 换代各缺会变红的用例（手工变异存活）。
  - B 表达（13:32）：阻断 1（B1：`skill-host-local` 几页现行文档仍写「没有类、不依赖 `skill`」），非阻断 9。
- 裁定：
  - C-F1 按 IC-14 改，不登记偏离。共享写 `9a1089645`（两个 host-local 依赖 kernel-basis）已推送父分支，并合进闭包分支（`9817e28d9`）。
  - B1 扩大写范围一并改。
  - N2 缺席答法归 `skill-host-local` 的 SPEC。
- 修复轮：13:33 新开写者（Sonnet 5.5 high），十六项写在闭包规格追加 2。13:38 已提交 `e0d2be00c`（`definePlugin`、配置判据、逐方法用例），文档部分进行中。
- 修复之后：B1 由派发者逐文件核对，再派一次窄范围表达复审；D 差分变异在最终 head 上跑热点；然后合入父分支。

| 切片 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- |
| 01 | 宿主在真实 Cordis `Context` 上装 Skill 插件，消费者按键取服务，在目录来源上走「描述 → 读」；端口缺席时依赖它的操作答 `unknown` | C5 第 1–3 条的 Skill 部分（S4-1、S4-2） | 已合入 `4a8e8bbf0` |
| 02 | Skill 组页与领域页按实际成员写回 | C5 第 5 条的 Skill 部分；W4-4 的 Skill 部分（S4-3） | 已完成 `84db0bace` |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `w4-skill-cordis` | Sonnet 5.5@high | 定 | `.worktrees/w4-skill-cordis` | `PanQiWei/skill-mcp-w4-skill-cordis` | 已合回 `4a8e8bbf0`（12:36 派出；13:04 交回；13:06 追加 1；13:13 交回 `835d4982e`；PR #1157；关口 A、B、C、E 13:25–13:32 交回；13:33 追加 2 修复轮；`af00fe8aa` 交回；B 窄复审闭合；派发者 `19a87df1a`、`33ea4d16e`；工作树已清理） | 2 | 2 | `reviews/skill-cordis-r1.md`；#1119 评论 6686573784 |

## 角色与模型分配

本会话宿主：Claude Code，版本 2.1.318。本会话是 reduce，兼 Skill 线与 MCP 线的负责人（[范式 §1](../../operating-model.md#1-前提)）。

派发做法按 `delegate`「选模型」。规则与钉值归 `.meta_harness/agents/roles/README.md`「模型配置与本次派发」与 `dispatch-policy.json`（策略版本 947.1）。派发时用 `render_pair.py --resolve claude_code --policy-version 947.1` 按表中的 work 与 risk 解析一次，把解析结果与实际派发值都写进闭包规格。写者档位按负责人的分档规则定，它优先于策略解析，规则见 MCP 线 [plan.md](../mcp/plan.md)「角色与模型分配」。2026-11-06 解析值是 Fable 5.1 high。下表改为实际派发值。命令：

```sh
uv run --locked python .meta_harness/agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source .meta_harness/agents/roles/developer --resolve claude_code \
  --policy-version 947.1 --work-kind provider --risk multi-package
```

| 切片或环节 | 工作性质与复杂度 | 清晰度 | 角色与 implementation_kind | 模型与 effort | 理由 |
| --- | --- | --- | --- | --- | --- |
| 调度 | 规格、计划、简报、裁定、读 diff、共享写、合入 | — | 本会话 | 当前会话模型（Opus 5.5） | 需要全局上下文。共享文件只由 reduce 写（范式 §2 第 2 条） |
| 上下文补差 | 读多写少 | — | Explore 子代理 | Haiku，见 `delegate`「选模型」 | 只补 W3 合入后与[上下文包](../context-pack.md)的差额 |
| 01 | 新成员加提供者插件：work `provider`，risk `multi-package` | 定 | developer，product | Sonnet 5.5，high | 写两个成员（新的 `skill-cordis-contract` 与 `skill-host-local`），但键名全表、端口适配的答法与配置去处都由 spec 与闭包规格写定，没有撤除的资源。按规格写定的开发派。第一次纠偏不行时升 Opus 5.5 high，记进闭包表 |
| 02 | 组页与领域页写回 | — | 本会话 | 当前会话模型 | 组页与领域页是共享文件，只由 reduce 写 |
| 评审 | C-SM-08 的一次关口：A 正确性、B 表达、C 设计与实践、D 差分变异、E 交付边界 | — | A implementation-reviewer；B design-reviewer（表达）；C、D 按 `review-code`；E 按 `review-delivery` 的只读子代理 | A、C、E：Opus 5.5 high（方案 §4.2 评审默认 Opus，A 用 `model` 参数覆盖角色钉值 Fable 5.1）。B：Opus 5.5 xhigh（`--resolve` 的 expression 下限）。D：reduce 自跑 | 方案 §4.1、§4.2 |
| 独立验收（按风险） | 不派 | — | — | — | L2。判据由用例与命令读数核对，E 面按 spec.md 判据核对（范式 §3） |
| 修复轮 | 评审阻断 | — | developer | 同原切片的模型与档位 | 关口之后至多一轮修复，复审只核阻断（C-SM-08）。同一类阻断第二次出现，做结构诊断（方案 §4.1 第 4 条） |

## 切片

### 01：按服务键取 Skill 服务

- **交付：** 宿主在真实 Cordis `Context` 上装 Skill 插件。消费者按三个服务键取到服务，在本机目录来源上走「描述 → 读」。他域端口缺席时，依赖它的操作答 `unknown`，`PackageInspection` 照常可用。撤除插件后三个键取不到。
- **被谁阻塞：** W4-0 开波同步与冻结 F（[方案](../plan.md) §4.4 W4-0）；reduce 共享写（下面第一项）。之后无，可立即开始。
- **对应判据：** C5 第 1–3 条的 Skill 部分（S4-1）；S4-2。
- **成员与文件：**
  - reduce 共享写（派发任何闭包之前，与 MCP 线切片 02 的一次做完，见 MCP 线 [plan.md](../mcp/plan.md)「顺序与并行」）：`pnpm package:template create --group skills --name skill-cordis-contract --variant service-contract --write`，`scan` 读数记下；`skill-cordis-contract` 的依赖段加 `@omne-harness/skill-contract`（spec 的抽象 Service `implements` 契约接口），用例要用契约 `./testing` 时同时进 devDependencies；`skill-host-local` 的依赖段（加 `@deepseek-ai/cordis`、`skill-cordis-contract`；`skill` 从 devDependencies 移到 dependencies）；一次 `pnpm install` 更新锁文件。写者不改锁文件与依赖段；`exports` 的 `./cordis` 一项由写者与 `src/cordis.ts` 同一提交加（见波包 §3.3）。
  - `packages/skills/skill-cordis-contract/`（新成员，写者填内容）：`src/cordis.ts` 三个服务键与两个端口键的抽象 Service、`Context` 增补；`src/index.ts` 根入口；`SPEC.md`、`docs/cordis.md`（依赖分类表、IC 符合性映射、验证义务）；`tests/public-entry.spec.ts`、`tests/cordis-entry.spec.ts`（spec 第 1、2 条）。
  - `packages/skills/skill-host-local/`：变体清点（spec 第 4 条），读数写进闭包规格；`src/cordis.ts` 插件与两个端口适配器（spec 第 3 条）；`tests/cordis-entry.spec.ts`；`docs/cordis.md` 改写。
- **验收：**
  - [ ] C5 第 1 条：`pnpm package:template scan --member packages/skills/skill-cordis-contract --json` 报完整结构 `pass`、集成无 `deviation`（D-W4S-1）。读数贴卡。
  - [ ] C5 第 2 条：`skill-cordis-contract` 的 `tests/cordis-entry.spec.ts` 断言每个键常量等于类的 `provide`，导出集合恰为三个服务类、两个端口类与五个键常量（取自各类的 `provide`，IC-2）；`tests/public-entry.spec.ts` 断言根入口无运行导出、不导入 Cordis。同一 `scan` 读数里 IC-2、IC-4 无 `deviation`。
  - [ ] C5 第 3 条：`skill-host-local` 的 `tests/cordis-entry.spec.ts` 在真实 `Context` 上装插件，按三个服务键取到服务，在目录来源上走通「描述 → 读」。两个端口键逐个缺席时，依赖它的操作答 `unknown`，`PackageInspection` 照常取得。`dispose()` 之后三个键为 `undefined`。
  - [ ] S4-2：`pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract --filter=@omne-harness/skill --filter=@omne-harness/skill-host-local --filter=@omne-harness/skill-cordis-contract` 退出 0；同一组 `--filter` 的 `pnpm turbo run test:slow` 退出 0；`pnpm run lint:deps` 无违规。
  - [ ] 七项轻门禁退出 0：`pnpm run typecheck`、`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`，加上一条成员门禁。
- **七步待办：**
  - [x] （11:26 本会话直接补；`scan` 读数在共享写时由调度跑）1. 纯读的便宜模型（见 `delegate`「4 选模型」）补本切片上下文，只补差额：W3 合入后三个工厂与目录来源的签名、`skill-host-local` 的 `scan` 现行读数（承担：Explore，Haiku；`scan` 由调度跑，读数超过 120 秒时记录）
  - [ ] 2. 写闭包规格 `delegate/closures/w4-skill-cordis.md`：键名全表（IC-7）、目录来源选项的去处、变体清点结果；`node --experimental-strip-types tools/dev-flow/src/delegate/brief-check-cli.ts --spec <规格> --base <F>` 退出 0（承担：调度）
  - [ ] 3. 写者实施；最后一次改动后重跑全部门禁，报告日志时间与提交号（承担：developer product，Sonnet 5.5 high）
  - [ ] 4. 复跑功能门禁，核对写范围（不得改锁文件与依赖段）；写者声称的结构性改动用 `grep` 逐条核实（承担：调度）
  - [ ] 5. 闭包最终 head 一次关口（C-SM-08）：A（`SkillReadCheck` 适配器的缺席路径逐行读，加探针）、E 必做；B（新 SPEC 与 `docs/cordis.md`）；C 必做（新形状，波包 §5）；D 只打热点（承担：评审子代理，见角色表；D 由调度跑）
  - [ ] 6. 阻断集中修复，至多一轮，复审只核阻断；同一类阻断第二次出现时做结构诊断（承担：developer，同原模型）
  - [ ] 7. 推送闭包分支，开 PR 到 `PanQiWei/skill-mcp`，merge commit 合入，读回父分支头；更新进度总览；署名与 trailer 按 `CONTRIBUTING.md`（作者 PanQiWei，`Harness: claude-code`，`Agent-Role`）（承担：调度）

### 02：Skill 写回

- **交付：** 读者从 Skill 组页「完整行为候选的正式承接缺口」表与领域页读到实际成员与状态：两行 Cordis 行改为已有实现（候选），`skill-cordis-contract` 是 workspace 成员。
- **被谁阻塞：** 01 合入父分支。
- **对应判据：** C5 第 5 条的 Skill 部分；W4-4 的 Skill 部分（S4-3）。W4-4 的波末项（C6、W4 报告卡评论、D-01、D-02 的请求）在 MCP 线 [plan.md](../mcp/plan.md) 切片 03，本切片完成后那里才开始。
- **成员与文件：**
  - `packages/skills/docs/architecture.md`「完整行为候选的正式承接缺口」表与表前一段；「对外提供」中服务键的出处；组 README 的成员与依赖。
  - `docs/domains/skills/architecture.md`：成员状态写回。
- **验收：**
  - [ ] S4-3：`pnpm run check:docs` 退出 0；`review-docs` 对写回无阻断（报告路径贴卡）。
  - [ ] `grep -n '尚未承接' packages/skills/docs/architecture.md` 的输出里不再有两行 Cordis 行。
- **七步待办：**
  - [ ] 1. 补上下文：读闭包合入后的源码与 SPEC，列组页与领域页要改的行（承担：调度）
  - [ ] 2. 跳过：本切片不派子代理，不写闭包规格
  - [ ] 3. 写回组页与领域页（承担：调度；共享文件单写）
  - [ ] 4. 跑 `pnpm run check:docs`，核对写回只改组页与领域页（承担：调度）
  - [ ] 5. `review-docs` 只读子代理评审写回（承担：评审子代理，Opus 5.5 high）
  - [ ] 6. 阻断集中修复，至多一轮（承担：调度）
  - [ ] 7. 提交并推送父分支；更新进度总览（承担：调度）

## 集中检查

- 结构读数：与 MCP 线共用一次 `pnpm run metrics --coverage`，在两条线的 Cordis 闭包都合入父分支之后跑（见 MCP 线 [plan.md](../mcp/plan.md)「集中检查」）。差分变异按 `review-code` 技能「差分变异」一段，在闭包最终 head 上只打热点，`VITEST_MAX_WORKERS=6`。D 与 metrics 只由 reduce 跑，只在没有写者跑门禁、没有别的 vitest 时开始（方案 §4.2）。工具不覆盖的写「未测量」，不写零。
- 常规评审：闭包在最终 head 上一次关口（C-SM-08，见切片 01 第 5 步）。L2：派实现评审；纯文档写回只跑 `review-docs`；交付边界按本波 spec 核对（范式 §3）。
- 准入：不跑卡级准入。波末在父分支头只跑一次 `admission`、`acceptance`、`loop:status --strict --base <F>`，只作质量读数，放在 MCP 线切片 03（范式 §3、§6；波包 §5）。准入与全量测试只由本会话跑，同一时刻一个（方案 §4.2），经 `scripts/with-test-slot.mjs` 的运行名额排队。期间不提交、不做占 CPU 的事。闭包合入父分支前跑涉及成员的门禁与 `pnpm run preflight`（范式 §6）。

## 交回清单

- [ ] 进度总览改成最终状态，与父分支的提交历史一致
- [ ] 候选固定，父分支 head：<sha>
- [ ] 闭包：推送闭包分支，开 PR 到 `PanQiWei/skill-mcp`，merge commit 合入（范式 §3：PR 不是 gate）。线父卡、binding、route：不适用（范式 §3、§4）
- [ ] 判据证据（命令、退出码、输出尾部、日志哈希）写进 W4 报告卡评论的 Skill 小节（每波一条，两条线各一小节）。不写交接文档
- [ ] `line-handoff` 交回记录：不适用，范式 §4 删除线会话与线父卡评论
- [ ] 卡正文、记录分支、进展页与实现架构页：随 MCP 线切片 03 的波末一次做
- [ ] 停写；对话里向负责人报本波摘要，不自行开下一波（范式 §2 第 8 条）

## 顺序与并行

- 01 → 02 串行。02 写共享文件，等 01 合入。
- 与 MCP 线：01 与 MCP 线切片 01、02 写集不相交，可以并行。reduce 的共享写（两个新成员的草稿与依赖段、两个 host-local 的依赖段与 `exports`、锁文件）作为一个提交进父分支，F 是它之后的父分支头。它在派发任何闭包之前一次做完，三个闭包都从 F 切出，也避免两个闭包同改锁文件。
- 写者同时最多两个（方案 §4.2）：本线 01 的写者与 MCP 线 01 的产品写者可以同时跑；MCP 线 01 的守护写者开工时本线 01 若仍在跑，仍是两个。
- 波末项在 MCP 线切片 03，等本线 02 与 MCP 线 02 都完成。
- 闭包只依赖冻结输入 F 与父分支上已合入的提交，不读别的闭包未合入的提交。
