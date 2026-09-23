# credential-verification 实现设计

## 实现路径与来源

**一个 Cordis 插件，提供一个服务面，本版一个实现：密码。**
密码哈希**不自建**：复用 Node 内置 `crypto.scrypt`（无第三方依赖；`argon2` 需要原生构建，本版不引）。参数（N、r、p、盐长）是本插件 config，**不是** `credential_policy` 的一部分——政策管「一份凭据可不可接受」，哈希参数管「材料长什么样」。

**为什么是插件而不是模块**：它要被 account-identity 在**运行期解析**并可能被**整体换掉**（密码 → OIDC）。换掉一个模块要重新构建消费者；换掉一个服务实例只要装配换 provide。这是 #8 里「独立变化原因」最强的一处，C 给的证据强度是「强」。

**Cordis 版本**：同批节点，采用版本尚无决定。

## 能力到 Cordis 的投影

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-8](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料) 第 1 条：不以可读形式保存 | `credentials.derive(presented) → CredentialMaterial \| 'unavailable'`：材料 = `{ scheme: 'password-scrypt', params, salt, hash }`，**不含明文**；`CredentialMaterial` 是不透明品牌类型，account-identity 只存不读 | 尚未实现；`crypto.scrypt`，Node 内置 | 「不可读」由派生函数的输出形状兑现；静态检查 SC-CV-1 查 account-identity 包内没有对 `CredentialMaterial` 内部字段的访问 |
| S-8「比对方式属实现选择」 | `credentials.verify(material, presented) → 'match' \| 'mismatch' \| 'unavailable'`：按 `material.scheme` 分派；**scheme 不认识 ⇒ `mismatch`**（一份用旧方案存的材料在新实现下不匹配——本版无凭据写路径，因此换方案等于旧账号登不上，**这是换代的产品后果，本节点不静默迁移**）；比对用常量时间比较（`crypto.timingSafeEqual`）——**这不是对 S-22 时序侧信道的承诺**（契约明列不在范围），只是哈希比对的常规做法 | 尚未实现 | 三值返回让 account-identity 无法把「比不了」当成「不匹配」——与全域「不可用 ≠ 无效」同形 |
| [S-26](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy) `credential_policy` | `credentials.checkPolicy(policy: unknown, presented) → 'ok' \| { rejected: reason } \| 'unavailable'`；本节点定义 `policy` 的形状（密码方案：最短长度、字符类别……候选），account-identity 原样透传。`policy` 不合形状 ⇒ `'unavailable'`（⇒ account-identity 给 `credential-rejected`，[S-13 缺席默认](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)：取不到不退化为不校验） | 尚未实现 | 「具体哪条规则不满足」随 `reason` 附带，[契约说它由政策自己描述](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)；`reason` 不进 account-identity 的失败集合，只附在 `credential-rejected` 旁 |
| 凭据的表示层 | `credentials.parse(raw) → Parsed<PresentedCredential>`：缺席、空、非字符串 ⇒ `invalidInput`（account-identity 映射为 `invalid-input`） | 尚未实现 | 表示层与判定分开（identity-values S-33）在凭据这一侧的落点 |

**服务面只有这四个方法。**没有「按标识找材料」——材料在 account-identity 的记录里，本节点看不到账号记录，也不 inject `accounts`（否则换代半径又回去了）。

### 接口对无存储材料的认证方式是否成立

本节点存在的理由是将来换 OIDC／passkey，但四个方法是围绕「有一份存储材料」设计的。**假设**（未验证）：OIDC 下 `derive` 返回一份绑定外部 subject 的材料、`verify` 拿外部断言核 subject；passkey 下材料是公钥、`verify` 核签名。两者都能塞进这个形状，**但 S-13 的输入是「凭据材料」，注册时 OIDC 没有可提交的凭据**——那是契约层面的问题（S-13 输入形状），不是本节点能解的。记为缺口，owner = spec（届时属语义扩张，发新版本）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 无契约依赖；不 inject 任何服务 | — | — | — |
| 哈希参数（config） | 加载时校验（N 为 2 的幂、盐长 ≥ 16 字节等） | 启动 | 非法 ⇒ 启动失败 |
| 被消费：account-identity 在调用时解析 `credentials`（可选依赖） | 本 fiber `ACTIVE` 时可解析 | 换代：装配卸载旧 provide、装载新 provide；期间 account-identity 拿 `unavailable` | 本节点被撤除 ⇒ 登录与注册的凭据步骤失败，其余照常（account-identity 依赖表） |

**不隔离**：本版一个部署一种认证方式，不为多方案并存开 `isolate` 标签。真要并存（迁移期同时接受旧密码与新方案），`verify` 按 `material.scheme` 分派已经够——那是**同一实例内的数据分派**，不是定制实现（手册六问之三：定制数据用覆盖，定制实现才隔离）。

## 状态、并发与失败映射

**无状态、无存储、无提交点。**四个方法都是纯计算（`scrypt` 是 CPU 密集计算，异步执行但无共享状态）。失败只有 `'unavailable'`（计算失败、参数不合）与 `'mismatch'`／`{ rejected }`（判定结论），**两者永远是不同的返回值**。

**并发**：`scrypt` 的内存参数 × 并发数是资源上限问题，归装配（限流是[产品明列的部署运维关注点](../../../../spec/capabilities/account-identity/v1/contract.md#s-3-明确不承诺什么)），本节点不做队列。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验 | 插件体开头 | 抛出即不 provide | — |
| `ctx.provide('credentials')` | 本 fiber；`ACTIVE` 后可解析 | 无第二项，无部分状态 | 撤除：服务消失；在途 `scrypt` 计算跑完后结果丢弃（调用方已收到 `unavailable` 或仍在等——**待核对**：撤除时正在 await 的调用方拿到什么，取决于 account-identity 解析服务的时机；本节点的方法在 fiber 撤除后仍能算完，不依赖 fiber 状态）；**保留**：无（本节点没有事实） |

## 实施缺口与消费者影响

- **只有密码方案有设计**；OIDC／passkey 的接口适用性是假设，S-13 输入形状是契约层缺口。
- **换代的产品后果**（旧材料 ⇒ `mismatch` ⇒ 登不上）本版无凭据写路径可迁移；换代前须由产品裁定迁移策略——这不是本节点能默认的。
- **SC-CV-1**（消费者不得访问材料内部字段）检查器不存在。
- **对入口契约消费者的影响**：[入口契约 S-19](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录) 把 `credential` 的那条解析规则（本节点 `credentials.parse`）的**发布处**定为本节点，据点侧的客户端代理据它得知该送什么。换凭据方案会移动线上 `invalid-input` 的边界，**须发入口契约的新版本**——不得只换本节点的提供者而让入口契约的线上答复悄悄变样。
- 上游语义：不依赖 Cordis 行为，无 basis 引用；被撤除时在途调用的收场待核对。
