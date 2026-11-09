# StagingKey

[StagingKey.tla](StagingKey.tla) 定义暂存表的状态与动作。[expect.txt](expect.txt) 列出每个配置与预期结果。

## 对应的条款

本模型对应 [SPEC 暂存表与令牌](../../../SPEC.md#requests-staging) 的键规则，以及 Request Context 的[调用身份](../../../../request-context-contract/SPEC.md#call-identity)。

## 环境前提

下面两条不变式归外域拥有者。本模型把它们写成动作的使能条件，不证明它们。

| 前提 | 拥有者 | 在模型里 |
| --- | --- | --- |
| 同一 Session 至多一个未终结 Run | [session-contract SW-I05](../../../../../session/session-contract/SPEC.md#业务不变式索引) | `StartRun` 只在会话没有活跃 Run 时成立 |
| 同一执行挂接同一时刻至多一个在途准备 | [agent-contract 请求接缝](../../../../../agent/agent-contract/SPEC.md#请求接缝的逐操作要素) | `Prepare` 只在本 Run 是会话的活跃 Run、且本 execution 没有在途准备时成立 |

租户只作隔离，不作排他。模型对 Model 侧不设任何限制。Agent 的候选身份只取步号。消费位置取 execution 与步号，这一点来自 Agent 的消费位置命名。

每个调用有两个副本。副本 1 是守上述前提的调用方。副本 2 是同一调用仍在途时的重复到达，例如同进程接管后新推进者重做同一步，而旧挂接的准备还没结束。

## 性质

| 性质 | 含义 |
| --- | --- |
| `OneEffectivePerSession` | 环境自检：一个会话同一时刻至多一次有效准备在途 |
| `ExclusionWithinAuthorizedDomain` | 两次调用同键，则它们属于同一 execution |
| `NoBusyForInvariantRespectingCaller` | 守前提的调用方永不被暂存表拒绝 |
| `DuplicateRefused` | 同一调用在途时的重复到达一律答 busy；这是暂时的，旧准备结束即解除 |
| `ReadsOwnInput` | 组读口取回的是本次暂存的值 |
| `NoCrossTenantKey` | 不同租户永不同键 |
| `KeyIsCallIdentity` | 键恰好区分不同的调用 |

## 配置

| 配置 | 键 | 预期 |
| --- | --- | --- |
| `positive-sessions.cfg` | 调用身份；一个租户、两个会话、每会话两个 Run | 全部性质成立 |
| `positive-tenants.cfg` | 调用身份；两个租户、每租户两个会话、每会话一个 Run | 全部性质成立 |
| `bad-tenant-key-busy.cfg` | 租户加候选身份 | 反面对照：`NoBusyForInvariantRespectingCaller` 被违反。两个会话各发一次准备，第二个被拒 |

## 运行

设置 `TLA2TOOLS_JAR` 后，在仓库根运行。输出目录必须尚不存在。

```sh
python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/context/agent-context/verification/models/staging-key <输出目录>
```

## 限制

模型只覆盖暂存表的键，以及「暂存、读、删除」三步。令牌、登记代次与 Request Context 的内部步骤不在模型里。每个配置只有一个步号与一种用途。模型成立不等于实现符合，实现由 `tests/requests.spec.ts` 的暂存表用例核对。
