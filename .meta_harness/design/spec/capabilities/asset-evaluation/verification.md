# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：规范场景与静态检查未开始；Alloy 模型 2026-09-24 整批对齐后重跑一次，原始输出在主检出 `tmp/formal-runs/`，未登记为 formal task。**
> `capability.asset-evaluation` v1 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **五条规范场景（S-33～S-37）一条都未执行**——文件存在不代替结果。
> Alloy 那一次的判读、范围与局限见[下节](#结果与反例)；它只支持[契约第七节](v1/contract.md#七性质与前提)标了 Alloy 的那几行，**且只在所列规模内**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **结构性质 (i)～(vii)**：团队资产不出那棵树、锁截断、禁用析取、工作区滤权（权限与落点类）、官方件下界、换了实现逃不出外层对这个能力标识锁下的界、与界不交的挑选不给出值 | Alloy：[`Evaluation.als`](v1/formal/Evaluation.als) 的十一条命令 ＋ 八个变异体 | [S-17](v1/contract.md#s-17-第一步之一先按禁用滤)～[S-19](v1/contract.md#s-19-官方件是下界)、[S-22](v1/contract.md#s-22-第四步设置)～[S-25](v1/contract.md#s-25-工作区自带资产的权限项一律取最严值) 的「来自哪一格」那一面 | **2026-09-24 执行一次，未登记**（[下节](#已执行整批对齐后的-alloy-运行2026-09-24)） |
| V-2 | **四格齐全的一次求值**（[S-33](v1/contract.md#s-33-四格齐全的一次求值)）：五个集合与 [E-1](v1/examples.md#e-1-四格齐全的一次求值) 逐项相等；同一输入重放；改一项权限只动那一项的值 | 规范场景演练，**同一次演练比对全部五个集合** | [S-8](v1/contract.md#s-8-求值结果-effectiveassembly)、[S-11](v1/contract.md#s-11-纯计算)、[S-17](v1/contract.md#s-17-第一步之一先按禁用滤)～[S-26](v1/contract.md#s-26-每份持有都有去处) | **未开始。**需要一个实现；且第 2 步要 Agent Definition 的两条规则（[G-3](v1/contract.md#十一已知缺口)），闭合前只能以 examples 里「给定的正文」替身跑。**凭据那一条（E-1 第 1 件事）必须真核**：它失败的形态是外泄，不是报错。2026-09-24 起五个集合里的 `assets` 多了 `version`、`resident`、`usable` 三列、`values` 多了落点设置的 `provenance`，同一次演练一并比对 |
| V-3 | **先禁用后替换**（[S-34](v1/contract.md#s-34-先禁用后替换)）：[E-2a、E-2b](v1/examples.md#e-2-先禁用后替换) | 规范场景演练 | [S-17](v1/contract.md#s-17-第一步之一先按禁用滤)、[S-18](v1/contract.md#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) | **未开始** |
| V-4 | **清单读入的留痕**（[S-35](v1/contract.md#s-35-清单读入的留痕)）：[E-3](v1/examples.md#e-3-一次清单读入)，并与 E-1 连起来看 | 规范场景演练 | [S-16](v1/contract.md#s-16-readworkspacecarrier)、[S-27](v1/contract.md#s-27-自带资产变成工作区那一格的持有)、[S-28](v1/contract.md#s-28-配值与禁用只对自带资产生效丢掉的留痕) | **未开始。**记录号怎么铸未定（[G-6](v1/contract.md#十一已知缺口)），演练比对的是结构 |
| V-5 | **设置不跟过去、权限的约束跟过去**（[S-36](v1/contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)）：[E-4](v1/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 三支同跑 | 规范场景演练 | [S-22](v1/contract.md#s-22-第四步设置)、[S-23](v1/contract.md#s-23-第四步权限) | **未开始。**G-16、G-17 已闭合（账本 S10-a、S10-b），E-4 三支按「界与挑选」改写后的期望跑 |
| V-6 | **输入不合法时整体拒绝**（[S-37](v1/contract.md#s-37-输入不合法时整体拒绝)）：[E-5](v1/examples.md#e-5-不合法的输入) 八份 | 规范场景演练，**核返回里没有任何 `EffectiveAssembly`** | [S-7](v1/contract.md#s-7-输入的一致性条件)、[S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | **未开始** |
| V-7 | **装配给的保证**（[S-29](v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) 左列）：一致读、分享此刻成立、调用方已核实、清单就是目录里那份 | 装配设计的选型声明 ＋ 架构评审 | [第七节前提](v1/contract.md#前提由别人兑现本契约不检查) PRE-1～PRE-3、PRE-7 | **未开始。**不是可跑的义务；它们失效的形态都是**静默算错**（锁截断被绕过、团队资产出树），上面的场景测不出 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。**本版全部状态为「未开始」**，检查器形式归 realization。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 两个操作的实现不读存储、时钟、文件与进程状态，不写任何东西 | [S-11](v1/contract.md#s-11-纯计算)、[S-30](v1/contract.md#s-30-本能力没有在途工作) | 未开始 |
| SC-2 | 消费者缓存求值结果时，键覆盖整份输入（含 `standing`、`workspace`、会话配值与选用版本），不只以 `(tenant, root)` 为键 | [S-15](v1/contract.md#s-15-evaluate) ⑦ | 未开始 |
| SC-3 | 不存在把 `invalidInput` 转成空 `EffectiveAssembly`、或把 `unresolved` 升级成 `invalidInput` 的路径 | [S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | 未开始 |

## 结果与反例

### 已执行：整批对齐后的 Alloy 运行（2026-09-24）

| 项 | 值 |
|---|---|
| 对象 | [`v1/formal/Evaluation.als`](v1/formal/Evaluation.als)，整批对齐落账本 S10-b 之后的内容（未冻结）；SHA-256 `a8e310edf6f5256de4650558c6fdcb4ede077228c63133be7f9a845c761ae39a` |
| 工具 | 本机 `/usr/local/bin/alloy` 6.2.0，`alloy exec -f -c '*' <file>` |
| 怎么跑的 | 把模型**复制到主检出 `tmp/formal-runs/asset-evaluation-v1-evaluation/`** 再跑（`alloy exec` 会在文件旁写输出目录，不在版本目录里跑）；变异体在同目录 `mutants/`；原始输出与回执留在那里，**未入库** |
| 判读 | `check` 行 `UNSAT` 读作**本范围内无反例**、`SAT` 读作找到反例；`run` 行 `SAT` 读作前件可满足（账本 S10-c） |
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

规范场景 S-33～S-37、静态检查 SC-1～SC-3 尚无执行记录。首次执行时在此记录工具与版本、环境、输入范围、
可复现步骤与原始结果位置；原始产物归 [record/evidence/](../../../record/evidence/README.md)。

## 形式化工件

**选用 Alloy，不登记为 formal task。**[检查器只以退出码判成败](../../../registry/README.md#当前状态)，
而 `alloy exec` 找到反例照样退出 0（上节八个变异体即是实例）——登记它只会得到一个永远通过的任务。
映射、规模与盖不到的部分在 [formal 入口](v1/formal/README.md)。**`formal-tasks.json` 里本契约没有条目，这是有意的**，不是漏登。

## 变化的影响

- **2026-09-23 本轮（起草中途）：施工简报追加第 7 条裁定，原地改了候选。**
  - 权限的第 4 步从「按资产求界、由里到外取第一格与界相交的」改为**按能力标识跨层取交集**：组织、租户两格的在效持有不论指向哪份资产都给约束；
    声明默认值降为作者建议；替换件缺的项取最严（[S-23](v1/contract.md#s-23-第四步权限)）。
    工作区自带资产的最严值由「`from` 固定为出厂」改为「出厂那一格的约束」，组织、租户、会话的约束照常收窄它（[S-25](v1/contract.md#s-25-工作区自带资产的权限项一律取最严值)）。
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
  - `Evaluation.als`：加 `Fits`／`Values`／`permBounds`、fact `BoundsFitUnlessEmpty`，`permFrom` 改为「第一条落在界内的挑选」，加断言 (vii) `NonFittingPickNeverSources` 与 `run pickSkipped`；(vi) 改为「带锁的外层配值在界里」。**2026-09-23 那次运行作废**，V-1 按新模型重跑（[上节](#已执行整批对齐后的-alloy-运行2026-09-24)），变异体加 M8。
  - 消费者：`capability.asset-registry` 读 `version`／`resident`／`usable`（它的 G-5 随之闭合）；`capability.mcp-bridge` 读 `provenance`（它的 G-9）。
  - **同轮稍后（资产治理与流转对齐）**：PRE-2 写明租户格以 `organization` 支持有被分享记录的那份随分享一起判（账本 S11-G2，`data.asset-model` S-19 同轮改）；E-1 会话格那条配值补 `since`（`data.asset-model` S-14 加的必填成员）。规则与 Alloy 模型不受影响。
- **`data.asset-model` 下一版**若改 `HoldingBasis` 的支或 `versionSelection`，核 C8、C9 与 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 列的条款号，重登 catalog。
  本契约仍是 candidate，**未冻结之前原地改并在此记录**；冻结之后发布新版本。
- **跨进程演化**（[G-14](v1/contract.md#十一已知缺口)）：[S-29](v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) 的「装配给」各行转为「协议给」，**语义边界改变，须发布新版本**；本版的全部证据只保留其单机范围。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-001／PF-003／PF-004），不在这里改契约。
