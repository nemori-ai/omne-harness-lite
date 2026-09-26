# modality-projection

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.modality-projection · v2`（[契约](../../../../spec/capabilities/modality-projection/v2/contract.md)，状态 `accepted`、已冻结）。插件边界取自 [D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 model 拆分 A/A/A 的[装配草图](../../../../record/proposals/capability-split-model/design.md#装配草图与切分理由)（P-3、P-4\*）；草图早于契约把逐键登记改为整份声明（D-060 §五 K41），因此有两处不同；第三处（登记系统自带转换件交给一个零状态贡献者插件）按 D-060 §八 M68。理由在 [design.md](design.md#与装配草图不同的三处)
- 源码位置：`packages/model/modality-projection`——尚未建包。第二层 `model` 由 D-059 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是判定纯函数（`projectEntry`、`project`、`compatible`、键与声明的解析、`checkConversion`）加 `convertWith`、`convertMessageBlocks`（候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面**是 P-3、贡献者、声明者与 P-4\*——登记表只由系统装配层写、换表时键不经过「无」、只有系统自带那一件调转换、租户来自会话只在这一层成立，函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**判定那一半是纯函数**——`project` 的逐条贡献、`compatible`、键的解析、合法产出的校验——按包导出，模型请求运行时 import 它们、不 inject（草图 Y-2）。**转换那一半是插件**：P-3（候选插件名 `modality-projection`）持有登记表，provide `converterRegistry`（转换、查登记）与受限的 `converterAssembly`（整份声明、挂上实现），**不 inject 任何服务**；**贡献者**（候选插件名 `modality-conversion-builtin`，零状态）向 runner 登记系统自带的模态转换那一件；**声明者**（候选插件名 `converter-declarer`，配置即系统装配层的那一份声明）替装配把声明交进来；**k 个转换件插件 P-4\*** 各自挂上一件实现。本契约没有耐久状态，不用存储。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-5～S-13（投影、兼容、键、登记表、合法产出、缺席与表示层校验）、S-15～S-19（五个操作）、S-20～S-24（落盘之前那一件）、S-25、S-26 左列、S-27、S-28，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**受阻（[缺口](design.md#实施缺口与消费者影响)）：转换那一件经执行环境句柄取 `tenant`（契约 S-20 ②，MP-N1 已随 D-060 §八 M38 闭合），句柄解析出的租户身份**接口已定、真承接者未到**（runner 经 `capability.session-tenancy` v2 S-8 解析，runner 契约 G-20）：验收装配里最小提供者答测试种子即可跑，**产品装配里会话持有租户没有写入方**，含要转的块的消息全被否决；转换件的能力标识未定型，runner 认不出它、钉不了末位（runner 契约 G-3）；引用形状的块读不到字节（契约 G-6）；本版装哪几件转换件、声明写哪几个键没有人定（MP-N3）；函数层没有契约条款（MP-N7）。2026-09-25 修订波处置见 [verification](verification.md#修订波2026-09-25-公开面)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——契约 S-29 不建 `formal/`；证据形式是规范场景 S-30～S-36、性质测试 S-37 与两条静态检查，都没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 纯函数与插件怎样分、三类插件各持有什么、声明怎样原子替换、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
