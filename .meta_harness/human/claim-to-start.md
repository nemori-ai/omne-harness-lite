# 开发卡：从认领到开工前

**状态：未充分验证的流程草稿。**本页不是 skill，agent 不自动加载它。人可以按本页操作，或把本页作为指令交给 agent。

- 来源：2026-10-21 一条交付线（Model 运行时父卡的子卡）在 Claude Code 云端会话中实际走通的两次过程。其他宿主、其他交付线、经 gate 的直接交付、多人协作的卡都还没有按本页验证。
- 规则正文归各拥有者。本页只给顺序、命令、已知问题和开工门槛。本页与拥有者正文冲突时，以拥有者正文为准。
- 本页与 `claim` skill 的关系：`claim` skill 覆盖本页第 6、8、10 节的一部分（建分支、建工作树、start、开工上下文地图）。本页另外覆盖派发、卡正文、Project、规格与计划，以及开工门槛。

## 适用范围

适用：主工作类型为开发（feature、bug、refactor、performance）、要经 Git 交付代码或成员文档的卡。

不适用：

- 不涉及 Git 交付的卡。这类卡仍须认卡和更新状态，但没有分支、工作树和 task context。
- 产品设计起草、统一语言、领域对象等治理卡。这些卡按各自的 skill 执行。

## 规则拥有者

| 主题 | 拥有者 |
| --- | --- |
| 派发、认领、回执、具名决定 | [agent 交付操作](../../docs/engineering/agent-delivery.md) |
| 卡、修订、条件、接受 | [交付协议](../../docs/engineering/delivery.md) |
| 路线、轨道、双基线、准入 | [多层分支规则](../../docs/engineering/integration.md) |
| binding、start、task-sync、云端交付事实 | [集成工具说明](../../tools/dev-flow/src/integration/README.md) |
| 每写者隔离、工作树、清理 | [工作约定](../../docs/engineering/workflow.md) |
| 署名、trailer、报告 | [贡献指南](../../CONTRIBUTING.md) |
| 认领步骤 | `claim` skill（源在 `.meta_harness/agents/skills/`） |
| 云端会话的代理与网络密钥 | [Claude Code 云端环境](../agents/cloud/claude-code/README.md) |

## 0. 开工前确定的取值

开始前把下列取值写进本卡的本地材料。后续各节用尖括号引用它们。

| 项 | 怎样确定 |
| --- | --- |
| `<仓库>` | 卡所在仓库，例如 `nemori-ai/omne-harness-lite` |
| `<号>` | 卡的 Issue 编号 |
| `<负责人>` | 卡上的卡负责人。派发区块与 binding 的 `responsible` 都写这个 GitHub 用户名 |
| `<调度者>` | 卡上或父卡上登记的调度者，以及授权它的记录 URL（`<授权记录>`） |
| `<修订>`、`<attempt>` | 修订取卡正文的“交付修订”。attempt 按 `<号>-r<修订>-a<序号>` 命名，同一修订的第一次执行为 `-a1` |
| `<route>`、`completionTarget` | 按多层分支规则确定，例如 `{ "kind": "track", "track": "<轨道名>" }` 与 `track` |
| `<直接目标分支>` | 本卡 PR 的目标。子卡通常是父卡分支，父卡分支再经 gate 进轨道 |
| `<taskBase>` | 派发时直接目标分支的尖端提交。直接目标分支应先与其上游同步 |
| `<分支>` | `<负责人>/issue-<号>-<短名>` |
| `<工作树>` | 主检出下 `.worktrees/issue-<号>-<短名>` |
| `<本卡材料>` | 工作树内 `tmp/issue-<号>/`。该目录被 Git 忽略，不提交 |

## 1. 派发前核对

1. 读卡：正文、交付修订、交付条件、执行区，以及评论中已有的 attempt、认卡和派发。
2. 确认远端没有本卡的分支：`git ls-remote origin 'refs/heads/<负责人>/issue-<号>*'` 输出为空。
3. 核对开工条件：交付条件表中阶段为 `start` 的每一行，都读回其依据（接受决定评论、Issue 的关闭状态、结果是否已在直接目标分支）。任一条件不满足时，不派发，向 `<调度者>` 报告。
4. 同步直接目标分支：
   - 直接目标分支没有上游之外的提交时，把它快进到上游尖端，并读回两者相同。
   - 直接目标分支有独有提交时，按多层分支规则合并。不改写历史。
