# 闭包规格 w3-mcp-call-docs2

## 身份与位置
- 闭包：w3-mcp-call-docs2
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call
- 分支：PanQiWei/skill-mcp-w3-mcp-call
- 基线：0b84a0bec605dab46a620a2ffaeef7d77ccf24bc
- 清晰度：定

`w3-mcp-call` 第 2 轮评审之后的表达与证据闭包（PR #1141），接在代码修复 `w3-mcp-call-fix2` 之后。评审与卡拥有者的裁定在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r2.md`：B 面 R2-2～R2-11 中标「改」的表达项，E 面「变异重跑」一条，以及 fix2 交回里列出的「让排除文件里的句子过时的位置」，是本闭包的施工依据。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。理由：规格完整的文档修订与手工变异重跑，单成员、无并发设计 → 经济档。

## 目标边界
目标：成员与契约的文档与最终 head 的代码一致；C 序列变异在最终 head 上重跑并补行；每条证据写实际运行的 head。

### 已定的事（不重新裁定）
1. **C 序列重跑**（B R2-2、E）：受 `1a143a4d4`、`104261a42` 与 fix2 影响的行（至少 C07、C11–C14、C24、C36、C38、C44、C51，以及 fix2 改写了被变异代码的每一行）在本闭包的基线上重跑；F1(d) 的 `loseInScope`、S8 的关停先判、fix2 的第 8 步核对、占位句柄、任务号碰撞各补一条 C 行（翻转那一行、指定用例变红）；fix2 交回的手工变异表并入 C 序列。每行写运行时的 head；「最终 head」一词只用于本闭包基线。MC-16 映射表第 1 行「关停」一支改引一个经过 `ensure` 的 `settings` 阶段的用例。
2. **变异编号**（B R2-10）：S8 的变异编进 C 序列，不另起「变异 S1」；C21、C47、C48 的「自裁」编号写明是哪一份闭包规格的；MC-12 的两句变异声明补记录，或标为未验证。
3. **第 11 步与「所有权」**（B R2-3）：写明应答总经 `ask` 读取，reject 被吸收；停止之后只丢弃它的值。
4. **契约出处**（B R2-4）：契约 SPEC 决定清单为 O1/O3 的吸收与两个常量、R2 的 `cancelled` 各补一条带出处的决定；前言里「第 26、27 条是调用口闭包随后加的两处」的计数改正；根入口 `.` 行补 `STRUCTURED_CONTENT_MISSING`、`OUTPUT_CHECK_FAILED`；调用口的决定另立依据行（2026-11-05）。fix2 加的 S8 一句也登记；S8 里「任务操作仍先按 S2 判发起者。」与紧接的「任务操作先按 S2 判发起者：……」重复，删前一句。
5. **读法与编号**（B R2-5）：SPEC 开头的读法一段补 WF4–WF5 与 P14 T1/T2；「已定事项 2」「闭包规格第 5、6 条」写明来源，或换成缺陷描述。
6. **C50 与未覆盖**（B R2-6、A 非阻断 1）：fix2 加了第 8 步核对与逐微任务扫描的用例之后，重写 C50 的说明与「未覆盖」两处，两处说同一句。
7. **WF5**（B R2-7）：成员一侧写明 WF5 是对传输的前提，依据契约 T5「`call` 在信号触发后结算」一句；这一句由 `w3-mcp-host` 第 2 轮补入，在它合入父分支之前，成员 SPEC 写明出处在途。
8. **模型 README**（B R2-8）：按 `Calls.tla` 里四个键的定义重写「A 与 B、A 与 C、A 与 D」的差别。
9. **README**（B R2-9）：两种语言的验证段只链接 SPEC「性质与证据」，不列编号。
10. **`lost.ts` 与偏离表**（B R2-11）：两处函数注释与文件头同一口径（按原因判断、偏安全）；偏离表那一行补 T5 例外（已触发信号下的 `connection-unavailable` 不转 `lost`）。
11. **fix2 交回的过时句子**：交回第 7 节逐条改。另有三处：`verification/models/README.md` 写明模型在关口答复之后读 `shut`（`gateW`、`tgateW`），代码在下一次等待之前与第 8 步读，两者对「关停之后不问端口」的可观察结果相同（fix2 自裁 6）；探索器负控表里 N1 的签名不再含 `P9-sent-after-stop`（第 8 步挡住了发出），加 N8（删碰撞规则 → `task-collision` 报 P12）；任务键碰撞 TLA 未建模，P12 行已写「模型未覆盖」，`verification/README.md` 同口径。
12. **fix2 的变异表并入 C 序列**：交回第 4 节「3 与 5」的 G1–G16、D1–D7 是在 fix2 head 的副本上跑的（驱动 `tmp/closures/w3-mcp-call/fix2/mutations/mutate.py`，日志 `mutations/logs-final/`）；在本闭包基线上按第 1 条的做法重跑后编入 C 序列，不另起编号体系。

