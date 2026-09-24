# modality-projection 实现设计

契约：[`capability.modality-projection` v1](../../../../spec/capabilities/modality-projection/v1/contract.md)（下文「契约 S-n」「契约 G-n」都指它）。
本页的插件名、服务名、方法名一律是**候选**；契约的九件事不复述，只写兑现点与缺口。

## 实现路径与来源

**全部自建；判定是纯函数，转换是三类小插件。**

- **纯函数**（包入口导出）：`projectEntry`（一条日志条目对投影的贡献——契约 S-6 的可分解律让读投影的一方把它逐条并进去）与 `project`（对一串条目的折叠，等于逐条并集）、`compatible`、`converterKeysOf`（一个块的候选键，契约 S-10）、`checkConversion`（一次产出合不合法，契约 S-11）、`parseConverterKey`／`parseDeclaration`（表示层校验，契约 S-8、S-17 ①）。块与消息的形状与模态判定式取同批纯模块 `packages/core/message-model`（`data.content-blocks`、`data.messages`），档案取 `packages/core/model-model`，**判定式引用不复制**。
- **插件**：见下节。共用件 `definePlugin`、`Outcome` 取 [kernel-basis](../../core/kernel-basis/README.md)。
- **转换件实现**：本版不调模型（契约 S-24），只能是纯计算或本地识别库；**本版装哪几件、各登在哪几个键上没有人定**（缺口 MP-N3）。本节点只定它们接进来的形状。

## 契约到 Cordis 的投影

### 插件、服务键与配置

| 单元 | 插件与服务键（候选） | 必需 inject | 配置 |
|---|---|---|---|
| **P-3** 登记表 | 插件 `modality-projection`；provide `converterRegistry`（`convert`、`lookupConverter`）与 `converterAssembly`（`declareConverters`、`attachImplementation`） | runner 的实现登记面 `loopExtensionImplementations`（[loop-extension-runner](../../agent-loop/loop-extension-runner/README.md)），用来登记系统自带的模态转换那一件 | 无 |
| **声明者** | 插件 `converter-declarer`；不 provide | `converterAssembly` | `declaration`：系统装配层的那一整份「键 → 转换件引用」（由 [cli](../../../apps/cli/README.md) 装配交入） |
| **P-4\*** 转换件，每件一个插件 | 不 provide | `converterAssembly` | 各自的实现参数；`converterRef`：它在声明里被指认的那个不透明引用 |

- **`Converter` 引用**（契约 S-8 末条的不透明引用）在本节点就是转换件插件自报的一个名字（候选：`<包名>/<实现名>`），声明写它、P-4\* 以它挂上实现。**同一引用只许挂一件**：第二件挂上即被拒，那个 P-4\* 插件体抛出、`FAILED`。
- **`converterAssembly` 受限**：只许声明者与转换件包解析它（静态检查候选规则，同 organization-governance 的 `restricted-call-sites`）——这是契约 S-26 第 1 行「登记表只由系统装配层写」在单机上能落到的最具体形状。`converterRegistry.convert` 同样受限：只许系统自带的模态转换那一件的实现模块调（S-26 第 4 行）。
- **配置错误一个政策**：声明者的 `declaration` 缺席或不是一组 ⇒ 内核校验不过 ⇒ `FAILED`；形状过了、但 `declareConverters` 答 `invalidInput`／`keyTaken` ⇒ 声明者插件体抛出 ⇒ `FAILED`。两者都是装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)），与 tenancy 各节点同一条。**空的一组是合法声明**（契约 S-17 ①），不是配置错误。

### 与装配草图不同的两处

**一、声明经一个声明者插件交进来，不放在 P-3 的配置里**。草图写「声明的键来自装配配置」，那时契约还是逐键登记；契约现在要**整份原子替换**，而且单机时一个新旧两份都有的键**任何时刻都答得出「有」**（契约 S-9 第 3 条、S-26 第 3 行）。

