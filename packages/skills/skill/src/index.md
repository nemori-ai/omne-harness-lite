# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，三个工厂与 `SkillPorts`
- [ports.ts](ports.ts)：`SkillPorts`
- [port-answer.ts](port-answer.ts)：`answered` 在同一个 `try` 里调用端口并解析答复；读取判定与对应端口的三个解析函数
- [answer-values.ts](answer-values.ts)：端口答复里的载荷字段的解析，交出重新构造的值
- [source-answer.ts](source-answer.ts)：来源答复的解析，`ok` 与 `failure` 都核对，不合当作 `unavailable`
- [mapping.ts](mapping.ts)：来源答复到服务失败的唯一一张表，表的键就是来源失败的集合
- [inspection.ts](inspection.ts)：`createPackageInspection`
- [catalog.ts](catalog.ts)：`createSkillCatalog`
- [match.ts](match.ts)：`search` 的纯匹配函数 `matches`
- `access/`：`createSkillAccess` 与三段
  - [access/service.ts](access/service.ts)：四个操作的组合
  - [access/gate.ts](access/gate.ts)：第 1–3 步
  - [access/pin.ts](access/pin.ts)：第 5、7 步
  - [access/bytes.ts](access/bytes.ts)：第 9、10 步
  - [access/range.ts](access/range.ts)：第 11 步的纯函数
  - [access/checkpoint.ts](access/checkpoint.ts)：`signal` 的检查点
