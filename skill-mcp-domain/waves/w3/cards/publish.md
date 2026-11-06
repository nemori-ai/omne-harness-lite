# 三张小卡的发布清单

本文件只列属性和命令，没有执行任何命令。规则依据：`docs/engineering/delivery.md`「卡属性与合法组合」「6. 访问、失败与最小工具」，`docs/engineering/agent-delivery.md`「2. 建卡或修订卡」，`docs/engineering/github-delivery.json`（`enabled: true`，`mode: manual-single-dispatcher`，创建交接 Issue 为 #184，主 Project 为编号 4）。

## 卡属性

| 项 | 卡 1 | 卡 2 | 卡 3 |
| --- | --- | --- | --- |
| 正文文件 | `card-1-rfc-sdk-version.md` | `card-2-test-runner-mutation.md` | `card-3-fixture-quiet-window.md` |
| 标题 | MCP SDK 版本｜RFC-0001 与技术基础正文写 2.3.1，仓库实际采用 2.4.0 | 工具链｜差分变异把运行器自身的失效记成「没跑测试」「运行错误」，整次测量无效，且沙箱目录挡住同树的 metrics | MCP 本地宿主｜测试夹具用 12 ms 静默窗口判断对端已记完，高负载下计数断言偶发为 0 |
| 创建操作标识 | `rfc-sdk-version-20261106-1` | `test-runner-mutation-20261106-1` | `fixture-quiet-window-20261106-1` |
| 标签 `kind:` | `kind:maintenance` | `kind:bug` | `kind:maintenance` |
| 标签 `level:` | `level:subtask` | `level:subtask` | `level:subtask` |
| 标签 `line:` | `line:integration` | `line:engineering-toolchain` | `line:tool-exec` |
| 标签 `nature:` | `nature:design` | `nature:impl` | `nature:impl` |
| 标签 `contract:` | 不打（契约变更 none） | 不打 | 不打 |
| 里程碑 | M2 端到端多轮闭合（编号 2） | 同左 | 同左 |
| 父卡 | #1119 | #979 | #1119 |

依据行：

- 标签族与建卡必备项：`delivery.md`「标签是正文的投影」表，以及“建卡时，卡必须有唯一的 `kind:` 标签、唯一的 `line:` 标签与里程碑”。
- 契约变更为 none 时不打 `contract:`：`agent-delivery.md` 第 2 节末段。
- 卡 1 取 `line:integration` 的理由：`delivery.md` 合法组合表允许 `design` 配任意线。`docs/architecture` 属 `delivery-lines.json` 的 `integration.paths`，`docs/rfcs` 不属任何线。线内的卡写这些路径会被 `scope-outside-line` 或 `scope-integration-path` 拒绝。正文已写明。
- 里程碑与标签已在仓库中存在：`gh label list` 与 `gh api repos/nemori-ai/omne-harness-lite/milestones` 的读数（2026-11-06）。里程碑 2 的标题是“M2 端到端多轮闭合”，状态 open。

## 发布前核对

1. 确认发布者是本卡正文单写者。首次发布由 Claude Code 会话代 PanQiWei 执行。
2. 确认授权范围。正文写明：PanQiWei 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”，只授权建卡与登记。本清单没有可链接的授权评论 URL，发布者如有，补进卡正文「身份与责任」。
3. 对每个标识做重复检查（`delivery.md` 第 6 节：创建超时后按正文标识精确匹配）。三条命令只读。

```sh
for id in rfc-sdk-version-20261106-1 test-runner-mutation-20261106-1 fixture-quiet-window-20261106-1; do
  gh search issues "\"$id\"" --repo nemori-ai/omne-harness-lite --match body --state all --json number,title,state
done
```

零匹配才继续。一个匹配时核对内容后接续该卡。多个匹配时停止，交发布负责人。搜索索引有延迟，零匹配前如有疑问，用 `gh issue list --state all --limit 200` 全量读后精确匹配。

## 步骤 1：在 #184 登记创建请求

每张卡一条评论，创建前发出并读回。格式照 #184 上已有的登记（首行是 HTML 标记，随后是标识、拟建卡、获准输入和首次发布者）。

卡 1 的评论正文：

