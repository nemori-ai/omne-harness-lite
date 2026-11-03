# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，两个工厂与 `SkillPorts`
- [ports.ts](ports.ts)：`SkillPorts`
- [mapping.ts](mapping.ts)：来源答复到服务失败的唯一一张表
- [inspection.ts](inspection.ts)：`createPackageInspection`
- `access/`：`createSkillAccess` 与三段
  - [access/service.ts](access/service.ts)：四个操作的组合
  - [access/gate.ts](access/gate.ts)：第 1–3 步
  - [access/pin.ts](access/pin.ts)：第 5、7 步
  - [access/bytes.ts](access/bytes.ts)：第 9、10 步
  - [access/range.ts](access/range.ts)：第 11 步的纯函数
  - [access/checkpoint.ts](access/checkpoint.ts)：`signal` 的检查点
