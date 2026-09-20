# Session 边界

Session 拥有长期身份、tenant/owner、历史、输入队列、到达账本、状态贡献和会话级调度入口。Run 的执行状态、等待登记与 epoch 不复制到 Session；它们只在具名共同门中被读取或共写。

- [能力边界](capabilities.md)
- [组合与动作链](compositions.md)
