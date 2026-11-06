# 闭包规格 w3-mcp-host-formal3

## 身份与位置
- 闭包：w3-mcp-host-formal3
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal3
- 分支：PanQiWei/skill-mcp-w3-mcp-host-formal3
- 基线：720a5d08adb270c0b652d84fc25a29242b6bc03e
- 清晰度：定

`w3-mcp-host` 第 3 轮评审之后的 TLA+ 模型增补。设计与实践评审发现：会话结束（T8 S07）之后，授权中的请求仍被写上线路（阻断 B1）；表达评审发现：线路级断开对授权中请求的结局，契约没有按相写（NB-1）。卡拥有者裁定线路级断开按相结算，与 `signal`、`close()` 同形。现行模型没有线路断开的动作，所以 B1 这一类缺陷模型看不到。评审与处置在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md`（C「阻断」与 B NB-1 及各自的处置）。代码与探索器由并行的 `w3-mcp-host-fix3` 在另一棵树改。

## 模型与推理强度
developer，implementation_kind verification，Claude Opus 5.5（claude-opus-5-5），effort high。策略解析（`policy_version` 947.1，`policy_revision` `0fe161ac874e0b53`，角色源 `c0a49e85629301ba`，宿主 Claude Code）：`--work-kind verification --risk cross-process-faults` 给出 Fable 5.1 xhigh。偏离与理由：负责人定的 Fable 档位上限是 high；本闭包是在已有、已验证的模块上加一类动作与对应断言，规则已裁定，有效动作的变异做验收，默认档足够；同时派出的 `w3-mcp-host-fix3` 用 Fable high，两个 Fable 写者并跑在 2026-11-05 约 19:47 撞过 5 小时额度。不降到经济档，因为线路断开是跨进程故障。

## 目标边界
目标：`TransportSession.tla` 表达线路级断开，并按相结算；V4、V6 的断言覆盖断开；每条受影响的不变式能被有效动作的变异打红。本闭包不改 `src/` 与 `tests/`。

### 已定的事（不重新裁定）
1. **线路级断开的结局**：断开的原因有流断开、进程退出、旧 HTTP+SSE 共用流结束、会话结束。授权中的请求答「未发出：`connection-unavailable`」；授权发现中的保持 `authorization-required`（先到者定）。已交给线路的请求：前三种原因按原因答 `no-answer`；会话结束只对触发它的那个请求答「未发出：`session-ended`」，其余已交给线路的请求不受影响（各自的应答照常决定），之后的新请求答「未发出：`connection-unavailable`」。
2. **断开之后不再写线路**：任何请求在断开之后都不交给线路，也不再调用凭据句柄的 `authorize`。
3. **V6 的断言**：断开那一刻记下每个在途请求所处的相，断言它的答复与相对应（与 `signal`、`close()` 的写法同式）；V4：断开之后调用方能看到的等待都放开，凭据句柄与元数据取回可以一直挂着。不允许用只在缺陷分支里置位的标志。
4. **负控**：有效动作的变异至少两个：断开时不结算授权中的请求（对应 B1，会话结束时提前返回）；断开时把授权中的请求答成 `no-answer`。各自让正控配置变红。缺陷注入的 `bad-*` 加一个 B1 形状的配置（会话结束之后授权放行的请求仍交给线路）。

### 写范围
- `packages/mcp/mcp-host-local/verification/models/` — 模块、配置、`run.py`、`README.md`、`index.md`
- `tmp/closures/w3-mcp-host-formal3/`（新建） — TLC 日志、变异日志

### 排除的调用方
- `packages/mcp/mcp-host-local/src/`、`tests/`（含 `tests/model/`）、`SPEC.md`、`verification/README.md`、契约：`w3-mcp-host-fix3` 改代码与探索器；SPEC「性质与证据」与 `verification/README.md` 的 TLA 部分由之后的 `w3-mcp-host-docs3` 按你的交回写。
- 动作映射里与代码名字有关的行：按目标结构写（断开、按相结算），写明「名字以 `w3-mcp-host-fix3` 交回为准」。

## 验收清单
每条写命令、预期与结果，输出尾部与日志的 SHA-256 前 16 位写进交回。

1. `run.py` 的全部正控通过，原有负控照旧变红；新配置写明状态数、深度与时长。
2. `run.py --mutations` 的原有 14 个有效动作变异照旧各让目标不变式变红；第 4 条的两个新变异各让某个正控配置变红。交回一张表：变异 → 变红的不变式 → 配置 → TLC 输出摘录。
3. 新的 `bad-*`（B1 形状）找到反例，反例的最短轨迹写进交回。
4. `pnpm run check:docs`、`check:design`、`format:check` 退出 0。

## 实施规格
- 工具链：`/opt/tlaplus/tla2tools.jar`（v1.7.4），`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`；非登录 shell 要显式 export。运行方式沿用 `verification/models/README.md` 与 `run.py`。TLC 不超过 4 个工作线程。
- 状态空间：每个配置单机几分钟内跑完；扩大范围写清每个配置的状态数与时长。
- 模块里的名字由你定，写进交回。

## 性质及证据义务
- 每条受影响的不变式能被有效动作的变异打红；没有只在缺陷分支置位的标志。
- 模型与代码的对应只在动作映射里声明，范围与抽象写清，不写成证明。

## 施工计划
1. 读两处处置、现有模块与配置；先跑一遍 `run.py` 与 `run.py --mutations`，记基线读数。
2. 加断开动作，按第 1、2 条结算；V4、V6 覆盖断开。
3. 新变异与新 `bad-*`。
4. `models/README.md` 与 `index.md`；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。每完成一个能跑通 TLC 的阶段就提交。

## 自主范围与动作授权
允许：写范围内改文件；运行 TLC 与 `run.py`、仓库文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal3。并行的有 `w3-mcp-host-fix3`（host 树，跑成员测试与探索器）与调用口的表达闭包（调用口树）。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal3/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审与处置：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md
- 上一轮形式化的规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host-formal2.md
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 T5、T8（S01–S04、S07、SSE 段）
- 必须加载：verification-facility；写文档时 asd-ste100

## 当前认知
- 已确认：现行模块有 `Signal`、`Close` 的按相结算与调用方状态 `cw`，没有线路断开的动作。
- 已确认：C 的探针 `session-ended.mts` 在基线上复现 B1（会话结束之后授权放行的 `tools/call` 上了线路，`call` 交出 `SentCall`）。
- 未知：加入断开动作之后的状态空间大小。

## 返回与恢复
每个提交号；正控与负控的判读表；验收第 2 条的变异表；第 3 条的反例轨迹；模块里的名字；自定裁定与理由；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host-formal3/`。

