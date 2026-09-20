# 组合边界

S1 在受理后取用前求值；extension 缺失使 plugin not-ready。Stop 产生新 Run，并受 dedup/brake；
take/start 与 Run 创建在同一原子门重验并占 counter slot，恢复/多 handler 不突破 cap。
programmatic answer 不越过 confirm 与组织强约束。用户通知只由 durable completion projection 呈现。
每次运行恰有一条 durable completion。卸载先封
准入，再撤登记、abort/drain 与撤索引；已经发生的关闭、拒绝、trigger 和外部效果不回滚。