| | 声明放在 P-3 的配置里（草图字面） | 装配代码在启动后调一次 `declareConverters` | **声明者插件（本方）** |
|---|---|---|---|
| 运行中换一份声明 | 要改 P-3 的配置；配置更新会不会重启那条 fiber 是**未核对的假设**（草图 H-4）——若重启，登记表整个消失再重建，中间对每个键答不出，违反单机那一半 | 装配直接调受限面，原子替换 | 改声明者的配置：声明者重跑、再交一份；**P-3 不重跑**，旧表一直生效到新表替上的那一刻 |
| P-3 因为别的原因重跑之后 | 从配置重新装，**运行中换过的那一份被静默换回配置里的旧份** | 表空着，要装配自己察觉 P-3 重跑再交一次 | 声明者 inject `converterAssembly`，随 P-3 一起重跑、自动再交当前那一份 |
| 落选方最强论证 | 少一个插件；声明就是配置 | 少一个插件 | — |
| 本方弱点 | — | — | 多一个只做一件事的插件；「系统装配层」在 Cordis 里落成一个插件，读者要知道它的配置就是那份声明 |

置信度：中。不依赖 H-4 是主要理由；若 probe 证明配置更新不重启 fiber、且 P-3 能在原地换表，第一列可以重新考虑。

**二、P-4\* 由装配加载、inject 受限面挂上实现，而不是 P-3 按配置 `ctx.plugin` 出子 fiber**。草图 Y-3 要的三样——各自独立的资源、一件挂了不连带别的键、有宿主可挂——两种形状都给得出：P-4\* 各是一条 fiber，失败互不牵连；它们 inject P-3 的受限面，P-3 换代就重跑、重新挂上。本方让 P-3 的配置保持为数据（不装插件对象），声明换代也不需要 P-3 管理子 fiber 的生灭。落选方的最强论证是结构上真正「在 P-3 之下」、P-3 撤除必然带走它们（依赖假设「子 fiber 随父卸载」，basis 未收录）；本方弱点是这层从属只在依赖上、不在树上。置信度：中。

### 操作落点