## 已知会受影响的现有用例
- 没有用例改动：本闭包不改 `tests/`。
- `verification/models/` 的现有配置：`valid-*` 照旧通过，`bad-*` 照旧变红；改了名字的在交回里列出新旧名。

## 停止条件
- 某条性质在任何抽象下都写不成可被有效动作打红的断言。
- 状态空间在单机上跑不完，而缩小范围会丢掉第 1–4 条要的区分。
- 规格要求与契约条款冲突。

## 追加记录
- 2026-11-06 02:56 派发前：`prepare-closures --base 720a5d08a` 建好工作树（install、projections 成功）。简报检查退出 0；`caller-outside-scope` 警告数以十万计，来自 `send`、`close`、`call` 一类常见标识符在全仓的同名匹配，不是本闭包的调用方；写范围只在 `verification/models/`，没有代码调用方。
- 2026-11-06 03:21 交回之后追加（续用原写者，同一闭包的补做）：卡拥有者裁定线路断开不动授权发现中的请求（`reviews/mcp-host-r3.md`「卡拥有者裁定（03:21 UTC，formal3 交回引出）」）。规格第 1 条「授权发现中的保持 `authorization-required`（先到者定）」指不被断开结算、发现做完照常结束；第 3 条「断开之后调用方的等待都放开」只对授权中与已交给线路的请求成立，措辞不一致是规格的缺陷（归属：规格）。要求：`LineGone`、`SessionEnded` 不切 `disc`；`V4_DeadBounded` 只断言依赖线路的两相；`V4-gone-leaves-discovery` 换成「断开结算了发现中的请求」的有效动作变异，由 `deadOut` 快照在 V6 上变红；README 的结算规则同步；重跑 `run.py` 与 `--mutations`，交回新读数。待定项 (a) 采纳：`V2_NoWireAfterDead` 留在 V2 名下，定理句由 docs3 扩写。
- 2026-11-06 03:26 交回核对（第二次交回 `09d552661`）：4 个提交，8 个文件全在 `verification/models/`；作者、提交者与 trailer 正确，树干净。读 `DeadSettles`：`disc` 给 `"none"`，不被断开结算；`V4_DeadBounded` 断言断开之后没有授权中的项、线路断开之后没有已交给线路的项、已结算的调用方不再等，与 03:21 裁定一致。派发者在分支头经运行名额复跑：`run.py` 13 份配置全部符合判读（`/tmp/owner-formal3/run.log` `579afe1c201a33e5`），`--mutations` 22 个全部符合判读（`429892b1927418ca`）；变红时的状态数与写者略有差异，是 4 线程 TLC 在第一个反例处停下所致。自裁 2–8 采纳，待定项 (a) 采纳。待合：host 树上 `w3-mcp-host-fix3` 在写，交回之后先合 fix3 再合本分支（写范围不相交）；交给 docs3 的事项见交回第 7、10 节（第 10 节里「discovery 当场答 authorization-required」按第 7 节改为「不动」）。
