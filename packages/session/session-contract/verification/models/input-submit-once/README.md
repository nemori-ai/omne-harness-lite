# 重复触发的有限模型

[InputSubmitOnce.tla](InputSubmitOnce.tla) 检查同一条待处理的输入同时被两个触发交入时，会不会被受理两次、取走两次或写两条交入回执。受理之后的本地唤醒与恢复扫描都会跑续入：读快照，输入仍待处理且没有 SE35 就交入，再写 SE35。

模型检查只说明有限范围内的设计性质。它不证明实现符合模型。

## 性质

| 性质（模型名） | 违背后果 | 条款 |
| --- | --- | --- |
| 同一条输入至多受理一次（`AcceptOnce`） | 同一句话进执行记录两次，模型读到两遍 | 会话契约 [I-R3](../../../SPEC.md#i-r3)；Agent 契约「输入内容与水位线」：同一输入身份按身份认回 |
| 至多取走一次（`TakeOnce`） | 同一句话被两步各处理一次 | I-R3 |
| 至多一条 SE35（`OneReceipt`） | 归约读到两条交入回执 | `decide.ts` 的 `receive(input-handover)` |

## 有限范围

一条输入；`Triggers = {"accept", "scan"}`。`Bug` 每个值去掉一条设计规则，`"none"` 是设计。

## 配置

| 配置 | `Bug` | 预期 |
| --- | --- | --- |
| `positive.cfg` | `none` | 通过 |
| `negative-fresh-identity.cfg` | `fresh-identity`：每个触发用自己的身份交入，执行记录认不出 | 违反 `AcceptOnce` |
| `negative-blind-receipt.cfg` | `blind-receipt`：SE35 的写入不看快照 | 违反 `OneReceipt` |

## 模型与代码的对应

| 模型 | 代码 |
| --- | --- |
| `Read(t)` | 续入在会话的串行队列里重读快照（线卡 #1216 的 A5） |
| `Submit(t)` | `packages/agent/agent/src/submit.ts`：同一输入身份已受理时按认回谱系提交；`Journal.submit` 按输入身份认回 |
| `Receipt(t)` | `decide.ts` 的 `receive(input-handover)`：输入不在待处理或已有 SE35 时答 `invalid` |
| `Take` | 协调器的 I0；会话的 SE14 |

## 复跑

在本目录用 TLC 逐份配置运行，预期写在 [expect.txt](expect.txt)：

```sh
java -cp "$TLA2TOOLS_JAR" tlc2.TLC -config positive.cfg InputSubmitOnce.tla
```

运行记录见 [formal-runs.md](../formal-runs.md#input-handover)。

## 未覆盖

- 两个触发交入同一输入时内容不同：执行记录答 `conflict`，由 Agent 契约的一致性用例守。
- 会话在两次交入之间换了 Run：去处变了，第二次交入答 `terminal`，见[交入与收场](../input-handover-finish/README.md)。
