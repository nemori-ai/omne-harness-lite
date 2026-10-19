# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。本包是 `module` 变体的纯根，没有 Cordis 入口，所以只有独立消费一种使用方式，没有 Harness 接入。

## 使用方式

调用方只安装本包，用包名导入根入口。

```ts
import { isCanonicalMediaType, judgeMediaType, judgeModalities, missingModalities } from '@omne-harness/modality'

judgeMediaType('video/mp4;codecs=avc1') // { ok: { mediaType: 'video/mp4', modality: 'video' } }
judgeMediaType('font/woff2') // { ok: { mediaType: 'font/woff2', modality: null } }
isCanonicalMediaType('Image/PNG') // false
judgeModalities(['text', 'audio']) // { rejected: 'modality', index: 1 }
missingModalities(['text', 'video'], ['text']) // ['video']
```

安装闭包：`dependencies` 为空，所以安装本包不带来其他运行时包。没有初始化，没有释放，不读环境变量，不启动进程。

## 消费者与定位

具名消费者是 Model 与 Tool。当前轨道没有业务成员的生产调用点，公开入口目前只由本成员的测试消费。依据与各消费者的采用方式见 [SPEC.md](../SPEC.md#消费者)。

```text
model-contract    tool-contract    (以后：内容块、会话、代理、基础设施)
        \               |               /
         +--------------+--------------+
                        |  import
              @omne-harness/modality        (packages/common/modality)
                        |
                     无依赖
```

本包属于 `common` 组，该组的位置与成员见[组说明](../../README.md)。包与组的依赖方向见[包组织](../../../../docs/package-organization.md#包边界与公开入口)。本包不拥有任何领域事实，不决定消费者支持哪些模态，也不决定消费者怎样处置被拒绝的输入。
