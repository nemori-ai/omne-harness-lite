# 规范实例：一次经过怎样走、怎样收、怎样接着走

属于 `capability.loop-extension-runner` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**一次经过的输入 → 各件落下的结论 → 效果 → 依据条款**。结论记录的形状一律以 [`data.loop-extension` v1](../../../data/loop-extension/v1/contract.md) 为准。

**三条读法上的边界：**

- **标识串只是占位**：`run_9a`、`call_07`、`msg_r3` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）。
- **系统自带件的名字**：放行判断的 name 是 `omne-official:admission-judgment`（`capability.tool-admission/v1#S-26`），JSON 里照写、表格与正文里简写为 `admission`（**与 `dispatch` 的输入成员 `admission` 同词**：写成 `admission={…}` 的是输入，写成「`admission` 这一件」或效果里 `by: admission` 的是那一件）；`modality-converter`、`default-retry` 是占位，正式能力标识归各自 owner（[G-3](contract.md#十三已知缺口)）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

## 1. `before_action`：租户的改写件在前，放行判断在末位出卡，答完回放

**局面**：会话的装配清单在 `before_action` 上依次列着 `admission`（系统放行判断，可否决）与 `path-normalizer`（租户写的，可改写：把相对路径补成工作区绝对路径）。
模型这一次只要做一个动作 `call_07`：`shell`，参数 `{"command": "rm -rf build"}`。运行 `run_9a`，执行尝试 1。

**链**：runner 按清单读出两件，**把 `admission` 移到末位**——链是 `path-normalizer` → `admission`（[S-6](contract.md#s-6-拓展件链从装配清单来)）。

| 步 | 发生了什么 | 落下的结论记录 | 依据 |
|---|---|---|---|
| 1 | `dispatch(before_action, —, actions=[{call: call_07 的完整调用, definition, batch: [call_07]}], anchors=[anc_call_07], manifest, run_9a, 1, admission={report: 尝试 1 开始时拿到的可用性报告, grants, runMode})`——这一批只有一个动作，`actions` 恰凑成 `batch`；`anc_call_07` 是 loop 为这一次经过算出、交来的锚（[S-5](contract.md#s-5-一次经过)；占位写法，runner 不解析它），答完回放时它交同一把；报告带的会话与运行就是 `manifest` 指认的会话与 `run_9a`，runner 核过；不是子会话，不带 `parent` | —— | [S-21](contract.md#s-21-dispatch一次经过) ① |
| 2 | `path-normalizer` 拿到原参数、`earlier = []`，交回 `rewrite` | 见下 ① | [S-10](contract.md#s-10-逐件顺序求值先落后算)、`data.loop-extension/v1#S-23` |
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
        "visibility": { "toHuman": true, "toModel": true },
        "kind": "tool_call",
        "complete": true,
        "callId": "call_07",
        "tool": "shell",
        "arguments": { "command": "rm -rf /work/proj/build" }
      },
      "definition": { "name": "shell" },
      "batch": ["call_07"]
    }
  },
  "at": "2026-09-23T11:00:00Z"
}
```

② `admission` 的 `ask` 记录（非终结）。选项是放行判断定死的四档，**`id`、`label` 与含义归 `capability.tool-admission/v1#S-15`**，这里照抄；说明文字从简：

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
        { "id": "deny", "label": "不允许" },
        { "id": "allow_once", "label": "这次允许" },
        { "id": "allow_session", "label": "本会话内，这类情况都允许" },
        { "id": "allow_tenant", "label": "将来本租户所有会话，这类情况全允许" }
      ],
      "about": { "position": "before_action", "callId": "call_07" }
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
  "output": { "kind": "observed" },
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

主体 `{"failure": "upstream_unavailable", "statusCode": 503}`。

| 件 | 结论 | 效果 |
|---|---|---|
| `tenant-retry` | `retry { plan: { provider: "provider-b", after: "PT2S" } }`——runner 问 `canDispatchAgain(session, callId, plan)`（`plan` 就是这条 `retry` 带的）得 `{allowed}`（未终结、未开口、不属事实三类、`provider-b` 在档案允许的供应商里） | **链到此为止** |
| `default-retry` | **不被求值，没有记录** | —— |

