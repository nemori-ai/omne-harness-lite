# 规范实例：走通的路径与每个失败值的反例

属于 `capability.tool-execution-runtime` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前七节各走通一条路径，第八节给每个失败值一个反例，第九、十节是提交的判重与租户、执行者一侧的发帧。

**两条读法上的边界：**

- **标识串只是占位**：`ses_1`、`call_a`、`run_1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `T` | 会话 `ses_1` 持有的租户身份 |
| `run_1` | `ses_1` 里一次未终结的运行；`attempt = 1` |
| `rpt_1` | `ses_1`、`run_1` 这一次尝试（`attempt = 1`）开始时算出的可用性报告（`capability.asset-registry/v1#S-11`；它带的会话、运行、尝试就是这三者），loop 交给 runner `dispatch` 的 `admission.report` 就是它；本文件写作 `submit(..., [...])` 的调用都带它（[S-23](contract.md#s-23-提交一批) ①） |
| `build` | 工具：`allowBackground: true`，`backgroundThreshold: PT5M`，`timeout: PT30M`，没有 `concurrency` |
| `deploy` | 工具：没有 `allowBackground`（不能后台），没有 `timeout` |
| `confirm_plan` | 工具：执行中会进一次等待，挂一张决策卡片，不给到点 |
| `search_web` | 这次尝试里注册表放在原位上的**替换件**（对端连不上） |
| `fs` | 多命令工具；命令 `grep` 的说明是「按正则在文件里找行」，`input` 是 `{ path: string（必填，要找的路径）, pattern: string（必填，正则）, ignoreCase: boolean（可选，是否忽略大小写） }`、**没写** `additionalProperties`（判时按 `false` 读，`data.tool-definition/v1#S-5` 末条）；命令 `pwd` 的说明是「给出当前目录」，`input` 为 `{"type": "object", "properties": {}}`（不收任何参数键）；命令 `peek` 只带命令清单（`input` 为 `{"type": "object", "properties": {}, "additionalProperties": true}`） |
| `tok_*` | 放行凭据，各自绑定 `(ses_1, CallId, 生效参数)` |

