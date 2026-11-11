# 有上限资源下 Run 的活性

[CapacityLiveness.tla](CapacityLiveness.tla) 检查这一性质：只要外部依赖终究可用，每个被受理的 Run 终究完成。能成的 Run 完成，永远不成的 Run 以失败终结。资源的上限与同时在途的 Run 数只影响完成的早晚。[expect.txt](expect.txt) 列出每个配置与预期结果。

模型检查只说明有限范围内的设计性质。它不证明产品实现符合模型。

## 模型对应的正文规则

性质靠两条规则成立。有上限的资源都守住它们：

- 资源此刻满了，答暂时不可用（`unavailable`）。只有请求本身永远不会成功时，才答确定的拒绝。
- 调用方收到暂时不可用，读与写都按依赖等待，到检查时刻以同一操作再试。

| 模型 | 正文规则 |
| --- | --- |
| `Refuse` 的等待分支，`waiting` | Agent SPEC 的[依赖不可用时的等待](../../SPEC.md#依赖不可用时的等待)。Loop 页节点表与[恢复入口与回归点](../../docs/architecture/loop-algorithm.md#恢复入口与回归点)的 W0 行 |
| `Refuse` 对 `model` 的等待 | Loop 页节点表的 M6 行：Model 答 unavailable 时按依赖等待。model-contract 的[按租户的串行区与公平](../../../../model/model-contract/SPEC.md#按租户的串行区与公平)：份额此刻被占满答 unavailable。model-storage-sql 的[一次 run](../../../../model/model-storage-sql/SPEC.md#一次-run) |
| `DefiniteRefuse` | sql-contract 的[提交拒绝原因的定性](../../../../storage/sql-contract/SPEC.md#提交拒绝原因的定性)。会话日志 Journal 按定性翻译，见 session-adapters 的[生产提供者的实现现状](../../../../session/session-adapters/SPEC.md#生产提供者的实现现状)。Agent SPEC 的[确定节点故障的收尾](../../SPEC.md#确定节点故障的收尾) |
| `Acquire`、`Release`、`StoreCap`、`ModelCap` | 存储的提交名额与 Model 的租户份额。一次提交或一次调用结束时，名额归还 |

## 状态与动作

每个 Run 依次做三步：保存（占一个存储名额）、调模型（占一个 Model 名额）、再保存，然后完成。`pc` 是 Run 的位置，`held` 是 Run 此刻占着的名额，`waiting` 表示 Run 收到暂时不可用后在等待。`Poison` 中的 Run 最后一次保存永远不会成功，例如命令超过单命令上限。

三个开关各对应一种错误做法。全部为 FALSE 是应然。

| 开关 | 错误做法 |
| --- | --- |
| `StopOnUnavailable` | Agent 的写提交答 unavailable 时停止驱动，不等待 |
| `BusyAsCapacity` | Model 把份额此刻被占满答成确定的 `capacity`，Agent 以 model-refused 终结 Run |
| `DefiniteAsUnavailable` | 会话日志 Journal 把存储的确定拒绝答成 unavailable，Run 等一个永远不变的拒绝 |

## 配置

| 配置 | Run 数 | 写不成的 Run | 存储上限 | 模型上限 | 检查 | 预期 |
| --- | --- | --- | --- | --- | --- | --- |
| `positive-scarce` | 3 | 0 | 1 | 1 | 全部不变量与 `AllComplete` | 通过：上限小于 Run 数，每个 Run 都完成 |
| `positive-mixed` | 4 | 1 | 2 | 1 | 同上 | 通过：能成的完成，写不成的以失败终结 |
| `positive-ample` | 3 | 1 | 3 | 3 | 同上 | 通过：上限不小于 Run 数，结论相同 |
| `bad-stop-on-unavailable` | 3 | 0 | 1 | 3 | `NeverStopped` | 违反 `NeverStopped` |
| `bad-busy-as-capacity` | 3 | 0 | 3 | 1 | `NeverRefused` | 违反 `NeverRefused` |
| `bad-definite-as-unavailable` | 2 | 1 | 1 | 1 | `NeverWaitsOnDefinite` | 违反 `NeverWaitsOnDefinite` |

三个正控覆盖上限小于 Run 数、两者混合、上限不小于 Run 数三种关系。三个负控各打开一个开关，必须违反 expect.txt 指定的不变量。解析或工具失败不算负控检出。

## 为什么结论与上限无关

`AllComplete` 的论证只用到两件事：

1. 每个占着的名额终究会释放。`Release` 有弱公平，一步做完就归还名额。
2. Run 数有限。其他 Run 都完成或失败之后，资源一直空着，等着的 Run 一定拿得到名额（`Acquire` 有弱公平）。

论证没有用到 `StoreCap` 与 `ModelCap` 的值。三个正控的上限与 Run 数关系各不相同，结论一致。

## 模型边界

- 等待不占存储名额。所以 W0 保存等待这一写本身答 unavailable 的情形不在模型里。它的处理是：等待留在进程里，到检查时刻经 E1 重新判断。依据是 Agent SPEC [依赖不可用时的等待](../../SPEC.md#依赖不可用时的等待)，不靠 TLC。
- Run 数有限。新会话永不停止地涌入时，重试不排队，某个 Run 可能一直被后来者抢先。这是开放到达下的公平性，模型不覆盖。
- 外部依赖终究可用。机器本身被压垮或外部额度用完时，Run 一直等待，不被系统停止或拒绝。模型不证明它们终究可用。
- 只有一个租户、两种资源。读、分词器与工具名额按同一形状对待，没有分别建模。

## 运行

从仓库根运行以下命令，输出目录须尚不存在。

```sh
scripts/with-test-slot.sh python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/agent/agent/verification/capacity-liveness tmp/formal-agent-capacity-liveness --jar "$TLA2TOOLS_JAR"
```

持续维护者改变上述规则时，同步模型、配置、本页与 Agent SPEC 的链接。单次运行结果不写入本目录。
