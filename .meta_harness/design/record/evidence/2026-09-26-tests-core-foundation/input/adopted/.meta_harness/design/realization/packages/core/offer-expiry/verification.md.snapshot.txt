# offer-expiry 验证与证据

契约侧的证据义务权威在 [`spec/data/offer-expiry/verification.md`](../../../../spec/data/offer-expiry/verification.md)。
那张表里的义务**绝大多数落在消费者**（拥有发出／撤回／接受与读面的能力契约的提供者，本版即 [organization-governance](../../tenancy/organization-governance/verification.md)）；
本页只登记**本模块自己能证的那一小部分**——判定函数与解析器的行为。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-8](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式) 判定式与求值次序 | `deriveState` 单元测试：终结记录优先（`settled='withdrawn'` 且 `now > expiresAt` ⇒ `withdrawn` 不是 `expired`）；严格不等号（`now === expiresAt` ⇒ `pending`）；`target='absent'` ⇒ `expired` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`derive.spec.ts` › `deriveState（S-8 判定式与求值次序）` › `终结记录优先…`、`严格不等号…`、`指向对象不存在 ⇒ expired…` | 本节点 |
| [S-20](../../../../spec/data/offer-expiry/v1/contract.md#s-20-不可用--不存在) 不可用 ≠ 不存在 | 单元测试：`now='unavailable'` 或 `target='unavailable'` ⇒ 返回 `'unavailable'`，**不是** `pending` 也不是 `expired`；且有终结记录时仍返回终结记录（①在②之前） | **已通过**（同 run）：同 describe › `S-20：now 或 target 不可用 ⇒ unavailable…`、`S-20 与终结记录的次序…` | 本节点。**这条只证纯函数**；契约 verification 要求的故障注入（让读面真的读不到）在消费者节点 |
| [S-13](../../../../spec/data/offer-expiry/v1/contract.md#s-13-接受路径上三种来路给同一个拒绝值) | `acceptable` 对 `expired`／`withdrawn`／`accepted` 三值返回同一个 `false` | **已通过**（同 run）：`derive.spec.ts` › `acceptable（S-13）` › `pending 为真；三种来路同一个 false` | 本节点；「逐字相同的失败值」在消费者节点的 S-24 三支同跑里证 |
| [S-4](../../../../spec/data/offer-expiry/v1/contract.md#s-4-offertiming)／[S-14](../../../../spec/data/offer-expiry/v1/contract.md#s-14-offer_ttl) | `timingFrom` 与 `parseOfferTtl` 单元测试：`0`、负数、`NaN`、`Infinity`、非数值 ⇒ `invalidInput`；`undefined` 不进解析器（缺席由调用方分流） | **已通过**（同 run）：`derive.spec.ts` › `timingFrom / parseOfferTtl（S-4 / S-14）`（4 条） | 本节点。「指定值拒绝、默认值启动失败」两路的收场在消费者节点与装配 |
| [S-22](../../../../spec/data/offer-expiry/v1/contract.md#s-22-schema-的范围) 形状 | Schema 副本逐字节核对 + 正反实例过 `validate` | **已通过**（同 run）：`schema.spec.ts` › `Schema 副本` › `与 spec 目录的规范工件逐字节相同`、`Schema 自带的 examples 与 x-counterexamples 逐条核对`（10 条）；`time.spec.ts`（6 条）；副本逐字节另有该 run 的独立核对（`63a8ccb4…`，与 `frozen.json` 相同） | 本节点 |
| 三条 lint 规则 SC-OE-1～3（[design.md](design.md#静态检查义务怎么承载)） | 规则实现 + 「故意违反就失败」自测 | **部分**（同 run）：三条规则都在，自测通过——SC-OE-1 `tools/ts-checks/tests/consumer-rules.spec.ts` › `sc-oe-1`（3 条）、SC-OE-2 同文件 › `sc-oe-2`（3 条）、SC-OE-3 `tools/ts-checks/tests/rules.spec.ts` › `no-wall-clock`（1 条）；`pnpm run lint:rules` 在真实源码上 PASS。SC-OE-3 的自测只点名 `Date.now()`，义务里的 `new Date()`、`performance.now` 没有同名用例 | 本节点提供规则，消费者包 CI 跑 |

**受阻项**：无。原先写的「`Instant` 表示选型未定前 S-8 的测试写不了」已不成立——S-8 的测试已写成并通过（本包的 `Instant` 是品牌化数值，见 `types.spec-d.ts` › `编译期挡住的条款` 的用例名）。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 包内测试 | `packages/core/offer-expiry/tests/`：`derive.spec.ts`（终结优先、严格不等号、`unavailable` 传播、指向对象不存在 ⇒ `expired`）、`time.spec.ts`（RFC 3339 解析与偏移、非法时长拒绝、两路默认／指定）、`schema.spec.ts`（Schema 副本逐字节；examples 与 `x-counterexamples` 正反实例）、`testing.spec.ts`（`testClock` 只前推）、`types.spec-d.ts` | 31 条通过、类型测试无错误 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) | 源码提交 `c9b5850`；同上五个测试文件，纯模块单元测试与类型测试，时间一律由测试给定（`testClock` 只前推），不涉存储；另含 `tools/ts-checks` 里 SC-OE-1～3 三条规则的自测与 `pnpm run lint:rules` 对真实源码的扫描；Node v24.18.0、vitest 4.1.11，单进程 | build、typecheck 退出 0；31 条用例 **31 通过**、0 跳过、0 失败（类型测试 3 条，无类型错误）；`lint:rules` 退出 0（20 条规则，扫 `packages/`、`apps/`） | [`output/offer-expiry.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/offer-expiry.log)、[`json/offer-expiry.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/offer-expiry.json)、规则自测 [`output/ts-checks.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/ts-checks.log)、[`output/_lint-rules.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/_lint-rules.log)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagescoreoffer-expiry) |

两次 formal evidence run（`2026-09-22-formal-tenant-domain`、`-2`）**不覆盖本契约**——它不建形式工件，契约 verification 已明写。

**有限检查不写成无条件证明。**上面的测试证的是纯函数与解析器对给定输入的判定，在 Node v24.18.0 这一次、单进程下成立；`now` 由测试给出，不证任何真实时间源的行为（那一半归 `infra/clock` 与装配）。静态规则只扫 `lint:rules` 那一次看到的源码。**通过不提升契约或本节点的任何接受状态。**

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **SC-OE-3 的自测只点名 `Date.now()`**：义务里的 `new Date()`、`performance.now` 没有同名用例，规则对它们会不会红没有直接证据。owner：本节点提出、`tools/ts-checks` 补自测用例。

其余不在本节点证据范围内的：

- **四条规范场景 S-23～S-26 一条也不在本节点跑**：它们需要真实的发出／撤回／接受路径与存储，owner 是 organization-governance（邀请、隶属请求）；资产那两类**无 owner**（[G-2／G-6](../../../../spec/data/offer-expiry/v1/contract.md#八已知缺口)）。
- **S-17 五行装配给保证**在本节点没有可跑的证据形式，是装配设计的选型声明 + 架构评审；其中第 5 行「`now` 不后退」的承接者 [`infra/clock`](../../infra/clock/verification.md) 在同一次 run 里有包内测试通过，装配一侧见 [`apps/tenancy-host`](../../../apps/tenancy-host/verification.md)——那些是承接者的证据，不记作本节点的。
- **「插件体抛出 ⇒ 启动失败」**：kernel-basis 的 probe `plugin-throw-fails-fiber.test.ts` 在同一次 run 里通过（4.0.4；已升格为 basis 条目 [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)），不再是待核对主张；S-14 默认值那一路的收场由消费者节点与装配的启动失败测试承担。