「交付」指消息与执行记录在同一次写里定下、耐久地等着追加；「送达」指追加进会话日志成功（[S-19](contract.md#s-19-送达)）。

## 1. 前台完成

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | `submit(T, ses_1, run_1, 1, rpt_1, [{ call: build(call_a), admission: tok_a, environment: env_1, definition: {name: build} }])` | 参数合 `build` 的 `input`；`[{ callId: call_a, disposition: accepted{foreground} }]`；执行记录 `queued`；一条提交条目 | [S-23](contract.md#s-23-提交一批) ④ |
| 2 | 起执行者 | 落点到位、执行者起来 → `running`；一条起执行者条目 | [S-38](contract.md#s-38-起执行者) |
| 3 | loop `awaitForeground(T, ses_1, call_a)` | 等着 | [S-24](contract.md#s-24-等前台那一次调用落定) |
| 4 | 执行者 3 分钟后交回字符串 `"built 12 targets"` | 归一成只含一个文本块的 `ToolResult`；收场 `completed`；`subject.result` 带着它经过 `after_action`，卸载判定给「原样」 | [S-41](contract.md#s-41-交回)、[S-42](contract.md#s-42-结果落成消息之前的那一关) |
| 5 | 送达 | 一次写里：记录收场 `completed` ＋ `ToolCallAccount`（`startedAt` = 第 1 步那一刻，`endedAt` = 收场那一刻，`frames.emitted = 0`）＋ 一条 `ToolMessage{ outcome: completed }` ＋ 收场条目；之后 `execution.delivered{segment: call}` | [S-19](contract.md#s-19-送达)、[S-13](contract.md#s-13-账)、[S-45](contract.md#s-45-送达通知) |
| 6 | 第 3 步返回 | `{ callOutcome: completed }`，此刻 `ToolMessage` 已在日志里 | [S-24](contract.md#s-24-等前台那一次调用落定) |

**若第 3 步之后 agent runtime 被回收**：执行照跑；新协程读 Run 里记的「在等 `call_a`」再调一次第 3 步，得到同一个结果。

## 2. 前台被用户中断

接第 1 节第 2 步，`build` 在跑。

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | `interrupt(T, ses_1, call_a, user)` | **先**写收场 `interrupted{user_interrupted}`、账、占位 `ToolMessage` 交付、条目；**再**发停止 | [S-25](contract.md#s-25-中断一次执行)、[S-18](contract.md#s-18-收场先落停止后发) |
| 2 | 返回 | `{ logical: interrupted, physical: stopping, externalEffect: 不可确定 }` | [S-14](contract.md#s-14-停止与外部效果分开说) |
| 3 | 执行者因停止信号以错误退出 | **丢弃**：收场已有；不改收场、不再送达、不再落账；留一条条目 | [S-16](contract.md#s-16-首胜收场只写一次) |
| 4 | 宽限 `execution_stop_grace` 内停下 | 记录 `stop.physical = stopped` | [S-18](contract.md#s-18-收场先落停止后发) |
| 5 | 同一批里排在 `call_a` 后面的 `call_b` | 接着起：用户中断的是那一次执行，不是这一步 | [S-43](contract.md#s-43-一批依次与同一工具的并发上限) |

**agent 读到的是「这事不做了」**：`ToolMessage{ outcome: interrupted, reason: { code: user_interrupted } }`，不是失败。

## 3. 自动转后台，之后完成落一条提醒

`submit` 一批 `[build(call_a), deploy(call_b)]`。

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | `build` 在前台跑满 5 分钟（没进过等待） | 一次写：姿态改后台 ＋ 前台那一次调用收场 `backgrounded{backgrounded_auto}` ＋ 占位 `ToolMessage` 交付；执行者不受打扰 | [S-44](contract.md#s-44-前台上限与转后台阈值)、[S-27](contract.md#s-27-转后台) |
| 2 | `awaitForeground(call_a)` 返回 `backgrounded` | `call_b` 随即起执行者（前一项已落定） | [S-43](contract.md#s-43-一批依次与同一工具的并发上限) |
| 3 | `deploy` 完成、这一轮接着走，`run_1` 随后落终态 | —— | —— |
| 4 | 20 分钟后 `build` 交回 | 收场 `completed`；过 `after_action`；一次写：记录收场 ＋ 账（**归 `run_1`**，哪怕它已终结）＋ 一条 `SystemReminderMessage{ source: { kind: background_execution_finished, callId: call_a, outcome: completed } }`，排在占位之后 | [S-19](contract.md#s-19-送达)、[S-13](contract.md#s-13-账) |
| 5 | 通知 | `execution.delivered{segment: background}`；**要不要开一次新运行由 loop 读日志判**，不由这条通知 | [S-45](contract.md#s-45-送达通知) |

**`build` 在第 1 步之前若发过帧**：它的 `ToolInternalMessage` 与第 4 步的提醒一起送达、排在提醒之前（[S-39](contract.md#s-39-发帧)）。第 4 步落盘前那一关若由谁驱动还没定，停在 [G-6](contract.md#十二已知缺口)。

## 4. 等待态的答复：再次等待与迟到的答复

`confirm_plan(call_c)` 在前台跑。

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | 执行者进等待：形状 `{type: object, required: [choice]}`，卡片 `card_1`，不给到点 | 阶段 `waiting`，`waitIndex = 1`；条目 | [S-12](contract.md#s-12-等待) |
| 2 | 人答卡片 → `answerWait(T, ses_1, call_c, 1, { value: {choice: "A"}, by: 人 })` | `{ resumed: 1 }`；阶段回 `running`，答复交给执行者；**不落消息** | [S-30](contract.md#s-30-答复等待) |
| 3 | 执行者再进一次等待，卡片 `card_2` | `waitIndex = 2` | [S-12](contract.md#s-12-等待) |
| 4 | 第 2 步那条答复因重试又送来一次：`answerWait(..., 1, ...)` | **`notWaiting`**：它答的是第 1 次，第 2 次不受影响 | [S-30](contract.md#s-30-答复等待) ⑦⑧ |
| 5 | 另一个 agent 经 `Agents()` 回应：`answerWait(..., 2, { value: {choice: "B"}, by: agent })` | `{ resumed: 2 }`——同一入口 | [S-30](contract.md#s-30-答复等待) |
| 6 | 执行者交回 | 收场 `completed`，`ToolMessage`（前台，没有占位） | [S-19](contract.md#s-19-送达) |

**等待期间前台上限与阈值都不走**（[S-44](contract.md#s-44-前台上限与转后台阈值)）；**这时用户手动转后台 → `backgroundNotAllowed`**（本版等待只在前台，[S-27](contract.md#s-27-转后台)）。
**若第 1 步给了到点、到点时还没人答**：收场 `no_answer`，不是失败。

## 5. 卸载：原始结果存起来，占位落进消息

`build(call_a)` 前台交回一个 `ToolResult`：`content` 是一段摘要块，`offload = { raw: { inline: <40 MB base64>, mediaType: "text/plain" }, summary: [...] }`。

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | 交回检查 | 合形状、合声明 → 收场 `completed`；本能力**不看大小、不改姿态、不截断** | [S-41](contract.md#s-41-交回)、[S-8](contract.md#s-8-姿态与阶段两个维度) |
| 2 | 本能力存下声明卸载的原始结果（进那一关之前，不看卸载判定在不在） | 内联的 40 MB 存进存储，换成引用 `{ storage, key, mediaType: "text/plain", bytes: 41943040 }` | [S-36](contract.md#s-36-存一份原始结果)（[D-040 §S13 S13-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)） |
| 3 | `after_action`（`each`）：卸载判定拿到 `subject.result`，其中 `offload.raw` 已是第 2 步的引用 | 结论：改写结果块——`blocks` 是作者的摘要加「原始结果 40 MB、怎么取回」，`offloaded` 是那个引用；本能力照结论落 `ToolMessage`；**原始的 40 MB 从头到尾不进会话日志** | [S-42](contract.md#s-42-结果落成消息之前的那一关)；PF-012 §5.10 |

**卸载判定此刻不在**：第 2 步照做，原始结果照样存着；只记可见——落进块的是 `content`（作者的摘要块），`raw` 的位置上**只落第 2 步的引用、摘要缺席**，留一条「落盘前那一关不可用」的条目（[S-15](contract.md#s-15-缺席时的默认答案)、[S-42](contract.md#s-42-结果落成消息之前的那一关)）。
**存储未定义**，第 2 步停在 [G-7](contract.md#十二已知缺口)；存不下时收场照写、落盘写不下去就上交（[S-36](contract.md#s-36-存一份原始结果)）。

## 6. 停机：前台与后台各追补一条

`ses_1` 里 `deploy(call_b)` 在前台跑、`build(call_a)` 已转后台；`ses_2` 里没有协程、只剩一个后台执行 `call_z`；据点进程被杀。

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | 本能力重新起来，扫描完成之前 `awaitForeground(T, ses_1, call_b)` | `runtimeNotReady` | [S-20](contract.md#s-20-恢复扫描与停机不重来) |
| 2 | 恢复扫描 | 范围是**全部**未收场的记录，含 `ses_2` 的 `call_z`（那个会话没有协程要恢复）；每条先回收登记过的进程组，再首胜写 `failed{abnormal_interruption}`，外部效果「不可确定」，实际停止 `unconfirmed`，账的 `endedAt` **缺席**、`frames` 写 `"unknown"`（装配状态随活体没了，**不写 0**）；执行者停机前报过的钱（`reportedCost`）照样进账 | [S-20](contract.md#s-20-恢复扫描与停机不重来)、[S-13](contract.md#s-13-账) |
| 3 | 同一次写里交付 | `call_b`：`ToolMessage{ outcome: failed, reason: { code: abnormal_interruption } }`；`call_a`、`call_z`：`SystemReminderMessage{ source: { kind: background_execution_interrupted } }` | [S-19](contract.md#s-19-送达) |
| 4 | 执行者 | **一个都不重起** | [S-17](contract.md#s-17-持久意图先于外部效果) |
| 5 | 若 `call_b` 当时停在一张卡片上 | 请求把那张卡关闭为 `superseded`（产品正文的「已作废」；卡片契约未建立） | [S-20](contract.md#s-20-恢复扫描与停机不重来) 第 4 步、[G-5](contract.md#十二已知缺口) |
| 6 | loop 下一次尝试开始 `reconcile(T, ses_1)` | `{ settled: [] }`——扫描已处置过 | [S-32](contract.md#s-32-对账) |

**agent 看到的是「失败，原因异常中断」**：要不要再调由它决定；系统不替它断定那一次做没做过。

**上交之后撤下**（[S-41](contract.md#s-41-交回) ⑤、[S-47](contract.md#s-47-依赖的提供者不可用)；[D-040 §七 M13](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：`deploy(call_b)` 交回时执行记录写不下去 ⇒ 交回得 `escalated`，本任撤下；loop 那副协程正在 `awaitForeground(T, ses_1, call_b)` ⇒ 返回 `runtimeStopped`，**不一直等**。
存储随后恢复，**这一任也不补写**那次交回；下一任起来后照上表第 2～3 步把 `call_b` 落 `failed{abnormal_interruption}`、`frames` 写 `"unknown"`，loop 再等一次拿到的是它——**不会一任说 `completed`、另一任说 `failed`**。

## 7. 取消运行与插队

| 步 | 局面 | 调用 | 预期 | 依据 |
|---|---|---|---|---|
| 1 | `run_1` 名下 `deploy(call_b)` 在前台、`build(call_a)` 在后台 | `cancelForRun(T, ses_1, run_1, graceful)` | 只 `call_b` 收场 `interrupted{run_cancelled}`；`call_a` 照跑、不出现在结果里；此后 `run_1` 的提交 → `alreadyEnded` | [S-28](contract.md#s-28-取消一次运行) |
| 2 | 当前这一步是一批 `[build(call_a), deploy(call_b)]`：`build` 在跑，`deploy` 排在它后面 | `preempt(T, ses_1, [call_a, call_b])` | **一次写**：`call_a` → `backgrounded{backgrounded_by_preemption}`，照跑；`call_b` → `interrupted{interrupted_by_preemption}`，执行者从没起过、外部效果「已确定未发生」——**它不会在 `call_a` 转后台之后接着在前台起来** | [S-31](contract.md#s-31-插队处置) |
| 3 | 当前这一步是 `[confirm_plan(call_c)]`，停在 `card_3` 上等人 | `preempt(T, ses_1, [call_c])` | `call_c` → `interrupted{human_declined}`：它在等，本版不能转后台；等的是一张卡片，所以原因是「人拒绝回复」 | [S-31](contract.md#s-31-插队处置)、PF-014 §5.4 |

第 1 步的 `run_cancelled` 是 `data.content-blocks` v1 候选补上的取值（原 G-2 已闭合），占位 `ToolMessage` 照常落下。

## 8. 每个失败值一个反例

| 失败值 | 局面 | 调用 | 结果 | 为什么不是别的值 |
|---|---|---|---|---|
| `invalidInput` | —— | `answerWait(T, ses_1, call_c, 缺, {value: {choice: "A"}, by: 人})` | `invalidInput` | `waitIndex` 缺席不替它猜成当前那一次（[S-30](contract.md#s-30-答复等待) ⑧）；**不是** `notWaiting`：表示层校验不是一次判定 |
| `invalidInput`（报告不对） | `rpt_2` 是 `ses_1` 里另一次运行 `run_2` 的报告；`run_1` 已进到第 2 次尝试，`rpt_1` 是第 1 次尝试的那份 | `submit(T, ses_1, run_1, 1, rpt_2, [build(call_a)/tok_a])`；或 `submit(T, ses_1, run_1, 2, rpt_1, [build(call_a)/tok_a])`；或 `report` 缺席 | 三种都是整批 `invalidInput`，什么都不写，`call_a` 没有记录 | 报告带的会话、运行、尝试须与本次三者都相同：前一种运行不是 `run_1`，后一种尝试是 `1` 不是 `2`（[S-23](contract.md#s-23-提交一批) ⑥；[D-040 §八 M46](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；缺席不替它现算一份、不取「最近一次」（⑧）；**不是** `dependencyUnavailable{registry}`：报告随请求交来，不是一个会读不到的依赖（[S-47](contract.md#s-47-依赖的提供者不可用)）；**不是** `crossTenant`：只比对交来的值，先于一切（[D-040 §八 M33](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） |
| `notAdmitted{why}` | `tok_b` 绑定的是 `deploy` 的另一份参数 | `submit(..., [build(call_a)/tok_a, deploy(call_b)/tok_b])` | 整批 `notAdmitted`；**`call_a` 也没有记录** | 一条凭据不符整批拒（[S-23](contract.md#s-23-提交一批) ②） |
| `admissionUnavailable` | 放行核对面此刻不可用 | 同上一行的 `submit`（凭据都正确） | 整批 `admissionUnavailable`，一项都不执行 | 「判不出来」不是「判为不符」，也不放行（[S-15](contract.md#s-15-缺席时的默认答案)） |
| `backgroundNotAllowed` | `deploy(call_b)` 在前台跑 | `background(T, ses_1, call_b)` | `backgroundNotAllowed` | 定义没声明 `allowBackground`＝不能（[S-27](contract.md#s-27-转后台) ⑧）；发起即后台的同一种情形在 `submit` 里**不是失败值**，是那一项的收场 `failed{background_start_refused}`（见本节末） |
| `crossTenant` | `ses_1` 持有 `T` | `submit(T', ses_1, run_1, 1, rpt_1, [build(call_z)/tok_z])`，`T' ≠ T` | 整批 `crossTenant`，什么都不写 | 提交时还没有记录，核对的是会话持有的租户（[S-21](contract.md#s-21-租户与会话范围)、[S-23](contract.md#s-23-提交一批) ②）；**不是** `executionNotFound`：那是对已有记录的读 |
| `notInForeground` | `build(call_a)` 已转后台，执行者要进一次等待 | 等待原语 | `notInForeground`，执行者自己决定怎么办 | 本版等待只在前台（[S-12](contract.md#s-12-等待) ③）；**不隐式转回前台** |
| `notInBackground` | `deploy(call_b)` 在前台 | `interrupt(T, ses_1, call_b, agent)` | `notInBackground` | agent 掐掉的是已转后台的执行（[S-25](contract.md#s-25-中断一次执行) ③） |
| `callIdConflict` | `call_a` 已登记，参数 `{target: x}` | `submit(..., [build(call_a, {target: y})/tok_a'])` | 整批 `callIdConflict` | 同一 `CallId` 不同参数，不是重复提交（[S-23](contract.md#s-23-提交一批) ⑦） |
| `executionNotFound` | `call_a` 属于 `ses_1`、租户 `T` | `readExecution(T', ses_1, call_a)`，`T' ≠ T` | `executionNotFound` | 不回「属于别的租户」（[S-21](contract.md#s-21-租户与会话范围)） |
| `notWaiting` | `call_c` 在跑、没在等 | `answerWait(T, ses_1, call_c, 1, ...)` | `notWaiting` | 这次执行存在、没收场，只是不在等（[S-30](contract.md#s-30-答复等待)） |
| `alreadyEnded` | `call_a` 已收场 `completed` | `interrupt(T, ses_1, call_a, user)` | `alreadyEnded`，**不改收场、不再送达** | [S-25](contract.md#s-25-中断一次执行) ⑦ |
| `runtimeNotReady` | 本能力刚起来，恢复扫描没完成 | `listLive(T, ses_1)` | `runtimeNotReady`，**不返回空表** | 扫描前的空表会被读成「全都没了」（[S-35](contract.md#s-35-列出活体) ⑧） |
| `runtimeStopped` | 本能力正在撤除，或上一次交回写不下去、已上交而撤下 | `submit(...)` | `runtimeStopped` | 与 `runtimeNotReady` 分开：要换到下一任，不是稍后重试（[S-48](contract.md#s-48-本能力自己的撤除与换代)、[S-47](contract.md#s-47-依赖的提供者不可用)）；上交的那一任不等存储回来 |
| `dependencyUnavailable{which}` | 存储读不到 | `listBackground(T, ses_1)` | `dependencyUnavailable{storage}`，**不返回空表** | 读不到不等于没有（[S-34](contract.md#s-34-列出后台执行) ⑧）；注册表读不到时 `submit` 是 `{registry}`——**注册表答「没有」不是它**（见本节末第四支） |
| `dependencyUnavailable{runAttemptFacts}` | `deploy(call_b)` 在后台跑；尝试与运行的两件事实此刻读不到（`attemptFacts` 答 `unavailable`） | `interrupt(T, ses_1, call_b, agent)` | `dependencyUnavailable{runAttemptFacts}`，**什么都不写**：`call_b` 没收场、照跑 | 落账要知道 `late`；读不到就不写一个缺席的 `late`——缺席是「不晚」这个结论（[S-13](contract.md#s-13-账)、[S-15](contract.md#s-15-缺席时的默认答案)）；**不是** `{storage}`：存储是好的，判不出的是那两件事实 |

**不是失败值的那一支**：注册表把 `lint` 判为不可用——它是替换件，或所选的那条命令在 `commandAvailability` 里被关掉——`submit(..., [lint(call_d)/tok_d])` 批成立，
`call_d` 的 `disposition` 是 `ended{unavailable}`，一条 `outcome: unavailable` 的 `ToolMessage` 已交付，块上写替换件的说明或注册表给的原因；执行者不起。
**不是** `failed`：`failed` 让 agent 以为可以重试，而这个名字在这次尝试里就是用不了（[S-23](contract.md#s-23-提交一批) ④；[D-040 §S13 S13-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）。

**不是失败值的另一支：参数不合，或参数判不了**（[S-23](contract.md#s-23-提交一批) ④ 第 ② 条、[S-11](contract.md#s-11-失败的种类)；场景 [S-61](contract.md#s-61-参数不合即刻失败并带用法)）：

| 调用（都在同一批里、各带相符的凭据） | `disposition` | 那条 `ToolMessage` 的块上写什么 |
|---|---|---|
| `fs(call_e, {command: "grep", args: {path: "src", pattern: "TODO", ignore_case: true}})` | `ended{failed}`，记录上种类 `arguments_invalid`，执行者不起、外部效果「已确定未发生」 | `ignore_case` 这个键 `grep` 不收；用法：`grep — 按正则在文件里找行`，参数表 `path`（string，必填，要找的路径）· `pattern`（string，必填，正则）· `ignoreCase`（boolean，可选，是否忽略大小写） |
| `fs(call_f, {command: "grep", args: {path: "src"}})` | 同上 | 缺必填键 `pattern`；用法同上 |
| `fs(call_g, {command: "find", args: {}})` | 同上 | `find` 不是 `fs` 的命令；带 `fs` 的命令清单（每个命令一行，同模型面前那一份） |
| `fs(call_i, {command: "pwd", args: {path: "src"}})` | 同上 | `path` 这个键 `pwd` 不收；用法：`pwd — 给出当前目录`，这个命令没有声明参数 |
| `fs(call_h, {command: "peek", args: {anything: 1}})` | `accepted{foreground}` | ——（`peek` 显式写了 `additionalProperties: true`，收任何一个对象，对不对由工具自己判） |
| `grep_logs(call_k, {q: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!"})`——作者写的单函数工具，参数 `q` 的 schema 带 `"pattern": "^(a+)+$"`；这个实现把它编成了可判的形式，**这一次判定超出实现登记的判定时限** | `ended{failed}`，记录上种类 **`schema_unsupported`**，执行者不起、外部效果「已确定未发生」；**同批别的项照常判** | 这个工具的参数在这个实现上判不了（判定超时）；**不说「参数不合」、不附用法**，也**不照常执行**（[S-11](contract.md#s-11-失败的种类)；[D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16）。编不出、`pattern` 超出长度或回溯保护的上限，同此收场 |

批里其余合格的项照常 `accepted`；**不是** `invalidInput`：那是本操作的输入不合形状，这里是对一次调用的判定。

**不是失败值的第三支：发起即后台而工具不许后台**：`submit(..., [{ call: deploy(call_j), admission: tok_j, environment: env_1, definition: {name: deploy}, startInBackground: true }])` 批成立，
`call_j` 的 `disposition` 是 `ended{failed}`，记录上种类 `background_start_refused`，一条 `outcome: failed` 的 `ToolMessage` 已交付；执行者不起、外部效果「已确定未发生」。**`submit` 没有逐条失败值**（[S-23](contract.md#s-23-提交一批) ⑤）。

**不是失败值的第四支：这次尝试里没有这个名字**（[S-23](contract.md#s-23-提交一批) ②④；场景 [S-69](contract.md#s-69-查不到条目的调用即刻收场不可用)；[D-040 §七 M8、M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）——模型调了一个编造的 `grep_files`，runner 在可用性报告里查不到它、不交进 `admit`，记 `observed{no_such_entry}`：

| 调用 | 结果 | 为什么 |
|---|---|---|
| `submit(T, ses_1, run_1, 1, rpt_1, [build(call_a)/tok_a, { call: grep_files(call_x) }])`——后一项是 `UnlistedCall` | 批成立：`[call_a: accepted{foreground}, call_x: ended{unavailable}]`；`call_x` 记录上的原因 `no_such_entry`，`ToolMessage` 的块写明这次尝试里没有这个工具、**不带 `reason`**；没有凭据、执行者不起、外部效果「已确定未发生」 | 本能力以 `call.tool` 原样（`grep_files`）查注册表，答「没有」——一个结论，只落这一项 |
| 同上，但 `grep_files` 在这次尝试的 `tool` 表里**查得到** | 整批 `notAdmitted`，什么都不写 | 没经放行、却有可执行的条目：与缺凭据同一种，**不信交来一方说的「查不到」** |
| 同上，但注册表此刻读不到 | 整批 `dependencyUnavailable{registry}` | 「读不到」不是「没有」：判不出来就不收 |
| MCP 动作 `github:search_issues` 的一次调用，调用块里 `tool` 是模型面名字 `github__search_issues`，以 `AdmittedCall` 交来 | 查注册表用 `github__search_issues` 原样，查到条目；之后才逆转写成定义名 `github:search_issues`，找执行者（桥）用它 | [S-23](contract.md#s-23-提交一批) ② 第 6 条；逆转写只为找执行者（[S-37](contract.md#s-37-执行者登记与撤下)） |

## 9. 提交：判重、解析不了与租户

**多出来的局面**：`call_u` 是一个参数收齐却解析不了的调用块（`tool: "fs"`，参数原文 `{"command": "grep", "args": {"path": "src"`，少一个右括号，按 `data.content-blocks/v1#S-12` 标了 `unparseable`）；`tok_n` 绑定的是 `call_n` 的另一份参数。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `submit(T, ses_1, run_1, 1, rpt_1, [build(call_a)/tok_a, fs(call_e, {command: "grep", args: {path: "src", pattern: "TODO", ignore_case: true}})/tok_e, { call: call_u }])` | 批成立：`[call_a: accepted{foreground}, call_e: ended{failed}, call_u: ended{failed}]`；`call_e` 种类 `arguments_invalid`（第 8 节末那张表第一行）；`call_u` 种类 `unparseable`，`ToolMessage` 的块写明参数解析不了——**没有凭据、不查注册表、执行者不起**，外部效果「已确定未发生」 | [S-23](contract.md#s-23-提交一批) ①④、[S-11](contract.md#s-11-失败的种类)、[S-64](contract.md#s-64-参数收齐却解析不了) |
| 2 | 第 1 步原样再提交一次 | 三行与第 1 步**逐字相同**；没有第二次执行者、没有多一条记录或消息 | [S-23](contract.md#s-23-提交一批) ⑦ |
| 3 | 第 1 步的三项再加 `deploy(call_n)/tok_n` 一起提交 | 整批 `notAdmitted`；`call_n` 没有记录；**`call_a`、`call_e`、`call_u` 不受影响**（`call_a` 照跑） | [S-23](contract.md#s-23-提交一批) ②⑦ |
| 4 | `cancelForRun(T, ses_1, run_1, graceful)`，之后第 1 步原样再提交一次 | `call_a` 收场 `interrupted{run_cancelled}`；重放**批成立**，三行仍是第 1 步那三行（`call_a: accepted{foreground}`）——**不是 `alreadyEnded`**：那一批已经收下了；`call_a` 此刻的收场从 `readExecution` 读 | [S-23](contract.md#s-23-提交一批) ⑤⑦、[S-33](contract.md#s-33-读一次执行) |
| 5 | `submit(T, ses_1, run_1, 1, rpt_1, [build(call_a, {target: y})/tok_a'])`（`call_a` 原参数是 `{target: x}`） | 整批 `callIdConflict`，什么都不写 | [S-23](contract.md#s-23-提交一批) ⑦ |
| 6 | `submit(T', ses_1, run_1, 1, rpt_1, [build(call_a)/tok_a, build(call_a, {target: y})/tok_a'])`，`T' ≠ T` | 整批 `crossTenant`：**不按幂等返回 `call_a` 的首次结果，也不报 `callIdConflict`**——租户核对在判重之前，别的租户据返回值读不到这个会话里有什么 | [S-23](contract.md#s-23-提交一批) ②、[S-67](contract.md#s-67-租户不符整批不收) |
| 7 | 会话持有的租户此刻读不到；`submit(T, ses_1, run_1, 1, rpt_1, [build(call_k)/tok_k])` | 整批 `dependencyUnavailable{sessionTenancy}`：不当作相符放行，也不当作不符拒；**不是** `{storage}`——存储是好的，判不出的是会话持有的租户 | [S-23](contract.md#s-23-提交一批) ⑧、[S-15](contract.md#s-15-缺席时的默认答案) |

**反例**：第 4 步答 `alreadyEnded`——调用方会以为那一批从没进来过，再补一条结果，同一次调用就有了两条结果；第 1 步把 `call_u` 交给 `fs` 的执行者去猜参数，或因为它没有凭据而整批 `notAdmitted`。

## 10. 帧：接受、被拒与收场之后

局面：`build(call_a)` 在前台跑，本能力在起执行者那一下为它开了一份装配状态，目标 `{ kind: tool_execution, callId: call_a }`。帧的写法同 `capability.stream-assembly` v1 的 [examples](../../stream-assembly/v1/examples.md)：`H1M0` 表示 `{"toHuman": true, "toModel": false}`（帧不给模型看，`data.arrival-events/v1#S-23`）。

| 步 | 执行者发帧 | 发帧交回 | 装配状态与观察者 | 依据 |
|---|---|---|---|---|
| 1 | `{"t": "open", "index": 0, "kind": "text", "fill": "append", "id": "b_log", "visibility": H1M0}` | `accepted` | 开块 0；推给观察者 | [S-39](contract.md#s-39-发帧) ⑤、[S-62](contract.md#s-62-工具侧到达装配前提的承诺) 第 1、2 条 |
| 2 | `{"t": "fill", "index": 0, "payload": "compiling…\n"}` | `accepted` | 块 0 多一段；推给观察者 | 同上 |
| 3 | 再发一次第 1 步那个 `open` | `dropped{ rejected{ index_reused } }` | 状态不变；本能力**紧接着**交一个 `reason: rejected` 的 `trim`，之后才交下一帧；**不推给观察者** | [S-62](contract.md#s-62-工具侧到达装配前提的承诺) 第 4、9 条；`capability.stream-assembly/v1#S-26` |
| 4 | `{"t": "trim", "reason": "frame_too_long", "omittedBytes": 10}` | `dropped{ notAFrame }` | **不交给装配**：`trim` 只由本能力发 | [S-39](contract.md#s-39-发帧) ③、[S-62](contract.md#s-62-工具侧到达装配前提的承诺) 第 3 条 |
| 5 | 封块 0：`close` 带块 0 的整块（`kind`、`id`、`visibility` 与开块时相同） | `accepted` | 块 0 封口 | [S-62](contract.md#s-62-工具侧到达装配前提的承诺) 第 2 条 |
| 6 | 执行者交回 `"built 12 targets"` | ——（交回：`settled{ completed }`） | 本能力交 `finish{ reason: end }` 并收尾结算：块非空 ⇒ 一条 `ToolInternalMessage`，`ending: complete`，与 `ToolMessage` 同一次送达、排在它前面；`frames` 进账恰一次（`emitted` 按 `capability.stream-assembly/v1#S-13` 的算式，第 3 步那个被拒的计进「未原样送达」） | [S-19](contract.md#s-19-送达)、[S-41](contract.md#s-41-交回)、`data.messages/v1#S-14` |
| 7 | 收场之后又发 `{"t": "fill", "index": 0, "payload": "x"}` | `dropped{ executionEnded }` | 不交给任何状态；留一条记录条目 | [S-62](contract.md#s-62-工具侧到达装配前提的承诺) 第 1 条 |

**两个变体**：一帧不发就交回 ⇒ 没有 `ToolInternalMessage`，账上 `frames.emitted = 0`、各项砍为零；`confirm_plan` 声明了到点、到点时没人答 ⇒ 收场 `no_answer`，本能力对装配状态调 `abandon`，有块时 `ending: lost`——**不是 `interrupted`**：没有谁决定让它停下（[S-39](contract.md#s-39-发帧)、`data.messages/v1#S-14`）。

**形状不合与缺席**（[S-39](contract.md#s-39-发帧) ⑤⑧；[D-040 §七 M29](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)），接在第 2 步之后：

| 执行者发帧 | 发帧交回 | 装配状态 |
|---|---|---|
| `{"t": "sparkle", "index": 0}`（认不出的种类） | `dropped{ rejected{ event_unknown } }`——交给了 `accept`，**原名**交回，不收成 `malformed` | 状态不变；本能力紧接着交一个 `reason: rejected` 的 `trim`，只说一次；这一帧计进「未原样送达」 |
| 调发帧而不带事件 | `dropped{ rejected{ malformed } }`——没有东西可交给 `accept` | 不交给装配、**不补 `trim`**：没交出任何一帧，`emitted` 不计 |

**本能力有序撤下时帧流还开着**（[S-48](contract.md#s-48-本能力自己的撤除与换代)、[S-62](contract.md#s-62-工具侧到达装配前提的承诺) 第 6 条；场景 [S-68](contract.md#s-68-有序撤下收尾在途的帧流上交之后撤下)），接在第 2 步之后、`build` 还在跑：
本能力先对那份装配状态调 `abandon`（帧流以 `lost` 收尾，交出块 0 的「compiling…」与 `frames.emitted = 2`），再首胜写 `failed{abnormal_interruption}`、外部效果「不可确定」，账的 `frames` 就是那一份（**不写 `"unknown"`**）；一条 `ending: lost` 的 `ToolInternalMessage` 与 `ToolMessage{ failed, reason: abnormal_interruption }` 同一次交付，之后才发停止。
**若撤下时存储写不下去**：这一步不成，下一任扫描照第 6 节追补，那时装配状态已没了——`frames` 写 `"unknown"`，没有 `ToolInternalMessage`。**停机**（进程没了）同此。
