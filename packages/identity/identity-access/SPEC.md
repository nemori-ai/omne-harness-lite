# @omne-harness/identity-access 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义。

## 范围与依据

本包是身份领域交给接入层的两样东西（RFC-0015 第 5 节「领域的接入插件怎么写」、第 7 节「协议怎样划分」，提案未接受，范围是候选）：

- `createAccessIdentity(deps)`：入口的身份端口 `AccessIdentity`（[access-cordis-contract](../../access/access-cordis-contract/SPEC.md)）的实现。
- `identityAccessPlugin`（`./cordis`）与 `createIdentityOperations(services)`：`identity/v1`（[identity-protocol](../identity-protocol/SPEC.md)）的接入插件与它的处理函数。

业务规则归身份领域（[身份规格](../identity/SPEC.md) ID-16、ID-17、ID-18）。本包只把公开入口的结果映射成协议的结果，映射与入口旧治理位置（`packages/access/server-entry/src/governance.ts`）相同，规则与入口旧登录步骤（`identity-steps.ts`）相同。

## 结果与不变量

<a id="identify-login"></a>**识别登录。** `identifyLogin(proof)` 把证明原样交给 `recognizeLogin`。`recognized` 答 `identified`；`invalid` 答 `denied`；`basis-unavailable` 或抛出答 `basis-unavailable`。

<a id="act-for"></a>**签发行事主体。** `actFor(login, tenant)` 先把租户文本解析成租户：解析不了，或租户的账号不等于登录的账号，答 `denied`，不调签发者。否则以系统主体（component `server-entry`）签发代该租户行事的主体，`work` 是 `{ owner: 'identity-login', work: <登录文本> }`。签发失败或抛出答 `basis-unavailable`。答出的 `Principal` 就是签发者签发的那个对象。

<a id="report-access"></a>**报告业务访问。** `reportAccess(login)` 调 `reportBusinessAccess`。身份答 `basis-unavailable` 或抛出时 Promise 拒绝；管道把它记成一次诊断，不改答复。

<a id="operations"></a>**处理函数。** 每个操作调身份同名的公开入口，结果按旧治理位置映射。领域服务每次调用现取，取不到答 `basis-unavailable`，协议不撤（RFC-0015 I-5）。处理函数不吞抛出，由管道按效果规则答。`issue-login` 的成功体总带 `loginId`。行事租户类操作的登录与行事租户取自主体，当前选择由治理端口在提交时核对。

## 所有权、失败与生命周期

本包不持有状态。`createAccessIdentity` 只缓存一次签发的系统主体。插件的贡献挂在插件自己的作用域上，卸载插件撤下协议。

## 组合与验证

- `tests/access-identity.spec.ts`：识别、签发、拒绝与不可用。
- `tests/identity-operations.spec.ts`：每个处理函数的成功、各拒绝结果与服务缺席。
- `tests/cordis-entry.spec.ts`：插件挂上完整的贡献，服务缺席时答 `basis-unavailable`。
- 正式装配上的端到端用例在服务端应用：`apps/harness-server/tests/rows/identity-access/release.spec.ts`。
