# 形式化工件与论证映射

本页拥有**条款 → 性质 → 模型 → 检查命令**这一层对应关系，以及模型**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**——实际执行的工具、命令、范围与结果在[验证入口](../../verification.md)。

本版只选用一个工件，[理由在契约 S-32](../contract.md#s-32-本版选用哪些形式工件)：
求值是输入到结果的一个函数，要证的是**结果里什么能出现、什么不能**，那是结构关系，用 Alloy。
**不建 TLA+**（没有状态、没有交错），**不建 Schema**（值类型归 `data.asset-model` v1 与 `data.identity-values` v1）。

## 本版选用什么

| 契约条款 | 性质 | 模型与定义 | 未覆盖范围与相应义务 |
|---|---|---|---|
| [S-18](../contract.md#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) ＋ [第七节前提 P2](../contract.md#前提由别人兑现本契约不检查) | **(i) 团队资产不出那棵树**：每份生效资产要么是官方件，要么所有者在租户那棵隶属树内 | [`Evaluation.als`](Evaluation.als)：断言 `TeamAssetsStayInTree`，**在 fact `InputHoldingsStayInTree`（即前提 P2）之下** | **它靠前提成立**，断言核对的是求值**没有别的来路**——生效资产只从持有里选，不从 `definitions` 多带的一份、plugin 或组合关系里带进一份。前提本身由组输入的一方兑现（[G-10](../contract.md#十一已知缺口)），不在本模型 |
| [S-18](../contract.md#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) | **(ii) 锁截断**：有起作用的锁，生效的就是最外那一把锁住的那份；锁那一格以里、指向别的资产的同标识持有不出现在生效结果里 | 断言 `LockTruncates` | 锁以里**指向同一份资产**的持有留下（配值用），模型按此建；`filteredOut` 那一条留痕不在模型（[S-26](../contract.md#s-26-每份持有都有去处)，证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)） |
| [S-17](../contract.md#s-17-第一步之一先按禁用滤) | **(iii) 禁用析取**：组织、租户任一格把某份资产禁用，或工作区把它自带的那份禁用，这份资产就不在任何能力标识的生效结果里 | 断言 `DisableIsDisjunction` | 「先禁用后替换」的次序后果（标识退回外一层）**不是断言**，证据形式是规范场景 [S-34](../contract.md#s-34-先禁用后替换) |
| [S-23](../contract.md#s-23-第四步权限)、[S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置)、[S-25](../contract.md#s-25-工作区自带资产的权限项一律取最严值) | **(iv) 工作区滤权**：组合里任何一项权限的值都不来自工作区那一格 | 断言 `WorkspaceNeverSourcesPermission` | 只核「来自哪一格」，不核值；工作区自带资产的**最严值**是值域上的事，证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)（E-1 第 9、10 行） |
| [S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置) | **(iv′) 落点与身份类设置项的值不来自工作区那一格** | 断言 `WorkspaceNeverSourcesPlacement` | 同上 |
| [S-19](../contract.md#s-19-官方件是下界) | **(v) 官方件是下界**：出厂那一格持有的每个能力标识都有生效资产 | 断言 `OfficialLowerBound` | **出厂持有齐全**是前提 P4，不在模型（[G-11](../contract.md#十一已知缺口)） |
| [S-23](../contract.md#s-23-第四步权限) | **(vi) 换了实现逃不出外层对这个能力标识的权限约束**：组织或租户那一格对 `c` 的在效持有指向被替换的那一份、且配了生效资产声明的权限项 `i`，`i` 的值就来自那一格或更里的一格 | 断言 `ReplacementCannotEscapePermission` | **它与 `permParticipating` 的定义很近**：它的用处是把「按能力标识」钉住，把参与条件改回「只看指向生效资产的持有」时必须失败（下面的 M7）。**替换件没声明、外层约束过的那一项**（S-23 最后一段）不在断言范围——模型只对生效资产声明的项下断言；证据形式是规范场景 [S-36](../contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)（E-4 A 支的 `network`） |

**没有进模型的，各自的理由**：

- **值本身**：设置覆盖得到哪个值、允许集合交出哪几档、作者建议取不取、权限的 `lockedAt`——值域上的计算，模型只算「值来自哪一格」。
  证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)、[S-36](../contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)。
- **组装里成环的收场**：未定（[G-1](../contract.md#十一已知缺口)）。模型的 `reached` 用传递闭包，环在里面不影响可达集合的定义，但**不代表对含环输入的结果有承诺**。
- **版本选用**（[G-2](../contract.md#十一已知缺口)）：模型把「生效资产的引用与属性项」当作资产的固定属性，等于假定选用的那一版已经定了。
- **「谁可以用」怎么用成员资格求**（[G-15](../contract.md#十一已知缺口)）、**读入面**（[S-27](../contract.md#s-27-自带资产变成工作区那一格的持有)、[S-28](../contract.md#s-28-配值与禁用只对自带资产生效丢掉的留痕)，一个映射，没有结构约束可反驳）。
- **同输入同输出**（[S-11](../contract.md#s-11-纯计算)）：Alloy 里的函数按定义确定，写成断言是空的；证据形式是规范场景的重放支与静态检查。

## Alloy

- **模型文件**：[`Evaluation.als`](Evaluation.als)。
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `Layer` 五个原子；`assetLt`、`settingLt`、`permissionLt` | [S-5](../contract.md#s-5-层与三条层序) 的 `Layer` 与三条层序；`permissionLt` 里**没有** `Workspace` |
  | `Holding`（`layer`、`hcap`、`asset`）；`Locked`、`Disabled` 两个子集 | 持有、持有上的 `immutable`、保留项 `disabled` 为真 |
  | `Assign`（`at`、`acap`、`item`）；`LockedAssign` | 一条属性配值（挂在 `at` 那一格对 `acap` 的持有上；`at = Session` 是会话格那一对）；配值上的 `immutable` |
  | `WsAsset` | [S-9](../contract.md#s-9-工作区自带资产) 工作区自带资产 |
  | `PermissionItem`、`PlacementItem` | 权限项；设置项里落点与身份那一类（由生效资产的声明定，[S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置) 末段） |
  | fact `HoldingShape`、`FactoryHoldsOnlyOfficial`、`OfficialNeverDisabled`、`WorkspaceHoldsOnlyItsOwn`、`AssignShape` | [S-7](../contract.md#s-7-输入的一致性条件) 的 C4、C6、C7、C8 与「配值挂在持有上」 |
  | fact `InputHoldingsStayInTree` | **不是 S-7 的条件**，是第七节前提 P2——求值不检查它 |
  | `disabledAssets`、`surviving` | [S-17](../contract.md#s-17-第一步之一先按禁用滤) 资产级析取；工作区的禁用只对 `WsAsset` 参与 |
  | `lockers`、`lockHolding`、`candidates`、`selected`、`effective` | [S-18](../contract.md#s-18-第一步之二再取最具体的一份锁在最外那一把处截断)：工作区的锁不算；最外一把截断；锁以里同一份资产的持有留下。`candidates` 就是**在效**的持有 |
  | `refStep`、`reached`、`composition`、`unresolvedCaps` | [S-20](../contract.md#s-20-第二步组装)：引用指向能力标识，沿生效资产走 |
  | `settingParticipating` | [S-22](../contract.md#s-22-第四步设置)：持有层只有**指向生效资产**的持有给值；会话格按能力标识；工作区的落点类配值不参与 |
  | `permParticipating` | [S-23](../contract.md#s-23-第四步权限)：组织、租户两格的**在效**持有给约束，**不论指向哪份资产**；会话格；工作区一律不给 |
  | `permFrom` | 给了约束的最里面那一格，否则 `Factory`——[S-25](../contract.md#s-25-工作区自带资产的权限项一律取最严值) 的最严值是出厂那一格的约束，**不改变这条求法** |
  | `settingFrom` | 最外那一条带锁的配值所在的格（工作区的锁不算）；否则最里面给了值的那一格；否则 `Factory` |

- **检查范围**：

  | 命令 | 范围 | 预期 |
  |---|---|---|
  | `run fourLayerInstance` | `for 6 but 4 Cap, 7 Holding, 4 Assign, 4 Item, 3 Owner` | **找到实例**（一致性核对） |
  | `run replacementConstrained` | `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` | **找到实例**（(vi) 的前件可满足） |
  | `check TeamAssetsStayInTree` | `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` | 无反例 |
  | `check LockTruncates` | 同上 | 无反例 |
  | `check DisableIsDisjunction` | 同上 | 无反例 |
  | `check WorkspaceNeverSourcesPermission` | `for 6 but 4 Cap, 5 Assign, 3 Item, 3 Owner` | 无反例 |
  | `check WorkspaceNeverSourcesPlacement` | 同上 | 无反例 |
  | `check OfficialLowerBound` | `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` | 无反例 |
  | `check ReplacementCannotEscapePermission` | 同上 | 无反例 |

- **一致性核对**：`run fourLayerInstance` 必须给出一个租户替换了出厂那份、一把锁挡住了更具体层的另一份、
  工作区自带的一份生效并带权限项、有一个引用求不出、有一份被禁用的实例；`run replacementConstrained` 必须给出
  (vi) 的前件成立的实例。给不出说明 fact 把模型约束空了，那时各条 check 的「无反例」毫无意义。
- **非平凡核对**（每条断言都要**在它守的那一处被拿掉时失败**；变异体只在暂存区跑，不入库，结果在[验证入口](../../verification.md)）：

  | # | 拿掉什么 | 必须失败的断言 |
  |---|---|---|
  | M1 | `candidates` 里的锁条件（锁以里指向别的资产的也留下） | `LockTruncates` |
  | M2 | 禁用滤（`surviving = Holding`） | `DisableIsDisjunction` |
  | M3 | `permParticipating` 放进 `Workspace` | `WorkspaceNeverSourcesPermission` |
  | M4 | fact `OfficialNeverDisabled`（C7） | `OfficialLowerBound` |
  | M5 | fact `InputHoldingsStayInTree`（前提 P2） | `TeamAssetsStayInTree` |
  | M6 | `settingParticipating` 里对落点类的滤 | `WorkspaceNeverSourcesPlacement` |
  | M7 | `permParticipating` 改回「只看指向生效资产的持有」（追加裁定之前的读法） | `ReplacementCannotEscapePermission` |

- **为什么不登记为 formal task**：`alloy exec` **找到反例照样退出 0**，[检查器只以退出码判成败](../../../../../registry/README.md#当前状态)，
  登记它只会得到一个永远通过的任务。结果按命令逐条读，记在[验证入口](../../verification.md#形式化工件)。

Alloy 在给定规模内找反例；**在已检查范围内未发现反例，不自动成为任意规模的证明**。
