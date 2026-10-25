# @omne-harness/exchange-refs 行为规格

本文件拥有 `@omne-harness/exchange-refs` 在公开类型以外的必要行为。公开形状归 [src/index.ts](src/index.ts)，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本成员只发布类型，没有运行时代码、状态或资源。下面的条款规定三个类型的含义，以及哪些规则不属于本成员。

## 范围与依据

本成员收归三个跨域交接的基础值：`Adoption`、`DurableEvidence` 和 `ConsumerRef`。依据是 [#734](https://github.com/nemori-ai/omne-harness-lite/issues/734) revision 1 的[派发裁定](https://github.com/nemori-ai/omne-harness-lite/issues/734#issuecomment-6394333906)。裁定由 PanQiWei 在领域内架构授权内作出。逐字段核对的结论是：三个值在 agent-contract、model-contract、tool-contract、request-context-contract 与 authorization 中含义相同，并且已经跨域传递。所以它们满足 [common 组的准入条件](../README.md#责任与范围)与[领域语义依赖与模型边界](../../../docs/architecture/layers-and-dependencies.md#领域语义依赖与模型边界)。

根入口是唯一的公开入口。`dependencies` 为空。根入口不导出谓词、构造函数或其他运行时值。

## 结果与不变量

### 形状

<a id="shape"></a>

三个类型都是只读记录，每个类型恰有四个必需的 `string` 成员。本成员不规定任何成员的取值格式，也不规定空串是否合法。

### Adoption

<a id="adoption"></a>

`Adoption` 是一个可以恢复的精确采用。`owner` 是被采用物的发布者，`name` 是被采用物的名字，`revision` 是精确版本，不是「最新」。`digest` 是所指精确内容的摘要，只校验内容一致，不证明资格。摘要的编码与算法归铸造方和接收域的判定。例如 Model 只接受 64 位小写十六进制，Tool 铸造 `sha256:` 加十六进制。本成员不写任何一种摘要格式。

### DurableEvidence

<a id="durable-evidence"></a>

`DurableEvidence` 是一个 owner 的一份耐久记录的定位。`owner` 是记录的拥有者，也就是由谁的受信适配器解释并核验这份记录。`record` 是 owner 内的记录定位，`revision` 是这份记录的修订。`digest` 只校验内容一致，算法归 owner。例如 authorization 作为 owner 规定自己证据的摘要是规范 JSON 的 SHA-256。

### ConsumerRef

<a id="consumer-ref"></a>

`ConsumerRef` 是消费者拥有者登记的稳定位置。`owner` 是登记并解释它的消费者拥有者，`work` 是消费者一侧的原工作，`position` 是原工作内的稳定位置。`purpose` 是用途，它是自由文本，没有封闭的取值集合。生产方原样保存 `ConsumerRef`，不解释它。`ConsumerRef` 不是执行许可。

## 所有权、失败与生命周期

<a id="ownership"></a>

本成员拥有三个类型的共同形状。共同形状的演进拥有者是 PanQiWei。形状变化要与最严格的判定方 Model 及 Tool 共同确认。每个具体值的含义由它自己的 owner 解释：`Adoption` 由被采用物的发布者解释，`DurableEvidence` 由 `owner` 解释，`ConsumerRef` 由消费者拥有者解释。

下列规则留在原域，不进本成员：

- 结构判定。agent-contract 的 `judgeAdoption` 与 `judgeEvidence`，tool-contract 的 `value-shapes`、`judgeConsumerRef` 与 `judgeHandoff`，request-context-contract 的 `schema-primitives`，model-contract 的封闭字段校验与 64 位小写十六进制规则。
- 摘要的铸造与算法。tool-contract 的 `describedAdoption`，authorization 的 `DecisionEvidence`、`digestOf` 与 `canonicalText`。
- 跨值不变式。ACK 证据的 `DurableEvidence.owner` 等于调用的 `ConsumerRef.owner`。同一调用身份不能换消费位置。

本成员没有失败结果。值不合格时由接收域的判定拒绝，失败词汇归那个域。本成员没有状态、资源、生命周期或外部副作用。

不收归的相近值：authorization 的 `ConsumerPosition` 没有 `purpose`，它标识许可消费的线性化点。identity 的 `WorkRef` 只到工作粒度，它是主体出处的一部分。两者与 `ConsumerRef` 的粒度和用途不同，留在原域。三个值都不含 `TenantId`。需要租户的场合，租户放在相邻字段上。

## 组合与验证

<a id="composition"></a>

### 消费者

下表是当前直接再导出本成员类型的契约成员。各成员从自己的包入口以原名再导出，下游继续从那些入口导入。

| 成员 | 再导出 | 定义位置 |
| --- | --- | --- |
| [agent/agent-contract](../../agent/agent-contract/package.json) | `Adoption`、`DurableEvidence`、`ConsumerRef` | [identity.ts](../../agent/agent-contract/src/identity.ts) |
| [model/model-contract](../../model/model-contract/package.json) | `Adoption`、`ConsumerRef`、`DurableEvidence` | [root.ts](../../model/model-contract/src/root.ts)、[result.ts](../../model/model-contract/src/result.ts) |
| [tool/tool-contract](../../tool/tool-contract/package.json) | `Adoption`、`ConsumerRef`、`DurableEvidence` | [identity.ts](../../tool/tool-contract/src/identity.ts) |
| [context/request-context-contract](../../context/request-context-contract/package.json) | `Adoption`、`DurableEvidence` | [refs.ts](../../context/request-context-contract/src/refs.ts) |
| [identity/authorization](../../identity/authorization/package.json) | `DurableEvidence` | [evidence.ts](../../identity/authorization/src/evidence.ts) |

可用 `rg -n '@omne-harness/exchange-refs' packages --glob package.json --glob '**/src/**'` 复核。

### 验证

C1。三个类型各有四个必需的只读 `string` 成员，由 [tests/shapes.spec-d.ts](tests/shapes.spec-d.ts) 检查。

C2。根入口没有运行时导出，`dependencies` 为空，只有 `.` 入口，由 [tests/public-entry.spec.ts](tests/public-entry.spec.ts) 检查。

各域判定与跨值不变式的测试留在原域成员中。本成员的测试不证明任何一个值来自可信的 owner。
