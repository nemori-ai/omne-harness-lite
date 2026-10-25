# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。本包是 `module` 变体的纯类型根，没有 Cordis 入口，所以只有独立消费一种使用方式，没有 Harness 接入。

## 使用方式

多数代码从已经使用的契约成员导入这些类型，例如从 `@omne-harness/model-contract` 导入 `ConsumerRef`。成员需要直接使用共同形状时，用包名导入本包。

```ts
import type { Adoption } from '@omne-harness/exchange-refs'

const profile: Adoption = { owner: 'model', name: 'chat', revision: '3', digest: 'd' }
```

类型不核验取值。接收域用自己的判定核验，例如 Model 拒绝不是 64 位小写十六进制的 `digest`。安装闭包：`dependencies` 为空，没有初始化，没有释放，不读环境变量，不启动进程。

## 消费者与定位

再导出本包类型的契约成员由 [SPEC.md 组合与验证节](../SPEC.md#composition)唯一维护。

```text
agent-contract  model-contract  tool-contract  request-context-contract  authorization
        \             |               |                  |                   /
                  按原名再导出 Adoption、DurableEvidence、ConsumerRef
                                       |
                        @omne-harness/exchange-refs（无依赖）
```

本包属于 `common` 组，该组的位置与成员见[组说明](../../README.md)。包与组的依赖方向见[包组织](../../../../docs/package-organization.md#包边界与公开入口)。本包不拥有任何领域事实，也不决定任何值的含义。
