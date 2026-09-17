# PF-026 账号旅程与独立身份 · 设计投影 v1

**实施者从这一页取得全部设计输入。**它是派生快照，各节来源记在同目录
[`provenance.json`](provenance.json)；与上游不一致时以上游为准。

- 对应需求：[PF-026.C1–C5](../../requirements.md)
- 本版依据的需求修订：2026-09-16 收窄后的正文
- 状态：当前
- 未决 gap：6（见[第 7 节](#7-未决项)）

## 1. 本版覆盖的需求条款

| 条款 | 确认状态 | 本版是否落地 |
|---|---|---|
| C1 注册主体结果（自助注册、独立身份） | 已确认 | **是** |
| C1 注册成功时默认恰有一个个人租户 | 已确认 | **是** |
| C1「恰有一个」是初态还是存续期不变量 | **未知** | 按存续期表述，但依赖账号终止语义（Q4） |
| C1 pending 身份不得冒充成功 | **候选假设**（无用户确认依据） | **不直接落地**，见下 |
| C2 登录与退出主体结果 | 已确认 | **是** |
| C2 撤销作用范围（本机/全设备/多端） | **未知** | 否，只承诺单一登录态（Q1） |
| C3 多账号独立 | 已确认 | **是**（身份与个人范围侧） |
| C4 账号与组织关系分离 | 已确认 | **是** |
| C5 可辨认的旅程结果 | 候选假设（从完整旅程推导） | **是**，终结结果集合已枚举 |

**关于 C1 的 pending 表述**：核实结果为该需求 topic 的 `changes.md` 中无任何用户确认条目，
唯一可追依据是一份已接受的设计决定。按「未确认的要求不驱动落地」，
本设计不引入 pending 概念，改以「未通过验证」与「未激活」表述承担同等保护——
见性质 A-1、A-4，保护强度不低于原表述。

## 2. 涉及的领域对象

| 对象 | 领域含义 | 生命周期 | 落点 |
|---|---|---|---|
| 账号身份记录 | 自然人的产品身份 | 注册创建，长期存在 | 数据 |
| 登录标识 | 定位账号的对外标识 | 随账号 | 数据，**部署内唯一** |
| 凭据 | 证明持有该账号 | 随账号，可更换 | 数据（不可逆保存） |
| 激活状态 | 账号是否可用 | 随账号 | 数据，**唯一提交点** |
| 登录会话记录 | 一次可撤销的登录态 | 登录建立，撤销终止 | **持久数据，不是内存资源** |
| 个人租户 | 与账号一一对应的租户 | 注册时创建 | 数据（归租户治理） |
| 注册编排 | 三步流程的次序与幂等 | 一次注册 | 组合流程 |

## 3. 不变量与性质

### 3.1 不变量

| 编号 | 内容 | 谁维护 | 违反时的检查 |
|---|---|---|---|
| A-3 | 登录标识在**部署范围内**唯一 | 账号能力 + 存储唯一约束 | `test:account-identity/identifier-uniqueness` |
| A-4 | 未激活的账号不可用于任何交互 | 账号能力 | `test:account-identity/inactive-account-indistinguishable` |
| A-5 | 系统中不存在把两个账号关联为同一现实人的事实 | **数据形状** | `test:account-identity/no-cross-account-link-field` |
| A-6 | 任一次交互所用的账号身份唯一且已验证 | 各消费能力（前提：身份参数无默认值） | `test:account-identity/identity-param-has-no-default` |
| R-1 | 可用账号必然恰有一个个人租户 | 注册编排（激活前置） | `formal:account-registration-v1-basic` |

**A-3 为什么是「部署内」而不是「租户内」**：登录发生在任何租户上下文建立**之前**——
用户只提供标识与凭据，系统须据此唯一定位账号。若标识仅租户内唯一，C2 的
「用账号凭据登录指定账号」不可实现。这是 C2 的必要条件，不是产品偏好。

### 3.2 安全性质

| 编号 | 内容 | 谁维护 | 违反时的检查 |
|---|---|---|---|
| A-1 | 未通过验证的身份绝不被当作成功账号使用或呈现 | 账号能力 | `test:account-identity/journey-interruption-matrix` |
| A-2 | 绝不因两账号背后同一现实人而使一方事实对另一方可用 | 判定依据的构成 | `test:account-identity/no-physical-location-in-authz` 同批 |
| A-7 | 登录态被撤销后绝不存在凭它成功访问的后续交互 | 账号能力（**持久撤销记录**） | `test:account-identity/revocation-survives-restart` |
| A-8 | 物理位置事实绝不构成访问资格 | 判定依据的构成 | `test:account-identity/no-physical-location-in-authz` |
| A-9 | 失败或中断的旅程绝不呈现为成功 | 账号能力 + 注册编排 | `formal:account-registration-v1-crash` |
| R-2 | 绝不存在「已激活但无个人租户」的账号 | 注册编排 | `formal:account-registration-v1-crash` |

### 3.3 进展性质

| 编号 | **前提** | 最终发生什么 | 证据 |
|---|---|---|---|
| A-10 | 账号存在且已激活、凭据有效、调用方不中断 | 建立可撤销登录态，或给出可辨认失败 | `formal:…-progress` |
| A-11 | 存在有效登录态且发起撤销 | 该登录态最终失效 | `test:…/revoked-session-rejected`（范围限单一登录态） |
| R-4 | (a) 部署可访问 (b) 标识未占用 (c) 凭据合规 (d) **发起者不放弃** (e) **存储最终持续可用** | 注册最终到达可辨认终结结果 | `formal:…-progress`（前提 d/e 对应 `Abandoning=FALSE`、`Failures=FALSE`） |
| R-5 | 注册中途失败且不再重试 | 收敛为「已激活且恰有个人租户」或「不存在可用账号」 | `formal:…-crash` |

**前提缺一不可。**前提不成立时不作任何承诺——不要把 R-4 读成「注册总会成功」。

## 4. 业务规则

### 核心结构：以激活为单一提交点

需求没规定「账号侧与租户侧不一致时哪侧权威」。本设计**不在两侧选权威，而是取消不一致的可能**：

```
1. 产生账号（未激活）   ← 账号存在但不可用
2. 创建个人租户         ← 幂等
3. 激活账号             ← 唯一使账号可用；前置：个人租户已存在
```

「注册成功」⇔「已激活」⇔ 个人租户必然已存在。任何位置失败，账号停在未激活态 =
「不存在可用账号」。**不需要跨能力事务。**

### 操作

```
createAccount(identifier, credential) -> AccountRef
  前置：无（自助注册，不要求调用方已认证）
  后置：账号记录写入，状态为未激活
  失败集合：{ identifier-taken, credential-rejected, storage-unavailable }
  缺席默认：存储不可用 ⇒ 失败，不产生记录
  原子性：单次写入即提交；本操作不使账号可用
  幂等：以 identifier 为边界；既有未激活且同源 ⇒ 返回同一 AccountRef
  依据：PF-026.C1；不变量 A-3、A-4

activate(account, evidence) -> void
  前置：账号存在且未激活；evidence 表明个人租户已存在
  后置：账号可用
  失败集合：{ account-not-found, already-activated, invalid-evidence, storage-unavailable }
  缺席默认：evidence 无法核实 ⇒ 拒绝
  原子性：**这是账号可用性的唯一提交点**
  幂等：已激活时返回成功，不产生第二次效果
  依据：不变量 R-1、R-2

authenticate(identifier, credential) -> SessionRef
  前置：账号存在且**已激活**
  后置：登录态记录写入（持久）
  失败集合：{ rejected, storage-unavailable }
  缺席默认：存储不可用 ⇒ 拒绝
  **「标识不存在」与「凭据错误」必须返回同一失败**，不得区分；
  未激活账号的结果**与账号不存在不可区分**，否则泄漏存在性
  依据：PF-026.C2；不变量 A-4

revokeSession(session) -> void
  前置：持有该登录态，或持有同账号的其他有效登录态
  后置：撤销记录写入（**持久**）
  失败集合：{ session-not-found, storage-unavailable }
  缺席默认：存储不可用 ⇒ 失败（不可静默成功）
  作用范围：**仅被撤销的那一个登录态**；多端范围未确认，见 Q1
  依据：安全性质 A-7

verifySession(session) -> AccountRef | Denied
  缺席默认：**存储不可用或查询失败 ⇒ 拒绝**
  ⚠ 不得把「查不到撤销记录」当作「未撤销」——那会使 A-7 在故障期间失守
  依据：安全性质 A-7

register(identifier, credential) -> Outcome
  Outcome ∈ { registered, identifier-taken, credential-rejected,
              admission-denied, interrupted }
  **无「其他错误」**——C5 要求结果可辨认
  interrupted 是**可辨认的终结结果**，不是中间状态：账号停在未激活态，可同标识重试
  失败不清理记录：收敛定义是「不存在可用账号」，不是「不存在任何记录」
  依据：PF-026.C1/C5；进展性质 R-4、R-5
```

## 5. Cordis 建模

### 5.1 插件与服务面

| 插件 | provide | 操作 | 独立成插件的理由 |
|---|---|---|---|
| `account-identity` | 账号身份 | createAccount / activate / authenticate / revokeSession / verifySession | 变化原因＝认证方式换代；消费者＝所有需验明身份的能力 |
| `tenant-governance` | 租户治理 | createPersonalTenant / checkMembership / … | 变化原因＝组织管理规则；消费者＝所有租户范围对象 |
| `account-registration` | 注册编排 | register | 拥有跨两者的次序与幂等规则 |

### 5.2 依赖与重载

| 消费者 | inject | 能否承受重跑 | 处理 |
|---|---|---|---|
| account-identity | 存储提供者 | 能（操作皆单次提交） | 直接 inject |
| tenant-governance | 存储提供者 | 能 | 直接 inject；**不 inject 账号能力**，成员关系只需身份的值 |
| account-registration | 两个能力 | **不能天真 inject** | 见下 |

**注册编排为什么不能天真 inject**：必需服务换提供者会先卸载再重跑插件体
（basis `plugin-body-reruns-on-provider-change`）。注册是三步流程，
中途状态若活在闭包里，重跑即丢失，而已产生的记录不回滚。

解法不是禁止重跑，是**让重跑安全**：只持有幂等键（登录标识），三步各自幂等，
重跑凭键认回。插件体因此无跨重载状态。

### 5.3 effect 装卸配对

| 资源 | 拥有者与可用时点 | 部分初始化失败 | 撤除时释放 | 撤除后仍为真 |
|---|---|---|---|---|
| 凭据 + 登录态存储句柄 | account-identity fiber，provide 之前 | 同一 effect 内释放已取得部分 | 释放句柄 | 账号记录、登录态记录、撤销记录全部保留 |
| 租户 + 成员存储句柄 | tenant-governance fiber | 同上 | 释放句柄 | 租户与成员关系保留 |
| （无） | account-registration 不取得资源 | — | — | 在途注册等效于崩溃，已由 crash 模型覆盖 |

两个存储句柄注册为**同一个 effect**：effect 之间是并发释放的
（basis `effect-disposal-concurrent-not-ordered`），需要一起完成的资源应合并。

**⚠ 登录态不得实现为 effect。**effect 是内存生命周期，卸载即释放；
撤销记录若随插件卸载消失，重启后 A-7 失守**且不报错**。

### 5.4 事件

| 事件 | 通知/控制 | 派发 | 理由 |
|---|---|---|---|
| 账号已激活 | 通知 | `emit` | 无人据其返回值改变结果 |
| 成员关系已变更 | 通知 | `emit` | 同上 |

本设计**不引入控制类事件**。若将来需要「跨租户访问是否放行」，
**必须 `serial`**：判定要查存储是异步的，`bail` 不 await、Promise 不是 bail 值，
会**静默放行**（basis `async-control-not-bail`）。

**不得把事件接收范围当隔离手段**：不带 thisArg 的 `emit` 不过滤，
`global: true` 监听者绕过过滤。

### 5.5 装配草图

```text
根 ctx
├── account-identity 插件          provide 账号身份
│     └── effect: 凭据 + 登录态存储句柄（合并为一个）
├── tenant-governance 插件         provide 租户治理
│     └── effect: 租户 + 成员存储句柄
└── account-registration 插件      inject [账号身份, 租户治理]
      └── 无 effect；幂等键驱动，插件体可重复执行

数据流（无隐式上下文传递）：
  请求 ──携带── { verifiedAccountRef, targetTenantId }
                 └─→ checkMembership(...)  查不到 ⇒ 拒绝
```

**草图里没有 isolate，没有以租户或账号为键的标签，没有为它们创建的 fiber。**
身份全程是显式数据参数——依据 basis `isolate-hides-instances-not-data`，
可见性维度隔离实例而非数据，用它做租户隔离既无效、又使实例数随租户增长。

## 6. 绑定与证据

| 契约条款 | basis | 证据 | 前提 | 状态 |
|---|---|---|---|---|
| account-identity S-3～S-9 | — | test:…（6 项） | 见各 bindings | 待实现 |
| account-identity S-7 | effect-disposal-concurrent-not-ordered | test:…/revocation-survives-restart | 须真正重启提供者 | 待实现 |
| tenant-governance S-11 | isolate-hides-instances-not-data, async-control-not-bail | test:…/tenant-is-not-a-scope-dimension | 静态检查 | 待实现 |
| account-registration S-1～S-5 | — | **formal:…basic / crash / progress** | 见下 | **已通过** |
| 幂等边界 | plugin-body-reruns-on-provider-change | test:…/rerun-is-idempotent | 须真正触发重跑 | 待实现 |

**形式检查已实际执行**（2026-09-17）：basic 36 状态、crash 72 状态、progress 含时序性质，
三者均无反例。变异测试确认有效性——移除激活的租户前置条件后 `ActivatedHasTenant` 立即被违反。

进展性质的前提：`Failures=FALSE`（存储持续可用）、`Abandoning=FALSE`（不放弃）。
**引用该结论时须带上这两个前提**，不得读成无条件成立。

## 7. 未决项

| 编号 | 什么没定 | 谁能定 | 裁决前怎么办 |
|---|---|---|---|
| Q1 | 撤销作用范围（本机/全设备/多端） | 需求方 | 只实现单一登录态撤销，**不预留猜测的参数** |
| Q2 | 自助注册的验证、限流、滥用处理 | 需求方 | createAccount 不含准入判定；限流叠加在调用侧 |
| Q3 | 新注册账号的初始权益、额度与预算立场 | 需求方 + PF-019/PF-010 owner | `registered` 不承诺任何可用额度 |
| Q4 | 账号终止语义 | 需求方 | 不实现；A-3 唯一性因此在存续期内恒成立 |
| Q5 | 账号恢复与凭据重置 | 需求方 | 不实现 |
| Q6 | pending 表述是否为需求方本意 | 需求方 | 契约不引用该概念，以 A-1/A-4 承担同等保护 |

**不要为任何一项填默认值。**它们在契约中以显式 gap 存在，不是遗漏。

## 8. 实施顺序

| 步骤 | 做什么 | 依赖 | 完成判据 |
|---|---|---|---|
| 1 | 数据形状与存储约束 | — | A-3、A-5 的结构检查通过 |
| 2 | `tenant-governance` 插件 | 1 | `checkMembership` 在存储不可用时返回「不存在」；S-5 前置检查生效 |
| 3 | `account-identity` 插件 | 1 | A-4 不可区分性、A-7 跨重启撤销两项测试通过 |
| 4 | `account-registration` 插件 | 2, 3 | 三个 formal 任务在 CI 中通过；重跑幂等测试通过 |
| 5 | 对抗性旅程演练 | 4 | 每个中断点的越权尝试全部失败 |

第 2 步先于第 3 步：注册编排依赖两者，而租户治理零依赖，可独立验证。