| 契约责任 | 插件、服务或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5、S-6 投影与三条代数性质 | 纯函数 `projectEntry`、`project` | 尚未实现 | 性质测试 S-37；存着答案、追到日志尾是读的一方（模型请求运行时）的义务 |
| S-7、S-16 兼容 | 纯函数 `compatible` | 同上 | 场景 S-30、S-32；投影不知道时调用方不得拿空集来调（S-12） |
| S-8、S-10 键与键的解析 | `parseConverterKey`、`converterKeysOf` | 同上 | 场景 S-31 |
| S-9、S-17 登记表与整份声明 | P-3 实例里一个**不可变**的「键 → 引用」表；`converterAssembly.declareConverters` 先整份校验（形状 → 同键重复），通过则**一次引用赋值**换上新表 | 同上 | 一次赋值在事件循环里不可分，任何一次解析看到的要么整份旧、要么整份新；被拒时表不变。**P-3 启动到第一份声明交进来之前表为「无」**，`convert` ⇒ `converterFailed`、`lookupConverter` ⇒ `{ unavailable }`（S-9 第 2 条） |
| S-9 第 1 条（登记不随实例增减） | 挂上的实现另存一张「引用 → 实现句柄」表；声明里有这个键、引用没有挂上实现 ⇒ `converterFailed`，**不是** `noConverter` | 同上 | 场景 S-33 |
| S-11 合法产出 | `checkConversion`：transcript 缺或空 ⇒ `transcriptMissing`；其余六条任一不过 ⇒ `converterFailed` | 同上 | 场景 S-35 |
| S-12、S-13 缺席与表示层校验 | 每个方法入口先做表示层校验，失败带原名；「答不出」与「没登记」各是各的值 | 同上 | — |
| S-15 `project` | 纯函数 | 同上 | — |
| S-18 `convert` | `converterRegistry.convert(block, tenant)`：校验 → 读当前表的引用（一次）→ 落到的第一个有登记的键 → 取挂上的实现 → 调它 → `checkConversion` | 同上 | 判定次序照 S-18 表；**时间上界就是拓展件时限**（runner 契约 G-7，无值），本节点不另设计时器 |
| S-19 `lookupConverter` | `converterRegistry.lookupConverter(key)` | 同上 | 答不出 ⇒ `{ unavailable }`，不收成 `{ unregistered }` |
| S-20～S-23 落盘之前那一件 | P-3 向 runner 登记的系统自带实现（候选 `builtinName`：`modality-conversion`）：挑要转的块 → 逐块 `convert` → 全成交回 `rewrite`（或一块都没转成交回 `observed`）、任一失败交回 `veto`（`reason` 只带块标识、失败值与键） | 同上 | **受阻两处**：`tenant` 的来路（MP-N1）；runner 认它需要的能力标识未定型（runner 契约 G-3）。末位由 runner 强制，不靠本节点 |
| S-24 转换件不调模型 | P-4\* 不 inject `modelRuntime`；静态检查候选：转换件包不得 import 或解析模型请求运行时 | 同上 | 运行时拦不住一个自己 `ctx.get` 的实现，所以兑现是结构检查（契约「由提供者与装配兑现」） |
| S-25 不发事件 | 不 `emit`、不监听 | — | [事件](#事件) |
| S-26 左列 | 见[装配给 vs 协议给](#装配给-vs-协议给) | — | 右列不在本版 |
| S-27、S-28 重启与在途转换 | 见[装卸表](#成对的装载与撤除) | — | — |

### inject 边与换代时收掉的在途事实

| 边（消费者 → 提供者） | 必需／调用时 | 提供者换代或撤除时收掉什么 | 对齐的契约条款 |
|---|---|---|---|
| P-3 → `loopExtensionImplementations` | 必需 | P-3 插件体重跑：登记表与挂上的实现表随旧实例没了；声明者与 P-4\* 随之重跑、再交声明、再挂实现。**其间答不出**（`converterFailed`、`{ unavailable }`），含要转的块的消息被否决、可以重发——契约 S-27 写明的重启收场。正在跑的转换**跑完**（内核不取消在途调用），它的实现若已被撤，runner 按它的 S-34 记成报错、按否决处置 | S-27、S-28 |
| 声明者 → `converterAssembly` | 必需 | 声明者重跑、再交当前那一份；**P-3 不受影响**（P-3 不 inject 声明者） | S-9 第 3 条 |
| P-4\* → `converterAssembly` | 必需 | P-4\* 重跑、重新挂上；其间那个引用没有实现 ⇒ `converterFailed`，**不是** `noConverter` | S-9 第 1 条、S-21 |
| 模型请求运行时 → 本包的纯函数 | 包依赖，无 inject | 无运行时依赖（草图 Y-2） | S-4 |
| runner → P-3 登记的系统自带实现 | runner 按名求值（在 runner 节点） | P-3 撤除 ⇒ 注销 ⇒ runner 看它「此刻不在」，由指定挂件顶上（含要转的块即否决） | runner S-17 |
| 资产注册表 ⇢ `converterRegistry.lookupConverter` | 建议调用时取用（在 `packages/tools/asset-registry` 节点，由那边定） | P-3 缺席 ⇒ 按 `{ unavailable }` 处置、这一项不满足（契约 S-19 ⑧） | S-19 |

### 事件

- **不发、也不监听任何 Cordis 事件**（契约 S-25）：投影从日志读，转换的成败在日志里，声明换代不通知任何人。
- **F② 依赖消失时谁被卸载**：P-3 只依赖 runner 的登记面；runner 换代时 P-3 连带声明者与 P-4\* 重跑——范围只到转换这一侧，判定那一半是纯函数、不受影响。
- **F③ 有没有事件能越过租户或会话边界**：没有事件。登记表是部署范围的（契约 S-9：不按租户分份），这是契约的有意设计；**越界风险在字节**：转换件以 `tenant` 读写引用所指的字节，由谁判能不能读写是契约 G-6（存储未定义），本版对引用形状的块一律转不成（`converterFailed`），不存在「不经判定就读」的路径。

### 存储要求：无

契约第二节开头写明「本契约没有耐久状态」：登记表的权威在系统装配层的声明，只活在 P-3 实例里；投影是日志的函数，存它的是读的一方。本节点**不 inject 存储**，没有要求清单，也没有跨 owner 的同一提交。转换产出随那条消息一次落盘（契约 S-20 ④），那一次追加是 runner 与 loop 的写。

### 装配给 vs 协议给

契约 S-26 左列，本版单机怎样兑现：

| 契约 S-26 的保证 | 本节点单机的兑现 |
|---|---|
| 登记表只由系统装配层写 | `converterAssembly` 只给声明者与转换件包（静态检查）；声明者的配置由 [cli](../../../apps/cli/README.md) 装配交入 |
| 答「没登记」当且仅当现行声明未声明 | 一张不可变表；第一份声明到位之前是「无」、答不出 |
| 声明换代时两份都有的键任何时刻答得出「有」 | 新表在一次引用赋值里替上；声明者重跑不碰 P-3 的表 |
| 只有系统自带的转换那一件调转换 | `convert` 的调用点只许在那一件的实现模块（静态检查） |
| 转换产出与原消息同一次落盘 | 那一件交回挂好派生属性的 `rewrite`；落盘归 runner 与 loop 的同一次追加 |
| 读引用所指的字节以 `tenant` 进行 | **受阻**：存储未定义（契约 G-6），`tenant` 的来路未定（MP-N1） |
| 判合法目标的投影覆盖到日志尾 | 读的一方的义务（[model-request-runtime](../model-request-runtime/design.md#存储要求) 的 R-1～R-3） |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks/v1`、`data.messages/v1`、`data.model-profile/v1` | 包依赖同批纯模块（`packages/core/message-model`、`packages/core/model-model`） | 随包版本 | — |
| `data.loop-extension/v1` S-1、S-5、S-10、S-23、S-25、S-33 | 包依赖 `packages/core/tool-model`；系统自带那一件的结论形状 | 随包版本 | — |
| `data.identity-values/v1` | 包依赖 | 随包版本 | `tenant` 缺席 ⇒ `invalidInput` |
| runner 的实现登记面（`capability.loop-extension-runner/v1` S-7） | 必需 inject `loopExtensionImplementations` | 换代 ⇒ 重跑、重新登记 | 缺席 ⇒ P-3 `PENDING`，登记表不存在，runner 由指定挂件顶上 |

**被谁消费**：模型请求运行时（纯函数，包依赖）；runner（系统自带那一件，按名求值）；资产注册表（`lookupConverter`）。

## 状态、并发与失败映射

**P-3 的全部状态**：当前声明（不可变表，或「无」）与「引用 → 实现句柄」表，都只在实例里。**没有提交点**（契约 S-14 末段）。
**并发**：声明替换是一次引用赋值，与正在进行的 `convert` 之间没有中间态——一次 `convert` 在开始时读一次表引用，之后只用这一份。实现表的挂上与撤下同样是单次赋值；一次 `convert` 取到的实现句柄在它返回之前一直有效（撤下不打断它，契约 S-28 允许「用原来那一件交回合法产出」）。
**失败映射**：转换件实现抛出（契约 S-18 第 4 行「调起来挂了」）或交回不合法 ⇒ `converterFailed`／`transcriptMissing`；引用所指读不到 ⇒ `converterFailed`。这是契约给定的收场，只收**转换件实现**抛出的异常；P-3 自己的缺陷照常上抛。实现的异常原文不进 `veto` 的 `reason`（契约 S-20 ⑥ 不转述内容），另记一条 error 级结构化日志，排查看得见。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| P-3：provide `converterRegistry`、`converterAssembly`（表为「无」） | P-3 fiber；`ACTIVE` 即可解析，**答「答不出」直到第一份声明** | provide 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`，未升格为 basis 条目） | 服务消失；表随实例没了；**正在跑的转换跑完**，按各自那一次结果收场（契约 S-28） |
| P-3：向 runner 登记系统自带那一件 | P-3 fiber；拿回注销函数包进 `ctx.effect` | 同名已登记 ⇒ 抛出 ⇒ `FAILED` | 注销；runner 此后看它「此刻不在」，由指定挂件顶上 |
| 声明者：交一份声明 | 声明者 fiber；**不是 effect**——撤除时不撤回声明（撤回声明会让表回到「无」，那是一次有意的装配动作，不该随插件撤除发生） | 被拒 ⇒ 抛出 ⇒ `FAILED`、P-3 的表不变 | 什么都不做；表留在 P-3 里直到下一份声明或 P-3 撤除 |
| P-4\*：挂上一件实现 | P-4\* fiber；拿回「撤下」函数包进 `ctx.effect` | 引用已被挂 ⇒ 抛出 ⇒ `FAILED`；它的依赖（本地识别库）起不来 ⇒ 抛出 ⇒ `FAILED`，**不连带别的键** | 撤下；那个引用此后没有实现 ⇒ `converterFailed`。**它已开始的那一次转换跑完**，结果照常校验（S-28 两种都可以）；**它写进存储的派生字节不回收**（契约 S-28「外部效果不回滚」，留存归存储、G-6） |

## 实施缺口与消费者影响

契约自己的 G-n 不在此重抄；下面是本节点的缺口。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
|---|---|---|---|---|
| MP-N1 | **两份契约对不上：转换那一件拿不到 `tenant`**。本契约 S-20 ② 要「`tenant` 取那条消息所属会话的租户身份」、S-18 ① 把它列为必填；而拓展件的统一输入不带会话与租户（`data.loop-extension/v1#S-11` 的成员闭合；`capability.loop-extension-runner/v1#S-7` 说系统自带件「同一套输入」、除四样之外没有特权）。按现有条款，这一件每次调 `convert` 都只能以 `invalidInput` 收场 ⇒ 含要转的块的消息全被否决。候选解法（都超出现有条款，本节点不自选）：runner 在调用系统自带实现时另交一份调用上下文（会话、租户）；或经日志句柄读条目壳上的租户 | 主线 ＋ `data.loop-extension`、runner、本契约三份的 owner | 系统自带的模态转换那一件；契约 S-30、S-33、S-34 | 某份契约写明那一件从哪里拿到 `tenant` |
| MP-N2 | **转换件的能力标识未定型**（runner 契约 G-3 的一项，owner 是本契约）：runner 认不出它，钉不了 `before_persist_message` 末位，缺席时的记录也写不出 `extension` | 本契约 owner | runner 的末位与指定挂件那一格 | 本契约定下标识 |
| MP-N3 | **本版装哪几件转换件、声明写哪几个键没有人定**：空声明合法，但它意味着每个语音、图、文件块都原样落盘、永久进投影（契约 S-6 末段的产品后果） | 系统装配（[cli](../../../apps/cli/README.md)）＋ 产品（PF-013 §4 转换件） | 交付面、模型请求运行时的合法目标 | 装配写明声明与所装的 P-4\* |
| MP-N4 | **静态检查规则未写**：`converterAssembly` 只给声明者与转换件包；`convert` 只许那一件的实现模块调；转换件包不得够到模型请求运行时 | 本节点 ＋ 承载仓库 `tools/ts-checks` | 契约 S-26 第 1、4 行、S-24 的装配给 | 规则写成并在 CI 里跑 |
| MP-N5 | **资产注册表对 `lookupConverter` 取用 inject 还是调用时取用**，由那个节点定；本节点建议调用时取用——注册表 inject 它，P-3 每次随 runner 重跑都会连带注册表重跑 | `packages/tools/asset-registry`（庚） | 资产注册表 | 那个节点写明 |
