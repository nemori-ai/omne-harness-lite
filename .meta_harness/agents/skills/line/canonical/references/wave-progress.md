# 波段进展页

本页给出线会话每波一份进展页的数据格式、规则与命令。页面是写给不在线会话里的人看的。打开 30 秒内要能回答三件事：本波要交的东西各到哪一步、有没有偏、现在需要谁做什么决定。

数据放 `tmp/line-<线>/progress.json`，生成 `同目录/progress.html`。生成器与事实刷新脚本在本技能 `scripts/progress/` 下，只用标准库。

## 第一次建：波段开工时

开工阶段做一次，与写本波 `spec.md`、`plan.md` 同批。

1. 建目录 `tmp/line-<线>/`，若已存在则沿用。
2. 复制生成器：`cp .meta_harness/agents/skills/line/canonical/scripts/progress/{build.py,facts.py} tmp/line-<线>/`。技能目录随宿主装载位置不同，按实际路径改前半段。
3. 以 `scripts/progress/example.progress.json` 为样例写 `progress.json`。`docs` 必须登记本波 `spec.md` 与 `plan.md`，否则校验失败。
4. 跑一次 `python tmp/line-<线>/build.py tmp/line-<线>/progress.json`，确认生成 HTML。

复制而不是直接引用，是为了线的进展页不随技能更新而失效。技能模板改了，已开波不必跟。

## 刷新：什么时候

- 闭包状态一变就刷新：派出、合入父分支、进入评审、转入修复、受阻、撤销。
- 没有状态变化时，最长 30 分钟一次。
- 前台等一个长任务时，用 `facts.py --loop --interval 120` 每 2 分钟自动刷新一次。

页面在 `updatedAt` 超过 10 分钟时变黄，超过 30 分钟时变红。30 分钟是上限而不是目标：有人在看这一页时，每 10 分钟之内刷新一次，别让页面停在黄色。

## 规则

- **时间一律 UTC ISO**（`2026-11-02T03:15:00Z`）。取自 `date -u`、提交 `%cI` 或评论 `created_at`，不凭感觉写。
- **状态只取枚举值**。生成器遇到枚举外的值报错退出，不猜。
- **进度以证据计**。判据只有带至少一条证据链接时才算 `met`。没有链接的写 `partial`、`open` 或 `deferred`。
- **待办只列未答复的**。答复过的改 `status: "answered"` 并填 `answer`，页面自动不显示，不用删行。
- **不写秘密**。令牌、密钥、登录证明一律不进 JSON。
- **不写个人绝对路径**。`docs[].path` 相对仓库根写；样例里也不留机器路径。

## 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | `1` | 是 | |
| `line` | 字符串 | 是 | 线短名，如 `tool-exec` |
| `lineName` | 字符串 | 是 | 如 `L-TOOL` |
| `wave` | 整数 | 是 | 波号 |
| `parentCard` | 整数 | 是 | 线父卡号 |
| `branch`、`head`、`attempt` | 字符串 | 是 | 父分支、头提交（短号）、本波 attempt |
| `updatedAt` | UTC 时间 | 是 | 本文件最后一次按事实更新的时间 |
| `summary` | 字符串 | 是 | 一句话：现在在做什么、下一步是什么 |
| `productValue` | 对象 | 是 | 本波对产品的意义与功能增量，用产品语言写，见下 |
| `eta` | 对象 | 是 | 见下 |
| `deliverables` | 数组 | 是 | 本波成果，对应线包第 2 节编号 |
| `closures` | 数组 | 是 | 闭包表 |
| `deviations` | 数组 | 是 | 偏差信号，可为空 |
| `asks` | 数组 | 是 | 要 Reduce 或 PanQiWei 处理的事，可为空 |
| `decisions` | 数组 | 否 | 本线决策记录 |
| `architecture` | 数组 | 否 | 交付前后对比 |
| `resources` | 对象 | 是 | 本线占用的机器资源 |
| `docs` | 数组 | 是 | 本波 spec、plan、constraints 等。生成器把内容内嵌进页面，顶部导航可直接跳转阅读 |
| `timeline` | 数组 | 否 | 关键事件，新的在前 |

### `productValue`：本波对产品意味着什么

页面最上方一节，标题固定为「本波对产品意味着什么」。这一节必写。

写给产品负责人看，用产品语言。不出现类名、包名、闭包编号。读者不看代码也要明白：这一波做完，用户或运维者多了什么能力。

```json
{ "headline": "Agent 第一次能在你的电脑上真的执行命令、读写文件，而且能被中途叫停。",
  "why": "M2 的目标是端到端多轮交互闭合。没有工具执行，Agent 只能聊天，不能干活。",
  "increments": [
    { "who": "使用者", "canNow": "让 Agent 在授权目录里读写文件，越界的路径被拒绝且不留痕迹",
      "before": "Agent 只能回复文字", "status": "in-progress" },
    { "who": "使用者", "canNow": "中途取消一次长时间运行的命令，其他调用不受影响",
      "before": "无法中断", "status": "review" } ],
  "notYet": [ "终端交互（像 vim 那样的全屏程序）：M2 不做", "沙箱隔离：M2 之后" ] }
```

- `headline`：一句话，说清本波最重要的产品变化。
- `why`：一两句，这一波为什么要在这个时候做，对里程碑目标的贡献。
- `increments[]`：每条是一个用户可感知的能力。`who` 写角色（使用者、运维者、开发者、其他线），`canNow` 写交付后能做到的事，`before` 写之前的状况，`status` 取成果的状态枚举。
- `notYet[]`：本波明确不做、用户可能以为有的能力，括号里写哪一波补上。避免误以为已经能用。

