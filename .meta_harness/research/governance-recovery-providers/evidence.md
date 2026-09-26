# 来源与实际观察

## E1 精确源码与官方接口

- 日期与版本：2026-09-24，Litestream v0.5.17，`ccd326c175b583b5e82893a6078f06dcef5fba3f`。
- 取得方式：克隆官方仓库精确 tag 并直接读取源码；官方网页阅读全文，不以搜索摘要替代。
- 立场：作者实现与作者文档；不是独立第三方审计。
- 源码：[Store.SyncDB](https://github.com/benbjohnson/litestream/blob/ccd326c175b583b5e82893a6078f06dcef5fba3f/store.go#L433)、[DB.SyncAndWait](https://github.com/benbjohnson/litestream/blob/ccd326c175b583b5e82893a6078f06dcef5fba3f/db.go#L716)、[Replica.Sync](https://github.com/benbjohnson/litestream/blob/ccd326c175b583b5e82893a6078f06dcef5fba3f/replica.go#L144)、[文件保存](https://github.com/benbjohnson/litestream/blob/ccd326c175b583b5e82893a6078f06dcef5fba3f/file/replica_client.go#L158)、[CLI 输出转换](https://github.com/benbjohnson/litestream/blob/ccd326c175b583b5e82893a6078f06dcef5fba3f/cmd/litestream/sync.go#L21)。
- 文档：[sync](https://litestream.io/reference/sync/)、[IPC](https://litestream.io/reference/ipc/)，按本次访问日期记录；网页会演进，精确行为还以钉版源码与探针区分。
- 观察：wait 路径等待两个同步阶段；缺副本报错。IPC 用 `replicated_txid`，CLI 转为 `replica_txid`；本地/副本位置在同步后分别读取。文件提供者执行文件同步和目录同步，但底层设备是否兑现未测。
- 支持范围：本版本控制流和文件后端调用；不支持 S3/NAS 已验证、应用事务和复制批次原子绑定等更强结论。

## E2 同机文件副本探针

- 发行物：[v0.5.17](https://github.com/benbjohnson/litestream/releases/tag/v0.5.17) 的 darwin-arm64 tarball，与官方 checksums 比对一致。精确 SHA 见 [provenance](sources/provenance.json)。
- 运行环境：macOS 27.0 arm64；Python sqlite3 3.53.3；合成表 `security_fact(id, revision)`；WAL/FULL；文件副本在同一台机器的另一个目录，无真实凭据。
- 输入：[probe.py](sources/probe.py)、[配置](sources/probe-config.yml)；输出：[result.json](sources/result.json)、[daemon.log](sources/daemon.log)。复现需将钉版二进制放脚本旁 `bin/litestream` 后运行 `python3 probe.py`；会使用新的独占临时目录，不连接产品环境。不要覆盖本包原始结果，复制到临时目录运行。
- 实际观察：脚本成功完成；同步后恢复 revision=1；暂停 daemon、写入2后恢复仍是1；sync等待约2秒以非零退出；恢复daemon并同步后恢复为2；随后回写1并同步，恢复为1；SIGKILL daemon后仍能恢复1。
- 有效性：暂停复制的负控确实看见旧数据，不是无条件返回最新本地文件。回写实验只证明复制组件不会替应用判升级，不是项目升级故障测试。
- 复核：在 `sources` 内运行 `shasum -a 256 -c SHA256SUMS` 校验记录。首稿脚本在执行前有一行 Python 语法错误，被 py_compile 检出并删除；此处保留的是实际完成探针的输入，没有发生该错误脚本的运行。
- 不能推广：同机目录不是独立故障域，SIGKILL不是断电，SQLite表不是本项目领域验证，没有 Linux 或网络后端、全日负载、接管或物理损坏测试。结果中的恢复毫秒数不是 RTO 承诺。

## E3 文档所声明的边界

2026-09-24 直接读取官方 [VFS 写模式](https://litestream.io/guides/vfs-write-mode/) 的适用、不适用、实现与限制章节；作者声明周期同步、单写者、非生产强一致性用途。本轮不运行该 VFS，不据此评价默认 SQLite 数据库所有部署。

短板取证覆盖官方 limitations、钉版控制流以及 E2 负控；未检索完整开放 issue 集合，也没有独立第三方系统审计。尚缺部分保持未知，不将未发现当作没有风险。
