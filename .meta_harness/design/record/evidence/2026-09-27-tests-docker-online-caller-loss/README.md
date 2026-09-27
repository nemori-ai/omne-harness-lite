# 在线备份调用者终止后的任务与显式查询

root 有限接受运行 `20260926T223439Z-bfc5474d`：在线备份客户端进程消失后，服务端已经受理的任务继续持有资源；显式新状态查询先报告 busy，任务完成后确认唯一已发布备份，未重放写入。依据为 [HT3](../../../spec/compositions/governance-center-entry-https-json/v3/contract.md) S-21及维护操作断连规则、[EC3](../../../spec/compositions/governance-center-entry/v3/contract.md) S-55/S-59，以及 [Docker 装配](../../../realization/apps/tenancy-host/docker.md)。调用者丢失的原结果仍是未知，不以稍后的状态改写原返回。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`；I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，host BUILD `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`。macOS arm64 上的私有 Linux Engine29.1.3／Compose2.40.3，应用 UID/GID10001。QA image 仅增加 probe、NODE_OPTIONS 与标签；2851个原应用文件、115个链接、BUILD 清单逐项相同。QA 门拦截真实 wx/0600 export FileHandle 的首次写，并不替换备份实现。

[原始包](raw.tar.gz) SHA256 `b033c1ecbf3de75be9cb631240b5a334fdab7af5a4ac4251375b85cfd14d31e5`；[逐件摘要](files.sha256.json) 共347件，包含原始运行、冻结输入、外层退出、独立清理反查与 root 重放输出。原344件实际清单 SHA256 `08173ad5e707381290771a03a69efe12b79687888eb4610ba64ddae9b8ee548f`，root 全部核对并复制，在副本独立重跑冻结 oracle 退出0；另外直接复核进程身份、持有窗口、状态及文件摘要。归档字节再次核对。镜像按固定输入摘要引用，不重复打包。

一次原 `node cli.js ops --socket-dir /run/omne-tenancy backup` 经 pidfile+exec 启动。两次原始 `/proc` 命令行观测绑定内部客户端 PID83，随后只向该 PID 发送一次 SIGKILL；精确路径确认 ENOENT。外层 Docker 客户端实际退出137、stdout为空，这不是备份完成结果。中心 CID `46b03313faa69cf88b7f23bde1af39a147f272f56dd8ea55e17155a54fbdcb37` 始终 running，Engine PID1085、StartedAt `2026-09-26T22:35:01.409042764Z`、RestartCount0均不变。

客户端消失后33.07323925秒的观察中，原 FD 仍为 `65025:239802:10001:10001:600`，同一永久 marker 的 inode/属主/模式和内容保持。服务端 full-health 正常；两次独立 backup-status 都返回 busy，目录尚无已发布封装。之后只释放原任务，22:35:44.554370Z 开始的新状态查询返回 observed/current、invalidCount0，唯一文件 `d0cfd6a7582f11bc5f3fc8e986e32977.omne-backup`。

原镜像对该文件独立 verify 返回 verified、businessOpen:false，元信息指向原 centerId `5a3a19fcbb86c05d8f2a0a54e7e7828e`；源封装 SHA256 前后均为 `05b27ea46b122d65819c62f4130c881d34373bb85871995807d989b4fc825597`。在线与离线元信息只允许相同 UTC 时刻的表示规范化，其余字段严格比较。没有第二个 backup，没有向服务端发停止信号，没有以清理结束任务来获得通过。

输入摘要 `04c2d89c3b38337be23f8e0a2807861603536c38917af9077d380c579304a643`；driver SHA256 `1fe428b83eac671972cd43877b18f1241352ff7d3f00255d979ce454e28002bb`，oracle `92cae3530b76c6c31cc172af2dc3edde341fb35c0d332009fea920e845032caa`。2个正例、32个反例仅检验测量器。业务观察完成后才做私有环境清理，独立唯一标签查询容器、网络、卷皆空，六个精确资源名不存在。

结论只覆盖本次受理后、真实文件发布前的客户端进程终止窗口及显式查询。33秒不是产品时限；不证明所有网络断连时序、非计划服务端崩溃、物理断电或原生 amd64，不代表 Docker 交付整体已接受。
