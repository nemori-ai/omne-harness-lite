# 治理中心恢复提供者核对

调查成熟复制组件能提供哪一层保存与恢复保证，供本轮治理生产设计比较使用；本包不选择恢复架构。

- 对象：Litestream v0.5.17（提交 `ccd326c175b583b5e82893a6078f06dcef5fba3f`），官方同期文档与一次合成数据探针。
- 核对日期：2026-09-24。
- 消费者：治理生产基线后续机制设计；尚无生产采用。
- 准入：精确发行物、源码位置、输入脚本与原始结果可复核；只覆盖同机文件副本，不能外推为整机灾备。

| 问题 | 入口 |
|---|---|
| 已观察能力与边界 | [研究正文](research.md) |
| 来源、合成探针和未做项 | [证据记录](evidence.md) |

2026-09-25补充：[单机分发与SQLite机制](reports/2026-09-25-single-host-delivery/README.md)，独立host/CLI目录真实治理旅程和readOnly/WAL备份探针；不采用方案。

2026-09-25：[固定只读观察与并发写备份](reports/2026-09-25-pinned-read-backup/README.md)，Mac/Linux原语探针，不是产品实现。

2026-09-25：[备份取消及读观察释放](reports/2026-09-25-backup-cancellation/README.md)，双平台合成探针与Node精确源码；不证明任意IO有界。

2026-09-25：[私有锁库同时竞争](reports/2026-09-25-owner-contention/README.md)，两平台三种原语各40次，未推导任意调度进展。

2026-09-25：[systemd停止与定时触发](reports/2026-09-25-systemd-lifecycle/README.md)，实际252.39隔离容器合成服务，不是产品运维验收。

2026-09-26：[完整校验与worker响应](reports/2026-09-26-snapshot-check-worker/README.md)，近869MB双平台主线程阻塞与单worker原语观察，不是产品可用性结论。
