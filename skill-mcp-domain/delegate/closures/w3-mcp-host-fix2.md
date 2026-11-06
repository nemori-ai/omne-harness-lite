# 闭包规格 w3-mcp-host-fix2

## 身份与位置
- 闭包：w3-mcp-host-fix2
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：db06b5b701cccefa51c9bf7e5bcf70267c8c51a7
- 清晰度：定

`w3-mcp-host` 第 2 轮评审之后的修复轮（PR #1138）。第 2 轮的阻断与第 1 轮是同一类（等待点不受 `signal` 与关闭管辖），所以这一轮不逐点补洞，按卡拥有者的结构根因诊断改结构。诊断、全部裁定与五面报告在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md`：「结构根因诊断」一节的目标结构第 1–8 条与「卡拥有者的裁定」里标「改」的代码与契约项，是本闭包的施工依据。并行的 `w3-mcp-host-formal2` 在另一棵树改 TLA+ 模型、成员 SPEC「性质与证据」一节与 `verification/` 的模型部分，不要碰它的文件。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：两轮同类阻断后的结构重做；取消、关闭与凭据句柄的并发次序（策略 `cross-process-faults`、`security-sensitive`，`top_risks` 并发与收尾时机）→ 顶档。第 1 轮修复已经是顶档，升级落在诊断上，不在模型上；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：让调用方能看到的每一个 promise 在 `signal` 触发或 `close()` 之后结算，凭据句柄、元数据取回、线路或对端挂起都不改变这一点；做法是让调用方只跟着结算走，工作流成为会话拥有的后台工作。同时把线路的写状态做成数据，把形式守护改到调用方一层，并收掉评审指出的规则重复。

### 已定的事（不重新裁定）
1. **每一相的结算**（诊断第 1 条，B B1，修订第 1 轮一条规则）：`signal` 与 `close()` 当场同步按相结算：
   - 已登记、尚未交给线路（授权中）：`not-sent`（`connection-unavailable`）。`signal` 与 `close()` 同答。
   - 已交给线路：`no-answer`（`abandoned`）；`call` 交 `SentCall`，`answer` 以它兑现。
   - 授权发现中：`not-sent`（`authorization-required`），发现按当时已取到的内容交出，没取到的地址按 R4 是 `unavailable`。`close()` 不再等发现结束。
2. **调用方只等结算**（诊断第 2 条，C 非阻断 5）：读写类操作与 `discover` 的探测等在途项的结算；`call` 等「出发点」：线路收下请求（stdio 写完、HTTP 2xx 应答流开始）或在途项结算，二者先到者；结算为 `not-sent` 时交失败，否则交 `SentCall`。删掉对 `deferred.value` 与 `phase` 的同步窥视；`Deferred` 不再暴露可变状态。
3. **工作流是后台工作**（诊断第 3 条，C 非阻断 6）：授权 → 组成 → 写出、拒绝报告 → 元数据取回、答复对端请求、通知，都经一个入口启动：意外的 reject 按相转成结算；每次调用凭据句柄之前同步核传输可用（V2）；结算之后的结果丢弃。
4. **没有在途项的等待**（诊断第 4 条）：`cancelRequest` 的通知交给后台工作流后当即返回（T5：`cancelRequest` 不证明对端已停止）。`discover` 旧一路的回退 GET 经一个辅助在 `closing.signal` 下等授权与端口，到期即收场。
5. **`close()`**（诊断第 5 条）：标记关闭，按相同步结算全部在途项，中止各控制器与 `closing`，然后只等线路的 `close()`。
6. **线路的写状态**（诊断第 6 条，C B1）：`StdioLine` 的在途写是计数或集合；`close()` 时有在途写就中止写端，否则关闭写端。HTTP 线路按同一规则核一遍。
7. **连接模式**（C 非阻断 5）：`version`、`legacy`、`sse`、`session` 四个字段改成一个判别联合（现代；旧 Streamable HTTP，带可选会话号；旧 HTTP+SSE）。`Dispatch` 不再是可选字段袋。
8. **一条规则一处实现，在契约**（C 非阻断 1、2、7、9）：
   - 退出窗口的规则与流断开时在途请求的结论由契约导出，会话不再手写（`die`、`causeOfEnded`）。
   - `call` 的参数与值的组成、`tools/call` 的 `progressToken`、读类再发一次的规则、清单是否核 SEP-2243 头、`cancelRequest` 走通知还是中止、四个任务请求的组成，各一处实现在契约，会话与脚本化传输共用；「旧修订」只有一个定义。
   - 契约导出线上上限，`src/authorization.ts` 与 `src/limits.ts` 改用它。
   - `discoverAuthorization` 移到契约 `src/authorization.ts`；契约 `src/decisions.ts` 按四组拆开：T8 结论、已结算应答的读法、写法与组成、带端口的编排。纯移动单独提交。
