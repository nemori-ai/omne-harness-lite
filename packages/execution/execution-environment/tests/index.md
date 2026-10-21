# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、替身、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合，不导入 Cordis
- [registry.spec.ts](registry.spec.ts)：匹配与歧义、幂等与同键异落点、跨租户、设施声明、守卫、作用域释放与关闭
- [acquisition.spec.ts](acquisition.spec.ts)：获取的失败、核验、补偿释放、重核与租户级沙箱
- [lease-gate.spec.ts](lease-gate.spec.ts)：逐操作门（含账本关闭）、失效与释放
- [lifecycle.spec.ts](lifecycle.spec.ts)：登记、退役、关闭、描述与恢复
- [scope.spec.ts](scope.spec.ts)：请求方作用域：作用域释放、描述与恢复按它过滤，带作用域的绑定层与它核对
- [doubles.ts](doubles.ts)：测试共用的替身：租户、作用域、账本、守卫与可编排的提供者
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
