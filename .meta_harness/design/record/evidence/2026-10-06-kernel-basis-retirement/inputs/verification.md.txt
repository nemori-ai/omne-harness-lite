## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 7 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# kernel-basis 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：已接受的独立内核／存储协议映射；没有独立数据契约坐标；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/kernel-basis` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**30 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 7 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

本节点没有契约侧的证据义务权威。义务来自三处：[D-025](../../../../record/decisions/cordis-adoption-version/decision.md) 的闭合条件（八条 probe 在 4.0.4 上通过）、
[basis 准入](../../../../basis/README.md#准入)（每条条目一个会失败的 probe）、本节点声称给出的共用件与 `./testing`。
每条 probe 断言什么、4.0.4 上的结果、什么语义消失时会红，正文在 [design.md「读数与 probe 结果」](design.md#读数与-probe-结果)；本页只登记义务与状态。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) | probe `tests/basis/isolate-hides-instances-not-data.test.ts`：跨标签实例共享数据句柄可读；同标签重复 provide 抛错；同 label 两次 isolate 合流 | **已通过**（4.0.4，run `2026-09-23-tests-tenancy-leg-2`）：`basis/isolate-hides-instances-not-data.test.ts`（2 条）；条目 `probe`／`version`／`checked` 已回填。本次 [30/30](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/kernel/test-results.json) 新增子 isolate 属性读取反例，通过 | 已补：抛错发生在 Context 属性读取；严格／非严格 get 为 undefined，不能把抛错推广给 get |
| basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md) | probe `async-control-not-bail.test.ts`：`bail` 把 Promise 当 bail 值、交回 Promise、后续监听者不跑；`serial` 逐个 await 按解析值判定；`emit` 丢弃返回值 | **已通过**（同 run）：`basis/async-control-not-bail.test.ts`（2 条）；条目读数按 4.0.4 改正后回填 | — |
| basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | probe `plugin-body-reruns-on-provider-change.test.ts`：提供者缺席不跑；换提供者 ⇒ 重跑；同实例改内部状态 ⇒ 不重跑 | **已通过**（同 run）：`basis/plugin-body-reruns-on-provider-change.test.ts`（1 条）；已回填 | — |
| basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | probe `effect-disposal-concurrent-not-ordered.test.ts`：effect 之间并发；同一 effect 内逆序；disposer 抛错不上抛；dispose 后建 effect 抛 `INACTIVE_EFFECT` | **已通过**（同 run）：`basis/effect-disposal-concurrent-not-ordered.test.ts`（4 条）；已回填 | — |
| 共用主张：`inject` 无可选形式、可选依赖走 `ctx.get`（[AI 依赖表](../../tenancy/account-identity/design.md#依赖作用域与绑定)、[实施缺口](../../tenancy/account-identity/design.md#实施缺口与消费者影响)） | probe `inject-has-no-optional-form.test.ts`：对象形式 inject 缺席 ⇒ `PENDING`；`resolveOptional` 缺席 ⇒ `undefined` 且体照跑；提供者出现／撤除／换代不重跑调用方 | **已通过**（同 run）：`basis/inject-has-no-optional-form.test.ts`（2 条）；2026-09-23 已升格为 basis 条目 [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md) | 升格与否归 basis 维护者。**受影响设计**：AI `credentials` 可选依赖、本包 `resolveOptional`。本次 [同名 probe](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/kernel/test-results.json) 已核 PENDING／LOADING／UNLOADING 的严格过滤，后两态非严格 get 仍注册 |
| 共用主张：`ctx.provide` 经 effect 纳管（AI／OG／AR 装卸表） | probe `provide-is-effect-managed.test.ts`：撤除后 `ctx.get` 得 `undefined`、消费者回 `PENDING`；先 provide 再抛出 ⇒ 服务不可见 | **已通过**（同 run）：`basis/provide-is-effect-managed.test.ts`（2 条）；不对应 basis 条目 | 同上。**受影响设计**：三个节点「第二个 provide 失败则第一个随 fiber 撤」 |
| 共用主张：插件体或 config 抛出 ⇒ fiber `FAILED`、不 provide（AI／OG／AR 装卸表、[offer-expiry S-14](../offer-expiry/design.md#能力到-cordis-的投影)） | probe `plugin-throw-fails-fiber.test.ts`：体抛出 ⇒ 拒绝 + `FAILED`；非法 config ⇒ 拒绝 + `FAILED` + 体未执行 + 服务不可见；合法 config ⇒ `ACTIVE` 且拿到校验后的值 | **已通过**（同 run）：`basis/plugin-throw-fails-fiber.test.ts`（3 条）；2026-09-23 已升格为 basis 条目 [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) | 同上。**受影响设计**：同批六个插件的「配置错误 ⇒ 启动失败」政策与本包 `definePlugin`。这三条同时是 `definePlugin` 的单元测试 |
| `ctx.fiber.state` 读取与 `FIBER_STATE` 镜像（[AR S-22 行](../../tenancy/account-registration/design.md#能力到-cordis-的投影)） | probe `fiber-state-readable.test.ts`：`PENDING`／`LOADING`／`ACTIVE`／`FAILED`／`DISPOSED` 五个数值对着真实 fiber 一致；`fiberIsActive` 就绪为真、dispose 后为假 | **已通过**（同 run）：`basis/fiber-state-readable.test.ts` › `镜像数值与真实状态一致`；本次 [同名 probe](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/kernel/test-results.json) 已观察真实 UNLOADING=5，屏障未释放前 dispose 尚未完成；不对应 basis 条目 | 同上。**受影响设计**：AR 主动停步、本包 `fiberIsActive`。UNLOADING 已有真实屏障场景；镜像及 fiberIsActive 一并核对 |
| basis [`service-subclass-provides-its-key`](../../../../basis/cordis/service-subclass-provides-its-key.md) | probe `service-subclass-provides-its-key.test.ts`：抽象 `Service` 在构造函数里给键、子类只补方法 ⇒ 装上子类即在该键上可取到抽象类的实例，撤除后键上为空；一个函数插件体里 `new` 两个子类 ⇒ 两个键都登记在这条插件的 fiber 上、随它一起撤；inject 该键的消费者等它装上才启动 | **已通过**（4.0.4，2026-10-02，`pnpm --filter @omne-harness-lite/kernel-basis test`；未登记 evidence run） | basis 维护者。**受影响设计**：Cordis 集成约定「服务定义」各条 |
| basis [`service-method-ctx-is-caller`](../../../../basis/cordis/service-method-ctx-is-caller.md) | probe `service-method-ctx-is-caller.test.ts`：注册表 `Service` 的 `register()` 用 `this.ctx.effect` ⇒ 贡献者撤除即撤掉它的登记、注册表仍 `ACTIVE`；`register` 返回的撤除函数单独调用也撤得掉 | **已通过**（同上） | 同上。**受影响设计**：Cordis 集成约定「登记与撤除」 |
| basis [`ctx-property-is-not-ctx-get`](../../../../basis/cordis/ctx-property-is-not-ctx-get.md) | probe `ctx-property-is-not-ctx-get.test.ts`：没 inject 的插件里读 `ctx.<键>` 抛错、`ctx.get(键)` 取得到；inject 了的插件里 `ctx.<键>` 取得到 | **已通过**（同上） | 同上。**受影响设计**：Cordis 集成约定「依赖」 |
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

## 本次追加验证（2026-09-26）

实现提交 `1a229204` 只改三份 probe；HUB `0e39dc26` 独立构建／类型检查／测试均退出 0，**30/30**、零跳过／失败。
[具名 JSON](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/kernel/test-results.json)、[HUB log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-kernel-hub.log)、[输入与环境](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/kernel/metadata.json)、[逐项覆盖](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescorekernel-basis)。
三个新增场景使用真实 Cordis 4.0.4 和 Promise 屏障：保持 disposer 运行中观察 UNLOADING；核子 isolate 的 Context 属性解析；
驱动真实 PENDING／LOADING／ACTIVE／UNLOADING 的 optional 读取。LOADING／UNLOADING 的非严格 get 仍取到注册实例，
严格 get／resolveOptional 得 undefined；消费者始终 ACTIVE 且只跑一次。属性抛错不推广给 get。
checks 最新 [100/100 与 24-rule scan](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-checks-path-hub.log) 含 no-testing-import 自测与真实源码扫描。
没有改产品内核、强设状态或运行内核源码变异，也不闭合 D-042 后来新增的其它 probe 义务。

## 公开消费者追加验证（2026-09-26）

`w1.kernel.outcome-public`、`w1.kernel.public-lifecycle`、`w1.kernel.public-assembly-cleanup` 三个固定子场景通过，`w1.types.kernel.outcome-public` 核公开声明的 Config 推导、Outcome／Ack 成败互斥。实际 Cordis 4.0.4 下非法 config 使 FAILED 且 apply 0 次，合法 apply 1 次；dispose 后 optional 不可用；第三个插件失败以同一错误拒绝，两个已装插件逆序清理、服务消失。

`w1.consumer.adopted-dependency-exceptions` 核 root source／声明只含 Cordis／Standard Schema 类型，root JS 没有外部运行时依赖，批准 testing JS 只含 Cordis；AST 控制反例另过。Outcome 错误预期控制只把 42 改成 0，实际仅目标 AssertionError 失败、13 项通过、进程退出1且无超时／信号。它证一个错误 oracle 可被发现，不是内核变异或所有交错证明；旧 30 probe 结果没有在本 run 重跑。

原始 [正常 Node report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__normal-afySRP__report.json)、[负向 report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__negative-WagReR__report.json)、[HUB build／typecheck／12/12 log](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__core-delivery__w1-public-consumers-hub.log)、[逐项条款对应](../../../../record/evidence/2026-09-26-tests-core-public/coverage.md)与[实际源码／配置／环境](../../../../record/evidence/2026-09-26-tests-core-public/README.md)分别保留。工具源码5140574b，HUB起点e0b6c212加当时未提交且与dc431fdf同字节的lock；期间文档提交不改变本轮产品／工具／配置。子场景不叠加进外层测试数，六组类型只覆盖具体断言。测试通过不提升语义接受或用户最终接受。

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **原三处缺口在本次有界 probe 中取得证据**（[逐项对应](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescorekernel-basis)）：真实 UNLOADING=5；子 isolate 属性读取抛错而 get 为 undefined；严格 optional 过滤中间态。仅限 Cordis 4.0.4。
- 本次没有核内核源码变异；三条新增 probe 的失效判别来自真实正反路径与外部状态断言，不声称任意故障或交错全覆盖。

其余：

- **两条 probe 仍不对应 basis 条目**（`provide-is-effect-managed`、`fiber-state-readable`）：升格与否归 basis 维护者；`inject-has-no-optional-form` 与 `plugin-throw-fails-fiber` 已于 2026-09-23 升格。
- **probe 断言的是「当前语义成立」**：某条红了不等于本项目错了，等于上游改了——处置归 basis 与受影响节点，不在本节点。
- 与 [bindings.yaml](bindings.yaml) 一致：空表，无契约条款。
