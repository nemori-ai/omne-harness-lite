# kernel-basis

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿，同日按源码与 probe 结果回填。**不兑现任何契约条款**；它是 [D-025](../../../../record/decisions/cordis-adoption-version/README.md)（`@deepseek-ai/cordis` 4.0.4）闭合条件的家——[basis/cordis](../../../../basis/README.md#当前状态) 四条条目的 probe 与四条共用主张的 probe 都在本包，**已于 2026-09-22 在 4.0.4 上通过**——加上四个 tenancy 插件节点共用的插件层小件与测试装配工具
- 源码位置：`packages/core/kernel-basis`——已建包（2026-09-22）：`src/plugin.ts`、`src/outcome.ts`、`src/fiber-state.ts`、`src/testing/index.ts`，probe 在 `tests/basis/`。归 `core`：内核层复用件，没有领域事实，被 `tenancy` 四个插件节点与两个 `infra` 提供者消费（[两层布局](../../../README.md#packages-的两层布局)）；probe 放在产品包而不是开发工具里，是因为它证的是**产品包实际依赖的那个版本**的语义（[design.md 关键选择](design.md#四处关键选择)）
- 契约采用与边界依据：三件事一个包——① `tests/basis/<id>.test.ts` 八条 probe（basis 四条 + 三条共用主张 + `ctx.fiber.state` 读取），对 4.0.4；② 插件层共用件：`definePlugin({ name, inject?, Config, apply })`、`Outcome`／`Ack`／`succeed`／`fail`／`isSuccess`、`FIBER_STATE` 数值镜像 + `fiberIsActive(ctx)`、`resolveOptional(ctx, name)`；③ `./testing` 子路径：`bootAssembly({ services, plugins })` 与 `settle`。**它不提供任何服务、不持有任何 fiber**——共用件是被 import 的函数与类型，probe 是测试。**不在本包**：`mapStorageError`（归 [core/storage](../storage/design.md)，错误类型的 owner）、可控时钟（归 offer-expiry 的 `./testing`，`Clock` 形状的 owner）。取证时的读数与每条 probe 的 4.0.4 结果在 [design.md「读数与 probe 结果」](design.md#读数与-probe-结果)

## 分层状态

- 语义接受范围：**无契约条款。**本节点不是任何契约的提供者；它的依据是 D-025 的版本裁定与 [basis 准入](../../../../basis/README.md#准入)。四条 basis 条目已回填 `version: 4.0.4`、`probe:` 指向本包、`checked: 2026-09-22`；另四条 probe（`inject-has-no-optional-form`、`provide-is-effect-managed`、`plugin-throw-fails-fiber`、`fiber-state-readable`）核的是 realization 节点依赖的共用主张，**不对应 basis 条目**，是否升格按 basis 准入另议
- 可实施范围：**已建包。**公开入口即源码（[投影表](design.md#能力到-cordis-的投影)逐条对到文件）：`definePlugin`、`Outcome` 一族、`FIBER_STATE`／`fiberIsActive`、`resolveOptional`、`./testing` 的 `bootAssembly`／`settle`。**不给出**：`mapStorageError`、可控时钟（各归其 owner）；`bootAssembly` 在某个插件启动失败时**不撤已装的 fiber**（源码现状，设计要求的收口记为缺口）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——没有契约条款可绑；probe 的登记位置是 basis 条目的 `probe` 字段而不是绑定表，共用件的单元测试是本包自己的测试而不是对某条契约的证据。证据义务与状态在 [verification.md](verification.md)
- 实际验证：**有一次运行。**2026-09-22 对 `@deepseek-ai/cordis` 4.0.4：typecheck 通过，`vitest run` 9 个文件 20 条通过（8 个 probe 文件 17 条 + `tests/testing.spec.ts` 3 条），无类型错误；原始输出**尚未登记为 record/evidence run**，本行只是转述（[verification.md](verification.md#实际执行)）。probe 通过说明这八条语义在 4.0.4 上如读数所述，不说明 4.0.x 后续补丁如此

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 八条 probe 各断言什么、4.0.4 上的结果、什么语义消失时会红；共用件与测试装配工具的入口与语义 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml)（当前为空） |
| probe 与单元测试的义务、实际跑过什么、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
