# kernel-basis 验证与证据

本节点没有契约侧的证据义务权威。义务来自三处：[D-025](../../../../record/decisions/cordis-adoption-version/decision.md) 的闭合条件（八条 probe 在 4.0.4 上通过）、
[basis 准入](../../../../basis/README.md#准入)（每条条目一个会失败的 probe）、本节点声称给出的共用件与 `./testing`。
每条 probe 断言什么、4.0.4 上的结果、什么语义消失时会红，正文在 [design.md「读数与 probe 结果」](design.md#读数与-probe-结果)；本页只登记义务与状态。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) | probe `tests/basis/isolate-hides-instances-not-data.test.ts`：跨标签实例共享数据句柄可读；同标签重复 provide 抛错；同 label 两次 isolate 合流 | **已通过**（4.0.4，run `2026-09-23-tests-tenancy-leg-2`）：`basis/isolate-hides-instances-not-data.test.ts`（2 条）；条目 `probe`／`version`／`checked` 已回填。owner 栏要补的那一条同 run 没有同名用例 | 「子 isolate 解析父标签服务抛错不回退」未断言——本节点补一条 |
| basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md) | probe `async-control-not-bail.test.ts`：`bail` 把 Promise 当 bail 值、交回 Promise、后续监听者不跑；`serial` 逐个 await 按解析值判定；`emit` 丢弃返回值 | **已通过**（同 run）：`basis/async-control-not-bail.test.ts`（2 条）；条目读数按 4.0.4 改正后回填 | — |
| basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | probe `plugin-body-reruns-on-provider-change.test.ts`：提供者缺席不跑；换提供者 ⇒ 重跑；同实例改内部状态 ⇒ 不重跑 | **已通过**（同 run）：`basis/plugin-body-reruns-on-provider-change.test.ts`（1 条）；已回填 | — |
| basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | probe `effect-disposal-concurrent-not-ordered.test.ts`：effect 之间并发；同一 effect 内逆序；disposer 抛错不上抛；dispose 后建 effect 抛 `INACTIVE_EFFECT` | **已通过**（同 run）：`basis/effect-disposal-concurrent-not-ordered.test.ts`（4 条）；已回填 | — |
| 共用主张：`inject` 无可选形式、可选依赖走 `ctx.get`（[AI 依赖表](../../tenancy/account-identity/design.md#依赖作用域与绑定)、[实施缺口](../../tenancy/account-identity/design.md#实施缺口与消费者影响)） | probe `inject-has-no-optional-form.test.ts`：对象形式 inject 缺席 ⇒ `PENDING`；`resolveOptional` 缺席 ⇒ `undefined` 且体照跑；提供者出现／撤除／换代不重跑调用方 | **已通过**（同 run）：`basis/inject-has-no-optional-form.test.ts`（2 条）；2026-09-23 已升格为 basis 条目 [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md) | 升格与否归 basis 维护者。**受影响设计**：AI `credentials` 可选依赖、本包 `resolveOptional`。提供者中间态下的返回未断言 |
| 共用主张：`ctx.provide` 经 effect 纳管（AI／OG／AR 装卸表） | probe `provide-is-effect-managed.test.ts`：撤除后 `ctx.get` 得 `undefined`、消费者回 `PENDING`；先 provide 再抛出 ⇒ 服务不可见 | **已通过**（同 run）：`basis/provide-is-effect-managed.test.ts`（2 条）；不对应 basis 条目 | 同上。**受影响设计**：三个节点「第二个 provide 失败则第一个随 fiber 撤」 |
| 共用主张：插件体或 config 抛出 ⇒ fiber `FAILED`、不 provide（AI／OG／AR 装卸表、[offer-expiry S-14](../offer-expiry/design.md#能力到-cordis-的投影)） | probe `plugin-throw-fails-fiber.test.ts`：体抛出 ⇒ 拒绝 + `FAILED`；非法 config ⇒ 拒绝 + `FAILED` + 体未执行 + 服务不可见；合法 config ⇒ `ACTIVE` 且拿到校验后的值 | **已通过**（同 run）：`basis/plugin-throw-fails-fiber.test.ts`（3 条）；2026-09-23 已升格为 basis 条目 [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) | 同上。**受影响设计**：同批六个插件的「配置错误 ⇒ 启动失败」政策与本包 `definePlugin`。这三条同时是 `definePlugin` 的单元测试 |
| `ctx.fiber.state` 读取与 `FIBER_STATE` 镜像（[AR S-22 行](../../tenancy/account-registration/design.md#能力到-cordis-的投影)） | probe `fiber-state-readable.test.ts`：`PENDING`／`LOADING`／`ACTIVE`／`FAILED`／`DISPOSED` 五个数值对着真实 fiber 一致；`fiberIsActive` 就绪为真、dispose 后为假 | **已通过**（同 run）：`basis/fiber-state-readable.test.ts` › `镜像数值与真实状态一致`；`UNLOADING` 同 run 没有同名用例；不对应 basis 条目 | 同上。**受影响设计**：AR 主动停步、本包 `fiberIsActive`。`UNLOADING` 未观察到——本节点补一条 |
| `Outcome` 一族 | 单元测试 `tests/testing.spec.ts`「Outcome」：`succeed`／`fail` 形状互斥，`isSuccess` 判别 | **已通过**（同 run）：`testing.spec.ts` › `Outcome` › `成功与失败形状互斥` | — |
| `bootAssembly` 的装卸配对（[design.md](design.md#成对的装载与撤除)） | 单元测试 `tests/testing.spec.ts`「bootAssembly」：先 provide 服务再装插件、全部 `ACTIVE`、`dispose()` 后服务消失；任一插件启动失败 ⇒ 撤已装的再整体拒绝（用记录 disposer 的假插件断言）；必需服务缺席 ⇒ `PENDING` 即拒绝 | **已通过**（同 run）：`testing.spec.ts` › `bootAssembly`（2 条）、`bootAssembly · 清单错误`（1 条）、`bootAssembly · 部分失败先撤已装的`（1 条） | — |
| `./testing` 不被产品代码依赖 | 静态检查（候选，仓库 lint）+ 一条「产品代码里故意 import 就失败」的自测 | **已通过**（同 run）：`tools/ts-checks/tests/rules.spec.ts` › `no-testing-import` › `产品源码 import ./testing ⇒ 报出；测试文件豁免`；`pnpm run lint:rules` 扫 `packages/` 与 `apps/`，退出 0 | 本节点提出形式 |

**受阻项**：无。全部义务只依赖 Cordis 4.0.4 与 vitest。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 · `@omne-harness-lite/kernel-basis` 的 `typecheck` 与 `test` 脚本（`tsc -p tsconfig.test.json`；`vitest run`） | `@deepseek-ai/cordis` 4.0.4、zod 4.6.5、vitest 4.1.11（workspace catalog）；9 个测试文件：8 个 probe 文件 17 条 + `tests/testing.spec.ts` 3 条 | **通过**：20／20，无类型错误 | **尚未登记为 record/evidence run**——本行是转述，登记前不得被别的节点引为证据 |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) | 源码提交 `c9b5850`；`@deepseek-ai/cordis` 4.0.4、Node v24.18.0、vitest 4.1.11，单进程；11 个测试文件：10 个 probe 文件（上表八条 + 另两条已成 basis 条目的 `emit-listener-throw-propagates`、`logger-level-order-error-lowest`）＋ `tests/testing.spec.ts`；另含 `tools/ts-checks` 的 `no-testing-import` 自测与 `pnpm run lint:rules` | build、typecheck 退出 0；27 条用例 **27 通过**、0 跳过、0 失败；`lint:rules` 退出 0 | [`output/kernel-basis.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/kernel-basis.log)、[`json/kernel-basis.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/kernel-basis.json)、[`output/_lint-rules.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/_lint-rules.log)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagescorekernel-basis) |

**有限检查不写成无条件证明。**结果只对 `@deepseek-ai/cordis` **4.0.4** 那一个发布物成立：绿了说明这些语义在 4.0.4 上如读数所述，不说明 4.0.x 后续补丁如此（D-025：升级要重跑全部 probe）。登记之后别的节点可以引这次 run 作为机制依据，但**它不是任何契约条款的证据**。

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **三处未断言**：`UNLOADING`（5）取值；子 isolate 解析父标签服务抛错不回退；提供者处于中间态时 `ctx.get` 的返回。同 run 没有同名用例，probe 通过不覆盖它们。owner：本节点。

其余：

- **两条 probe 仍不对应 basis 条目**（`provide-is-effect-managed`、`fiber-state-readable`）：升格与否归 basis 维护者；`inject-has-no-optional-form` 与 `plugin-throw-fails-fiber` 已于 2026-09-23 升格。
- **probe 断言的是「当前语义成立」**：某条红了不等于本项目错了，等于上游改了——处置归 basis 与受影响节点，不在本节点。
- 与 [bindings.yaml](bindings.yaml) 一致：空表，无契约条款。
