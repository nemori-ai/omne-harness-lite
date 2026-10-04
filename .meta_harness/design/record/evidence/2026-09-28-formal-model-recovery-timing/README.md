# MR8／RT9 恢复时序的有限验证

2026-09-28，主线实际执行。输入候选来自本目录 [inputs.tar.gz](inputs.tar.gz) 内的 `inputs/`，逐文件摘要见 [manifest](manifest.json)。独立评审未重跑这些命令；本次结果不是独立验收或实现完成。

- [Schema 结果](schema-results.json)：Draft 2020-12，10 个新时序边界通过预期。三种 anchored interrupted 的 null 形状通过；普通回复、failed／truncated、Pending 的 null 及缺时刻／null Timing 拒绝。形状不能证明 durable anchor、可信来源或时间真值；不声称全部旧例子或纯判定拒绝优先级已经执行。
- [形式结果](formal-results.json)：RecoveryTiming 一份正配置退出 0，无反例；四份负控均退出 12，分别命中 TruthfulSentAt（代填／丢已知）、NoRetryFromNull、RecoveryHasNoSend，原 trace 保留各目录。一个 call、单锚点、至多一次正常 send；实际停止、合法权威前缀是模型前提，未模拟真实 I/O、多写方或费用提供者。
- 初次验证脚本误把旧示例中的 JSON 片段当完整对象，解析中止；[原失败](initial-parser-failure.log) 保留。修正为从完整合法示例区取基底后执行通过，没有改候选来绕测试。

执行脚本 [run.py](run.py) 保留当时工作区与工具链绝对路径，argv、返回码与 jar SHA 在每个 result.json。重跑时先按本机路径调整脚本中的 HUB、JAR、OUT，使用独立输出目录，保留本目录原记录。依赖为本仓库 uv 锁定环境中的 jsonschema/referencing 与所记 TLC jar；网络请求为零。源 schema 及其精确引用闭包、两份候选资源已保全并逐字核验。

本轮没有执行 RT9 七份未变的继承模型，也未执行真实 crash/reopen、S36、L1/L2 或十三操作。实际恢复验收仍由实现消费者承担。
