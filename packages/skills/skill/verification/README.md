# verification

本目录承载本包的持续验证资源：模型、论证或证明。

## 允许的内容

`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。单次运行的原始输出留任务 tmp，不进本目录。

## 维护

被验证的承诺变化时，同步模型、证明与本目录 `index.md`。性质、前提或映射变化时，同步下面的性质账本、[SPEC「性质与证据」](../SPEC.md#properties)、[models/README.md](models/README.md) 与 [tests/model/README.md](../tests/model/README.md)。

## 本包事实

本包有一个 TLA+ 模型 [models/ReadGate.tla](models/ReadGate.tla)，它的说明、配置与 TLC 结果见 [models/README.md](models/README.md)。对真实实现的有界穷举探索器在 [tests/model/](../tests/model/README.md)。本包没有证明，`proofs/` 是空的。


<a id="ledger"></a>

## 性质账本

下面七条性质是 Skill 读取与目录的关键安全性质。每条写成定理：参与者与状态、前提、结论。证据分三类，分别记录，不互相替代：

- TLA+ 模型：[ReadGate.tla](models/ReadGate.tla) 在 TLC 2.19 上的有限模型检查。它是行为的权威表示。
- 探索器：[tests/model/](../tests/model/README.md) 在小世界上穷举组合，驱动 `dist` 中真实的 `createSkillAccess`、`createSkillCatalog` 与 `createPackageInspection`。端口是 `skill-contract/testing` 的内存替身加手写的故障包装。它是实现符合性证据。
- 套件与用例：`tests/` 下既有的契约测试与符合性套件，见 [SPEC「组合与验证」](../SPEC.md#组合与验证)。

共同的参与者：一个观察者主体 `p`（调用方），三个需求端口（`SkillReadCheck`、`SkillResolution`、`SkillPackageSource`），以及一次操作。Skill 在两次调用之间不保留状态，所以一次操作就是全部行为。共同的端口失败模型：端口答复是封闭集合内的答复，或者是「没有作答」（`unknown`、畸形答复、reject、同步抛出、读取时抛出的答复）。共同的前提 P0：每次端口调用都会结束（返回或 reject）。端口收不到 `signal`。

### S1 无披露（非干涉）

- 定理：对任一主体 `p` 与身份 `h`，若 `p` 对 `h` 没有读取权，则下列世界对 `p` 的每个请求给出深度相等的答复：`h` 存在且读取判定拒绝 `p`（对应端口对 `p` 隐藏 `h`，或对 `p` 作答）；读取判定准许 `p` 而对应端口不认识 `h`；`h` 被删除。请求包括 `describe`、`read`、`list`、`export`、`summaries` 与 `search`，带或不带依据，以及预先中止的 `signal`。依据的能力标识不等于目标时的答复，与不带依据的被拒读取深度相等。
- 前提：两个判定端口对 `p` 守 PC3、PR5：对无权主体，答复不随身份是否存在而变。关于 `h` 的端口答复都不是故障。两个世界共用同一组其他端口故障，其中可以有对应端口把另一身份的请求答成 `h` 的引用（不假定 PR1）。观察只有答复本身，不含时间与端口调用次数。
- 证据：TLA+ `ReadGate_Disclosure.cfg`（不变式 `SameObservation`，自组合）；探索器 `disclosure.ts`（含 `beta` 的请求被答成 `alpha` 的引用）；套件 A1–A3、SC7。
- 状态：TLA+ 有限范围通过；探索器有限范围通过；真实端口的组合未验证。

### S2 整次 unknown

- 定理：一次操作中，第一个「没有作答」的端口答复决定整次答复：读取判定、对应端口或合法集合没有作答时答 `unknown`；来源没有作答时按映射表 `unavailable` 一行答 `source-unavailable`。答复只有失败对象，之后不再调用端口，操作不抛出。目录对过滤与匹配之后留下的身份，任一读取判定没有作答时整次答 `unknown`，不压成空列表。
- 前提：P0。没有中止（中止见 S6）。不合 S7 的引用也是没有作答。
- 证据：TLA+ `ReadGate.cfg`、`ReadGate_Order.cfg`（不变式 `WholeUnknown`）；探索器 `whole-unknown.ts`（`read`、`list`、`export`、`describe`、`inspect` 用端口调用记录核对；目录用独立的契约规则推出整个预期答复）；用例 `tests/port-answers.spec.ts`、`tests/answer-parse.spec.ts`。
- 状态：TLA+ 有限范围通过；探索器有限范围通过。

### S3 不拼版本

- 定理：`read`、`list` 或 `export` 成功时，结果的依据等于所钉材料（调用方给的依据，或引用的已采用材料），交出的字节全部来自所钉材料：页是该材料条目的切片，列表是该材料的条目，导出是该材料的全部条目。来源在操作途中任一点改变内容时，操作答失败（`version-changed`、`basis-unavailable`、`adopted-material-changed`、`resource-missing` 或 `source-unavailable`），失败不带内容。
- 前提：P0。S7 的前提 R1。内容摘要没有碰撞。对应端口可以答指向别的材料的引用（不假定 PR1、PR3），这时由 S7 答 `unknown`。
- 证据：TLA+ `ReadGate_Change.cfg`（不变式 `NoMixedVersion`、`NoContentOnFailure`），`ReadGate.cfg` 含错指的答复；探索器 `basis.ts`，两种来源：按快照摘要取字节的，以及只按定位取当前字节的，每种来源再加四种错指的答复；用例 `tests/pin.spec.ts`、`tests/bytes.spec.ts`、`tests/export.spec.ts`。
- 状态：TLA+ 有限范围通过；探索器有限范围通过。

### S4 范围正确

- 定理：`read` 成功时，实际起点是不小于请求起点的第一个字符边界（超过总长时截到总长），实际终点是不大于「请求起点加 `min(请求长度, PAGE_LIMIT)`」的最后一个字符边界且不早于实际起点；实际长度不超过 `PAGE_LIMIT`；`complete` 当且仅当实际终点不小于总长；总长与范围都相对正文起点。正文起点是 `bodyOffsetOf` 的结果。没有合法头部时，`read` 正文对任何合法范围都只答 `source-unavailable`，不交内容。范围非法时，`read` 在调用任何端口之前抛 `TypeError`。
- 前提：文本条目是严格 UTF-8（快照的 `encoding` 保证）。
- 证据：探索器 `range.ts`；用例 `tests/range.spec.ts`、套件 A9–A11。TLA+ 模型不覆盖 S4：它是一个纯函数，模型把字节范围抽象掉。
- 状态：TLA+ 模型未覆盖；探索器有限范围通过。

### S5 次序无关

- 定理：对同一输入，`summaries` 与 `search` 的答复不随读取判定的完成次序变化。
- 前提：P0。端口的答复只取决于输入，不取决于完成次序。
- 证据：TLA+ `ReadGate_Order.cfg`（不变式 `SameObservation`，两个运行只在完成次序上不同）；探索器 `order.ts`（扣住读取判定的答复，按发出的判定的每一种次序放行）；用例 `tests/catalog.spec.ts`。
- 状态：TLA+ 有限范围通过；探索器有限范围通过。

### S6 中止不交部分

- 定理：设 `read`、`list` 或 `export` 在没有中止时调用 `n` 次端口，`signal` 在第 `k` 个端口答复时中止（`k = 0` 表示调用前已中止）。若 `n > 0` 且 `k <= n`，操作恰好调用 `k` 次端口，答复是 `{ failure: { kind: 'aborted' } }`。若 `n = 0`（第 1 步依据不符，不需要端口）或 `k > n`，答复与没有中止时相同。中止的 `signal` 上从不调用端口。
- 前提：P0。中止发生在端口答复之间。端口调用进行中的中止要等该调用结束才生效，所以中止的响应时间受端口时间限制。
- 证据：TLA+ `ReadGate_Abort.cfg`（不变式 `AbortStops`）；探索器 `abort.ts`；用例 `tests/gate.spec.ts`、`tests/pin.spec.ts`、`tests/bytes.spec.ts`、套件 A7。
- 状态：TLA+ 有限范围通过；探索器有限范围通过。不终止的端口（违反 P0）没有覆盖。

### S7 引用身份一致

- 定理：主体 `p` 对身份 `c` 的 `describe`、`read`、`list` 或 `export` 成功时，结果写明的身份是 `c`，所钉材料是 `c` 的材料，交出的字节全部来自 `c` 的材料。对应端口对 `c` 答 `adopted`，而引用的能力标识不是 `c`，或者请求带依据而引用的来源层、资产版本（依据带时）或内容摘要不等于依据的（引用不带内容摘要也算不等：依据点名的是带内容摘要的材料），操作整次答 `unknown`，只有失败对象，之后不调用端口。`known-unavailable` 的能力标识不是 `c` 时同样答 `unknown`。
- 前提：P0。前提 R1：引用写明身份 `x` 时，它的包定位与内容摘要确属 `x` 的材料。Skill 看不到身份与包的对应，所以 R1 是端口的义务（PR1 中余下的部分）。不假定 PR1 的其余部分与 PR3。
- 证据：TLA+ `ReadGate.cfg`（错指动作 `ResolveMisdirected`，不变式 `OwnMaterialOnly`）与负控 `ReadGate_FlawNoRefCheck.cfg`；探索器 `identity.ts`，以及 `disclosure.ts`、`whole-unknown.ts`、`basis.ts` 中的错指答复；用例 `tests/ref-identity.spec.ts`、`tests/answer-parse.spec.ts`；契约套件 PR1、PR3 与 `skill-contract/tests/conformance.spec.ts` 中对错指替身的变红证明。
- 状态：TLA+ 有限范围通过，但不含「带依据时引用不带内容摘要」这一子情形（见下文「模型未覆盖」）；探索器有限范围通过，含这一子情形；真实对应端口的组合未验证。

## 证据状态

按[六种状态](../../../../docs/verification.md#分别表述这六种状态)分别写：

| 状态 | 本包的事项 |
| --- | --- |
| 尚未形式化 | 映射表的全部行、`describe` 结果的内容、解析的逐字段规则：它们由用例证明，没有写进模型 |
| 模型未覆盖 | S4（字节范围）；`inspect`；端口不终止；S7 的前提 R1（引用写明的身份与包定位不符）；S7 的「带依据时引用不带内容摘要」子情形（模型的观察看不出它，由探索器与用例承担） |
| 已声明但未执行 | 无 |
| 执行失败 | 无 |
| 有限范围通过 | S1、S2、S3、S5、S6、S7 的 TLA+ 模型；S1–S7 的探索器。范围见 [models/README.md](models/README.md) 与 [tests/model/README.md](../tests/model/README.md) |
| 实现尚未存在或真实组合未验证 | 真实的读取判定、对应端口与来源（`DirectorySource` 除外）与本包的组合 |

有限范围通过不是无条件证明。模型没有精化证明：模型与实现的对应由探索器的场景与映射表支持，见 [models/README.md「与实现的对应」](models/README.md#mapping)。
