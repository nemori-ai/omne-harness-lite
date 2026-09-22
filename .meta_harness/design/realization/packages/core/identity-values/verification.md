# identity-values 验证与证据

契约侧的证据义务权威在 [`spec/data/identity-values/verification.md`](../../../../spec/data/identity-values/verification.md)（V-1～V-14、SC-1～SC-n）。
本页只登记**落在本节点上的那一部分**，以及本节点为别的 owner 提供的检查器；其余义务各归它们的 owner 节点。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [V-1 形状校验](../../../../spec/data/identity-values/verification.md#证据义务)（S-1／S-3／S-4／S-5／S-7／S-8／S-9／S-10／S-11／S-12／S-31／S-32／S-35 的形状面） | `examples.md` 第 1～11 节的正反实例逐条过包内 `validate`，作为本包的测试；测试同时核对包内 Schema 副本与 spec 逐字节相同 | **未开始**。此前只有一次[本地未登记的形状自检](../../../../spec/data/identity-values/verification.md#结果与反例) | 本节点；测试落包并在 CI 跑过一次、结果登记进 [record/evidence](../../../../record/evidence/README.md) 即闭合 |
| S-5／S-7／S-13 值判定 | 结构相等、规范序列化唯一、`sameAccountDistinctTenants` 的单元测试（含 S-13 那条「只在 V-14 有落点」的值判定） | 未开始 | 本节点 |
| S-14／S-15 定义式 | 纯函数版 `ancestorChain`／`shareAncestor` 对着 [`Affiliation.als`](../../../../spec/capabilities/organization-governance/v1/formal/Affiliation.als) 的 `shareAncestor` 定义逐字核对（含自身、`ancestorChain` 不含自己），并给「一个组织与它自己的上级」这个曾经的反例一条测试 | 未开始 | 本节点；治理节点消费它 |
| [S-35](../../../../spec/data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant) 六条性质里**本模块能证的**：不透明（核实不解析）、绑定该标识、由产出方签发（错误密钥／错误用途／错误 AccountId 一律 `invalid`） | 单元测试：正例、四类反例（不带、绑另一标识、用途不符、自制字符串） | 未开始 | 本节点。**性质 4（不作废）与性质 6（不核领域事实）不在本模块证**——那是两个实例各自契约的规范场景（[`capability.account-identity/v1#S-41`～`#S-43`](../../../../spec/capabilities/account-identity/v1/contract.md#八规范表达与验证义务)） |
| [V-2 静态检查](../../../../spec/data/identity-values/verification.md#静态检查义务) 里由本模块提供检查器输入的 SC-1／SC-2／SC-9 | lint 规则实现 ＋ 一条「故意违反就失败」的自测 | 未开始；**检查器尚不存在** | 本节点提供规则；各消费者包 CI 跑。SC-3 一类由品牌类型在编译期挡，证据是「一段违反的代码编译不过」的负向测试 |

义务从契约条款与本节点声称的范围产生。**受阻项**：SC-1 依赖各消费者节点先落包才有可扫描的判定函数；V-1 依赖校验器选型。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 无 | — | — | — |

**有限检查不写成无条件证明。**本节点尚无任何运行。

## 覆盖缺口

- **隔离义务 S-16～S-30 一条也不在本节点闭合**：本模块给检查器与类型，判定路径在各 owner。V-3（六路径）、V-4（冒充隔离）、V-5（不可用≠无效）、V-6、V-9、V-10、V-11、V-13 的演练分别归 `account-identity`、`organization-governance`、`account-registration` 与尚未建立的资产／会话／执行环境节点。
- **G-04／G-05 未裁**：标识词法与标量键的候选在 [design.md](design.md#能力到-cordis-的投影)，没有裁决就没有可测的规范。
- **密钥私有性**：签名方案的不可伪造前提「私钥不外泄」在单进程内只能靠装配纪律，没有可机检的证据形式；跨进程演化时须重新给出。
