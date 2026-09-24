# tool-definition 实现设计

契约：[`data.tool-definition` v1](../../../../spec/data/tool-definition/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)（`malformed` 带 M 编号，清单项即 M 编号）。
`ajv` 8.20.0 的 Draft 2020-12 入口在这里两用：校验本契约的交换表示；以及**判一次调用的参数**与「作者给的参数 schema 是不是合法、编译得了」（[下文](#参数判定用-ajv-编译作者的-schema)）。
**候选依赖**：`@eslint-community/regexpp`（[U-7](#schema_unsupported-的上限登记g-16) 的正则语法树）——[D-040 §八 M55](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 登记为候选依赖，**版本钉定与许可核对在实施程**，不另出决定。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。执行运行时、注册表、MCP 桥、传输适配、资产治理、求值各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**。本包导出的 `tool` 类正文端口实现是一个普通值，由消费者在构造 asset-model 判定对象时交进去（[asset-model 的端口](../asset-model/design.md#正文契约的判定经端口注入不-import-正文包)），不经 Cordis | — |
| effect 装卸 | **无装载效应**（0 行），**也没有模块级缓存**。参数判定的编译产物归消费者持有的判定对象（`createParameterJudge()`，[下文](#编译产物归判定对象不设模块级缓存)），ajv 实例归它、随它撤除；持有它的消费者（执行运行时的判定工作线程、MCP 桥）在自己的 effect 里持有、随自己撤除 | [D-040 §八 M50](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |
| 事件派发 | **不发、不听**；没有事件能越过租户或会话边界 | — |
| 存储 | **无** | — |

### 装配给 vs 协议给：单机时本节点提供了什么

| [第七节](../../../../spec/data/tool-definition/v1/contract.md#七装配给与协议给)的行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| `modelInput` 由定义算出；名字相等；投成任何一家不改写 schema、逆转写唯一 | `modelInput`、`modelName`、`definitionNameOf` 三个纯函数；命令表按**码点**升序 | 键名映射由传输适配做；逆转写只由执行运行时在起执行者之前调 |
| 表示层校验在每个接收边界重做 | `judgeToolDefinition`、`judgeToolReturn` | 在哪些边界调 |
| 参数 schema 编得出来（S-4 末段、S-26 第 13 行） | 本包[登记的上限](#schema_unsupported-的上限登记g-16)是常量：**同一份输入、同一份登记的上限 ⇒ 同一结论**——与哪一只判定对象、哪一条线程去判无关（编译产物不跨线程传，工作线程各造各的判定对象，M50） | 跨进程时判参数的那一端按**它自己**的上限重判；另一种语言的实现登记的上限可以不同（契约 S-26 那一句例外），需要跨实现一致时由主线定共同下限（契约 G-16） |
| 模型看到的条目与据以校验的定义是同一份；`help` 与 `inspect` 一致；裸字符串只兑现一次 | 无（`toolResultOf` 是纯函数，只调一次的纪律归调用方） | 注册表与执行运行时 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/tool-definition/v1/contract.md#s-1-工具定义是什么)～[S-5](../../../../spec/data/tool-definition/v1/contract.md#s-5-多命令工具)、[S-8](../../../../spec/data/tool-definition/v1/contract.md#s-8-说明与用法)～[S-17](../../../../spec/data/tool-definition/v1/contract.md#s-17-来源) 定义的成员 | 类型 `ToolDefinition`、`ToolCommand` 等 | 定义只由 JSON 值组成（没有函数成员） | V-1 |
| [S-6](../../../../spec/data/tool-definition/v1/contract.md#s-6-模型面只有一个条目)、[S-7](../../../../spec/data/tool-definition/v1/contract.md#s-7-多命令-input-的生成规则)、[S-18](../../../../spec/data/tool-definition/v1/contract.md#s-18-名字的表示与相等) 模型面条目、生成规则、名字 | `modelEntry(d)`、`modelInput(d)`、`modelName(name)`、`definitionNameOf(modelName)`；类型 `ModelToolName`（**家在本包**） | 转写：每个 `:` 换成 `__`；逆转写：每段连续 `_` 长 2m 换回 m 个 `:`、长 1 留下；命令表**按码点升序**——JS 数组默认排序比的是 UTF-16 码元，对增补平面字符与码点序不一致，所以比较函数按码点写 | V-2；逆转写唯一由 S-18 第 2 条保证，测试对三种相邻各给一个反例 |
| S-4、S-5 末条、S-7 第 3、4 条：**判一次调用的参数** | `createParameterJudge()` → 判定对象，方法 `judgeCallArguments(d, call) → { ok: { command?, args } } \| { invalid: 诊断 } \| { unsupported }`（M50；照 asset-model `createAssetModelJudge` 的形状） | 判定对象持有一只 ajv 实例与它编出的判定函数（对象内按 schema 内容编一次）；单函数工具按 `input` 判；多命令工具先核 `command` 是命令表里的名字、`args` 是对象（缺席按 `{}`），再按 `commands[c].input` 判；**顶层没写 `additionalProperties` 按 `false` 读**；**`format` 只作注解、不作断言**（ajv `validateFormats: false`；契约 S-4 末段第一条，M37）；**编不出来的 schema 没有判定函数可用**——本函数对它返回 `{ unsupported }`，**不退成「不判、全放行」**（S-4 末段「缺席即拒绝」）；**判定时限（[U-8](#schema_unsupported-的上限登记g-16)）由调用方计时**：本函数是同步纯计算，停不下来，所以放在可终止的工作线程里跑、到点终止线程的是执行运行时 | V-9、V-12 的本节点那一半（`format` 不据以拒绝）。判不过、编不出来、判定超时怎样收场归执行运行时：后两者一律 `failed{schema_unsupported}`（`capability.tool-execution-runtime/v1` S-23 ④；契约 G-15 已由 [D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16 关闭） |
| [S-19](../../../../spec/data/tool-definition/v1/contract.md#s-19-由定义得出的依赖声明)、[S-31](../../../../spec/data/tool-definition/v1/contract.md#s-31-属性项的推出规则) 依赖声明、推出规则 | `toolDependencies(d)`；`toolBodyContract`（asset-model 端口的 `tool` 那一份：判正文与名字、推属性、列引用） | 只读定义本身 | asset-model SC-6 |
| [S-20](../../../../spec/data/tool-definition/v1/contract.md#s-20-两种写法与等价规则)～[S-25](../../../../spec/data/tool-definition/v1/contract.md#s-25-toolresult-不是收场) 返回值 | 类型 `ToolReturn`、`ToolResult`；`toolResultOf(returned)`（裸字符串 ⇒ 恰一个文本块、两位标注为真） | 纯函数 | V-5 的等价规则那一半 |
| [S-26](../../../../spec/data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序)～[S-28](../../../../spec/data/tool-definition/v1/contract.md#s-28-判别式与枚举闭合) 十三个拒绝值、M1～M27 与次序 | `judgeToolDefinition(value, judge?)`、`judgeToolReturn(value)` | Schema 之外那一步：参数 schema 合不合法的 Draft 2020-12（ajv 元模式校验；**每个 `pattern` 先按 ECMA-262 不带 `u` 试编，编不过再带 `u` 试编；两者都编不过 ⇒ `input_not_schema`**（第 5 行），任一编得过即按编得过的那种语义登记（[U-1](#schema_unsupported-的上限登记g-16)，[D-040 §八 M56](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)））、每个参数带说明、只用可呈现子集、命令 `input` 无根相对 `$ref` 与 `$id`、`name` 转写后长度；**以上都过了，才按[登记的上限](#schema_unsupported-的上限登记g-16)去编——编不出来或超限即 `schema_unsupported`，第 13 行、最后一步**。去编用的判定对象由调用方传入（复用它持有的那只）；不传就随这次调用造一只、返回即丢，**不留任何跨调用的状态**；返回值里的块取 content-blocks 的值、原名 | V-1、V-2；examples 第 5 节新加的三行（嵌套无界量词、超长、`"^("` 先报 `input_not_schema`） |

### 参数判定用 ajv 编译作者的 schema

| | 手写一个只认可呈现子集的校验器 | **ajv 编译作者的 schema（本节点选）** |
|---|---|---|
| 覆盖 | 17 个关键字，自己写语义（`pattern`、`anyOf`／`oneOf` 的判定） | Draft 2020-12 全集，本就是项目已采用的依赖 |
| 与表示层那一步的一致 | 两套实现：表示层用 ajv 判「合不合法」，判参数用自写的 | 同一个引擎：判合法、判编译得了、判参数读的是同一份语义 |
| 代价 | 自己担正确性 | 每只判定对象内每份 schema 编译一次（[下节](#编译产物归判定对象不设模块级缓存)）；换一只判定对象（例如换一条工作线程）要重编 |

**落选方的最强论证**：可呈现子集很小，手写可以精确控制 `pattern` 的执行，不把远端 MCP 对端给的 schema 交给一个通用引擎。
**它输给「一个语义一个实现」**：表示层判合法用 ajv，判参数若另写，两边对 `anyOf`、`additionalProperties` 的读法一旦不同，就会出现「定义合法、参数永远判不过」的定义。
**本方弱点**：`pattern` 仍由 JS 正则执行，靠[下文](#schema_unsupported-的上限登记g-16)登记的上限挡住。置信度：**中高**（D-040 §八 M44 已接受）。

### 编译产物归判定对象，不设模块级缓存

参数 schema 来自作者与远端 MCP 对端，每个会话可带不同的 schema，编译产物的增长由外部驱动；据点要超长期待机。

| | 模块级缓存，加上界（LRU） | **判定对象持有（本节点选，[D-040 §八 M50](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）**：`createParameterJudge()` 造一只对象，ajv 实例与编出的判定函数都归它 |
|---|---|---|
| 归属与释放 | 模块级、没有 owner，只靠上界限住；插件撤除不释放 | 归造它的消费者；消费者在自己的 effect 里持有，撤除时丢掉它，内存随之可回收 |
| 跨线程 | 编译产物是函数，本来就不能跨工作线程传；模块级缓存在每条线程里各一份，却看起来像共享 | 显式：每条工作线程造自己的那一只 |
| 结论一致 | 同 | 同一份输入、同一份登记的上限 ⇒ 同一结论，与哪一只对象无关（上限是常量） |

**落选方（LRU）的最强论证**：消费者不用关心判定对象的生灭，接口最简单，命中率在长驻进程里更高。**它输在归属**：一块跨插件生命周期存活、撤除不释放的内存，在「超长期待机」的据点上没有保护点；上界只限大小，不回答「这块内存归谁」。**本方弱点**：换一只对象就要重编；ajv 实例自己是否强引用编过的 schema（它的内部缓存是 `Map` 还是 `WeakMap`）由此**不再影响资源归属**——对象丢了连同 ajv 实例一起丢——只作实施时的核对项（待核对主张）。置信度：**高**。

### `schema_unsupported` 的上限登记（G-16）

契约 S-4 末段与 S-26 第 13 行只写「有这几样上限、编不出来或判定超时即 `schema_unsupported`」，值与判法**由提供者设计登记**（[契约 G-16](../../../../spec/data/tool-definition/v1/contract.md#十已知缺口)：长度、回溯保护、方言，以及随 [D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16 加入的判定时限）。远端 MCP 对端给的 schema 经 MCP 桥生成定义后在据点进程里判参数，一个会灾难性回溯的正则能卡住整个进程。本节点登记的**候选值**如下（包未建，全部是候选；改其中任何一项都改变哪些 schema 被收下，须修订本节点）：

| # | 登记项 | 候选值与判法 | 为什么是这个值 |
|---|---|---|---|
| U-1 | 正则方言 | ECMA-262；**每个 `pattern` 先不带 `u` 试编，编不过再带 `u` 试编；两者都编不过 ⇒ `input_not_schema`**（第 5 行，先于第 13 行）；**任一编得过即按编得过的那种语义登记**，判参数时也按它（[D-040 §八 M56](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。ajv 的 `unicodeRegExp` **按 pattern 逐条对齐、不用全局默认**：判定对象给 ajv 注入一个按上面次序为每个 `pattern` 选标志的正则构造函数（候选：ajv 的 `code.regExp` 选项；该选项在 8.20.0 上的行为是**待核对主张，须按 source-check 取证**） | 这一句与上表 S-26 那一行是同一句；`"^("` 两种都编不过，报 `input_not_schema` 而不是 `schema_unsupported`（examples 第 5 节那一行）；类外的 `\-`、裸 `{` 这类只在不带 `u` 时合法的写法**照收**，按不带 `u` 的语义判 |
| U-2 | `pattern` 长度上限 | 每个 `pattern` **≤ 1024 个码点** | 工具参数的正则实际多在几十字符内；1024 远超常见用法，又把静态筛查的输入限在很小的规模 |
| U-3 | 回溯保护：嵌套无界量词 | 无界量词（`*`、`+`、`{n,}`）作用于一个本身含无界量词的子式（星高 ≥ 2，如 `(a+)+`、`(a*b*)*`）⇒ 超出 | 指数回溯的典型形态；examples 第 5 节那一行 `^(a+)+$` 正是它 |
| U-4 | 回溯保护：反向引用 | 含 `\1`～`\9` 或 `\k<名>` ⇒ 超出 | 反向引用让匹配不再是正则语言，回溯上界无从估计 |
| U-5 | 回溯保护：计数量词上界 | `{n,m}` 的 `m` > 1000 ⇒ 超出 | 大计数量词在回溯引擎里展开成长链，与嵌套量词叠加时同样爆炸 |
| U-6 | 「编不出来」 | ajv 8.20.0 以 `strict: false`、`validateFormats: false`、`pattern` 按 U-1 逐条选标志编译抛错 | ajv 的严格模式会把一些合法 Draft 2020-12 写法当成编译错误，那会误报成 `schema_unsupported`；关掉它，编不出来只剩真正的引擎限制。严格模式各子项的确切行为是**待核对主张，须按 source-check 取证**（basis 无此条目），落包时以包内正反例核 |
| U-7 | 判法的实现 | U-3～U-5 在正则的语法树上判，语法树由成熟的正则解析器给（候选依赖 `@eslint-community/regexpp`，M55），按 U-1 选定的那种标志解析，**不手写扫描** | 手写扫描在转义、字符类、命名组上容易漏判或误判；该解析器的行为是**待核对主张，须按 source-check 取证**（basis 无此条目） |
| U-8 | 判一次调用的判定时限 | **500 ms**（墙钟，从把这一次调用的判定交给工作线程到拿回结论）；到点即判定超时 ⇒ 那一项 `failed{schema_unsupported}`（执行运行时 S-23 ④，T-16）。**计时与终止归执行运行时**（它的判定工作线程），本节点只登记值 | 正常的参数判定是亚毫秒级，500 ms 留出三个数量级给大参数；又把「一只病态正则拖住一批提交」的最长等待限在半秒。筛不出的病态正则（U-3～U-5 之外）靠它兜底 |

| | 换线性时间的正则引擎（RE2 一类） | **长度上限 ＋ 语法树筛查（本节点登记）** |
|---|---|---|
| 挡得住回溯 | 从根上挡住 | 挡住登记的三种形态；不保证挡住全部 |
| 依赖 | 原生依赖，**假设，须按 source-check 取证**（basis 无此条目） | 一个纯 JS 解析器 |
| 误伤 | 少（但 RE2 不支持的语法照样要报 `schema_unsupported`） | 会拒掉一些其实安全的写法（如 `(ab+)*` 这类不会爆炸的嵌套） |

**落选方（RE2）的最强论证**：它是唯一有保证的回溯保护。**它输在**要引一个原生依赖，而本版的工具作者与 MCP 对端给的 `pattern` 实际多是简单形态。**本方弱点**：筛查是启发式；筛不出的病态正则（如重叠的多选 `(a|aa)+`）仍能卡住进程，据点上要有调用级的超时兜底（归执行运行时，跨节点交接）。置信度：**中**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks` v1（块、`ModelToolName` 的副本在那边） | [content-blocks](../content-blocks/README.md) | 随包版本 | 静态 import |
| `data.asset-model` v1（名字词法、属性声明、设置项类别、端口类型） | [asset-model](../asset-model/README.md) | 同上 | 同上 |
| 被消费 | loop-extension、skill-package、mcp-endpoint、asset-evaluation、执行运行时、注册表、MCP 桥、传输适配、资产治理 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环；另加一个第三方正则解析器（U-7，未采用）。**没有配置项**（U-1～U-6 是常量，不是部署配置——做成配置就违背「同一个实现、同一份登记的上限，对同一份输入恒给同一个值」）。

## 状态、并发与失败映射

**无共享可变状态、无提交点。**唯一的模块内状态是参数判定的编译缓存：以 schema 内容指纹为键，**任何时刻清掉都不改变结果**；并发只会重复编译同一份，不会给出不同答案。

**失败映射**：表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个，`malformed` 带 M 编号、`schema_unsupported` 带命中的登记项 U-n 作诊断）；参数判不过 ⇒ `{ invalid: 诊断 }`；判参数时 schema 编不出来 ⇒ `{ unsupported }`。**互不相容，都不抛异常**；ajv 编译抛出的错误在本模块内收成 `schema_unsupported`。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

| 检查 | 形式 | 谁跑 |
|---|---|---|
| V-10 定义记录的类型里没有运行时对象、闭包、代码或装载方式 | 类型：定义只由 JSON 值组成 | 编译期 |
| V-10 名字不被解析（不按前缀、分隔符取来源） | 规则（候选）：禁止对工具名调 `split`／`indexOf(":")` 一类取来源的写法，转写函数所在模块除外 | 本包与消费者包 |
| 推出规则只读定义本身（asset-model SC-6） | 推出规则模块的 import 白名单（候选：只许类型） | 本包 |

都**尚无**。

## 实施缺口与消费者影响

契约的已知缺口（G-1、G-2、G-5、G-9～G-15）不重抄；G-16 由[上文的登记](#schema_unsupported-的上限登记g-16)承接（候选值）。原 tool-model 报回的 TM-2（`format` 断言还是注解）、TM-3（远端正则的执行安全）已由 [D-040 §八 M37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 与契约 S-4 末段、S-26 第 13 行关闭。本节点自己的：

- **TD-1 `ModelToolName` 的副本对齐**：content-blocks 里有一份逐字副本（为避免契约互依）。对齐测试放在本包：取 content-blocks 导出的 Schema 与本包 Schema，比较两处 `$defs/ModelToolName` 逐字相同。owner：本节点（义务，不是阻塞；D-040 §八 M44 接受「副本对齐测试放依赖方」）。
- **TD-2 登记值的确认与解析器的采用**：U-1～U-7 是本节点登记的候选；契约 G-16 说「需要跨实现一致时由主线定一份共同的下限」——本版只有这一份实现，不阻塞。正则解析器（U-7）是新的第三方依赖，**引入须主线登记**（与 `yaml` 同一种实现期事项）。筛不出的病态正则由执行运行时的调用超时兜底——跨节点交接，写进 tool-execution-runtime 的要求。owner：主线（依赖登记）；本节点（落包时以 examples 第 5 节三行与 U-1～U-6 各一对正反例核）。
- **TD-3 端口的组合根**：`toolBodyContract` 与另五个正文包的那一份由消费者组合成 `BodyContracts`（[asset-model AM-5](../asset-model/design.md#实施缺口与消费者影响)）。
