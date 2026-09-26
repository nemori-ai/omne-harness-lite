# slash-command 实现设计

> 本批设计已接受（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-045](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

契约：[`data.slash-command` v1](../../../../spec/data/slash-command/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律为**已接受的设计**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)。
识别与切分**手写**：契约明写切分规则（S-17 六条），不用 shell 词法库——那些库的引号与转义规则与 S-17 不同。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 公开面

**全部即公开函数面**（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）：不依赖 Cordis、会话、租户或存储，单独 `import` 即用；**没有 Cordis 服务面**（[下表](#cordis-原语本节点一样也不用)）。核对：[依赖表](#依赖作用域与绑定)只有本批纯模块、已实现的 identity-values、`ajv`，不 import `@deepseek-ai/cordis`、`kernel-basis`、`storage`，不解析任何服务键；解析只读交进来的命令集。主要导出（候选名）：

| 导出 | 契约坐标 |
|---|---|
| 类型 `SlashCommandDefinition`；`slashCommandBodyContract`（asset-model 端口的那一份） | [S-1](../../../../spec/data/slash-command/v1/contract.md#s-1-斜杠命令定义是资产的正文)～[S-11](../../../../spec/data/slash-command/v1/contract.md#s-11-属性项的推出规则) |
| `recognize(text) → Recognition` | [S-12](../../../../spec/data/slash-command/v1/contract.md#s-12-只识别经交付面的输入)～[S-15](../../../../spec/data/slash-command/v1/contract.md#s-15-一条输入至多一条命令) |
| `parseInvocation(invocation, commandSet) → ParseResult`（四支） | [S-16](../../../../spec/data/slash-command/v1/contract.md#s-16-名字只按会话斜杠命令集认)～[S-20](../../../../spec/data/slash-command/v1/contract.md#s-20-parseresult-四支) |
| `expandPrompt`、`expandSkill` | [S-21](../../../../spec/data/slash-command/v1/contract.md#s-21-提示词型的展开)～[S-23](../../../../spec/data/slash-command/v1/contract.md#s-23-命令型的参数) |
| `judgeSlashCommand(value)`、`judgeInvocation(invocation)` | [S-26](../../../../spec/data/slash-command/v1/contract.md#s-26-规范表示)～[S-29](../../../../spec/data/slash-command/v1/contract.md#s-29-表示层拒绝与解析失败分开都不修补) |
| `slashCommandAttributeDeclarations(definition)`、`slashCommandReferences(definition)`；`validate(definition, value)` 与 `judgeSlashCommandValue(definition, value, context?)` | S-11 的属性推出、skill 引用与同一冻结 Schema 全部九项定义；不读权限或解析服务 |

**函数层不承诺**：解析失败什么都不发与留痕（[S-24](../../../../spec/data/slash-command/v1/contract.md#s-24-解析失败即什么都不发)、[S-25](../../../../spec/data/slash-command/v1/contract.md#s-25-留痕)）、受理面收到时重新识别、保留名在系统内唯一——归交付面、受理面与发布流程（[装配给 vs 协议给](#装配给-vs-协议给)右列）。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。交付面、受理面、注册表、求值、资产治理各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；`slashCommandBodyContract`（asset-model 端口的那一份）是普通值 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**；没有事件能越过租户或会话边界。解析只读交进来的命令集 `S`，不读别的会话、别的层 | S-16 |
| 存储 | **无** | — |

### 装配给 vs 协议给

[第六节](../../../../spec/data/slash-command/v1/contract.md#六装配给与协议给)六行里，本节点给的是「同一份实现」：

| 行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| 两处识别出同一结果 | `recognize`、`parseInvocation` 一份实现，交付面与受理面各自调 | 分成两个实现时，另一份须各自跑通 examples 第 4 节五十行 |
| 位置以码点计、相对 `raw` | 全程按码点迭代，位置是码点下标 | `raw` 跨进程逐码点原样传递 |
| 接收方按 `raw` 重新识别 | `judgeInvocation(invocation)` 重新识别并逐成员比对（不一致即 `malformed`） | 受理面在收到时调它（SC-5） |
| 没权限与不存在同一回答 | `unknown_command` 的 `explanation` 不提权限、别层、别会话 | 任何一跳不加料 |
| 整数取值的界 | ±(2^53−1)，不在界内即 `type_mismatch` | — |
| 保留名在系统内唯一 | 无 | 发布流程（SC-2） |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/slash-command/v1/contract.md#s-1-斜杠命令定义是资产的正文)～[S-11](../../../../spec/data/slash-command/v1/contract.md#s-11-属性项的推出规则) 命令定义、保留区、绑定、参数声明、模板、推出规则 | 类型 `SlashCommandDefinition`；`slashCommandBodyContract`（命令名收窄与保留区经它判） | 保留区判定要看绑定种类，所以名字随正文一起判（`data.asset-model/v1#S-27` 第三种情形）；「空白」用 identity-values 导出的码点集合（SLC-1） | V-1、V-3；SC-6 |
| [S-12](../../../../spec/data/slash-command/v1/contract.md#s-12-只识别经交付面的输入)～[S-23](../../../../spec/data/slash-command/v1/contract.md#s-23-命令型的参数) 识别与解析、展开 | `recognize(text) → Recognition`；`parseInvocation(invocation, commandSet) → ParseResult`（四支）；`expandPrompt`、`expandSkill` | 全程按**码点**迭代（`for…of` 与 `codePointAt`），位置是码点下标；落单代理项的输入先拒；切分照 S-17 六条手写；整数先按正则取文字、再用 `BigInt` 比界，不经浮点；**解析只读 `commandSet`**，失败的 `explanation` 不提权限、别层、别会话 | V-2（examples 第 4 节五十行，**每一个实现**都跑）；SC-3、SC-4 的类型面：失败支没有可发送的内容 |
| [S-24](../../../../spec/data/slash-command/v1/contract.md#s-24-解析失败即什么都不发)、[S-25](../../../../spec/data/slash-command/v1/contract.md#s-25-留痕) 什么都不发、留痕 | 无（本模块只给 `failed` 支与展开物；来路标记的形状归 `data.content-blocks`） | — | 交付面与受理面 |
| [S-26](../../../../spec/data/slash-command/v1/contract.md#s-26-规范表示)～[S-29](../../../../spec/data/slash-command/v1/contract.md#s-29-表示层拒绝与解析失败分开都不修补) 六个拒绝值、不修补 | `judgeSlashCommand(value)`、`judgeInvocation(invocation)` | 表示层拒绝与解析失败**两种返回类型不相容** | V-3 |

### 按码点计位置，手写切分

| | 用 JS 字符串下标（UTF-16 码元） | **按码点迭代（本节点选）** |
|---|---|---|
| 位置 | 增补平面字符占两个下标，`at` 与契约差一 | 与 S-14 一致 |
| 代价 | 最省事 | 每次取位置要数码点；输入是一行人敲的文字，量小 |

**落选方的最强论证**：JS 原生、零成本，且大多数命令只有 ASCII。**它输给第六节第 2 行**：位置跨实现要一致，UTF-16 下标在含 emoji 的参数上就会指错字。**本方弱点**：每处取下标都要经一个码点换算，写错一处就是一处 off-by-one；以 examples 第 4 节里带增补平面字符的行守住。置信度：**高**。

### 识别与展开辅助函数的调用前提

**2026-09-26，主调度技术采用**：`recognize` 的输入是 S-12 的 Unicode 码点序列。非字符串或落单代理项违反该辅助函数前提时给 `TypeError`，不增加第四种 `Recognition`；对外来的 invocation，`judgeInvocation` 仍给既有 `malformed`。`parseInvocation` 接已经合法的 invocation 与调用方交入的命令集，不去查别层或权限。

`expandPrompt(definition, invocation) → Extract<ParseResult, { kind: 'expanded' | 'failed' }>` 只接 prompt 型合法定义，复用同一个 parser／模板展开规则；参数解析失败仍回原 `failed` 支。调用方保证该定义是本次已识别名字对应的实际合法定义；这个没有命令集参数的辅助函数不声称完成 S-16 查找。不是 prompt 型属于技术调用前提违例，不新增第五种 `ParseResult`。

`expandSkill(invocation, skillName, pkg, annotations)` 是 S-22 展开物的纯投影：调用方先完成解析、以敲命令的人核权并选择此刻生效的合法 `SkillPackage`，再显式给每块的 `BlockId` 与 `Visibility`。结果按次序为正文逐字一块，及 `argumentText` 非空时的原样参数块；来路标记沿 S-22，`command` 来自本次已解析的名字。标注数必须恰与产出块数匹配，前提违例给 `TypeError`；本函数不生成身份、不作权限判定、不重新解析或格式化正文、不读目录、不写留痕、不发送消息。不能把纯展开物的通过声明为受理面的权限或落账已经完成。

`judgeSlashCommand(value, { capabilityName?, origin? })` 与辅助 `judgeSlashCommandValue` 在缺少记录上下文时只判可独立确定的形状与谓词；不能据局部 `ok` 声称 S-4 的记录名、来源与绑定关系已经核实。正式接收资产记录由 asset-model 的真实正文端口交入实际 `capabilityName`／`origin`，判完整 S-4；Schema 的九项定义校验也不替代此步。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.asset-model` v1、`data.content-blocks` v1、`data.identity-values` v1、`data.skill-package` v1 | [asset-model](../asset-model/README.md)、[content-blocks](../content-blocks/README.md)、已实现的 identity-values、[skill-package](../skill-package/README.md) | 随包版本 | 静态 import |
| 被消费 | 交付面、受理面、注册表、求值、资产治理 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；解析失败 ⇒ `ParseResult` 的 `failed` 支（`reason` 与 `at`）。两者类型不相容，这两种领域结果都不抛异常；只有上述辅助函数调用前提违例给 `TypeError`。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-6](../../../../spec/data/slash-command/verification.md#静态检查义务)：

| 检查 | 形式 | 谁跑 |
|---|---|---|
| SC-3、SC-4（失败不发送、不读权限） | 类型：`failed` 支里没有可发送的内容；`parseInvocation` 的参数里没有权限 | 编译期；交付面、受理面另立规则 |
| SC-6（推出规则只读正文） | import 白名单（候选）：推出规则模块只许 import 类型 | 本包 |
| SC-1、SC-2、SC-5 | 落在交付面、受理面与发布流程 | 各消费者 |

规则都**尚无**。

## 实施缺口与消费者影响

契约的已知缺口（第十节，G-7～G-9 未决）不重抄。本节点自己的：

- **SLC-1 空白码点集合的导出**：S-13 的 `W` 与 `data.asset-model/v1#S-2` 是同一个集合，identity-values 包未导出——D-040 §八 M44 登记为**实现期事项**（identity-values 补一个导出），见 [asset-model AM-1](../asset-model/design.md#实施缺口与消费者影响)。owner：identity-values 节点落包时。
- **SLC-2 端口的组合根**：见 [asset-model AM-5](../asset-model/design.md#实施缺口与消费者影响)。
