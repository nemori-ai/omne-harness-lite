# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：两个公开入口的导出、构建产物的依赖闭包，以及生产安装闭包里没有 Cordis
- [definitions.spec.ts](definitions.spec.ts)：三种定义的合法与非法输入
- [fields.spec.ts](fields.spec.ts)：`validateFields`，含可选字段
- [binding.spec.ts](binding.spec.ts)：`validateBinding`
- [carrier.spec.ts](carrier.spec.ts)：carrier 编解码
- [capturing.spec.ts](capturing.spec.ts)：捕获替身
- [types.spec-d.ts](types.spec-d.ts)：类型层的拒绝，含可选字段的省略
- [scopes.ts](scopes.ts)：用 legal-identity 铸造测试用的 scope
- [fixtures/](fixtures/index.md)：测试固定输入
