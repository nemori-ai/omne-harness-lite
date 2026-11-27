# mcp-authorization 的形式映射

[Authorization.tla](models/Authorization.tla) 是一份独立的小模型，守[包组规格](../../SPEC.md#不变式)的 MC-32 与 MC-33。它没有到实现的精化证明：有限实例没有反例，不等于实现符合；实现的符合由本成员的用例核对，每条性质在用例里有对应的一条，实现照模型的缺陷钩子改坏时那一条变红。

模型的前提，都是别人的保证：授权服务器每次成功续期都换掉续期材料；回跳可以来自任何人，带任何曾经发出过的状态值。

模型省掉的：真实的授权服务器、传输与时限；令牌的内容与加密；写入结果不知道时存储一侧的认回（归存储契约）；对端答 401 与缺范围（归本成员的用例）。

运行：`TLA2TOOLS_JAR=<tla2tools.jar> pnpm run verify:formal`。清单在 [models.json](models.json)。

## 性质

| 规格不变式 | 模型性质 | 实现与用例 |
| --- | --- | --- |
| MC-32 | `I9_ExchangeChecked`、`I9_ExchangeOnce` | 回跳先取走待完成的再核：`tests/connect.spec.ts` 的不换令牌与只换一次 |
| MC-33 | `I10_OneRefresh`、`P_UnknownKeeps`、`P_ReconnectAfterRefusal` | 续期单飞、没有应答不动旧值、被拒才要重新连接：`tests/use.spec.ts` |

## 动作

| 模型动作 | 设计里的哪一步 |
| --- | --- |
| `Begin` | 人开始一次连接，新的待完成的 OAuth 授权顶掉旧的 |
| `Callback` | 回跳到了：只为仍然有效的那一条、核过签发方之后换令牌 |
| `Use`、`RefreshAnswered`、`RefreshUnknown` | 用令牌；过期先续；续期被答复或没有应答 |
| `Disconnect` | 断开 |

## 负控的缺陷

| 缺陷钩子 | 模拟的实现缺陷 | 须违反的性质 |
| --- | --- | --- |
| `stale-state` | 接受已经作废的状态值 | `I9_ExchangeChecked` |
| `skip-iss` | 不核签发方就换令牌 | `I9_ExchangeChecked` |
| `exchange-twice` | 换过令牌的待完成的 OAuth 授权还能再换 | `I9_ExchangeOnce` |
| `parallel-refresh` | 每个使用者各发一次续期 | `I10_OneRefresh` |
| `wipe-on-unknown` | 续期没有应答时删掉续期材料 | `P_UnknownKeeps` |
| `reconnect-on-unknown` | 续期没有应答时就要人重新连接 | `P_ReconnectAfterRefusal` |

## 配置的预期

| 配置 | 用途 | 预期 |
| --- | --- | --- |
| `authz-valid` | 正控：两次开始连接、两个同时的使用者、两次续期被答复 | 通过 |
| `authz-bad-*` | 负控，每份开一个缺陷钩子 | 违反上表那一行的性质 |
