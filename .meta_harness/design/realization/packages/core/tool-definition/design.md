# tool-definition 实现设计

契约：[`data.tool-definition` v1](../../../../spec/data/tool-definition/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)（`malformed` 带 M 编号，清单项即 M 编号）。
`ajv` 8.20.0 的 Draft 2020-12 入口在这里两用：校验本契约的交换表示；以及**判一次调用的参数**与「作者给的参数 schema 是不是合法、编译得了」（[下文](#参数判定用-ajv-编译作者的-schema)）。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。执行运行时、注册表、MCP 桥、传输适配、资产治理、求值各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**。本包导出的 `tool` 类正文端口实现是一个普通值，由消费者在构造 asset-model 判定对象时交进去（[asset-model 的端口](../asset-model/design.md#正文契约的判定经端口注入不-import-正文包)），不经 Cordis | — |
| effect 装卸 | **无装载效应**（0 行）。参数判定的编译缓存是模块内的纯缓存（同一份 schema 恒得同一个判定函数），不是受管资源 | — |
| 事件派发 | **不发、不听**；没有事件能越过租户或会话边界 | — |
| 存储 | **无** | — |

### 装配给 vs 协议给：单机时本节点提供了什么

| [第七节](../../../../spec/data/tool-definition/v1/contract.md#七装配给与协议给)的行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| `modelInput` 由定义算出；名字相等；投成任何一家不改写 schema、逆转写唯一 | `modelInput`、`modelName`、`definitionNameOf` 三个纯函数；命令表按**码点**升序 | 键名映射由传输适配做；逆转写只由执行运行时在起执行者之前调 |
| 表示层校验在每个接收边界重做 | `judgeToolDefinition`、`judgeToolReturn` | 在哪些边界调 |
| 模型看到的条目与据以校验的定义是同一份；`help` 与 `inspect` 一致；裸字符串只兑现一次 | 无（`toolResultOf` 是纯函数，只调一次的纪律归调用方） | 注册表与执行运行时 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/tool-definition/v1/contract.md#s-1-工具定义是什么)～[S-5](../../../../spec/data/tool-definition/v1/contract.md#s-5-多命令工具)、[S-8](../../../../spec/data/tool-definition/v1/contract.md#s-8-说明与用法)～[S-17](../../../../spec/data/tool-definition/v1/contract.md#s-17-来源) 定义的成员 | 类型 `ToolDefinition`、`ToolCommand` 等 | 定义只由 JSON 值组成（没有函数成员） | V-1 |
| [S-6](../../../../spec/data/tool-definition/v1/contract.md#s-6-模型面只有一个条目)、[S-7](../../../../spec/data/tool-definition/v1/contract.md#s-7-多命令-input-的生成规则)、[S-18](../../../../spec/data/tool-definition/v1/contract.md#s-18-名字的表示与相等) 模型面条目、生成规则、名字 | `modelEntry(d)`、`modelInput(d)`、`modelName(name)`、`definitionNameOf(modelName)`；类型 `ModelToolName`（**家在本包**） | 转写：每个 `:` 换成 `__`；逆转写：每段连续 `_` 长 2m 换回 m 个 `:`、长 1 留下；命令表**按码点升序**——JS 数组默认排序比的是 UTF-16 码元，对增补平面字符与码点序不一致，所以比较函数按码点写 | V-2；逆转写唯一由 S-18 第 2 条保证，测试对三种相邻各给一个反例 |
| S-4、S-5 末条、S-7 第 3、4 条：**判一次调用的参数** | `judgeCallArguments(d, call) → { ok: { command?, args } } \| { invalid: 诊断 }` | 单函数工具按 `input` 判；多命令工具先核 `command` 是命令表里的名字、`args` 是对象（缺席按 `{}`），再按 `commands[c].input` 判；**顶层没写 `additionalProperties` 按 `false` 读**；**`format` 只作注解、不作断言**（ajv 关掉格式校验；[D-040 §八 M37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | V-9。判不过怎样收场归执行运行时 |
| [S-19](../../../../spec/data/tool-definition/v1/contract.md#s-19-由定义得出的依赖声明)、[S-31](../../../../spec/data/tool-definition/v1/contract.md#s-31-属性项的推出规则) 依赖声明、推出规则 | `toolDependencies(d)`；`toolBodyContract`（asset-model 端口的 `tool` 那一份：判正文与名字、推属性、列引用） | 只读定义本身 | asset-model SC-6 |
| [S-20](../../../../spec/data/tool-definition/v1/contract.md#s-20-两种写法与等价规则)～[S-25](../../../../spec/data/tool-definition/v1/contract.md#s-25-toolresult-不是收场) 返回值 | 类型 `ToolReturn`、`ToolResult`；`toolResultOf(returned)`（裸字符串 ⇒ 恰一个文本块、两位标注为真） | 纯函数 | V-5 的等价规则那一半 |
| [S-26](../../../../spec/data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序)～[S-28](../../../../spec/data/tool-definition/v1/contract.md#s-28-判别式与枚举闭合) 拒绝值、M1～M27 与 M37 新增的 `schema_unsupported` | `judgeToolDefinition(value)`、`judgeToolReturn(value)` | Schema 之外那一步：参数 schema 合不合法的 Draft 2020-12（ajv 元模式校验 ⇒ 不合即 `input_not_schema`）、**合法却编译不了、或 `pattern` 超出实现上限 ⇒ `schema_unsupported`**（[下文](#pattern-的实现上限)）、每个参数带说明、只用可呈现子集、命令 `input` 无根相对 `$ref` 与 `$id`、`name` 转写后长度；返回值里的块取 content-blocks 的值、原名 | V-1、V-2。`schema_unsupported` 在次序里的位置由修复波 3 落进 S-26，本节点**照落下的次序**排，不自选 |

### 参数判定用 ajv 编译作者的 schema

| | 手写一个只认可呈现子集的校验器 | **ajv 编译作者的 schema（本节点选）** |
|---|---|---|
| 覆盖 | 17 个关键字，自己写语义（`pattern`、`anyOf`／`oneOf` 的判定） | Draft 2020-12 全集，本就是项目已采用的依赖 |
| 与表示层那一步的一致 | 两套实现：表示层用 ajv 判「合不合法」，判参数用自写的 | 同一个引擎：判合法、判编译得了、判参数读的是同一份语义 |
| 代价 | 自己担正确性 | 每份 schema 编译一次；按 schema 的内容指纹缓存编译结果（纯缓存，同内容同结果） |

**落选方的最强论证**：可呈现子集很小，手写可以精确控制 `pattern` 的执行，不把远端 MCP 对端给的 schema 交给一个通用引擎。
**它输给「一个语义一个实现」**：表示层判合法用 ajv，判参数若另写，两边对 `anyOf`、`additionalProperties` 的读法一旦不同，就会出现「定义合法、参数永远判不过」的定义。
**本方弱点**：`pattern` 仍由 JS 正则执行，靠[下节](#pattern-的实现上限)的上限挡住。置信度：**中高**（D-040 §八 M44 已接受）。

### `pattern` 的实现上限

M37 把「`pattern` 超出实现上限（长度／回溯保护）」定为 `schema_unsupported`，上限由实现定。远端 MCP 对端给的 schema 经 MCP 桥生成定义后在据点进程里判参数，一个会灾难性回溯的正则能卡住整个进程。

| | 换线性时间的正则引擎（RE2 一类） | **长度上限 ＋ 静态筛查（本节点候选）**：`pattern` 码点数超过上限（候选 1024）或含嵌套量词（如 `(a+)+`）、反向引用 ⇒ `schema_unsupported` |
|---|---|---|
| 挡得住回溯 | 从根上挡住 | 挡住已知形态；不保证挡住全部 |
| 依赖 | 原生依赖，**假设，须按 source-check 取证**（basis 无此条目） | 无 |
| 误伤 | 少（但 RE2 不支持的语法照样要报 `schema_unsupported`） | 会拒掉一些其实安全的写法 |

**落选方（RE2）的最强论证**：它是唯一有保证的回溯保护。**它输在**要引一个原生依赖，而本版的工具作者与 MCP 对端给的 `pattern` 实际多是简单形态。**本方弱点**：静态筛查是启发式；筛不出的病态正则仍能卡住进程，据点上要有调用级的超时兜底（归执行运行时）。上限取值与筛查清单是**实现期事项**，落包时定、写进包内测试。置信度：**中**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks` v1（块、`ModelToolName` 的副本在那边） | [content-blocks](../content-blocks/README.md) | 随包版本 | 静态 import |
| `data.asset-model` v1（名字词法、属性声明、设置项类别、端口类型） | [asset-model](../asset-model/README.md) | 同上 | 同上 |
| 被消费 | loop-extension、skill-package、mcp-endpoint、asset-evaluation、执行运行时、注册表、MCP 桥、传输适配、资产治理 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**（`pattern` 上限是常量，不是部署配置）。

## 状态、并发与失败映射

**无共享可变状态、无提交点。**唯一的模块内状态是参数判定的编译缓存：以 schema 内容指纹为键，**任何时刻清掉都不改变结果**；并发只会重复编译同一份，不会给出不同答案。

**失败映射**：表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个，带 M 编号作诊断）；参数判不过 ⇒ `{ invalid: 诊断 }`。**互不相容，都不抛异常**。

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

契约的已知缺口（G-1、G-2、G-5、G-9～G-15）不重抄。本节点自己的：

- **TD-1 `ModelToolName` 的副本对齐**：content-blocks 里有一份逐字副本（为避免契约互依）。对齐测试放在本包：取 content-blocks 导出的 Schema 与本包 Schema，比较两处 `$defs/ModelToolName` 逐字相同。owner：本节点（义务，不是阻塞；D-040 §八 M44 接受「副本对齐测试放依赖方」）。
- **TD-2 `pattern` 上限与筛查清单**：实现期事项（[上节](#pattern-的实现上限)），落包时定；筛不出的病态正则由执行运行时的调用超时兜底——跨节点交接，写进 tool-execution-runtime 的要求。
- **TD-3 端口的组合根**：`toolBodyContract` 与另五个正文包的那一份由消费者组合成 `BodyContracts`（[asset-model AM-5](../asset-model/design.md#实施缺口与消费者影响)）。
