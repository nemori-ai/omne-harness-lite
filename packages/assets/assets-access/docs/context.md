# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。它覆盖独立消费与适用的 Harness 接入，引用系统架构与真实消费者，不成为新的架构源。

## 使用方式

```ts
import { createAssetsContribution } from '@omne-harness/assets-access'

const contribution = createAssetsContribution({ settings: () => face, principals })
const answer = await contribution.operations['describe-setting'](call, body)
```

在 Harness 里由应用的一行用 `./cordis` 的 `createAssetsAccessPlugin` 装配。

## 消费者与定位

本包在[系统最简模型](../../../../AGENTS.md#系统的最简模型)第二张图里是「某领域的接入插件」那一格：入口把 `assets/v1` 的调用交给它，它调领域的公开入口。具名消费者是 `apps/harness-server` 的 `assets-access` 行，它把身份的 `createAccessIdentity` 适配成主体端口，把 `governance` 行提供的 `tenantSettings` 交作设置端口。
