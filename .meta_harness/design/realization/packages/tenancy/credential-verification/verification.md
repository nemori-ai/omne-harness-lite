# credential-verification 验证与证据

契约侧没有单独为凭据形式登记的场景：[S-31](../../../../spec/capabilities/account-identity/v1/contract.md#s-31-三种登录失败反馈完全一致)、
[S-34](../../../../spec/capabilities/account-identity/v1/contract.md#s-34-同标识两路对比) 的演练需要本节点的一个真实实现，但那两条的 owner 是 [account-identity](../account-identity/verification.md)。
本页只登记本节点自己能证的部分。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-8](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料) 第 1 条 | 单元测试：`derive` 的输出不含输入明文的任何子串；同一明文两次派生盐不同 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`obligations.spec.ts` › `credential-verification · 证据义务` › `S-8 第 1 条：derive 的输出不含输入明文的任何子串…` | 本节点 |
| `verify` 三值 | 单元测试：正确密码 ⇒ `match`；错误 ⇒ `mismatch`；材料 scheme 不认识 ⇒ `mismatch`；参数损坏 ⇒ `unavailable`（**不是** `mismatch`） | **已通过**（同 run）：同 describe › `verify 三值：…`；类型层另有 `types.spec-d.ts` › `verify 恰三值` | 本节点 |
| [S-26](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy) | 单元测试：政策不合形状 ⇒ `unavailable`；不满足 ⇒ `{ rejected: reason }` 且 reason 指认具体规则 | **已通过**（同 run）：同 describe › `S-26：政策不合形状 ⇒ unavailable；不满足规则 ⇒ rejected 携理由；满足 ⇒ ok` | 本节点 |
| SC-CV-1 | lint：account-identity 包不访问 `CredentialMaterial` 内部字段 | **已通过**（同 run）：`tools/ts-checks/tests/consumer-rules.spec.ts` › `sc-cv-1`（3 条，含对真实 AI 源码的变异核对）；`pnpm run lint:rules` 在真实源码上退出 0。本包内同名占位**跳过**（占位原因写「归 W2-C」） | 本节点提供规则 |
| 换代演练 | 集成：卸载本插件、装载另一实现，观察 account-identity 与 organization-governance 的 fiber **不重跑**（重启半径论证的直接证据） | **已通过**（同 run）：`apps/tenancy-host/tests/lifecycle.spec.ts` › `assembly.credentials-swap-no-rerun（CV 换代演练）`；本包内同名占位**跳过**（占位原因写「归 W3-A」） | 装配节点 + 本节点；依赖「可选依赖不触发重跑」——已由 basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md) 核过（4.0.4） |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) | 源码提交 `c9b5850`；`tests/obligations.spec.ts`（单元测试与插件装载，`bootAssembly`）、`tests/types.spec-d.ts`；Node v24.18.0（内置 OpenSSL 3.5.7）、vitest 4.1.11，单进程；另含 `tools/ts-checks` 的 `sc-cv-1` 自测、`lint:rules`，与 `apps/tenancy-host` 的换代演练（sqlite 临时文件库、经 `boot()` 装出的整套装配） | build、typecheck 退出 0；本包 14 条用例 **12 通过、2 跳过**、0 失败（类型测试 5 条，无类型错误）——跳过的两条是本包内指向别处的占位，它们指向的那两件在同 run 里另有承担者（上表） | [`output/credential-verification.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/credential-verification.log)、[`json/credential-verification.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/credential-verification.json)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagestenancycredential-verification) |

**有限检查不写成无条件证明。**单元测试在 Node v24.18.0 的 `node:crypto`（OpenSSL 3.5.7）上、单进程下成立；派生参数取的是测试用的参数，不说明生产参数下的代价与强度（强度不在契约承诺里）。换代演练只在单机装配、sqlite 上跑过一次。**通过不提升本节点的任何接受状态。**

## 覆盖缺口

按上面这次 run 的对应清单，义务表每一行都有通过的承担者。**跳过不是通过**：本包内两条占位（SC-CV-1、换代演练）仍是 `it.skip`，它们指向的事由别处的用例承担——是否把占位改成指向承担者的注释，归本包 owner。

其余：

- OIDC／passkey 没有实现也没有测试，接口适用性是假设。
- 时序侧信道**不在任何义务里**——契约明列不承诺，本节点也不声称。