```markdown
<!-- rfc-sdk-version-create-20261106-1 -->
## 创建操作登记：MCP SDK 版本，RFC-0001 与技术基础正文写 2.3.1，仓库实际采用 2.4.0

仓库 nemori-ai/omne-harness-lite。创建操作标识 `rfc-sdk-version-20261106-1`。

- 拟建卡：subtask，`kind:maintenance`，交付线 `integration`，性质 `design`，契约变更 none，父卡 #1119，里程碑 M2 端到端多轮闭合。
- 获准输入：PanQiWei 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”。卡 #1119 的执行者在 W3 波末按此登记。该授权只用于建卡和登记，不授权实现、派发或接受。
- 首次发布者：Claude Code 会话，代 PanQiWei。创建结果未知时，按同一标识读回，不重建。
```

卡 2 和卡 3 的评论同形，替换下列字段：

| 字段 | 卡 2 | 卡 3 |
| --- | --- | --- |
| HTML 标记 | `<!-- test-runner-mutation-create-20261106-1 -->` | `<!-- fixture-quiet-window-create-20261106-1 -->` |
| 标题 | 差分变异把运行器自身的失效记成「没跑测试」「运行错误」，整次测量无效 | MCP 本地宿主测试夹具的 12 ms 静默窗口 |
| 标识 | `test-runner-mutation-20261106-1` | `fixture-quiet-window-20261106-1` |
| 拟建卡 | subtask，`kind:bug`，交付线 `engineering-toolchain`，性质 `impl`，契约变更 none，父卡 #979，里程碑同上 | subtask，`kind:maintenance`，交付线 `tool-exec`，性质 `impl`，契约变更 none，父卡 #1119，里程碑同上 |

发出与读回：

```sh
gh issue comment 184 --repo nemori-ai/omne-harness-lite --body-file <登记评论文件>
gh issue view 184 --repo nemori-ai/omne-harness-lite --comments --json comments --jq '.comments[-3:][] | .url, (.body | split("\n")[0])'
```

读回后，登记评论的 URL 与首行标记须对得上。评论没读回，不创建卡。

## 步骤 2：创建卡

每张卡一条命令。`--body-file` 取本目录的正文文件。卡 1 示例：

```sh
gh issue create --repo nemori-ai/omne-harness-lite \
  --title "MCP SDK 版本｜RFC-0001 与技术基础正文写 2.3.1，仓库实际采用 2.4.0" \
  --body-file tmp/skill-mcp-domain/waves/w3/cards/card-1-rfc-sdk-version.md \
  --label "kind:maintenance" --label "level:subtask" --label "line:integration" --label "nature:design" \
  --milestone "M2 端到端多轮闭合"
```

卡 2：

```sh
gh issue create --repo nemori-ai/omne-harness-lite \
  --title "工具链｜差分变异把运行器自身的失效记成「没跑测试」「运行错误」，整次测量无效，且沙箱目录挡住同树的 metrics" \
  --body-file tmp/skill-mcp-domain/waves/w3/cards/card-2-test-runner-mutation.md \
  --label "kind:bug" --label "level:subtask" --label "line:engineering-toolchain" --label "nature:impl" \
  --milestone "M2 端到端多轮闭合"
```

卡 3：

```sh
gh issue create --repo nemori-ai/omne-harness-lite \
  --title "MCP 本地宿主｜测试夹具用 12 ms 静默窗口判断对端已记完，高负载下计数断言偶发为 0" \
  --body-file tmp/skill-mcp-domain/waves/w3/cards/card-3-fixture-quiet-window.md \
  --label "kind:maintenance" --label "level:subtask" --label "line:tool-exec" --label "nature:impl" \
  --milestone "M2 端到端多轮闭合"
```

三条命令串行执行。每条命令的输出（Issue URL）记为 `N1`、`N2`、`N3`。写超时时不重发，先按标识读回对账（见发布前核对第 3 步）。

## 步骤 3：核对平台父关系

正文写的父卡须与平台的 sub-issue 关系一致（模板：“真实父Issue URL，并核对平台父关系”）。

```sh
# 取子卡的数字 id，再挂到父卡下。<N> 是新卡编号，<P> 是 1119 或 979。
ID=$(gh api repos/nemori-ai/omne-harness-lite/issues/<N> --jq .id)
gh api -X POST repos/nemori-ai/omne-harness-lite/issues/<P>/sub_issues -F sub_issue_id="$ID"
```

