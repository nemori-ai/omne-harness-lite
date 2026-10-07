# Docker 正常停止与重启语义

核对既有治理中心部署要消费的Docker/Compose行为。对象是Engine29.1.3、Compose2.40.3-desktop.1；取得于2026-09-26，主机macOS arm64、Docker Desktop4.55.0的Linux/arm64引擎。

消费者：Docker部署候选。变化信号：Engine/Compose版本、停止/重启策略或宿主运行环境改变。

[研究结论](research.md) · [来源与实验](evidence.md)。本轮只提供有限机制事实，不做采用选择，不是产品制品或真实公司部署验收。

2026-09-27 追加：[Linux 控制环境先导](reports/2026-09-27-linux-control-environment.md)。隔离 systemd／DinD、同路径权限、真实 timer 三格和 macOS/Linux TLS 前提已测；保留此前两次失败，不把环境就绪升级为产品验收。

同日追加：[Engine stop 源码读数](reports/2026-09-27-engine-stop-source.md)，区分早返、真正发信号和元数据持久化的前提；未作运行时竞态通过声明。

[2026-09-27 停止意图实验](reports/2026-09-27-stop-intent-experiments.md)保留正常整轮失败、定向waiter及metadata V2–V5；实际checkpoint失败反例说明TERM受理不蕴含Engine标记成功持盘，未验证并发shutdown或产品恢复。
