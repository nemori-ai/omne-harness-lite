# Session本地提供者的机制验证

```sh
python3 packages/session/session-runtime-local/verification/models/probe_transactions.py > tmp/session-agent-runtime-phase1/verification/transaction-probe.json
node --experimental-strip-types packages/session/session-runtime-local/verification/models/probe_cordis.ts > tmp/session-agent-runtime-phase1/verification/cordis-probe.json
```

先创建输出父目录。SQLite程序验证简化同事务回滚、锁内当前判断和唯一execution owner约束；不实现公开provider端口，不证明生产迁移、并发调度或当前权限。Cordis程序解析本树kernel-basis的官方依赖，观察两个独立Context的事件／撤除／故障及inject换代。原执行句柄是受控对象，不能当成真实模型／工具组合证据。

最终提供者须补真实StorageUnit参加、两个Session／tenant、独立执行服务在途保持、bridge撤除／代际、未知commit／ACK、pending close及资源排空。跨节点升级必须取得等价协议证据。上述运行输出只进工作树tmp，不在包中保留历史日志或原始结果快照。
