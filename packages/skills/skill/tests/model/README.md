# tests/model

本目录承载对真实实现的有界穷举探索器。它是[性质账本](../../verification/README.md#ledger) S1–S7 的实现符合性证据，也是 [ReadGate.tla](../../verification/models/ReadGate.tla) 的可执行对应。

## 允许的内容

世界生成、日程（端口故障、中止、来源变化）、自组合比较、性质核对，以及运行它们的一个测试文件。

## 边界

服务是 `dist` 中真实的 `createSkillAccess`、`createSkillCatalog` 与 `createPackageInspection`，所以先运行 `pnpm run build`。端口是 `@omne-harness/skill-contract/testing` 的三个内存替身，外加手写的包装：包装注入故障、在指定的端口答复时中止 `signal` 或改变来源内容，并记录每次端口调用。探索器只看答复、端口调用记录与世界中的字节，不读实现的内部状态。替身通过不证明真实端口的行为。

有界范围内没有反例，不是无条件证明，只说明下面列出的组合。

## 维护

性质、前提或世界的形状变化时，同步本文件、[性质账本](../../verification/README.md#ledger) 与[模型说明](../../verification/models/README.md)。不缩小范围、不放宽核对来取得通过。实现出现反例时，把最小复现写进下文「已知反例」并在 `explore.spec.ts` 把它标为预期失败，同时交给实现的拥有者。

## 本包事实

[explore.spec.ts](explore.spec.ts) 运行七个探索，每个性质一个，属于慢层（重 CPU）。每个探索返回组合数、违反列表与用时；测试要求违反列表为空，组合数不少于一个下限，防止探索空转。

| 性质            | 文件                                 | 探索的空间                                                                                                                                                                                                                                                                              | 组合数  | 用时  |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----- |
| S1 无披露 | [disclosure.ts](disclosure.ts) | 观察者 2 × `alpha` 的状态 4 × `beta` 的状态 2 × `beta` 的读者 2 × 共用故障 14（含 `beta` 的请求被答成 `alpha` 的引用）× 隐藏方式 3（各与删除后的孪生世界 `twinWorld` 比较）× 请求 84（三个身份上的 `describe`、`read` 正文与资源、`list`、`export`，五种依据；12 个目录请求）× 不中止或预先中止；外加第 1 步与第 2 步同答的比较 | 194,880 | 19 s |
| S2 整次 unknown | [whole-unknown.ts](whole-unknown.ts) | 访问：`alpha` 的状态 4 × 来源持有 3 × 两种来源 × 故障 40（读取判定、对应端口各 5 种没有作答，对应端口 5 种错指，`snapshot`、`open` 各 10 种，`export` 第二个条目 4 种）× 请求 23。目录：3 × 2 × 2 × 2 × 故障 19 × 请求 11，用契约规则推出整个预期答复。`inspect`：2 × 故障 31 | 27,158 | 1.6 s |
| S3 不拼版本 | [basis.ts](basis.ts) | 已采用材料 2 × 来源持有 3 × 两种来源 × 来源变化 13（不变，或在第 1–6 个答复之后换成另两种内容之一）× 错指 6（没有，或五种错指之一；不带依据的请求只取指向 `beta` 的一种）× 请求 23（`read` 三个部分与三页、`list`、`export`，三种依据）；无故障时可读的请求必须成功 | 17,160 | 1.2 s |
| S4 范围正确 | [range.ts](range.ts) | 4 个 1–4 字节字符组成的、最多 3 个字符的全部文本（85 个）× 5 种放法（LF 头部后的正文、CRLF 头部后的正文、无头部的正文、文本资源、二进制资源）× 起点与长度到总长加 2、`PAGE_LIMIT` 与加 1；跨 `PAGE_LIMIT` 的长文本 89 种范围；6 种非法范围。无头部的正文对每个合法范围只答 `source-unavailable` | 55,795 | 1.1 s |
| S5 次序无关     | [order.ts](order.ts)                 | 状态组合 2 × 三个身份各 6 种判定（准许、拒绝、`unknown`、畸形、reject、同步抛出）× 请求 3 × 已发出判定的每一种完成次序（最多 6 种）                                                                                                                                                     | 4,396   | 0.6 s |
| S6 中止不交部分 | [abort.ts](abort.ts)                 | 已采用材料 2 × 来源持有 3 × 两种来源 × 故障 4 × 请求 23 × 中止点 0 到 n+1（n 是不中止时的端口调用数）                                                                                                                                                                                   | 4,508   | 0.2 s |
| S7 引用身份一致 | [identity.ts](identity.ts) | `alpha` 的已采用材料 2 × `beta` 的读者 2 × `gamma` 的读者 2 × 两种来源 × 故障 7（没有；指向 `beta` 或 `gamma` 的引用；带依据时别的来源层、资产版本、内容摘要，或不带内容摘要）× 请求 17（`alpha` 上的 `describe`、`read` 三个部分、`list`、`export`，三种依据），不带依据时只取指向别的身份的两种；核对 S7、S3 的字节与 S2 的整次 `unknown` | 1,584 | 0.2 s |

组合数与用时是 2026-11-05 在 w3-skill-fix 第 3 轮的 `dist` 上实测的，单进程。S1–S6 的数字最早在基线 `e0b68a7c3` 上测得，加入错指的答复后重测；第 3 轮加入错指 `undigest` 后，S2、S3、S7 的组合数随之增加。

文件：

- [world.ts](world.ts)：世界的数据形状 `WorldSpec`、三个身份与两份材料、`twinWorld`、日程 `Schedule` 与 `runOf`（包装后的端口与三个真实服务）
- [explore.ts](explore.ts)：请求、`perform`、违反记录 `Ledger` 与报告 `Report`
- [disclosure.ts](disclosure.ts)、[whole-unknown.ts](whole-unknown.ts)、[basis.ts](basis.ts)、[range.ts](range.ts)、[order.ts](order.ts)、[abort.ts](abort.ts)、[identity.ts](identity.ts)：每个性质的探索
- [explore.spec.ts](explore.spec.ts)：运行七个探索

与模型的对应：探索器的隐藏方式与模型的 `Variant` 同名；`Schedule.abortAfter`、`Schedule.change.after`、`Schedule.addressing` 对应模型的 `abortAt`、`changeAt`、`smode`。模型的 `undecided` 在这里展开成 `unknown`、畸形答复、reject、同步抛出与读取时抛出的代理对象。模型的 `ResolveMisdirected` 在这里是对应端口的五种错指（`world.ts` 的 `Misdirection`）：`misdirect` 交出另一个身份的引用与声明，`mislayer`、`misversion`、`misdigest` 改变世界答复中引用的一个字段，`undigest` 去掉引用的内容摘要。不带依据时后四种是端口自己的说法，不算错指（`misdirects`）。带依据时，依据点名的是带内容摘要的材料，所以不带内容摘要的引用也是错指（S7）。

### 已知反例

在声明的前提内，本实现没有已知反例。

### 余下的前提

探索器不再假定对应端口守 PR1、PR3：引用指向别的身份或别的材料时，实现答 `unknown`（S7）。修复之前，这正是一个反例：对应端口对 `alpha` 答 `beta` 的引用时，`describe(alice, alpha)` 交出 `capability: beta` 与 `beta` 的依据，`read(alice, alpha, 正文)` 交出 `beta` 的正文（GS-06）。

余下的前提是 S7 的 R1：引用写明身份 `x` 时，它的包定位与内容摘要确属 `x`。探索器的错指答复都守 R1，所以它们不覆盖「写明 `alpha`、定位却是 `beta` 的包」这一种。Skill 看不到身份与包的对应，这一种由端口负责。
