# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [contribution.spec-d.ts](contribution.spec-d.ts)：贡献类型的编译期断言
- [mount.spec.ts](mount.spec.ts)：真实 Cordis 上 `mount` 的效应绑定：收回函数归调用者，卸载等它的 Promise，装配错误传给调用者
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的运行时导出与 `AccessAssemblyError`
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 入口的运行时导出
- [fixtures/](fixtures/index.md)：测试固定输入（本包没有）
