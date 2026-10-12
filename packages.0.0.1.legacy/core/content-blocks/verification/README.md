# Content blocks 验证义务

当前行为归 [SPEC](../SPEC.md)，形状归公开类型和 Schema。验证输入归 [tests/fixtures](../tests/fixtures/README.md)。

| 性质 | 可复跑检查与真实边界 |
|---|---|
| 规范 Schema 与全部定义 | tests/schema.spec.ts、versioned-schema.spec.ts、d068-normative.spec.ts；准确计数防空集，原 URI／摘要及精确准入变化独立核对 |
| 具名拒绝及优先级 | 规范输入与多处违例、不同兄弟次序；Schema 通过不替代具名判断 |
| BlockId／CallId 与相等 | 逐码点、共享不透明空白规则；消息完整树与日志唯一性由消息／日志消费者另外验证 |
| 可见性合取、派生模态与媒体类型 | 规范行为场景及实际公开组合消费；跨成员媒体相等、同模态派生须独立拒绝 |
| 结果、占位与后台提醒 | 结果中任意层无调用；原因配对与 denied 表示；消息／执行拥有者另证占位与后台位置、完整未解析调用不执行并立即失败 |
| 原文与无损 JSON | JSON 读写、重复键、无损数、独立冻结副本；参数串失败与块文本 malformed 分开检查 |
| ModelToolName 跨 owner 对齐 | CB 与 Tool Definition 同名定义的 type／pattern 精确比较；不能以各自通过 Schema 代替一致性 |
| 外来附件分类与引用授权 | 落块方测试 image／audio／其余固定映射；存储拥有者另证拒绝跨租户解引用，地址前缀不作权限依据 |
| 持久不可变与协议 | 日志拥有者证全部成员不可改、opaque 回读不解释、转换不回补、卸载不替换；跨进程重新证分配／日志／解析协议，不外推单机测试 |
| 公开与制品消费 | public-consumer.spec.ts 及 tools/core-verification：实际 Node、严格声明及 tarball 消费，私有路径精确拒绝 |

本包无状态转移，不新建与 Schema 同义的形式模型。Schema、具名判断、消费者组合与持久／授权责任分别验收；不以文件存在或单次成功宣布全部成立。存储解引用来源、跨节点解析与字节保留政策尚需其真正拥有者限定。
