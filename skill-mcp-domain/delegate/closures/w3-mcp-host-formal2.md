# 闭包规格 w3-mcp-host-formal2

## 身份与位置
- 闭包：w3-mcp-host-formal2
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal2
- 分支：PanQiWei/skill-mcp-w3-mcp-host-formal2
- 基线：db06b5b701cccefa51c9bf7e5bcf70267c8c51a7
- 清晰度：界

`w3-mcp-host` 第 2 轮评审之后，TLA+ 模型与性质陈述的修复轮。第 2 轮的表达评审发现：模型里 V1、V2、V6 的不变式只在缺陷分支里置位，没有注入缺陷时恒真，正控等于没测（NB1）；设计实践评审发现：V4 量的是会话内部的结算，不是调用方的等待，凭据端口也没有挂起，所以调用方被挂住的缺陷两种证据都看不到。卡拥有者同时改了一条规则：`close()` 不再等授权发现，发现中的请求当场结算。诊断与裁定在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md`（「结构根因诊断」与「卡拥有者的裁定」两节）。代码与探索器由并行的 `w3-mcp-host-fix2` 在另一棵树改。

## 模型与推理强度
developer，implementation_kind verification，Claude Fable 5.1（claude-fable-5-1），effort high。理由：取消、关闭与凭据句柄的并发次序的形式模型（策略 `cross-process-faults`、`security-sensitive` 同类的验证设施）；上一版的不变式没有守住，需要顶档重做 → 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：让 `TransportSession.tla` 的每一条不变式都能被「有效动作的变异」打红，而不只是被缺陷分支打红；模型表达调用方的等待与挂起的凭据端口；性质陈述按卡拥有者的新裁定改写。

本闭包不改 `src/` 与 `tests/`。

### 已定的事（不重新裁定）
1. **结算规则**（模型与陈述都按它）：`signal` 与 `close()` 当场同步按相结算。已登记、尚未交给线路（授权中）：`not-sent`（`connection-unavailable`）；已交给线路：`no-answer`（`abandoned`）；授权发现中：`not-sent`（`authorization-required`），`close()` 不等发现结束。
2. **V4 量调用方一层**：调用方能看到的等待（操作的结果、`call` 的 `answer`、`close()`）在 `signal` 触发或 `close()` 之后结算；凭据句柄的 `authorize`、`reportRejection` 与元数据取回可以一直挂着。没有 `signal` 的操作只由 `close()` 放开。
3. **V1、V2、V6 改成对状态的断言**（B NB1）：例如关闭时记下每个请求所处的相，断言它的答复与相对应；凭据动作只要发生在关闭完成之后就违反 V2；一个请求的答复被改写就违反 V1。不允许用只在缺陷分支里置位的标志。
4. **负控分两类**：缺陷注入（现有 `bad-*` 的做法）之外，每条不变式至少有一个「有效动作的变异」让正控配置变红，例如把 `Close` 里授权中 → `notSent` 改成 `abandoned`，`valid-close` 必须变红。新增负控「调用方跟着工作流等」：调用方只在工作流走完时得到答复，凭据端口挂起时 V4 变红。
5. **性质陈述**：成员 SPEC「性质与证据」一节按第 1–4 条改写 V4、V6 的陈述；TLA 一列的写法与探索器一列同式（「有限范围通过（valid-*）；负控 bad-* 找到反例」，B NB2）；收回「A4 由模型承担」，两个 `close-after-line` 各起与缺陷相符的名字（B NB3）；评审轮次与卡内编号换成缺陷描述，删掉运行过程的记述（B NB11）。

### 写范围
- `packages/mcp/mcp-host-local/verification/models/` — 模块、配置、`run.py`、`README.md`、`index.md`
- `packages/mcp/mcp-host-local/verification/README.md` — TLA 部分、性质表、能变红一节；探索器部分只改与第 5 条措辞有关的句子
- `packages/mcp/mcp-host-local/SPEC.md` — 只改「性质与证据」一节
- `tmp/closures/w3-mcp-host-formal2/`（新建） — TLC 日志、变异日志

### 排除的调用方
- `packages/mcp/mcp-host-local/src/`、`tests/`（含 `tests/model/`）、SPEC 其余各节、契约：`w3-mcp-host-fix2` 在改。探索器的新 V4、新负控与运行记录由它交回，之后由表达与证据闭包写进 `verification/README.md` 的探索器部分；你在探索器部分只按第 5 条改措辞。
- 动作映射里与代码名字有关的行：按目标结构写（工作流入口、出发点、按相结算），写明「名字以 `w3-mcp-host-fix2` 交回为准」；对齐由后面的闭包做。

## 验收清单
每条写命令、预期与结果，输出尾部与日志的 SHA-256 前 16 位写进交回。

1. 正控全部通过（TLC 判读写进 `summary.json` 与交回）。
2. 每条不变式 V1–V6 都至少有一个「有效动作的变异」让某个正控配置变红；变异在模块的副本上做（或以配置常量开关、默认关闭），交回一张表：变异 → 变红的不变式 → 配置 → TLC 输出摘录。缺陷分支的 `bad-*` 照旧各自变红。
3. 新负控「调用方跟着工作流等」在凭据端口能挂起的配置下让 V4 变红。
4. 把 V1、V2、V6 的旧写法（只在缺陷分支置位的标志）套回新模型，说明为什么它们在新模型下不再恒真，或直接给出「旧写法下第 2 条的变异不变红、新写法下变红」的对照。
5. `pnpm run check:docs` 与 `check:design` 退出 0；`format:check` 退出 0。输出尾部与日志哈希写进交回。

## 实施规格
- 工具链：`/opt/tlaplus/tla2tools.jar`（v1.7.4，sha256 前缀 936a2620），`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`；非登录 shell 要显式 export。运行方式沿用 `verification/models/README.md` 与 `run.py`。
- 状态空间：配置保持在单机几分钟内跑完；扩大范围要在交回里写清每个配置的状态数与时长。
- 模块里的名字（相、调用方状态、变量）由你定，写进交回。

## 性质及证据义务
- 每条不变式能被有效动作的变异打红；没有只在缺陷分支置位的标志。
- 模型与代码的对应只在动作映射里声明，范围与抽象写清，不写成证明。

## 施工计划
1. 读诊断与裁定、B 的 NB1–NB3、现有模块与配置；先跑一遍现有正控与负控，记基线读数。
2. 调用方等待与挂起的凭据端口进模型；结算按第 1 条。
3. V1、V2、V6 改写；V4 改到调用方一层；新负控。
4. 有效动作的变异与对照（验收第 2、4 条）。
5. SPEC「性质与证据」与 `verification/` 文档；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。每完成一个能跑通 TLC 的阶段就提交。

## 自主范围与动作授权
允许：写范围内改文件；运行 TLC 与 `run.py`、仓库文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal2。并行的有 `w3-mcp-host-fix2` 与 `w3-mcp-call-fix2`（各在自己的树，跑成员测试与探索器）。TLC 用不超过 4 个工作线程。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal2/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 诊断、裁定与评审：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md（B 一节的 NB1–NB3、NB11，「结构根因诊断」与「卡拥有者的裁定」）
- 上一版形式化的规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host-formal.md
- 对照：调用口的模型 `packages/mcp/mcp/verification/models/Calls.tla` 与它的 README（写法参考，不导入）
- 必须加载：verification-facility；写文档时 asd-ste100

## 当前认知
- 已确认：`resettled`、`credAfterClose`、`closeAnswerBad` 只在缺陷分支置位（B NB1 给出行号）；模型的 `Refuse` 要求 `st = "sent"`，表达不了「`close()` 返回之后调用 `reportRejection`」。
- 已确认：模型的 `Signal(r)` 对授权中答 `notSent`，与新裁定一致；代码当前答 `abandoned`，由 `w3-mcp-host-fix2` 改。
- 未知：加入调用方状态与挂起之后的状态空间大小。

## 返回与恢复
每个提交号；正控与负控的判读表；验收第 2 条的变异表；第 4 条的对照；模块里的名字；自定裁定与理由；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host-formal2/`。

