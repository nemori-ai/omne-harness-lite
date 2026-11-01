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
- [host-provider.spec.ts](host-provider.spec.ts)：宿主提供者的事实、经登记表门的账本关闭、退役与退役通知
- [host-provider-drain.spec.ts](host-provider-drain.spec.ts)：退役等在途文件操作、超界待处置与诊断
- [host-domain.spec.ts](host-domain.spec.ts)：责任域的真实文件与描述符证据：每份获取的排空、关闭失败的归属与维护重试、跨代共用配额与原记录、重建登记表后的结清、冷恢复的保守答复
- [contract-conformance.spec.ts](contract-conformance.spec.ts)：登记表与宿主提供者经契约套件，以及套件拒绝的故障
- [ports.ts](ports.ts)：测试辅助：两个端口服务的替身
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务、端口服务、声明插件与宿主文件插件的装载、卸载与恢复
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合与 Cordis 边界
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
