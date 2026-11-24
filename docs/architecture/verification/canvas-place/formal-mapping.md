# 画布的摆上：性质、模型与设计的对应

本页说明 [CanvasPlace.tla](CanvasPlace.tla) 守住哪些性质，模型的变量和动作对应[画布规格](../../../../packages/canvas/SPEC.md)里的哪些规则，每份配置预期得到什么。

模型检查只说明有限范围内的设计性质。它不证明源码精化。

## 为什么是这一处

画布别的写操作都是一个聚合上的一次存储提交，全化表与性质用例守得住。`place` 不同：它在读状态与提交之间向种类的拥有者发一次调用（`admit`），拥有者在这一次调用里留下自己的事实（媒体的持有）。两方各写各的，中间可以插进别的摆上、拿走、种类的撤下与拥有者的迟答。这些交错靠用例枚举不完。

## 性质表

| 性质 | 说的是什么 | 违背的后果 | 对应的不变式 |
| --- | --- | --- | --- |
| `RecordIsHeld` | 摆着的引用，拥有者已经接受（媒体已经持有） | 画布引用的媒体到期被清掉 | CV-13；媒体的 ME-4 |
| `OnePerRef` | 一个引用至多一条摆着的记录 | 同一样东西在纸上出现两次 | CV-11 |
| `WithinLimit` | 摆着的不超过上限 | 两次摆上交错，越过上限 | CV-11 |
| `NoAdmitWhenFull` | 读上限时已经摆满的摆上，不去问拥有者 | 摆不上的时候让拥有者白留一份事实 | 规格「答复的次序」第 5、6 步的先后 |
| `CommitWhileDeclared` | 提交的那一刻种类声明着 | 种类撤下之后还多出这一类的记录 | CV-13 |
| `NoCallAfterGone` | 取走了的声明不再被调用 | 调一个已经撤下的贡献 | 规格「拓展点」`canvas.kinds` 的撤下 |
| `PlaceEnds` | 每一次摆上都有结局，拥有者不答也一样 | 一次摆上永远挂着，agent 的调用跟着挂 | 规格里 `admit` 的时限 |
| `DrainEnds` | 撤下总能完成，拥有者不答也一样 | 一个贡献方卸不掉 | 同上 |

## 模型与设计

三方：画布、一个种类的拥有者、放这个种类的贡献方。模型只有一个带 `admit` 的种类；不带 `admit` 的种类是它恒答接受的特例。

| 模型 | 规格里的规则 | 实现在哪 |
| --- | --- | --- |
| `Start` | `place` 进到问拥有者那一步：引用没摆着、种类声明着、没摆满。别的情形答没有变化或现状不允许，不改任何东西，所以不是模型里的一步 | `packages/canvas/canvas/src/canvas.ts` 的 `place`：读 `placing`，摆着就答没有变化；`kinds.enter` 取这一类并持住它的一批；查上限 |
| `AdmitAccept` | 拥有者答接受，并留下它的事实。对已经留下的再问一次不变 | 同上 `admitted` 答 `admitted`；持有方由 `canvas-contract` 的 `holderOf` 定 |
| `AdmitRefuse` | 拥有者答拒绝、依据不可用、不知道，或抛出：都没有记录 | 同上 `admitted` 的另几种答复，`place` 不提交 |
| `Timeout` | 过了画布配置的时限：这一次答依据不可用。拥有者之后可能照样做完，见 `LateHold` | 同上 `admitted` 的计时，时限是策略的 `admitTimeoutMs` |
| `Commit` | 带条件的提交：引用仍没摆着、仍没到上限、种类仍声明着。不成立时不写 | 种类：提交前同步读 `entry.declared()`，写进命令；一批持到提交答复回来，撤下等它（`canvas-cordis-contract` 的 `putKind`、`kindsOn().enter`）。引用与上限：事务脚本 `placeReference`（`packages/canvas/canvas/src/scripts.ts`）在同一次提交里再核 |
| `Lose` | 提交失败或结果不知道：没有记录，拥有者留下的事实还在 | `place` 把提交的 `rolled-back` 答成依据不可用，`unknown` 答成不知道 |
| `Take` | 拿走。拥有者留下的事实不撤 | 事务脚本 `takeItems` |
| `Withdraw`、`Drained` | 贡献方离开：这一批先不接新的 `admit`，在途的各有结局，然后才取走 | `putKind` 的排空：离开之后 `enter` 与 `admit` 都不接，在途的 `admit` 与持着的 `place` 都结束才报排空完 |
| `Declare` | 贡献方回来 | `putKind` 再放一份 |

`held` 为真而 `rows` 为零是规格「不能声称的」里写明的残余：拥有者接受了而提交没有成。模型不把它当错。

公平性只加在画布自己的动作上（时限、提交、报排空完），不加在拥有者的答复上：拥有者可以永远不答。

## 配置预期

| 配置 | 预期 | 打开的缺陷 | 违反的性质 |
| --- | --- | --- | --- |
| `place` | 通过 | 无 | 无 |
| `place-live` | 通过 | 无 | 无 |
| `bad-commit-before-admit` | 违反 | 先写记录，后问拥有者 | `RecordIsHeld` |
| `bad-admit-before-limit` | 违反 | 先问拥有者，后查上限 | `NoAdmitWhenFull` |
| `bad-no-recheck-ref` | 违反 | 提交时不再核引用仍没摆着 | `OnePerRef` |
| `bad-no-recheck-limit` | 违反 | 提交时不再核上限 | `WithinLimit` |
| `bad-no-recheck-kind` | 违反 | 提交时不再核种类 | `CommitWhileDeclared` |
| `bad-withdraw-without-drain` | 违反 | 撤下不排空 | `NoCallAfterGone` |
| `bad-no-admit-limit` | 违反 | `admit` 没有时限 | `PlaceEnds` |

范围：`place` 是三个引用、两次并发的摆上、上限二；其余是两个引用、两次并发的摆上、上限一或二。更大的范围没有跑。

## 怎样跑

环境见 [CONTRIBUTING](../../../../CONTRIBUTING.md#形式工具链)。`TLA2TOOLS_JAR` 指向钉住的 tla2tools，然后在本目录运行 `./run-tlc.sh`。它逐份配置跑 TLC，把每份的退出码与预期写进汇总；名字以 `bad-` 开头的配置要以违反结束，别的要干净结束。

## 不能声称的

- 模型不含找空处、一叠、锁与租户；它们不参与这一处的交错。
- 模型里拥有者留下的事实只有「留下了」一个状态，不含媒体自己的暂存、到期与删除；那一半由[媒体保管的模型](../media-custody/formal-mapping.md)守。
- 实现是不是照模型的次序做，由 `place` 的用例守（`packages/canvas/canvas/tests/place.spec.ts`、`order.spec.ts`），不由本模型守。
