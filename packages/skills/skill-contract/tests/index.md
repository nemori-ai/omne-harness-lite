# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)、[types.spec-d.ts](types.spec-d.ts)、[provider-types.spec-d.ts](provider-types.spec-d.ts)：入口、导出集合与类型承诺
- [closed-sets.spec.ts](closed-sets.spec.ts)：SPEC 的封闭集合与类型相等
- [values.spec.ts](values.spec.ts)：值与纯函数的边界
- [parse-package.spec.ts](parse-package.spec.ts)：包样本、合法包、拒绝次序与控制字节
- [parse-manifest.spec.ts](parse-manifest.spec.ts)：`SKILL.md` 的 `name-mismatch` 与格式错误
- [parse-declaration.spec.ts](parse-declaration.spec.ts)：`.omne/skill.json` 的各个拒绝原因
- [snapshot.spec.ts](snapshot.spec.ts)：快照构造
- [conformance.spec.ts](conformance.spec.ts)：端口套件、内存替身与进程内的变红证明
- [catalog-suite.spec.ts](catalog-suite.spec.ts)：`skillCatalogConformance()` 的形状与条款覆盖
- [contract.spec.ts](contract.spec.ts)、[contract-extension.spec.ts](contract-extension.spec.ts)：`skill` 类别端口
- [declaration-schema.spec.ts](declaration-schema.spec.ts)：Schema 与解析一致
- [package-builder.ts](package-builder.ts)、[parse-support.ts](parse-support.ts)、[conformance-world.ts](conformance-world.ts)：测试辅助
- [fixtures/](fixtures/index.md)：测试固定输入
