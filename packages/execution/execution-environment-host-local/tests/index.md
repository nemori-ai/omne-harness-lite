# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身、运行记录与当前缺口
- [host-file-results.spec.ts](host-file-results.spec.ts)：宿主文件使用的结果
- [host-files.spec.ts](host-files.spec.ts)：读取范围、查看、新建与预期版本
- [host-files-unsupported.spec.ts](host-files-unsupported.spec.ts)：八项未实现操作
- [host-file-edges.spec.ts](host-file-edges.spec.ts)：宿主文件设施的边界结果与版本一致
- [host-provider.spec.ts](host-provider.spec.ts)：宿主提供者的事实、账本关闭与退役通知
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务、声明插件与宿主文件插件的装载、卸载与恢复
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合与 Cordis 边界
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
