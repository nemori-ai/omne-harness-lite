# arrival-events 实现设计

契约：[`data.arrival-events` v1](../../../../spec/data/arrival-events/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)；`account` 事件里的金额经 content-blocks 的[严格无损读写](../content-blocks/design.md#严格的无损-json-读写)。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**；生产者与 stream-assembly 直接 `import` | S-4 |
| 服务键 | 无 | — |
| `inject` 关系 | **无** | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听 Cordis 事件**。到达事件是**值**，不是 Cordis 事件；它们在宿主里按（会话，目标）交给装配状态（`capability.stream-assembly/v1#S-28` 第 1 条）。**没有一条能越过租户或会话边界**的前提是那条路由，归宿主 | [S-25](../../../../spec/data/arrival-events/v1/contract.md#s-25-装配给与协议给) 第二行 |
| 存储 | **无**：到达事件不落日志（S-4；SC-2） | — |

### 装配给 vs 协议给：单机时本节点提供了什么

[S-25](../../../../spec/data/arrival-events/v1/contract.md#s-25-装配给与协议给) 六行里，本节点只在「表示层校验在每个接收边界重做」一行出力：`judgeArrivalEnvelope` 这一个纯入口。
其余五行（按次序不重不漏、目标只在所属会话里有意义、`dispatch` 分开两次发出、首个内容的时刻、封口块等于归约）归生产者与宿主。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/data/arrival-events/v1/contract.md#s-5-信封与目标)～[S-16](../../../../spec/data/arrival-events/v1/contract.md#s-16-收尾) 信封、目标、六种事件、块索引、开块、块头、呈现提示、填、封口、砍、记账、收尾 | 类型 `ArrivalEnvelope`、`ArrivalTarget`、`ArrivalEvent` 等 | 值一律冻结 | V-1 |
| [S-19](../../../../spec/data/arrival-events/v1/contract.md#s-19-归约一块此刻是什么) 归约 | `reduceFills(mode, fills)`：追加相接、替换取最后一次；**语音按字节相接**（先把各段标准 base64 解成字节再接），不按 base64 串相接 | 纯函数 | 生产者义务「封口块等于归约」（S-20）的性质测试 V-5 用它作参照；stream-assembly 物化快照也用它——**一个归约只有一份** |
| [S-26](../../../../spec/data/arrival-events/v1/contract.md#s-26-规范表示)～[S-29](../../../../spec/data/arrival-events/v1/contract.md#s-29-表示层拒绝不是判定也不修补) 九个拒绝值与次序、不修补 | `judgeArrivalEnvelope(envelope, openBlock?: (index) => OpenedBlock \| undefined)` | 嵌着的块取 content-blocks 的值、嵌着的账取 call-accounts 的值，原名；**要借开块的两项**（`replace_payload_shape`、帧流上往语音块填字节）只在 `openBlock` 给出那一块时才判，否则不参与 | V-2、V-3；`openBlock` 这个参数是与 [stream-assembly](../stream-assembly/design.md#表示层判定借-arrival-events不在本模块重写) 对齐的形状 |
| [S-17](../../../../spec/data/arrival-events/v1/contract.md#s-17-一条流的形状)～[S-24](../../../../spec/data/arrival-events/v1/contract.md#s-24-违反语法由消费一方判定并命名) 序列语法 | — | **不在本节点**：由消费一方判定并命名，归 stream-assembly | — |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.content-blocks` v1 | [content-blocks](../content-blocks/README.md) | 随包版本 | 静态 import |
| `data.call-accounts` v1 | [call-accounts](../call-accounts/README.md) | 同上 | 同上 |
| `data.loop-extension` v1（收尾里的 `FailureCause`） | [loop-extension](../loop-extension/README.md) | 同上 | 同上 |
| `data.identity-values` v1 | 已实现的 core 包 | 同上 | 同上 |
| 被消费 | stream-assembly、模型侧传输适配、工具侧发帧入口、两个运行时 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；**不抛异常**；被拒不是判定、也不是一次收场（S-29）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/data/arrival-events/verification.md#静态检查义务) 约束的是传输适配、发帧原语与节流的实现，落在那些节点；本节点不承载任何一条。

## 实施缺口与消费者影响

契约的已知缺口（第九节）不重抄。生产者一侧的义务（S-20、S-22）由模型请求运行时（传输适配）与工具执行运行时（发帧入口）落。本节点自己的：

- **AEV-1 标准 base64 的严格判定**：`payload_kind_mismatch` 要求「语音的片段不是标准 base64」即拒，`reduceFills` 也要先把各段解成字节；Node 的 `Buffer.from(s, "base64")` 对非法字符宽容、不报错。候选：先用正则核标准字母表与填充，再解码。Node 24 是否已带严格的 `Uint8Array.fromBase64`——**假设，须按 source-check 取证**（basis 无此条目；它是 Node 事实，不是 Cordis 语义）。owner：本节点落包时；[stream-assembly SA-2](../stream-assembly/design.md#实施缺口与消费者影响) 随之。
