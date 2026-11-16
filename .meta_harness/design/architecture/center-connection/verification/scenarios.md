# 规范场景

本设计**不附 Schema**，这里的实例不是形状校验用例，
而是**对端的行为 → 预期读到的可达性 → 依据**。依据一栏指[设计](../design.md)的节。

**两条读法上的边界：**

- **时刻只是占位**：`t0`、`t1` 这类写法只表示先后；具名参数 `probeInterval`、`probeTimeout` 的值本设计不填。
- **「预期」是设计要求的可观察结果，不是某次执行的记录。**

## 1. 起来、断线、重连

脚本化的对端；本能力在 `t0` 装上。每一步之后读一次 `reachability`。

| 步 | 对端 | 预期读到 | 依据 |
|---|---|---|---|
| 1 | `t0` 刚装上，还没有任何往来有结果 | `{ state: undetermined, since: t0, reachCount: 0 }`（`t0` 是这一次在场里第一次读得到时间源的时刻）。**不是 `unreachable`，也不是 `reachable`** | 探测与观察：首轮结果之前 |
| 1′ | 变体：装上时时间源读不出，直到 `t0′` 才读得出 | `t0′` 之前读到 `{ state: undetermined, reachCount: 0 }`，**`since` 缺席**、操作照答不失败；`t0′` 起 `since: t0′`。其间探到的答复不更新观察 | 操作：失败集合为空；探测与观察：时钟读不到 |
| 2 | `t1` 第一次探得到答复 | `{ reachable, since: t1, reachCount: 1 }` | 探测与观察 |
| 3 | 此后对端一直应答 | 仍是 `{ reachable, since: t1, reachCount: 1 }`。**持续可达不加计数，`since` 不动** | 探测与观察：只有变成 `reachable` 才加一 |
| 4 | `t2` 切断到对端的路 | 不晚于 `t2 + probeInterval + probeTimeout`：`{ unreachable, since: t3, reachCount: 1 }`（`t3` 是那一次探落在问不到的时刻） | 探测与观察：转换在 `probeInterval + probeTimeout` 之内 |
| 5 | 一直切断 | 仍是 `unreachable`；本能力照常答，**没有被撤除或替换**，据点上在途的模型调用没有被放弃 | 探测与观察：断线不撤服务、不丢在途调用 |
| 6 | `t4` 恢复 | 不晚于 `t4 + probeInterval + probeTimeout`：`{ reachable, since: t5, reachCount: 2 }` | 探测与观察 |
| 7 | 消费者在第 3 步与第 6 步各读过一次 | 两次读到的 `reachCount` 从 1 变成 2，**据此看得出其间再连上过**，即便它从没读到过 `unreachable` | 探测与观察 |
| 8 | 据点进程重启 | 从 `{ undetermined, since: 重启后第一次读得到时间源的时刻, reachCount: 0 }` 重新起；**不拿重启前的 2 来比** | 探测与观察：新的一次在场重新开始，计数不可比较 |

## 2. 在应答就是可达

| 对端的答复 | 预期 | 依据 |
|---|---|---|
| 公开体检 `{ reachable: true, centerId, version }` | `reachable` | 前提：公开体检 |
| 任何请求都答 `unavailable`（中心的数据所在够不着） | **`reachable`**：中心在应答，只是答不了 | 探测与观察：业务上的 `unavailable` 算可达 |
| 出示物被拒：`login-state-rejected` | **`reachable`**：那是登录状态的事，不是连接的事 | 探测与观察：登录被拒算可达 |
| `version-mismatch` | **`reachable`** | 探测与观察：版本不合算可达 |

## 3. 问不到的几种样子

每一行都从 `reachable` 起。

| 对端 | 预期 | 依据 |
|---|---|---|
| 答复读完之前连接关闭 | `unreachable` | 前提：答复按传输绑定读 |
| 超过 `probeTimeout` 没有读成答复 | `unreachable` | 探测与观察：超时 |
| TLS 握手成功但证书对不上配置的中心 | **`unreachable`**：确认不了对端，不算在应答 | 前提：客户端必须确认对端；探测与观察 |
| 读到的不是一份按传输绑定读得成的答复（例如一页 HTML） | `unreachable` | 前提：答复按传输绑定读 |

## 4. 本能力不在场

| 情形 | 预期 | 依据 |
|---|---|---|
| 一个**不必需**依赖本能力的消费者，本能力没装 | 它按自己契约里「依赖不可用」收场；**不把「不在」读成 `unreachable` 而照常服务** | 操作：本能力缺席是依赖缺席 |