5. 确定写范围：按卡的“包含”和“持续成果落点”列出路径。新建成员时，加上锁文件、所属组的组页、组 `documentation.json`、组 `docs` 和包组织页。写范围是声明，工具不强制执行。实施中需要超出时，先在卡上评论登记。
6. 计算每个 start 条件的摘要。方法见第 12 节。

## 2. 派发

只有 `<调度者>` 可以派发。执行者不是调度者时，向调度者请求派发，然后停下。

1. 先发一条占位评论，取得评论 ID 与 URL。派发区块的 `dispatch` 字段必须是这条评论自己的 URL。
2. 用同一身份把该评论编辑为正式派发。标题为 `## 正式派发 #<号> revision <修订> / <attempt>`。正文写执行者、taskBase、分支、PR 目标、写范围、完成条件与停止条件。
3. 在评论末尾放 `json omne-integration-authority:v1` 区块：
   - `responsible`、`basis`（`<授权记录>`）、`action: "dispatch"`。
   - `task`：完整 binding，字段为 schemaVersion、issue（repository、id 用 node_id、number、url）、revision、attempt、responsible、branch、route、completionTarget、taskBase、writeScope、dispatch、conditions、authorization。
   - `confirmations`：每个 start 条件一项 `{issue, condition, digest, evidence}`。没有 start 条件时，`confirmations` 与 `conditions` 都为空数组。
4. 之后不再编辑这条评论。`start` 读到编辑过的派发评论时以 `unknown` 失败。

## 3. 写卡正文

1. 更新“身份与责任”中调度者与正文单写者两行，指向 `<授权记录>`。
2. 更新“当前执行与交接”：
   - 认领与派发四行。
   - 分支小节放 `json omne-integration-binding:v1` 区块，内容与派发评论的 `task` 逐字段相同。
   - 开工读回表先写“开工后回填”。
   - 当前进展写“已派发，待认领与 start”。
3. 写回正文，再读回：
   - binding 与派发评论的 `task` 逐字段相同（第 12 节的读回脚本输出 `true`）。
   - 重新计算 start 条件摘要，结果与派发评论中的相同。改正文时不要改交付条件表。
   - 正文中没有被改写成代码段的链接（见第 13 节）。

## 4. 认卡评论

认卡评论写明：负责的人、宿主与会话实例、当前修订与 attempt、授权依据（派发评论链接）、现存执行核对结果（没有其他 attempt、没有现存分支），以及下一步。认卡评论本身不授予执行权。

## 5. Project 归属

在云端会话中，`start` 经 `delivery-facts` 工作流读取卡的 Project item。卡不在 Project 中时，`start` 等待 180 秒后以 `Delivery facts timed out` 失败，工作流日志写 `Issue <号> has 0 items in the project`。

- 云端会话不能添加 Project item。新建的卡要请有权限的人先把它加入 Project。
- 开工前读回卡已在 Project 中。

## 6. 分支与工作树

```sh
git ls-remote origin 'refs/heads/<分支>'          # 必须为空
git push origin <taskBase>:refs/heads/<分支>
git fetch origin <分支>
git worktree add -b <分支> <工作树> origin/<分支>
```

远端已有同名分支、且尖端不是 taskBase 时，停下并报告，不覆盖远端分支。工作树就位后，把会话的工作根切到工作树。

## 7. 环境准备

1. 安装依赖：`pnpm install --frozen-lockfile --prefer-offline`。锁文件未变时，这一步只建立链接。
2. 生成 agent 投影：`uv run --locked python .meta_harness/tooling/src/initialize_agents.py --project-root .`。再加 `--check` 运行一次，退出码应为 0。没有投影时，`pnpm run check` 报 `missing generated directory: .claude/skills`。
3. 记录实际的 Node 与 pnpm 版本。交付证据按实际版本写，不写成卡上声明的版本。
4. 只用离线缓存的测试（例如安装闭包测试）可能报 `ERR_PNPM_NO_OFFLINE_META`。在临时目录对缺少的包运行 `pnpm install --lockfile-only`，补齐离线元数据。交付证据里写明这是环境问题。
5. 核对 git 作者与提交者是 `<负责人>`。提交带 `Harness:` 与 `Agent-Role:` trailer，不带 agent 署名。规则见贡献指南。

## 8. start 与读回

