# credential-verification 实现设计

## 实现路径与来源

**一个 Cordis 插件，提供一个服务面，本版一个实现：密码。**
密码哈希**不自建**：复用 Node 内置 `crypto.scrypt`（无第三方依赖；`argon2` 需要原生构建，本版不引）。参数（N、r、p、盐长）是本插件 config，**不是** `credential_policy` 的一部分——政策管「一份凭据可不可接受」，哈希参数管「材料长什么样」。

**为什么是插件而不是模块**：它要被 account-identity 在**运行期解析**并可能被**整体换掉**（密码 → OIDC）。换掉一个模块要重新构建消费者；换掉一个服务实例只要装配换 provide。这是 #8 里「独立变化原因」最强的一处，C 给的证据强度是「强」。

**Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（D-025）。

## 能力到 Cordis 的投影

插件 `credentialsPlugin`（插件名 `credential-verification`，不 inject 任何服务）以服务名 `CREDENTIALS_SERVICE`＝`'credentials'` provide 一个 `CredentialsService`（密码实现 `src/service.ts`）；名字是实名，源码已实现（HUB `c9b5850`）。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-8](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料) 第 1 条：不以可读形式保存 | `credentials.derive(presented) → Promise<CredentialMaterial \| 'unavailable'>`：材料是一个自描述字符串 `$password-scrypt$v=1$n=<N>,r=<r>,p=<p>$<盐>$<哈希>`（方案名 `PASSWORD_SCRYPT_SCHEME`，盐与哈希 base64url 无填充），**不含明文**；参数写在材料里，比对按材料里的参数做，换派生参数不影响已存材料；`CredentialMaterial` 是不透明品牌字符串，account-identity 只存不读；随机源或计算失败 ⇒ `'unavailable'`，不返回半份材料 | 已实现（`src/scrypt.ts`）；`crypto.scrypt`，Node 内置 | 「不可读」由派生函数的输出形状兑现；静态检查 SC-CV-1（ts-checks 规则 `sc-cv-1`）查 `tenancy/*` 除本包外没有对 `CredentialMaterial` 值的成员访问或解析 |
| S-8「比对方式属实现选择」 | `credentials.verify(material, presented) → Promise<VerifyResult>`（`'match' \| 'mismatch' \| 'unavailable'`）：按材料里的方案名分派；**scheme 不认识 ⇒ `mismatch`**（一份用旧方案存的材料在新实现下不匹配——本版无凭据写路径，因此换方案等于旧账号登不上，**这是换代的产品后果，本节点不静默迁移**）；比对用常量时间比较（`crypto.timingSafeEqual`）——**这不是对 S-22 时序侧信道的承诺**（契约明列不在范围），只是哈希比对的常规做法。本方案但材料损坏（段数、版本、参数、盐或哈希不合，或参数超出 `scryptParametersValid` 的上界）或计算失败 ⇒ `'unavailable'`，不折成 `mismatch` | 已实现（`src/scrypt.ts`） | 三值返回让 account-identity 无法把「比不了」当成「不匹配」——与全域「不可用 ≠ 无效」同形 |
| [S-26](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy) `credential_policy` | `credentials.checkPolicy(policy: unknown, presented) → PolicyCheck`（`'ok' \| { rejected: reason } \| 'unavailable'`，同步）；本节点定义 `policy` 的形状 `PasswordPolicy`：`{ minLength: 正整数（按 Unicode 标量值计）, requiredCharacterClasses?: ('lowercase' \| 'uppercase' \| 'digit' \| 'symbol')[] }`，多余成员即不合形状；account-identity 原样透传。`policy` 不合形状 ⇒ `'unavailable'`（⇒ account-identity 给 `credential-rejected`，[S-13 缺席默认](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)：取不到不退化为不校验）；不满足 ⇒ `reason` 逐条指认规则（`min-length:<n>`、`character-class:<类别>`，逗号分隔），不含凭据本身 | 已实现（`src/policy.ts`） | 「具体哪条规则不满足」随 `reason` 附带，[契约说它由政策自己描述](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)；`reason` 不进 account-identity 的失败集合，只附在 `credential-rejected` 旁 |
| 凭据的表示层 | `credentials.parse(raw) → Parsed<PresentedCredential>`：缺席、空、非字符串 ⇒ `invalidInput`（account-identity 映射为 `invalid-input`）；**不查字符串是否 well-formed**（孤立代理码点照收，见[缺口](#实施缺口与消费者影响)） | 已实现（`src/service.ts`） | 表示层与判定分开（identity-values S-33）在凭据这一侧的落点 |

**服务面只有这四个方法。**没有「按标识找材料」——材料在 account-identity 的记录里，本节点看不到账号记录，也不 inject `accounts`（否则换代半径又回去了）。

### 接口对无存储材料的认证方式是否成立

本节点存在的理由是将来换 OIDC／passkey，但四个方法是围绕「有一份存储材料」设计的。**假设**（未验证）：OIDC 下 `derive` 返回一份绑定外部 subject 的材料、`verify` 拿外部断言核 subject；passkey 下材料是公钥、`verify` 核签名。两者都能塞进这个形状，**但 S-13 的输入是「凭据材料」，注册时 OIDC 没有可提交的凭据**——那是契约层面的问题（S-13 输入形状），不是本节点能解的。记为缺口，owner = spec（届时属语义扩张，发新版本）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 无契约依赖；不 inject 任何服务 | — | — | — |
| 哈希参数（config `CredentialVerificationConfig`，严格对象） | `cost`（N，缺省 2^17）、`blockSize`（r，缺省 8）、`parallelization`（p，缺省 1）、`saltBytes`（16～64，缺省 16）、`keyBytes`（16～64，缺省 32）；缺省值取 OWASP Password Storage Cheat Sheet 对 scrypt 的最低建议（**假设，须按 source-check 取证**）。加载时校验：N 为 ≥ 2 的 2 的幂且 ≤ 2^20、r ≤ 32、p ≤ 16、单次内存 128·N·r ≤ 512 MiB | 启动 | 非法 ⇒ config 校验不过 ⇒ 启动失败 |
| 被消费：account-identity 在调用时解析 `credentials`（可选依赖） | 本 fiber `ACTIVE` 时可解析 | 换代：装配卸载旧 provide、装载新 provide；期间 account-identity 拿 `unavailable` | 本节点被撤除 ⇒ 登录与注册的凭据步骤失败，其余照常（account-identity 依赖表） |

**不隔离**：本版一个部署一种认证方式，不为多方案并存开 `isolate` 标签。真要并存（迁移期同时接受旧密码与新方案），`verify` 按 `material.scheme` 分派已经够——那是**同一实例内的数据分派**，不是定制实现（手册六问之三：定制数据用覆盖，定制实现才隔离）。

## 状态、并发与失败映射

**无状态、无存储、无提交点。**四个方法都是纯计算（`scrypt` 是 CPU 密集计算，异步执行但无共享状态）。失败只有 `'unavailable'`（计算失败、参数不合）与 `'mismatch'`／`{ rejected }`（判定结论），**两者永远是不同的返回值**。

**并发**：`scrypt` 的内存参数 × 并发数是资源上限问题，归装配（限流是[产品明列的部署运维关注点](../../../../spec/capabilities/account-identity/v1/contract.md#s-3-明确不承诺什么)），本节点不做队列。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验 | `definePlugin` 的 `Config` 在插件体之前校验（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)） | 不过即 fiber `FAILED`、不 provide | — |
| `ctx.provide(CREDENTIALS_SERVICE, …)` | 本 fiber；`ACTIVE` 后可解析 | 无第二项，无部分状态 | 撤除：服务消失；在途 `scrypt` 计算跑完，结果照常交给已经握着服务引用的调用方（本节点的方法不依赖 fiber 状态）；此后才解析 `credentials` 的调用方得到缺席，收场归 account-identity 依赖表；**保留**：无（本节点没有事实） |

## 实施缺口与消费者影响

- **只有密码方案有设计**；OIDC／passkey 的接口适用性是假设，S-13 输入形状是契约层缺口。
- **换代的产品后果**（旧材料 ⇒ `mismatch` ⇒ 登不上）本版无凭据写路径可迁移；换代前须由产品裁定迁移策略——这不是本节点能默认的。
- **SC-CV-1**（消费者不得访问材料内部字段）由 ts-checks 规则 `sc-cv-1` 承担；品牌断言本身不算违反，经别的变量转手后再解析不在它的覆盖内。
- **`parse` 不查孤立代理码点**：两个不同的 JS 字符串若只在孤立代理码点上不同，UTF-8 编码后同为 U+FFFD，会派生出同一份材料。在 `parse` 里加 well-formed 判定会移动入口契约 v1 线上 `invalid-input` 的边界（[入口契约 S-19](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录)），须入口契约新版本；本版不改。owner：入口契约的 spec owner。
- **对入口契约消费者的影响**：[入口契约 S-19](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录) 把 `credential` 的那条解析规则（本节点 `credentials.parse`）的**发布处**定为本节点，据点侧的客户端代理据它得知该送什么。换凭据方案会移动线上 `invalid-input` 的边界，**须发入口契约的新版本**——不得只换本节点的提供者而让入口契约的线上答复悄悄变样。
- 上游语义：只依赖 basis `plugin-throw-fails-fiber`（config 非法即启动失败）；被撤除时在途调用照常算完，见装卸表。
