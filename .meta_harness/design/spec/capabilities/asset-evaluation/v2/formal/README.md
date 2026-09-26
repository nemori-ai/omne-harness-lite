# 形式化工件与论证映射

本页拥有**条款 → 性质 → 模型 → 检查命令**这一层对应关系，以及模型**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**——实际执行的工具、命令、范围与结果在[验证入口](../../verification.md)。

本版只选用一个工件，[理由在契约 S-32](../contract.md#s-32-本版选用哪些形式工件)：
求值是输入到结果的一个函数，要证的是**结果里什么能出现、什么不能**，那是结构关系，用 Alloy。
**不建 TLA+**（没有状态、没有交错），**不建 Schema**（值类型归 `data.asset-model` v2 与 `data.identity-values` v1）。

## 本版选用什么

| 契约条款 | 性质 | 模型与定义 | 未覆盖范围与相应义务 |
|---|---|---|---|
| [S-18](../contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断) ＋ [第七节前提 PRE-2](../contract.md#前提由别人兑现本契约不检查) | **(i) 团队资产不出那棵树**（求值一侧的投影）：每份生效资产要么是官方件，要么所有者是 PRE-2 容许的所有者 | [`Evaluation.als`](Evaluation.als)：断言 `TeamAssetsStayInTree`，**在 fact `InputHoldingsStayInTree`（即前提 PRE-2）之下** | **按构造，不作证据**（2026-09-24 按独立评审 AE-7 收窄）：模型里 `effective` 本来就从 `Holding` 构造，「生效资产只来自输入的持有」这一半是定义本身，断言对它恒成立；前提那一半由 fact 直接给出，只有拿掉 fact 的 M5 会让它失败——M5 说明断言**依赖**前提，不说明求值规则挡住了别的来路。**两半的证据另有去处**：「只来自持有、不从 `definitions` 多带的一份带进来」是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值) 的「多带一份定义」那一支；前提本身由组输入的一方按 `capability.asset-transfer/v2#S-9` 兑现，读序的证据是那份契约的场景 S-44，都不在本模型 |
| [S-18](../contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断) | **(ii) 锁截断**：有起作用的锁，生效的就是最外那一把锁住的那份；锁那一格以里、指向别的资产的同标识持有不出现在生效结果里 | 断言 `LockTruncates` | 锁以里**指向同一份资产**的持有留下（配值用），模型按此建；`filteredOut` 那一条留痕不在模型（[S-26](../contract.md#s-26-每份持有都有去处)，证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)） |
| [S-17](../contract.md#s-17-第一步之一先按禁用滤) | **(iii) 禁用析取**：组织、租户任一格把某份资产禁用，或工作区把它提供的那份禁用，这份资产就不在任何能力标识的生效结果里 | 断言 `DisableIsDisjunction` | 「先禁用后替换」的次序后果（标识退回外一层）**不是断言**，证据形式是规范场景 [S-34](../contract.md#s-34-先禁用后替换) |
| [S-23](../contract.md#s-23-第四步权限)、[S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置)、[S-25](../contract.md#s-25-工作区提供的资产的权限项一律取最严值) | **(iv) 工作区滤权**：组合里任何一项权限的值都不来自工作区那一格 | 断言 `WorkspaceNeverSourcesPermission` | 只核「来自哪一格」，不核值；工作区提供的资产的**最严值**是值域上的事，证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)（E-1 附表第 10～12 行） |
| [S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置) | **(iv′) 落点与身份类设置项的值不来自工作区那一格** | 断言 `WorkspaceNeverSourcesPlacement` | 同上 |
| [S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置) | **(iv″) 治理类设置项的值不来自工作区那一格**（PF-002 rev 20 §5.7） | 断言 `WorkspaceNeverSourcesGovernance` | 同上；`disabled` 不是这里的项（它在第 1 步用掉） |
| [S-19](../contract.md#s-19-官方件是下界) | **(v) 官方件是下界**：出厂那一格持有的每个能力标识都有生效资产 | 断言 `OfficialLowerBound`；**它同时守「official 不参与『谁可以使用它』那一滤」**（fact `OfficialNotJudged`，M10） | **出厂持有齐全**是前提 PRE-4，由装配给（[S-29](../contract.md#s-29-装配给的保证-vs-协议须给的保证) 末行），不在模型 |
| [S-39](../contract.md#s-39-谁可以使用它值与判定) | **(viii) 判为用不了的不生效**：这次求值的租户用不了的那份资产，不出现在任何能力标识的生效结果里 | 断言 `UnusableNeverEffective`；`run usableByFallback` 给出两种退回的实例（退回出厂那一份；锁随被滤掉的那份不起作用、更具体的一份生效） | **判定本身不在模型**：`Unusable` 是给定的持有子集，只加两条 fact——official 不判（`OfficialNotJudged`）、指向同一份资产的持有同判（`JudgedPerAsset`）。值怎么求、`self` 对作者、角色在不在值里，证据形式是规范场景 [S-41](../contract.md#s-41-判下来用不了的退回下一层) |
| [S-23](../contract.md#s-23-第四步权限) 的「在效」 | **(ix) 用不了的那份不带走外层的界**：组织或租户那一格对 `c` 的持有被滤掉、却仍在效，且那一格对生效资产声明的权限项 `i` 配了带锁的值——那条值就在 `i` 的界里 | 断言 `UnusableKeepsBounds`；`run unusableConstrains` 给出前件成立的实例 | 与 (vi) 同样贴近 `permBounds` 的定义，价值在 M11：**把「被滤掉的仍在效」钉进模型**。「谁可以使用它」这一项自己的参与者不看锁截断（[S-39](../contract.md#s-39-谁可以使用它值与判定) 第 1 条），模型的 `PermissionItem` 不含它 |
| [S-23](../contract.md#s-23-第四步权限) | **(vi) 换了实现逃不出外层对这个能力标识锁下的界**：组织或租户那一格对 `c` 的在效持有指向被替换的那一份、且给生效资产声明的权限项 `i` 配了**带锁**的值——那条值就在 `i` 的界里 | 断言 `ReplacementCannotEscapePermission` | **它与 `permBounds` 的定义很近**：它的用处是把「按能力标识」钉住，把参与条件改回「只看指向生效资产的持有」时必须失败（下面的 M7）。**替换件没声明、外层锁过的那一项**（S-23 最后一段）不在断言范围——模型只对生效资产声明的项下断言；证据形式是规范场景 [S-36](../contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)（E-4 A 支的 `network`） |
| [S-23](../contract.md#s-23-第四步权限) | **(vii) 与界不交的挑选不给出值**：有挑选落在界内时，值来自其中一条，且没有一条落在界内的挑选比它更里（[D-060 §一 S10-b](../../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s10asset-evaluation报回的)） | 断言 `NonFittingPickNeverSources`；`run pickSkipped` 给出「更里的一条被跳过」的实例 | 「落在界内」是值域上的事，模型把它当作给定的布尔 `Fits`、`defaultFits`。**挑选不含界**（`permPicks` = 参与的配值减去界；2026-09-24 随 rev 17 §5.3 改，原先的 fact `BoundsFitUnlessEmpty` 随「界同时是挑选」一起删去）。值本身与「没有挑选落在界内」时的落档由规范场景 [S-36](../contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)（E-4 C、D、E 支）兜 |
| [S-23](../contract.md#s-23-第四步权限) | **(x) 不锁的「禁止」也是界**：执行权限上配成恰 `{forbid}` 的参与配值在界里（PF-002 rev 17 §5.3） | 断言 `ForbidIsBound`；`run unlockedForbid` 给出一条不带锁的 `{forbid}` 参与的实例 | 贴近 `permBounds` 的定义，价值在 M12。「配成恰 `{forbid}`」「这一项是执行权限」是值域上的事实，模型取给定的子集 `ForbidAssign`；它压过更里面的挑选这件事要算值，由 E-4 D 支兜 |

**没有进模型的，各自的理由**：

- **值本身**：设置覆盖得到哪个值、允许集合交出哪几档、一条挑选落不落在界内、权限的 `lockedAt`——值域上的计算，模型只算「值来自哪一格」。
  证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)、[S-36](../contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)。
- **组装里成环的收场**：`evaluate` 的失败值 `compositionCycle`，带环上的能力标识序列（[S-15](../contract.md#s-15-evaluate) ⑥ 与其后一段；原 G-1 于 2026-09-25 由 D-060 §八 M32 关闭）。**模型不建失败**：`reached` 用传递闭包，含环的实例里 `composition` 照定义算出，**那不对应任何一份结果**——契约对它不交结果；断言在这类实例上照样成立，只说明结构规则本身不因环而自相矛盾。环的判定与诊断的证据形式是规范场景 [S-43](../contract.md#s-43-成环即拒并指出环在哪)。
- **读不了正文的一类**（`categoryUnsupported`，[S-15](../contract.md#s-15-evaluate) ⑥，M45）：模型没有类别，把每份资产的引用与属性项都当作给定——等于假定每一类都有正文规则；**走到 plugin 或 sub-agent 即失败**这件事不在模型，证据形式是规范场景 [S-44](../contract.md#s-44-读不了正文的一类即拒)。
- **组合根只作身份**（M31，2026-09-25）：模型里 `composition` 减去 `Root.rootCap`、`reached` 从 `Root.rootRefs` 起、根没有生效资产时它自己进 `unresolvedCaps`——**按定义构造，不作证据**，没有断言也没有变异体守它；证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)（E-1 第 5 件事）与 [S-43](../contract.md#s-43-成环即拒并指出环在哪) C 支。**PRE-9**（`root.references` 就是根那份正文的引用）不建：`rootRefs` 任取，断言在更宽的输入上成立。
- **版本选用**（`data.asset-model/v2#S-18` 第 6 条）：模型把「生效资产的引用与属性项」当作资产的固定属性，等于假定选用的那一版已经定了。
- **没有挑选落在界内时的落档**（[S-23](../contract.md#s-23-第四步权限) 合成第 3 条）、**plugin「启用哪些成员」在第 2 步就地求值**（[S-20](../contract.md#s-20-第二步组装)）、**工作区提供的命令型拓展件默认禁用**（[S-17](../contract.md#s-17-第一步之一先按禁用滤) 第三条）：前两样是值域上的事（模型只算来自哪一格、可达集合按固定的引用算），第三样只是模型里给定的 `Disabled` 的又一个来源；证据形式分别是规范场景 [S-36](../contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)（E-4 E 支）、暂无（等 plugin 的属性项，[G-21](../contract.md#十一已知缺口)）、暂无（同 stdio 那一条，[G-19](../contract.md#十一已知缺口)）。
- **2026-09-24 加的三样输出**：常驻值（[S-38](../contract.md#s-38-常驻值)）、「谁可以使用它」的值与判定本身（[S-39](../contract.md#s-39-谁可以使用它值与判定)；它的**结构后果**——用不了的不生效、退回下一层、不带走外层的界——已进模型，见 (viii)(ix)）、落点设置的来处（[S-40](../contract.md#s-40-落点与身份类设置的来处)），以及工作区提供的 stdio 接入点默认禁用（[S-17](../contract.md#s-17-第一步之一先按禁用滤) 第三条）——都是逐条的映射或值，不是结构关系；证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)。
- **读入面**（[S-27](../contract.md#s-27-清单列的资产变成工作区那一格的持有)、[S-28](../contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕)，一个映射，没有结构约束可反驳）。
- **逐动作执行权限**（`mcpActionSets`，[S-21](../contract.md#s-21-第三步投影)，2026-09-24 加）：动作集只决定生效的 `mcp` 资产推出哪几条 `execute:<名>`，这些项推出之后与别的权限项同一套结构规则；模型里「资产声明了哪些项」本来就是给定的，多一个来源不改任何断言。证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)（E-1 的动作集与「不给动作集」那一支）。
- **执行权限项的 `tenantAutoWritable`**（[S-42](../contract.md#s-42-执行权限项另带租户那一层写得进自动吗)，修复波 1b 加；第二轮加 `mcp` 逐动作项恒为假与租户持有须在效且指向生效资产）：四条都是对输入的逐项读取（界含不含「自动」、那一格有没有锁、那份持有在不在效、指向哪一份、生效资产是不是工作区提供的），不改任何结构关系；模型不含它，**不写成「已由模型覆盖」**。证据形式是规范场景 [S-33](../contract.md#s-33-四格齐全的一次求值)（E-1 的真、假两种与「`h6` 带锁」一支）与 [S-36](../contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)（E-4 五支皆假）。
- **同输入同输出**（[S-11](../contract.md#s-11-纯计算)）：Alloy 里的函数按定义确定，写成断言是空的；证据形式是规范场景的重放支与静态检查。

## Alloy

- **模型文件**：[`Evaluation.als`](Evaluation.als)。
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `Layer` 五个原子；`assetLt`、`settingLt`、`permissionLt` | [S-5](../contract.md#s-5-层与三条层序) 的 `Layer` 与三条层序；`permissionLt` 里**没有** `Workspace` |
  | `Holding`（`layer`、`hcap`、`asset`）；`Locked`、`Disabled` 两个子集 | 持有、持有上的 `immutable`、保留项 `disabled` 为真 |
  | `Assign`（`at`、`acap`、`item`）；`LockedAssign` | 一条属性配值（挂在 `at` 那一格对 `acap` 的持有上；`at = Session` 是会话格那一对）；配值上的 `immutable` |
  | `WsAsset` | [S-9](../contract.md#s-9-工作区提供的资产) 工作区提供的资产 |
  | `PermissionItem`、`PlacementItem` | 权限项；设置项里落点与身份那一类（由生效资产的声明定，[S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置) 末段） |
  | fact `HoldingShape`、`FactoryHoldsOnlyOfficial`、`OfficialNeverDisabled`、`WorkspaceHoldsOnlyItsOwn`、`AssignShape` | [S-7](../contract.md#s-7-输入的一致性条件) 的 C4、C6、C7、C8 与「配值挂在持有上」 |
  | `TreeOwner` | **前提 PRE-2 容许的所有者**：租户所在的组织、租户自己，以及此刻生效、被分享方就是持有那一层的分享的分享方。模型只把它当作 `Owner` 的一个给定子集，**不算它怎么来**；名字与 `.als` 里那两行注释沿用 R2-12 之前「租户那棵隶属树」的说法——那个说法漏了个人—个人、个人→团队与组织内分享的分享方，**模型的内容不依赖它**，2026-09-24 改读不改模型（理由见[验证入口](../../verification.md#变化的影响)） |
  | fact `InputHoldingsStayInTree` | **不是 S-7 的条件**，是第七节前提 PRE-2——求值不检查它 |
  | `disabledAssets`、`notDisabled` | [S-17](../contract.md#s-17-第一步之一先按禁用滤) 资产级析取；工作区的禁用只对 `WsAsset` 参与 |
  | `Unusable`；fact `OfficialNotJudged`、`JudgedPerAsset`；`surviving` | [S-39](../contract.md#s-39-谁可以使用它值与判定) 第一步之二：判下来用不了的持有（判定作给定）；official 不判；同一份资产同判。`surviving` = 过了之一与之二 |
  | `lockers`、`lockHolding`、`candidates`、`selected`、`effective` | [S-18](../contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断)：工作区的锁不算（2026-09-24 起合法输入里工作区那一格根本不带锁——清单上的 `immutable` 在读入时丢，求值输入再带即不合形状；模型仍容许它出现、照旧不算，是**更宽的输入空间**，断言在收窄后的输入上照样成立，所以模型与 `.als` 里「S-24」那两行注释不改，不重跑）；最外一把截断；锁以里同一份资产的持有留下。锁只从 `surviving` 里找——被滤掉的那份，它的锁不起作用 |
  | `inEffect` | [S-23](../contract.md#s-23-第四步权限) 的**在效**：没被禁用滤掉、不在锁以里指向另一份资产；被 `Unusable` 滤掉的照同一条判。对没被滤掉的持有，它就是 `candidates` |
  | `Root`（`rootCap`、`rootRefs`） | [S-6](../contract.md#s-6-求值输入-evaluationinput) 的 `root`：`rootCap` = `root.definition`，`rootRefs` = `root.references` 的能力标识（常驻标记不建模） |
  | `refStep`、`reached`、`composition`、`unresolvedCaps` | [S-20](../contract.md#s-20-第二步组装)：引用指向能力标识，沿生效资产走；根可见时从 `rootRefs` 起，`composition` 不含 `rootCap`，根没有生效资产时 `rootCap` 进 `unresolvedCaps`（M31） |
  | `GovernanceItem` | 设置项里治理那一类（`disabled` 之外，[S-24](../contract.md#s-24-工作区那一格在第四步只贡献设置)） |
  | `settingParticipating` | [S-22](../contract.md#s-22-第四步设置)：持有层只有**指向生效资产**的持有给值；会话格按能力标识；工作区的落点类、治理类配值不参与 |
  | `permParticipating` | [S-23](../contract.md#s-23-第四步权限)：组织、租户两格的**在效**持有（`inEffect`）参与，**不论指向哪份资产**；会话格；工作区一律不参与 |
  | `ForbidAssign`；`permBounds`、`permPicks` | 执行权限上配成恰 `{forbid}` 的配值；带锁的与 `ForbidAssign` 是界，其余参与的配值是挑选，界不同时是挑选 |
  | `Fits`、`Values.defaultFits` | 一条挑选（配值、声明默认值）落不落在界内——值域上的事实，模型只取布尔 |
  | `permFrom` | 由里到外第一条落在界内的挑选那一格；否则出厂那一格的挑选（工作区提供的资产没有）；否则给了界的最里面那一格；否则 `Factory`——[S-25](../contract.md#s-25-工作区提供的资产的权限项一律取最严值) 的最严值落在最后一支 |
  | `settingFrom` | 最外那一条带锁的配值所在的格（工作区的锁不算）；否则最里面给了值的那一格；否则 `Factory` |

- **检查范围**：

  | 命令 | 范围 | 预期 |
  |---|---|---|
  | `run fourLayerInstance` | `for 6 but 4 Cap, 7 Holding, 4 Assign, 4 Item, 3 Owner` | **找到实例**（一致性核对） |
  | `run replacementConstrained` | `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` | **找到实例**（(vi) 的前件可满足） |
  | `run pickSkipped` | 同上 | **找到实例**（(vii) 的前件不是空泛的） |
  | `run usableByFallback` | `for 6 but 4 Cap, 7 Holding, 4 Assign, 3 Item, 3 Owner` | **找到实例**（两种退回都能发生） |
  | `run unusableConstrains` | `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` | **找到实例**（(ix) 的前件可满足） |
  | `run unlockedForbid` | 同上 | **找到实例**（(x) 的前件不是空泛的） |
  | `check TeamAssetsStayInTree` | `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` | 无反例 |
  | `check LockTruncates` | 同上 | 无反例 |
  | `check DisableIsDisjunction` | 同上 | 无反例 |
  | `check WorkspaceNeverSourcesPermission` | `for 6 but 4 Cap, 5 Assign, 3 Item, 3 Owner` | 无反例 |
  | `check WorkspaceNeverSourcesPlacement` | 同上 | 无反例 |
  | `check WorkspaceNeverSourcesGovernance` | 同上 | 无反例 |
  | `check OfficialLowerBound` | `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` | 无反例 |
  | `check ReplacementCannotEscapePermission` | 同上 | 无反例 |
  | `check NonFittingPickNeverSources` | 同上 | 无反例 |
  | `check UnusableNeverEffective` | 同上 | 无反例 |
  | `check UnusableKeepsBounds` | 同上 | 无反例 |
  | `check ForbidIsBound` | 同上 | 无反例 |

- **一致性核对**：`run fourLayerInstance` 必须给出一个租户替换了出厂那份、一把锁挡住了更具体层的另一份、
  工作区提供的一份生效并带权限项、有一个引用求不出、有一份被禁用的实例；`run replacementConstrained`、`run pickSkipped`、`run unusableConstrains`、`run unlockedForbid` 必须给出
  (vi)、(vii)、(ix)、(x) 的前件成立的实例，`run usableByFallback` 必须给出两种退回的实例。给不出说明 fact 把模型约束空了，那时各条 check 的「无反例」毫无意义。
- **非平凡核对**（每条断言都要**在它守的那一处被拿掉时失败**；变异体不入库，原始输出在主检出 `tmp/formal-runs/` 下，目录名见[验证入口](../../verification.md#结果与反例)，结果在[验证入口](../../verification.md)）：

  | # | 拿掉什么 | 必须失败的断言 |
  |---|---|---|
  | M1 | `candidates` 里的锁条件（锁以里指向别的资产的也留下） | `LockTruncates`（连带 `ReplacementCannotEscapePermission`：它的前件读 `candidates`，参与读 `inEffect`，这个变异体把两者拆开） |
  | M2 | 禁用滤（`notDisabled = Holding`） | `DisableIsDisjunction` |
  | M3 | `permParticipating` 放进 `Workspace` | `WorkspaceNeverSourcesPermission` |
  | M4 | fact `OfficialNeverDisabled`（C7） | `OfficialLowerBound` |
  | M5 | fact `InputHoldingsStayInTree`（前提 PRE-2） | `TeamAssetsStayInTree` |
  | M6 | `settingParticipating` 里对落点类的滤（治理类的滤留着） | `WorkspaceNeverSourcesPlacement` |
  | M7 | `permParticipating` 改回「只看指向生效资产的持有」（追加裁定之前的读法） | `ReplacementCannotEscapePermission`（连带 `UnusableKeepsBounds`：被滤掉的那份从不指向生效资产） |
  | M8 | `permFrom` 改回「参与的最里面那一格」，不问落不落在界内（D-060 §一 S10-b 之前的读法） | `NonFittingPickNeverSources` |
  | M9 | 「谁可以使用它」滤（`surviving = notDisabled`） | `UnusableNeverEffective` |
  | M10 | fact `OfficialNotJudged`（official 也参与这一滤） | `OfficialLowerBound` |
  | M11 | `permParticipating` 改用 `candidates`（被滤掉的那份连同它的界一起不算） | `UnusableKeepsBounds` |
  | M12 | `permBounds` 只取带锁的（不锁的「禁止」不算界） | `ForbidIsBound` |
  | M13 | `settingParticipating` 里对治理类的滤（落点类的滤留着） | `WorkspaceNeverSourcesGovernance` |

- **判读**：`check` 行是 `UNSAT` 读作**本范围内无反例**，是 `SAT` 读作找到反例；`run` 行反之（[D-060 §一 S10-c](../../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s10asset-evaluation报回的)）。
- **为什么不登记为 formal task**：`alloy exec` **找到反例照样退出 0**，[检查器只以退出码判成败](../../../../../registry/README.md#当前状态)，
  登记它只会得到一个永远通过的任务。结果按命令逐条读，记在[验证入口](../../verification.md#形式化工件)。

Alloy 在给定规模内找反例；**在已检查范围内未发现反例，不自动成为任意规模的证明**。
