# 闭包规格 w3-mcp-call-docs3

## 身份与位置
- 闭包：w3-mcp-call-docs3
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call
- 分支：PanQiWei/skill-mcp-w3-mcp-call
- 基线：035ac8fee8a5daca375c0bb32ed2067cd18fad2c
- 清晰度：定

`w3-mcp-call` 第 3 轮评审之后的表达与证据闭包（PR #1141），接在代码修复 `w3-mcp-call-fix3` 与派发者的改正 `035ac8fee` 之后。评审与卡拥有者的裁定在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r3.md`（「卡拥有者对 B 的处置」N3、N5–N11，「卡拥有者对 C 的处置」与「卡拥有者对 A 的处置」）。fix3 的交回在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-call-fix3.md`，第 6 节是手工变异表，第 10 节是让文档过时的位置清单。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。理由：规格完整的文档修订与手工变异重跑，单成员，没有并发设计，用经济档。

## 目标边界
目标：成员与契约的文档与最终 head 的代码一致；fix3 与 `035ac8fee` 的变异与读数写进证据，每条写实际运行的 head。只做下面列的事，不加别的改进。

### 已定的事（不重新裁定）
1. **出口一处判定的写法**（B N6，fix3 交回第 10 节）：三个出口（调用口 `calls.ts` 的 `answerAtExit`，refresh `discovery.ts` 的 `answerAtExit`，任务操作 `tasks.ts` 的 `outcomeOf`）各写清次序。调用口与 refresh 同序：已发出或已发布的结果不改；调用方停止信号已触发答 `cancelled`（refresh 为 `kept`（`cancelled`））；否则关停已开始答关停的答复；其余原样。任务操作没有调用方信号：没有发出且关停已开始答 `effect-unknown`（`no-connection`）。途中各点（`under` 的等待前、第 8 步、任务操作的入口与发请求前、refresh 的取页前、读 `basedOn` 前与发布边界前）只负责「关停之后不开始下一步、不问端口」。凡写「三个决定点」或「途中各点各自答复」的句子按此改，包括成员 SPEC「组合与验证·未覆盖」与「性质与证据」里的两句。每个点写守住它的用例与变异（F1–F14、N9、N10，加第 3 条的新变异）。
2. **fix3 交回第 10 节逐条改**：`verification/README.md`（C07、C44、C65、C22、C31、C55 引的用例标题；C36 的 `connectionOf`；C55 的 `sent` 改 `recordSent`；N 序列表 N1、N2 的变异原文；关停读取点一段；P13 读数、新场景 continue-shutdown、N9、N10、F1–F14 的记录）；`verification/models/README.md` 的「可观察结果相同」只对端口成立；`docs/object-model.md` 的 `sent(connection, generation)`；`docs/flows.md` 的第 8 步答复；`docs/architecture.md` 的 `publish` 三段与 `TaskTable` 的「有歧义」；`README.md`、`README_ZH.md` 维护段列的 S8 承载模块。
3. **refresh 出口的改正 `035ac8fee`**：MC-7 已改。`verification/README.md` 记一条新变异：refresh 出口不读调用方信号（删掉 `stop?.aborted` 一行），由 `tests/refresh.spec.ts`「the caller aborts and closeAll begins while a page is asked」变红。在副本上实跑，写运行时的 head 与日志哈希。F11、F12、F13 在基线上重跑一次，因为 `answerAtExit` 的签名变了。SPEC 测试表 MC-7 一行补这条用例名。
4. **`Calls.tla` 的过时注释**（fix3 交回第 10 节）：`verification/models/Calls.tla` 第 305 行附近讲 `connectionOf` 的注释改成现行函数名，只改注释。改后按 `verification/models/README.md` 的命令重跑全部配置，读数（每个配置的判读与日志哈希）写进该 README 的运行记录。
5. **B N3、N5、N7–N11**：
   - N3：表格里代码跨度中的 `|` 转义为 `\|`。
   - N5：S8 的变异补两行 C 记录，变异在本闭包基线上运行；做不到的标「未验证」。
   - N7：`docs/architecture.md` 模块表补 `internal/classification.ts`；成员 SPEC 里 `connectionFailureOf` 的旧名改为现行名（以 `src/` 为准）。
   - N8：删「没有人读它」「没有人读」，或改成「它的值没有人使用」。
   - N9：生命周期探索器读数写出运行的 head；本闭包不重跑生命周期探索器，写「状态数未在 <基线> 上重测」，并在 `verification/README.md` 交代读数 head 与 PR head 的关系。
   - N10：读法段补「调用口第 N 轮裁定 <面> <号>」；「本闭包」换成闭包名；契约第 26、27 条的出处改用「reduce 已定的事」第 7、4 条。`tests/invoke.spec.ts` 里标题仍写旧步号的用例，标题改为现行步号（只改标题字符串）。
   - N11：契约 SPEC 新节为第 28、30 条各写一句性质；第 30 条写明行为改动：`closeAll` 之后对未采用的接入点 `refresh` 由 `not-available-to-you` 变为 `connection-unavailable`。

