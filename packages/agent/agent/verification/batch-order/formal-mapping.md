# 一批获准动作的发起次序

AG-33：同一批获准动作的先后由 Agent 掌握。一个动作可以发起，当且仅当排在它前面的每个获准动作都满足其一：槽位已经填满；它与这个动作都可以同时进行。

## 状态与对应

| 模型 | 实现 |
| --- | --- |
| `beside[i]` | 动作的获准判断上带的「可以与同批别的动作同时进行」，由可信请求来源给出 |
| `verdict[i]` | 动作的判断：获准或被拒 |
| `slot[i]` 的 `none`、`dispatched` | 没有槽位、已发起的槽位 |
| `slot[i]` 的 `final`、`background`、`denied` | 原 final 填满的槽位、转后台的占位、拒绝的槽位 |
| `Sendable(i)` | `packages/agent/agent/src/loop/tools.ts` 的 `sendable` |
| `Send`、`Fill` | 循环的 A2 发起；T1 把到达的交付记进槽位 |

## 性质

- `ExclusiveAfterEarlier`：有效果的动作在发起中时，排在它前面的每个获准动作的槽位都已填满。
- `SharedAfterEarlierExclusive`：只读的动作在发起中时，排在它前面的每个有效果的获准动作的槽位都已填满。
- `EveryAllowedIsSent`：没有动作在发起中而还有获准动作没发起时，至少有一个可以发起。它是不停住的安全性表述，不是公平性证明：槽位总会被填满这一点由 Tool 的交付保证，不在本模型里。

## 负控

| 配置 | 改坏了什么 | 违反 |
| --- | --- | --- |
| `bad-eager.cfg` | 一口气全发 | `ExclusiveAfterEarlier` |
| `bad-shared-overtakes.cfg` | 只读的动作不等排在它前面的有效果的动作 | `SharedAfterEarlierExclusive` |
| `bad-background-blocks.cfg` | 把后台占位当成没有结果 | `EveryAllowedIsSent` |

四个动作、每个动作两种标记与两种判断的全部组合都探索到。模型不含取消、换挂接与嵌套动作；它们由循环的用例守。

从仓库根运行，输出目录须不存在：

```sh
node scripts/with-test-slot.mjs --want 1 --min 1 python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/agent/agent/verification/batch-order tmp/formal-agent-batch-order --jar "$TLA2TOOLS_JAR"
```