### 写范围
- `packages/mcp/mcp/SPEC.md` — 第 1–7、10、11 条涉及的句子
- `packages/mcp/mcp/README.md` — 第 9 条
- `packages/mcp/mcp/README_ZH.md` — 第 9 条
- `packages/mcp/mcp/docs/` — 第 11 条
- `packages/mcp/mcp/verification/README.md` — 第 1、2、6 条与探索器、TLC 的运行记录
- `packages/mcp/mcp/verification/models/README.md` — 第 8 条
- `packages/mcp/mcp/src/internal/lost.ts` — 只改注释（第 10 条）
- `packages/mcp/mcp-contract/SPEC.md` — 第 4 条
- `packages/mcp/mcp-contract/docs/public-api.md` — 第 4 条如需
- `tmp/closures/w3-mcp-call/docs2/`（新建） — 变异日志、门禁输出

### 排除的调用方
- `packages/mcp/mcp/src/` 的代码（注释以外）、`tests/`：fix2 已交回；变异在工作树之外的副本上做。
- 契约 `src/` 与 T 段：`w3-mcp-host` 在改。
- `packages/mcp/mcp-host-local/`。

## 验收清单
1. 第 1 条每行变异：在工作树之外的副本上改、跑、还原；日志存 `tmp/closures/w3-mcp-call/docs2/mutations/`，每行写「变异 → 变红的用例 → 运行时的 head → 日志哈希」。
2. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希写进交回。
3. `git diff --name-only <基线>..HEAD` 只含写范围内的文件；`lost.ts` 的 diff 只有注释行。
4. B R2-2～R2-11 逐条写「已改」与位置。

## 实施规格
- 中文文档按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。
- 只写现状与依据，不写评审轮次与过程；编号要能在仓库里解析。

## 性质及证据义务
- 每条变异声明都有在本闭包基线上运行的记录；没有运行的写「未验证」。

## 施工计划
1. 读裁定、fix2 的交回与 diff。
2. 第 1、2 条的变异重跑与记录。
3. 第 3–11 条的文档。
4. 门禁、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行 `@omne-harness/mcp` 的测试、仓库文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改代码行为。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call。并行的有 `w3-mcp-host-fix3` 与 `w3-mcp-host-formal3`（各在自己的树，都吃 CPU）。成员测试用 `VITEST_MAX_WORKERS=4`；每个变异只跑杀它的那个用例文件（`vitest run <文件> -t <名字>`），不跑成员全量（`@omne-harness/mcp` 全量约 12 分钟）。不跑 `admission`、仓库全量测试与差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r2.md
- fix2 的规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call-fix2.md
- fix2 的交回（变异表、命名账本、过时句子清单、自定裁定）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-call-fix2.md
- 必须加载：asd-ste100

## 当前认知
- 已确认：fix2 交回 head `0b84a0bec`，派发者复跑 `lint:rules`、`typecheck`、三包构建与用例全部退出 0。自裁 1–12 全部采纳（见 fix2 规格的追加记录）。
- 已确认：fix2 的守卫进了 setup 文件，第 2 轮差分变异的两个运行错误现在是普通变红（D1、D2）。
- 已确认：`under` 只在等待之前核停止与关停，第 8 步在发出前再核；SPEC MC-16 已按此写（fix2 改）。
- 未知：C 序列在新结构上有几行的被变异代码已被改写，需要换成对应的新行。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；C 序列表；B R2-2～R2-11 逐条位置；未覆盖项。

## 已知会受影响的现有用例
- 没有用例改动。

## 停止条件
- 某条文档要求与最终 head 的代码行为不符，而改代码在范围外。
- 某条变异在副本上无法构造。

## 追加记录
- 2026-11-06 03:19 派发前：基线填为 fix2 交回的 head `0b84a0bec`（写者直接在卡分支上提交，不需另行合回），树干净。补第 12 条（fix2 变异表并入 C 序列）与第 11 条的三处；第 4 条加 S8 重复句。简报检查退出 0；1712 条 `caller-outside-scope` 是全仓同名标识符匹配，本闭包除 `lost.ts` 注释外不改代码。
- 2026-11-06 03:44 交回（`delegate/handbacks/w3-mcp-call-docs2.md`），head `8d376c0ba`，3 个提交，10 个文件全在写范围，`lost.ts` 只改注释，署名与 trailer 正确，树干净。自定 1–5 采纳。交回指出两处范围外的陈旧注释（`Calls.tla` 讲四个键差别、`tasks.ts:132`），派发者自己改正为 `fcc955a53`，`Calls.tla` 的 SHA-256 因此变化，29 个配置 03:44 起重跑全部符合判读，正控读数逐项相同（`tmp/closures/w3-mcp-call/owner-docs2/tlc-all.log` `8ac2d3ac5401be7c`），模型 README 补一句记录。派发者复跑 `check:docs`、`check:design`、`format:check`、`lint:rules`、`typecheck`、`lint:oxlint`、`lint:deps` 全部退出 0（`owner-docs2/`）。已推送，证据卡评论 6676418696；第 3 轮五面派出（简报 `reviews/mcp-call-r3-briefs.md`）。
