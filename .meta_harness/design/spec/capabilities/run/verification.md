# Run、Step、执行权与控制验证范围

本主题没有独立 Run 模型；状态关系由 lifecycle 与 RunDriver 模型部分覆盖。RN-05 的强隔离终态门把 `partial.unknown` 限定为隔离已证实后的外部效果未知；这是尚未接受的新 candidate semantic change，不是 legacy 等价或既有政策。

正文为条款级重基候选，旧执行结果、review、publication 与实现接受不进入新 baseline。
本轮只通过设计树 internal gate、来源哈希和依赖映射；候选接受、真实组合测试、形式工具运行
和 release evidence 仍是独立门。provider 事实见本主题入口所列映射。
