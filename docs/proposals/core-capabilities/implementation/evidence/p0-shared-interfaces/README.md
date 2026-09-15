# P0 共享接口的设计验证

主调度在 HUB `33f39cb` 整合 `8f4cfa9` 后，以全新本地依赖目录重跑作者探针。
[实际记录](hub-summary.json)固定接口、脚本、包锁及结果哈希；全部命令退出 0。
独立只读评审已闭合 I1–I5，接受范围是[共享接口实施稿](../../shared-interfaces.md)
作为 P0/P1 的施工输入，尚不接受任何产品实现或 A05–08/A30/A31 完整符合性。

| 实际检查 | 结果与限制 |
|---|---|
| 两份原 Schema、全部声明及受限消费者 | 30 个 `$defs` 引用、29 个去重 DTO；严格 TS 编译通过 |
| parser 与原始数据结构探针 | 5 个词法条件、2 个 OperationRef 条件；未实现完整严格 JSON 边界 |
| G01/G10 | 生成值与文档完整字面量、UTF-8 长度及摘要一致；不是正式 codec |
| 内层同步回调与不可变快照 | 3 类异步拒绝均有去向，3 个参与者错配及 4 个提交后修改场景通过 |
| ExactUse 单次责任 | 9 个私有状态机制场景通过；使用内存票据及模拟资源 owner，未验证真实释放或耐久性 |

环境为 Node `v24.18.0`、Ajv `8.20.0`、jsonc-parser `3.3.1`、TypeScript `6.0.3`。
通过 `npm ci --ignore-scripts --no-audit --no-fund` 安装已锁探针依赖，未修改产品
依赖或运行外部模型请求。运行结果分别为
[Schema/样例](hub-probe-result.json)、[回调/快照](hub-review-probe-result.json)、
[使用生命周期](hub-claim-probe-result.json)。

[作者探针归档](author-probes.tar.gz)保全原脚本、锁、生成声明、夹具、日志及原结果
共 17 个文件；[逐文件清单](author-manifest.json)已在归档后逐项校验。
归档 SHA-256 为 `e9e6f0c9cef60b24d09feaa8bc74583f2415da9de777d3cbb66ff71f444aa9ab`。
生成的 TS 文件只保存当时探针输入，公开语义仍归实施稿与正式 v1，不成为第二份 API。

复现时将归档解包到目标检出的全新 `tmp/p0-interfaces/`，从该目录执行
hub-summary 中的命令。脚本按 `../..` 读取该检出的正式 Schema 和接口稿，
重新生成临时声明与 G01/G10；不要在历史证据目录原地重跑覆盖结果。
产品作者仍须通过 TDD 实现真实包，并完成公开产物、实际资源、文件和联合准入验证。
