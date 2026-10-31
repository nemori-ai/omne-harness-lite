# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有运行值，不导入 Cordis
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 的导出、键与真实 Context 装载
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空

- [access-check.spec.ts](access-check.spec.ts)：真实 Context 中访问检查定义的装卸与调用委派，不覆盖生产必需注入。
