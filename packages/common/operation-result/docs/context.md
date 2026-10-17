# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。本包是 `module` 变体的纯根，没有 Cordis 入口，所以只有独立消费一种使用方式，没有 Harness 接入。

## 使用方式

调用方只安装本包，用包名导入根入口。

```ts
import { ack, fail, isSuccess, succeed } from '@omne-harness/operation-result'

const valued = succeed({ id: 'job-1' })
const empty = ack()
const broken = fail('rejected' as const)

isSuccess(valued) // true，valued.ok 是 { id: 'job-1' }
isSuccess(empty) // true，empty.ok 是 true
isSuccess(broken) // false
```

安装闭包：`dependencies` 为空，所以安装本包不带来 Cordis 或其他运行时包。只有契约类型需求的包，例如工具契约，引用 `Outcome` 与 `Ack` 时也不装 Cordis。没有初始化，没有释放，不读环境变量，不启动进程。

## 消费者与定位

具名消费者是 `tool-contract`、`tool`、`tool-cordis-contract` 和 `model-contract`。它们在 #342 分支上，尚未进入本轨道。本轨道上没有业务成员的生产调用点，公开入口目前只由本成员的测试消费。这四个成员合入时按公开入口导入，不复制结果类型。依据见 [SPEC.md](../SPEC.md#消费者)。

```text
tool-contract  tool  tool-cordis-contract  model-contract   (在 #342 分支，未入本轨道)
        \           \            /            /
         +-----------+----------+------------+
                       |  import
         @omne-harness/operation-result       (packages/common/operation-result)
                       |
                    无依赖
```

本包属于 `common` 组，该组的位置与成员见[组说明](../../README.md)。包与组的依赖方向见[包组织](../../../../docs/package-organization.md#包边界与公开入口)。本包不拥有任何领域事实，也不决定调用方的失败含义。
