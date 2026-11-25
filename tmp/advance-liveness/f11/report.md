> 这是一份只读子代理写给原会话的调查报告，原样保留。文中的「你」指原会话；提到的现场原始输出（`s6b-diag.txt`、`s3-diag.txt`、`s6b-history.txt`、`s6b-server.jsonl`、`dump.sh`）含负责人的会话内容，没有带进材料；`server.log` 的行号指负责人部署上的日志，接手的机器上没有。结论与代码位置仍然有效。

## F11 根因：撤销归档后新一轮卡在 I1，0 次模型调用

注意：没有写出 tmp/advance-liveness/f11/report.md，Write 工具拒绝子代理写报告文件。完整报告就在下面，可以原样落盘。现场原始输出放在 tmp/advance-liveness/f11/，有 s6b-diag.txt、s3-diag.txt、s6b-history.txt、s6b-server.jsonl，另有只读解码脚本 dump.sh。全程没有执行 send、cancel、archive，也没有重启任何进程。

### 摘要（15 行内）
1. 撤销归档会铸造第 2 代作用域。会话自有的三块注册（`session.modes`、`session.working-directory`、`session.workspace-guidance`）只在创建时写进第 1 代，此后没有任何路径给新一代补上。
2. coding 定义里有工具声明了条件：Notifications 的 `send`，Agents/Dispatch 的 `report`。新一轮走到 I1 准备请求时，要读 `session.modes` 来裁剪工具表，Runtime Context 答 `refused`。
3. `apps/harness-server/src/rows/agent-context/tools.ts:95` 把这个 `refused` 译成了可重试的 `unavailable`。于是 Agent 在 I1 每约 15 秒重查一次，永远等下去。
4. 现场已证实：server.log 里反复出现 `node=I1 owner=input-source diagnostic=tool-conditions: read: refused`，跨两次重启都在。全日志 11 处，只出现在三个卡住的执行上（s6b 两个、s3 一个）。
5. 日志已证实：s6b 和 s3 的注册条目只挂在第 1 代作用域。`session.unarchived` 之后一条注册都没有。
6. 你的推断「根因在会话日志里」成立，但缺的持久事实不是后台调用占位、未了结的控制或解释进度，而是新一代作用域没有会话自有块的注册。
7. 对照组有混杂：s6a 是 `assistant` 定义，s6b 和 s3 是 `coding`。s6a 的第 2 代同样没有注册，只是它不读条件，所以照常运行。
8. 由此推出后台调用与 F11 无关，任何 coding 会话归档再撤销都会卡，这一点还没在现场跑过。区分实验要另起实例（不用 18787）：开 coding 会话，不起后台调用，归档、撤销后发一句，预期出现同一行诊断。
9. 与 R4 互相独立。cancel 之后新一轮的 `pass.accept` 正常答 ok，invoke 被受理了；卡住是新执行在 I1 等一个永远读不到的依赖。两者共有的问题是把「确定不会变」的答复当成「会过去」来等。

