# 关键流程

本文件描述本包的流程：注册激活、签发登录、识别登录、资格读口、治理写与治理读，以及插件的启动与撤除。参与者是调用方、提供者（主线程）、scrypt 模块、存储提供者（控制侧）、写 Worker 里的参加者、读 Worker 里的读 handler。规则归 [SPEC.md](../SPEC.md)，本文只写时序。

## 流程

### 注册激活（SPEC IS-02）

```mermaid
sequenceDiagram
  participant C as 调用方
  participant P as 提供者
  participant S as scrypt
  participant St as 存储
  participant W as 参加者 identity
  C->>P: registerAndActivate({ loginIdentifier, credential })
  P->>P: 校验非空与字节上界，核对停止标志
  P->>S: derive(credential)
  S-->>P: material 或拒绝
  P->>P: 产生 acc_、org_，组成租户文本
  P->>St: commit(一条 identity 命令，kind=register)
  St->>W: execute(facts)
  W->>W: 查同标识 → conflict，或写五行
  W-->>St: participated / conflict / failed
  St-->>P: committed / rolled_back / rejected / unknown
  P->>St: query（只在 unknown 时，最多三次）
  P-->>C: succeeded / not-loginable / 拒绝 Promise
```

### 签发登录（SPEC IS-04）

```mermaid
sequenceDiagram
  participant C as 调用方
  participant P as 提供者
  participant R as 读 handler issue-basis
  participant S as scrypt
  participant W as 参加者 identity
  C->>P: issueLogin({ loginIdentifier, credential })
  P->>P: 停止标志、时钟、期限、截止时刻
  P->>P: 输入校验 → uniform-auth-failure
  P->>R: read(loginIdentifier)
  R-->>P: 账号行与材料，或没有；登录表可读
  P->>S: verify(材料或假材料, credential)
  S-->>P: match / mismatch / 计算前拒绝
  P->>P: 产生 lgn_、凭证与摘要
  P->>W: commit(一条 identity 命令，kind=issue-login)
  W-->>P: committed（其他结果拒绝 Promise）
  P-->>C: succeeded（含 loginProof，只出现这一次）
```

### 识别登录（SPEC IS-05）

1. 调用方给 `loginProof`。不是非空文本答 `invalid`。
2. 提供者算 SHA-256，读 handler `identity.login-by-proof` 查登录行与撤销行。读不到答 `basis-unavailable`。没有行答 `invalid`。
3. 提供者解析标识、租户文本与三个时刻。解析失败答 `basis-unavailable`。
4. 已撤销答 `invalid`，不读时钟。
5. 提供者读时钟。下界是最晚读数与 `issued_at` 中较晚者。
6. 到达任一截止时刻答 `invalid`，否则答 `recognized`，`tenant` 是当前选择。

识别不写任何东西。

### 资格读口（SPEC IS-06）

1. 调用方给 `tenant`。提供者编码租户文本，算证据的 `record`。
2. 不能编码时直接答 `not-member`，不读行。
3. 读 handler `identity.standing` 查成员行。读不到答 `unavailable`。
4. 没有行或 `state` 不是 `active` 答 `not-member`，证据修订号 `'0'`。
5. 有行时按 `DEFAULT_TEAM_ROLE_MAPPING` 解析资格。映射失败答 `unavailable`。成功答 `member`，证据修订号取自行。

### 治理写（SPEC IS-10）

```mermaid
sequenceDiagram
  participant C as 调用方
  participant P as 治理端口
  participant R as 读 handler governance
  participant W as 参加者 identity
  C->>P: 例如 removeMember({ login, actingTenant, organization, account, expectedRole })
  P->>P: 停止标志、读时钟并采用、编码 login 与 actingTenant
  P->>P: 新标识、截止时刻、排序键，输入形状
  opt 发出邀请或空闲刷新
    P->>R: 预读 account-of 或 login-terms
    R-->>P: 账号或空闲时长
  end
  P->>W: commit(一条 identity 命令)
  W->>W: 1 发起登录有效、选择等于 actingTenant
  W->>W: 2 行动者角色
  W->>W: 3 预期状态与最后管理员保护
  W->>W: 写入，或什么都不写
  W-->>P: participated，响应带 outcome
  P->>P: unknown 时 query 认回，最多三次
  P-->>C: 治理结果 / 拒绝 Promise
```

### 治理读（SPEC IS-11）

1. 提供者读时钟并采用，编码 `login`，行事查询再编码 `actingTenant`。
2. 读 handler `identity.governance` 在一个快照里核对发起登录与选择，不成立答 `denied`。
3. handler 按可见性答 `not-visible` 或 `denied`，或读出对象。名单超过 1000 项时这次读失败。
4. 提供者解析输出。读失败或输出畸形答 `basis-unavailable`，名单不带数组。

### 插件启动与撤除（docs/cordis.md）

启动：校验配置 → 打开 scrypt → 派生假材料 → `registerCombination`（001 的域在这一步执行 002）→ 构造提供者 → 提供三个键 → 登记 effect。任一步失败时关闭已打开的 scrypt 并抛错。

撤除：`stop()` → `await close()`。之后旧引用按 IS-07 作答。

## 失败与生命周期

| 失败点                                     | 结果                                                 | 谁收场                                 |
| ------------------------------------------ | ---------------------------------------------------- | -------------------------------------- |
| scrypt 计算前拒绝、`done` 为 `unavailable` | 注册 `not-loginable`，签发 `basis-unavailable`       | 提供者，没有写入                       |
| 读 handler `unavailable`、输出畸形         | 签发与识别 `basis-unavailable`，读口 `unavailable`   | 提供者，没有写入                       |
| 参加者 `conflict`、SQL 约束错误            | 存储明确回滚，注册 `not-loginable`。签发拒绝 Promise。治理 `basis-unavailable` | 存储提供者回滚，提供者映射 |
| 治理核对不成立                             | 参加者照常提交，响应带 `denied`、`not-visible`、`conflict` 或 `no-change`，不写入 | 参加者 |
| 提交 `unknown`                             | 用同一身份 `query` 认回。认不回时拒绝 Promise        | 调用方按 ID-17 或 ID-18 认回           |
| 时钟倒退、不可得                           | `basis-unavailable`                                  | 提供者，不采用读数                     |
| `stop()` 之后的新调用                      | IS-07 的答复                                         | 提供者                                 |
| `stop()` 之前已受理的调用                  | 跑完，按以上映射作答                                 | 提供者与 scrypt `close` 等已开始的计算 |
| 进程崩溃                                   | 已 `committed` 的事实保留。重启后 DO-1 恢复域        | 存储提供者                             |

提供者没有定时器、连接或 Worker。丢弃它不需要清理动作。scrypt 模块由插件体关闭，存储由装配关闭。
