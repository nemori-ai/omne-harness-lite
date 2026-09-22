# ts-checks

产品源码（`packages/`）的结构检查：契约与 realization 节点 verification 点名的静态检查，
每条规则只看文本与路径（便宜、可自测），不做类型分析。类型层的检查（失败集合闭合等）
在各包的 `tests/*.spec-d.ts` 里，不在这里。

| 规则 | 来源 | 查什么 |
|---|---|---|
| `no-wall-clock` | offer-expiry 节点 SC-OE-3 | `core/`、`tenancy/` 源码里不得出现 `Date.now()`、无参 `new Date()`、`performance.now()`；`infra/` 与测试豁免 |
| `no-bail-control` | basis `async-control-not-bail` | 不得调用 `ctx.bail(`，异步控制走 `serial` |
| `no-testing-import` | apps/tenancy-host verification | 产品源码不得 import `@omne-harness-lite/*/testing` |
| `restricted-call-sites` | account-identity S-30、organization-governance S-42 | `accounts.produce(` 与 `'organization-purge'` 只出现在 `tenancy/account-registration`（及定义它们的包） |

```sh
pnpm run lint:rules          # 根：扫描 packages/，有违反即退出 1
pnpm --filter @omne-harness-lite/ts-checks test   # 规则自测
```

加规则：在 `src/rules/` 写一个 `Rule`，登记进 `src/index.ts` 的 `RULES`，并在 `tests/rules.spec.ts`
补「故意违反就失败」的夹具。规则的来源条款写进 `source` 字段。
