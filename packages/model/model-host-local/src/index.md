# src 索引

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，导出保管库工厂与诊断类型
- [store.ts](store.ts)：保管库句柄、文件锁、刷新、原子发布与关闭
- [records.ts](records.ts)：磁盘记录的编码与解码
- [fields.ts](fields.ts)：读取未定型输入（快照与插件配置）的守卫
- [cordis.ts](cordis.ts)：Cordis 绑定入口，导出插件并转出注入发送
- [deliver-injected.ts](deliver-injected.ts)：注入发送，不导入保管库
- [send-resources.ts](send-resources.ts)：生产发送资源，每次 acquire 一个 pi 传输与私有凭据槽
- [assembly.ts](assembly.ts)：本地 Model 装配，组合网络资源、发送资源与 model 的发送边界
- [plugins/host.ts](plugins/host.ts)：宿主插件，本地驱动宿主、bind 后发布与有序关闭
- [plugins/runtime.ts](plugins/runtime.ts)：运行门面 `modelRuntime`、结果推送、retained ACK、清理、晚到账目与推送账本
