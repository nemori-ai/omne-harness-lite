# 2026-09-25 · `capability.session-log` v1 形式工件的首次执行（正配置 + 五份核对配置）

接口契约批（[D-043 R-1](../../decisions/assets-runtimes-rulings-2026-09-25/README.md)）新立的 `capability.session-log` v1 带一份 TLA+ 模型
（[`formal/README.md`](../../../spec/capabilities/session-log/v1/formal/README.md)）：正配置登记为 formal task `session-log-v1-appends`；
另五份核对配置**预期出反例**（三份否定：去掉序列化或判重持久；两份可达性：证明「重复被拒」「过期尝试被拒」两个状态真的到得了），按契约原话不登记为 formal task。
起草者没有工具链、未运行；本 run 是第一次执行，输入快照与原始输出入库。契约仍 **candidate**，通过不提升状态。

执行在 HUB 分支 `panqiwei/assets-runtimes`、提交 `85e71ba4`（[`started.txt`](started.txt)），工作目录是设计根，命令与登记逐项相同（各目录 `commands.txt`），
`input/` 带 `SHA256SUMS`，`output/tlc.log` 是 TLC 原始日志。

## 结果

| 目录 | 配置 | 预期 | 结果 | 规模 |
|---|---|---|---|---|
| `session-log-v1-appends/` | `SessionLog.cfg`（正配置，registry 登记） | 无反例 | 退出 **0**，无反例 | 5846 generated · 2784 distinct · 00s |
| `validity-SessionLog_NoSerialization_Fence/` | 去掉序列化（栅栏） | 推翻 `FenceHolds` | 退出 12，**找到反例**（`FenceHolds` 被违反） | 1397 generated |
| `validity-SessionLog_NoSerialization_Key/` | 去掉序列化（判重键） | 推翻 `UniqueDedupeKey` | 退出 12，**找到反例** | 991 generated |
| `validity-SessionLog_VolatileDedupe/` | 判重不持久 | 推翻 `UniqueDedupeKey` | 退出 12，**找到反例** | 889 generated |
| `validity-SessionLog_Reach_DuplicateRejected/` | 可达性 | 「重复被拒」可达（`NeverDuplicateRejected` 被违反） | 退出 12，**可达** | 86 generated |
| `validity-SessionLog_Reach_StaleRejected/` | 可达性 | 「过期尝试被拒」可达（`NeverStaleRejected` 被违反） | 退出 12，**可达** | 139 generated |

六份全部按预期。正配置的无反例不是空真：两条不变量各有一份否定配置把它推翻，两个拒绝状态各有一份可达性配置证明到得了。

## 边界

- 常量取值与关闭的路径见 `formal/README.md`；有限检查不是无条件证明。模型只覆盖 S-8（判重）与 S-10（栅栏），锚的算法（G-2）不在模型里。
- 工具：Java 21、`tla2tools.jar`（`/opt/tlaplus`），与 `2026-09-25-formal-assets-runtimes` 相同；run id 用本程工作日，时间戳为 UTC。

返回[运行证据](../README.md)。
