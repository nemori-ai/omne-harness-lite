# model-request-runtime

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.model-request-runtime · v1`（[契约](../../../../spec/capabilities/model-request-runtime/v1/contract.md)，状态 `candidate`、未冻结）。插件边界、服务键与 inject 边取自 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 model 拆分 A/A/A 的[装配草图](../../../../record/proposals/capability-split-model/design.md#装配草图与切分理由)（P-2、P-5）；与草图不同的三处在 [design.md](design.md#与装配草图不同的三处) 逐条写理由
- 源码位置：`packages/model/model-request-runtime`——尚未建包。第二层 `model` 由 D-039 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个包、两个插件。**P-2**（候选插件名 `model-request-runtime`）provide 服务 `modelRuntime`（候选），兑现契约十三个操作；**一次调用是宿主（agent runtime）上的一个 effect，不是 fiber**（草图 N-1）；传输适配是构造参数级的内部依赖（草图 N-2），生产实现取 pi-ai 定向 fork（[D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md)，只接受了方向，精确版本与托管未定）。**P-5**（候选插件名 `model-default-retry`）是默认重试件，只向 runner 登记一件系统自带实现（S-35）。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：未接受（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 S-5～S-22 与 S-51（概念、贯穿规矩、模型侧装配宿主）、S-24～S-34 与 S-49、S-50（十三个操作）、S-35（P-5）、S-36、S-37、S-38 左列、S-39，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**可实施性有三处阻断（[缺口](design.md#实施缺口与消费者影响) MRR-N1～N3）：会话日志的提供者（块 D）没有契约也没有节点，六种记录、`ResponseId` 唯一与尝试栅栏都落在它上面；凭据保管方没有契约也没有提供者，中心可达时取值问法恒 `unavailable`、据点离线时如实 `undispatched{credential_unavailable}`（D-040 §八 M47）；契约 G-19 闭合之前，`legalTargets`／`displayList`／`effectiveModel`／`openCall` 按契约恒 `unavailable`。另有发起租户的来路 `sessionTenancy` 没有提供者（MRR-N10，M66）；P-5 按 M67 带候选默认退避装上
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 六条，全部绑 `formal:model-request-runtime-v1-invocation`（run `2026-09-25-formal-assets-runtimes`，退出 0）——S-15、S-17、S-22、S-30、S-31、S-33，每条对应一个有否定配置证明会失败的不变量。**这是契约层的交错证据，不证本节点的实现。**规范场景 S-41～S-48、S-52、投影性质测试与三条真并发演练都没有实现可跑，见 [verification.md](verification.md#覆盖缺口)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两个插件、inject 边与换代时收掉什么、一次调用的 effect、跨 owner 的共同存储对象、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 实际跑过什么、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
