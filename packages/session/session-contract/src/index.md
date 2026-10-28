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

- [decision-support.ts](decision-support.ts)：判定共用的证据、采用与终态批次
- [decide-management.ts](decide-management.ts)：控制、关系、空闲、冻结与作用域代次
- [decide-results.ts](decide-results.ts)：原调用绑定、保管与处理
- [decide-receive.ts](decide-receive.ts)：外部事实与恢复任务对账
- [projection.ts](projection.ts)：同日志的纯 Session 解释接缝
- [reduce-extended.ts](reduce-extended.ts)：管理与调用登记归约
- [model-view.ts](model-view.ts)：提交时维护的模型视图与压缩核对窗口
- [testing-providers.ts](testing-providers.ts)：空闲、通知、推进与作用域释放替身
- [testing-provider-conformance.ts](testing-provider-conformance.ts)：有效提供者端口一致性套件

- [reduce-results.ts](reduce-results.ts)：结果保管、完成与释放的归约保护
- [result-state.ts](result-state.ts)：原 Run 关系与参加提交引用
