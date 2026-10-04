# 即时资格失效与延迟资源释放

本次取证接续[真实客户端收尾探针](../2026-10-04-probe-identity-lifecycle-2/README.md)，
核对第二轮 Choice 提出的双面准入和注册续步反例。BASE 为
`588628544ab92bd542f24efa1801634eb6eee56e`。
命令、环境、输入/输出散列及两次设施错误见 [run.json](run.json)。

[Unix 驱动](dual-face-probe.mjs)使用真实 Cordis、真实 Unix socket 和受控业务等待。
它先撤 ops fiber 的监听，保留 entry 和末行 helper 的未完成工作。
[结果](dual-face-probe.stdout)显示，直接读取协调器资格会拒绝新连接的操作，
即使 onStopping 抛错也不重新开放，并保留 assembly-stop-failed。
恢复仅靠监听的负控仍接受操作。该驱动没有使用正式 EC 两面，不等同于产品组合验收。

[注册驱动](registration-probe.mjs)使用现有注册编排引擎和真实 Cordis。
AI/OG 的步骤结果由受控依赖提供，签名用本次生成的真实 Ed25519 密钥，不输出密钥。
分别在步骤①、②等待时撤除注册 fiber，入口 close 先等待整个注册工作。
[结果](registration-probe.stdout)显示，即时资格使返回为 interrupted，调用序列分别止于①、②。
恢复“等轮到注册 close 才失活”的两个负控均继续到③并返回 registered。
这验证已有引擎的 isActive 接缝，不证明新 binding 或真实数据库事务已经迁移。

[有限枚举](qualification-model.py)遍历监听撤除、停止、步骤交接与入口排空。
[结果](qualification-model.stdout)为正控 24 状态、28 边；两项负控各找到对应反例。
模型只判断所列安全条件，不建模 Cordis 调度、IO 或业务失败，也不证明无条件进展。

注册驱动首次误用 CJS 解析仅有 ESM 导出的入口，第二次误读 Parsed 的字段。
原驱动、stdout、stderr 分别以 first、second 保留。最终修正设施后运行通过，产品未改。
正式提供者、真实 TLS/Unix/SQLite 组合、setup/close 故障及独立 L3 验收仍是后续义务。
