---
name: omne-card
description: 在本项目发卡、开工、进轨道、提升与接受时的步骤、命令与判据：设计段把交接信息包写成卡，交付会话照卡开工、同步轨道头、跑合入检查、开 PR、请求 gate 确认，人接受后关卡；写者在本仓库要守的门禁、不跑的检查与提交规则；L3 改动收口时逐行核的热点；main 与 stable 的提升、npm 发行与发布结果未知时的恢复。研发的方法归 pqw 技能，本技能只写本项目的命令与判据。设计段末尾要发卡、交付会话开工或准备合入、派写者或自己动手写代码、L3 改动收口、做提升或发行、负责人说「接受」「关卡」时加载。
---

# 发卡与进轨道

研发流程走 pqw `single-session-dev-flow`。本技能只补本项目在 GitHub 与轨道上的操作：做法归 pqw，命令与参数以各工具的说明为准，这里只写顺序与判据。路线、节奏、双基线与权限归集成规则 `docs/engineering/integration.md`。

开工前先进入卡给定的工作树，核对 cwd、分支、HEAD 与已有写者。不要从技能安装路径推断目标仓库。

## 卡就是交接信息包

设计段过了交接点，把 pqw 的交接信息包写成卡正文：用卡模板 `.github/ISSUE_TEMPLATE/card.md`，九节齐，`check-plan --handoff` 退出 0。卡正文就是交付会话的全部输入；会话里讨论过而没写进卡的，交付会话看不到。

现行的 `dispatch-cli` 与 `start` 还按旧卡模板（`work-item.md`、`task.md`）读卡正文。在准入的写范围检查与绑定退役之前，卡正文仍用旧模板，交接信息包贴成卡上一条标题为「交接信息包」的评论。

发卡时：

1. 卡挂到父卡与交付 Project，打 `kind:` 与 `line:` 标签，设里程碑（现行 `start` 缺任一项就拒绝）。
2. 只有人能定的事写进「只有人能定的待决」，交付会话开工时一次问齐。

## 开工

现行工具要求先登记执行记录再开工。调度者（负责人，或他在卡上委派的会话）：

1. `dispatch-cli post` 发派发评论，`dispatch-cli bind` 把绑定写进卡正文，先 `--dry-run`。参数与 spec 文件格式见 交付工具说明 `tools/dev-flow/src/delivery/README.md`「派发命令」。
2. `worktree-cli prepare --issue <卡号> --tree .worktrees/<卡>` 建工作树，进去先 `git submodule update --init`（pqw 技能集是子模块，`prepare` 不初始化它，没有它投影会报错），再全量构建并生成投影；`start` 开工，`status` 读回。见 集成工具说明 `tools/dev-flow/src/integration/README.md`。
3. `start` 核对派发评论的作者是 `publish` environment 的 reviewer。没有派发就不运行 `start`，也不手造 context。没有 context 的检出照样能跑本地检查，基线退回 `origin/main`。
4. 写范围不够时扩写范围要重新登记、换树（`worktree-cli swap`）。设计段列消费者时跑 pqw 的 `consumers.mjs`，把这一步留在设计段。

卡的当前 revision 与 attempt 和正文单写者拥有这张卡；Project 只是派生视图。

## 实施与收口

