# 规范实例：可达性怎样变

属于 `capability.center-connection` v1 的规范工件。本契约**不附 Schema**，这里的实例不是形状校验用例，
而是**对端的行为 → 预期读到的可达性 → 依据条款**。

**两条读法上的边界：**

- **时刻只是占位**：`t0`、`t1` 这类写法只表示先后；具名参数 `probeInterval`、`probeTimeout` 的值本契约不填（[G-3](contract.md#八已知缺口)）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

## 1. 起来、断线、重连

脚本化的对端；本能力在 `t0` 装上。每一步之后读一次 [`reachability`](contract.md#s-9-reachability)。

| 步 | 对端 | 预期读到 | 依据 |
|---|---|---|---|
| 1 | `t0` 刚装上，还没有任何往来有结果 | `{ state: undetermined, since: t0, reachCount: 0 }`（`t0` 是这一次在场里第一次读得到时间源的时刻）——**不是 `unreachable`，也不是 `reachable`** | [S-9](contract.md#s-9-reachability) ⑧ |
| 1′ | 变体：装上时时间源读不出，直到 `t0′` 才读得出 | `t0′` 之前读到 `{ state: undetermined, reachCount: 0 }`，**`since` 缺席**、操作照答不失败；`t0′` 起 `since: t0′`。其间探到的答复不更新观察 | [S-5](contract.md#s-5-可达性三态)、[S-9](contract.md#s-9-reachability) ⑤⑥、[S-6](contract.md#s-6-自己探自己重连) 第 1 条 |
| 2 | `t1` 第一次探得到答复 | `{ reachable, since: t1, reachCount: 1 }` | [S-5](contract.md#s-5-可达性三态) |
| 3 | 此后对端一直应答 | 仍是 `{ reachable, since: t1, reachCount: 1 }`——**持续可达不加计数，`since` 不动** | [S-5](contract.md#s-5-可达性三态) |
| 4 | `t2` 切断到对端的路 | 不晚于 `t2 + probeInterval + probeTimeout`：`{ unreachable, since: t3, reachCount: 1 }`（`t3` 是那一次探落在问不到的时刻） | [S-6](contract.md#s-6-自己探自己重连) 第 1 条、第四节进展 |
| 5 | 一直切断 | 仍是 `unreachable`；本能力照常答，**没有被撤除或替换**，据点上在途的模型调用没有被放弃 | [S-7](contract.md#s-7-在场不随可达性变) |
| 6 | `t4` 恢复 | 不晚于 `t4 + probeInterval + probeTimeout`：`{ reachable, since: t5, reachCount: 2 }` | [S-6](contract.md#s-6-自己探自己重连) 第 3 条 |
| 7 | 消费者在第 3 步与第 6 步各读过一次 | 两次读到的 `reachCount` 从 1 变成 2——**据此看得出其间再连上过**，即便它从没读到过 `unreachable` | [S-9](contract.md#s-9-reachability) ⑦ |
| 8 | 据点进程重启 | 从 `{ undetermined, since: 重启后第一次读得到时间源的时刻, reachCount: 0 }` 重新起；**不拿重启前的 2 来比** | [S-5](contract.md#s-5-可达性三态) 末条、[S-11](contract.md#s-11-撤除重启与在途) |

## 2. 在应答就是可达

| 对端的答复 | 预期 | 依据 |
|---|---|---|
| 公开体检 `{ reachable: true, centerId, version }` | `reachable` | [S-5](contract.md#s-5-可达性三态)、`composition.governance-center-entry/v1#S-18` |
| 任何请求都答 `unavailable`（中心的数据所在够不着） | **`reachable`**——中心在应答，只是答不了 | [S-5](contract.md#s-5-可达性三态)、[S-3](contract.md#s-3-本契约明确不承诺什么) 第三条 |
| 出示物被拒：`login-state-rejected` | **`reachable`**——那是登录状态的事，不是连接的事 | [S-5](contract.md#s-5-可达性三态) |
| `version-mismatch` | **`reachable`** | [S-5](contract.md#s-5-可达性三态) |

## 3. 问不到的几种样子

每一行都从 `reachable` 起。

| 对端 | 预期 | 依据 |
|---|---|---|
| 答复读完之前连接关闭 | `unreachable` | `composition.governance-center-entry-https-json/v1#S-17` 第 1 步 |
| 超过 `probeTimeout` 没有读成答复 | `unreachable` | [S-6](contract.md#s-6-自己探自己重连) 第 1 条 |
| TLS 握手成功但证书对不上配置的中心 | **`unreachable`**——确认不了对端，不算在应答 | [S-5](contract.md#s-5-可达性三态)、`composition.governance-center-entry-https-json/v1#S-4` |
| 读到的不是一份按传输绑定读得成的答复（例如一页 HTML） | `unreachable` | `composition.governance-center-entry-https-json/v1#S-17` 第 4 步 |

## 4. 本能力不在场

| 情形 | 预期 | 依据 |
|---|---|---|
| 一个**不必需**依赖本能力的消费者，本能力没装 | 它按自己契约里「依赖不可用」收场；**不把「不在」读成 `unreachable` 而照常服务** | [S-7](contract.md#s-7-在场不随可达性变) 第二条 |
