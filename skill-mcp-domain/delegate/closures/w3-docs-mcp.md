# 闭包规格 w3-docs-mcp

## 身份与位置
- 闭包：w3-docs-mcp
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-mcp
- 分支：PanQiWei/skill-mcp-w3-docs-mcp
- 基线：3289bee2ffa4b4711ad473c3d6112573317717f2
- 清晰度：界

W3 波末的 MCP 组页、领域页、组入口与成员 README 写回（W3-E 第一项）。条目、目标位置与依据都在分类表 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/writeback-triage.md`，卡拥有者的裁定在同一文件末节「卡拥有者裁定」。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。policy_version 947.1。理由：条目与裁定都已定的文档写回，不改代码；另有一次按契约裁定的 grep 核对。

## 目标边界
目标：MCP 组页与它的同源页写成现行契约与成员 SPEC 的样子；成员 README 只留用法、装配与链接；成员 SPEC 的组设计钉移到写回之后的组页提交。只做分类表里属于 MCP 的条目与下面第 3 条的核对，不加别的改进。

### 已定的事（不重新裁定）
1. **条目。** 分类表中目标在 MCP 一侧的 A 类行：TP-4、GM-5、W-4、W-6、W-7、W-8、TP-5；B 类按末节裁定：W-5（候选一）、W-9（候选二）、W-10（不写）、TP-pins-M（候选一）、W-11（候选二）。按表后「同一处被几条来源点到」的合并写法，同一处只改一次。
2. **清单外的同源页并入**：`packages/mcp/docs/key-flows.md`（表末「清单外的同源页」第二条）随同一批条目改。
3. **G1–G8 的取代核对**（末节裁定第一条）：对组页没有逐行核对的各节（「调用结果」「内容交付」「设置声明」及分类表「核对的边界」列出的已核区域以外的节），按契约 `packages/mcp/mcp-contract/SPEC.md` 的裁定第 1–31 条与 S、R、O、D、C、T 条款 grep 一遍。属于同一类陈旧文字（组页的说法已被契约条款取代）的照改，并在交回里逐条列出；属于新的语义分歧（组页的规则与契约不同，且看不出哪边是应然）的不改，停在那一条，交回里列出，其余条目照做。
4. **钉。** `packages/mcp/mcp/SPEC.md` 第 10 行、`packages/mcp/mcp-contract/SPEC.md` 第 11 行、`packages/mcp/mcp-host-local/SPEC.md` 第 10 行的组设计钉改为本闭包写回组页的那个提交。先提交组页与同源页，再在下一个提交里改钉。
5. **口名。** W-9 候选二：口名不动；每个操作写出所在的服务（`ActionInvoker` 的任务四操作，`Connections` 的 `release` 与 `closeAll`，`EndpointStatus`）；`#### 状态口` 小节的标题或首句与应用服务表、契约 R7 一致；成员 README 的「连接口」改回表里的叫法。
6. **行号只作指引。** 按文字定位。

### 写范围
- `packages/mcp/docs/architecture.md` — 第 1、3、5 条
- `packages/mcp/docs/key-flows.md` — 第 2 条
- `packages/mcp/README.md` — W-5、W-6 的状态句、版本句与图注
- `packages/mcp/mcp/README.md` — TP-5、W-9、W-11
- `packages/mcp/mcp/README_ZH.md` — TP-5、W-9、W-11
- `docs/domains/mcp/architecture.md` — W-6 的状态句
- `packages/mcp/mcp/SPEC.md` — 只改第 10 行的钉（第 4 条）
- `packages/mcp/mcp-contract/SPEC.md` — 只改第 11 行的钉（第 4 条）
- `packages/mcp/mcp-host-local/SPEC.md` — 只改第 10 行的钉（第 4 条）

### 排除的调用方
- 所有 `src/` 与 `tests/` 下的代码：本闭包不改行为。
- 三份 MCP 成员 SPEC 除钉以外的内容：`packages/mcp/mcp-host-local/SPEC.md` 的「组合与验证」一节由 `w3-mcp-e2e` 在另一棵树改。
- `packages/skills/` 与 `docs/domains/skills/`：归 `w3-docs-skill`。
- 组页承接缺口表的 Cordis 行（分类表 CP-Cordis，D 类）：归 W4-4。

## 验收清单
1. 每个条目编号写「已改」与改后的位置；合并处写合并了哪些编号；W-10 写「按裁定不写」。
2. 第 3 条：列出 grep 的每个契约裁定与条款、在组页命中的位置、处置（照改、无冲突、或停下并说明分歧）。
3. 改后用 `grep` 证明旧说法已不在目标页（例如 `createMcpCore` 不在组页与组入口；成员 README 里没有连接表内部模块的机制复述与模块清单）。
4. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希。
5. `git diff --name-only 3289bee2f..HEAD` 只含写范围内的文件；三份 SPEC 的 diff 只有钉的那一行。
6. 第 4 条的钉指向本闭包的组页提交；交回写出两个提交号。

## 实施规格
- 中文按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。
- 组页写规则，成员 SPEC 写机制；组页不出现成员内部模块名。
- 只写现状与依据，不写评审轮次与过程。

## 性质及证据义务
- 本闭包不改行为，没有变异义务。每条改写依据的契约或成员 SPEC 条款写进交回。

## 施工计划
1. 读分类表全文与末节裁定。
2. 第 1、2、5 条逐处改；提交一次。
3. 第 3 条的核对与照改；可与上一步合成一次提交，或单独提交。
4. 钉；单独提交。
5. 门禁、交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行仓库文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-mcp。并行的有 `w3-docs-skill`（另一棵树）与 `w3-mcp-e2e`（另一棵树，写 `mcp-host-local` 的用例与 SPEC 的「组合与验证」）。不跑测试、`admission` 与差分变异。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-docs-mcp/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 条目与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/writeback-triage.md
- 差距账本原文：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/gaps-mcp.md
- 契约：`packages/mcp/mcp-contract/SPEC.md`（裁定两节与 S、R、O、D、C、T 条款）
- 必须加载：asd-ste100

## 当前认知
- 已确认：分类表的条目在基线上核过；组页只核对了「核对的边界」列出的区域。
- 未知：其余各节有多少陈旧文字。

## 返回与恢复
提交号；验收各条的命令、结果、输出尾部与日志哈希；逐条位置；第 3 条的核对表；停下没改的语义分歧；未覆盖项。

## 已知会受影响的现有用例
- 无。

## 停止条件
- 第 3 条遇到新的语义分歧：只停那一条，其余照做，交回列出。
- 需要改写范围外的文件。

## 追加记录
- 2026-11-06 09:59 派发前：分类表 39 行，MCP 一侧 A 类 7 行、B 类 5 行；卡拥有者裁定写在分类表末节（G1–G8 选候选二，所以加第 3 条核对）。
