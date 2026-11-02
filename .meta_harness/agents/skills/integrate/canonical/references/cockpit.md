# Reduce 总控页

本页给 reduce 会话一份总控页的数据格式与生成命令。页面回答一个问题：现在有谁在等 Reduce，Reduce 该先做哪一件。

写者：

- 数据 `tmp/<里程碑>/cockpit/reduce.json`，由 Reduce 自己维护。
- 生成器 `scripts/cockpit/build.py`，样式 `scripts/cockpit/panel.css`，样例 `example.reduce.json`，都在本技能目录下。只用标准库。
- 生成的 HTML 不提交。它每次从 JSON 重建，可以随时删。

## 与线进度页的关系

两个页面面向不同读者，不互相替代。

| | 总控页（本页） | 线进度页（`line` 技能的 `references/wave-progress.md`） |
| --- | --- | --- |
| 读者 | Reduce 自己，或接手 Reduce 的人 | 线负责人，以及要判断这条线能不能交回的人 |
| 范围 | 全部轨道、全部卡、全部待裁定 | 一条线的判据、闭包、证据 |
| 数据来源 | Reduce 手工维护的 `reduce.json` | 线会话维护的 `progress.json`，工作树事实由 `facts.py` 刷新 |
| 刷新节奏 | 每次裁定、每次合入、每次接交回 | 闭包状态一变就刷新 |
| 回答 | 谁在等我、我下一步做什么 | 这条线交到哪一步、缺什么证据 |

总控页只收第三层请求。第一、二层在线内解决，进总控页会把页面变成批复队列，线反而停下来等人。

## 数据格式

一份 `reduce.json`，`schemaVersion` 固定为 `1`。生成器校验失败时退出码 2，并指出字段与合法取值；不猜、不补默认值。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | `1` |
| `title` | 是 | 页面标题，也是名字本身，如「M2 波 1 总控」 |
| `updatedAt` | 是 | UTC ISO。超过 10 分钟标黄，超过 30 分钟标红；时间在未来单独标红 |
| `summary` | 否 | 一句话现状，写在结论条下方 |
| `upstream` | 否 | `{name, head}`；各轨道的领先/落后以它为准 |
| `tracks` | 是 | 轨道表，见下 |
| `cards` | 是 | 卡表，见下 |
| `requests` | 是 | 第三层请求，见下 |
| `criticalPath` | 是 | 关键路径，见下 |
| `risks` | 否 | `[{severity, risk, impact, action}]`，`severity` 取 `bad`、`warn`、`info` |
| `timeline` | 是 | `[{at, event}]`，新的在前，页面最多显示 30 条 |

### `tracks[]`

```json
{ "name": "integration/model", "scope": "真模型、OpenRouter、模型记录",
  "head": "148412f4a", "card": 446, "cardUrl": "https://…",
  "status": "review", "lead": 12, "note": "draft-ri 已 0 findings",
  "handoff": "波末 PR #1048 已合入", "handoffUrl": "https://…" }
```

- `status`：`running`、`waiting`、`review`、`merged`、`blocked`、`dropped`。
- `lead`：相对 `upstream.head` 的提交数，领先为正、落后为负、齐平为 0。取 `git rev-list --count <upstream.head>..<head>`。不写方向词，方向由数决定。
- 页面把 `lead` 同时画成数字、方向词和条长，三种编码。条长 10 个提交为满格，超过仍按满格画，数字照实显示。

### `cards[]`

```json
{ "id": 446, "title": "模型线父卡", "track": "integration/model", "stage": "review",
  "binding": { "attempt": "446-r3-a1",
               "writeScope": ["packages/model/*"], "owner": "L-MODEL" },
  "waitingOn": "提升级 attest", "waitingUrl": "https://…" }
```

- `stage`：`not-started`、`building`、`review`、`fixing`、`accepted`、`blocked`、`deferred`。
- `binding` 是页面上给人看的那一层：`attempt`、`writeScope`、`owner`。binding 的权威副本在卡上，这里只做摘录，不反向写回。
- `waitingOn` 写在等什么；没有等待就省略。

### `requests[]`

```json
{ "id": "RQ-11", "from": "L-RUN", "to": "Reduce", "layer": 3,
  "what": "「契约变化」按成员还是按包汇总", "link": "https://…",
  "since": "2026-11-02T01:35:00Z", "status": "open", "note": "挡提升 PR 的正文" }
```

- `layer` 必须是 `3`，否则生成器拒绝。这是结构上的防线，不是样式约定。
- `status`：`open`、`answered`、`withdrawn`。答复后改 `answered` 并填 `answer`，页面自动折进「已答复与已撤回」，不用删行。
- 结论条会指出挂得最久的那一条。

### `criticalPath[]`

```json
{ "item": "session-run ri-notes", "minutes": 30, "state": "pending" }
```

- `state`：`done`、`active`、`pending`、`blocked`。
- `minutes` 是正整数，页面按它分配条宽，合计写在下方。宽屏看条，375px 看编号列表。

## 什么时候刷新

- 一次裁定之后（改 `requests`，同时把结论写进 `timeline`）。
- 一次轨道合入或提升之后（改 `tracks`）。
- 每次接交回之后（改 `cards` 的 `stage` 与 `waitingOn`）。
- 没有状态变化时不必重建；`updatedAt` 是给人判断页面新旧用的，不是自动心跳。

## 命令

在仓库根跑，路径按里程碑实际目录替换。

```sh
python .meta_harness/agents/skills/integrate/canonical/scripts/cockpit/build.py \
  tmp/<里程碑>/cockpit/reduce.json --out tmp/<里程碑>/cockpit/cockpit.html
```

- 生成位置默认是 `reduce.json` 同目录的 `reduce.html`。
- `--css <路径>` 换样式表；默认用同目录的 `panel.css`。
- `--now <UTC ISO>` 固定「距今多久」的参照点。样例数据与截图用它，结果可复现；日常生成不要传，页面的新鲜度要按真实时间判断。
- 页面不加载任何外部资源，没有脚本，打开即完整可见。

## 样式副本

`integrate` 与 `line` 各带一份 `panel.css`，因为两个技能在宿主里独立装载，一个技能的文件不能引用另一个技能的相对路径。两份必须逐字节相同。任一生成器在仓库内运行时发现对端副本分叉，会打印两份路径并退出 2。改样式时同时改两份，改完各跑一次样例生成。

## 页面约定

- 颜色只从 `:root` 的 token 取。`prefers-color-scheme: dark` 与 `:root[data-theme="dark"]` 各给一套，`body` 有显式背景。
- 状态用颜色、文字与符号三路编码：有证据 ✓、进行中 ◔、部分 ◑、受阻 ✕、未开始 ○。
- 数字列用 `tabular-nums`；375px 宽不横向滚动，宽表换成每行一块卡片，字段名在值上方。
- 不引图表库与外部 CDN。能用一个 `<div>` 和 `flex-grow` 表达的分段条，不写 SVG。
