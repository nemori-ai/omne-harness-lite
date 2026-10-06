## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 7 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# kernel-basis

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：已接受的独立内核／存储协议映射；没有独立数据契约坐标；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/kernel-basis` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**30 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 7 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-22 首稿，同日按源码与 probe 结果回填。**不兑现任何契约条款**；它是 [D-025](../../../../record/decisions/cordis-adoption-version/README.md)（`@deepseek-ai/cordis` 4.0.4）闭合条件的家——[basis/cordis](../../../../basis/README.md#当前状态) 十一条条目的 probe 与两条共用主张的 probe 都在本包，对 4.0.4——加上 tenancy 插件节点共用的插件层小件与测试装配工具
- 源码位置：`packages/core/kernel-basis`——已实现（HUB `c9b5850`）：`src/plugin.ts`、`src/outcome.ts`、`src/fiber-state.ts`、`src/testing/index.ts`，probe 在 `tests/basis/`。归 `core`：内核层复用件，没有领域事实，被 `tenancy` 五个包、两个 `infra` 提供者与装配 `apps/tenancy-host` 消费（[两层布局](../../../README.md#packages-的两层布局)）；probe 放在产品包而不是开发工具里，是因为它证的是**产品包实际依赖的那个版本**的语义（[design.md 关键选择](design.md#四处关键选择)）
- 契约采用与边界依据：三件事一个包——① `tests/basis/<id>.test.ts` 十三条 probe（basis 十一条 + `provide-is-effect-managed` + `ctx.fiber.state` 读取），对 4.0.4；② 插件层共用件：`definePlugin({ name, inject?, Config, apply })`、`Outcome`／`Ack`／`succeed`／`fail`／`isSuccess`、`FIBER_STATE` 数值镜像 + `fiberIsActive(ctx)`、`resolveOptional(ctx, name)`；③ `./testing` 子路径：`bootAssembly({ services, plugins })` 与 `settle`。**它不提供任何服务、不持有任何 fiber**——共用件是被 import 的函数与类型，probe 是测试。**不在本包**：`mapStorageError`（归 [core/storage](../storage/design.md)，错误类型的 owner）、可控时钟（归 offer-expiry 的 `./testing`，`Clock` 形状的 owner）。取证时的读数与每条 probe 的 4.0.4 结果在 [design.md「读数与 probe 结果」](design.md#读数与-probe-结果)

## 分层状态

- 语义接受范围：**无契约条款。**本节点不是任何契约的提供者；它的依据是 D-025 的版本裁定与 [basis 准入](../../../../basis/README.md#准入)。basis/cordis 的十一条条目都以本包为 probe 位置（`version: 4.0.4`）：最初四条 2026-09-22 回填；`inject-has-no-optional-form`、`plugin-throw-fails-fiber` 两条共用主张 2026-09-23 升格为条目；`emit-listener-throw-propagates`、`logger-level-order-error-lowest` 两条 2026-09-23 新登；`service-subclass-provides-its-key`、`service-method-ctx-is-caller`、`ctx-property-is-not-ctx-get` 三条 2026-10-02 新登（Cordis 集成约定依赖它们）。另两条 probe（`provide-is-effect-managed`、`fiber-state-readable`）核的是 realization 节点依赖的共用主张，**不对应 basis 条目**，是否升格按 basis 准入另议
- 可实施范围：**已实现（HUB `c9b5850`）。**公开入口即源码（[投影表](design.md#能力到-cordis-的投影)逐条对到文件）：`definePlugin`、`Outcome` 一族、`FIBER_STATE`／`fiberIsActive`、`resolveOptional`、`./testing` 的 `bootAssembly`／`settle`（某个插件启动失败或装后仍 `PENDING` ⇒ 先逆序撤已装的 fiber 再拒绝）。**不给出**：`mapStorageError`、可控时钟（各归其 owner）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——没有契约条款可绑；probe 的登记位置是 basis 条目的 `probe` 字段而不是绑定表，共用件的单元测试是本包自己的测试而不是对某条契约的证据。证据义务与状态在 [verification.md](verification.md)
- 实际验证：运行 [`2026-09-26-tests-core-foundation`](../../../../record/evidence/2026-09-26-tests-core-foundation/README.md)：HUB `0e39dc26` 的 build／typecheck／test 退出 0，Cordis **4.0.4** 上 **30/30**。源码提交 `1a229204` 只追加三份 probe，核真实 UNLOADING、子 isolate 属性读取抛错与 optional 中间态过滤；get 的严格／非严格差异及边界见 [verification.md](verification.md#本次追加验证2026-09-26)。此前 [2026-09-23 run](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) 保留其历史范围；不推断其他 Cordis 版本，也不提升最终接受状态

- 本轮公开验证：另见 [`2026-09-26-tests-core-public`](../../../../record/evidence/2026-09-26-tests-core-public/README.md)：真实 Node 公共入口的 Outcome、配置失败／有效 apply、dispose 与部分装配逆序清理三项子场景；Config／Outcome 严格类型组；root source／声明／JS 与 testing 的批准依赖图，同一 HUB 外层12/12、零跳过；按本节点 [公开追加验证](verification.md#公开消费者追加验证2026-09-26) 的条款与边界读取。具名类型完整名单与三个 opaque 品牌互赋负例尚待后续实际运行；本轮不提升整体完成或最终接受。

## 按当前问题展开

| 当前问题                                                                                    | 阅读入口                            |
| ------------------------------------------------------------------------------------------- | ----------------------------------- |
| 各条 probe 各断言什么、4.0.4 上的结果、什么语义消失时会红；共用件与测试装配工具的入口与语义 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么                                                          | [绑定表](bindings.yaml)（当前为空） |
| probe 与单元测试的义务、实际跑过什么、还缺什么                                              | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
