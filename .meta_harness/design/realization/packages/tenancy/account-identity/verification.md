# account-identity 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/account-identity/verification.md`](../../../../spec/capabilities/account-identity/verification.md)——
八条规范场景、两条静态检查，以及若干条没有场景号的注入义务。本页按**本节点的兑现点**逐条登记状态，不复述契约的场景正文。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-31](../../../../spec/capabilities/account-identity/v1/contract.md#s-31-三种登录失败反馈完全一致) 三种登录失败同值 | 场景演练，三支同一次比对 `logins.issue` 的返回值逐字相同 | **未开始** | 本节点；需要 credential-verification 的一个真实实现 |
| [S-32](../../../../spec/capabilities/account-identity/v1/contract.md#s-32-退出的持久性) 退出持久 | 场景演练，**含一次完整进程重启** + 存储故障注入两支同跑 | 未开始 | 本节点 + 装配（可重启的装配、可注入故障的 `storage`）。**证的是存储要求 R-4 真的被选中的提供者兑现** |
| [S-33](../../../../spec/capabilities/account-identity/v1/contract.md#s-33-退出的作用范围) 只及一个 | 场景演练 | 未开始 | 本节点 |
| [S-34](../../../../spec/capabilities/account-identity/v1/contract.md#s-34-同标识两路对比) 四路 + 求值次序支 | 场景演练，四路（含第四路两支）同一次比对；第五支：不合规凭据撞已激活标识 ⇒ `credential-rejected` | 未开始 | 本节点。**第五支对本节点尤其要紧**：design.md 写明实现的执行顺序不是契约的字面顺序（认回先于政策），这一支证明可观察结果仍与契约一致 |
| [S-40](../../../../spec/capabilities/account-identity/v1/contract.md#s-40-有效登录状态列得全) 列得全 + 不返回空集 | 场景演练，两支同跑 | 未开始 | 本节点；空集那支要注入 `storage` 读失败 |
| [S-41](../../../../spec/capabilities/account-identity/v1/contract.md#s-41-未激活记录到期释放标识) 五支 | 场景演练，需可前推的 `clock`；①②③ 证到期判据，④⑤ 证依据绑定 | 未开始 | 本节点 + 装配（可控 `clock`）。① 同时证存储要求 R-6 |
| [S-42](../../../../spec/capabilities/account-identity/v1/contract.md#s-42-伪造的依据两侧都被拒) 伪造依据 | 场景演练，三支；「自制一份」= 用**另一把**密钥签一份形状合法的凭证（本节点选的是签名方案，[identity-values](../../core/identity-values/design.md#交接凭证走签名不走进程内登记)）——改一个字节测的是绑定不是防伪 | 未开始 | 本节点 |
| [S-43](../../../../spec/capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期) 依据先产出、记录后过期 | 两支：可控 `clock` 前推支；**真并发支**——与组合节点同一次演练，**必须含 [design.md 列的两条交错](design.md#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)**：(a) S-14 已读到未过期但未提交时另一路清除链跑完；(b) `og#S-20` 已读到未过期但未提交时清除链跑完。终态各只允许契约的两种之一，且孤儿组织与「已激活无个人组织」两个状态都不可达 | 未开始 | 本节点 + account-registration + organization-governance。第 2 支证的是 R-3 锁定读 + R-7 引用约束真的被选中的存储兑现 |
| [S-35](../../../../spec/capabilities/account-identity/v1/contract.md#s-35-静态检查账号记录无跨账号关联字段) | identity-values 的 SC-2 规则对本包记录类型跑一次 | 未开始；检查器不存在 | 本节点 |
| [S-36](../../../../spec/capabilities/account-identity/v1/contract.md#s-36-静态检查失败集合闭合) | lint：八个方法的失败字面量集合与契约逐条相等 | 未开始；检查器不存在 | 本节点 |
| 无场景号的注入义务（契约 verification 登记）：逐操作表示层注入、[S-16](../../../../spec/capabilities/account-identity/v1/contract.md#s-16-撤销登录状态) 重复退出 ⇒ `not-authorized`、[S-38](../../../../spec/capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 删记录与释放标识同提交的故障注入、[S-27](../../../../spec/capabilities/account-identity/v1/contract.md#s-27-缺席时的默认答案) 逐行注入 | 单元／集成测试 | 未开始 | 本节点。**S-39 参数缺席那一行在本设计下不可达**（启动校验吸收），登记为「由启动失败兑现」并给一条「缺 config 则 fiber 不 ACTIVE」的测试 |
| [S-22](../../../../spec/capabilities/account-identity/v1/contract.md#s-22-账号存在性不从登录路径泄漏) 第二处例外的装配纪律 | **方法级**结构检查：仓库内 `accounts.produce(` 的调用点只在 `account-registration`——按包 inject 查不出（organization-governance 也 inject `accounts` 读 S-18）；检查同时覆盖 inject 声明与 `ctx.get('accounts')` 动态解析后的调用 | 未开始 | 装配节点；本节点只提出检查形式。检查须有一条「在别的包里故意调 `produce` 就失败」的自测 |
| 过期事实的落盘与单调（[design.md](design.md#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)） | 单元／集成测试：① 首次读到期即写 `expiredAt`，第二次读不再依赖 `clock`（把 `clock` 回拨或置 `unavailable` 仍返回「是」）；② 写不进事实 ⇒ `storage-unavailable`，不返回「是」；③ `activated` 与 `expiredAt` 不能同时非空（存储层 check 约束或测试） | 未开始 | 本节点 |

**受阻项**：全部场景依赖 `storage` 与 `clock` 提供者，两者归尚未建立的装配节点；S-31／S-34 依赖 credential-verification 的实现。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| `2026-09-22-formal-tenant-domain-2` | `Registration.tla` + `crash.cfg`（`Attempts = {a1,a2,a3}`，`Failures/Abandoning/Expiring = TRUE`）；本节点借它证 S-13／S-14／S-38 的**守卫与转移**（[bindings](bindings.yaml)） | 无反例，退出 0；32170 generated · 6978 distinct · 深度 16 | [run README](../../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md) |

**这一行不是本节点的符合性证据**：它检查的是组合模型里的抽象动作，本节点的源码不存在。它支持的只是「契约条款之间的次序推理不自相矛盾」——bindings 的 assumptions 逐条写了模型盖不到什么。

## 覆盖缺口

- **S-39 政策（报 spec owner）**：契约写「变更只影响此后的判定，不追溯地把已经做出的认回或清除改写」。过期事实落盘之后，「定死」与「读时按当前参数算」两种算法都满足单调，差别只在尚未落盘的记录上：调短时前者不提前到期、后者提前；调长时前者不推迟、后者推迟。**这是政策选择，不是机制约束**；本节点默认定死，裁为另一种只换一个比较式。
- **契约措辞两处（报 spec owner，不改语义）**：S-30 第 7 行左列「同一时间源 + 同一参数源」描述的是旧的兑现方式，本节点用的是右列的「由单点判定并携带的事实」；S-4「AccountId 产生时由存储生成」本节点读作「在存储提交内生成、由主键约束保证唯一」。
- **三条待核对主张**（可选 inject、`ctx.provide` 的纳管、插件体抛出后的 fiber 状态）核对前，依赖表与装卸表里对应的行是假设。
- **S-30 右列九行协议给保证**：本版一条也不兑现，也没有证据形式；跨进程演化时逐行重开。
- **S-21 前提**（一切交互经 S-17）、**S-25 另一半**（其他 owner 的数据）、**G-4 运行控制**：不在本节点。