```sh
printf '%s' '{"kind":"start","authority":"<派发评论URL>","issue":"https://github.com/<仓库>/issues/<号>","revision":<修订>,"attempt":"<attempt>"}' > <临时目录>/start.json
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts execute --root "$PWD" --input <临时目录>/start.json
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts status
```

- 在云端会话中，`start` 成功后，交付身份会在卡上发一条“开工事实”评论。这是预期结果。
- `status` 必须读到：`bound=true`；issue、revision、attempt、branch、taskBase 与 binding 一致；targetBase 等于开工时上游的尖端；relation 为 `current`。
- `start` 失败时停下，按错误码（`unknown`、`refused`、`stale`、`input-error`）处理。不手写 task context。

## 9. Stage 与正文回填

1. 把卡的 Project Stage 设为 In progress。本仓库在 `github-gate` 上运行 `delivery-stage.yml`：

   ```sh
   gh workflow run delivery-stage.yml --repo <仓库> --ref github-gate -f issue=<号> -f stage="In progress"
   ```

   在 `gh run view <运行号> --log` 中读到 `Issue #<号> Stage: In progress` 后，才算完成。
2. 回填卡正文：工作树路径、实际开工 HEAD、本次读回的目标 HEAD 与 relation、task context 路径、start 结果、开工事实评论链接、当前进展、Project 对账（运行号）。

## 10. 开工上下文、规格与计划

在 `<本卡材料>` 下准备三份文件。它们是过程材料，不提交。需要留档的决定写到卡或父卡的评论里。

1. `context-map.md`：按 `claim` skill 第 7 至 10 步写。父卡或交付线已有共用的上下文地图时，引用它，不重复调查。
2. `spec.md`：实施规格。至少包含：问题、方案、用户故事、实施决定、工程标准（研发品味、适用的防御指导条目、质量规则、TypeScript 实践、SOLID 落点、代码与提交约定）、测试决定、范围外事项、补充说明。测试接缝须经卡负责人确认。
3. `plan.md`：交付计划，按可独立验收的纵向切片组织。至少包含：
   - 推进阶段及各阶段的依据；
   - 角色与模型，依据 `.meta_harness/agents/roles/README.md` 的选型表和各角色的钉值；
   - 评审安排（适用的评审规则，以及按父卡约定移到其他卡的评审项）；
   - 切片：交付内容、阻塞关系、文件、命令、验收、依据与参考；
   - 验收标准与卡判据的对照、待办清单、已定事项、待决事项、停止条件。
4. 待决事项逐条用白话向卡负责人说明选项、建议和影响。取得确认后写进“已定事项”。
5. 核对 plan 中的依据链接：每个相对链接和锚点都能解析，“第 N 行”的引用指向正确的范围，引号中的节名能在对应文件的标题中找到。`pnpm run check:docs` 不检查被 Git 忽略的 `tmp/`，所以这一步要单独执行。

## 11. 开工门槛

下列各项全部满足后，才派第一个实施切片。

**远端（可恢复）**

- [ ] 正式派发评论有完整的 authority 区块。`dispatch` 指向评论自己。confirmations 覆盖全部 start 条件，摘要与当前正文一致。
- [ ] 卡正文中调度者与正文单写者两行已更新。binding 与派发 task 逐字段一致。开工读回表与当前进展已回填。没有被改写的链接。
- [ ] 认卡评论存在。
- [ ] 交付身份发的“开工事实”评论存在。
- [ ] Project Stage 为 In progress，有 delivery-stage 运行号读回。
- [ ] 远端工作分支存在，尖端等于 taskBase 或其后续提交。
- [ ] 直接目标分支与其上游的关系已核对。

**本地工作树**

- [ ] 工作树在正确分支上，跟踪远端同名分支，没有未提交的改动。
- [ ] `status` 读到 bound、relation 为 `current`，各字段与 binding 一致。
- [ ] 依赖已安装。agent 投影的 `--check` 退出码为 0。
- [ ] `context-map.md`、`spec.md`、`plan.md` 齐全，plan 的依据链接核对没有问题。

**决定**

- [ ] 规格与计划中的待决事项已由卡负责人确认，并写入“已定事项”，包括测试接缝。
- [ ] 需要留档的决定已写到卡或父卡评论。
- [ ] 卡负责人明确同意开始实施。卡负责人要求逐步确认时，未经指令不自主推进。