写法要求：能力从用户视角描述，不写实现手段。`canNow` 用现在时，写结果与边界，一句说完。

### `eta`

```json
{ "prAt": "2026-11-02T21:00:00Z", "deliverAt": "2026-11-02T22:00:00Z", "confidence": "中",
  "criticalPath": [ { "item": "收敛提交", "minutes": 40, "doneAt": null } ],
  "changedReason": "三个 L3 闭包各多一轮修复" }
```

`confidence` 取 `高`、`中`、`低`。`criticalPath` 按顺序写，已完成的填 `doneAt`。ETA 变化超过 1 小时，写 `changedReason`。

### `deliverables[]`

```json
{ "id": "T3", "title": "执行环境宿主", "risk": "L3", "status": "in-progress",
  "criteria": [ { "text": "files 十二项可用", "state": "met",
                  "evidence": [ { "label": "#421 证据", "url": "https://…" } ] } ] }
```

- `status`：`not-started`、`in-progress`、`review`、`merged`、`blocked`、`deferred`。
- `criteria[].state`：`met`（有证据）、`partial`、`open`、`deferred`（写明去哪一波）、`na`（不适用，写理由）。
- `risk`：`L1`、`L2`、`L3`。

### `closures[]`

```json
{ "id": "C-COMMAND", "title": "command 设施", "deliverables": ["T3"], "deps": ["C-START"],
  "status": "running", "critical": true,
  "writer": { "role": "developer", "model": "opus", "effort": "high" },
  "worktree": "D:/dev_repos/<仓库>/.worktrees/te-command", "host": "windows",
  "processDir": "tmp/line-tool-exec/w1/closures/C-COMMAND",
  "startedAt": "2026-11-02T18:20:00Z", "mergedAt": null, "rounds": 1, "additions": 0,
  "facts": null }
```

- `status`：`planned`、`running`、`review`、`fixing`、`merged`、`blocked`、`dropped`。
- `host`：`windows` 或 `wsl`。`facts` 由 `facts.py` 写，人不手写。
- `worktree` 是本机路径，写在 `progress.json` 里，不进技能样例。
- `critical: true` 的闭包在页面上标出关键路径。

### `deviations[]`

```json
{ "axis": "progress", "level": "warn", "text": "C-FILES 第 2 轮修复，晚 40 分钟", "since": "2026-11-02T18:34:00Z" }
```

`axis` 取 `scope`（范围）、`direction`（方向）、`progress`（进度）、`quality`（质量）、`stuck`（卡住）、`resource`（资源）。`level` 取 `warn`、`bad`。没有偏差就是空数组，不写 `ok` 行。

### `asks[]`

```json
{ "to": "Reduce", "layer": 3, "what": "改装配页 tool-records 行", "link": "https://…",
  "since": "2026-11-02T17:31:00Z", "status": "open", "answer": null }
```

`to` 取 `Reduce`、`PanQiWei`、或另一条线的名字。`layer` 按决策权三层填，第二层的事不进 asks。答复后改 `status: "answered"`、`answer` 填答复链接。

### `decisions[]`、`architecture[]`、`resources`、`docs[]`、`timeline[]`

```json
"decisions": [ { "id": "D2", "title": "Tool 耐久记录仓位置", "layer": 2, "link": "https://…" } ],
"architecture": [ { "id": "T2", "title": "Tool 起步", "before": "…", "after": "…", "left": "…" } ],
"resources": { "heavyNow": 2, "cap": 3, "subagentsRunning": 4, "note": "WSL 写者 2 个" },
"docs": [ { "label": "本波 spec", "path": "tmp/line-tool-exec/w1/spec.md" },
          { "label": "本波 plan", "path": "tmp/line-tool-exec/w1/plan.md" } ],
"timeline": [ { "at": "2026-11-02T18:55:00Z", "event": "ETA 贴卡" } ]
```

`docs[].path` 相对仓库根（也可写绝对路径）。spec 与 plan 两项必须登记；文件不存在时页面标红。生成时读入并渲染为 HTML，所以文档改了要重跑生成器。`facts.py` 每次都会重跑生成器。

`resources.heavyNow` 是此刻在跑的重活（构建、全量测试、变异、准入、TLC、WSL 真实进程）数，超过 `cap` 页面标红。

## 命令

在仓库根或线工作树里跑，路径按本波实际目录替换。

```sh
# 复制模板（波段开工时一次）
cp .meta_harness/agents/skills/line/canonical/scripts/progress/{build.py,facts.py} tmp/line-<线>/
# 刷新在途闭包的工作树事实并重建页面
python tmp/line-<线>/facts.py tmp/line-<线>/progress.json
# 前台等长任务时自动刷新
python tmp/line-<线>/facts.py tmp/line-<线>/progress.json --loop --interval 120
# 只重建页面
python tmp/line-<线>/build.py tmp/line-<线>/progress.json
```

## 脚本行为

- `build.py` 校验失败时退出码 2，并指出哪个字段不合法。生成位置默认是 `progress.json` 同目录的 `progress.html`，可用 `--out` 改。
- 页面带 60 秒自动重载，用时间戳绕过 `file://` 缓存。浅色与深色都按系统主题显示。
- `facts.py` 读 `closures[].worktree` 的提交数、未提交改动数、进程目录最近写入时间和头提交。`host` 为 `windows` 的直接读，为 `wsl` 的经 `wsl.exe -d Ubuntu-24.04` 在 WSL 内读。工作树不存在时该项记 `missing`，不报错。
- `facts.py` 只改 `closures[].facts`、`resources.subagentsRunning` 与 `updatedAt`，不碰其它字段。它不回写 GitHub，也不改仓库。
- `facts.py` 无参数时打印用法并退出 2。
