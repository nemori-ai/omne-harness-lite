# verification/models 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：模型清单、性质、规模上限与运行方法
- [FilesHelper.tla](FilesHelper.tla)：Windows 常驻文件辅助进程的模型，配置是本目录的 `FilesHelper*.cfg`
- [WindowsCustody.tla](WindowsCustody.tla)：Windows Job 收纳对契约 ProcessCustody 的精化，配置是本目录的 `WindowsCustody*.cfg`
- [WindowsCustody-mapping.md](WindowsCustody-mapping.md)：WindowsCustody 的变量、动作与性质对应
- [run-tlc.sh](run-tlc.sh)：运行本目录全部配置与可达见证