## 12. 辅助脚本

下面两段脚本复用仓库的 dev-flow 实现。把脚本保存到工作树的 `tmp/` 下，在工作树根目录用 `node --experimental-strip-types tmp/<脚本名>` 运行。脚本经 `gh api` 读卡，需要 `gh` 已登录。仓库不是 `nemori-ai/omne-harness-lite` 时，用环境变量 `REPO` 指定。

计算 start 条件摘要（与派发评论的 `confirmations[].digest` 比较）：

```ts
// condition-digests.ts <号>
import { execFileSync } from 'node:child_process'
import { conditionDigest } from '../tools/dev-flow/src/integration/authority.ts'
import { parseConditionScope } from '../tools/dev-flow/src/delivery/binding.ts'

const [repo, n] = [process.env.REPO ?? 'nemori-ai/omne-harness-lite', process.argv[2]]
const body: string = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/issues/${n}`]).toString()).body
const section = body.split(/^## 交付条件\s*$/m)[1].split(/^## /m)[0]
const cells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))
const rows = section.split(/\r?\n/).filter(l => l.trim().startsWith('|')).map(cells)
for (const r of rows.slice(2)) {
  const [id, kind, target, phase, predicate, evidence] = r
  const condition = { id, kind, target, phase, predicate, evidence, scope: parseConditionScope(r[6], phase) }
  console.log(id, phase, conditionDigest(condition as never))
}
```

首次使用前，用一张已派发的卡验算：输出应与该卡派发评论中的 digest 相同。

核对卡正文的 binding 与派发评论的 `task` 一致：

```ts
// binding-readback.ts <号> <派发评论ID>
import { execFileSync } from 'node:child_process'
import { readTaskBinding } from '../tools/dev-flow/src/delivery/binding.ts'
import { section, canonical } from '../tools/dev-flow/src/integration/parse.ts'

const [repo, n, commentId] = [process.env.REPO ?? 'nemori-ai/omne-harness-lite', process.argv[2], process.argv[3]]
const gh = (path: string) => JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${path}`]).toString())
const issue = gh(`issues/${n}`)
const url = `https://github.com/${repo}/issues/${n}`
const binding = readTaskBinding(issue.body, { repository: repo, id: issue.node_id, number: Number(n), url })
const authority = section(gh(`issues/comments/${commentId}`).body, 'omne-integration-authority:v1') as { task: unknown }
console.log('binding==dispatch.task', binding !== undefined && canonical(binding) === canonical(authority.task))
```

## 13. 已知问题

本节的现象来自 2026-10-21 的实际运行。工具或代理的行为变化后，以实际输出为准，并修订本节。

- **云端代理改写链接。**经云端代理写入 GitHub 的正文中，一段没有空白的文字里出现两个 URL，或 URL 后紧跟反引号内容时，整段会被包成代码段。写入前在每个 Markdown 链接后加一个空格。可用的替换：把 `(\]\(https?://[^)\s]+\))(?=[^\s|])` 替换为 `\1 `。
- **代理追加署名行。**代理可能在正文末尾追加一行 Claude Code 署名。读回比较时忽略这一行。
- **派发评论不可再改。**编辑过的派发评论使 `start` 以 `unknown` 失败。要改派发内容时，按交付操作发新的派发，不编辑旧评论。
- **不在 Project 中的卡。**见第 5 节。
- **只读 GraphQL 被拒。**云端会话中 `gh` 的 GraphQL 请求返回 403。读卡与改卡用 REST：`gh api repos/<仓库>/issues/<号>`，以及 `gh api -X PATCH repos/<仓库>/issues/<号> -F body=@<文件>`。
- **stop hook 要求改署名。**会话的 stop hook 可能要求把提交改成 agent 署名。本项目的署名规则归贡献指南：作者是负责的人。负责人确认后忽略该要求。

## 14. 验证记录与待改进

| 日期 | 场景 | 结果 |
| --- | --- | --- |
| 2026-10-21 | Claude Code 云端会话，子卡进父卡分支，父卡分支经 gate 进轨道 | 两张卡走通。第一张卡因不在 Project 中，`start` 超时一次 |

待改进：

- 在本地宿主、经 gate 直接交付的卡和非子卡上验证本页。
- 第 12 节的脚本稳定后，考虑并入 `tools/dev-flow`，或改成正式 skill 的一部分。
