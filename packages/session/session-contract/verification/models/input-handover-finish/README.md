# 交入与收场的有限模型

[InputHandoverFinish.tla](InputHandoverFinish.tla) 检查一个 Run 的普通输入怎样交给它的执行，以及这一过程和条件终结的先后。会话在 Run 进行中受理输入（SE11），续入把它交给执行（Agent `submit`），会话写交入回执（SE35）。Agent 在步界取走水位线以内的输入（`input-taken`），会话把这解释成 SE14。条件终结（`tryFinish`）要在一次提交里同时过两项核对：Agent 自己的核对（水位线以内都已取走）和会话参加者的核对（没有待交输入）。

模型检查只说明有限范围内的设计性质。它不证明实现符合模型。

## 性质

| 性质（模型名） | 违背后果 | 条款 |
| --- | --- | --- |
| Run 不带着去处是它、既没取走也没拒收的输入收场（`EndedClean`） | 用户说的话丢了：输入进了历史，但没有任何一个 Run 处理它 | 会话契约 [PA-02](../../../SPEC.md#pa-02)；Agent 契约「输入内容与水位线」与「条件终结」 |
| 每条输入至多一个结局：取走、拒收、改去下一个 Run（`OneOutcome`） | 同一句话被处理两次，或拒收之后又被处理 | 会话契约 [I-R3](../../../SPEC.md#i-r3)、[PA-09](../../../SPEC.md#pa-09) |

## 有限范围

一个会话、一个 Run；`Inputs = {i1, i2}`。Agent 已结束之后，`submit` 答 `terminal`，什么都不改，所以模型里没有这个动作（[PA-03](../../../SPEC.md#pa-03)）。会话看到结束之后，仍待处理的输入改去下一个 Run，下一个 Run 不在模型内。`Bug` 每个值去掉一条设计规则，`"none"` 是设计。

## 配置

| 配置 | `Bug` | 预期 |
| --- | --- | --- |
| `positive.cfg` | `none` | 通过 |
| `negative-no-participant.cfg` | `no-participant`：条件终结不问会话参加者 | 违反 `EndedClean`：一条已受理、还没交入的输入被留下 |
| `negative-no-agent-check.cfg` | `no-agent-check`：Agent 不核对水位线以内的输入 | 违反 `EndedClean`：一条已交入、还没取走的输入被留下 |

## 模型与代码的对应

| 模型 | 代码 |
| --- | --- |
| `Accept(i)` | 会话的 `accept`（SE11），`decide.ts` 的受理分支 |
| `Submit(i)` | Agent 执行句柄的 `input.submit`（`packages/agent/agent/src/submit.ts`）；`Journal.submit` 的同一次提交里，会话参加者按 PA-01 第 2 项核对来源（`session-storage-sql/src/worker/check.ts` 的 `sourceHolds`）。会话一侧的调用方是续入，线卡 #1216 的 A5 |
| `Receipt(i)` | `decide.ts` 的 `receive(input-handover)`：输入不在待处理或已有 SE35 时拒收 |
| `Reject(i)` | `submit` 答 `invalid(value)`，会话写带拒收的 SE35（PA-09） |
| `Take`、`Interpret(i)` | Agent 协调器的 I0 与 `input-taken`；会话的同日志解释写 SE14 |
| `AgentAllows` | Agent Journal 的条件终结核对水位线以内的输入 |
| `ParticipantAllows` | `judgments.ts` 的 `judgeCompletion`：Run 进行中、待处理里有没进 `handed` 的输入时答 `blocked` |
| `SeeEnd` | 会话解释 Agent 的结束事实之后 `routeInput` 重定去处 |

## 复跑

在本目录用 TLC 逐份配置运行，预期写在 [expect.txt](expect.txt)：

```sh
java -cp "$TLA2TOOLS_JAR" tlc2.TLC -config positive.cfg InputHandoverFinish.tla
```

运行记录见 [formal-runs.md](../formal-runs.md#input-handover)。

## 未覆盖

- 多个 Run、下一个 Run 怎样承接改去的输入。
- 加急输入（插队）。
- 交入回执写不上（发行里 `receive(input-handover)` 现在答不可用）只让会话参加者多挡一会儿：输入在 SE14 解释之后不再待处理。模型里 `Receipt` 可以不发生，这一情形已经在可达状态里。