9. **契约条款**（B B1、NB4、NB5、NB10，调用口第 2 轮 B R2-7）：
   - T5：「已登记、尚未交给线路」一相上 `signal` 或 `close()` 答 `not-sent`（`connection-unavailable`）；交给线路之后 `signal` 触发，`call` 交 `SentCall`、`answer` 以 `no-answer`（`abandoned`）兑现；两种情形 `call` 都在信号触发后结算，不等凭据句柄或对端。授权发现中按第 1 条。
   - T5：`close()` 不要求发 DELETE（不是禁止）；成员不发，登记为对协议 SHOULD 的偏离。理由与未覆盖两处同一情态。
   - T9 或 R4：元数据取回不经凭据句柄、不带凭据头。成员自定 9 改为兑现这一句。
   - 「真实传输兑现时的裁定」登记第 1 轮之后的改动：T8 决策层的根导出、T3 按原词形写出、T5 按传输释放交换、T9 答复对端的 POST 也授权，以及本轮的 T5 结局、元数据句；删改「唯一的行为改动」一句。
10. **形式守护：探索器**（诊断第 7 条）：V4 改为观察调用方的 promise（各操作的结果、`call` 的 `answer` 与 `close()`）：`signal` 触发或 `close()` 之后，在静止点它们都已结算，凭据句柄、元数据取回与线路可以一直挂着。端口模型给 `credential.authorize`、`credential.reportRejection` 与 `fetchMetadata` 加「挂起」；删掉 `authorizing` 相的豁免。V6 按第 1 条。探索器的变异做法入库（`tests/` 下可复跑），不依赖 tmp 里的脚本（B NB11）。原有场景零违例；每条性质的负控照旧变红，并加一个新负控「调用方跟着工作流等」，让 V4 变红。「`StdioLine` 的计数改回布尔」不归探索器，见第 11 条。
11. **线路的用例**：`StdioLine` 两个重叠写、先完成一个、再 `close()`：`close()` 当即返回并中止写端；「计数改回布尔」的变异让它变红。
12. **未处理拒绝的守卫**（C 设计问题 2）：`tests/unhandled.ts` 改为 `vitest.config.ts` 的 setup 文件，六个用例文件里的调用删掉；`tests/README.md` 的登记同步。
13. **SPEC 的行为各节**：「端口失败模型」删去凭据句柄的豁免，换成承诺句：没有 `signal` 的操作（`discover`、`listActions`、任务操作）只由 `close()` 放开；没有 `close()` 时，挂起的句柄由它的持有者负责。「取消」「关闭」两段按第 1 条改写（含 `:176` 的总括句）。H4、H6、H8（B NB9：首句改为「只有 2xx 正文越界是流断开」）、自定 9、偏离表（B NB8：受影响的行补 I06、O06；DELETE 偏离一行）同步。「性质与证据」一节归 `w3-mcp-host-formal2`，本闭包不改。

### 写范围
- `packages/mcp/mcp-host-local/src/` — 会话、线路、授权、上限
- `packages/mcp/mcp-host-local/tests/` — 新用例、守卫、探索器（`tests/model/`）、探索器变异的入库做法
- `packages/mcp/mcp-host-local/vitest.config.ts` — 第 12 条的 setup 文件
- `packages/mcp/mcp-host-local/SPEC.md` — 「性质与证据」以外的各节
- `packages/mcp/mcp-contract/src/` — 第 8 条的规则、脚本化传输共用规则、导出
- `packages/mcp/mcp-contract/tests/` — 第 8 条的用例与导出集合
- `packages/mcp/mcp-contract/SPEC.md` — 第 9 条的 T5、T9 或 R4、「真实传输兑现时的裁定」；第 8 条新增导出的登记
- `packages/mcp/mcp-contract/docs/public-api.md` — 第 8 条新增与移动的导出
- `tmp/closures/w3-mcp-host/fix2/`（新建） — 红灯、探索器日志、门禁输出、手工变异日志

