# 可复核来源

## 官方原文

2026-09-26通过web工具实际打开官方页面，不只读搜索摘要：

- [Docker container stop](https://docs.docker.com/reference/cli/docker/container/stop/)：TERM后到期限可强杀；timeout=-1不设置等待期限。适用Engine CLI语义，单独不能证明Compose参数传递。
- [Compose stop](https://docs.docker.com/reference/cli/docker/compose/stop/)：提供整秒timeout参数。
- [自动启动容器](https://docs.docker.com/engine/containers/start-containers-automatically/)：区分on-failure、always、unless-stopped及daemon重启/手动停止。其宿主进程管理器与Engine重启管理器冲突警告适用于同时争夺同一容器生命周期；本实验未测试双管理器。

## 实验P1–P4

GPT-6 Sol xhigh验证角色在独立工作树基线2cb236db实际运行；主线读取`results.json`、命令、inspect状态、退出码和报告，逐文件复制hash相等后封存。不是仅转述agent结论。

[完整脚本/输入/原始输出](sources/2026-09-26-lifecycle-probe.tar.gz)，[归档摘要](sources/sha256.json)。归档内`manifest.json`记录91个输入/输出文件摘要；其余一个文件是manifest自身。运行目录`20260926T081619Z-0127f6`，report/inputs/results/commands/events/checks/cleanup各自保留。

- Engine29.1.3；Compose2.40.3-desktop.1；Docker Desktop4.55.0；Linux/arm64引擎。
- node:24.21.0 RepoDigest `node@sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4`，本地镜像ID `sha256:7e6ba96b9576ae44872bdb57bc0665a70fd87bbc7c8a019ab849429c6c69ef44`，arm64。
- P1 Engine timeout=-1、P2 Compose显式timeout=-1、P3 Compose负duration的默认stop/down，均在16秒仍等待、放行后收场。
- 负对照timeout=2，约2秒后ExitCode137，日志未出现RELEASED。
- P4 on-failure非零退出观察到1次重启；显式stop后12秒不重启。
- 输出测量检查20/20；本次具名前缀容器、网络、卷清理后剩余0。

重跑使用归档内probe.py等脚本，应先读其README/report确认精确入口与资源前缀。只能在隔离测试环境运行；原始路径保留当时工作树，不承诺他机路径一致。以上不构成治理产品集成测试。

## 隔离 daemon 四格矩阵

[2026-09-26-daemon-stop-probe.tar.gz](sources/2026-09-26-daemon-stop-probe.tar.gz)含脚本、纯自检、镜像输入及37文件manifest（另加manifest自身），运行20260926T142218Z-a412da4031。四格独立结果均pass，cleanup.complete=true；主线复制后逐文件SHA256一致并核读results/inspect/报告。

- 外层官方DinD RepoDigest `docker@sha256:173f284a4299164772a90f52b373e73e087583c0963f1334c9995f190ef6f3f5`；内部Engine29.1.3/Linux arm64，外层不挂用户Docker socket。
- BusyBox输入RepoDigest `busybox@sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e`，离线save/load，不依赖内层下载；归档保留实际输入tar与hash。
- unless-stopped运行格StartedAt从14:22:35到14:23:18 UTC，进程启动ticks从24377661到24381985。
- 显式stop exit0/exit1两格前后保持相同启动身份和退出结果；on-failure格前运行、重启后停止，日志只有一次START。
- 具名DinD与匿名数据卷已删除，未修改实际宿主daemon配置或状态。

失败对照[2026-09-26-restart-measurement-failure.tar.gz](sources/2026-09-26-restart-measurement-failure.tar.gz)保存上一轮19文件，整轮失败且daemon矩阵未执行；只记录过渡态反例和die后start事件，不升级为产品证据。所有新增归档hash列入[摘要](sources/sha256.json)。

## 运行输入三格

[runtime-input-probe归档](sources/2026-09-26-runtime-input-probe.tar.gz)含32文件（manifest列其余31文件），实际成功run为20260926T143609Z-b73e06a0e9，准备失败run为20260926T143419Z-1dffe861ca；报告、源码、dummy env/YAML、config、inspect、容器内stat/mount/env以及清理命令全部保留并经主线复制hash核对。没有真实凭据。官方[Compose services](https://docs.docker.com/reference/compose-file/services/)对raw env及tmpfs选项的说明与此有限观察对照，不据最新版文档推断任何旧版本支持。