效果 `retry{plan: {provider: "provider-b", after: "PT2S"}}`，交给模型请求运行时再发一次（[S-15](contract.md#s-15-效果怎么合成)、[S-26](contract.md#s-26-retry-与它被拒)）。

### 2b. `retry` 被运行时拒绝

主体 `{"failure": "interrupted_mid_reply"}`——已经开口说话了。

| 件 | 发生了什么 | 落下的记录 |
|---|---|---|
| `tenant-retry` | 交回 `retry`；`canDispatchAgain` 答 `{refused{why: already_spoke}}` ⇒ 这一次按报错处置；有效策略是可改写档的默认 `record` | 见下 ④ |
| `default-retry` | **接着被求值**（`record` 落下的是一条提醒，不终止这一次经过），它按已开口不再试，交回 `observed` | `{"extension": "default-retry", "position": "after_model_call", "dimension": {"ending": "failure"}, "power": "rewrite", "output": {"kind": "observed"}, "at": "2026-09-23T11:10:01Z"}` |

④：

```json
{
  "extension": "tenant-retry",
  "position": "after_model_call",
  "dimension": { "ending": "failure" },
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
      "source": { "kind": "extension", "extension": "tenant-retry" }
    }
  },
  "at": "2026-09-23T11:10:00Z"
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
| `before_action` 上不带 `admission`，或带了另一个运行的报告，或带了同一运行上一次尝试（`attempt = 1`，这一次是 `2`）的报告 | **`invalidInput`**，没有记录 | runner 不替这一次尝试现算一份报告，也不认别的运行、别的尝试的那一份——核会话、运行、尝试三者（[D-040 §八 M46](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | [S-21](contract.md#s-21-dispatch一次经过) ①、[S-16](contract.md#s-16-缺席时的默认答案) |
| 连续否决上限这项运行时设置此刻读不到 | **`unavailable`** | 读不到不是「没有上限」 | [S-30](contract.md#s-30-连续被否决的回复) 第 3 条 |
| `before_action` 链 `budget-guard` → 兼容件 `hooks.claude_code.…PreToolUse.1.1` → `admission`；`budget-guard` 已落 `observed`，兼容件的子进程还在跑时用户取消这个运行，取消请求落日志后调用方叫停这一次 `dispatch` | **`cancelled`**：`budget-guard` 那条结论在；兼容件收到停止信号、子进程被停下，**它没有记录**；`admission` 没被求值、没有 `admit`；没有提醒、没有效果 | 不是报错（叫停不是那一件出了错，不按策略落 `veto`）；不是不可用（它已经开始了，也不跳过接着求 `admission`）；不是 `unavailable`（不是判不出来，运行已被取消，没有下一次尝试接着它） | [S-21](contract.md#s-21-dispatch一次经过) ②⑥、[S-34](contract.md#s-34-撤下回收与取消时在途的经过)；[D-040 §八 M39](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |

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
  "output": { "kind": "veto", "reason": "放行判断没有给出结论（本件报错，按 treat_as_veto 处置）" },
  "at": "2026-09-24T09:05:00Z"
}
```

`call_22` 同形。两项效果都是 `vetoed{by: admission}`；`reason` 不借用任何一个拒绝原因 token（[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 6、7 条；记录形状与 `capability.tool-admission/v1#S-29`、`#S-34` 一致）。**放行判断不可用**（不是 `admit` 失败）时则是两条 `skipped: unavailable`、`unavailability: fallback`、不带 `output`，效果同为 `vetoed`（[S-17](contract.md#s-17-系统自带件不可用时一律关门)）。

**6c. 报告里查不到条目。**一批 `[call_31, call_32]` 都走到末位：`call_31` 调的是作者写的工具 `grep`；`call_32` 的 `tool` 是 `gh__create_issue`，而组织在这次尝试开始前禁用了接入点 `gh`——这一次尝试的可用性报告里没有它的任何动作条目。
runner 以 `grep` 在 `admission.report` 的 `effectivePermissions` 里查到那一项，以 `gh__create_issue` 查不到：这一轮的 `admit` 输入恰是 `call_31`；`call_32` **不进** `admit`，它那次经过在放行判断那一格落一条 `observed`（原因 `no_such_entry`，这个原因在记录上的落处是 [G-19](contract.md#十三已知缺口)），效果 `proceed`、**没有放行凭据**；执行运行时收到它时即刻收场 `unavailable{no_such_entry}`（那一侧的条款）。`call_31` 照常判——**不因 `call_32` 被牵连成全拒**（[S-29](contract.md#s-29-一批动作每个动作一次经过) 第 5 条；主线裁定，见 [D-040 §七 M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。
