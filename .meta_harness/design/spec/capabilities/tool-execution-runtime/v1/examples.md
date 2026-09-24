# 规范实例：走通的路径与每个失败值的反例

属于 `capability.tool-execution-runtime` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前七节各走通一条路径，第八节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`ses_1`、`call_a`、`run_1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `T` | 会话 `ses_1` 持有的租户身份 |
| `run_1` | `ses_1` 里一次未终结的运行；`attempt = 1` |
| `build` | 工具：`allowBackground: true`，`backgroundThreshold: PT5M`，`timeout: PT30M`，没有 `concurrency` |
| `deploy` | 工具：没有 `allowBackground`（不能后台），没有 `timeout` |
| `confirm_plan` | 工具：执行中会进一次等待，挂一张决策卡片，不给到点 |
| `search_web` | 这次尝试里注册表放在原位上的**替换件**（对端连不上） |
| `tok_*` | 放行凭据，各自绑定 `(ses_1, CallId, 生效参数)` |

「交付」指消息与执行记录在同一次写里定下、耐久地等着追加；「送达」指追加进会话日志成功（[S-19](contract.md#s-19-送达)）。

## 1. 前台完成

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | `submit(T, ses_1, run_1, 1, [{ call: build(call_a), admission: tok_a, environment: env_1, definition: {name: build} }])` | `[{ callId: call_a, disposition: accepted{foreground} }]`；执行记录 `queued`；一条提交条目 | [S-23](contract.md#s-23-提交一批) |
| 2 | 起执行者 | 参数合 `input`、落点到位、执行者起来 → `running`；一条起执行者条目 | [S-38](contract.md#s-38-起执行者) |
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
| 2 | 本能力存下声明卸载的原始结果（进那一关之前，不看卸载判定在不在） | 内联的 40 MB 存进存储，换成引用 `{ storage, key, mediaType: "text/plain", bytes: 41943040 }` | [S-36](contract.md#s-36-存一份原始结果)（账本 S13-b） |
| 3 | `after_action`（`each`）：卸载判定拿到 `subject.result`，其中 `offload.raw` 已是第 2 步的引用 | 结论：改写结果块——`blocks` 是作者的摘要加「原始结果 40 MB、怎么取回」，`offloaded` 是那个引用；本能力照结论落 `ToolMessage`；**原始的 40 MB 从头到尾不进会话日志** | [S-42](contract.md#s-42-结果落成消息之前的那一关)；PF-012 §5.10 |

**卸载判定此刻不在**：第 2 步照做，原始结果照样存着；只记可见——落进块的是 `content`（作者的摘要块），`raw` 的位置上**只落第 2 步的引用、摘要缺席**，留一条「落盘前那一关不可用」的条目（[S-15](contract.md#s-15-缺席时的默认答案)、[S-42](contract.md#s-42-结果落成消息之前的那一关)）。
**存储未定义**，第 2 步停在 [G-7](contract.md#十二已知缺口)；存不下时收场照写、落盘写不下去就上交（[S-36](contract.md#s-36-存一份原始结果)）。

## 6. 停机：前台与后台各追补一条

`ses_1` 里 `deploy(call_b)` 在前台跑、`build(call_a)` 已转后台；`ses_2` 里没有协程、只剩一个后台执行 `call_z`；据点进程被杀。

| 步 | 调用或发生 | 预期 | 依据 |
|---|---|---|---|
| 1 | 本能力重新起来，扫描完成之前 `awaitForeground(T, ses_1, call_b)` | `runtimeNotReady` | [S-20](contract.md#s-20-恢复扫描与停机不重来) |
| 2 | 恢复扫描 | 范围是**全部**未收场的记录，含 `ses_2` 的 `call_z`（那个会话没有协程要恢复）；每条先回收登记过的进程组，再首胜写 `failed{abnormal_interruption}`，外部效果「不可确定」，实际停止 `unconfirmed`，账的 `endedAt` **缺席** | [S-20](contract.md#s-20-恢复扫描与停机不重来)、[S-13](contract.md#s-13-账) |
| 3 | 同一次写里交付 | `call_b`：`ToolMessage{ outcome: failed, reason: { code: abnormal_interruption } }`；`call_a`、`call_z`：`SystemReminderMessage{ source: { kind: background_execution_interrupted } }` | [S-19](contract.md#s-19-送达) |
| 4 | 执行者 | **一个都不重起** | [S-17](contract.md#s-17-持久意图先于外部效果) |
| 5 | 若 `call_b` 当时停在一张卡片上 | 请求把那张卡关闭为 `superseded`（待产品确认、卡片契约未建立） | [S-20](contract.md#s-20-恢复扫描与停机不重来) 第 4 步、[G-5](contract.md#十二已知缺口) |
| 6 | loop 下一次尝试开始 `reconcile(T, ses_1)` | `{ settled: [] }`——扫描已处置过 | [S-32](contract.md#s-32-对账) |

**agent 看到的是「失败，原因异常中断」**：要不要再调由它决定；系统不替它断定那一次做没做过。

## 7. 取消运行与插队

| 步 | 局面 | 调用 | 预期 | 依据 |
|---|---|---|---|---|
| 1 | `run_1` 名下 `deploy(call_b)` 在前台、`build(call_a)` 在后台 | `cancelForRun(T, ses_1, run_1, graceful)` | 只 `call_b` 收场 `interrupted{run_cancelled}`；`call_a` 照跑、不出现在结果里；此后 `run_1` 的提交 → `alreadyEnded` | [S-28](contract.md#s-28-取消一次运行) |
| 2 | 当前这一步是一批 `[build(call_a), deploy(call_b)]`：`build` 在跑，`deploy` 排在它后面 | `preempt(T, ses_1, [call_a, call_b])` | **一次写**：`call_a` → `backgrounded{backgrounded_by_preemption}`，照跑；`call_b` → `interrupted{interrupted_by_preemption}`，执行者从没起过、外部效果「已确定未发生」——**它不会在 `call_a` 转后台之后接着在前台起来** | [S-31](contract.md#s-31-插队处置) |
| 3 | 当前这一步是 `[confirm_plan(call_c)]`，停在 `card_3` 上等人 | `preempt(T, ses_1, [call_c])` | `call_c` → `interrupted{human_declined}`：它在等，本版不能转后台；等的是一张卡片，所以原因是「人拒绝回复」 | [S-31](contract.md#s-31-插队处置)、PF-014 §5.4 |

第 1 步的 `run_cancelled` 在 `data.content-blocks` v1 里还没有取值：记录写得下、消息落不下，停在 [G-2](contract.md#十二已知缺口)。

## 8. 每个失败值一个反例

| 失败值 | 局面 | 调用 | 结果 | 为什么不是别的值 |
|---|---|---|---|---|
| `invalidInput` | —— | `answerWait(T, ses_1, call_c, 缺, {value: {choice: "A"}, by: 人})` | `invalidInput` | `waitIndex` 缺席不替它猜成当前那一次（[S-30](contract.md#s-30-答复等待) ⑧）；**不是** `notWaiting`：表示层校验不是一次判定 |
| `notAdmitted{why}` | `tok_b` 绑定的是 `deploy` 的另一份参数 | `submit(..., [build(call_a)/tok_a, deploy(call_b)/tok_b])` | 整批 `notAdmitted`；**`call_a` 也没有记录** | 一条凭据不符整批拒（[S-23](contract.md#s-23-提交一批) ②） |
| `admissionUnavailable` | 放行核对面此刻不可用 | 同上一行的 `submit`（凭据都正确） | 整批 `admissionUnavailable`，一项都不执行 | 「判不出来」不是「判为不符」，也不放行（[S-15](contract.md#s-15-缺席时的默认答案)） |
| `backgroundNotAllowed` | `deploy(call_b)` 在前台跑 | `background(T, ses_1, call_b)` | `backgroundNotAllowed` | 定义没声明 `allowBackground`＝不能（[S-27](contract.md#s-27-转后台) ⑧）；发起即后台的同一种情形在 `submit` 里是逐条的同名值 |
| `notInBackground` | `deploy(call_b)` 在前台 | `interrupt(T, ses_1, call_b, agent)` | `notInBackground` | agent 掐掉的是已转后台的执行（[S-25](contract.md#s-25-中断一次执行) ③） |
| `callIdConflict` | `call_a` 已登记，参数 `{target: x}` | `submit(..., [build(call_a, {target: y})/tok_a'])` | 整批 `callIdConflict` | 同一 `CallId` 不同参数，不是重复提交（[S-23](contract.md#s-23-提交一批) ⑦） |
| `executionNotFound` | `call_a` 属于 `ses_1`、租户 `T` | `readExecution(T', ses_1, call_a)`，`T' ≠ T` | `executionNotFound` | 不回「属于别的租户」（[S-21](contract.md#s-21-租户与会话范围)） |
| `notWaiting` | `call_c` 在跑、没在等 | `answerWait(T, ses_1, call_c, 1, ...)` | `notWaiting` | 这次执行存在、没收场，只是不在等（[S-30](contract.md#s-30-答复等待)） |
| `alreadyEnded` | `call_a` 已收场 `completed` | `interrupt(T, ses_1, call_a, user)` | `alreadyEnded`，**不改收场、不再送达** | [S-25](contract.md#s-25-中断一次执行) ⑦ |
| `runtimeNotReady` | 本能力刚起来，恢复扫描没完成 | `listLive(T, ses_1)` | `runtimeNotReady`，**不返回空表** | 扫描前的空表会被读成「全都没了」（[S-35](contract.md#s-35-列出活体) ⑧） |
| `runtimeStopped` | 本能力正在撤除 | `submit(...)` | `runtimeStopped` | 与 `runtimeNotReady` 分开：要换到下一任，不是稍后重试（[S-48](contract.md#s-48-本能力自己的撤除与换代)） |
| `dependencyUnavailable{which}` | 存储读不到 | `listBackground(T, ses_1)` | `dependencyUnavailable{storage}`，**不返回空表** | 读不到不等于没有（[S-34](contract.md#s-34-列出后台执行) ⑧）；注册表读不到时 `submit` 是 `{registry}` |

**不是失败值的那一支**：注册表把 `lint` 判为不可用——它是替换件，或所选的那条命令在 `commandAvailability` 里被关掉——`submit(..., [lint(call_d)/tok_d])` 批成立，
`call_d` 的 `disposition` 是 `ended{unavailable}`，一条 `outcome: unavailable` 的 `ToolMessage` 已交付，块上写替换件的说明或注册表给的原因；执行者不起。
**不是** `failed`：`failed` 让 agent 以为可以重试，而这个名字在这次尝试里就是用不了（[S-23](contract.md#s-23-提交一批) ④；账本 S13-a）。