按 pqw 交付期做。收口的命令全部在根 `AGENTS.md`「pqw-skills 接入」。写代码的人，不论是主代理还是派出的写者，都守下一节的写者约定。改动的接受级别是 L3 时，收口再照 [L3 热点清单](#l3-热点清单)核一遍。

## 写者约定

### 门禁

- 门禁命令见根 `AGENTS.md`「pqw-skills 接入」的类型检查、lint、合入检查与文档检查几格；简报列了门禁时以简报为准。
- 另在工作树根跑仓库级的 `pnpm run lint:oxlint` 与 `pnpm run format:check`，准入的前几步就是这两项；只查改过的文件时，未用的导入与禁用指令可能漏掉。格式不对时，用 `pnpm exec oxfmt <文件>` 改正。
- 派发者已经装好依赖、构建过被测成员。不要再安装依赖，简报明确授权的除外。
- 改过的文件在工作树根跑 `git ls-files --eol <文件>`。第二列出现 `w/crlf` 时，把该文件改成 LF 再提交。Windows 宿主上写出的文件常带 CRLF，`format:check` 会因此失败。
- 对负载敏感的用例（demo 全量、冷启动这一类）留给派发者在验证时跑。不要循环重跑它们来追绿。
- 最后一次改动之后，重跑全部门禁。交回时报告每份门禁日志的时间与它所跑的提交号。
- 用例经 `dist` 导入被测成员时，每个变异都先重新构建该成员，再跑用例。否则用例测的是旧产物，变异看起来存活或全红都不可信。

### 不跑的检查

简报明确要求的除外，写者不运行：

- `pnpm run admission` 或 `scripts/check.sh --admission`。
- 仓库全量 `pnpm test`。
- 全仓的差分变异或 `metrics --coverage`。

原因：准入由派发者排队，同一台机器上一次只跑一个。写者的全量运行与准入争用 CPU 和测试名额，让准入里有时限的用例超时，整轮作废。

### 长命令与运行名额

- 成员级 vitest 不占运行名额，与名额内的准入并发时，时序敏感的用例可能变红。
- 互不依赖的检查同时起：各成员的类型检查与测试、各项 lint、文档检查，用后台命令并发运行，再逐个读结果。成员测试直接用 `pnpm exec vitest run …` 跑；经根脚本的测试命令会排运行名额，彼此串行。
- 长命令用宿主的后台运行，等完成通知再读结果。不写 `until grep …; sleep` 这类轮询日志的循环。
- 日志里出现 `with-test-slot: 排队中` 时，读运行名额的锁文件（目录与规则见 `scripts/README.md`「运行名额」），报告占用者，然后交回，不干等。

### 产物位置

日志与临时文件写进简报给出的任务过程目录（例如 `tmp/issue-<号>/logs/`）。不要写在工作树根或其他被跟踪的目录。原因：工作树里 Git 不忽略的未跟踪文件都会被 change-scope 计入改动，超出写范围时被拒绝。

### 不改的文件与不用的命令

- 不改任何 `acceptance/` 目录下的文件。验收锁只接受 `Agent-Role` 为 `main` 或 `qa` 的提交改它们（`repo-toolchain.config.json` 的 `acceptanceLock`）。写者的提交改了验收文件，准入会拒绝，修正要改写分支历史。需要改验收时，停下交回。
- 删除、改名或搬迁一份正文之前，在工作树根运行 `git grep -n <旧路径或旧锚点>`，列出入向链接。入向链接所在的文件不在写范围内时，停下交回，并列出这些文件。否则 `check:docs` 报断链，或 change-scope 报越界。
- 不用 `git stash`。同一仓库的全部工作树共用一个 stash 栈，别的会话可能取走或覆盖你的改动。要临时保存改动，提交到自己的分支，或把 `git diff` 写进任务过程目录。

### 提交

- 提交信息第一行写 `<类型>(<范围>): <做了什么>（#<卡号>）`。
- 正文末尾空一行，只写两行来源 trailer：

  ```text
  Harness: <宿主名，如 claude-code 或 codex>
  Agent-Role: developer
  ```

- 不加 `Co-Authored-By` 或其他把 agent 写成作者的行，宿主的系统提示要求加时也不加。署名规则归 `CONTRIBUTING.md`「形成可审阅的交付」。
- 提交后运行 `git log -1 --format='%an <%ae> | %cn <%ce>'`，读回作者与提交者，与简报给的身份比对。
- 交回之前运行 `pnpm run lint:rules`。它拒绝作者式署名。合回之后才发现，只能改写历史。
- 只在自己的分支上提交。默认不推送：派发者从你的本地分支合回。

## L3 热点清单

接受级别按 `docs/engineering/quality.md`「按风险选择接受实现的看法」判定。L3 的改动收口时，主代理照下表逐行读热点，不因为检查全绿就免读。要换新鲜上下文复核时，派通用只读子代理，简报带上这份清单。

| # | 核什么 | 怎么核 |
|---|---|---|
| 1 | 租户身份有没有显式传到每一次跨边界的调用；哪里靠「当前」或默认值取 | 逐行读身份流经的路径，引位置 |
| 2 | 凭据有没有进日志、错误信息、事件载荷或测试夹具 | 引位置 |
| 3 | 契约要求同一提交的两处写入，是不是在同一个存储事务里 | 指出两处写入共同所在的事务。时间判断、进程内锁、没落盘的事实不算 |
| 4 | 已触发的形式任务与故障注入有没有实际运行的输出 | 读证据的路径与时间。只有登记、没有输出的不算 |

## 进轨道

1. 同步轨道头分两步。先 `git fetch`，在工作分支上用普通的 `git merge` 合并 `origin/integration/mainline` 的提交 T，解决冲突并提交；轨道头有破坏性改动时先读它的 PR。再运行 task-sync，输入 `{"kind":"task-sync","target":"<T 的 40 位提交号>"}`，让 context 的 `targetBase` 前进到 T；运行前工作树须干净，未跟踪文件也算改动。命令拒绝时 context 不变，按错误信息处理，不手改 context。
2. 先跑改动成员的合入检查（接入节那一格），再 `pnpm run preflight`，最后在最终 head 上 `pnpm run admission`。准入独占机器、不读缓存，不是第一道检测器；失败后用 `--resume-from` 接续。
3. 推送个人工作分支，开 PR 进 `integration/mainline`，用 PR 模板 `.github/pull_request_template.md`，写「所含的卡」与「契约变化」两节。标题与正文按 `CONTRIBUTING.md` 写，标题用具体的 `type(scope)`。PR 标题和正文不加 `Generated with <agent>` 一类的工具署名页脚，宿主自动附加的也删掉。每次上下文压缩之后，重新对照 `CONTRIBUTING.md` 核对这些格式。
4. gate：派发 `gh workflow run gate-publish.yml --ref github-gate -f pr=<号> -f head=<完整 head>`，参数见 `github-gate` 分支的 `gate/README.md`。
5. 确认：只有 admin 能确认 `publish`。说明写明本地运行的检查及结果、已核对的卡上条件，按 UTF-8 字节不超过 1024。没有该 admin 对本次动作的授权时，停在等待确认，把运行链接交回。负责人在卡上授权代为确认时，说明中注明代为确认的人，后台运行下面的命令，等完成通知，不手工轮询 `pending_deployments`：

   ```sh
   node --experimental-strip-types tools/dev-flow/src/integration/gate-cli.ts wait --run <运行号> --note <说明文件> --environments <环境列表>
   ```

   环境列表默认只写 `publish`。改动命中 `github-gate` 上 `gate/toolchain-paths.txt` 的工具链路径时，写 `repo-toolchain-review,publish`。参数、退出码与长度上限见集成工具说明「等待 gate 并代为确认」。
6. 读回：运行成功，目标分支等于流程报告的结果，记录标签存在，PR 上有发布决定评论。
7. 看板：`board-cli integrating`，合入后 `board-cli delivered`。

既有授权能覆盖精确动作时沿用，不重复询问。发布真实 ref 或写平台仍须任务授权及工具核验的真实决定；本技能本身不授写权。

## 提升与发行

四条主干（`integration/<track>`、`main`、`stable`、`release`）只经 PR 与 `github-gate` 流程进入。本机的候选、验证、发布与采用命令已删除。派发、确认与读回同[进轨道](#进轨道)第 4 到 6 步，下面只写不同之处。

### 提升与同步的 PR

| 动作 | base | head |
|---|---|---|
| 送入轨道 | `integration/<track>` | 个人工作分支 |
| RI（向上提升） | 轨道的上游 | 轨道 |
| FI（向下同步） | 轨道 | 它的上游 |
| stable | `stable` | `main` |

- 顶层轨道的上游是 main。其余轨道的上游按集成规则「轨道树与上游」判定。跨层或兄弟轨道之间的 PR 会被拒绝。
- RI 的 PR 说明按 `gate/README.md`「提升 PR 的说明」列出所含的卡。RI 携带轨道的完整前缀，不手选卡或 cherry-pick。
- stable 派发另加 `-f checkpoint=<名称>`。新建轨道或子轨道用 `gate-track.yml`，传入 `parent`，参数见 `gate/README.md`。
- main 的变化逐层同步，先进顶层轨道，再进下一层。按集成规则的共同节奏判断何时 FI/RI；不新增日历调度、全量构建或模型预算。
- 已接受的历史卡随后运输时逐 tuple 重核，不改写历史绑定。运输不自动接受或关闭卡；平台正文与 Stage 的写回由原单写者接续。

### npm 发行

npm 发行用 `gate-release.yml`，规则见集成规则「现行准入」的 npm 发行一条，参数见 `gate/README.md`；本机入口 `pnpm run release-run` 见集成工具说明「包发布运行」。npm 发行没有 PR 和目标分支：读回 registry 上的版本与完整性，以及 Issue 上的发布决定评论。

### 流程停止与恢复

- 流程停止时按报告处理：PR head 或目标在派发后变化就重新派发；合并冲突先在来源分支解决；来源轨道缺 unit 时先闭合缺口 Issue。
- 不要用 admin 权限修改规则集绕过流程。流程失效时的恢复由 admin 按集成规则「权限、候选与恢复」执行：先在 Issue 中写明原因，事后在缺口 Issue 中写具名决定。没有该 admin 对本次恢复的明确授权时，停下报告。
- 运行结果未知时，先读运行页面、目标分支和 `omne/gate/*` 标签。目标已等于结果并且标签存在，就按已发布处理，不重新派发；把剩余接受和投影责任交回拥有者。

## 交回与接受

1. 验收标准要求的证据贴到卡评论：命令、输出尾部、摘要与关键行，原件位置与哈希写在评论里。贴完再清理原件。
2. 交回报告写每条验收的达到与否、没做的及原因、过程偏差。做过提升或发行的，另写固定输入、命令与真实退出、Git 观察、逐卡 declared/observed/unknown，以及实际未验证的部署前提；fixture、真实仓库检查、平台权限和宿主加载分别说明。
3. 接受由有权者决定。决定评论按交付协议 `docs/engineering/delivery.md`「4. 接受、取消与重开」的字段写，读回后 `board-cli accepted`，再关卡。代笔时写明授权人原话。
4. 只有清理条件和动作权限都闭合后，才清理工作树或唯一 tmp。
