# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：公开根
- [directory-source.ts](directory-source.ts)：`createDirectorySource`
- [walk.ts](walk.ts)：遍历、链接解析、根内判定与错误分类
- [fs.ts](fs.ts)：文件系统接缝 `DirectoryFs` 与默认实现
- [cordis.ts](cordis.ts)：`./cordis` 入口，插件 `skillPlugin` 与三个服务子类
