# @omne-harness/identity-protocol 行为规格

本包只有一个值 `identityProtocol` 与它的类型 `IdentityProtocol`：公开协议 `identity/v1` 的协议契约。公开形状归 `src/` 的定义，导航归 [docs/public-api.md](docs/public-api.md)。本文件写这份契约从哪来、和旧的身份家族差在哪、哪些性质由它保证。契约是纯数据，没有生命周期与副作用。

## 范围与依据

设计依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 3 节「共同契约」、第 7 节「协议怎样划分」与第 16 节「成员怎么放，依赖方向」，交付卡 #1266。协议契约的写法（`defineProtocol`、`ruleCodec`、规则的种类与叶子、固定结果）归[公开契约规格](../../access/SPEC.md#协议契约与编解码)「共同契约」。

不在本包：处理函数与接入插件（`identity-access`，未建）；客户端；身份一侧的 `AccessIdentity` 实现。操作的业务含义归[身份规格](../identity/SPEC.md)。

## 结果与不变量

### 协议与操作清单

协议名 `identity`，主版本 1，没有观察。操作恰好 33 个，取自旧家族 `governance-public/1` 已提供的 38 个操作，去掉 `public-health`（RFC-0015 否决）与设置的四个（`list-settings`、`set-setting`、`describe-setting`、`clear-setting`，归 `assets/v1`）。旧家族的四个阶段操作（`disable-subject`、`restore-subject`、`end-subject`、`reopen-after-media-loss`）不进契约。

现在部署不提供的操作照样在契约里：契约是完整的，提不提供是部署的事，不提供的由处理函数答 `stage-not-provided`。

### 三栏

每个操作的三栏按 RFC-0015 第 7 节「操作怎样分进去」机械地得到：

- 身份要求：旧家族不要登录证明的（`register-and-activate`、`issue-login`）是 `none`；要登录证明不要行事租户的是 `login`；两样都要的是 `acting-tenant`。
- 效果：名字以 `query-` 开头的与 `judge-admission` 是 `read`，其余是 `commit`。
- 消息体上限：都是 `small`。

### 结果

每个操作的结果是旧家族的业务结果，加 `defineProtocol` 并进来的管道结果（`protocol-rejected`、`basis-unavailable`；身份要求不是 `none` 的加 `denied`；提交类加 `unknown`），再加 `stage-not-provided`。

- `stage-not-provided`：旧家族的部署可以声明任何已提供的操作不提供（公开契约 `codec.ts` 的 `isRefusal`：家族有阶段操作或 `declarable` 为真时，每个操作都可答它；身份家族两条都成立），所以 33 个操作都写 `'stage-not-provided': true`。
- `query-create-organization` 是 `read`，但它读回的是一次早先的创建调用，结果可能仍然不知道，所以在契约里手写 `unknown: true`。
- 固定结果（`denied`、`unknown`、`basis-unavailable`、`protocol-rejected`、`stage-not-provided`、`uniform-auth-failure`）在契约里只写 `true`，响应体恒为空（RFC-0015 I-13）。

### 登录证明只在 issue-login 的成功体里

只有 `issue-login` 标 `carriesCredential: true`：它的成功体带登录证明 `loginProof`，通用通道不转发它。别的操作的任何结果体都没有登录证明。身份的操作都不标 `countsAsAccess`：业务访问由会话的操作报告（RFC-0015 第 7 节）。

### 和旧家族的差别

消息体、各结果的体与规则从旧家族原样带过来，差别只有三处：

1. `issue-login` 成功体的 `loginId` 从可选改成必有（RFC-0015 第 7 节「登录的签发一定返回登录的编号」）。
2. `defineProtocol` 并进来的管道结果，见上节。由此 `register-and-activate` 多一个 `basis-unavailable`。
3. 信封不在契约里：协议版本、消息编号、操作名、登录证明、行事租户都由共同契约的外层承载。消息体里原有的字段（如 `switch-current-tenant` 的 `tenantId`）照旧在消息体里。

规则推出的类型与旧的手写类型在两处写法上不同，取值的集合相同：空对象推成 `{}`，旧家族写 `Readonly<Record<string, never>>`；`query-own-valid-logins` 的 `logins` 规则带 `nonempty`，推出的类型是只读数组，旧家族写成非空元组。读的时候空数组照样被拒。

### 规则文本是复制来的

规则文本从公开契约成员 `packages/access/public-contract/src/operation-rules.ts` 复制到本包的 `src/rules.ts`，归属搬到身份。公开契约里的那一份由接入插件那一程（`identity-access`）删除；在那之前两份并存，内容相同。

## 所有权、失败与生命周期

本包不持有状态，不做输入输出，没有生命周期。`identityProtocol` 是 `defineProtocol` 返回的不可再变的值；读写失败由编解码答 `{ ok: false }`，不抛出。

## 组合与验证

| 义务                                                                        | 验证                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [协议与操作清单](#协议与操作清单)、[三栏](#三栏)                            | `tests/identity-protocol.spec.ts`「C1」：遍历全表；`tests/shapes.spec-d.ts` 核操作名集合                                                                                                      |
| [结果](#结果)                                                               | `tests/shapes.spec-d.ts`「C4」；`tests/identity-protocol.spec.ts`「C1」核每个操作可答的固定结果                                                                                               |
| [和旧家族的差别](#和旧家族的差别)                                           | `tests/shapes.spec-d.ts`「C2」：每个操作的消息体与各结果的体和旧类型相同，差别逐处写明；`tests/identity-protocol.spec.ts`「C3」：每个操作一份合规样本读出的值与旧家族相同，不合规样本两边都拒 |
| [登录证明只在 issue-login 的成功体里](#登录证明只在-issue-login-的成功体里) | `tests/identity-protocol.spec.ts`「C5」；`tests/shapes.spec-d.ts`「C5」                                                                                                                       |
| 纯成员，能在浏览器里用（RFC-0015 I-18）                                     | `tests/browser-fixture.spec.ts`（慢层）：不带 Node 类型、带 DOM 库的消费者工程编过根入口；源码只导入 `@omne-harness/public-contract`                                                          |

依赖方向：源码只依赖 `@omne-harness/public-contract`。还没有依赖规则守本包（规则在 `tools/repo-config`，另做）；领域核心不依赖本包（I-17）也还没有门禁。
