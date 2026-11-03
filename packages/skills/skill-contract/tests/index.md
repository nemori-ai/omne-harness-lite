# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)、[types.spec-d.ts](types.spec-d.ts)：入口、导出集合与类型承诺
- [values.spec.ts](values.spec.ts)：值与纯函数的边界
- [parse-package.spec.ts](parse-package.spec.ts)：检查 Skill 包与拒绝次序
- [snapshot.spec.ts](snapshot.spec.ts)：快照构造
- [conformance.spec.ts](conformance.spec.ts)、[conformance-red.spec.ts](conformance-red.spec.ts)：端口套件与变红证明
- [contract.spec.ts](contract.spec.ts)、[contract-extension.spec.ts](contract-extension.spec.ts)：`skill` 类别端口
- [declaration-schema.spec.ts](declaration-schema.spec.ts)：Schema 与解析一致
- [package-builder.ts](package-builder.ts)、[conformance-world.ts](conformance-world.ts)：测试辅助
- [fixtures/](fixtures/index.md)：测试固定输入
