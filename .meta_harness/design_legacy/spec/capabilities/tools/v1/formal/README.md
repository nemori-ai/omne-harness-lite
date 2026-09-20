# 形式工件范围

ToolCall safety/progress 来自 legacy v2 当前工件，覆盖有限调用状态、去重与进展；`StopProgressUnknown` 可使业务 call settled 而 attempt 仍为 dispatch_intent，说明 settlement 与 execution exposure 不能合并。模型未定义 exposure owner/generation、同代关闭证据或 RN-05 派生 barrier；真实执行提供者、frames cursor、授权/预算和外部效果不在模型内。

## 归档静止与 deadlock policy

[Session SE-02](../../../session/v1/contract.md) 允许没有非终态 Run、没有未收口责任的
Session 归档；Tools TS-11 要求归档不凭空产生或重启调用。空 Session 归档后、owner
恢复且有限 crash 额度耗尽时，`Next` 可以没有后继，这是合法静止，而非尚未兑现的进展。
模型没有承诺归档后必须持续 housekeeping；也不模拟重新打开 Session。

`Spec == Init /\ [][Next]_vars` 的方括号允许状态不变；在所有动作都不可用的状态，
永久 stuttering 满足所列公平性。四条进展性质的待履行条件此时均不存在或已兑现。
这是对该模型公式的判断，不是仅凭“有方括号”就认定任意停滞合法；算子定义见
[Lamport 的 TLA+ Summary，第 4 页](https://lamport.azurewebsites.net/tla/summary.pdf)。

两份 cfg 因此设置 `CHECK_DEADLOCK FALSE`，保留全部原有 invariant/property，
另加 `QuiescenceSafe`：若 `Next` 没有后继，必须处于 archived、owner alive、Run
无活跃工作，并且没有 open call、待投递结算、未兑现 stop 或 open human request。
该 invariant 位于 `ToolCallMC`，不改业务转移或公平性。它防止关闭 TLC 通用 deadlock
检查后漏掉带未履行责任的死端；有后继的无限不进展行为仍由四条 temporal property 检查。

## 本次有限检查（2026-09-16）

采用 TLC 2.19（rev `5a47802`，jar SHA-256
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`）与
Temurin 21.0.12.1；单 worker、2 GiB heap、独立 `-metadir`。该 TLC 不支持
`-noGenerateSpecTE`，实际命令省略它；旧全局任务登记必须由登记拥有者同步后重跑，
本结果不能冒充旧命令通过。

| 检查 | 边界与结果 |
| --- | --- |
| `ToolCall.cfg` | 2 calls、最多 1 crash、Calls symmetry；exit 0，2,197,708 generated / 494,874 distinct，queue 0，57 秒 |
| `ToolCallProgress.cfg` | 1 call、最多 1 crash、无 symmetry；exit 0，14,738 generated / 4,190 distinct，queue 0，4 秒；四条进展性质完整结束 |
| 恢复时重新 dispatch | `SpecRedispatch` 仍由 `AttemptMonotone` 检出，exit 13 |
| 分别去掉 gate / adjudicate / finish / human answer+decide 公平性 | 四个单性质负例分别违反 `CallsSettle` / `SettlementsResolve` / `StopsProgress` / `HumanRequestsResolve`，均 exit 13 |
| 禁用 `Adjudicate` | 带待投递结算的死端由 `QuiescenceSafe` 检出（exit 12）；独立去掉该 invariant 仅检查 `SettlementsResolve` 仍检出 temporal 反例（exit 13） |

负例均保留 `CHECK_DEADLOCK FALSE`，证明目标检查未依赖原来的通用 deadlock 报错。
进展仍以 `SpecFair` 的系统/环境公平性为前提，尤其不保证人类一定回答；没有墙钟期限、
任意 calls/crashes 的证明或产品实现符合性结论。状态指纹有限检查也不是演绎证明。
精确工件与原始日志哈希见[验证记录](../../verification.md#归档静止检查记录)。
