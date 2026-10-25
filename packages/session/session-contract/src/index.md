# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，只做再导出
- [identity.ts](identity.ts)：品牌身份、`SessionAccess`、`Mutation`、交换值的重导出
- [values.ts](values.ts)：快照与固定输入的值类型
- [faces.ts](faces.ts)：失败、回执、四个面、历史页
- [operations.ts](operations.ts)：操作身份的派生与规范文本摘要
- [ports.ts](ports.ts)：构造依赖端口、出站端口、命令与守卫材料、块声明类型
- [block.ts](block.ts)：`sessionModesBlock`
- [judgments.ts](judgments.ts)：结局类型与九个领域服务
- [entries.ts](entries.ts)：条目种类与编码（唯一的一份）
- [decide.ts](decide.ts)：命令到条目批次
- [reduce.ts](reduce.ts)：批次到快照
- [testing.ts](testing.ts)：`./testing` 入口
- [testing-case.ts](testing-case.ts)：套件的用例形状与断言助手
- [testing-values.ts](testing-values.ts)：合法测试值
- [testing-transactions.ts](testing-transactions.ts)：事务端口的替身与一致性套件
- [testing-ports.ts](testing-ports.ts)：身份桥、证据桥、Context 输入与时钟的替身
