# tool-model 实现设计

兑现六份 v1 数据契约（都是 candidate）：[`data.tool-definition`](../../../../spec/data/tool-definition/v1/contract.md)（下称 TD）、[`data.loop-extension`](../../../../spec/data/loop-extension/v1/contract.md)（LE）、
[`data.skill-package`](../../../../spec/data/skill-package/v1/contract.md)（SP）、[`data.slash-command`](../../../../spec/data/slash-command/v1/contract.md)（SLC）、
[`data.mcp-endpoint`](../../../../spec/data/mcp-endpoint/v1/contract.md)（ME）、[`data.connector`](../../../../spec/data/connector/v1/contract.md)（CN）。条款写成「TD S-6」这样；导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，复用：

- **JSON Schema**：`ajv` 8.20.0 的 Draft 2020-12 入口，两用——校验六份 Schema 的交换表示（照 identity-values，Schema 从 spec 原样复制进包、逐字节核对）；以及**判一次调用的参数**与「作者给的参数 schema 是不是合法的 Draft 2020-12 schema」（[下文](#参数判定用-ajv-编译作者的-schema)）。
- **YAML 1.2**：SP S-20 第 5、6 条要一个 YAML 1.2 解析器，映射里键重复即拒、核心键不强转。候选第三方包 `yaml`（[下文](#skillmd-的-yaml-读法)）——**尚未采用，引入依赖须主线登记**。
- **包内依赖**：[message-model](../message-model/README.md)（块、消息、账的类型与校验，`ModelToolName` 的逐字副本在 CB 里）、[asset-model](../asset-model/README.md)（名字词法、属性声明、设置项类别、正文端口的类型）、[model-model](../model-model/README.md)（LE 用到 `data.model-profile`）、identity-values、offer-expiry。**这几条里有三条在包级环上**（[MSG-1](../message-model/design.md#包级依赖成环)）。
- 拒绝值的判法沿用 [message-model 的写法](../message-model/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)：每份契约一张有序清单，Schema 只判剩余项；TD 与 ME 的 `malformed` 带 M 编号，清单项即 M 编号。
- **Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。执行运行时、注册表、MCP 桥、拓展件派发、兼容层、资产治理、求值、模型请求运行时各自 `import` | 六份契约都没有操作、提交点与状态转移 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**。本模块导出的 `bodyContracts`（asset-model 端口的实现）是一个普通值，由消费者在构造 asset-model 判定对象时交进去，不经 Cordis；提供者换代时没有在途事实在本模块里 | — |
| effect 装卸 | **无装载效应**（0 行）。参数判定的编译缓存是模块内的纯缓存（同一份 schema 恒得同一个判定函数），不是受管资源 | — |
| 事件派发 | **不发、不听**。没有事件能越过租户或会话边界。CN 的信封**不带归属**（CN S-8），归属由接入端在交接里显式携带——那是交接协议的事，不在本模块 | — |
| 存储 | **无**：不读写任何存储；ME 的动作清单副本、SP 的资源字节都由调用方交进来 | — |

### 装配给 vs 协议给：单机时本节点提供了什么

六张表里，本节点只在「纯函数、表示层」那几行出力；其余行归执行运行时、注册表、MCP 桥、交付面与受理面、接入端：

| 契约与行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| TD「`modelInput` 由定义算出」「名字相等」「投成任何一家不改写 schema、逆转写唯一」 | `modelInput`、`modelName`、`definitionNameOf` 三个纯函数；命令表按**码点**升序 | 键名映射由传输适配做，逆转写只由执行运行时在起执行者之前调 |
| TD「模型看到的条目与据以校验的定义是同一份」「`help` 与 `inspect` 一致」「裸字符串只兑现一次」 | 无 | 注册表与执行运行时 |
| SP「文本形式的读法」 | `readSkillMd(text)` 纯函数 | — |
| SP「目录形式的符号链接判定」 | `readSkillPackage(entries)` 只收**已解析过链接**的条目 | 读目录、解析链接的那一方（持有目录的那台宿主） |
| SLC「两处识别出同一结果」「位置以码点计」「整数取值的界」「没权限与不存在同一回答」 | `recognize`、`parseInvocation` 一份实现；位置按码点数；整数按 ±(2^53−1) 判；解析只读交进来的命令集 `S` | 交付面与受理面各自调用；跨语言的另一份实现须各自跑通 examples 第 4 节五十行 |
| 六份契约的「表示层校验在每个接收边界重做」 | 每份契约一个纯的校验入口 | 在哪些边界调 |
| ME「OAuth 绑定号唯一、不可猜」「stdio 在据点机上拉起」、CN 各行（信封绑定、`externalId`、附件解引用、选不了目标） | 无 | 资产治理与 MCP 桥；连接件接入端与受理 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| TD [S-1](../../../../spec/data/tool-definition/v1/contract.md#s-1-工具定义是什么)～[S-5](../../../../spec/data/tool-definition/v1/contract.md#s-5-多命令工具)、[S-8](../../../../spec/data/tool-definition/v1/contract.md#s-8-说明与用法)～[S-17](../../../../spec/data/tool-definition/v1/contract.md#s-17-来源) 定义的成员 | 类型 `ToolDefinition`、`ToolCommand` 等 | — | V-1 |
| TD [S-6](../../../../spec/data/tool-definition/v1/contract.md#s-6-模型面只有一个条目)、[S-7](../../../../spec/data/tool-definition/v1/contract.md#s-7-多命令-input-的生成规则)、[S-18](../../../../spec/data/tool-definition/v1/contract.md#s-18-名字的表示与相等) 模型面条目、生成规则、名字 | `modelEntry(d)`、`modelInput(d)`、`modelName(name)`、`definitionNameOf(modelName)`；类型 `ModelToolName`（**家在本包**） | 转写：每个 `:` 换成 `__`；逆转写：每段连续 `_` 长 2m 换回 m 个 `:`、长 1 留下；命令表**按码点升序**——JS 数组默认排序比的是 UTF-16 码元，对增补平面的字符与码点序不一致，所以比较函数按码点写 | V-2（examples 第 9 节逐字核对）；逆转写唯一由 S-18 第 2 条（禁 `__`、`_:`、`:_`）保证，测试对三种相邻各给一个反例 |
| TD S-4、S-5 末条、S-7 第 3、4 条：**判一次调用的参数** | `judgeCallArguments(d, call) → { ok: { command?, args } } \| { invalid: 诊断 }` | 单函数工具按 `input` 判；多命令工具先核 `command` 是命令表里的名字、`args` 是对象（缺席按 `{}`），再按 `commands[c].input` 判；**顶层没写 `additionalProperties` 按 `false` 读**（TD 设计依据表的主线裁定）；见[下文](#参数判定用-ajv-编译作者的-schema) | V-9（过了模型面、判定不过的三条调用都被拒）。**判不过怎样收场**归执行运行时 |
| TD [S-19](../../../../spec/data/tool-definition/v1/contract.md#s-19-由定义得出的依赖声明)、[S-31](../../../../spec/data/tool-definition/v1/contract.md#s-31-属性项的推出规则) 依赖声明、推出规则 | `toolDependencies(d)`；`bodyContracts.tool`（引用、推属性） | 只读定义本身 | asset-model SC-6、PRE-6 |
| TD [S-20](../../../../spec/data/tool-definition/v1/contract.md#s-20-两种写法与等价规则)～[S-25](../../../../spec/data/tool-definition/v1/contract.md#s-25-toolresult-不是收场) 返回值 | 类型 `ToolReturn`、`ToolResult`；`toolResultOf(returned)`（裸字符串 ⇒ 恰一个文本块、两位标注为真） | 纯函数；**只兑现一次**的纪律归调用它的执行运行时 | V-5 的等价规则那一半 |
| TD [S-26](../../../../spec/data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序)～[S-28](../../../../spec/data/tool-definition/v1/contract.md#s-28-判别式与枚举闭合) 十二个拒绝值、M1～M27 | `judgeToolDefinition(value)`、`judgeToolReturn(value)` | Schema 之外那一步：参数 schema 是否合法的 Draft 2020-12（ajv 的元模式校验）、每个参数带说明、只用可呈现子集、命令 `input` 无根相对 `$ref` 与 `$id`、`name` 转写后长度；位置清单按 S-4 的封闭清单递归 | V-1、V-2。**「合法的 Draft 2020-12」以 ajv 元模式校验为准**是本节点的读法：M27 已把可呈现子集之外的关键字全挡掉，剩下的差别只在子集内关键字的取值形状 |
| LE [S-1](../../../../spec/data/loop-extension/v1/contract.md#s-1-十一个位置)～[S-29](../../../../spec/data/loop-extension/v1/contract.md#s-29-没有放宽)、[S-36](../../../../spec/data/loop-extension/v1/contract.md#s-36-规范表示与定义项)～[S-39](../../../../spec/data/loop-extension/v1/contract.md#s-39-判别式与枚举闭合) 位置、维度、干预力、声明、输入、八种结论、十个拒绝值 | 类型 `LoopExtensionDefinition`、`Conclusion` 等；常量表 `POWER_CONCLUSIONS`（S-20）、`POSITION_CONCLUSIONS`（S-21）；`judgeConclusion(value, ctx)` | 两张合法组合表写成数据、由同一张表驱动 Schema 之外的判定；第 9、10 行（改了不可改的成员、冒名的 `inject`）要对照输入与本件 name，经 `ctx` 交进来 | V-2（13 位置 × 8 结论 × 3 档机检）。「不合法的结论按报错处置」（S-34）归派发器 |
| LE [S-40](../../../../spec/data/loop-extension/v1/contract.md#s-40-属性项的推出规则) 推出规则 | `bodyContracts.loop_extension` | 规则一恒为空集 | asset-model SC-6 |
| SP [S-1](../../../../spec/data/skill-package/v1/contract.md#s-1-技能包是什么)～[S-19](../../../../spec/data/skill-package/v1/contract.md#s-19-包是版本内容的一个整体)、[S-32](../../../../spec/data/skill-package/v1/contract.md#s-32-执行环境要求) 包的形状、键的处置、资源、脚本、定义记录 | 类型 `SkillPackage`；`skillDependencies(pkg)`；`bodyContracts.skill` | 正文逐字：`body` 是字符串值，**本模块没有任何对它做替换、插值或执行的函数** | V-1、V-3；SC-1、SC-4 |
| SP [S-20](../../../../spec/data/skill-package/v1/contract.md#s-20-skillmd-的文本形式与定界) 文本形式 | `readSkillMd(text) → { ok: { manifest, body, unknownKeys } } \| { rejected }` | 按行找开头与**独占一行**的闭合 `---`（LF 或 CRLF），不去 BOM；frontmatter 交 YAML 1.2 解析（[下文](#skillmd-的-yaml-读法)），核心键类型不对即 `malformed`、不强转；`body` 逐字 | V-4（examples 第 6 节十五行，比对读出的值本身） |
| SP [S-21](../../../../spec/data/skill-package/v1/contract.md#s-21-包的目录形式) 目录形式 | `readSkillPackage(entries)`：`entries` 是调用方读目录得到的条目（路径、类别、字节，链接已解析并注明是否落在包根之外） | 纯函数判 `manifest_missing`、`resource_escapes`、非常规文件；**读目录与解析链接不在本模块** | V-5 要真实文件系统，那一半归读目录的一方 |
| SP [S-22](../../../../spec/data/skill-package/v1/contract.md#s-22-规范表示)～[S-25](../../../../spec/data/skill-package/v1/contract.md#s-25-表示层拒绝不是判定也不修补) 拒绝值与次序 | `judgeSkillPackage(value)` | 定义记录的格式不认得即拒，且先于其余（S-30） | V-2 |
| SLC [S-1](../../../../spec/data/slash-command/v1/contract.md#s-1-斜杠命令定义是资产的正文)～[S-11](../../../../spec/data/slash-command/v1/contract.md#s-11-属性项的推出规则) 命令定义、保留区、绑定、参数声明、模板、推出规则 | 类型 `SlashCommandDefinition`；`bodyContracts.slash_command`（命令名收窄与保留区经它判） | 保留区判定要看绑定种类，所以名字随正文一起判（asset-model S-27 第三种情形） | V-1、V-3；SC-6 |
| SLC [S-12](../../../../spec/data/slash-command/v1/contract.md#s-12-只识别经交付面的输入)～[S-25](../../../../spec/data/slash-command/v1/contract.md#s-25-留痕) 识别与解析 | `recognize(text) → Recognition`；`parseInvocation(invocation, commandSet) → ParseResult`（四支）；`expandPrompt`、`expandSkill` | 全程按**码点**迭代（`for…of` 与 `codePointAt`），位置是码点下标；落单代理项的输入先拒；切分照 S-17 六条手写（不用 shell 词法库，契约明写）；整数先按正则取文字、再用 `BigInt` 比界，不经浮点；**解析只读 `commandSet`**，失败的 `explanation` 不提权限、别层、别会话 | V-2（examples 第 4 节五十行，**每一个实现**都跑）；SC-3、SC-4 的类型面：失败支没有可发送的内容 |
| SLC [S-26](../../../../spec/data/slash-command/v1/contract.md#s-26-规范表示)～[S-29](../../../../spec/data/slash-command/v1/contract.md#s-29-表示层拒绝与解析失败分开都不修补) 六个拒绝值 | `judgeSlashCommand(value)` | 表示层拒绝与解析失败两种返回类型不相容 | V-3 |
| ME [S-1](../../../../spec/data/mcp-endpoint/v1/contract.md#s-1-接入点正文)～[S-13](../../../../spec/data/mcp-endpoint/v1/contract.md#s-13-凭据配值的取值域)、[S-26](../../../../spec/data/mcp-endpoint/v1/contract.md#s-26-接入点-name-登记时收窄) 正文、连接目标、动作清单副本、条目名、登记时收窄、凭据配值域 | 类型 `McpEndpoint`、`ActionSnapshot`（`fetched`／`not_fetched` 两支类型上分开）；`actionEntryName(endpointName, remoteName) → { ok } \| { notProjectable }`；`bodyContracts.mcp`（名字收窄报 `name_not_projectable`） | 条目名合不合 TD S-18 用 TD 那一份 `ToolName` 判，不另写；**不改写**拼不出的名字 | V-1、V-2；SC-3 由两支类型兑现 |
| ME [S-14](../../../../spec/data/mcp-endpoint/v1/contract.md#s-14-推出规则五类项)～[S-17](../../../../spec/data/mcp-endpoint/v1/contract.md#s-17-工作区格上的这些项) 推出规则（正文＋动作集） | `bodyContracts.mcp` 的推属性（显式收动作集副本） | 逐动作项的键 = `execute:` ＋ 对端动作名原样 | SC-2、SC-4 |
| ME [S-18](../../../../spec/data/mcp-endpoint/v1/contract.md#s-18-规范表示)～[S-21](../../../../spec/data/mcp-endpoint/v1/contract.md#s-21-表示层拒绝不是判定也不修补) 七个拒绝值、M1～M13 | `judgeMcpEndpoint(value)` | `url` 的四条（S-5）用 WHATWG `URL` 解析后逐条判，带 userinfo 即 `url_invalid` | V-2 |
| CN [S-1](../../../../spec/data/connector/v1/contract.md#s-1-连接件正文)～[S-13](../../../../spec/data/connector/v1/contract.md#s-13-两项权限)、[S-16](../../../../spec/data/connector/v1/contract.md#s-16-规范表示)～[S-19](../../../../spec/data/connector/v1/contract.md#s-19-表示层拒绝不是判定也不修补) 正文、来源、信封、推出规则、四个拒绝值 | 类型 `ConnectorDefinition`、`InboundEnvelope`；`judgeConnector(value)`、`judgeEnvelope(value)`；`bodyContracts.connector` | 信封类型里没有任何归属成员；推出规则产出 `install`（CN G-4 与 asset-model G-15 未决，本模块照两份现行正文） | V-1、V-2；SC-1（信封文本不走斜杠识别）由类型分开：`recognize` 只收交付面输入的类型 |
| asset-model 的正文端口 | `bodyContracts`：六类各给「判正文与名字」「推属性声明」「列引用（规则一）」 | 由六份契约的入口组合而成，无额外逻辑 | 与 [asset-model 的端口](../asset-model/design.md#正文契约的判定经端口注入不-import-tool-model)对齐 |

### 参数判定用 ajv 编译作者的 schema

| | 手写一个只认可呈现子集的校验器 | **ajv 编译作者的 schema（本节点选）** |
|---|---|---|
| 覆盖 | 17 个关键字，自己写语义（`pattern`、`format`、`anyOf`／`oneOf` 的判定） | Draft 2020-12 全集，本就是项目已采用的依赖 |
| 与表示层那一步的一致 | 两套实现：表示层用 ajv 判「合不合法」，判参数用自写的 | 同一个引擎：判合法与判参数读的是同一份语义 |
| 代价 | 自己担正确性 | 每份 schema 编译一次；按 schema 的内容指纹缓存编译结果（纯缓存，同内容同结果） |

**落选方的最强论证**：可呈现子集很小，手写可以精确控制 `pattern` 的执行（防灾难性回溯）与 `format` 的语义，不把远端 MCP 对端给的 schema 交给一个通用引擎。
**它输给「一个语义一个实现」**：表示层判合法用 ajv，判参数若另写，两边对 `anyOf`、`additionalProperties` 的读法一旦不同，就会出现「定义合法、参数永远判不过」的定义。
**本方弱点**：`pattern` 由 JS 正则执行，远端给的正则可能灾难性回溯（缺口 [TM-3](#实施缺口与消费者影响)）；`format` 是断言还是注解契约没写（[TM-2](#实施缺口与消费者影响)）。置信度：**中高**。

### SKILL.md 的 YAML 读法

| | 手写一个只认「键: 标量」的子集 | `js-yaml` | **`yaml`（本节点候选）** |
|---|---|---|---|
| YAML 1.2、键重复即拒、不强转 | 子集读不了 `metadata` 的嵌套映射与多行标量，**不是 YAML 1.2**，违反 SP S-20 第 5 条 | 1.2（v4 起）；重复键默认报错 | 1.2 核心模式；`uniqueKeys` 默认开 |
| 新依赖 | 无 | 有 | 有 |

**选 `yaml` 的依据是待核对主张**：它的默认模式是 YAML 1.2 core、重复键默认报错、`name: no` 读成字符串——**假设，须按 source-check 取证**（basis 无此条目，它不是 Cordis 语义）；取证在两个库之间定一个，**引入依赖须主线登记**（缺口 [TM-5](#实施缺口与消费者影响)）。
**落选方（手写子集）的最强论证**：零依赖、行为完全可控。**它输给契约**：S-20 明写「按 YAML 1.2 解析」，子集读法会让合法的 frontmatter 被拒。置信度：**中**（在两个库之间）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks`、`data.messages`、`data.call-accounts` v1 | [message-model](../message-model/README.md)——**成环**（[MSG-1](../message-model/design.md#包级依赖成环)） | — | 划分定下之前没有可用的解析方式 |
| `data.asset-model` v1 | [asset-model](../asset-model/README.md)——**成环**（同上）；正文判定那一条由 asset-model 的端口解开 | — | 同上 |
| `data.model-profile` v1（LE 的 `select_model`） | [model-model](../model-model/README.md)——**成环**（同上） | — | 同上 |
| `data.identity-values`、`data.offer-expiry` v1 | 已实现的 core 包 | 随包版本 | 静态 import |
| 被消费 | 执行运行时、注册表、MCP 桥、拓展件派发、兼容层、资产治理、求值、模型请求运行时、交付面与受理面 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

**没有配置项。**

## 状态、并发与失败映射

**无共享可变状态、无提交点。**唯一的模块内状态是参数判定的编译缓存：以 schema 内容指纹为键、值是编译出的纯函数，**任何时刻清掉都不改变结果**；并发读写只会重复编译同一份，不会给出不同答案。

**失败映射**：表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个，TD 与 ME 另带 M 编号作诊断）；参数判不过 ⇒ `{ invalid: 诊断 }`；斜杠命令解析失败 ⇒ `ParseResult` 的 `failed` 支（`reason` 与 `at`）；拼不出条目名 ⇒ `{ notProjectable }`。**四种互不相容，都不抛异常**；抛出只留给本模块自身的缺陷。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

六份契约的 SC 项多数约束消费者（执行入口、受理面、接入端、放行判断、读面）。本节点承载的几条都**尚无**：

| 检查 | 形式 | 谁跑 |
|---|---|---|
| TD V-10 定义记录的类型里没有运行时对象、闭包、代码或装载方式；名字不被解析 | 类型：定义只由 JSON 值组成（没有函数成员）；规则（候选）：禁止对 `name` 调 `split`／`indexOf(":")` 一类取来源的写法，转写函数所在模块除外 | 本包与消费者包 |
| SP SC-4、SLC SC-6、ME SC-2、asset-model SC-6（推出规则只读正文与传进来的动作集） | import 白名单（候选）：推出规则模块只许 import 类型；运行期由 asset-model 对结果查保留项名 | 本包 |
| SP SC-1（正文不被替换、插值、交给 shell） | 本包不导出任何作用于 `body` 的变换函数；消费者一侧另立规则 | 消费者包 |
| ME SC-3（`not_fetched` 不当空清单） | 两支在类型上分开，没有把 `not_fetched` 变成数组的入口 | 编译期 |
| SLC SC-3、SC-4（失败不发送、不读权限） | 类型：`failed` 支里没有可发送的内容；`parseInvocation` 的参数里没有权限 | 编译期；交付面、受理面另立规则 |
| 其余（SP SC-2、SC-3，SLC SC-1、SC-2、SC-5，ME SC-1、SC-4，CN SC-1～SC-4） | 落在各消费者节点 | 各消费者 |

## 实施缺口与消费者影响

六份契约各自的已知缺口不重抄。本节点自己的缺口：

- **TM-1 包级依赖成环**：见 [MSG-1](../message-model/design.md#包级依赖成环)。owner：主线。
- **TM-2 判参数时 `format` 是断言还是注解**：TD S-4 把 `format` 列进可呈现子集，却没写判一次调用的参数时它挡不挡值。Draft 2020-12 的默认读法是注解（不挡）。**本节点不自选**：它决定一次带 `format: date-time` 的调用会不会被拒，属契约语义。owner：**主线**（条款坐标 `data.tool-definition/v1#S-4`、`#S-7` 第 3 条）。受阻：执行运行时的参数判定。
- **TM-3 远端正则的执行安全**：MCP 对端给的参数 schema 经 MCP 桥生成定义，它的 `pattern` 在判参数时由 JS 正则执行，可能灾难性回溯、卡住据点进程。候选：换 RE2 类线性引擎（原生依赖，**假设，须按 source-check 取证**）或在生成定义时拒绝有回溯风险的模式（后者要契约给拒绝值）。owner：本节点与 MCP 桥节点，须主线裁定走哪条。
- **TM-4 `ModelToolName` 的副本对齐**：CB 里有一份逐字副本（为避免契约互依）。对齐测试放在本包：取 message-model 导出的 CB Schema 与本包的 TD Schema，比较两处 `$defs/ModelToolName` 逐字相同。owner：本节点（义务，不是阻塞）。
- **TM-5 第三方依赖的采用**：`yaml`（或 `js-yaml`）尚未采用；引入产品运行依赖须主线登记。owner：主线。受阻：SP S-20 的读法。
- **TM-6 空白码点集合**：SLC S-13 的 `W` 与 asset-model S-2 用的是同一个集合，identity-values 未导出（[AM-1](../asset-model/design.md#实施缺口与消费者影响)）。owner：主线。
- **TM-7 `bodyContracts` 的组合根**：见 [AM-5](../asset-model/design.md#实施缺口与消费者影响)。
