# 规范实例：一次经过怎样走、怎样收、怎样接着走

属于 `capability.loop-extension-runner` v4 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**一次经过的输入 → 各件落下的结论 → 效果 → 依据条款**。第 8 节另给两个标明校验对象的完整 data 实例，用于验证新闭包形状；形状检查不代表 runner 已运行。结论记录的形状一律以 [`data.loop-extension` v5](../../../data/loop-extension/v5/contract.md) 为准。

**三条读法上的边界：**

- **标识串只是占位**：`run_9a`、`call_07`、`msg_r3` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）。
- **系统自带件的名字**：放行判断的 name 是 `omne-official:admission-judgment`（`capability.tool-admission/v2#S-26`），JSON 里照写、表格与正文里简写为 `admission`（**与 `dispatch` 的输入成员 `admission` 同词**：写成 `admission={…}` 的是输入，写成「`admission` 这一件」或效果里 `by: admission` 的是那一件）；`modality-converter`、`default-retry` 是占位，正式能力标识归各自 owner（[G-3](contract.md#十三已知缺口)）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

## 1. `before_action`：租户的改写件在前，放行判断在末位出卡，答完回放

**局面**：会话的装配清单在 `before_action` 上依次列着 `admission`（系统放行判断，可否决）与 `path-normalizer`（租户写的，可改写：把相对路径补成工作区绝对路径）。
模型这一次只要做一个动作 `call_07`：`shell`，参数 `{"command": "rm -rf build"}`。运行 `run_9a`，执行尝试 1。

**链**：runner 按清单读出两件，**把 `admission` 移到末位**——链是 `path-normalizer` → `admission`（[S-6](contract.md#s-6-拓展件链从装配清单来)）。

| 步 | 发生了什么 | 落下的结论记录 | 依据 |
|---|---|---|---|
| 1 | `dispatch(before_action, —, actions=[{call: call_07 的完整调用, definition, batch: [call_07]}], anchors=[anc_call_07], manifest, run_9a, 1, admission={report: 尝试 1 开始时拿到的可用性报告, grants, runMode})`——这一批只有一个动作，`actions` 恰凑成 `batch`；`anc_call_07` 是 loop 为这一次经过算出、交来的锚（[S-5](contract.md#s-5-一次经过)；占位写法，runner 不解析它），答完回放时它交同一把；报告带的会话与运行就是 `manifest` 指认的会话与 `run_9a`，runner 核过；不是子会话，不带 `parent` | —— | [S-21](contract.md#s-21-dispatch一次经过) ① |
| 2 | `path-normalizer` 拿到原参数、`earlier = []`，交回 `rewrite` | 见下 ① | [S-10](contract.md#s-10-逐件顺序求值先落后算)、`data.loop-extension/v5#S-23` |
| 3 | ① 落进日志之后，走到放行判断那一格的只有 `call_07`；runner 以它调用块里的 `tool`（`shell`，模型面名字）在报告的 `effectivePermissions` 里查到那一项——这一轮就是它；runner 对这一轮发起**一次** `admit`（执行权限与 `tenantAutoWritable` 取那一项，`grants`、`runMode` 取 `admission` 带来的），`admission` 这一件拿到的 `subject.call.arguments` 是**改写后的**那一份，`earlier = [①]`；它判出「要问人」，交回 `ask` | 见下 ② | [S-24](contract.md#s-24-before_action-上的改写与生效参数)、[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 5 条 |
| 4 | `dispatch` 返回 `[{conclusions: [①, ②], effect: asked{card: ② 的草稿, by: admission}}]`（与 `actions` 同序）；loop 经等待原语把卡片落进池子，运行进等人；协程被回收 | —— | [S-15](contract.md#s-15-效果怎么合成)、[S-21](contract.md#s-21-dispatch一次经过) ⑤、[S-27](contract.md#s-27-ask交出卡片并停在这一位置) |

① `path-normalizer` 的最终结论（**这就是那一条「生效参数」**，模型回复里的原参数不动）：

```json
{
  "extension": "path-normalizer",
  "position": "before_action",
  "power": "rewrite",
  "callId": "call_07",
  "output": {
    "kind": "rewrite",
    "subject": {
      "call": {
        "id": "blk_c7",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "kind": "tool_call",
        "complete": true,
        "callId": "call_07",
        "tool": "shell",
        "arguments": {
          "command": "rm -rf /work/proj/build"
        }
      },
      "definition": {
        "name": "shell"
      },
      "batch": [
        "call_07"
      ]
    }
  },
  "at": "2026-09-23T11:00:00Z"
}
```

② `admission` 的 `ask` 记录（非终结）。选项是放行判断定死的四档，**`id`、`label` 与含义归 `capability.tool-admission/v2#S-15`**，这里照抄；说明文字从简：

```json
{
  "extension": "omne-official:admission-judgment",
  "position": "before_action",
  "power": "veto",
  "callId": "call_07",
  "output": {
    "kind": "ask",
    "card": {
      "explanation": "要删除 /work/proj/build 整个目录。",
      "options": [
        {
          "id": "deny",
          "label": "不允许"
        },
        {
          "id": "allow_once",
          "label": "这次允许"
        },
        {
          "id": "allow_session",
          "label": "本会话内，这类情况都允许"
        },
        {
          "id": "allow_tenant",
          "label": "将来本租户所有会话，这类情况全允许"
        }
      ],
      "about": {
        "position": "before_action",
        "callId": "call_07"
      }
    }
  },
  "at": "2026-09-23T11:00:01Z"
}
```

**人在卡片上选了「这次允许」（`allow_once`），这一批答完。**执行尝试 2 在 `before_action` 上以同一组 `actions`（只有 `call_07`）再调一次 `dispatch`，`admission.report` 是尝试 2 开始时拿到的那一份：

| 步 | 发生了什么 | 依据 |
|---|---|---|
| 5 | runner 读出这一次经过已落的 [①, ②]，核对它们是此刻的链的前缀（`path-normalizer`、`admission`，同名同序）——对得上 | [S-28](contract.md#s-28-回放) 第 1 条 |
| 6 | `path-normalizer` 已有最终结论，**不再求值** | [S-28](contract.md#s-28-回放) 第 2 条 |
| 7 | ② 是 `ask`、这一批已答完 ⇒ **回放 `admission`**：输入与步 3 逐值相同（同一个 `subject`、同一串 `earlier`），新句柄读得到 ② 与那条答复；它的答复是 `allow_once`——取自**它自己**那张卡（[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 8 条）；**不出第二张卡** | [S-28](contract.md#s-28-回放) 第 4 条、[S-9](contract.md#s-9-日志只读句柄的读面) |
| 8 | `admission` 交回 `observed`，另落一条最终结论 ③ | [S-11](contract.md#s-11-每件恰一条最终结论落进会话日志) |
| 9 | 返回 `[{conclusions: [①, ②, ③], effect: proceed{subject: ① 里的那一份}}]`；这一批只有这一个动作、已判完，放行凭据随之交出（怎样交出是 [G-16](contract.md#十三已知缺口)）；loop 照 `rm -rf /work/proj/build` 执行 | [S-15](contract.md#s-15-效果怎么合成)、[S-24](contract.md#s-24-before_action-上的改写与生效参数) 第 5 条 |

③：

```json
{
  "extension": "omne-official:admission-judgment",
  "position": "before_action",
  "power": "veto",
  "callId": "call_07",
  "output": {
    "kind": "observed"
  },
  "at": "2026-09-23T11:04:12Z"
}
```

- **判的、签的、执行的是同一份**：`admission` 两次拿到的都是改写后的参数；它之后链上没有件（P-4）。
- **若清单把 `path-normalizer` 排在 `admission` 之后**，结果完全相同——末位由 runner 强制，不靠清单。
- **若人选了「不允许」**，③ 是一条 `veto`，`reason` 原样带着放行判断的拒绝原因 token `human_refused`（[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 6 条），效果 `vetoed{by: admission}`：agent 拿到「不许做」及来由，不是执行失败（[S-23](contract.md#s-23-效果之后的事由谁做)）。
- **若人没点选项、写了一句「build 目录可以随便删」**：那不是答复。那句话先落成一笔授权表达，`admission` 再**不带答复**重判；算得出就照办，算不出就**再出一轮卡**（第二条 `ask` 记录、一张新卡），答过的那张不再出（[S-28](contract.md#s-28-回放) 第 4 条）。
- **再调一次 `dispatch`**（步 9 之后又停机）：三条记录都在，**一件都不求值**，原样返回同一个结果（[S-18](contract.md#s-18-同一位置同一次经过只跑一轮)）。

## 2. `after_model_call{failure}`：第一个 `retry` 胜出；被拒的 `retry` 按上交继续

**局面**：链是 `tenant-retry`（租户写的，可改写，清单在前）→ `default-retry`（系统重试件，可改写）。

### 2a. 第一个 `retry` 胜出

主体的局部摘录 `{"failure": "upstream_unavailable", "statusCode": 503}`；完整输入还带 profile、dispatches 和 retryConclusions（见第 8 节），两支调用身份均为 mc_2b77。

| 件 | 结论 | 效果 |
|---|---|---|
| `tenant-retry` | `retry { plan: { provider: "provider-b", after: "PT2S" } }`——runner 问 `canDispatchAgain(session, callId, plan)`（`plan` 就是这条 `retry` 带的）得 `{allowed}`（未终结、未开口、不属事实三类、`provider-b` 在档案允许的供应商里） | **链到此为止** |
| `default-retry` | **不被求值，没有记录** | —— |

效果 `retry{plan: {provider: "provider-b", after: "PT2S"}}`，交给模型请求运行时再发一次（[S-15](contract.md#s-15-效果怎么合成)、[S-26](contract.md#s-26-retry-与它被拒)）。

### 2b. `retry` 被运行时拒绝

主体的局部摘录 `{"failure": "interrupted_mid_reply"}`——已经开口说话了。

| 件 | 发生了什么 | 落下的记录 |
|---|---|---|
| `tenant-retry` | 交回 `retry`；`canDispatchAgain` 答 `{refused{why: already_spoke}}` ⇒ 这一次按报错处置；有效策略是可改写档的默认 `record` | 见下 ④ |
| `default-retry` | **接着被求值**（`record` 落下的是一条提醒，不终止这一次经过），它按已开口不再试，交回 `observed` | `{"extension": "default-retry", "position": "after_model_call", "dimension": {"ending": "failure"}, "modelCallId": "mc_2b77", "power": "rewrite", "output": {"kind": "observed"}, "at": "2026-09-23T11:10:01Z"}` |

④：

```json
{
  "extension": "tenant-retry",
  "position": "after_model_call",
  "dimension": {
    "ending": "failure"
  },
  "power": "rewrite",
  "skipped": "errored",
  "error": "运行时拒绝重试（canDispatchAgain: already_spoke）：这次调用已开口",
  "output": {
    "kind": "inject",
    "message": {
      "id": "msg_r3",
      "type": "system_reminder",
      "blocks": [],
      "createdAt": "2026-09-23T11:10:00Z",
      "nature": "event",
      "source": {
        "kind": "extension",
        "extension": "tenant-retry"
      }
    }
  },
  "at": "2026-09-23T11:10:00Z",
  "modelCallId": "mc_2b77"
}
```

（提醒的内容块从略，只说「本件这一次没跑成」；`id` 与 `createdAt` 由谁给是 [G-5](contract.md#十三已知缺口)。）

效果 `proceed`——**这一层试尽、上交**；经过走完时 `msg_r3` 追加一次（[S-19](contract.md#s-19-注入的提醒怎样追加)）。**拒绝在日志里看得见，不卡住**（[S-26](contract.md#s-26-retry-与它被拒) 第 3 条）。

**变体**：若 `tenant-retry` 是可否决档、报错策略缺省（`treat_as_veto`），同样被拒的 `retry` 在这一位置落 `stop { terminal: failed }`——它**终止**这一次经过，`default-retry` 不被求值，效果 `stopped{by: tenant-retry}`，运行落「失败」（[S-26](contract.md#s-26-retry-与它被拒) 第 3 条、[S-13](contract.md#s-13-报错处置策略的执行)）。

### 2c. 系统重试件不可用

主体同 2a，`tenant-retry` 交回 `observed`，`default-retry` 的依赖此刻不在：记 `skipped: unavailable`、**不带 `output`**、`unavailability: fallback`；指定挂件「一律不重试」顶上，效果 `proceed`，上交（[S-17](contract.md#s-17-系统自带件不可用时一律关门)）。**没有人替它编一个 `retry`。**

## 3. 停机之后接着同一次经过，以及接不上的时候

**局面**：`before_model_call` 的链是 `ctx-note`（可改写：注入一条「今天是周五，别发版」的提醒）→ `cheap-router`（可改写：`select_model`）→ `budget-guard`（可否决）。运行 `run_9a`，执行尝试 3。

| 步 | 发生了什么 | 依据 |
|---|---|---|
| 1 | `ctx-note` 交回 `inject`（提醒 `msg_n1`），落记录 | [S-10](contract.md#s-10-逐件顺序求值先落后算) |
| 2 | `cheap-router` 交回 `select_model{profile: fast-small}`；模型请求运行时判它在合法目标里；落记录 | [S-14](contract.md#s-14-结论合不合法两类判断) ② |
| 3 | **进程崩溃**：`budget-guard` 正在求值，没有记录；`msg_n1` 还没追加 | [S-34](contract.md#s-34-撤下回收与取消时在途的经过) |
| 4 | 执行尝试 4 对同一次经过 `dispatch`：前两件对得上此刻的链，**不再求值**；`budget-guard` **重新求值**（它的第一次没有留下任何东西，不是回放），交回 `observed` | [S-28](contract.md#s-28-回放) 第 2、5 条 |
| 5 | 经过走完：日志里没有 `msg_n1` ⇒ 追加一次 | [S-19](contract.md#s-19-注入的提醒怎样追加) 第 2 条 |
| 6 | 效果 `proceed{subject}`，`subject.request.target` 是 `fast-small`；因为这一次经过有注入，**loop 重新组装一次请求、不再回到这个位置**，发出去的是重新组装的 `messages` ＋ 合成后的参数与目标 | [S-25](contract.md#s-25-before_model_call-上的换模型与重新组装) |

- **尝试 3 那副协程若还活着**、想往这一次经过写 `budget-guard` 的结论：写入被尝试栅栏拒收，它得到 `attemptSuperseded`（[S-21](contract.md#s-21-dispatch一次经过) ⑥）。
- **接不上的一支**：步 3 之后、步 4 之前，装配清单被改成不再有 `cheap-router`。步 4 读出的 [`ctx-note`, `cheap-router`] 不是此刻的链 [`ctx-note`, `budget-guard`] 的前缀 ⇒ **`replayInconsistent`**；日志里**没有任何新结论**，已有的两条一条不少，`msg_n1` 也不追加（[S-28](contract.md#s-28-回放) 第 1 条）。之后这个运行怎么收归 agent loop（[G-8](contract.md#十三已知缺口)）。

## 4. `before_persist_message`：模型回复只许否决或挂派生表示

**局面**：装配清单在 `before_persist_message` 上依次列着 `modality-converter`（系统）与 `pii-scrubber`（租户，可改写：把手机号打码）。
runner 把 `modality-converter` 移到末位——链是 `pii-scrubber` → `modality-converter`（[S-6](contract.md#s-6-拓展件链从装配清单来)）。
一条 `producer = model` 的回复要落盘，内含一段文字与一个图块。`run`、`attempt` 必带（[S-21](contract.md#s-21-dispatch一次经过) ①）。

| 件 | 交回 | runner 判 | 落下的记录 |
|---|---|---|---|
| `pii-scrubber` | `rewrite`：把文字里的手机号打码 | **不生效**：模型回复落盘之前只开放否决（[S-14](contract.md#s-14-结论合不合法两类判断) ② 第二行）⇒ 按报错处置，`record` | `skipped: errored`，`error` 写「落盘前不得改写模型产出的消息」，`output` 是一条以它名义的「没跑成」提醒 |
| `modality-converter` | `rewrite`：给图块挂上派生表示与 transcript，其余逐值不变 | **生效**：挂派生表示、且来自系统模态转换件（[S-14](contract.md#s-14-结论合不合法两类判断) ② 前两行） | 那条 `rewrite` |

效果 `proceed{subject}`：落盘的是**原文**加上图块的派生表示；`pii-scrubber` 的「没跑成」提醒在这条回复**之前**追加（[S-19](contract.md#s-19-注入的提醒怎样追加) 第 1 条）。

**两支变体：**

- **`modality-converter` 此刻不可用**：它记 `skipped: unavailable`、不带 `output`、`unavailability: fallback`；这条回复含图块 ⇒ 指定挂件「一律当转换失败」顶上，**效果 `vetoed{by: modality-converter}`**：回复不落盘、那次调用照常结束、响应体记 `replyDisposition = vetoed`、不触发 `after_model_call`；runner 追加一条以它名义的提醒「这一件此刻不在，回复未落盘」，并把这次计进连续被否决的回复数（[S-17](contract.md#s-17-系统自带件不可用时一律关门)、[S-23](contract.md#s-23-效果之后的事由谁做)、[S-30](contract.md#s-30-连续被否决的回复)）。
  **同一时刻一条纯文字的回复照常落盘**——只有不可用记录，效果不变。
- **一件外来件交回同样形状的「挂派生表示」**：不生效，按报错处置（[S-14](contract.md#s-14-结论合不合法两类判断) ② 第一行）。

## 5. 几种不产出效果的收场

| 调用 | 预期 | 为什么不是别的 | 依据 |
|---|---|---|---|
| 对一个没有装配清单的会话在 `before_action` 上 `dispatch` | **`manifestMissing`**，没有记录、没有效果；动作不执行 | 当成空链会跳过放行判断——静默放行 | [S-16](contract.md#s-16-缺席时的默认答案) |
| 装配清单此刻读不到 | **`unavailable`** | 「读不到」不是「没有」 | [S-16](contract.md#s-16-缺席时的默认答案)、[S-33](contract.md#s-33-依赖的提供者不可用) |
| `position = "before_everything"` | **`positionUnknown`** | 不在十一个里 | [S-21](contract.md#s-21-dispatch一次经过) ⑥ |
| `before_persist_message` 上 `producer = user`，却带了 `run` | **`invalidInput`** | 外面进来的消息不属于任何运行 | [S-21](contract.md#s-21-dispatch一次经过) ① |
| `select_model` 的合法目标集合此刻算不出来 | **`unavailable`**，停在那一件之前，它没有记录 | 判不出来 ≠ 判为不合法 | [S-14](contract.md#s-14-结论合不合法两类判断) |
| `replay` 一次从没开始过的经过 | **空列表** | 与「读不到」（`unavailable`）是两个值 | [S-22](contract.md#s-22-replay从日志重建一次经过) ⑤ |
| 一批 `[c1, c2]` 只带 `[c1]` 调 `dispatch`（拆批；`c2` 解析成功） | **`invalidInput`**，没有记录 | `batch` 里的 `c2` 不在 `actions` 里、又不是解析不了的调用；接受子集会让这一轮的 `admit` 看不到整批 | [S-21](contract.md#s-21-dispatch一次经过) ⑥ |
| 一批 `[c1, c2]`，`c2` 参数收齐却解析不了；只带 `[c1]`、`batch = [c1, c2]` 调 `dispatch` | **正常受理**：`c1` 一次经过，`c2` 不过这一关 | 解析不了的调用不进 `actions`、仍列在 `batch` 里，收场归执行运行时 | [S-21](contract.md#s-21-dispatch一次经过) ①、[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 1 条 |
| `before_action` 上不带 `admission`，或带了另一个运行的报告，或带了同一运行上一次尝试（`attempt = 1`，这一次是 `2`）的报告 | **`invalidInput`**，没有记录 | runner 不替这一次尝试现算一份报告，也不认别的运行、别的尝试的那一份——核会话、运行、尝试三者（D-060 §八 M46） | [S-21](contract.md#s-21-dispatch一次经过) ①、[S-16](contract.md#s-16-缺席时的默认答案) |
| 连续否决上限这项运行时设置此刻读不到 | **`unavailable`** | 读不到不是「没有上限」 | [S-30](contract.md#s-30-连续被否决的回复) 第 3 条 |
| `before_action` 链 `budget-guard` → 兼容件 `hooks.claude_code.…PreToolUse.1.1` → `admission`；`budget-guard` 已落 `observed`，兼容件的子进程还在跑时用户取消这个运行，取消请求落日志后调用方叫停这一次 `dispatch` | **`cancelled`**：`budget-guard` 那条结论在；兼容件收到停止信号、子进程被停下，**它没有记录**；`admission` 没被求值、没有 `admit`；没有提醒、没有效果 | 不是报错（叫停不是那一件出了错，不按策略落 `veto`）；不是不可用（它已经开始了，也不跳过接着求 `admission`）；不是 `unavailable`（不是判不出来，运行已被取消，没有下一次尝试接着它） | [S-21](contract.md#s-21-dispatch一次经过) ②⑥、[S-34](contract.md#s-34-撤下回收与取消时在途的经过)；D-060 §八 M39 |

## 6. 不可用处置：租户件按声明，放行判断整批失败按报错

**6a. 声明了「不可用即否决」的租户把关件。**`before_action` 链是 `injection-guard`（租户挂上的，声明 `unavailability: veto`，求得 `veto` 档）→ `admission`。这一批只有 `call_11`。`injection-guard` 依赖的检测服务此刻不在：

```json
{
  "extension": "injection-guard",
  "position": "before_action",
  "power": "veto",
  "callId": "call_11",
  "skipped": "unavailable",
  "unavailability": "veto",
  "at": "2026-09-24T09:00:00Z"
}
```

效果 `vetoed{by: injection-guard}`，`admission` 不被求值、没有 `admit`；agent 读到的来由是「这一件此刻不在，按否决处置」（[S-12](contract.md#s-12-不可用与报错runner-怎么分)、[S-23](contract.md#s-23-效果之后的事由谁做)）。
同一件若被某一层收窄成 `rewrite` 档，这一次记 `unavailability: skip`、链继续到 `admission`——它不在时能做的，不多于它在时能做的。

**6b. `admit` 对一轮整批失败。**一批 `[call_21, call_22]` 都走到末位，这一轮的那一次 `admit` 以 `unavailable` 失败。两项各落一条：

```json
{
  "extension": "omne-official:admission-judgment",
  "position": "before_action",
  "power": "veto",
  "callId": "call_21",
  "skipped": "errored",
  "error": "放行判断没有给出结论：unavailable",
  "output": {
    "kind": "veto",
    "reason": "放行判断没有给出结论（本件报错，按 treat_as_veto 处置）"
  },
  "at": "2026-09-24T09:05:00Z"
}
```

`call_22` 同形。两项效果都是 `vetoed{by: admission}`；`reason` 不借用任何一个拒绝原因 token（[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 6、7 条；记录形状与 `capability.tool-admission/v2#S-29`、`#S-34` 一致）。**放行判断不可用**（不是 `admit` 失败）时则是两条 `skipped: unavailable`、`unavailability: fallback`、不带 `output`，效果同为 `vetoed`（[S-17](contract.md#s-17-系统自带件不可用时一律关门)）。

**6c. 报告里查不到条目。**一批 `[call_31, call_32]` 都走到末位：`call_31` 调的是作者写的工具 `grep`；`call_32` 的 `tool` 是 `gh__create_issue`，而组织在这次尝试开始前禁用了接入点 `gh`——这一次尝试的可用性报告里没有它的任何动作条目。
runner 以 `grep` 在 `admission.report` 的 `effectivePermissions` 里查到那一项，以 `gh__create_issue` 查不到：这一轮的 `admit` 输入恰是 `call_31`；`call_32` **不进** `admit`，它那次经过在放行判断那一格落一条 `observed`（原因 `no_such_entry`，这个原因在记录上的落处是 [G-19](contract.md#十三已知缺口)），效果 `proceed`、**没有放行凭据**；执行运行时收到它时即刻收场 `unavailable{no_such_entry}`（那一侧的条款）。`call_31` 照常判——**不因 `call_32` 被牵连成全拒**（[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 5 条；主线裁定，见 D-060 §七 M10）。

## 7. 兼容件的非阻断错误：固定按 `ignore`，记录与越档同形

**局面**：`before_action` 链是一件兼容件 `hooks.claude_code.‹D›.PreToolUse.1.1`（求得 `veto` 档，`onError` 缺席 ⇒ 有效策略本是 `treat_as_veto`）→ `admission`。这一批只有 `call_41`。兼容件的子进程起来之后以退出码 1 结束（`‹D›` 是占位，实际是那 64 位十六进制）。

| 兼容件报来的收场 | runner 怎样处置 | 落下的记录 | 效果 |
|---|---|---|---|
| **非阻断错误**，成因「非零退出」，退出码 1 | **固定按 `ignore`**，不取有效策略 `treat_as_veto`（[S-13](contract.md#s-13-报错处置策略的执行) 兼容件非阻断错误那一条） | 见下 | 链往下走，`admission` 照常判 |
| 同上，成因「超时」或「输出不合形状」 | 同上 | 同形，`error` 换成那一种成因 | 同上 |
| **起来之后执行环境被撤下**（不是非阻断错误） | 按有效策略 `treat_as_veto` | `skipped: errored`，`output` 为 `veto`（`reason` 由 runner 写：本件报错，按 treat_as_veto 处置） | `vetoed`，`admission` 不被求值 |
| 一件**原生件**报了错，自称「非阻断」 | **不采用**：按它自己的有效策略 | 按那一档 | 按那一档 |

```json
{
  "extension": "hooks.claude_code.‹D›.PreToolUse.1.1",
  "position": "before_action",
  "power": "veto",
  "callId": "call_41",
  "skipped": "errored",
  "error": "非阻断错误：非零退出，退出码 1",
  "output": {
    "kind": "observed"
  },
  "at": "2026-09-25T10:00:00Z"
}
```

**与越档那一条同形**（`skipped: errored` ＋ `error` ＋ `output: observed`，`data.loop-extension/v5#S-31`「可用却报错」那一种）；区别只在 `error`：越档恰为拒绝值 `output_not_allowed_for_power`，这里是一段说明（`data.loop-extension/v5#S-38`）。**反例**：落成一条不带 `skipped`、`error` 的 `observed`——读日志的人看不出这一关出过错，就是静默吞错。

## 8. v4：完整绑定的失败主体，经真实守卫交回 retry

这是本轮精确消费演进的完整动作链规范场景，沿 S-10、S-14、S-21、S-26。运行时已将一次首 token 之前的 503 发出结算到 `awaiting_decision`；本次调用未终结，档案允许另一家供应商，`allowFallback` 为 true。装配已经完成确认并开闸，日志是真实可追加日志、尝试栅栏已建立；确认前不受理的义务由装配承担，此处不新增 runner 操作或输入参数。

`dispatch` 外层由调用方给出同一会话的 manifest、run、当前 attempt 及明确 anchor；它们不作为秘密上下文隐式取得。manifest 与 anchor 不透传给拓展件；run 与 attempt 按 LC5 的既有输入规则显式交入。链为 `tenant-retry` → `default-retry`（示例名，沿前文占位说明）。下面是第一件实际应收到的完整输入。

### R4-E1 完整 ExtensionInput

校验对象：`data.loop-extension/v5#/$defs/ExtensionInput`。预期 Schema：`通过`。还需纯判定核对：profile 与 dispatches 的快照来自同次调用；每条已出门记录的两份绑定相等、模型定义 ID 匹配引用路由名。配置是规范实例的示例值，不是生产供应商默认。

```json
{
  "position": "after_model_call",
  "dimension": {
    "ending": "failure"
  },
  "run": "run_runner_v3",
  "attempt": 1,
  "subject": {
    "failure": "upstream_unavailable",
    "statusCode": 503,
    "profile": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 10485760
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "dispatches": [
      {
        "kind": "model_call_dispatched",
        "call": "mc_2b77",
        "dispatch": 1,
        "provider": "anthropic",
        "response": "resp_e6a001",
        "profile": {
          "origin": "custom",
          "scope": {
            "layer": "organization",
            "organization": "org_7fd2c1"
          },
          "routeName": "anthropic/claude-sonnet-4.5"
        },
        "profileSnapshot": {
          "adaptation": {
            "implementation": {
              "name": "example-family",
              "revision": "impl-1"
            },
            "definition": {
              "modelId": "anthropic/claude-sonnet-4.5",
              "revision": "model-1"
            },
            "configuration": {
              "revision": "config-1",
              "values": {}
            }
          },
          "providers": [
            "anthropic",
            "amazon-bedrock",
            "google-vertex",
            "openai"
          ],
          "allowFallback": true,
          "inputModalities": [
            "text",
            "image"
          ],
          "outputModalities": [
            "text",
            "image"
          ],
          "maxInputTokens": 200000,
          "maxOutputTokens": 64000,
          "updatedAt": "2026-09-20T08:00:00Z",
          "inputConstraints": {
            "maxImageBytes": 10485760
          },
          "upstreamInputLimits": {
            "maxInputTokens": {
              "status": "unknown"
            },
            "maxRequestBytes": {
              "status": "unknown"
            },
            "maxImageBytes": {
              "status": "unknown"
            },
            "maxImages": {
              "status": "unknown"
            }
          }
        },
        "adaptation": {
          "implementation": {
            "name": "example-family",
            "revision": "impl-1"
          },
          "definition": {
            "modelId": "anthropic/claude-sonnet-4.5",
            "revision": "model-1"
          },
          "configuration": {
            "revision": "config-1",
            "values": {}
          }
        },
        "parameters": {
          "temperature": 0.2
        },
        "selectedBy": "session",
        "credentialScope": {
          "layer": "tenant",
          "tenant": {
            "organization": "org_7fd2c1",
            "account": "acc_91ab40"
          }
        }
      }
    ],
    "retryConclusions": []
  },
  "earlier": [],
  "log": "log_runner_v3",
  "environment": "environment_runner_v3"
}
```

### R4-E2 守卫放行后必须落下的 Conclusion

校验对象：`data.loop-extension/v5#/$defs/Conclusion`。预期 Schema：`通过`。这是规范要求的日志值，不是一次实际执行的日志。

```json
{
  "extension": "tenant-retry",
  "position": "after_model_call",
  "dimension": {
    "ending": "failure"
  },
  "power": "rewrite",
  "output": {
    "kind": "retry",
    "plan": {
      "provider": "amazon-bedrock",
      "after": "PT2S"
    }
  },
  "at": "2026-09-27T12:00:00Z",
  "modelCallId": "mc_2b77"
}
```

| 顺序 | 必须观察到的交接 | 禁止的捷径 |
|---|---|---|
| 1 | runner 按 LC5 接收完整主体；原值含实现、模型定义、配置修订与精确 values，交给第一件 | 删除新字段以通过旧 LC2，或现读目录补当前绑定 |
| 2 | 第一件产生上列 retry；runner 调用 runtime/v3 的 `canDispatchAgain(session, callId, plan)`，得到 allowed | 在 runner 复制一份守卫表，或先发送再判断 |
| 3 | runner 经真实日志、当前 attempt 栅栏写入 R4-E2 结论，成功提交 | 只写诊断日志或内存标记就宣称结论成立 |
| 4 | 返回该结论及 `effect = retry{plan}`；第二件未求值、无结论记录 | 未提交即返回 retry，或让第二件覆盖第一条生效 retry |
| 5 | 调用方持效果交 runtime 的 `dispatchAgain`；后者再次核守卫，在同次调用原绑定上发出 | 把只读 allowed 当成发送资格，或用新的当前绑定替代原绑定 |
| 6 | 后续响应的 v4 route.adaptation 与已出门及原快照一致；上游实际供应商与费用按事实记录 | runner 另造响应体或修改上一次发出的事实 |

**失败分支必须同验**：

- R4-E1 的 `subject.profile.adaptation`、`dispatches[0].adaptation`、`dispatches[0].profileSnapshot.adaptation` 任一缺失：形状拒绝，runner 为原有 `invalidInput`，不求值、不落 retry。
- 单条记录两份绑定不同、definition.modelId 与 profile.routeName 不同，或顶层快照与记录不属于同次调用：Schema 可能通过，接收边界纯判定拒绝为 `invalidInput`，不以可读到当前配置为补救。
- 把未报告缓存计数或事实上未报告的实际供应商加进失败主体：它不是 LC5 的成员，表示拒绝；失败主体只沿既有公共形状传递，响应事实归 response/v4。
- 真守卫返回 refused{already_spoke}／refused{fact_class}／refused{provider_not_allowed}，或操作失败 alreadyEnded：沿 S-26 原策略落报错结论，不以原 retry 结论发出；用第 2b 节的 record 与 treat_as_veto 两支核对效果。
- 真守卫、日志或清单读不到/写不进：原 `unavailable`，不当作拒绝或 allowed；当前件没有最终结论，不返回 retry 效果。
- 守卫 allowed 后，结论提交被栅栏拒收：原 `attemptSuperseded`，旧协程不返回可执行 retry；已经提交的他项仍保留。
- runner 已落 retry 后、真正再发之前调用终结：由 runtime 再发检查拒绝，原结论不回写；这是 S-26 第 4 条既有竞争窗口，不是同提交保证。

回放与故障演练沿 S-28、S-35 原义务；本页形状和纯比较检查不能代替真实 runtime、日志或 Cordis 装配的上述执行证据。

## 9. 当前拓展表仍依 E1，另一个类别已提交 E2

真实装配先得 E1，`compositionOrder` 为 `[loop_extension:b, tool:t, loop_extension:a]`，`loop_extension` 当前表为 `[b,a]`，两个条目各自携带 E1 选定的资产版本。随后只 reload tool，提交 E2，E2 排列是 `[loop_extension:a, tool:u, loop_extension:b]`；再把旧拓展表中的 b 删除，追加沿用 E1 的 reuse，实际表成为 `[a]`。

必须观察到：runner 的 readHead 取当前 loop_extension 记录，按它的 filledAt 调 readHistory 仍得同会话那一条；content 保留 E1、E1 的原全排列与这次 filledBy，壳引用仍指 E1。实际链只有 a，声明来自 E1 的 EffectiveAsset 所选不可变版本，position/dimension/power 也来自 E1。即使全局 readEvaluation 返回 E2，runner 也不让 a/b 重排、不把 b 加回、不采用 E2 的属性或当前最新版正文。

| 变异 | 预期 |
|---|---|
| 当前表明确为空，且其完整内容、排列、求值均有效 | 资产链为空；系统件的既有关门义务仍执行 |
| 当前表成员或必要 content 缺席、顺序不是原排列的子序列 | unavailable；零件求值、无新结论，保留已有前缀 |
| reuse 将 E1 内容悄悄换成 E2，或记录/正文属于别的会话或版本 | 明确失败；已有清单内容/来源失配为 unavailable，manifest 本身属于别的会话为 manifestMissing |
| selected version 正文不可读或不合 LC5 声明，或缺 position/dimension/power 的必要项 | unavailable，不删掉该件继续 |
| 声明 rewrite，allowed 为 `{observe,rewrite}` | 有效 Power 恰 rewrite，沿原报错缺省得 record |
| 声明 veto，allowed 为 `{observe}` | 有效 Power 恰 observe |
| allowed 为空、含陌生 token，或声明 rewrite 却允许 veto | unavailable，不填 observe、不裁掉错误成员 |

这些是规范验收场景；Schema 通过不能证明 E1 是真实 evaluate 的结果、正文来自所选版本或读取源有权访问。

## 10. 提醒身份、创建时刻与并发占号

作者 inject 提供完整提醒 M（含 id、createdAt、source、content）；runner 自产提醒在结论提交前取得本日志唯一 ID 和当前 Instant，将该完整值记入结论。时钟或身份来源不可用为 unavailable，无当前件新结论，不填零值时间或空 ID。

| 情形 | 必须观察到 |
|---|---|
| 相同 id、相同完整耐久消息，含相同 source/content | 幂等认回，不追加第二条 |
| 作者输出前置核对发现相同 id、不同来源或内容 | 按输出不合法走该件原 onError；不能静默省略提醒 |
| 结论已落、提醒未追加就崩溃 | 回放使用原 id 和 createdAt；不重新生成，补尚缺提醒 |
| 结论已落后，并发其他消息抢先占同 id，内容不同 | 读回严格比较后 replayInconsistent；不返回效果，不改结论，不换新 ID，不追加替身 |
| alreadyRecorded 返回键，但消息读回不可用 | unavailable；不把未知内容当相同 |
| 数字精确值不同、布尔 false 对数字 0、数组顺序变化 | 都不是同一消息；对象仅成员次序变化不导致差异 |

碰撞检测与实际写入之间可以有竞争，因此必须跑“前置核对成功→结论提交→另一写入者占号→提醒 append 返回 alreadyRecorded→读回不同消息”全过程；单次顺序测试无法证明后置冲突处理。

## 11. canDispatchAgain 的全部收场映射

采用第 8 节完整失败主体；先用 LC5 校验 RetryPlan/Duration，再调用真实 runtime 守卫。默认重试件的标识沿 runtime6 S-67，出厂 Power 是原 S-26 的 rewrite，有效报错缺省是 record，不把 retry 或 record 当作 Power。

| 守卫收场 | 当前件与 dispatch |
|---|---|
| allowed | 先提交合法 retry 结论，再交回效果；真正再发仍再判 |
| refused{already_spoke/fact_class/provider_not_allowed} | 输出不合法，按原 onError 落报错结论，error 记实际 why |
| alreadyEnded、callNotFound、wrongPhase | 输出不合法，按原 onError 落报错结论，error 记实际失败名；不访问或编造 why |
| unavailable | dispatch unavailable；当前件没有新结论，不记录为作者输出错误 |
| invalidInput | dispatch invalidInput；当前件没有新结论，不归罪已通过 LC 校验的作者输出 |

每支都保留此前已提交的历史前缀。先让计划本身不合 LC 表示：在第一层拒绝，不调用守卫；合法计划的供应商不被允许走 refused{provider_not_allowed}。在 allowed 和 dispatchAgain 之间改变事实，后者拒绝时原 retry 结论仍不可回写。

## 12. v4：失败结论关联、完整历史与提交后回放

依据 [S-53](contract.md#s-53-失败结论的模型调用关联)、[S-54](contract.md#s-54-重试结论历史与回放)。这些是可失败规范场景；输入采用第 8 节完整值，下表仅列变动，A 表示同一供应商，C1/C2 表示同一 Run 的不同模型调用。默认件正式名字为 `omne-official:default-retry`（runtime6 S-67），次数与计划政策归该 owner。

| 输入或交错 | 必须可观察到 | 禁止结果 |
|---|---|---|
| dispatches 两条 `call` 都为 C1；第一条是失联续接来源，第二条策略故障；合法完整历史为 `[]` | 默认件收到原样空历史；可按 runtime6 自身规则给其第一次 retry | 按两条 dispatch 推断默认件已给过 |
| 同样两条 A 发出，历史有默认件 C1 的 retry 原结论 | 完整保留原 extension、modelCallId、output.plan、at；默认件已给过 | 仅凭供应商相同或续接次数把两例合并 |
| 自定义件 C1 给过 retry | 历史保留该原结论；不占默认件自己的次数 | 过滤掉自定义件，或替换其 extension 为默认件 |
| C1 有默认结论，C2 的完整前缀没有 | C2 收到明确 `[]`，C1 不耗 C2 的名额 | 使用 Run 内总数或最近一次 retry |
| retry 结论已提交，尚未发出即 crash | 重复 dispatch / replay 返回同一结论与效果；默认件调用次数不增加，持久结论不增加 | 因 dispatch 数没增加重跑默认件再给一次 |
| 两条合法原 retry 恰好 JSON 逐值相同，位于两个不同日志位置 | 两项原样保留且仍按日志顺序 | 集合化、按值去重、按 at 排序 |
| failure 主体缺 retryConclusions、dispatches 混 C1/C2，或带 C2 原结论 | invalidInput，零件求值前拒收、零新提交 | 用空数组、最近调用或默认身份修补 |
| 前缀不可读、无法确认完整性/归属 | unavailable，保留已有前缀 | 空历史、放行、静默跳过 |
| failure 上 observed / unavailable / errored / ask / retry 任一结论 | 写前已取得唯一 C1，每条结论 modelCallId=C1；完整结论一次提交 | 只有 retry 才带 modelCallId，工具 callId 顶替 |
| 非 failure 位置结论 | 不出现 modelCallId | 传播当前运行私有调用身份 |
| LC5 已落结论缺 modelCallId 或错为 C2 | replayInconsistent，不改历史、不返回效果 | 改成 C1 后假称重放成功 |
| 历史 LC4 结论没有 modelCallId | 按原版本历史读取；新写不得声称 LC5 合法 | 从当前目录/运行反填并启动新发送 |

完整输入的 image 快照保留原模态；新增示例 maxImageBytes 是 fixture 的项目供给值，四项上游事实明确 unknown，只表达该 fixture 的未知事实，绝非生产默认或真实供应商限制声明。
