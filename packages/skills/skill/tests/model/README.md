# tests/model

本目录承载对真实实现的有界穷举探索器。它是[性质账本](../../verification/README.md#ledger) S1–S6 的实现符合性证据，也是 [ReadGate.tla](../../verification/models/ReadGate.tla) 的可执行对应。

## 允许的内容

世界生成、日程（端口故障、中止、来源变化）、自组合比较、性质核对，以及运行它们的一个测试文件。

## 边界

服务是 `dist` 中真实的 `createSkillAccess`、`createSkillCatalog` 与 `createPackageInspection`，所以先运行 `pnpm run build`。端口是 `@omne-harness/skill-contract/testing` 的三个内存替身，外加手写的包装：包装注入故障、在指定的端口答复时中止 `signal` 或改变来源内容，并记录每次端口调用。探索器只看答复、端口调用记录与世界中的字节，不读实现的内部状态。替身通过不证明真实端口的行为。

有界范围内没有反例，不是无条件证明，只说明下面列出的组合。

## 维护

性质、前提或世界的形状变化时，同步本文件、[性质账本](../../verification/README.md#ledger) 与[模型说明](../../verification/models/README.md)。不缩小范围、不放宽核对来取得通过。实现出现反例时，把最小复现写进下文「已知反例」并在 `explore.spec.ts` 把它标为预期失败，同时交给实现的拥有者。

## 本包事实

[explore.spec.ts](explore.spec.ts) 运行六个探索，每个性质一个，属于慢层（重 CPU）。每个探索返回组合数、违反列表与用时；测试要求违反列表为空，组合数不少于一个下限，防止探索空转。

| 性质            | 文件                                 | 探索的空间                                                                                                                                                                                                                                                                              | 组合数  | 用时  |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----- |
| S1 无披露       | [disclosure.ts](disclosure.ts)       | 观察者 2 × `alpha` 的状态 4 × `beta` 的状态 2 × `beta` 的读者 2 × 共用故障 13 × 隐藏方式 3（各与删除后的孪生世界 `twinWorld` 比较）× 请求 84（三个身份上的 `describe`、`read` 正文与资源、`list`、`export`，五种依据；12 个目录请求）× 不中止或预先中止；外加第 1 步与第 2 步同答的比较 | 180,960 | 12 s  |
| S2 整次 unknown | [whole-unknown.ts](whole-unknown.ts) | 访问：`alpha` 的状态 4 × 来源持有 3 × 两种来源 × 故障 35（读取判定、对应端口各 5 种没有作答，`snapshot`、`open` 各 10 种，`export` 第二个条目 4 种）× 请求 23。目录：3 × 2 × 2 × 2 × 故障 19 × 请求 11，用契约规则推出整个预期答复。`inspect`：2 × 故障 31                              | 24,398  | 1 s   |
| S3 不拼版本     | [basis.ts](basis.ts)                 | 已采用材料 2 × 来源持有 3 × 两种来源 × 来源变化 13（不变，或在第 1–6 个答复之后换成另两种内容之一）× 请求 23（`read` 三个部分与三页、`list`、`export`，三种依据）；无故障时可读的请求必须成功                                                                                           | 3,588   | 0.2 s |
| S4 范围正确     | [range.ts](range.ts)                 | 4 个 1–4 字节字符组成的、最多 3 个字符的全部文本（85 个）× 5 种放法（LF 头部后的正文、CRLF 头部后的正文、无头部的正文、文本资源、二进制资源）× 起点与长度到总长加 2、`PAGE_LIMIT` 与加 1；跨 `PAGE_LIMIT` 的长文本 89 种范围；6 种非法范围                                              | 55,795  | 1 s   |
| S5 次序无关     | [order.ts](order.ts)                 | 状态组合 2 × 三个身份各 6 种判定（准许、拒绝、`unknown`、畸形、reject、同步抛出）× 请求 3 × 已发出判定的每一种完成次序（最多 6 种）                                                                                                                                                     | 4,396   | 0.4 s |
| S6 中止不交部分 | [abort.ts](abort.ts)                 | 已采用材料 2 × 来源持有 3 × 两种来源 × 故障 4 × 请求 23 × 中止点 0 到 n+1（n 是不中止时的端口调用数）                                                                                                                                                                                   | 4,508   | 0.2 s |

组合数与用时是 2026-11-04 在基线 `e0b68a7c3` 的 `dist` 上实测的，单进程，同机有 TLC 在运行。

文件：

- [world.ts](world.ts)：世界的数据形状 `WorldSpec`、三个身份与两份材料、`twinWorld`、日程 `Schedule` 与 `runOf`（包装后的端口与三个真实服务）
- [explore.ts](explore.ts)：请求、`perform`、违反记录 `Ledger` 与报告 `Report`
- [disclosure.ts](disclosure.ts)、[whole-unknown.ts](whole-unknown.ts)、[basis.ts](basis.ts)、[range.ts](range.ts)、[order.ts](order.ts)、[abort.ts](abort.ts)：每个性质的探索
- [explore.spec.ts](explore.spec.ts)：运行六个探索

与模型的对应：探索器的隐藏方式与模型的 `Variant` 同名；`Schedule.abortAfter`、`Schedule.change.after`、`Schedule.addressing` 对应模型的 `abortAt`、`changeAt`、`smode`。模型的 `undecided` 在这里展开成 `unknown`、畸形答复、reject、同步抛出与读取时抛出的代理对象。

### 已知反例

在声明的前提内，本实现没有已知反例。

### 前提外的反例

下面的情形违反端口前提，所以不算 S1 或 S3 的反例。它说明 Skill 在这一点上完全信任对应端口：

- 对应端口对 `alpha` 答 `adopted`，引用却指向 `beta` 的材料（违反 PR1）。`alice` 能读 `alpha`、不能读 `beta`。`describe(alice, alpha)` 交出 `capability: beta` 与 `beta` 的依据，`read(alice, alpha, 正文)` 交出 `beta` 的正文。Skill 不核对引用的能力标识是否等于所请求的身份。