## 已知会受影响的现有用例
- 没有用例改动：本闭包不改 `tests/`。
- `verification/models/` 的现有配置：`valid-*` 照旧通过，`bad-*` 照旧变红；改了名字的（第 5 条，`close-after-line`）在交回里列出新旧名。

## 停止条件
- 某条性质在任何抽象下都写不成可被有效动作打红的断言。
- 状态空间在单机上跑不完，而缩小范围会丢掉第 1–4 条要的区分。
- 规格要求与契约条款冲突。

## 追加记录
- 2026-11-05 19:03 派发前（19:04 派出）：简报检查退出 0。`caller-outside-scope` 警告数以万计，来自 `send`、`close`、`call`、`authorize` 一类常见标识符在全仓的同名匹配（检查器按名字匹配），不是本闭包的调用方；写范围外真正的调用方只有 `packages/mcp/mcp`（依赖契约的公开导出），已在「排除的调用方」写明。
- 2026-11-05 19:35 交回核对（派发者在写者分支头 `0caa8b577` 复跑验收命令）：树干净；4 个提交，14 个文件全在写范围，SPEC 的改动只在「性质与证据」一节（两个 hunk，224–260 行）。`run.py` 全部 12 个配置符合判读（valid-close 2230 状态、深度 15；7 个缺陷注入与两个新负控各自变红），日志 `3b3abb7dcfeb22a3`；`run.py --mutations` 14 个有效动作的变异各让目标不变式变红，日志 `f1488199adf99763`（原件 `/tmp/formal2-rerun/`）。读过模块：V4 断言信号触发或关闭的那一刻调用方已放开，V6 按截断时的相映射答复，与裁定一致。写者自裁 a–j 全部采纳（b：V2 在模型里从 `closed` 起断言，比 SPEC 的「返回之后」强，`models/README.md` 已写明；f：负控改名 `close-settles-after-line`，与探索器的同名缺陷趋同）。待合：host 分支上 `w3-mcp-host-fix2` 的写者在写，交回之后先合 fix2，再合本分支；探索器一列的旧名（`mV4-close-after-line` 等）由表达与证据闭包按 fix2 的交回对齐。
