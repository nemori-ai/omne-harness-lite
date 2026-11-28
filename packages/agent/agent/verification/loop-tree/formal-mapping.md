# 新机制的调用树：责任闭合、取消与保管

AG-35、AG-37、AG-38、AG-39：新机制里一次 execution 结束只要责任交清，不等它调用的一方收场；取消往下传的是一句「不再持有」，消费责任交给保管方；结果不知道的调用挡住结束；一次 execution 只读一份采用依据。规则在 [Agent 的规格](../../../SPEC.md#可替换的环)。

## 状态与对应

| 模型 | 实现 |
| --- | --- |
| 有孩子的节点 | 一次新机制的 execution；它的孩子是它发出的调用。孩子也有孩子时，那个调用是一次派发，另一头是另一个会话里的 execution |
| 没孩子的节点 | 一次模型或工具调用 |
| `rec[n]` | 执行记录里「已发出」的调用 |
| `mem[n]` | 活体内存，随活体丢 |
| `resp[c]` 的 `caller`、`custodian` | 调用的消费责任在发出它的 execution，或在保管方（Agent 的结果接收） |
| `settled[c]` | 结果已被 execution 喂给决定者，或已被保管方收下 |
| `Background`、`Notify` | 转后台的控制；取消时对每个还在等的调用写「保管」 |
| `Closed(n)` | `agent-contract` 判责任交清的纯函数 |
| `runEnd` | Run 在协调者一侧的终态，归 Session |
| `inbox`、`Tell`、`Take` | 别的会话递来的话进待处理；脚本的 `take` 取走 |
| `seen[n]`、`Adopt` | 每次重算读到的采用依据；会话改选 |

## 性质

- `NoDup`：每个调用至多被启动一次，活体丢多少次都一样。
- `PinnedOnce`：一次 execution 的每次重算读同一份采用依据。
- `NoOrphan`：发出而答复没被收下的调用，恰有一方负责：还开着的 execution，或保管方。
- `UnknownHolds`：结果不知道的调用一旦发出，发出它的 execution 结束不了。
- `NoLostMessage`：递来的话要么在待处理里，要么被取走。
- `CancelQuiet`：取消生效之后不再发出调用（历史量上的不变式）。
- `CanEndAfterCancel`：根被取消、责任交清时，取消收尾就能走，不等它派出去的 execution 收场。

## 负控与见证

| 配置 | 改坏了什么 | 违反 |
| --- | --- | --- |
| `bad-volatile.cfg` | 「已发出」只记在内存 | `NoDup` |
| `bad-read-adopted.cfg` | 重算时读会话此刻的选择 | `PinnedOnce` |
| `bad-end-held.cfg` | 结束时不要求责任交清 | `NoOrphan` |
| `bad-issue-after-cancel.cfg` | 取消之后还发 | `CancelQuiet` |
| `bad-wait-for-child.cfg` | 取消收尾要等孩子都收场 | `CanEndAfterCancel` |
| `bad-drop-late.cfg` | 调用方结束之后递来的话丢掉 | `NoLostMessage` |

`witness-*.cfg` 各打破一条「永远不会」：根完成、根取消、有调用在保管方、结果到时调用方已结束、话被取走、Run 已取消而 execution 还开着。

`pinned.cfg` 与 `bad-read-adopted.cfg` 带两个版本，另加约束 `NoTell`，不探索递话，免得超出单线程两分钟的时限；递话由 `bad-drop-late.cfg` 与见证查。

树是三层四个节点：根，它派出去的 execution，根的一个叶子，那个 execution 的一个叶子。模型不含经过、收尾的否决与准入，它们在 `loop-exec`。「根终究会结束」是活性，仓库的跑法只认不变式，它在设计期用八个工作线程的完整模型查过，不在这里。

从仓库根运行，输出目录须不存在：

```sh
node scripts/with-test-slot.mjs --want 1 --min 1 python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/agent/agent/verification/loop-tree tmp/formal-agent-loop-tree --jar "$TLA2TOOLS_JAR"
```

## 证明到契约测试

| 性质 | 测试断言 | 去掉什么会变红 |
| --- | --- | --- |
| `NoDup` | 每个调用发出后丢活体，再叫醒，模型与工具各只被调用一次 | 「已发出」不与效果同一次提交 |
| `NoOrphan`、`CanEndAfterCancel` | 取消时一个派发出去的会话还开着：这次 execution 以已取消结束，派发的会话没被取消，它的结果之后由保管方收下 | 取消收尾等孩子收场 |
| `UnknownHolds` | 一个模型调用受理未知时取消：Run 的取消终态成立，execution 不结束 | 把未知的调用写成「保管」 |
| `PinnedOnce` | 一轮当中会话改选：在途的 execution 照旧，下一次用新的 | 每次叫醒读会话此刻的选择 |
| `CancelQuiet` | 取消之后没有新的「已发出」与经过 | 取消之后照样叫醒决定者 |
| `NoLostMessage` | execution 结束之后递来的话，下一次 execution 取得到 | 结束之后不收话 |
