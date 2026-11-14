# 身份接入行

`identity-access` 行装身份的接入插件 `identityAccessPlugin`（`@omne-harness/identity-access/cordis`），把协议 `identity/v1` 挂上入口的登记表。装这一行就是开放这个协议，卸下这一行协议随之撤下（RFC-0015 I-15）。操作的消息体与结果集归 [identity-protocol](../../../../packages/identity/SPEC.md#协议与接入)，处理函数与身份端口归 [identity-access](../../../../packages/identity/SPEC.md#协议与接入)。

## 行声明与依赖

- 提供：无。插件只把贡献挂上 `accessRegistry`。
- 注入：`accessRegistry`，由 `server-entry` 行提供。`server-entry` 行没有就绪时，本行停在等待。
- 按调用现取：`identityOperations` 与受信 `identityGovernance`，两项都由 `identity` 行提供。受信表把 `identityGovernance` 列给本行。服务缺席时，用到它的调用答 `basis-unavailable`，协议不撤。
- 配置：无。生命周期 `none`，没有关闭阶段。

## 入口的身份端口

新地址识别登录、签发行事主体与报告业务访问都经入口的身份端口 `AccessIdentity`。`server-entry` 行用身份的 `createAccessIdentity` 构造它：识别登录读按调用取的 `identityOperations`，报告业务访问读 `identityGovernance`，签发主体用 `server-entry` 行注入的受信 `principalIssuer`。规则与入口旧位置的登录步骤相同：目标租户的账号必须等于登录的账号，否则答 `denied`。这处签发位置登记在装配页的持有者表与 `scripts/aa-trust-config.json` 的白名单里。

## 发行登记

发行层（`config/serve.distribution.json`、`config/s0.distribution.json`、`src/s0/aa-rows.json`）把本行列在 `server-entry` 之后。替身清单（`src/s0/stubs.ts`）只登记它注入 `accessRegistry`。

## 验证入口

`tests/rows/identity-access/release.spec.ts` 在正式装配上核：可用性的快照里有 `identity/v1`；经 `/api/identity/v1/register-and-activate` 注册、`/api/identity/v1/issue-login` 登录，答复带登录证明与登录编号；带着登录证明调 `/api/identity/v1/query-current-tenant` 答 `succeeded` 与注册时的租户，不带登录证明答 `denied`。

```sh
cd apps/harness-server && NO_COLOR=1 pnpm exec vitest run --mode slow tests/rows/identity-access
```
