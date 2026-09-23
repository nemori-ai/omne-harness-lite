# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：规范场景与静态检查未开始；Alloy 模型起草时在暂存区跑过一次，未登记。**
> `capability.asset-evaluation` v1 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **五条规范场景（S-33～S-37）一条都未执行**——文件存在不代替结果。
> Alloy 那一次的范围与局限见[下节](#结果与反例)；它只支持[契约第七节](v1/contract.md#七性质与前提)标了 Alloy 的那几行，**且只在所列规模内**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **结构性质 (i)～(vi)**：团队资产不出那棵树、锁截断、禁用析取、工作区滤权（权限与落点类）、官方件下界、换了实现逃不出外层对这个能力标识的权限约束 | Alloy：[`Evaluation.als`](v1/formal/Evaluation.als) 的九条命令 ＋ 七个变异体 | [S-17](v1/contract.md#s-17-第一步之一先按禁用滤)～[S-19](v1/contract.md#s-19-官方件是下界)、[S-22](v1/contract.md#s-22-第四步设置)～[S-25](v1/contract.md#s-25-工作区自带资产的权限项一律取最严值) 的「来自哪一格」那一面 | **起草时执行一次，未登记**（[下节](#已执行起草时的-alloy-运行2026-09-23)） |
| V-2 | **四格齐全的一次求值**（[S-33](v1/contract.md#s-33-四格齐全的一次求值)）：五个集合与 [E-1](v1/examples.md#e-1-四格齐全的一次求值) 逐项相等；同一输入重放；改一项权限只动那一项的值 | 规范场景演练，**同一次演练比对全部五个集合** | [S-8](v1/contract.md#s-8-求值结果-effectiveassembly)、[S-11](v1/contract.md#s-11-纯计算)、[S-17](v1/contract.md#s-17-第一步之一先按禁用滤)～[S-26](v1/contract.md#s-26-每份持有都有去处) | **未开始。**需要一个实现；且第 2、3 步要选用版本与各类正文的两条规则（[G-2](v1/contract.md#十一已知缺口)、[G-3](v1/contract.md#十一已知缺口)），闭合前只能以 examples 里「给定的正文」替身跑。**凭据那一条（E-1 第 1 件事）必须真核**：它失败的形态是外泄，不是报错 |
| V-3 | **先禁用后替换**（[S-34](v1/contract.md#s-34-先禁用后替换)）：[E-2a、E-2b](v1/examples.md#e-2-先禁用后替换) | 规范场景演练 | [S-17](v1/contract.md#s-17-第一步之一先按禁用滤)、[S-18](v1/contract.md#s-18-第一步之二再取最具体的一份锁在最外那一把处截断) | **未开始** |
| V-4 | **清单读入的留痕**（[S-35](v1/contract.md#s-35-清单读入的留痕)）：[E-3](v1/examples.md#e-3-一次清单读入)，并与 E-1 连起来看 | 规范场景演练 | [S-16](v1/contract.md#s-16-readworkspacecarrier)、[S-27](v1/contract.md#s-27-自带资产变成工作区那一格的持有)、[S-28](v1/contract.md#s-28-配值与禁用只对自带资产生效丢掉的留痕) | **未开始。**记录号怎么铸未定（[G-6](v1/contract.md#十一已知缺口)），演练比对的是结构 |
| V-5 | **设置不跟过去、权限的约束跟过去**（[S-36](v1/contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)）：[E-4](v1/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 三支同跑 | 规范场景演练 | [S-22](v1/contract.md#s-22-第四步设置)、[S-23](v1/contract.md#s-23-第四步权限) | **未开始。**第三支的期望受 [G-16](v1/contract.md#十一已知缺口) 影响；E-4 与 E-1 的设置那一半受 [G-17](v1/contract.md#十一已知缺口) 影响 |
| V-6 | **输入不合法时整体拒绝**（[S-37](v1/contract.md#s-37-输入不合法时整体拒绝)）：[E-5](v1/examples.md#e-5-不合法的输入) 八份 | 规范场景演练，**核返回里没有任何 `EffectiveAssembly`** | [S-7](v1/contract.md#s-7-输入的一致性条件)、[S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | **未开始** |
| V-7 | **装配给的保证**（[S-29](v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) 左列）：一致读、分享此刻成立、调用方已核实、清单就是目录里那份 | 装配设计的选型声明 ＋ 架构评审 | [第七节前提](v1/contract.md#前提由别人兑现本契约不检查) P1～P3、P7 | **未开始。**不是可跑的义务；它们失效的形态都是**静默算错**（锁截断被绕过、团队资产出树），上面的场景测不出 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。**本版全部状态为「未开始」**，检查器形式归 realization。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 两个操作的实现不读存储、时钟、文件与进程状态，不写任何东西 | [S-11](v1/contract.md#s-11-纯计算)、[S-30](v1/contract.md#s-30-本能力没有在途工作) | 未开始 |
| SC-2 | 消费者缓存求值结果时，键覆盖整份输入（含 `standing`、`workspace`、会话配值与选用版本），不只以 `(tenant, root)` 为键 | [S-15](v1/contract.md#s-15-evaluate) ⑦ | 未开始 |
| SC-3 | 不存在把 `invalidInput` 转成空 `EffectiveAssembly`、或把 `unresolved` 升级成 `invalidInput` 的路径 | [S-13](v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | 未开始 |

## 结果与反例

### 已执行：起草时的 Alloy 运行（2026-09-23）

| 项 | 值 |
|---|---|
| 对象 | [`v1/formal/Evaluation.als`](v1/formal/Evaluation.als)，起草当时的内容（未冻结）；SHA-256 `0ae640c2c24bf29712aa28a848cf860dfbbd07f892a13326896fc6ad3d62e7e4` |
| 工具 | 本机 `alloy` 6.2.0，`alloy exec <file>`；回执：solver `sat4j`、bitwidth 4、symmetry 20 |
| 怎么跑的 | 把模型**复制到会话暂存区**再跑（`alloy exec` 会在文件旁写输出目录，不在版本目录里跑）；输出与回执**未入库** |
| 结果 | 全部九条与预期一致，耗时约 13 秒： |

```text
00. run   fourLayerInstance        0    1/1     SAT
01. run   replacementConstrained     0    1/1     SAT
02. check TeamAssetsStayInTree     0       UNSAT
03. check LockTruncates            0       UNSAT
04. check DisableIsDisjunction     0       UNSAT
05. check WorkspaceNeverSourcesPermission     0       UNSAT
06. check WorkspaceNeverSourcesPlacement     0       UNSAT
07. check OfficialLowerBound       0       UNSAT
08. check ReplacementCannotEscapePermission     0       UNSAT
```

**变异体**（[formal 入口](v1/formal/README.md#alloy)的非平凡核对；每个只改一处，同在暂存区跑）：

| # | 拿掉什么 | 找到反例的断言 | 与预期 |
|---|---|---|---|
| M1 | `candidates` 的锁条件 | `LockTruncates` | 一致 |
| M2 | 禁用滤 | `DisableIsDisjunction` | 一致 |
| M3 | `permParticipating` 放进 `Workspace` | `WorkspaceNeverSourcesPermission`；另有 `ReplacementCannotEscapePermission`（工作区那一格成了「更里」却不在权限层序上，前件里的那一格就不再在它以外） | 一致；第二条是同一改动的连带，可解释 |
| M4 | fact `OfficialNeverDisabled` | `OfficialLowerBound` | 一致 |
| M5 | fact `InputHoldingsStayInTree` | `TeamAssetsStayInTree` | 一致 |
| M6 | `settingParticipating` 对落点类的滤 | `WorkspaceNeverSourcesPlacement` | 一致 |
| M7 | `permParticipating` 改回只看指向生效资产的持有 | `ReplacementCannotEscapePermission` | 一致 |

**七个变异体全部退出 0**——这正是不登记的理由：退出码分不出「无反例」与「找到反例」。

**范围与局限**：

- 只在上表规模内无反例，**不推广到任意规模**。
- 只核「值来自哪一格」与「生效的是哪一份」；**值本身不在模型**，由 V-2、V-5 的场景兜住。
- (i) **在前提 P2 之下**成立，它证明的是求值没有别的来路，不是前提本身。
- (vi) 与模型里 `permParticipating` 的定义很近，它的价值在 M7：**把追加裁定钉进模型**，读法一旦退回按资产取权限就会被发现。

### 尚无的记录

规范场景 S-33～S-37、静态检查 SC-1～SC-3 尚无执行记录。首次执行时在此记录工具与版本、环境、输入范围、
可复现步骤与原始结果位置；原始产物归 [record/evidence/](../../../record/evidence/README.md)。

## 形式化工件

**选用 Alloy，不登记为 formal task。**[检查器只以退出码判成败](../../../registry/README.md#当前状态)，
而 `alloy exec` 找到反例照样退出 0（上节七个变异体即是实例）——登记它只会得到一个永远通过的任务。
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
- **`data.asset-model` v1 定型之后**（[G-12](v1/contract.md#十一已知缺口)）：核 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 列的 `$defs` 名没有变，按条款号补登 catalog 依赖；
  它的下一版带上 `versionSelection` 与 `HoldingBasis` 五支之后，C9 落成形状条件，V-2 可以不用替身跑。
- **G-16、G-17 裁定之后**：若改变 S-22 或 S-23 的规则，E-1、E-4 的期望与 `Evaluation.als` 的参与条件要同步改，V-1 须重跑。
  本契约仍是 candidate，**未冻结之前原地改并在此记录**；冻结之后发布新版本。
- **跨进程演化**（[G-14](v1/contract.md#十一已知缺口)）：[S-29](v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) 的「装配给」各行转为「协议给」，**语义边界改变，须发布新版本**；本版的全部证据只保留其单机范围。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-001／PF-003／PF-004），不在这里改契约。
