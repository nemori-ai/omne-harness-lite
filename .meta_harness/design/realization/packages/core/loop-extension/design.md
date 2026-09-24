# loop-extension 实现设计

契约：[`data.loop-extension` v1](../../../../spec/data/loop-extension/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。拓展件派发器、兼容层、模型请求运行时、模态投影、资产治理、求值各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；`loopExtensionBodyContract`（asset-model 端口的那一份）是普通值 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。「位置」是 agent loop 的一个时点、结论是一个值，都不是 Cordis 事件；派发器怎样逐件调用归派发器。没有事件能越过租户或会话边界：统一输入**不暴露会话标识**；`environment` 句柄（[S-41](../../../../spec/data/loop-extension/v1/contract.md#s-41-执行环境句柄)，[D-040 §八 M38](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）按会话作用域、不透明、每次调用一只新的，解析归 runner | S-41 |
| 存储 | **无**：结论落日志归派发器 | S-30～S-32 |

### 装配给 vs 协议给

[第十节](../../../../spec/data/loop-extension/v1/contract.md#十装配给与协议给)七行里，本节点只在「表示层校验」与「name 相等」两行出力（`judgeConclusion` 与名字的逐码点比较，纯值判定、不随部署变）；
其余五行（结论先落后算、瀑布次序与 `earlier` 可见、不可用与报错两分、只读句柄、`ask` 的卡片先于等待落盘）归派发器与日志。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/loop-extension/v1/contract.md#s-1-十一个位置)～[S-10](../../../../spec/data/loop-extension/v1/contract.md#s-10-本版没有-order) 位置、维度、干预力、报错处置、声明、身份 | 类型 `Position`、`Dimension`、`Power`、`LoopExtensionDefinition` | — | V-1 |
| [S-11](../../../../spec/data/loop-extension/v1/contract.md#s-11-输入的成员)～[S-18](../../../../spec/data/loop-extension/v1/contract.md#s-18-terminalfact) 统一输入、三个引用、瀑布、按位置的 Subject、`FailureCause` 等 | 类型 `ExtensionInput` 等；[S-41](../../../../spec/data/loop-extension/v1/contract.md#s-41-执行环境句柄) 的 `EnvironmentHandle` 是不透明串类型（照 `data.identity-values/v1#S-31`：非空、首尾不是空白、逐码点相等），本包**不导出任何解析它的函数**——它经什么取得租户身份与执行环境归 runner（契约 S-41 指到 `capability.loop-extension-runner/v1` S-50） | 输入缺 `environment` ⇒ `malformed`，**不补** | V-1（`$defs` 由 41 项变 42 项，含 `EnvironmentHandle`） |
| [S-19](../../../../spec/data/loop-extension/v1/contract.md#s-19-结论封闭八种)～[S-29](../../../../spec/data/loop-extension/v1/contract.md#s-29-没有放宽) 八种结论、档与位置的合法组合 | 类型 `Conclusion`；常量表 `POWER_CONCLUSIONS`（S-20）、`POSITION_CONCLUSIONS`（S-21） | 两张表写成数据，Schema 之外的判定由同一张表驱动 | V-2（13 位置 × 8 结论 × 3 档机检） |
| [S-36](../../../../spec/data/loop-extension/v1/contract.md#s-36-规范表示与定义项)～[S-39](../../../../spec/data/loop-extension/v1/contract.md#s-39-判别式与枚举闭合) 十个拒绝值与次序 | `judgeConclusion(value, ctx)` | 第 9、10 行（改了不可改的成员、冒名的 `inject`）要对照输入与本件 name，经 `ctx` 交进来 | V-2；「不合法的结论按报错处置」（S-34）归派发器 |
| [S-40](../../../../spec/data/loop-extension/v1/contract.md#s-40-属性项的推出规则) 推出规则 | `loopExtensionBodyContract`：推属性（`position`、`dimension`、`power`）；规则一恒为空集 | 只读声明本身 | asset-model SC-6 |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks`、`data.messages`、`data.call-accounts` v1 | [content-blocks](../content-blocks/README.md)、[messages](../messages/README.md)、[call-accounts](../call-accounts/README.md) | 随包版本 | 静态 import |
| `data.model-profile` v1（`select_model`） | [model-profile](../model-profile/README.md) | 同上 | 同上 |
| `data.tool-definition` v1、`data.asset-model` v1 | [tool-definition](../tool-definition/README.md)、[asset-model](../asset-model/README.md) | 同上 | 同上 |
| `data.identity-values`、`data.offer-expiry` v1 | 已实现的 core 包 | 同上 | 同上 |
| 被消费 | arrival-events、model-response、asset-evaluation、派发器、兼容层、模型请求运行时、模态投影 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（十个之一）；**不抛异常**；拒绝不是判定（S-38）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

契约没有列 SC 项；V-5「每件必留」要 runner 的静态检查，归派发器。本节点承载的只有推出规则的 import 白名单（asset-model SC-6，候选），**尚无**。

## 实施缺口与消费者影响

契约的已知缺口（第十四节）不重抄。本节点没有自己的缺口。
