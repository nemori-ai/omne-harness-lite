# acceptance

本目录承载独立验收者维护的场景、操作说明与固定输入。目录存在不表示已有验收能力。

## 允许的内容

可执行场景 `*.acceptance.ts`、操作说明，以及 `fixtures/` 下的固定输入。

## 边界

验收文件归负责的人与验收角色，实施角色只运行、不修改。有可执行场景时，包根必须有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本。只有本目录的入口文件时，不要求配置，测试运行器也不选本包跑验收。

## 维护

写入第一个场景时，由验收的拥有者一并加入配置与脚本，并更新本节与下一节。

## 本包事实

现在为空，没有可执行场景。包根没有 `vitest.acceptance.config.ts`，`package.json` 没有 `acceptance` 脚本。本成员只有服务定义，单独验收它没有可观察的行为。Runtime Context 的 Cordis 集成要在提供者 [runtime-context-cordis](../../runtime-context-cordis/acceptance/README.md) 装载后验收，依据是两个成员 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
