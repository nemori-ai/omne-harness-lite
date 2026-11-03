# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [access-world.ts](access-world.ts)：三端口替身的世界、控制项与套件夹具
- [public-entry.spec.ts](public-entry.spec.ts)、[types.spec-d.ts](types.spec-d.ts)：导出集合与每段的失败类型
- [mapping.spec.ts](mapping.spec.ts)：映射表逐行
- [inspection.spec.ts](inspection.spec.ts)：`inspect` 的合法包与每种来源失败
- [gate.spec.ts](gate.spec.ts)：第 1–3 步每个分支
- [describe.spec.ts](describe.spec.ts)：`describe` 两态、无披露三路径、不读字节
- [pin.spec.ts](pin.spec.ts)：第 5、7 步每个分支与中止
- [bytes.spec.ts](bytes.spec.ts)：第 9、10 步每个分支与中止
- [range.spec.ts](range.spec.ts)：字节范围六条规则与正文起点
- [read.spec.ts](read.spec.ts)：`read` 与 `list` 的组合、路径校验、不缓存
- [export.spec.ts](export.spec.ts)：`export` 整包或失败
- [conformance.spec.ts](conformance.spec.ts)：`skillAccessConformance()` 与进程内的变红证明
- [fixtures/](fixtures/index.md)：测试固定输入（本包没有文件夹具）
