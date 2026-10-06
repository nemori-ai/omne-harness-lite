# 形式化工件与论证映射

本页拥有**条款 → 性质 → 模型 → 检查配置**这一层对应关系，以及工件**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**。[验证入口](../../verification.md)维护方法、覆盖、前提和限制；每次运行输入与输出放本工作树 `tmp/<task>/`。

本版只选一个工件：TLA+ 行为模型 [`Sweep.tla`](Sweep.tla)，理由在[契约 S-21](../contract.md#s-21-本版选用哪些形式工件)。
**不建 Alloy、不建 Schema**。

## 本版选用什么

| 契约条款 | 性质 | 模型里的定义 | 去掉哪一处保护会被反驳 | 未覆盖范围与相应义务 |
|---|---|---|---|---|
| [S-18](../contract.md#s-18-清扫) 第 1、2 条 · 第七节不变量第 3 行 | 绑定 `granted` ⇒ 它记下的那条条目还在、指着它（`resolve` 交得出） | 不变量 `GrantedResolvable` | `SweepOnlyThree = FALSE`（[`Sweep_Validity_SweepNotGranted.cfg`](Sweep_Validity_SweepNotGranted.cfg)）：清扫丢掉一条 `pending` 未过期的条目，完成随后迁 `granted`；`CompleteFreshTime = FALSE`（[`Sweep_Validity_StaleCompletionTime.cfg`](Sweep_Validity_StaleCompletionTime.cfg)）：清扫按此刻判过期丢了，完成按更早读的时刻判未过期、照样迁 `granted` | 「在绑定上排序」在模型里是**每个动作对它所碰的绑定是原子的**——这条被建模方式吸收，模型不检查它，**它是前提**（契约 [S-19](../contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行装配给）；证据是场景 [S-28](../contract.md#s-28-清扫与完成交错) 的真并发演练 |
| [S-18](../contract.md#s-18-清扫) 第 4 条 · 第七节进展第 1 行 | 三种可丢的条目终被丢 | 时序性质 `OrphanEventuallySwept`（`Spec` 带每条条目上 `Sweep` 的弱公平性） | `SweepEnabled = FALSE`（[`Sweep_Validity_NoSweep.cfg`](Sweep_Validity_NoSweep.cfg)）：`revoked` 的条目永远留着 | **上界 `sweepInterval` 不在模型里**：模型只说「终会」，弱公平性是前提不是结论；有界的证据是场景 [S-28](../contract.md#s-28-清扫与完成交错) 按装配给的值计时 |
| [S-18](../contract.md#s-18-清扫) 第 1 条后半 | 清扫不丢 `pending` 未过期的、不丢 `granted` 且记下是它的 | **按构造成立**：`ThreeKinds` 这个守卫本身就排除它们 | 无对应的有效性核对——去掉守卫是改模型 | **不作证据**；证据是场景 [S-28](../contract.md#s-28-清扫与完成交错) 与 [examples §3](../examples.md#3-oauth-条目收下交出清扫) |

**`TypeOK` 只约束模型自己变量的值域**，不绑任何条款。

## TLA+ 与 TLC

- **模型文件**：[`Sweep.tla`](Sweep.tla)。固定场景：一份持有、两个绑定（同一份持有上先后两次发起）、三个可发出的引用、时钟到 3、`oauthPendingTtl` 为 1 个刻度。
  **两个绑定才测得出「新的一次发起作废旧的 `pending`」；三个引用才测得出「同一个绑定收下两条、只认一条」加上另一个绑定的一条。**
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `Deposit(b, r)` | [S-16](../contract.md#s-16-depositoauth)：条目收下即 `held`、指着一个存在的绑定；**不看绑定状态**（模型里对 `revoked`、已过期的绑定也允许收下，比真实调用方更宽） |
  | `Complete(r)` | `capability.mcp-bridge` v2 的 S-23 ④：排到绑定之后，仍 `pending` 且未过期即迁 `granted`、记下这个引用。**这是桥一侧的动作**；`CompleteFreshTime` 是桥一侧的前提（桥节点 C-3：过期按排到之后的时刻判） |
  | `Begin(b)` / `Revoke(b)` | `capability.mcp-bridge` v2 的 S-22、S-8：新发起作废旧的 `pending`；拒绝、过期写下、续期被拒、引用不再配在持有上，都表达成一次 `Revoke` |
  | `Sweep(r)` 与 `ThreeKinds(r)` | [S-18](../contract.md#s-18-清扫)：一次丢一条；三种按排到之后的时刻 `now` 判 |
  | `GrantedResolvable` 里的「还在、指着它」 | [S-17](../contract.md#s-17-resolve) 交得出的条件在「持有相等」恒成立时的那一部分（模型只有一份持有） |
  | `now` 与 `Tick` | 同一个时间源，读数不回退 |

- **不在模型里**：副本条目、登录状态、据点隔离、加密、密钥取不到、存储读不到（`unavailable`）、`resolve` 的一致读本身、撤除与崩溃——它们各有规范场景（[契约 S-21](../contract.md#s-21-本版选用哪些形式工件)）。**「读不到绑定就不丢」**（[S-18](../contract.md#s-18-清扫) 第 3 条）不在模型里：模型的绑定恒读得到。
- **公平性与进展**：`Spec` 带 `\A r \in Refs : WF_vars(Sweep(r))`——**这是前提，不是结论**；契约第七节把它写在进展性质的「前提」一列（本能力在场、存储与绑定读得到、时间源推进）。
- **检查输入**：

  | 配置 | 常量 | 检查什么 | 预期 | 登记为 formal task |
  |---|---|---|---|---|
  | [`Sweep.cfg`](Sweep.cfg) | 三个开关全 `TRUE`；`Bindings = {b1, b2}`，`Refs = {r1, r2, r3}`，`TTL = 1`，`MaxTime = 3` | `TypeOK`、`GrantedResolvable`；`OrphanEventuallySwept` | **本范围内无反例** | **是**：`credential-custodian-v2-sweep` |
  | [`Sweep_Validity_SweepNotGranted.cfg`](Sweep_Validity_SweepNotGranted.cfg) | `SweepOnlyThree = FALSE` | `GrantedResolvable` | **找到反例** | 否（期望失败） |
  | [`Sweep_Validity_StaleCompletionTime.cfg`](Sweep_Validity_StaleCompletionTime.cfg) | `CompleteFreshTime = FALSE` | `GrantedResolvable` | **找到反例** | 否（期望失败） |
  | [`Sweep_Validity_NoSweep.cfg`](Sweep_Validity_NoSweep.cfg) | `SweepEnabled = FALSE` | `OrphanEventuallySwept` | **找到反例** | 否（期望失败） |
  | [`Sweep_Reach_Granted.cfg`](Sweep_Reach_Granted.cfg) | 同主配置 | 探针 `NoGrantedEver` | **找到反例**（可达的证据） | 否 |
  | [`Sweep_Reach_Discard.cfg`](Sweep_Reach_Discard.cfg) | 同主配置 | 探针 `NoDiscardEver` | **找到反例**（可达的证据） | 否 |

  全部关掉死锁检查：时钟到顶、条目都处置完之后没有动作是正常的终点。

- **有效性核对**（**主配置与三个去保护配置、两个探针一起才成立**）：
  - **三个去保护配置都必须给出反例**，且反例轨迹要对得上配置注释写的那个局面；给不出，说明对应条款在本模型里是平凡的，**不能记作已验证**。
  - **两个探针都必须被反驳**：`granted` 可达（`GrantedResolvable` 不是空真）、丢弃可达（`OrphanEventuallySwept` 的前件会成立）。
- **规模**：两个绑定、三个引用、时钟到 3——每条反例需要的最小局面（一次发起、一次收下、过期一刻、一次清扫、一次完成）都在内。**更大的规模是另一次检查**，结果按它自己的范围陈述。

TLA+ 描述行为规格，TLC 对给定模型进行检查；**在已检查范围内未发现反例，不自动成为任意范围的证明**。

## 版本与证据边界

模型与配置随本版本冻结（接受之后）；执行命令、原始输出与反例轨迹在版本外，入口是[验证入口](../../verification.md)。
