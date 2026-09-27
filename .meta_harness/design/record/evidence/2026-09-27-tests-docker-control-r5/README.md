# Docker 控制脚本 R5 · 局部实现与整合检查

主线将 I2 `697df718e4dd2afe0288063239a1619f1217d5e1` 合入 HUB `720d3097`，消费 [D-071](../../decisions/governance-docker-stop-adoption/decision.md) 与节点 SHA `3720aebc99049832b794550f5892c540dacac2eac4018e120eda3be029de0223`。最终 helper SHA `0602a52ef521a3a41971097e80c560db2fb24cc69cb2d5098634f81774bd156d`；原 I2 helper `666b73a6…a1` 与新源码、输入和运行摘要均保留。

[原始包](raw.tar.gz) SHA256 `fea3adaeab605877f689be1a097e5b3e20d73cbceb0d05fb8db1169c42002636`，[逐件摘要](files.sha256.json)。worker 负责实现，root读变更／反例并逐核17件交接；根工作树实际重跑 Docker 三文件＋packaging，共4文件22项通过，typecheck与文档1600项通过。worker Node24.21 的21项、格式、Mac/Linux Bash syntax、Compose配置和本地PID回收检查分别保留，不能相加为独立场景数量。

主线接受的是这一局部代码增量：两Compose显式SIGTERM、中心一次TERM后完整wait＋同ID退出码，start失败仍非零并输出stderr，维护取消与真实完成竞争分开结算。空结果、多行、缺LF、非法码、错ID/状态、inspect失联、请求失败等反例不能冒充成功；原挂载/UID/路径与并发责任不减。

root在演进实现中实际复现中断控制shell后自有只读wait客户端遗留；修复后以exec保证拥有实际CLI进程，在可处理caller离开时只回收本地客户端，产品TERM仍恰一次，返回unknown。root另一次隔离mock复跑确认child已回收、临时文件清理，源码hash同最终helper。这里只对自有本地进程做强制回收，不强杀应用或宣称应用已排空；源代码测试和产品运行不可混淆。

**尚未验收**：真实root helper对Engine的纵向旅程、最终I3归档/两架构镜像、长IO与close残余/第二owner/timer/重启/取消故障矩阵。Linux Bash syntax只执行语法解析；Compose config只核声明，不是启动中心。新deploy文件改变BUILD_ID，须重新生产制品再独立QA、Fable整体review，旧I1结果不迁移。
