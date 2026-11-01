# acceptance

本目录承载独立验收者维护的场景、操作说明与固定输入。目录存在不表示已有验收能力。

## 允许的内容

可执行场景 `*.acceptance.ts`、操作说明，以及 `fixtures/` 下的固定输入。

## 边界

验收文件归负责的人与验收角色，实施角色只运行、不修改。有可执行场景时，包根必须有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本。只有本目录的入口文件时，不要求配置，测试运行器也不选本包跑验收。

## 维护

写入第一个场景时，由验收的拥有者一并加入配置与脚本，并更新本节与下一节。

## 本包事实

现在为空，没有可执行场景。包根没有 `vitest.acceptance.config.ts`，`package.json` 没有 `acceptance` 脚本。本包已有实现，但验收需要真实的 sqlite-provider（[sqlite-provider 规格](../../../storage/sqlite-provider/SPEC.md)）与应用的会话存储组合，两者现在都没有可运行的组合，所以没有可验收的对象。

第一个场景要用真实的 SQLite 提供者，没有内存替身。候选场景取自 SPEC 的[自有义务的验证](../SPEC.md#自有义务的验证)：两个进程并发提交同一会话时后到者在新尾部上裁定；提交后、回执读回前结束 Worker，重启后按原身份 `queryOperation` 认回。这些场景何时进入，取决于提供者与应用组合的交付。验收文件归验收角色，实施角色不写。
