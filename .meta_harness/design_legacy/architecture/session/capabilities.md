# 能力边界

Session 拥有长期身份、tenant/owner、历史、输入队列、到达账本、状态贡献和会话级调度入口。Run 的执行状态、等待登记与 epoch 不复制到 Session；它们只在具名共同门中被读取或共写。

## Cordis 投影

Session 插件提供获准的会话读写、queue/inbound 读面和状态贡献注册；持久提供者保留日志前缀，运行实例可以重建。

Context、服务引用或 AgentRef 只提供定位，不构成授权、执行权或耐久事实。每次使用仍核对
tenant、精确代次、当前资格与撤销屏障；运行插件缺席不得删除其长期 owner 的责任。