### 写范围
- `packages/mcp/mcp/SPEC.md` — 第 1、3、5 条涉及的句子
- `packages/mcp/mcp/README.md` — 第 2 条
- `packages/mcp/mcp/README_ZH.md` — 第 2 条
- `packages/mcp/mcp/docs/architecture.md` — 第 2、5 条
- `packages/mcp/mcp/docs/flows.md` — 第 2 条
- `packages/mcp/mcp/docs/object-model.md` — 第 2 条
- `packages/mcp/mcp/verification/README.md` — 第 1–5 条的证据与运行记录
- `packages/mcp/mcp/verification/models/README.md` — 第 2、4 条
- `packages/mcp/mcp/verification/models/Calls.tla` — 只改注释（第 4 条）
- `packages/mcp/mcp/tests/invoke.spec.ts` — 只改用例标题字符串（第 5 条 N10）
- `packages/mcp/mcp-contract/SPEC.md` — 第 5 条 N11

### 排除的调用方
- `packages/mcp/mcp/src/` 的全部文件：代码行为已定，变异在工作树之外的副本上做。
- `packages/mcp/mcp/tests/` 除 `invoke.spec.ts` 的标题之外的内容。
- 契约 `src/` 与 T 段：`w3-mcp-host` 在改。
- `packages/mcp/mcp-host-local/`。

## 验收清单
1. 第 1、3 条的每个变异：在工作树之外的副本上改、跑、还原；日志存 `tmp/closures/w3-mcp-call/docs3/mutations/`，每行写「变异 → 变红的用例 → 运行时的 head → 日志哈希」。
2. 第 4 条：`Calls.tla` 全部配置重跑，每个配置的判读与预期一致，运行日志哈希写进交回与模型 README。
3. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希写进交回。
4. `git diff --name-only <基线>..HEAD` 只含写范围内的文件；`Calls.tla` 的 diff 只有注释行；`invoke.spec.ts` 的 diff 只有 `it(` 标题字符串。
5. 第 1、2 条与 B N3、N5–N11 逐条写「已改」与位置。

## 实施规格
- 中文文档按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。
- 只写现状与依据，不写评审轮次与过程；编号要能在仓库里解析。

## 性质及证据义务
- 每条变异声明都有在本闭包基线上运行的记录；没有运行的写「未验证」。

## 施工计划
1. 读裁定、fix3 交回与 `fcc955a53..035ac8fee` 的 diff。
2. 第 3 条的变异与第 4 条的 TLC 重跑。
3. 第 1、2、5 条的文档。
4. 门禁、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行 `@omne-harness/mcp` 的单个用例文件、`Calls.tla` 的 TLC、仓库文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改代码行为。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call。并行的有 `w3-mcp-host` 第 4 轮评审（只读，在另一棵树，会跑度量）。每个变异只跑杀它的那个用例文件（`VITEST_MAX_WORKERS=4 pnpm exec vitest run <文件> -t <名字>`，在 `packages/mcp/mcp` 下），不跑成员全量。TLC 经 `node scripts/with-test-slot.mjs` 取名额，`FORMAL_WORKERS=4`，环境变量 `JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`，jar 是 `/opt/tlaplus/tla2tools.jar`（v1.7.4）。不跑 `admission`、仓库全量测试与差分变异。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r3.md
- fix3 的规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call-fix3.md
- fix3 的交回：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-call-fix3.md
- fix3 的变异副本与驱动（可复用）：`/tmp/w3-call-fix3-mut`，用例表 `mutations/logs-final/table.json`
- 必须加载：asd-ste100

## 当前认知
- 已确认：fix3 交回 head `deb5a977e`，派发者核过结构声明与甲的两半，接受。
- 已确认：派发者改正 `035ac8fee`：refresh 的出口与调用口同序，调用方中止先于关停；新用例先红后绿；MC-7 句子已改。
- 已确认：fix3 交回第 5 节已查清 B N4：关停汇合拆除，只有清单标记可以晚于 `closeAll`；SPEC「所有权」已按此改，本闭包不再动 N4。
- 未知：F11–F13 的变异原文在 `035ac8fee` 上是否仍能原样构造。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；变异表；TLC 读数；逐条位置；未覆盖项。

## 已知会受影响的现有用例
- `tests/invoke.spec.ts` 只改标题字符串。

## 停止条件
- 某条文档要求与最终 head 的代码行为不符，而改代码在范围外。
- 某条变异在副本上无法构造。
- `Calls.tla` 改注释后某个配置的判读与预期不符。

## 追加记录
- 2026-11-06 06:26 派发前：基线填为派发者改正之后的 `035ac8fee`（已推送），树干净。简报检查退出 0；191 条 `caller-outside-scope` 是全仓同名标识符匹配，本闭包除 `Calls.tla` 注释与 `invoke.spec.ts` 标题外不改代码。按负责人 2026-11-06 的范围原则：只做列出的事，不加别的改进。

## 接受（派发者，2026-11-06 07:31 UTC）
- 交回存档：`delegate/handbacks/w3-mcp-call-docs3.md`。三个提交 `3bae29870`、`4aae0f5a0`、`a9ddf6742` 只改文档、`Calls.tla` 注释与 `invoke.spec.ts` 标题，作者与 trailer 读回无误。
- F8 构造不出来：成立，检查已删，等价。
- F16、F17 存活：成立，是这次交回最重要的发现。派发者补一条逐微任务落下关停的扫描用例（`d966e05c1`），两个变异在其上分别于 k=40、k=45 变红（`tmp/closures/w3-mcp-call/owner-scan/`）。
- 接受。之后派发者另做值树深判（`44a218fec`），不属本闭包。
