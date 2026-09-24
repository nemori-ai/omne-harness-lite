# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：规范场景与静态检查未开始；Alloy 模型随 D-040 §八 M31（组合根只作身份）改过之后 2026-09-25 重跑一次（十八条命令、十三个变异体，全部与预期一致），原始输出在主检出 `tmp/formal-runs/asset-evaluation-v1-2026-09-25/`，未登记为 formal task。**
> `capability.asset-evaluation` v1 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **八条规范场景（S-33～S-37、S-41、S-43、S-44）一条都未执行**——文件存在不代替结果。
> Alloy 那一次的判读、范围与局限见[下节](#结果与反例)；它只支持[契约第七节](v1/contract.md#七性质与前提)标了 Alloy 的那几行，**且只在所列规模内**；(i) 那一行 2026-09-24 起标「按构造，不作证据」。
> **2026-09-24 独立评审第一轮原地修订**（[处置表](#独立评审)）：`Evaluation.als` 一个字节未改，**当时不重跑**（理由见[变化的影响](#变化的影响)）。**2026-09-25 实现映射反推（[处置表](#实现映射反推2026-09-25)）改了第 2 步的三个定义**，SHA-256 由 `4a79c2f9…126a` 变为 `6935da22…505f`，2026-09-24c 那次作废，[新一次运行](#已执行组合根只作身份之后的-alloy-运行2026-09-25)对应现在的文件。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **结构性质 (i)～(x)**：团队资产不出那棵树、锁截断、禁用析取、工作区滤权（权限、落点类、治理类）、官方件下界、换了实现逃不出外层对这个能力标识锁下的界、与界不交的挑选不给出值、判为用不了的不生效、用不了的那份不带走外层的界、不锁的「禁止」也是界 | Alloy：[`Evaluation.als`](v1/formal/Evaluation.als) 的十八条命令 ＋ 十三个变异体 | [S-17](v1/contract.md#s-17-第一步之一先按禁用滤)～[S-19](v1/contract.md#s-19-官方件是下界)、[S-39](v1/contract.md#s-39-谁可以使用它值与判定) 的结构后果、[S-22](v1/contract.md#s-22-第四步设置)～[S-25](v1/contract.md#s-25-工作区提供的资产的权限项一律取最严值) 的「来自哪一格」那一面 | **2026-09-25 执行一次，未登记**（[下节](#已执行组合根只作身份之后的-alloy-运行2026-09-25)）。**(i) 按构造，不作证据**：`effective` 由持有构造、前提那一半由 fact 给出，M5 只说明它依赖 PRE-2；「只来自持有」的证据改由 V-2 的「多带一份定义」那一支给 |
| V-2 | **四格齐全的一次求值**（[S-33](v1/contract.md#s-33-四格齐全的一次求值)）：五个集合与 [E-1](v1/examples.md#e-1-四格齐全的一次求值) 逐项相等；同一输入重放；改一项权限只动那一项的值 | 规范场景演练，**同一次演练比对全部五个集合** | [S-8](v1/contract.md#s-8-求值结果-effectiveassembly)、[S-11](v1/contract.md#s-11-纯计算)、[S-17](v1/contract.md#s-17-第一步之一先按禁用滤)～[S-26](v1/contract.md#s-26-每份持有都有去处) | **未开始。**需要一个实现；且第 2 步要 Agent Definition 的两条规则（[G-3](v1/contract.md#十一已知缺口)），闭合前只能以 examples 里「给定的正文」替身跑。**凭据那一条（E-1 第 1 件事）必须真核**：它失败的形态是外泄，不是报错。2026-09-24 起五个集合里的 `assets` 多了 `version`、`resident` 两列（`usable` 同日加上、又随第一步三小步删去）、`values` 多了落点设置的 `provenance`，同一次演练一并比对。2026-09-24 独立评审第一轮起输入带 `mcpActionSets`、`values` 的逐动作项按真名 `execute:<名>`，附加支由两支加到四支（多带一份定义；拿掉动作集）。**2026-09-25（M31）起**：输入的 `root` 是组合根引用集、结果多一个 `root`；`composition` 不含组合根（四个 → 三个），`values` 十三条 → 十条（根的三项不求），会话格那条改由 `skill:audit / variant` 演示；「必须同时观察到」加第 5 件事——根的项一条也没有、各格对它的配值不进 `filteredOut`。第 2 步不再挡在根的规则上（G-3 收窄），替身只剩「给定的正文」那几份被引用者 |
| V-3 | **先禁用后替换**（[S-34](v1/contract.md#s-34-先禁用后替换)）：[E-2a、E-2b](v1/examples.md#e-2-先禁用后替换) | 规范场景演练 | [S-17](v1/contract.md#s-17-第一步之一先按禁用滤)、[S-18](v1/contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断) | **未开始** |
| V-4 | **清单读入的留痕**（[S-35](v1/contract.md#s-35-清单读入的留痕)）：[E-3](v1/examples.md#e-3-一次清单读入)，并与 E-1 连起来看 | 规范场景演练 | [S-16](v1/contract.md#s-16-readworkspacecarrier)、[S-27](v1/contract.md#s-27-清单列的资产变成工作区那一格的持有)、[S-28](v1/contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕) | **未开始。**记录号怎么铸未定（[G-6](v1/contract.md#十一已知缺口)），演练比对的是结构。2026-09-24 起另核：清单缺 `assignments` 或 `disabled` 即 `invalidInput`（不当作空列表）；持有与每条配值的 `since` 都留给调用方以读入时刻补 |
| V-5 | **设置不跟过去、权限的约束跟过去**（[S-36](v1/contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)）：[E-4](v1/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 五支同跑 | 规范场景演练 | [S-22](v1/contract.md#s-22-第四步设置)、[S-23](v1/contract.md#s-23-第四步权限) | **未开始。**G-16、G-17 已闭合（D-040 §一 S10-a、S10-b），E-4 按「界与挑选」「『禁止』是界」「界不同时是挑选」「没挑到界内取最近一档」的期望跑；A、B、C 三支执行权限的 `from` 2026-09-24 由 organization 改为 factory（界不再同时是挑选） |
| V-6 | **输入不合法时整体拒绝**（[S-37](v1/contract.md#s-37-输入不合法时整体拒绝)）：[E-5](v1/examples.md#e-5-不合法的输入) 十份 | 规范场景演练，**核返回里没有任何 `EffectiveAssembly`** | [S-7](v1/contract.md#s-7-输入的一致性条件)、[S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | **未开始。**2026-09-25 加两份（`root.references` 缺席 ⇒ C1；非 tool、skill 的引用带常驻标记 ⇒ C14），第 4 份改为换 `root.definition` |
| V-7 | **装配给的保证**（[S-29](v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) 左列）：一致读、分享此刻成立、调用方已核实、清单就是目录里那份 | 装配设计的选型声明 ＋ 架构评审 | [第七节前提](v1/contract.md#前提由别人兑现本契约不检查) PRE-1～PRE-3、PRE-7、PRE-8（动作集就是这次尝试钉住的那一份，由会话资产注册表兑现） | **未开始。**不是可跑的义务；它们失效的形态都是**静默算错**（锁截断被绕过、团队资产出树），上面的场景测不出 |
| V-8 | **判下来用不了的退回下一层**（[S-41](v1/contract.md#s-41-判下来用不了的退回下一层)）：[E-6](v1/examples.md#e-6-判下来用不了的退回下一层) 六支同跑 | 规范场景演练 | [S-39](v1/contract.md#s-39-谁可以使用它值与判定)、[S-18](v1/contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断)、[S-19](v1/contract.md#s-19-官方件是下界)、[S-26](v1/contract.md#s-26-每份持有都有去处) | **未开始。**E 支的期望（锁随被滤掉的那份不起作用）是本契约推导，已报主线；主线改判则 E、F 两支随之改。**PF-002 acceptance §一「成员乙写了一个 tool，组织持有了它」那一行说的是组织直接持有**（不经 plugin），按主线读法（2026-09-24）与 [S-31](v1/contract.md#s-31-unresolved-交到装配手上怎么收场) 不冲突：没有同名 official 时，E-6 C 支的求值结果是这个标识进 `unresolved`，装配据它怎么收场归 S-31 |
| V-9 | **执行权限项的 `tenantAutoWritable`**（[S-42](v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗)）：[E-1](v1/examples.md#e-1-四格齐全的一次求值) 的真、假两种（假的那两条同时演示 `mcp` 逐动作项恒为假）、「`h6` 带锁」与「`h6` 被禁用」两支，[E-4](v1/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 五支皆假 | 规范场景演练，随 V-2、V-5 同一次演练比对 | [S-42](v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗)、[S-8](v1/contract.md#s-8-求值结果-effectiveassembly) | **未开始** |
| V-10 | **成环即拒并指出环在哪；根不可见即不往下走**（[S-43](v1/contract.md#s-43-成环即拒并指出环在哪)）：[E-7](v1/examples.md#e-7-成环即拒并指出环在哪) 三支同跑 | 规范场景演练，**A 支核返回里没有任何 `EffectiveAssembly`、失败值是 `compositionCycle` 而不是 `invalidInput`、诊断 `cycle` 列出环上的标识** | [S-15](v1/contract.md#s-15-evaluate) ⑥ 与其后一段、[S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段、[S-20](v1/contract.md#s-20-第二步组装) | **未开始**（2026-09-25 新加，D-040 §八 M31、M32）。诊断的写法（从哪一处起、几个环报哪个）不承载含义，比对时只核它是一个环、环上每一步是直接引用。本版到得了的环只有根指回自己那一种（[G-3](v1/contract.md#十一已知缺口)），sub-agent 之间的环等 G-3 闭合再加支 |
| V-11 | **读不了正文的一类即拒**（[S-44](v1/contract.md#s-44-读不了正文的一类即拒)）：[E-8](v1/examples.md#e-8-读不了正文的一类即拒) 四支同跑 | 规范场景演练，**A、B 两支核返回里没有任何 `EffectiveAssembly`、失败值是 `categoryUnsupported` 且 `category` 对得上**；C 支核被禁用的不触发；D 支核判定次序 | [S-15](v1/contract.md#s-15-evaluate) ⑥ 与其后 `categoryUnsupported` 一段、[S-12](v1/contract.md#s-12-缺席时的默认答案) 那一行、[S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段、[S-20](v1/contract.md#s-20-第二步组装) | **未开始**（2026-09-25 新加，D-040 §八 M45）。它守的是「判不出来不当作判出来了」：实现把读不了的那一类当作空引用或全部启用时，A、B 两支会得到一份看似完整的结果。**G-3、G-21 闭合时这一条随值一起删去**，改由那两类的正文规则场景取代 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。**本版全部状态为「未开始」**，检查器形式归 realization。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 两个操作的实现不读存储、时钟、文件与进程状态，不写任何东西 | [S-11](v1/contract.md#s-11-纯计算)、[S-30](v1/contract.md#s-30-本能力没有在途工作) | 未开始 |
| SC-2 | 消费者缓存求值结果时，键覆盖整份输入（含 `standing`、`workspace`、会话配值、选用版本、`root.references` 与 `mcpActionSets`），不只以 `(tenant, root.definition)` 为键 | [S-15](v1/contract.md#s-15-evaluate) ⑦ | 未开始 |
| SC-3 | 不存在把 `invalidInput`、`compositionCycle`、`categoryUnsupported` 转成空 `EffectiveAssembly`（或去掉一部分的结果）、或把 `unresolved` 升级成失败的路径 | [S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | 未开始（2026-09-25 随 M32、M45 扩到三个失败值） |

## 结果与反例

### 已执行：组合根只作身份之后的 Alloy 运行（2026-09-25）

| 项 | 值 |
|---|---|
| 对象 | [`v1/formal/Evaluation.als`](v1/formal/Evaluation.als)，随 [D-040 §八 M31](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 改第 2 步之后的内容（未冻结）：`Root` 加 `rootRefs`；`reached` 在根有生效资产时从 `rootRefs` 起、否则为空；`composition` 减去 `rootCap`；`unresolvedCaps` 加上没有生效资产的 `rootCap`；头注释的 S-20 一行与「成环的收场」一句改写。断言、fact、`run`／`check` 命令与范围一字未动。SHA-256 `6935da2259130aafea0e770dad7c94578152fd517e3ef5d2f7bd006a8bba505f` |
| 工具 | 本机 `/usr/local/bin/alloy` 6.2.0（`/opt/alloy/alloy.jar`，JRE 21），`alloy exec -f -o out Evaluation.als` |
| 怎么跑的 | 复制到主检出 `tmp/formal-runs/asset-evaluation-v1-2026-09-25/` 再跑：`run.log`、`out/`、`sha256.txt`；变异体 `mutants/M1.als`～`M13.als` 由 2026-09-24c 那十三个变异体对旧模型的差异原样打到新模型上得到（`mutants/M*.patch`，逐个只改一处，与新模型的差异在 `mutants-summary.txt`），各自的输出在 `mutants/M*.out`；**未入库** |
| 判读 | `check` 行 `UNSAT` 读作**本范围内无反例**、`SAT` 读作找到反例；`run` 行 `SAT` 读作前件可满足（账本 S10-c） |
| 结果 | 全部十八条与预期一致，墙钟约 12.5 秒；退出码 0： |

```text
00. run   fourLayerInstance                    SAT
01. run   replacementConstrained               SAT
02. run   pickSkipped                          SAT
03. run   usableByFallback                     SAT
04. run   unusableConstrains                   SAT
05. run   unlockedForbid                       SAT
06. check TeamAssetsStayInTree                 UNSAT
07. check LockTruncates                        UNSAT
08. check DisableIsDisjunction                 UNSAT
09. check WorkspaceNeverSourcesPermission      UNSAT
10. check WorkspaceNeverSourcesPlacement       UNSAT
11. check WorkspaceNeverSourcesGovernance      UNSAT
12. check OfficialLowerBound                   UNSAT
13. check ReplacementCannotEscapePermission    UNSAT
14. check NonFittingPickNeverSources           UNSAT
15. check UnusableNeverEffective               UNSAT
16. check UnusableKeepsBounds                  UNSAT
17. check ForbidIsBound                        UNSAT
```

**变异体**：M1～M13 全部退出 0，找到反例的断言与 2026-09-24c 那张表**逐行相同**（M1：`LockTruncates`、`ReplacementCannotEscapePermission`；M8：`NonFittingPickNeverSources` 且 `run pickSkipped` 变 `UNSAT`；M7：`ReplacementCannotEscapePermission`、`UnusableKeepsBounds`；其余各一条），与预期一致。

**范围与局限**（下一节那几条仍然成立，另加两条）：

- **M31 的三处改动按定义构造，不作证据**：没有断言守「`composition` 不含根」「根不可见即不往下走」，也没有变异体——它们由规范场景 V-2（E-1 第 5 件事）与 V-10（E-7 C 支）兜。这次重跑说明的是：**第 2 步换了起点之后，十条结构性质与各自的非平凡核对照旧成立**，`run fourLayerInstance` 的「有一个引用求不出」仍可满足。
- **成环不建**：`compositionCycle` 是失败值，模型不建失败；含环的实例里 `composition` 照定义算出，**不对应任何一份结果**（[formal 入口](v1/formal/README.md)「没有进模型的」）。PRE-9 不建，`rootRefs` 任取。

### 已作废：吸收 PF-002 rev 17 到 rev 20 之后的 Alloy 运行（2026-09-24c）

**这一次对应 M31 之前的模型**（`reached` 从 `rootCap` 起、`composition` 含根），被上一节取代；原始输出仍在主检出 `tmp/formal-runs/asset-evaluation-v1-2026-09-24b/-c/`，只作历史。下面照原样保留。

| 项 | 值 |
|---|---|
| 对象 | [`v1/formal/Evaluation.als`](v1/formal/Evaluation.als)，加 `ForbidAssign`（执行权限上的 `{forbid}` 是界）、`permPicks`（界不同时是挑选，删 fact `BoundsFitUnlessEmpty` 与 `Values.emptyBound`）、`GovernanceItem`（工作区的治理类配值不参与）、断言 (iv″)(x) 与 `run unlockedForbid` 之后的内容（未冻结）；SHA-256 `4a79c2f98168ae9418c78ec4a80c0df4ef6f640285d2793c151790c4baaf126a` |
| 工具 | 本机 `/usr/local/bin/alloy` 6.2.0（`/opt/alloy/alloy.jar`，JRE 21），`alloy exec -f -o out Evaluation.als` |
| 怎么跑的 | 复制到主检出 `tmp/formal-runs/asset-evaluation-v1-2026-09-24b/-c/` 再跑（目录名以 `-` 开头，shell 里写 `./-c` 或 `-- -c`）：`run.log`、`out/`、`sha256.txt`；变异体 `mutants/M1.als`～`M13.als` 与各自的 `.out`，差异与偏离预期的行汇总在 `mutants-summary.txt`；**未入库** |
| 判读 | `check` 行 `UNSAT` 读作**本范围内无反例**、`SAT` 读作找到反例；`run` 行 `SAT` 读作前件可满足（账本 S10-c） |
| 结果 | 全部十八条与预期一致，墙钟约 12 秒；退出码 0： |

```text
00. run   fourLayerInstance                    SAT
01. run   replacementConstrained               SAT
02. run   pickSkipped                          SAT
03. run   usableByFallback                     SAT
04. run   unusableConstrains                   SAT
05. run   unlockedForbid                       SAT
06. check TeamAssetsStayInTree                 UNSAT
07. check LockTruncates                        UNSAT
08. check DisableIsDisjunction                 UNSAT
09. check WorkspaceNeverSourcesPermission      UNSAT
10. check WorkspaceNeverSourcesPlacement       UNSAT
11. check WorkspaceNeverSourcesGovernance      UNSAT
12. check OfficialLowerBound                   UNSAT
13. check ReplacementCannotEscapePermission    UNSAT
14. check NonFittingPickNeverSources           UNSAT
15. check UnusableNeverEffective               UNSAT
16. check UnusableKeepsBounds                  UNSAT
17. check ForbidIsBound                        UNSAT
```

**变异体**（M1～M11 按原来的改法在新模型上重做，M6 只拿掉落点类那一半；M12、M13 是新加的；每个只改一处，全部退出 0）：

| # | 拿掉什么 | 找到反例的断言 | 与预期 |
|---|---|---|---|
| M1 | `candidates` 的锁条件 | `LockTruncates`、`ReplacementCannotEscapePermission` | 一致（同上一次） |
| M2 | 禁用滤（`notDisabled = Holding`） | `DisableIsDisjunction` | 一致 |
| M3 | `permParticipating` 放进 `Workspace` | `WorkspaceNeverSourcesPermission` | 一致 |
| M4 | fact `OfficialNeverDisabled` | `OfficialLowerBound` | 一致 |
| M5 | fact `InputHoldingsStayInTree` | `TeamAssetsStayInTree` | 一致 |
| M6 | `settingParticipating` 对落点类的滤（治理类的留着） | `WorkspaceNeverSourcesPlacement` | 一致 |
| M7 | `permParticipating` 改回只看指向生效资产的持有 | `ReplacementCannotEscapePermission`、`UnusableKeepsBounds` | 一致（同上一次） |
| M8 | `permFrom` 改回「参与的最里面那一格」 | `NonFittingPickNeverSources`；同时 `run pickSkipped` 变 `UNSAT` | 一致 |
| M9 | 「谁可以使用它」滤（`surviving = notDisabled`） | `UnusableNeverEffective` | 一致 |
| M10 | fact `OfficialNotJudged` | `OfficialLowerBound` | 一致 |
| M11 | `permParticipating` 改用 `candidates` | `UnusableKeepsBounds` | 一致 |
| M12 | `permBounds` 只取带锁的 | `ForbidIsBound` | 一致 |
| M13 | `settingParticipating` 对治理类的滤（落点类的留着） | `WorkspaceNeverSourcesGovernance` | 一致 |

**范围与局限**（下两节那几条仍然成立，另加两条）：

- (x) 按构造贴近 `permBounds` 的定义，价值在 M12；「配成恰 `{forbid}`」「这一项是执行权限」取给定子集 `ForbidAssign`，**它压过更里面的挑选、没挑到界内时落哪一档**都要算值，由 V-5（E-4 D、E 支）兜。
- plugin「启用哪些成员」就地求值与命令型拓展件默认禁用**不在模型**（见 [formal 入口](v1/formal/README.md)「没有进模型的」）。

### 已作废：第一步三小步之后的 Alloy 运行（2026-09-24b）

**这一次对应改前的模型**（界同时是挑选、没有 `ForbidAssign` 与 `GovernanceItem`），被上一节取代；原始输出仍在主检出 `tmp/formal-runs/asset-evaluation-v1-2026-09-24b/`，只作历史。下面照原样保留。

| 项 | 值 |
|---|---|
| 对象 | [`v1/formal/Evaluation.als`](v1/formal/Evaluation.als)，随 PF-002 rev 19 加「谁可以使用它」滤（`Unusable`、`inEffect`、断言 (viii)(ix)、两条 `run`）之后的内容（未冻结）；SHA-256 `77090e50021e31e477be1938c66bf1c44d5ed1d105af94267bf9315dd3d33afe` |
| 工具 | 本机 `/usr/local/bin/alloy` 6.2.0（`/opt/alloy/alloy.jar`，JRE 21），`alloy exec -f -o out Evaluation.als` |
| 怎么跑的 | 把模型复制到主检出 `tmp/formal-runs/asset-evaluation-v1-2026-09-24b/` 再跑：`run.log` 是标准输出与耗时，`out/` 是逐条输出，`sha256.txt` 是对象哈希；变异体在同目录 `mutants/`（`M1.als`～`M11.als` 与各自的 `.out`），逐个的差异与偏离预期的行汇总在 `mutants-summary.txt`；**未入库** |
| 判读 | `check` 行 `UNSAT` 读作**本范围内无反例**、`SAT` 读作找到反例；`run` 行 `SAT` 读作前件可满足（账本 S10-c） |
| 结果 | 全部十五条与预期一致，墙钟约 11 秒；退出码 0： |

```text
00. run   fourLayerInstance                    SAT
01. run   replacementConstrained               SAT
02. run   pickSkipped                          SAT
03. run   usableByFallback                     SAT
04. run   unusableConstrains                   SAT
05. check TeamAssetsStayInTree                 UNSAT
06. check LockTruncates                        UNSAT
07. check DisableIsDisjunction                 UNSAT
08. check WorkspaceNeverSourcesPermission      UNSAT
09. check WorkspaceNeverSourcesPlacement       UNSAT
10. check OfficialLowerBound                   UNSAT
11. check ReplacementCannotEscapePermission    UNSAT
12. check NonFittingPickNeverSources           UNSAT
13. check UnusableNeverEffective               UNSAT
14. check UnusableKeepsBounds                  UNSAT
```

**变异体**（M1～M8 按原来的改法在新模型上重做，M9～M11 是新加的；每个只改一处，全部退出 0）：

| # | 拿掉什么 | 找到反例的断言 | 与预期 |
|---|---|---|---|
| M1 | `candidates` 的锁条件 | `LockTruncates`、`ReplacementCannotEscapePermission` | 一致；第二条是新连带：(vi) 的前件读 `candidates`、参与读 `inEffect`，这个变异体把两者拆开 |
| M2 | 禁用滤（`notDisabled = Holding`） | `DisableIsDisjunction` | 一致 |
| M3 | `permParticipating` 放进 `Workspace` | `WorkspaceNeverSourcesPermission` | 一致 |
| M4 | fact `OfficialNeverDisabled` | `OfficialLowerBound` | 一致 |
| M5 | fact `InputHoldingsStayInTree` | `TeamAssetsStayInTree` | 一致 |
| M6 | `settingParticipating` 对落点类的滤 | `WorkspaceNeverSourcesPlacement` | 一致 |
| M7 | `permParticipating` 改回只看指向生效资产的持有 | `ReplacementCannotEscapePermission`、`UnusableKeepsBounds` | 一致；第二条是新连带：被滤掉的那份从不指向生效资产 |
| M8 | `permFrom` 改回「参与的最里面那一格」 | `NonFittingPickNeverSources`；同时 `run pickSkipped` 变 `UNSAT` | 一致（同上一次） |
| M9 | 「谁可以使用它」滤（`surviving = notDisabled`） | `UnusableNeverEffective` | 一致 |
| M10 | fact `OfficialNotJudged` | `OfficialLowerBound` | 一致：official 也参与这一滤时，下界守不住 |
| M11 | `permParticipating` 改用 `candidates` | `UnusableKeepsBounds` | 一致 |

**范围与局限**（下节那几条仍然成立，另加三条）：

- **判定本身不在模型**：`Unusable` 是给定的持有子集，模型只约束 official 不判、同一份资产同判；值怎么求、`self` 对作者，由 V-8（E-6）兜。
- (viii) 按构造贴近 `surviving` 的定义，价值在 M9；(ix) 贴近 `permBounds`，价值在 M11——**把「被滤掉的仍在效」钉进模型**，而这一条本身是本契约推导（已报主线）。
- 「谁可以使用它」这一项自己的参与者不看锁截断（[S-39](v1/contract.md#s-39-谁可以使用它值与判定) 第 1 条），**模型没有建这一项**：`PermissionItem` 不含它。

### 已作废：整批对齐后的 Alloy 运行（2026-09-24）

**这一次对应改前的模型**（没有「谁可以使用它」滤），被上一节取代；原始输出仍在主检出 `tmp/formal-runs/asset-evaluation-v1-evaluation/` 与 `…-evaluation-2026-09-24/`，只作历史。下面照原样保留。

| 项 | 值 |
|---|---|
| 对象 | [`v1/formal/Evaluation.als`](v1/formal/Evaluation.als)，整批对齐落账本 S10-b 之后的内容（未冻结）；SHA-256 `a8e310edf6f5256de4650558c6fdcb4ede077228c63133be7f9a845c761ae39a` |
| 工具 | 本机 `/usr/local/bin/alloy` 6.2.0，`alloy exec -f -c '*' <file>` |
| 怎么跑的 | 把模型**复制到主检出 `tmp/formal-runs/asset-evaluation-v1-evaluation/`** 再跑（`alloy exec` 会在文件旁写输出目录，不在版本目录里跑）；变异体在同目录 `mutants/`；原始输出与回执留在那里，**未入库** |
| 判读 | `check` 行 `UNSAT` 读作**本范围内无反例**、`SAT` 读作找到反例；`run` 行 `SAT` 读作前件可满足（账本 S10-c） |
| 复跑 | 2026-09-24 整批对齐收尾时对同一 SHA-256 的文件复制到主检出 `tmp/formal-runs/asset-evaluation-v1-evaluation-2026-09-24/` 再跑（`alloy exec -f -o out Evaluation.als`）：十一条与下表逐条相同，退出 0；变异体未复跑 |
| 结果 | 全部十一条与预期一致，耗时约 10 秒；退出码 0： |

```text
00. run   fourLayerInstance                    SAT
01. run   replacementConstrained               SAT
02. run   pickSkipped                          SAT
03. check TeamAssetsStayInTree                 UNSAT
04. check LockTruncates                        UNSAT
05. check DisableIsDisjunction                 UNSAT
06. check WorkspaceNeverSourcesPermission      UNSAT
07. check WorkspaceNeverSourcesPlacement       UNSAT
08. check OfficialLowerBound                   UNSAT
09. check ReplacementCannotEscapePermission    UNSAT
10. check NonFittingPickNeverSources           UNSAT
```

**变异体**（[formal 入口](v1/formal/README.md#alloy)的非平凡核对；每个只改一处）：

| # | 拿掉什么 | 找到反例的断言 | 与预期 |
|---|---|---|---|
| M1 | `candidates` 的锁条件 | `LockTruncates` | 一致 |
| M2 | 禁用滤 | `DisableIsDisjunction` | 一致 |
| M3 | `permParticipating` 放进 `Workspace` | `WorkspaceNeverSourcesPermission` | 一致（2026-09-23 那次连带的 `ReplacementCannotEscapePermission` 不再触发：(vi) 现在只问带锁的配值在不在界里，工作区那一格加进参与不改变这一点） |
| M4 | fact `OfficialNeverDisabled` | `OfficialLowerBound` | 一致 |
| M5 | fact `InputHoldingsStayInTree` | `TeamAssetsStayInTree` | 一致 |
| M6 | `settingParticipating` 对落点类的滤 | `WorkspaceNeverSourcesPlacement` | 一致 |
| M7 | `permParticipating` 改回只看指向生效资产的持有 | `ReplacementCannotEscapePermission` | 一致 |
| M8 | `permFrom` 改回「参与的最里面那一格」，不问落不落在界内 | `NonFittingPickNeverSources`；同时 `run pickSkipped` 变 `UNSAT` | 一致；第二条是同一改动的连带（被跳过的那条挑选不再可能） |

**八个变异体全部退出 0**——这正是不登记的理由：退出码分不出「无反例」与「找到反例」。

**范围与局限**：

- 只在所列规模内无反例（`for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner` 等，逐条见 [formal 入口](v1/formal/README.md#alloy)），**不推广到任意规模**。
- 只核「值来自哪一格」与「生效的是哪一份」；**值本身不在模型**——「一条挑选落不落在界内」是给定的布尔，由 V-2、V-5 的场景兜住。
- (i) **在前提 PRE-2 之下**成立，它证明的是求值没有别的来路，不是前提本身。
- (vi) 与模型里 `permBounds` 的定义很近，它的价值在 M7：**把「按能力标识」钉进模型**，读法一旦退回按资产取权限就会被发现。
- 常驻值、「谁可以使用它」、落点设置的来处与工作区 stdio 默认禁用（[S-38](v1/contract.md#s-38-常驻值)～[S-40](v1/contract.md#s-40-落点与身份类设置的来处)、[S-17](v1/contract.md#s-17-第一步之一先按禁用滤) 第三条）**不在模型**，只由 V-2 兜。
- 2026-09-23 起草时那一次运行（SHA-256 `0ae640c2…`，九条命令、七个变异体）对应改前的 S-23，**作废**。

### 尚无的记录

规范场景 S-33～S-37、S-41、S-43、S-44，静态检查 SC-1～SC-3 尚无执行记录。首次执行时在此记录工具与版本、环境、输入范围、
可复现步骤与原始结果位置；原始产物归 [record/evidence/](../../../record/evidence/README.md)。

## 形式化工件

**选用 Alloy，不登记为 formal task。**[检查器只以退出码判成败](../../../registry/README.md#当前状态)，
而 `alloy exec` 找到反例照样退出 0（上节八个变异体即是实例）——登记它只会得到一个永远通过的任务。
映射、规模与盖不到的部分在 [formal 入口](v1/formal/README.md)。**`formal-tasks.json` 里本契约没有条目，这是有意的**，不是漏登。

## 独立评审

**第一轮**：spec-reviewer（只读），2026-09-24，基线 HUB `765b01dc`（批 R3：本契约与 `data.asset-model`、`capability.asset-governance`、`capability.asset-transfer`、`capability.organization-governance` v2 同批）。
处置按主线的修复简报（2026-09-24，裁定 K9、K30、K43、K44——已收进 [D-040 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)——与全局规矩 G1～G6）；**评审意见不代替接受**，本契约仍是 candidate。

| 发现 | 处置 | 落点 |
|---|---|---|
| B-1 / AE-1（S-16 ⑧「缺席或为空」与 `data.asset-model` S-24 相抵） | **改**：为空 ⇒ 没有配值；缺席 ⇒ ⑥ 的 `invalidInput` | [S-16](v1/contract.md#s-16-readworkspacecarrier) ⑥⑧ |
| B-2 / AE-2（S-4 末段把 loop_extension 的规则指到一条不存在的 S-12） | **改**：指向 `data.loop-extension/v1#S-40`（同批新增）；loop_extension 那一格随之有了规则，G-3 只剩 Agent Definition 与 plugin；skill-package 补 S-17。按本契约 S-4「各类正文契约按规则引用、不按坐标」的口径，这条不进 catalog（与其余五类的规则条款同） | [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 末段、[S-10](v1/contract.md#s-10-各类正文契约须供的两条规则)、[G-3](v1/contract.md#十一已知缺口) |
| AE-3（`workspace_immutable` 到不了） | **改**：删去；`FilterReason` 七值 → 六值；工作区的 `immutable` 只在读入时以 `immutable_flag` 丢，求值输入再带即 C1 | [S-8](v1/contract.md#s-8-求值结果-effectiveassembly)、[S-18](v1/contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断)、[S-24](v1/contract.md#s-24-工作区那一格在第四步只贡献设置) |
| AE-4（「只缺 `since`」没说配值上的那个） | **改**：持有与每条配值的 `since` 都由调用方以读到清单的时刻补 | [S-16](v1/contract.md#s-16-readworkspacecarrier) ⑤、[S-27](v1/contract.md#s-27-清单列的资产变成工作区那一格的持有)、[S-28](v1/contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕) |
| AE-5（依赖表、catalog、README 三处不一） | **改**：① `identity-values` S-15 从表里拿掉并写明它是资产流转的消费；② `mcp-endpoint` 补 S-4（并随动作集补 S-9、S-14、S-15、S-16），catalog 同改；③ hooks-import 那处写明「指路，不是依赖」；④ README 改为五项 | [S-4](v1/contract.md#s-4-依赖方向与被消费的面)、[S-17](v1/contract.md#s-17-第一步之一先按禁用滤)、[README](README.md)、catalog |
| AE-6（相邻依据 rev 落后） | **改**：按 changelog 复核到 PF-001 rev 17、PF-004 rev 12、PF-007 rev 18、PF-012 rev 14，复核结论写在页首——没有一条改本契约的规则（PF-001 rev 17 的界与挑选早已在 S-23；PF-004 rev 11/12 与 S-20、S-39 对上） | 契约页首「相邻依据」 |
| AE-7（(i) 被建模方式吸收） | **改**（主线预判：标按构造、收窄，不补否定配置）：(i) 两半都标「按构造，不作证据」；「只来自持有」改由 E-1 新的「多带一份定义」那一支作证，前提那一半归资产流转 S-9、S-44 | [formal/README](v1/formal/README.md) (i)、契约第七节两行、[S-32](v1/contract.md#s-32-本版选用哪些形式工件)、[S-33](v1/contract.md#s-33-四格齐全的一次求值) |
| X-1（「工作区自带资产」无词条） | **改**：按统一语言第四轮的结论不立新词，改用产品说法「工作区提供的资产」并链 [UL-workspace](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace) 注意 ⑦；S-9、S-25、S-27、S-28 标题随之改（锚点变了，本包内链接同改，包外无引用） | [S-9](v1/contract.md#s-9-工作区提供的资产) 等 |
| X-2（PRE-2 → 资产流转 S-9 不在 catalog） | **改为明写，不登记**：登记会成环（资产流转 → 资产治理 → 本契约 S-23）；页首「精确语义依赖」末条与 PRE-2 写明这是前提、不是消费，由资产流转第十二节列本契约为读者 | 页首、第七节 PRE-2 |
| 走查 (a)(b) | 不在本契约：调用主体与 S-45 覆盖声明归资产流转与组织治理 v2（同批各自处置） | — |
| 走查 (d)（工作区输入受 B-1、AM-2 影响） | **改**：随 B-1 与 `data.asset-model` 的 AM-2 一并写成同一句「每一种只在一处丢」 | [S-24](v1/contract.md#s-24-工作区那一格在第四步只贡献设置)、[S-28](v1/contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕) |

**本轮另落的主线裁定**：钉住动作集之后再求一次——输入加可选 `mcpActionSets`，输出里逐动作执行权限 `execute:<名>`（[S-6](v1/contract.md#s-6-求值输入-evaluationinput)、C13、[S-21](v1/contract.md#s-21-第三步投影)、[S-12](v1/contract.md#s-12-缺席时的默认答案)、PRE-8）；工作区格条目的丢弃阶段按种类写定（[S-24](v1/contract.md#s-24-工作区那一格在第四步只贡献设置)）。依据全部改引 D-040（页首），D-040 未收录的几条已报主线。

**第二轮**：spec-reviewer（只读），2026-09-25，基线 HUB `8ad37c50`（批 R3，发现表 `tmp/assets-runtimes/reviews/r2-R3.md`）；修复波 2 处置，主线裁定见 [D-040 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（M1～M29）。

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| B1（阻断，文字性） | S-8 末段、S-6 `mcpActionSets` 一行、第十二节注册表那一行把第二次求值写成只供逐动作执行权限、构成仍是装配那一次的，与 D-040 §六 L13、L15 及本契约 S-42 相抵 | **改**：三处写成「第二次求值供 `tool` 表每条条目的执行权限（含 `tenantAutoWritable`），以及判 `not_in_composition` 用的组合」，引 `capability.asset-registry/v1#S-11`、`#S-24` | [S-6](v1/contract.md#s-6-求值输入-evaluationinput)、[S-8](v1/contract.md#s-8-求值结果-effectiveassembly)、[第十二节](v1/contract.md#十二消费者核对) |
| B2（阻断，语义） | S-42 对 MCP `execute:` 项可为真，写面却对这一类项一律 `unavailable`——摆出一个写不进去的第四档 | **改**（[M5](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：`mcp` 逐动作项上 `tenantAutoWritable` 恒为假，直到资产治理 G-5 闭合；「与写面同一口径」限于 `tool` 的执行权限项；covers 那条 note 同改 | [S-42](v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗)；examples E-1；`registry/covers.json` |
| 应修 1 | L8 的配方比注册表 S-24 ② 窄，`standing`、`definitions`、`session` 取哪一刻两份契约列得不一样 | **改**（[M6](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：本契约不再列配方，S-6、S-8、第十二节只引 `capability.asset-registry/v1#S-24` ②（指路，不登依赖——那份契约消费本契约，反向登记会成环）。评审提到的 C9 风险（配方的定义版本与此刻的持有钉在更新的版本上）归那份契约的配方回答 | 同上三处；页首主线裁定一条 |
| 应修 2 | 租户那一格有对 `c` 的持有却不在效或指向另一份资产时，S-42 仍可为真 | **改**（[M7](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：第 4 条扩为「租户那一格若有对 `c` 的持有，它在效且指向 `A`，否则为假」；写面不判这一半，注明取更严 | [S-42](v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗) 第 4 条与「同一口径」一条；examples E-1 加一支；V-9 |
| 建议（页首缺 PF-008） | S-42 以 PF-008 §5.2 为依据，页首相邻依据没列 PF-008 及其 rev | **改**：相邻依据补 PF-008 rev 7 §5.2 | 页首 |
| （L7、L14 核对） | 评审核为已落 | 不改 | — |
| （M3 跨批，起草者自查） | [M3](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) 把拓展件干预力项的取值域收到声明档及其以下，并写「asset-evaluation S-23 不改」；但 S-23 认干预力的判据是「取值域**恰是**三档」，声明 `rewrite` 的件（取值域 `observe`、`rewrite`）会从此不被认作分档权限，落档与「挑选恰一档」都不再适用 | **改一句认法，不改求值规则**（推导，已报主线）：S-23 与 S-4 表改为「取值域是干预力三档里含 `observe` 的非空子集」即干预力；界、挑选、合成与档序一字不动。读 M3 的「S-23 不改」为求值规则不改 | [S-23](v1/contract.md#s-23-第四步权限) 分档那一段；[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 表 `data.loop-extension/v1#S-4` 一行 |

**对证据的影响**：Alloy 模型不含 `tenantAutoWritable`、也不含第二次求值的输入怎么组（[formal 入口](v1/formal/README.md)），本轮改的三处都不进模型，`Evaluation.als` 未改，**不重跑 Alloy**；V-9 的规范场景多两支（`mcp` 恒假、`h6` 被禁用），仍未开始。

## 变化的影响

- **2026-09-23 本轮（起草中途）：施工简报追加第 7 条裁定，原地改了候选。**
  - 权限的第 4 步从「按资产求界、由里到外取第一格与界相交的」改为**按能力标识跨层取交集**：组织、租户两格的在效持有不论指向哪份资产都给约束；
    声明默认值降为作者建议；替换件缺的项取最严（[S-23](v1/contract.md#s-23-第四步权限)）。
    工作区自带资产的最严值由「`from` 固定为出厂」改为「出厂那一格的约束」，组织、租户、会话的约束照常收窄它（[S-25](v1/contract.md#s-25-工作区提供的资产的权限项一律取最严值)）。
  - 输入加 `standing`（[S-6](v1/contract.md#s-6-求值输入-evaluationinput)、C12）；版本选用由持有的 `versionSelection` 定（C9 改写，覆盖每份在效持有）；C10 改为按配值所在持有的资产核域。
  - [E-1](v1/examples.md#e-1-四格齐全的一次求值)：`h9` 的执行权限改为 `{问一下, 自动}`，`mcp:github / action.search.execution` 的 `from` 由 `factory` 变为 `tenant`；
    [E-4](v1/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 三支重写（加了一项替换件没有的 `network`）；E-5 加第 8 份（C12）。
  - `Evaluation.als`：`participating` 拆成 `settingParticipating` 与 `permParticipating`，`permFrom` 去掉「工作区自带资产固定为出厂」一支，加断言 (vi) 与 `run replacementConstrained`。
    **此前那一次 Alloy 运行（改前的模型）作废**，本页上节是改后的重跑；变异体按新模型重跑，M3 的含义随之改变（原先有两道独立的守，现在只剩一道）。
  - 新缺口 G-15、G-16、G-17；G-2、G-7、G-8 改写。
- **2026-09-24 整批对齐（简报 S23；主线裁定 2026-09-23，待产品负责人确认）：原地改了候选。**
  - [S-22](v1/contract.md#s-22-第四步设置)：设置按资产取值，不跟随同标识的替换件（账本 S10-a，G-17 闭合）。
  - [S-23](v1/contract.md#s-23-第四步权限)：只有带锁的配值是界，不锁的配值与声明默认值是挑选，由里到外取第一条落在界内的挑选（空集挑选也算落在界内——推导，已报主线）；产品原话表第 4、5 行的值与来处随之改（账本 S10-b，G-16 闭合）。
  - `dropped` 只留两种理由（S10-d，G-5 闭合）；「禁用先于锁」不改（S10-e）；前提编号改 `PRE-n`（S10-f）；`data.asset-model` v1 按条款号登依赖（G-12 闭合）；G-2、G-7、G-10、G-11 闭合，G-3、G-4、G-6、G-15 收窄。
  - 新条款 [S-38](v1/contract.md#s-38-常驻值) 常驻值、[S-39](v1/contract.md#s-39-谁可以使用它值与判定) 「谁可以使用它」、[S-40](v1/contract.md#s-40-落点与身份类设置的来处) 落点设置的来处；[S-17](v1/contract.md#s-17-第一步之一先按禁用滤) 加工作区 stdio 接入点默认禁用（账本 S19-c）；新缺口 G-18、G-19。
  - [E-1](v1/examples.md#e-1-四格齐全的一次求值) 的 `assets` 加 `version`／`resident`／`usable` 三列、`values` 加两行 `usableBy`、凭据未配时那一项缺席、落点设置带 `provenance`；[E-4](v1/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 组织格的 `network` 改为带锁、三支的期望按界与挑选重写。
  - `Evaluation.als`：加 `Fits`／`Values`／`permBounds`、fact `BoundsFitUnlessEmpty`，`permFrom` 改为「第一条落在界内的挑选」，加断言 (vii) `NonFittingPickNeverSources` 与 `run pickSkipped`；(vi) 改为「带锁的外层配值在界里」。**2026-09-23 那次运行作废**，V-1 按新模型重跑（[上节](#已作废整批对齐后的-alloy-运行2026-09-24)），变异体加 M8。
  - 消费者：`capability.asset-registry` 读 `version`／`resident`／`usable`（它的 G-5 随之闭合）；`capability.mcp-bridge` 读 `provenance`（它的 G-9）。
  - **同轮稍后（资产治理与流转对齐）**：PRE-2 写明租户格以 `organization` 支持有被分享记录的那份随分享一起判（账本 S11-G2，`data.asset-model` S-19 同轮改）；E-1 会话格那条配值补 `since`（`data.asset-model` S-14 加的必填成员）。规则与 Alloy 模型不受影响。
- **`data.asset-model` 下一版**若改 `HoldingBasis` 的支或 `versionSelection`，核 C8、C9 与 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 列的条款号，重登 catalog。
  本契约仍是 candidate，**未冻结之前原地改并在此记录**；冻结之后发布新版本。
- **跨进程演化**（[G-14](v1/contract.md#十一已知缺口)）：[S-29](v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) 的「装配给」各行转为「协议给」，**语义边界改变，须发布新版本**；本版的全部证据只保留其单机范围。
- **（2026-09-24 整批对齐收尾，不改语义）**：前提表 PRE-4 的「谁给」一格加指路——出厂持有与 meta 锁由资产治理 S-29 官方件登记写出（`data.asset-model` S-20 已改为出厂格 `immutable` 当且仅当 meta，与 PRE-4 不再相抵）。不登依赖。

- **2026-09-24 随 `data.asset-model` S-36 八类（主线裁定 G-14；候选未冻结，原地改）**：「谁可以使用它」由 `skill`、`mcp`、`slash_command` 三类扩到八类——[S-25](v1/contract.md#s-25-工作区提供的资产的权限项一律取最严值) 表那一行、[S-39](v1/contract.md#s-39-谁可以使用它值与判定) 首句、`EffectiveAsset.usable` 的定义、消费者核对表那一行改措辞；S-39 的 `usable` 判定表加 **official 恒为 `true`**（PF-002 §5.2「official 那一份不受它管」，`data.asset-model/v1#S-36` 第 2 条把「求值怎样对 official 跳过」交给本契约——**这一行是随同步补的，报主线确认**）。
  `examples.md`：开头那条改八类；E-1 的 `assets` 里 `agent_definition:assistant` 的 `usable` 为 `true`（official）、`tool:shell` 的为缺席（G-15），`values` 十一条 → 十三条（加两条 `usableBy`），附表加第 13、14 行、「核对要点」的行号与计数同改；E-2a 的 `values` 加 `agent_definition:helper` 那条保留项、它的 `usable` 为 `true`。**Alloy 模型不涉**（它不建 `usableBy`），formal task 不重跑。
  **未改、已报主线**：PF-002 rev 19 §5.6 第 1 步把「谁可以使用它」滤放在组装之前（「判下来不能用的不装」），与本契约 S-39「判为不可以用的仍在组装里」相左；G-15（`self` 指谁）已由 PF-002 rev 19 §5.2 答为「作者本人」，本契约仍记为缺口。


- **2026-09-24 随 PF-002 rev 19 对齐第一步三小步（主线派发；候选未冻结，原地改）**：
  - **头部产品依据** PF-002 rev 16 → **rev 19**，按 changelog rev 17→20 逐条核过；rev 17 的两条 §5.3 规则（配成「禁止」锁不锁都是界；没挑到界内的取最近一档）、§5.7 命令型 hook 默认不启用、G-13 的产品答案，以及 rev 20 §5.7 的治理类项，**未吸收**，登为新缺口 [G-20](v1/contract.md#十一已知缺口)（G-13 改写为「产品已答、未吸收」）。
  - [S-39](v1/contract.md#s-39-谁可以使用它值与判定) 重写为**第一步之二**：`self` 在自定义件上指作者本人（作者 `TenantId` 等于输入的 `tenant`）、在工作区自带资产上指挂上工作区的租户；official 不判；用不了的持有以新的 `FilterReason` 值 **`not_usable`**（本契约拟名，账本无，已报主线）退出替换次序、它的锁不起作用、标识退回下一层；值的参与者是过了禁用滤的组织、租户持有与会话格，**不看锁截断**（推导：否则成环）；会话中途收回写成「下一次运行起按那一刻的输入重求，已开始的运行不换」，时点由消费者兑现。**原 G-15 关闭**。
  - **`EffectiveAsset.usable` 删去**（[S-8](v1/contract.md#s-8-求值结果-effectiveassembly)）：在 `assets` 里的就是用得了的；「判为不可以用的仍在组装里」那句删去；[S-12](v1/contract.md#s-12-缺席时的默认答案) 那一行（`usable` 缺席）删去。
  - `FilterReason` 五值 → **六值**；[S-26](v1/contract.md#s-26-每份持有都有去处) 加一行（被这一滤滤掉的持有，其权限配值在效时照常作用），「没有第六种去处」→「第七种」。
  - [S-23](v1/contract.md#s-23-第四步权限) 的「在效」改写为「没被禁用、且不在锁以里指向另一份资产」，**被 `not_usable` 滤掉的照同一条判、仍在效**（推导：否则会话格挑一个空集就能甩掉外层锁下的执行权限）；C9 改为引它。
  - [S-18](v1/contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断) 标题「第一步之二」→「**第一步之三**」（锚点随之改；本包之外 `data.asset-model` 契约里那一处链接同改）；第五节开头加三小步次序说明；[S-17](v1/contract.md#s-17-第一步之一先按禁用滤)、[S-19](v1/contract.md#s-19-官方件是下界)、[S-20](v1/contract.md#s-20-第二步组装)（「谁可以使用它」是唯一在第 1 步起作用的权限项，引 PF-004 rev 12 §6.5）、[S-25](v1/contract.md#s-25-工作区提供的资产的权限项一律取最严值)（最严值 `{self}` 在第一步就用）改措辞；第七节加三行安全性质；新规范场景 **[S-41](v1/contract.md#s-41-判下来用不了的退回下一层)**；消费者核对两行改写。
  - `examples.md`：开头那条改写；E-1 定义表加作者（组织那份 `skill:audit` 的作者是 `acc_alice`，所以结果不变）、`assets` 删 `usable` 列并加一段第一步之二的说明；E-2a 删 `usable`；附表第 6 行改为「锁以里的 `h8` 照样参与」；**新 E-6 六支**。
  - `Evaluation.als`：加 `Unusable`（判定作给定）与 fact `OfficialNotJudged`、`JudgedPerAsset`，`surviving` = 过了禁用与这一滤，新 `inEffect` 供 `permParticipating`，加断言 (viii) `UnusableNeverEffective`、(ix) `UnusableKeepsBounds` 与 `run usableByFallback`、`run unusableConstrains`；**2026-09-24 那次运行作废**，V-1 按新模型重跑，变异体 M1～M8 重做、加 M9～M11（[那一节](#已作废第一步三小步之后的-alloy-运行2026-09-24b)，已被 2026-09-24c 取代）。
  - **消费者**：`capability.asset-registry` v1 的 S-20 第 2、5 条与 G-5 读已删的 `EffectiveAsset.usable`，且它「新得到的等 reload、只收窄」与「下一次运行起按此刻求值装入、退回下一层」要对一遍——**未改那份，已报主线**；`data.asset-model/v1#S-36` 第 1 条原指向本契约 G-15，同轮改指 S-39。

- **2026-09-24 吸收 PF-002 rev 17～20（主线派发；G-20、G-13 关；候选未冻结，原地改）**：
  - 头部产品依据 rev 19 → **rev 20**；新依赖 `data.tool-definition` v1（S-15 执行权限三档）与 `data.loop-extension` v1（S-4 干预力三档、S-8 外部命令），[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 加一节、catalog 加两条依赖。
  - [S-23](v1/contract.md#s-23-第四步权限)：执行权限上配成恰 `{forbid}` 的配值**锁不锁都是界**（`lockedAt` 照此取）；**界不同时是挑选**——原先「带锁的那条同时也是这一格的挑选」删去（产品「往外找第一个落在界内的挑选，是作者的默认」要求如此；那一句是 2026-09-24 整批对齐时的推导，本轮改判，已报主线）；
    **分档的权限**（取值域恰是执行权限三档或干预力三档的，档序由宽到严 `auto`→`ask`→`forbid`、`veto`→`rewrite`→`observe`）没有挑选落在界内时取界内离最具体那条挑选最近的一档、一样近取严；产品原话表改两行、加两行；[G-9](v1/contract.md#十一已知缺口) 收窄。
  - [S-17](v1/contract.md#s-17-第一步之一先按禁用滤)：工作区自带的命令型拓展件与 stdio 接入点同列默认禁用，G-19 扩到两样；从别家导入的工作区来源 hook 落为租户格禁用（`capability.hooks-import/v1` S-9），只指路。
  - [S-24](v1/contract.md#s-24-工作区那一格在第四步只贡献设置) 加治理类一行、`FilterReason` 六值 → **七值**（`workspace_governance`，本契约拟名，已报主线）；[S-12](v1/contract.md#s-12-缺席时的默认答案)、S-16、S-28 同步；治理类项没有作者默认时各格没配就是缺席。
  - [S-20](v1/contract.md#s-20-第二步组装)：plugin「启用哪些成员」在第 2 步就地求值、没启用的成员不进可达集合也不进 `unresolved`；斜杠命令的绑定目标是命令本身；G-13 关，G-3 注明这一项仍等 plugin 的属性项。
  - S-32、[S-36](v1/contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)（三支 → 五支）、第七节加三行安全性质、消费者核对「准入判断」一行改为大半够。
  - `examples.md`：E-1「改一项权限」那一支加 `lockedAt = tenant`（`{禁止}` 是界）；**E-4 A、B、C 执行权限的 `from` 由 organization 改为 factory**（界不再同时是挑选，作者默认落在界内），加 D（不锁的「禁止」）、E（界内没人挑到取最近一档）两支；E-6 F 支的说法；附表记号。
  - `Evaluation.als`：见[上节](#已作废吸收-pf-002-rev-17-到-rev-20-之后的-alloy-运行2026-09-24c)（2026-09-25 起它也作废，见其上一节）；2026-09-24b 那次作废。
  - **消费者**：`capability.asset-governance` 写入面「拒绝写界外的值」要认不锁的 `{forbid}` 也是界；`data.connector` 的推出规则要产出治理类的触发会话默认运行模式、且不带 `default`（`data.asset-model` S-12、S-13 同轮改）；`capability.asset-registry` 同轮改读 `assets` 而不是 `usable`。都已报主线或同轮落。

- **2026-09-24 修订第二轮（主线裁定 R2-8、R2-11、R2-12、R2-15；候选未冻结，原地改）**：
  - **R2-12 前提 PRE-2 对齐 `capability.asset-transfer/v1#S-9` 的三个合取项**（[第七节前提](v1/contract.md#前提由别人兑现本契约不检查)）：被分享来的持有在**组织格或租户格**（接收方是租户：组织内分享、本人型分享——`data.asset-model/v1#S-19` 同轮放开）；此刻可用 ⇔ 有一份分享 s 对得上（资产、被分享方就是那一层）且 记录 `active` ∧ 关系此刻成立 ∧ 关系自确认以来未断过（不复活）；读不到任一项以**不可用**收场。**原 PRE-2 的「分享方与被分享方此刻仍有共同上级」是错的**：它把个人—个人、个人→团队与组织内分享（同一个组织，不求边界）都判成不成立，又漏了成员退出与「断过再接上」——本轮随 R2-12 一并改正（推导，已报主线）。
    头部相邻依据 PF-003 rev 4 → **rev 5**（加 §4 分享）；第七节不变量「团队资产不出那棵树」改写为求值一侧的投影——所有者是 **PRE-2 容许的所有者**（租户所在的组织、租户自己、此刻生效的分享的分享方），不再是「在租户那棵隶属树内」；[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的 `#S-15`、`#S-19` 两行改措辞（S-15 仍被 PRE-2 经分享边界引用，catalog 那一条不动）。
  - **R2-11**：[S-24](v1/contract.md#s-24-工作区那一格在第四步只贡献设置) 加一段——那三类工作区配值没有写入面可拒，`data.asset-model/v1#S-20` 把它们写成「不是 `malformed`、不参与求值」，本条就是那道过滤；E-1 的 `h10` 照旧。**FilterReason 不加新值**：`workspace_permission`、`workspace_placement`、`workspace_governance` 三个已经够用。
  - **R2-8**：`workspace_governance` 由「本契约拟名、已报主线」改为账本名（[S-8](v1/contract.md#s-8-求值结果-effectiveassembly) 那一行）。
  - **R2-15**：只保留 V-8 那句注（已在），[S-31](v1/contract.md#s-31-unresolved-交到装配手上怎么收场) 不动。
  - **Alloy 不重跑，理由**：本轮对模型只有一处**读法**变化——`TreeOwner` 由「租户那棵隶属树里的所有者」改读为「PRE-2 容许的所有者」。模型里 `TreeOwner` 本来就是 `Owner` 的一个**给定子集**（`sig TreeOwner in Owner {}`），前提 `InputHoldingsStayInTree` 与断言 (i) 都只说「在这个子集里」、从不算它怎么来；换一种算法得到的仍是一个给定子集，**断言、fact、范围与变异体的语义都不变**。`Evaluation.als` 一个字节未改（SHA-256 仍是 `4a79c2f9…126a`），2026-09-24c 那次运行继续对应它；改读写在 [formal/README](v1/formal/README.md) 的语义映射表（`TreeOwner` 一行）与 (i) 一行，名字与 `.als` 里的两行注释沿用旧说法，**不为改注释而动模型文件**（动了就要重跑、换证据）。模型盖不到的——三个合取项、「不复活」——本来就不在本模型，归 `capability.asset-transfer` 的 TLA+ 模型与本契约的前提。
  - **（同轮追加，主线派发）PRE-2 认 S-9 的读序**：「谁兑现」一栏写明组输入的一方先判关系与有效性（边界、上级链、租户端有效）、再读时刻（隶属建立时刻、成员关系生效时刻），反过来读会让一次解除—重新接上落在两读之间而复活；单机一次可串行化的读即满足。顺手删去「那份契约的 G-11 闭合之前……都在这里收场」一句——那份契约的 G-11 已随组织治理 v2 的两个读面关闭。Alloy 仍不涉（读序不在本模型）。
  - **对消费者**：组输入的一方（`capability.asset-registry` 与装配）按 asset-transfer S-9 读，没有新的形状；`capability.asset-transfer` 的 S-9 是被转述的一方，本契约**仍不登它为依赖**（兑现处在组输入，不在本契约）。

- **2026-09-24 独立评审第一轮（[处置表](#独立评审)；候选未冻结，原地改）**：
  - **输入与输出**：`EvaluationInput` 加可选 `mcpActionSets`（`McpActionSet { endpoint, scope, actions }`）与 C13（只收 `fetched`）；[S-21](v1/contract.md#s-21-第三步投影) 写 `mcp` 规则二的第二个输入与「`execute:` 起头的项按项名认种类」（推导，已报主线）；[S-12](v1/contract.md#s-12-缺席时的默认答案) 加一行、S-15 ⑦ 缓存键加它、PRE-8、消费者核对加注册表钉住之后那一行。
    **`FilterReason` 七值 → 六值**（删 `workspace_immutable`）。**兼容性**：候选期，没有被采用的实现；消费者里读 `FilterReason` 穷举的（注册表、设置页）少一个分支，读输入的（注册表、装配）多一个可选成员。
  - S-16 ⑧ 缺席 ⇒ `invalidInput`；S-16 ⑤、S-27、S-28 写明配值的 `since`；S-18 第 1 条、S-24 表改写；S-24 与 `data.asset-model` S-20、S-24 第 5 条同一句。
  - S-4 末段、S-10、G-3 改指 `data.loop-extension/v1#S-40`（G-3 的 loop_extension 那一格随之闭合）；S-4 身份值表 11 → 10 条、接入点表 1 → 6 条（catalog 同改）；页首依据全部改引 D-040 或产品正文，账本编号删去；相邻依据 rev 复核到当前（结论在页首）。
  - 「工作区自带资产」→「工作区提供的资产」，S-9、S-25、S-27、S-28 标题改（锚点变了；本包的 examples、verification、formal/README 同改，包外没有引用）。
  - `examples.md`：E-1 输入加 `mcpActionSets`、MCP 的四个项名改用 `data.mcp-endpoint` S-14 的真名（`connectionTarget`、`callTimeout`、`execute:search`、`execute:push`）、附加支加两支；E-3 的项名同改；开头读法边界那一条改写。
  - **Alloy 不重跑，理由**：本轮对模型没有语义变化。① (i) 只是**判读**改为「按构造」，断言与 fact 不动；② 工作区那一格的锁在合法输入里不再出现——模型仍容许它、照旧不算，是更宽的输入空间，断言在收窄后照样成立；③ 逐动作项只是生效资产「声明了哪些项」多一个来源，模型把声明当给定。`Evaluation.als` 一个字节未改（SHA-256 `4a79c2f9…126a`），2026-09-24c 那次运行继续对应它；两行注释里的「S-24」沿用旧说法，写在 [formal/README](v1/formal/README.md) 语义映射表。
  - **对消费者**：`capability.asset-registry` 的 `refreshAvailability` 在钉住后发起这次求值、把 `execute:*` 与每个接入点的持有钉进报告（同批由它写）；`capability.tool-admission`、`capability.tool-execution-runtime` 从那份报告读；`capability.mcp-bridge` 的 S-5「`scope` 由求值结果的 `from` 得出」不变。

- **2026-09-25 修复波 1b（候选未冻结，原地改）**：裁定出处 [D-040 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（L7、L8、N-7、N-8）。
  - **L7**：新条款 [S-42](v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗)——`values` 里每条执行权限项另带布尔 `tenantAutoWritable`（租户那一层此刻写不写得进一条不带锁的「自动」）；四条判据：生效资产声明了这一项、不是工作区提供的资产、组织那一格的界含「自动」、租户那一格没锁住这一项。第 3 条「不论组织那份持有在不在效」是**本契约推导**（取写面 `lockedAbove` 的口径，分叉时取严），已报主线。`EffectiveValue` 形状加可选成员（[S-8](v1/contract.md#s-8-求值结果-effectiveassembly)）；S-32 表、S-33、S-36 的必须观察、消费者核对加一行；examples E-1 加真假两种与「`h6` 带锁」一支、E-4 注五支皆假；上表加 V-9。`capability.tool-admission` v1 的 G-14 随之闭合（那份契约同轮改），`capability.loop-extension-runner` v1 S-29 第 5 条组装时带上。
  - **L8**：[S-6](v1/contract.md#s-6-求值输入-evaluationinput) `mcpActionSets` 一行、[S-8](v1/contract.md#s-8-求值结果-effectiveassembly) 末段与消费者核对里注册表那一行，二次求值的措辞由「以装配那一次的输入」改为「沿用装配那一次的配方（`root` 与 `workspace`），持有与配值取此刻的」（K30 的读法）。
  - **引用补齐**：页首「2026-09-23 的另几条追加裁定」由「D-040 尚未收录」改链 §六 N-7；[S-21](v1/contract.md#s-21-第三步投影) 末段「按项名认种类」改为主线接受（N-7）；[S-24](v1/contract.md#s-24-工作区那一格在第四步只贡献设置) K44 一句改链 §四（R3 落法取代「读入时丢弃」）；页首加修复波 1b 一条。PRE-2 里「租户格以 `organization` 支持有同一份被分享记录」一句当时仍写「D-040 尚未收录」，已报主线，同轮由 N-11 追认（见下一条）。
  - **L3 引用清理**：本包没有 `targetEnvironment` 的引用，无改动。
  - **registry**：catalog 本契约的依赖不变（S-42 只读已消费的 `data.tool-definition` S-15、`data.mcp-endpoint` S-14、`data.asset-model` S-19）；covers 加一条 PF-008「第三档和第四档各有约束」→ S-42；formal-tasks、id-namespaces 不变。
  - **同轮追加（主线回裁）**：[D-040 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) L13、L14、N-11、N-12。**L14**：S-42 的三条推导（第 1、2 条与第 3 条「不论在不在效」）主线接受——「推导」字样保留、补链 L14；「租户格无持有时第四档怎样落地」并入 `capability.tool-admission` 的 G-2，S-42 末段与消费者核对那一行改指。**L13**：S-42 写明这一位经会话资产注册表每次尝试的可用性报告交到 runner（`capability.asset-registry/v1#S-11` 同轮扩到全部工具条目）。**N-11**：PRE-2 里租户格以 `organization` 支持有被分享记录那一句由「D-040 尚未收录」改链 N-11。**N-12**：[G-6](v1/contract.md#十一已知缺口) 补一句——闭合时读入工作区承载清单那条路也要判 `name_not_projectable`。catalog、covers 不因此变。
  - **对证据的影响**：Alloy 模型不含 `tenantAutoWritable`，也不含二次求值的输入怎么组（[formal 入口](v1/formal/README.md)已补一条盖不到），`Evaluation.als` 未改，**本轮未运行 Alloy**；规范场景全部未开始，V-2、V-5、V-9 首次执行按新内容。

- **2026-09-25 第二轮独立评审的处置（修复波 2；候选未冻结，原地改）**：逐条见[独立评审](#独立评审)第二轮。
  **语义改变**：[S-42](v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗) 收紧两处——`mcp` 逐动作项上 `tenantAutoWritable` 恒为假（M5）；租户那一格有持有却不在效或指向另一份资产时为假（M7）。放行判断因此在这两种情形下不再摆出第四档。**表示不变**：成员与取值集合未动。
  **认法放宽一处**（M3 的对齐，推导）：干预力按「取值域是三档里含 `observe` 的非空子集」认，声明低于 `veto` 的拓展件照样分档；求值规则不变。
  **措辞改正、不改计算**：第二次求值的用途与配方的归属（B1、M6）——本契约是纯函数，第二次求值与第一次同一套规则，改的只是对注册表怎样用它的转述，现在只引注册表。
  **对消费者**：`capability.tool-admission` 读这一位出卡，照旧；`capability.asset-registry` 的 S-24 ② 从此是配方的唯一家（丁同轮）；`capability.asset-governance` 的 G-5 闭合时本条那一段随之改。
  **registry**：catalog 依赖不变（指向注册表的是指路，不登）；covers 的 PF-008 → S-42 那条 note 改写（M5）。

- **2026-09-25 修复波 3（实现映射反推；候选未冻结，原地改）**：逐条见下节[实现映射反推](#实现映射反推2026-09-25)。**语义改变**：输入 `root` 的形状、`composition` 不再含根、`evaluate` 的失败集合由一个值变为三个；**`Evaluation.als` 改了、重跑了**（[上节](#已执行组合根只作身份之后的-alloy-运行2026-09-25)）。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-001／PF-003／PF-004），不在这里改契约。

## 实现映射反推（2026-09-25）

起因：realization-drafter 戊起草 `packages/core/asset-evaluation` 节点时报回的 AE-1、AE-2 与其后第二次报回；主线裁定见 [D-040 §八 M31、M32、M45](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)。**裁定不代替接受**，本契约仍是 candidate。

| 裁定 | 落点 | 本契约推导的部分（已报主线） |
|---|---|---|
| **M31** `root` 改为组合根引用集 `{ definition, references }`，`definition` 只作身份、记进结果；第 2 步从 `references` 起；G-3 收窄 | [S-6](v1/contract.md#s-6-求值输入-evaluationinput) `root` 一行（`AssetReference { capability, resident? }`，`references` 必需、可为空）；C2 改认 `root.definition`、**新 C14**；[S-8](v1/contract.md#s-8-求值结果-effectiveassembly) 加成员 `root`、`composition` 不含根；[S-10](v1/contract.md#s-10-各类正文契约须供的两条规则) 末段；[S-12](v1/contract.md#s-12-缺席时的默认答案) 两行（`root.references` 缺席、根自己的属性项）；[S-15](v1/contract.md#s-15-evaluate) ②⑦⑧（PRE-9、缓存键）；[S-20](v1/contract.md#s-20-第二步组装) 首段与结果表；[S-38](v1/contract.md#s-38-常驻值) 第 1 条改读输入；第七节 PRE-9；S-29、S-32、S-33、S-37；[G-3](v1/contract.md#十一已知缺口) 收窄；**新 [G-21](v1/contract.md#十一已知缺口)**；第十二节两行；examples E-1～E-6 的 `root` 与期望、E-5 加两份；`Evaluation.als` 第 2 步 | ① 结果里记根的成员名取 `root`（裁定只说「记进 `EffectiveAssembly`」）；② **根不进 `composition`，它的属性项因此不投影**——PF-002 §5.2「某个 Agent Definition 的『默认模型』」这类设置本版没有值（G-21 ①）；③ 根没有生效资产（被禁用、用不了、没人持有）时它自己进 `unresolved`、`referencedBy` 缺席、不往下走；④ C14（引用列表里同一标识至多一条、常驻标记只在 tool、skill 上）；⑤ `AssetReference`、「组合根引用集」都**无词条**，按裁定原文用 |
| **M32** 失败集合加 `compositionCycle`，带环上的能力标识序列；G-1 关 | [S-15](v1/contract.md#s-15-evaluate) ⑥ 与其后一段（哪些环算、判在第 1 步之后、诊断 `cycle`、本版判得到的环只有根指回自己）；[S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段；[S-11](v1/contract.md#s-11-纯计算) 诊断的例外；S-20、S-31 各一条；第七节一行；**新 [S-43](v1/contract.md#s-43-成环即拒并指出环在哪)／E-7／V-10**（戊报回「S-43 缺证据义务」即此） | ① Skill⇄Tool 互引不算环照 PF-002「谁能组合谁」规则 2 原话，引用列表出现根自己算环；② 有几个环时报哪一个不承载含义（S-11 的例外）；③ 与 `invalidInput` 同时成立报 `invalidInput` |
| **M45** 失败集合再加 `categoryUnsupported{category}`；G-3／G-21 保持开着，闭合时删此值 | [S-15](v1/contract.md#s-15-evaluate) ⑥⑧ 与其后一段；[S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段与判定次序；[S-12](v1/contract.md#s-12-缺席时的默认答案) 那一行改指它；S-10、S-11、S-20 两条、S-31、S-38 末段、第七节一行、S-32、G-3、G-21、第十二节两行；**新 [S-44](v1/contract.md#s-44-读不了正文的一类即拒)／E-8／V-11**；SC-3 扩到三个失败值 | ① **与 `compositionCycle` 同时成立报 `compositionCycle`**（判出来的先于判不出来的；E-7 A、E-8 D）；② `category` 走到几类时报哪一类不承载含义（S-11 的第二处例外）；③ 只在**走到有生效资产的**那一类时触发——被禁用、求不出、只被持有不在组合图上的不触发（E-8 C）；④ 本版 S-38 第 2 条与 G-18 因此到不了 |

**对证据的影响**：`Evaluation.als` 第 2 步三个定义改了（M31），断言、fact、命令未动；V-1 按新文件重跑一次，十八条与十三个变异体与预期一致（[上节](#已执行组合根只作身份之后的-alloy-运行2026-09-25)），2026-09-24c 那次作废。M31 的三处改动**按构造，不作证据**；M32、M45 的失败值不建模，证据是新的 V-10、V-11（未开始）。

**对消费者**：`capability.asset-registry`（fill 与 `refreshAvailability` 组输入要带 `root.references`，配方 S-24 ②；求值失败时多了两个值要透传）——同批由癸落；`capability.asset-governance` G-6 ③ 说的就是 `compositionCycle`，那份契约改引归它（已报主线）；装配（PF-004 的契约，尚无）读 `root`、拿到两个新失败值即明确失败；`packages/core/asset-evaluation` 节点由戊对齐，不在本轮写权限内。

**registry**：catalog 本契约的依赖不变（`root.references` 是调用方给的输入，没有新消费的条款）；covers 加一条 PF-002 flows §二「成环」→ S-15、S-20、S-31（规范场景 S-43 按口径不登）；PF-002「谁能组合谁」加 S-13、S-15、S-20（G-1 关）、§5.1 改注；PF-004 §6.1 不变式加 S-12、S-15（M45 性质表新行以 I-9 为来源）；PF-006 §6.1 加 S-7（C14）；PF-002 plugin 那一条改注（G-3 → G-21，展开到 plugin 即 `categoryUnsupported`）；本契约条目由 40 到 41；formal-tasks、id-namespaces 不变（Alloy 仍不登记）。
