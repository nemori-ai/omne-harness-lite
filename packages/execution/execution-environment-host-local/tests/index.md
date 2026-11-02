# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身、运行记录与当前缺口
- [host-file-results.spec.ts](host-file-results.spec.ts)：宿主文件使用的结果
- [host-files.spec.ts](host-files.spec.ts)：读取范围、查看、新建与预期版本
- [host-files-unsupported.spec.ts](host-files-unsupported.spec.ts)：非 Linux 宿主与有根而前提不满足时答 `unavailable`
- [host-file-tree.spec.ts](host-file-tree.spec.ts)：列表、搜索、建目录、删除、移动、复制
- [host-file-root.spec.ts](host-file-root.spec.ts)：宿主文件根的四类逃逸、竞态与根的身份，只在 Linux
- [host-file-batch.spec.ts](host-file-batch.spec.ts)：提交批次与恢复批次
- [host-file-edges.spec.ts](host-file-edges.spec.ts)：宿主文件设施的边界结果与版本一致
- [host-provider.spec.ts](host-provider.spec.ts)：宿主提供者的事实、经登记表门的账本关闭、退役与退役通知、命令启动前不起进程的拒绝与命令选项的界值
- [host-command.spec.ts](host-command.spec.ts)：真实 systemd 用户 scope 里的命令：流式输出、显式环境、有界缓冲、门一侧的暂停、停止两态、单调用中断、释放与退役、资源恢复；只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行，归慢层
- [host-command-frames.spec.ts](host-command-frames.spec.ts)：门的帧读取、输出缓冲与单一读者、停止确认的判断、恢复引用的读取、监督工具的运行；不起 scope，两个平台都运行
- [host-probe.spec.ts](host-probe.spec.ts)：`command` 的平台前提探测：改变真实环境后答 `unavailable` 与诊断，前提恢复后再启动
- [host-provider-drain.spec.ts](host-provider-drain.spec.ts)：退役等在途文件操作、超界待处置与诊断
- [host-domain.spec.ts](host-domain.spec.ts)：责任域的真实文件与描述符证据：每份获取的排空、关闭失败的归属与维护重试、跨代共用配额与原记录、重建登记表后的结清、冷恢复的保守答复；排空只停止这份获取的命令进程
- [contract-conformance.spec.ts](contract-conformance.spec.ts)：登记表与宿主提供者经契约套件，以及套件拒绝的故障
- [ports.ts](ports.ts)：测试辅助：两个端口服务的替身
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务、端口服务、两个声明插件与宿主文件插件的装载、卸载与恢复，以及插件配置
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合与 Cordis 边界
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
