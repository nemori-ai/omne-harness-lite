# 到达装配验证义务

[行为规格](../SPEC.md)约束纯值操作，规范输入归 [tests/fixtures](../tests/fixtures/README.md)，有限模型及正负配置归 [models](models/README.md)。

运行成员 build、typecheck 和 test；原样输入必须继续检验无损参数、唯一解析点、数值索引相等、快照不可变、拒绝零影响、块顺序、替换与配对汇总、首内容、结算及 abandon。实际外部公开消费使用 tools/core-verification 的 stream 场景，不能用私有状态替代。

从 models 目录执行 TLC：Assembly.cfg 应通过，Assembly_OrderByClose.cfg、Assembly_ReplaceAsAppend.cfg、Assembly_OneShotCloseFirst.cfg 分别必须产生对应性质的反例。工具错误、超时或语法失败不算负控。模型范围与前提见模型 README，不证明真实载荷、网络、持久存储、授权或无限进展。

真实消费者须覆盖四类交接：用户叫停模型回复后保留可见部分及账；工具被中断后保留帧内容并按执行结局包消息；中途加入观察者按快照位置续增量；上游失去连续性或宿主撤除时 abandon 为 lost，不冒充正常 finish。费用、消息及租户责任保持各拥有者归属。本包模型与值测试不能替这些消费者授予完成状态。单次结果留工作树 tmp。