### 排除的调用方
- `packages/mcp/mcp-host-local/verification/`、成员 SPEC「性质与证据」一节：`w3-mcp-host-formal2` 在改。探索器的运行记录写在交回里，由派发者转给后面的表达与证据闭包。
- `packages/mcp/mcp-host-local/README.md`、`README_ZH.md`、`docs/`、`index.md`：后面的表达与证据闭包改。你改了的行为让这些文件的句子过时，在交回里列出位置。
- `packages/mcp/mcp/`：调用口在另一棵树修复。契约改动不改调用口依赖的公开形状；你移动或改名了契约根导出，在交回里列出，并核对 `packages/mcp/mcp/src` 与 `tests` 没有用到（`git grep`）。
- 锁文件与依赖段。

## 验收清单
每条写命令、预期与结果，输出尾部与日志的 SHA-256 前 16 位写进交回。失败时先在基线上复跑同一检查。本包用例经包名导入 `dist`：在副本上做变异要重建，或用 `node --conditions=source` 直接跑 `src`。

1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` 退出 0；`pnpm --filter @omne-harness/mcp-host-local run test:slow` 退出 0，日志带退出码一行。
2. 下列每项有一条用例，在基线 `db06b5b70` 上变红、在交回的 head 上变绿；红灯输出存 `tmp/closures/w3-mcp-host/fix2/red/`：
   - `authorize` 永不答复：`call()` 之后触发 `signal`，`call` 在几轮之内答 `not-sent`（`connection-unavailable`）（C 的探针 authz）
   - `authorize` 永不答复：`listActions()` 之后 `close()`，`listActions` 答 `not-sent`，`close()` 返回（同一探针）
   - 授权中触发 `signal`：答 `not-sent`，不交 `SentCall`（B B1；`session.spec.ts:1330` 随裁定改写）
   - `reportRejection` 永不答复：401 之后 `close()` 当即返回，请求答 `not-sent`（`authorization-required`）；同样情形下触发调用方的 `signal`，`call` 结算
   - `authorize` 永不答复：`cancelRequest` 在 stdio 或旧修订上当即返回
   - `authorize` 永不答复：`discover` 走到旧一路的回退 GET 时 `close()`，`discover` 结算
   - `StdioLine` 两个重叠写、先完成一个、再 `close()`：`close()` 当即返回（C 的探针 writing）
3. 探索器：V4 观察调用方一层、凭据与取回端口能挂起之后，在基线的会话上至少有一个场景报 V4（给出签名与最短调度），在交回的 head 上全部场景零违例；负控「调用方跟着工作流等」变红；原有负控照旧变红。日志存 `tmp/closures/w3-mcp-host/fix2/model/`。
4. 结构：会话的公开方法里没有 `await this.send(` 一类等工作流的写法，`call` 不读 `deferred.value`、`phase`；`close()` 不等工作流；`StdioLine` 没有布尔的写标志。附 `grep` 命令与输出，并用一两句说明每条怎样成立。
5. 契约：第 8 条的每条规则只有一处实现（附 `grep`）；脚本化传输与会话都调用它；契约原有用例在不改断言的前提下通过（导出集合按新增改写；纯移动的提交 `git diff --color-moved=zebra` 只有移动）。
6. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 退出 0；`git ls-files --eol | grep -c w/crlf` 为 0。每项输出尾部一两行与日志哈希写进交回。
7. `src/`（两个成员）无 `as`（`as const` 除外）、无 `any`、无非空断言；产品源码不导入 `@modelcontextprotocol/*`。附命令与输出。
8. `pnpm run metrics --coverage --base 92a8e3cdf` 退出 0；改动的函数不新增超 alert 的；会话的公开方法、工作流入口、`close`、`StdioLine.send`/`close` 写读数。

## 实施规格
- 先做纯移动与纯整理（第 7、8 条里不改行为的部分），原有用例原样通过就提交；再做第 1–6 条的结构（先写第 2 条的红灯用例）；再做探索器与线路用例（第 10、11 条）；最后契约条款与 SPEC（第 9、13 条）。
- 工作流入口、出发点、连接模式与契约新导出的名字由你定，写进交回的命名账本。
- 探索器沿用本成员现有引擎，不从 `packages/mcp/mcp/tests/` 导入；抽共用设施是波末的另一张卡。

## 性质及证据义务
- 调用方能看到的每一个 promise 在 `signal` 或 `close()` 之后结算；由探索器的新 V4 与第 2 条用例守护。
- 关闭之后不再调用凭据句柄（V2）；拒绝至多一次、只对授权过的请求（V3）；不代调用方重发（V5）：原有用例与探索器负控照旧。
- 凭据不外泄：头只进出站请求；元数据取回不带凭据头（新增断言）。
- 并发用 deferred 或 `reached` 排次序，不用 `settled()` 代替「已经到达」。

## 施工计划
1. 读诊断与裁定全文、C 的两个探针（`mcp-host-r2-probes-c/`），写第 2 条的红灯用例，提交一次。
2. 纯移动与纯整理（契约 `decisions.ts` 拆分、`discoverAuthorization` 移动、上限导出、连接模式联合），每步原有用例通过就提交。
3. 会话结构（第 1–5 条）与线路（第 6 条），先红后绿。
4. 规则归契约（第 8 条其余部分）。
5. 探索器（第 10 条）、线路用例（第 11 条）、守卫（第 12 条）。
6. 契约条款与 SPEC（第 9、13 条）；门禁、度量、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行三个 MCP 成员的构建与测试（含慢层）、探索器、仓库检查、度量；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖、改契约第 9 条以外的条款含义。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。并行的有 `w3-mcp-host-formal2`（另一棵树，TLC 吃 CPU）与 `w3-mcp-call-fix2`（另一棵树）。成员测试用 `VITEST_MAX_WORKERS=4`；慢层与探索器单独跑，不与成员测试叠加。不跑 `admission`、不跑仓库全量测试、不跑差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 诊断、裁定与评审：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md
- 第 1 轮记录与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md
- 上一轮修复规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host-fix1.md
- 探针：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2-probes-c/`（`authz.mts`、`writing.mts`，在包目录用 `node --conditions=source` 运行）
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 T1–T9、R4、「真实传输兑现时的裁定」
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100

## 当前认知
- 已确认：C 的两个探针在基线上复现；B 读出模型（`Signal` 对授权中答 `notSent`）与代码（`abandon` 对授权中答 `abandoned`）不一致。
- 已确认：探索器端口模型里凭据句柄只有 `ok`、`fail`、`reject`，没有挂起；`properties.ts:154-160` 排除了 `authorizing` 相。
- 已确认：契约根的 `MetadataFetch` 不带头。
- 未知：HTTP 线路在 `close()` 时对在途写与 `openGet` 的处理是否另有同类缺口（第 6 条要求核一遍）。

## 返回与恢复
每个提交号；每条验收的命令、结果、输出尾部与日志哈希；第 2 条每项的「用例 → 缺陷 → 变红证据」；第 3 条的探索器读数（基线上的签名与最短调度，交回 head 上的场景数与零违例）；第 4、5 条的 `grep` 输出；命名账本；移动或改名的契约导出；自定裁定与理由；写者声称的结构性改动清单（派发者逐条 `grep` 核实）；让排除文件里的句子过时的位置；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host/fix2/`。

## 已知会受影响的现有用例
- `tests/session.spec.ts:1330-1348`：授权中 `signal` 的断言随裁定改为 `not-sent`。
- `tests/session.spec.ts:1148` 一带：`close()` 之后先 `release()` 闸门的写法，改为不放闸门也能结算。
- `close()` 等授权发现结束的用例：改为当场结算。
- 六个用例文件里 `failOnUnhandledErrors()` 的调用：改为 setup 文件后删掉。
- 契约 `tests/` 里引用被移动函数路径的用例：只改导入。

## 停止条件
- 某项要求只能靠改排除范围内的文件实现。
- 已定的事与契约条款冲突，或在任何实现下都兑现不了。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-05 19:02 派发前（A 交回后补入，下列三条与已定的事同等效力）：
  14. **线路分支的用例**（A 非阻断 2）：`StdioLine` 跨块、尚未换行就超过上界（读缓冲不再增长、流断开）；写被 reject 答 `unsent`（X02）；EOF 处没有换行的尾行照样投递。各一条用例，并各给一个让它变红的变异。
  15. **超线项**（A 非阻断 3）：`Session.dispatch` 随结构重做；契约 `classifyWireEvent`（CC 18）按事件种类拆成一张表或各自的函数；其余超 warn 的函数在交回里逐条写处置。`session.ts:445` 的不可达分支随重做消失。
  16. **`close()` 单飞**（A 观察）：重复调用 `close()` 拿到同一次关闭的结果，都在线路的 `close()` 答复之后返回；补一条两个调用方同时 `close()` 的用例。
  A 的探针（真实子进程的 Q1 与 Q2，含 `reportRejection` 挂起时 `close()` 挂住的 Q2b）在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2-probes-a/`，与 C 的探针一起用来写验收第 2 条的红灯用例。
- 2026-11-05 19:03 派发前（19:04 派出）：简报检查退出 0。`caller-outside-scope` 警告数以万计，来自 `send`、`close`、`call`、`authorize` 一类常见标识符在全仓的同名匹配（检查器按名字匹配），不是本闭包的调用方；写范围外真正的调用方只有 `packages/mcp/mcp`（依赖契约的公开导出），已在「排除的调用方」写明。
- 2026-11-06 01:15 续派：写者 2026-11-05 约 19:47 起被宿主 429 限流中断（5 小时额度到顶）。工作树事实：4 个提交（`75809c54c` 红灯与探索器新 V4、`9ae28f6e6` 纯移动、`f856c8f55` 规则归契约、`cd605e85f` 会话按结算重做与线路写计数）；未提交：契约 SPEC、`session.ts`、`tests/model/explore.ts` 的改动与新文件 `tests/model/mutants.ts`、`mutate.ts`；`tmp/closures/w3-mcp-host/fix2/` 最新目录 `mutants`（19:47）。中断时的最后一句：「三条用例在 `cancelRequest` 当即返回之后要 `untilSent`，关闭与发现次序的用例按新规则改」。额度恢复后续用原写者（理由同调用口）。另告知：`w3-mcp-host-formal2` 已交回并经派发者复跑通过（`0caa8b577`），它改了 SPEC「性质与证据」与 `verification/`；本闭包交回后由派发者合入，你不碰那些文件。
- 2026-11-06 01:47 交回（head `0695f2ba4`，7 个提交；交回全文存 `delegate/handbacks/w3-mcp-host-fix2.md`）。派发者核对：树干净；改动全在两个成员的写范围内（契约 `src`、`tests`、`SPEC.md`、`docs/public-api.md`；成员 `src`、`tests`、`SPEC.md`、`vitest.config.ts`）；没有碰 `verification/`、README 与 `docs/`。成员 SPEC 在「性质与证据」节里有一处改动，是格式化工具重排证据表的列宽（内容不变），合 formal2 时取 formal2 的表。读过 `session.ts` 的 `work`、`stop`、`stopAnswerOf`、`callHandle`、`once`、`untilClosed`、`call`、`cancelRequest`、`close`，与目标结构一致。自裁 1–9 处置：全部采纳。1（拒绝报告与元数据取回并发）：T4 要求先调用 `reportRejection` 再交出失败，并发仍满足；取回不带凭据头（本轮 T9/R4 一句），句柄是否已获知不影响取回。5（`streamGoneAnswerOf` 收 `abandoned`）记进 K7 的 0.1.0 形状项。6（`hang` 计入违约预算、状态数变了）：探索器运行记录由表达与证据闭包重写。第 8 节列出的过时位置交表达与证据闭包。
