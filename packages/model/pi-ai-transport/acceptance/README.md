# acceptance

本目录承载独立验收者维护的场景、操作说明与固定输入。本成员目前没有验收能力。

## 允许的内容

可执行场景 `*.acceptance.ts`、操作说明，以及 `fixtures/` 下的固定输入。

## 边界

验收文件归负责的人与验收角色，实施角色只运行、不修改。有可执行场景时，包根必须有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本；只有本目录的入口文件时，不要求配置，测试运行器也不选本包跑验收。

## 维护

写入第一个场景时，由验收的拥有者一并加入配置与脚本，并把本文件改为适用。

## 本包事实

不适用。本成员目前没有独立验收者维护的场景，所以没有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本。验收归负责的人与验收角色，需要时由他们加入场景。
