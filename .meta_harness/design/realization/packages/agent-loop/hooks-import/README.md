# hooks-import

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.hooks-import · v1`（[契约](../../../../spec/capabilities/hooks-import/v1/contract.md)，状态 `candidate`、未冻结）。落在 `agent-loop` 领域是 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 tools 拆分候选 C（草图里写作 `hooks-compat`，节点名以本批裁定为准）；fork 边界是 [D-033](../../../../record/decisions/hooks-compat-baseline/decision.md#选择与范围)
- 源码位置：`packages/agent-loop/hooks-import`——尚未建包。第二层 `agent-loop` 由 D-039 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个包、两样东西。**纯函数** `importHostHooks`（导入与导入报告，契约 S-11～S-15），按包导出，谁读得到来源产品的配置文件谁调；它不写任何东西，落成资产归资产治理。**兼容插件**（候选插件名 `hooks-compat`）向 runner 登记**一个**外部命令执行器（候选），`implementation.kind = command` 的全部兼容件都经它跑（契约 S-16～S-22）。包内收 D-033 的 fork：DSH `c291e79` `hook-protocol` 的 `matcher`、`codec`、`merge`、`detached` 四个文件与 `HookOutput` 类型，剥掉对 `dsh-session` 的类型扩展，作为自有模块维护；执行器、导入与两张方言映射表自写。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：未接受（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 S-5～S-15（来源与方言、一条 command 一件、能力标识、干预力、工作区来源、兼容件载荷、导入与报告）、S-16～S-24（被调到时与两张映射表）、S-25、S-26 左列、S-27，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，fork 尚未做，没有任何实现。**受阻（[缺口](design.md#实施缺口与消费者影响)）：会话级执行环境没有契约、没有提供者，执行器经执行环境句柄取它（契约 S-18、runner S-50）一律解析失败，每一件兼容件都「起不来」、按声明跳过（HI-N1）；DSH 的许可与来历未核（HI-N3）；D-033 的 A／C 区分实验未跑（HI-N4）。HI-N2、HI-N6 已随 D-040 §八 M38、M39 闭合
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——契约 S-28 不选用形式工件；证据形式是规范场景 S-29～S-36 与每行映射的测试，都没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 纯函数与插件怎样分、fork 边界与区分实验、执行器怎样起停子进程、回放为什么不重跑、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