对应：卡 1 与卡 3 挂到 1119，卡 2 挂到 979。#1136 的读回显示 `parent_issue_url` 为 `.../issues/979`，说明现有小卡走同一关系。#1119 当前 `sub_issues_summary.total` 为 0（2026-11-06 读数）。

## 步骤 4：加入主 Project 并设 Stage

`delivery.md` 字段总表规定 Status 由调度者设置，Backlog 是建卡后的初始阶段。`board-cli.ts` 不把卡加入 Project（`tools/dev-flow/src/delivery/README.md`「看板字段写入」末句），所以用 `gh project`。字段与选项 ID 来自 `github-delivery.json`。

```sh
# 加入 Project 4，取条目 id
ITEM=$(gh project item-add 4 --owner nemori-ai --url https://github.com/nemori-ai/omne-harness-lite/issues/<N> --format json --jq .id)

# Status 设为 Backlog：字段 PVTSSF_lADODPptlM4BmeFEzhlG_3U，选项 07424d99
gh project item-edit --project-id PVT_kwDODPptlM4BmeFE --id "$ITEM" \
  --field-id PVTSSF_lADODPptlM4BmeFEzhlG_3U --single-select-option-id 07424d99
```

Line 与 Kind 字段的规则是：`start` 在开工时写入，调度者可用 `board-cli.ts dispatched` 补写（字段总表）。建卡时不要求写。#1136 在建卡时已写了 Line 与 Kind，这是先例，不是规则要求。要照做时用下面的命令，选项 ID 取自 `github-delivery.json`：

| 卡 | Line 选项 | Kind 选项 |
| --- | --- | --- |
| 卡 1 | `integration`：`f6ab4114` | `maintenance`：`26b05195` |
| 卡 2 | `engineering-toolchain`：`d7c1e6c4` | `bug`：`12178507` |
| 卡 3 | `tool-exec`：`9d7c0d86` | `maintenance`：`26b05195` |

```sh
gh project item-edit --project-id PVT_kwDODPptlM4BmeFE --id "$ITEM" \
  --field-id PVTSSF_lADODPptlM4BmeFEzhnOvAE --single-select-option-id <Line 选项>
gh project item-edit --project-id PVT_kwDODPptlM4BmeFE --id "$ITEM" \
  --field-id PVTSSF_lADODPptlM4BmeFEzhnO8yM --single-select-option-id <Kind 选项>
```

Wave、Dispatched at 等字段由 dev-flow 在开工时写入，建卡时不写。Needs decision 字段：卡 1 的 D-01 是 `start` 阶段的决定条件。是否置 `yes` 由调度者判断（字段总表：发现需要人裁定时置 `yes`）。本清单不预设。

## 步骤 5：读回

对每张卡执行，并把结果写进卡「当前进展」的 Project 对账一行。

```sh
# 正文、标签、里程碑、父关系、Project 归属
gh issue view <N> --repo nemori-ai/omne-harness-lite --json number,title,labels,milestone,projectItems,url \
  --jq '{number,title,labels:[.labels[].name],milestone:.milestone.title,projectItems,url}'
gh api repos/nemori-ai/omne-harness-lite/issues/<N> --jq '{parent:.parent_issue_url}'
gh issue view <N> --repo nemori-ai/omne-harness-lite --json body --jq .body | grep -c "创建操作标识：<标识>"

# 标签与正文属性一致（只读，不加 --apply）
node --experimental-strip-types tools/dev-flow/src/delivery/labels-cli.ts --issue <N>
```

期望：标签恰好是上表四个，里程碑为“M2 端到端多轮闭合”，`projectItems` 里 Status 为 Backlog，`parent` 是表中的父卡，正文里的创建操作标识恰好出现 1 次。`labels-cli.ts` 的差异为空。有差异时先查正文，再决定改标签还是改正文，不凭标签改属性。

Project 加入或父关系写入失败时，保留已创建的 Issue 身份，逐项修复，不重建（`agent-delivery.md` 第 2 节）。

## 正文占位核对

发布前在三个正文文件上执行：

```sh
grep -n "{{\|documentation:placeholder\|填写提示" tmp/skill-mcp-domain/waves/w3/cards/card-*.md
```

期望无输出。“接手本卡”一段保留。
