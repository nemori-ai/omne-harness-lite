# 规范实例：走通的路径与每个失败值的反例

属于 `capability.model-request-runtime` v2 的规范工件。本契约**不附 Schema**，这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前七节各走通一条路径，第八节给每个失败值一个反例，第九、十节走同路由名的几行：一个名字一条，落到胜出行（PF-013 rev 12），第十一节走交回之后的收口与只读守卫。

**两条读法上的边界：**

- **标识串只是占位**：`c1`、`r_1`、`s1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；响应体只写与本节有关的成员。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| 会话 `s1` | 属于租户 `T = (O, A)`；当前 Run `run_1`、第 1 次尝试 |
| 档案 `M1` | 官方档案，在册；允许的供应商 `[A, B]`、允许回退；输入模态 `text` |
| 档案 `M2` | 官方档案，在册；允许的供应商 `[A]`、不允许回退；输入模态 `text`、`image` |
| 凭据 | `T` 的租户层配了一把 |
| 本据点传输能承载的模态 | `text`、`image`、`file`（没有 `audio`） |
| 选中模型 | `M1`（最后一条模型切换的记录记的名字）。**`M1`、`M2` 既指那一行档案，也指它的路由名**——除第 9、10 节外链上没有同名的别的行，名字与行一一对应 |

## 1. 两家发出：第一家 429 未开口，第二家完成（场景 [S-41](contract.md#s-41-两家发出第一家-429-未开口第二家完成)）

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `effectiveModel(s1)` 得 `e1` | `e1 = { routeName: M1, profile: M1, selectedBy: session, selected: M1 }` | [S-26](contract.md#s-26-effectivemodel) |
| 2 | `openCall({ run: run_1, attempt: 1, session: s1, messages, target: M1, basis: e1, tools: [], … }, 宿主, 追加入口)`（没有拓展件改目标，不给 `targetChangedBy`） | `{ callId: c1, state: open }`；**日志里什么都没写** | [S-28](contract.md#s-28-opencall) ①④ |
| 3 | `dispatch(s1, c1, 尝试 1)` | 日志先出现「已出门」（第 1 次、`A`、`r_1`，带着绑定：`M1` 的引用与快照、实际发出的参数、`selectedBy: session`、`credentialScope` 为 `T` 的租户层；尝试 1 在条目壳上），然后请求出网；A 回 429；返回 `r_1`：`failed{upstream_unavailable}`、`statusCode: 429`、没有 `firstTokenAt`，**已写**；`c1` 在 `awaiting_decision` | [S-15](contract.md#s-15-两个锚点先写后行)、[S-29](contract.md#s-29-dispatch) ⑤ |
| 4 | 默认件读到策略类、下一家是 `B` ⇒ `retry { provider: B }` | —— | [S-35](contract.md#s-35-默认重试件可替换) |
| 5 | `dispatchAgain(s1, c1, { provider: B }, 尝试 1)` | 「已出门」（第 2 次、`B`、`r_2`）→ 出网 → 首 token 之前写「已开口」→ 内容交给观察者 → 收尾；返回 `r_2`：`complete`，带 `reply`，**交回、未写**；`c1` 在 `reply_pending` | [S-30](contract.md#s-30-dispatchagain)、[S-16](contract.md#s-16-首-token-判据) |
| 6 | 回复过了「消息落盘之前」，loop 把 `r_2`（`replyDisposition = persisted`）与回复消息一次提交写下 | 日志里：两条响应体、两份账、一条回复消息；`c1` 在 `complete` | [S-17](contract.md#s-17-结算一处按序幂等先到者赢) |

## 2. 开口之后断流：不重发（场景 [S-42](contract.md#s-42-开口之后断流不重发)）

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `openCall` → `c2`；`dispatch(s1, c2)` | 「已出门」→ 出网 →「已开口」→ 内容交出一半 → 连接断 | [S-15](contract.md#s-15-两个锚点先写后行) |
| 2 | （`dispatch` 返回） | `failed{interrupted_mid_reply}`、有 `firstTokenAt`、已交付的块在 `delivered`、没有 `reply`；**已写**；`c2` 在 `awaiting_decision` | [S-18](contract.md#s-18-成因按来源分类三类事实由守卫兑现)、[S-29](contract.md#s-29-dispatch) |
| 3 | 一件自定义重试件给 `retry { provider: B }`；runner 先问 `canDispatchAgain(s1, c2, { provider: B })` | **`{ refused: { why: already_spoke } }`**——哪怕 `B` 从没试过；直接调 `dispatchAgain(s1, c2, { provider: B })` 同样得 `retryRefused{already_spoke}` | [S-50](contract.md#s-50-candispatchagain)、[S-30](contract.md#s-30-dispatchagain) 守卫 1 |
| 4 | `releaseCall(s1, c2)` | 调用终结 `released`（不带 `cause`），`{ state: handed_up }`；上交条目与中断提醒由 loop 写 | [S-32](contract.md#s-32-releasecall) |

## 3. 停机：首 token 之前与之后

| 情形 | 日志里 `c3` 最后一次发出 | `reconcile(s1, 尝试 2)` 追补 | `c3` 随之 | 之后 |
|---|---|---|---|---|
| 首 token 之前停机 | 「已出门」（第 1 次、`A`、`r_5`，带着绑定）；无「已开口」；无响应体 | `r_5`：`interrupted{runtime_lost}`、没有 `firstTokenAt`、账全未知、`late: true`；**`route` 的有效模型、快照、`selectedBy`、`credentialScope` 取自那条「已出门」**（其间档案被改过也不变）；**参数三项同样取自它**：「已出门」上带着传输适配定下的 `parameterAdjustments`（例如 `[{ name: maxOutputTokens, requested: 8000, sent: 4096 }]`），`r_5` 照抄它，`route.parameters` 是合并之后那一组把 `maxOutputTokens` 换成 `4096` 的那一组（[S-33](contract.md#s-33-reconcile) ④） | `resumable` | `openCall({ callId: c3, session: s1, run: run_1, attempt: 2, … })`（绑定从「已出门」读）→ `dispatch(s1, c3, 尝试 2)`：第 **2** 次发出、发给 **`A`**、所在尝试 2 |
| 首 token 之后停机 | 「已出门」「已开口」；无响应体 | `r_5`：`interrupted{runtime_lost}`、`firstTokenAt` 取自「已开口」、账全未知、没有 `reply`、`late: true`；`route` 同上取自「已出门」 | `interrupted` | **不再发出**；`dispatch(s1, c3)` 得 `alreadyEnded`（调用已终结，先于 `retryRefused` 判）；中断提醒由 loop 补 |
| 用户叫停之后停机 | 「已出门」、中断意图（`user`）；无响应体 | `r_5`：`interrupted`、`initiator = user` | `interrupted` | **不是 `resumable`**（场景 [S-47](contract.md#s-47-用户叫停之后停机不再发出)） |
| 刚打开就被叫停、随即停机 | 只有中断意图（`user`）；一次都没发出 | 调用终结 `interrupted{initiator: user}` | `interrupted` | 意图是一条耐久记录，这次调用要有终态 |
| 不属于任何 Run 的调用（旁路提问）首 token 之前停机 | 同第一行 | 同第一行，但没有 `late`（它不属于任何运行） | `resumable` | 由会话重新承载时的 `reconcile(s1)`（不带尝试）收口 |

依据：[S-33](contract.md#s-33-reconcile) 对账表与 ②④。再对一次账：什么都不追补，返回同样的结果（⑦）。

## 4. 切换先落事实后生效（场景 [S-43](contract.md#s-43-切换先落事实后生效)）

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `c4` 正在 `M1` 上发出 | —— | —— |
| 2 | `selectModel(s1, M2)` | 模型切换的记录写下之后返回 `{ selected: M2 }` | [S-27](contract.md#s-27-selectmodel) ④ |
| 3 | `c4` 收场 | 它的 `route.profile` 仍是 `M1` | [S-7](contract.md#s-7-一次调用绑定了什么) |
| 4 | `effectiveModel(s1)` | `{ routeName: M2, profile: M2, selectedBy: session, selected: M2 }` | [S-9](contract.md#s-9-选中模型) |
| 5 | 再 `selectModel(s1, M2)` | `M2` 合法、与当前选中相同 ⇒ 不写新记录，返回 `{ selected: M2 }` | ⑦ |
| 6 | 上层把「用哪个模型」锁成 `M1`，`effectiveModel(s1)` | `{ routeName: M1, profile: M1, selectedBy: layer_lock, selected: M2 }`——**展示列表仍标 `M2` 为选中** |
| 7 | 上层锁成 `M2`（与选中相同），`effectiveModel(s1)` | `{ routeName: M2, profile: M2, selectedBy: layer_lock, selected: M2 }`——**被锁就是 `layer_lock`，不论锁定的名字与选中是否相同** | [S-26](contract.md#s-26-effectivemodel) ⑤ | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2 步 |

## 5. 已下架的档案（场景 [S-44](contract.md#s-44-已下架的档案)）

管理员撤回 `M1`，选中模型仍是 `M1`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `legalTargets(s1)` | 不含 `M1` | [S-11](contract.md#s-11-合法目标集合) |
| `displayList(s1)` | `M1` 仍在，注记 `{ withdrawn }`、`selected: true`——没有胜出行，**不对它判模态与凭据**；其余合法目标各带 `legal` | [S-12](contract.md#s-12-展示列表) |
| `openCall(…)`（没有拓展件改目标） | `{ state: handed_up, undispatched: withdrawn }`；日志里一条调用终结记录；**没有响应体** | [S-28](contract.md#s-28-opencall) 出门前检查第 1 行 |
| `effectiveModel(s1)` | `{ profile: M1, … }`——**不替用户改选** | [S-9](contract.md#s-9-选中模型) |
| `selectModel(s1, M1)` | `notLegalTarget{because: [withdrawn]}`——与当前选中相同也不成功：先判合法、再判重复 | [S-27](contract.md#s-27-selectmodel) ⑦ |
| 随后 `M1` 恢复在册（经官方清单装入），用户什么都没做；`legalTargets(s1)` | 又含 `M1`；`displayList` 上 `M1` 注记 `{ legal }`、`selected: true` | [S-11](contract.md#s-11-合法目标集合)、`data.model-profile/v2#S-10` |
| 接着 `openCall(…)` | `{ state: open }`，有效模型仍是 `M1`；日志里没有新的模型切换的记录 | [S-9](contract.md#s-9-选中模型) |

## 6. 模态不兼容挡在算合法目标那一刻（场景 [S-45](contract.md#s-45-模态不兼容挡在算合法目标那一刻)）

会话里进来一张图（没有 transcript）。

| 调用 | 预期 | 依据 |
|---|---|---|
| `legalTargets(s1)` | 含 `M2`、不含 `M1`（`M1` 不收图） | [S-11](contract.md#s-11-合法目标集合) |
| `displayList(s1)` | `M1` 标 `{ modality_mismatch }`、`selected: true` | [S-12](contract.md#s-12-展示列表) |
| 会话里再进来一段语音（没有 transcript），档案 `M3` 声明收文本、图、语音 | `M3` **仍在**合法目标（合法目标只有三项）；选中 `M3` 之后 `openCall` 以 `undispatched{modality_mismatch}` 上交——本据点传输送不出语音，可发出的另一条前置不成立；**`M2` 此时也不在合法目标里**（它不收语音） | [S-11](contract.md#s-11-合法目标集合) 末段、[S-28](contract.md#s-28-opencall) 出门前检查第 3 行 |
| 另一个会话 `s3` 里同样一张图、**落盘之前**被转换件配上了 transcript；`legalTargets(s3)` | 含 `M1`——有 transcript 的块不进投影。**`s1` 里那张图不会事后补上 transcript**，`M1` 在 `s1` 里一直被挡 | [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)、`capability.modality-projection/v2#S-6` |

## 7. 默认重试件：不允许回退的档案

选中模型换成 `M2`（不允许回退）。第一次发出 A 回 503。

| 步 | 预期 | 依据 |
|---|---|---|
| 默认件读到策略类，档案不允许回退 | 给一次 `retry { provider: A }`（同家）⇒ 第 2 次发出仍给 `A` | [S-35](contract.md#s-35-默认重试件可替换) 第 3 条 |
| 第 2 次发出 `A` 又回 503 | 默认件**不再给 `retry`**（同家至多一次），交回 ⇒ loop `releaseCall`，调用终结 `released`，上交 | 同上 |
| 一件自定义件给 `retry { provider: B }` | `retryRefused{provider_not_allowed}` | [S-30](contract.md#s-30-dispatchagain) 守卫 3 |
| 一件自定义件给 `retry { provider: A }` | 放行：第 2 次发出仍给 `A` | 同上 |

## 8. 每个失败值一个反例

| 失败值 | 调用 | 为什么 | 依据 |
|---|---|---|---|
| `invalidInput{malformed}` | `openCall({ run: run_1, session: s1, … })`（缺 `attempt`） | `run` 与 `attempt` 只给了一个 | [S-28](contract.md#s-28-opencall) ① |
| `invalidInput{malformed}` | `openCall({ …, target: M2, basis: e1 })`，`e1.routeName = M1`，没给 `targetChangedBy` | 目标变了却说不出是谁改的 | [S-28](contract.md#s-28-opencall) ③ |
| `invalidInput{malformed}` | `dispatchAgain(s1, c1, { provider: B, target: M2 })` | 计划里出现目标——换模型不是重试能做的 | [S-30](contract.md#s-30-dispatchagain) |
| `invalidInput{parameter_out_of_range}` | `openCall` 的 `parameters` 把 `temperature` 给成域外值 | 合并之后过不了参数校验；**不是一次上交** | [S-28](contract.md#s-28-opencall) 出门前检查第 5 行 |
| `unavailable` | `legalTargets(s1)`，作用域求值读不到 | 判不出来，**不返回空集** | [S-24](contract.md#s-24-legaltargets) ⑧ |
| `unavailable` | `interrupt(s1, c1, user)`，中断意图写不进 | **不发中止信号** | [S-31](contract.md#s-31-interrupt) ⑧ |
| `profileNotFound` | `selectModel(s1, "vendor/never")` | 这个名字在链上没有任何一行 | [S-27](contract.md#s-27-selectmodel) |
| `profileNotFound` | 选中模型那个名字的行在存储里丢了，`displayList(s1)` | 与 `effectiveModel`、`openCall` 同一个值；**不是 `unavailable`**，交付面不该据此重试 | [S-25](contract.md#s-25-displaylist) ⑧ |
| `notLegalTarget{because: [modality_mismatch]}` | 第 6 节的局面里 `selectModel(s1, M1)` | `M1` 不收图；`because` 恰一项 | [S-27](contract.md#s-27-selectmodel) |
| `callNotFound` | `interrupt(s1, c9, user)`，`c9` 是会话 `s9` 里的调用 | 这个 `callId` 不在 `s1` 里——**哪怕 `s9` 里有同名的 `c9`，也不串过去** | [S-5](contract.md#s-5-一次调用一次发出)、[S-14](contract.md#s-14-缺席时的默认答案与失败集合) |
| `alreadyEnded` | 第 1 节之后 `interrupt(s1, c1, user)` | `c1` 已在终态 | [S-31](contract.md#s-31-interrupt) |
| `alreadyEnded` | 第 1 节第 5 步之后、第 6 步之前（`c1` 在 `reply_pending`）`interrupt(s1, c1, user)` | 收场已定，中断改不了它 | [S-31](contract.md#s-31-interrupt) ② |
| `alreadyEnded` | 第 1 节之后 `dispatchAgain(s1, c1, { provider: A })` | 调用已终结——**不是 `retryRefused`**，已终结只有一个值 | [S-30](contract.md#s-30-dispatchagain) |
| `runtimeStopped` | 宿主停止中 `openCall(…)` | 不开新调用 | [S-36](contract.md#s-36-宿主停止与撤除) |
| `retryRefused{already_spoke}` | 见第 2 节第 3 步 | 开过口 | [S-30](contract.md#s-30-dispatchagain) 守卫 1 |
| `retryRefused{fact_class}` | 第一次发出上游回 401（`credential_unavailable`）之后 `dispatchAgain` | 重试没用；`canDispatchAgain` 同样答 `{ refused: { why: fact_class } }` | 守卫 2、[S-50](contract.md#s-50-candispatchagain) |
| `retryRefused{provider_not_allowed}` | 见第 7 节 | 不允许回退 | 守卫 3 |
| `wrongPhase{phase: in_flight}` | `dispatch` 在途时另一路又调 `releaseCall(s1, c1)` | 这次发出还没收场 | [S-32](contract.md#s-32-releasecall) |
| `wrongPhase{phase: awaiting_decision}` | 第 1 节第 3 步之后（`c1` 在 `awaiting_decision`）`settleReply(s1, c1, { vetoed: … })` | 没有交回的回复可收口 | [S-49](contract.md#s-49-settlereply) |
| `invalidInput{malformed}` | `settleReply(s1, c1, persisted)` | 落盘成消息的那一条只能由调用方与消息同一提交写 | [S-49](contract.md#s-49-settlereply) ③ |

**判定次序的回归例**：

- 一次开过口、此刻在 `awaiting_decision` 的调用上 `dispatch(s1, c2)` ⇒ **`retryRefused{already_spoke}`**，不是 `wrongPhase`（[S-30](contract.md#s-30-dispatchagain) 末条、[S-29](contract.md#s-29-dispatch) ⑥ 的次序）。
- 一次**没开口**、此刻在 `open` 的调用上 `dispatchAgain(s1, c, { provider: B })`，且快照不许回退 ⇒ **`wrongPhase{phase: open}`**，不是 `retryRefused{provider_not_allowed}`——守卫 2、3 只在 `awaiting_decision` 时求值（[S-30](contract.md#s-30-dispatchagain) ⑥）。
- 会话日志读不到时 `interrupt(s1, c1, user)` ⇒ **`unavailable`**，不先判出 `callNotFound`（[S-14](contract.md#s-14-缺席时的默认答案与失败集合) 末段）。
- `c1` 在 `reply_pending` 时 `settleReply(s1, c1, { vetoed: … })` ⇒ **成功**，不是 `alreadyEnded`——`alreadyEnded` 的「收场已定」那一分句不适用于 `settleReply`；同一刻 `interrupt(s1, c1, user)` 才得 `alreadyEnded`（[S-14](contract.md#s-14-缺席时的默认答案与失败集合) 失败值表）。

## 9. 同路由名按层覆盖：一个名字一条，落到胜出行（场景 [S-48](contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行)）

另一个会话 `s2` 属于租户 `U = (O, B)`；**`U` 没配自己那一把**，部署给出厂格配了 `K_F`。除 `M1`、`M2` 外，`O` 的组织层建了一条自建档案 `M1c`，**路由名与 `M1` 相同（记作 `r`）**、在册、输入模态 `text`。`s2` 的选中模型是 `r`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `legalTargets(s2)` | `{ r, M2 的名字 }`——**`r` 一个元素**，胜出行是 `M1c` | [S-11](contract.md#s-11-合法目标集合) |
| `displayList(s2)` | `r` 一条：`ref = M1c`（主标：自建 · 组织层），注记 `{ legal, credential_missing }`（按 `M1c` 的来源问）；`covered = [{ ref: M1, 注记 { overridden_by{organization(O)} } }]`——官方那一行只作标注、选不了 | [S-12](contract.md#s-12-展示列表)、[S-25](contract.md#s-25-displaylist) |
| `effectiveModel(s2)` | `{ routeName: r, profile: M1c, selectedBy: session, selected: r }` | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步、[S-26](contract.md#s-26-effectivemodel) |
| 随后 `openCall(…)` | `{ state: handed_up, undispatched: credential_unavailable }`——**缺凭据不滤，不落到 `M1` 去用 `K_F`**；这是裁决写明的代价 | [S-10](contract.md#s-10-有效模型四步每步来源可查) 代价一段、[S-28](contract.md#s-28-opencall) 出门前检查第 4 行 |
| `U` 配上自己那一把之后再发一次 | `r` 不再带 `credential_missing`；发出的 `route.profile` 是 `M1c`、`route.credentialScope` 是 `U` 的租户层——组织层建的档案，成员调它用成员自己那一把 | [S-10](contract.md#s-10-有效模型四步每步来源可查)、[S-19](contract.md#s-19-凭据每次发出现取取值只交给传输适配) |

## 10. 三层同名、锁与已撤回的行

接第 9 节，`U` 已配自己那一把 `K_U`；`U` 又在自己那层建了一条 `M1t`，**路由名也是 `r`**、在册、输入模态 `text`。`s2` 的选中模型仍是 `r`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `effectiveModel(s2)` | `{ routeName: r, profile: M1t, selectedBy: session, selected: r }`——租户层最具体；发出时 `route.profile = M1t`、`route.credentialScope` 是 `U` 的租户层 | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步 |
| `displayList(s2)` | `r` 一条：`ref = M1t`，注记 `{ legal }`；`covered` 是 `M1c`、`M1`，各带 `overridden_by{tenant(U)}` | [S-12](contract.md#s-12-展示列表) |
| `O` 把「用哪个模型」锁成 `r`，`s2` 另选了 `M2` 的名字 | `{ routeName: r, profile: M1t, selectedBy: layer_lock, selected: M2 的名字 }`——锁的是名字，供应商、参数、凭据取胜出的 `M1t` | [S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2、2′ 步 |
| 锁撤掉、选回 `r`；`U` 撤回 `M1t` 之后 `effectiveModel(s2)` | `{ routeName: r, profile: M1c, selectedBy: session, selected: r }`——**已撤回的 `M1t` 不参与**，组织层的 `M1c` 胜出；`openCall` 照常，**不是改选**（选中的仍是 `r`） | [S-9](contract.md#s-9-选中模型)、[S-10](contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步 |
| 同一时刻 `displayList(s2)` | `r` 一条：`ref = M1c`，注记 `{ legal }`；`covered` 是 `M1t`（注记 `{ withdrawn, overridden_by{organization(O)} }`）与 `M1`（注记 `{ overridden_by{organization(O)} }`） | [S-12](contract.md#s-12-展示列表) |
| `O` 也撤回 `M1c` | 下一次 `r` 落到官方 `M1`；`covered` 里 `M1t`、`M1c` 各带 `{ withdrawn, overridden_by{factory} }` | [S-10](contract.md#s-10-有效模型四步每步来源可查) |
| 官方清单也撤掉 `M1`（链上三行都撤回了） | `effectiveModel` 给出 `profile = M1t`（落点：链上同名都撤回时取最具体的那一行）；`openCall` 以 `undispatched{withdrawn}` 结束——**「已下架」说的是 `r` 这个名字**；列表上 `r` 一条、注记 `{ withdrawn }`，没有 `covered`（没有胜出行） | [S-10](contract.md#s-10-有效模型四步每步来源可查)、[S-12](contract.md#s-12-展示列表)；`capability.model-profile-directory/v2#S-17` 末段 |
| `U` 把 `M1t` 恢复在册 | 下一次 `effectiveModel` 给 `M1t`，`openCall` 照常 | [S-10](contract.md#s-10-有效模型四步每步来源可查)；`capability.model-profile-directory/v2#S-33` |

## 11. 交回之后的收口与只读守卫

接第 1 节第 5 步：`r_2` 带着回复交回，`c1` 在 `reply_pending`。

| 情形 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 回复过了「消息落盘之前」 | loop 把 `r_2`（`persisted`）与回复消息同一提交写下 | `c1` 在 `complete`；本能力什么都不写 | [S-17](contract.md#s-17-结算一处按序幂等先到者赢) |
| 回复被转换件否决 | `settleReply(s1, c1, { vetoed: { by: 模态转换件, reason } })` | 本能力写下 `r_2`：`complete`、`reply` 照记、`replyDisposition = { vetoed }`、不带 `failure`；`c1` 在 `complete`、**不再发出**；日志里没有回复消息 | [S-49](contract.md#s-49-settlereply) |
| 同上，再调一次 | `settleReply(s1, c1, { vetoed: … })`（同一个处置） | 返回同一个 ⑤，什么都不写 | [S-49](contract.md#s-49-settlereply) ⑦ |
| 压缩闭包里的那次调用 | `settleReply(s1, c7, { consumed: { by: compaction } })` | 写下 `replyDisposition = { consumed }` 的那一条；账照记 | [S-49](contract.md#s-49-settlereply) |
| 调用方没收口就停了宿主 | （宿主停止） | 撤除写 `r_2`：`interrupted{run_cancelled}`、没有 `reply`、回复的块进 `delivered` | [S-36](contract.md#s-36-宿主停止与撤除) |
| 另一次调用 `c8` 开口了、还在说，宿主（系统发起）停止 | （宿主停止，没有先 `interrupt`） | 本能力对 `c8` 那一次发出的装配状态调 `abandon`、不带缘由——**不交 `finish { reason: interrupted }`**；写下的响应体 `interrupted{run_cancelled}`、没有 `reply`、不带成因，交付过的块进 `delivered`；**没有** `AssistantMessage`（不是 `interrupted_by_user`） | [S-36](contract.md#s-36-宿主停止与撤除)、[S-51](contract.md#s-51-模型侧到达装配前提的承诺) 第 6 条；D-060 §七 M12 |
| 进程丢了 | 新尝试的 `reconcile(s1, 尝试 2)` | 日志里是「已开口、无响应体」⇒ 追补 `interrupted{runtime_lost}`、不再发出 | [S-33](contract.md#s-33-reconcile) 第四行 |

**只读守卫**（`c5` 在 `awaiting_decision`，最近一次 `failed{upstream_unavailable}`，快照允许 `[A, B]`、允许回退）：

| 调用 | 预期 | 依据 |
|---|---|---|
| `canDispatchAgain(s1, c5, { provider: B })` | `{ allowed }`；什么都不写、调用状态不变 | [S-50](contract.md#s-50-candispatchagain) |
| `canDispatchAgain(s1, c5, { provider: C })` | `{ refused: { why: provider_not_allowed } }`——与 `dispatchAgain` 同一张表 | 同上、[S-30](contract.md#s-30-dispatchagain) 守卫 3 |
| 随后宿主进入停止，`dispatchAgain(s1, c5, { provider: B })` | `runtimeStopped`——**`{ allowed }` 只对那一刻成立** | [S-50](contract.md#s-50-candispatchagain) ⑦ |