### 证据链（读码，文件:行）
- I1 节点：`packages/agent/agent/src/loop/coordinator.ts:2211-2233` 依次做 conditions、select、prepare，任一步答 `unavailable` 就 `waitFor('I1', …, recheck)`。`waitFor` 在 `:913-925`，日志里那句 "agent run waits for a dependency" 由它打出。
- 驱动循环：`packages/agent/agent/src/provider.ts:494-515`，runExecution 交出等待后，waitForWake 到点答 ready，再跑一遍。对应现场每约 15 秒一次 `omne.agent.pass.run`，结果为 ok。
- `packages/context/request-context-contract/src/input-read.ts:38-39` 把来源的 unavailable 记在 owner `input-source` 名下。
- `apps/harness-server/src/rows/agent-context/tools.ts:90-95`：工具只要 `declaresConditions`，就调 `heldBy`；`heldBy` 一失败，就 `return unavailable(\`tool-conditions: ${held.failure}\`)`。确定的拒绝在这里被降成了不可用。
- `apps/harness-server/src/rows/session-ad03/published-view.ts`：`heldBy` 调 `readPublishedView`，后者用 `readPublishedNeed`，其中 holds 恒为真（`:105`）。它不像 `readHeldNeed`（`:110-121`）那样，对「本作用域从没注册过这块」答 null。`currentScope` 取 `contextScopes.at(-1)`（`:60-62`），即未结束的第 2 代。之后依次 recover、取资格、绑定、read，拒绝写成 `read: refused`（`:74`）。
- 资格为空：`packages/session/session-adapters/src/cordis/context-holder.ts:1006` 用 `readableBy(view.final, consumer)`（`context-scope-readers.ts:27-40`），按作用域现有注册算 keys 和 bindings。第 2 代没有注册，所以算出来为空，但资格仍答 `current`，因此报错不是 `eligibility: …`。读的时候 `packages/context/runtime-context/src/reader.ts:466-470` 的 `authorizeNeed` 答 `refused/unauthorized`。具体 reason 是推出的，日志只记到 refused。
- 注册只在创建时写：`packages/session/session-contract/src/decide-initialization.ts:166-168` 要求注册属于 "live original creation scope"。撤销归档的决策 `decide-management.ts:149` 只写 `session.unarchived` 和新的 scope 绑定。新一代怎样产生见 `context-scopes.ts:49-66`。规格 `packages/session/SPEC.md:374` 写「新代次不迁移旧作用域的注册」，没说会话自有块由谁、在什么时候重新注册。

### 现场核对（只读，已证实）
- server.log 行 31264（s6b 的 run_ba54，08:06:29）、33968（run_cca6，08:08:39）、36330（08:10:17，第一次重启后）、228187（09:01:25，第二次重启后）是同一行：`… step=step-1 node=I1 owner=input-source diagnostic=tool-conditions: read: refused`。三处的服务端实例 ref 各不相同（6a5a、d79b、7e21），说明跨了重启。s3 的 run_b2ba 出现 5 次。
- s6b 从 08:08 到 09:19，每约 15 秒一次 `omne.agent.pass.run`，结果 ok，每次伴随 4 次 readModelView，到 09:19 cancel 才停。diagnostics 显示 model calls 0、tool calls 0。attempts 3 次里有 2 次 superseded，就是两次重启后的 claim（08:10:12 和 09:01:18，都答 ok）。
- 用 sqlite 只读打开 sl_entry 看 s6b：`session.context-registration-changed` 只在 pos 21、23、25，分别注册 modes、working-directory、workspace-guidance，scope 都是第 1 代 `session-scope:18303fba…`。pos 74 archived，第 1 代结束。pos 82 unarchived，铸造第 2 代 `16571c7e…`，ended 为 null。pos 82 之后没有任何注册条目。
- s3 相同：注册在第 1 代 `4cc23732…`；pos 304 撤销归档，第 2 代 `0d40eaa5…` 没有注册。
- s6a 的 `session.created` 定义是 assistant，没有常驻工具，第 2 代 `a9c61ce6…` 同样没有注册，但它的下一轮正常。
- s9（2442ad33…）：coding 定义，归档前没有后台调用，撤销后第 2 代也为空，但之后没人发过话，所以得不出结论。本租户里没有任何 coding 会话在撤销归档后成功跑完过一轮。

### 已证实与推出
- 已证实：卡在 I1；诊断原因词是 `tool-conditions: read: refused`，跨重启不变；第 2 代缺注册；对照组定义不同。
- 推出：refused 的具体 reason 是 unauthorized；`tools.ts:95` 的降级造成无限等待；后台调用与 F11 无关（需要上面那个区分实验来证实）。
- 波及面（推出，未核）：撤销归档后的请求可能缺工作目录和工作区指导两块运行时提醒；执行期带条件命令的放行判断 `judgeCallConditions` 也会读不到。

### 应然
新一轮开始之前，当前一代作用域应当已经有会话自有块（modes、工作目录、工作区指导）的注册。可以在撤销归档那次提交里为新一代重新声明，也可以在新 Run 的采用点补上。消费者读一个当前作用域确定没有的块时，应当得到确定的答复：像 `readHeldNeed` 那样答没有，或者让这一轮有界失败，而不是把 refused 当成 unavailable 无限等。`SPEC.md:374` 的「新代次不迁移旧作用域的注册」是否把会话自有块排除在外、补注册归谁，由拥有者裁定。