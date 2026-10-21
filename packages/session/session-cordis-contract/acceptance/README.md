# acceptance

本目录承载独立验收者维护的场景、操作说明与固定输入。目录存在不表示已有验收能力。

## 允许的内容

可执行场景 `*.acceptance.ts`、操作说明，以及 `fixtures/` 下的固定输入。

## 边界

验收文件归负责的人与验收角色，实施角色只运行、不修改。有可执行场景时，包根必须有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本。只有本目录的入口文件时，不要求配置，测试运行器也不选本包跑验收。

## 维护

写入第一个场景时，由验收的拥有者一并加入配置与脚本，并更新本节与下一节。

## 本包事实

现在为空，没有可执行场景。包根没有 `vitest.acceptance.config.ts`，`package.json` 没有 `acceptance` 脚本。本成员只有服务定义，没有运行实现：两个入口现在都没有导出。独立验收要等服务定义进入 `./cordis` 后才有对象。

验收依据是 SPEC 的[实现与验证](../SPEC.md#实现与验证)和 Cordis 说明的[验证义务](../docs/cordis.md#验证义务)。其中调用方类、端口缺席与事件载荷的义务要有提供者才能观察，由继承这些定义的 [session-cordis](../../session-cordis/README.md) 承担。
