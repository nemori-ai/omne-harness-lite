# 离线任务的调用者被 SIGKILL

root 有限接受运行 `20260926T213959Z-88b14a1a`：已经确认内层 helper 和任务 CID 后，强制结束 helper 不会伪造任务完成；原任务继续持有资源，后续可以按同 CID 查询真实结果。依据为 [D-071](../../decisions/governance-docker-stop-adoption/decision.md)、[Docker 离线映射](../../../realization/apps/tenancy-host/docker.md) 与 [storage-sql 维护工作根](../../../realization/packages/infra/storage-sql/maintenance.md)。[handled TERM](../2026-09-27-tests-docker-offline-cancel/README.md) 是另一个已验分支，不用本轮代替。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`，I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`；helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`。macOS arm64 上的私有 Linux Engine29.1.3／Compose2.40.3，应用 UID/GID10001。原 image 创建真实备份并正常停止后，QA image 只添加 /probe 与 NODE_OPTIONS，原应用全文件、链接、BUILD 与清单不变。

[原始包](raw.tar.gz) SHA256 `1e1eeb500ff3ed9855705129eb724cdddb007b385f153188d4b4a52ad6284cc3`；[逐件摘要](files.sha256.json) 共340件。337件实际清单 SHA256 `5121a808f8646ceb2ee76a97a7eba8c91abb79c8cd732a27adec06cefcfbdfa5` 由 root 逐项核对并复制，副本冻结 oracle 独立复跑退出0；另读 kill、proc缺失、状态、busy、真实 wait 及工作根原文，归档后再核字节。大镜像 tar 不在包内。

测试门停在实际以 wx／0600 打开后的 import FileHandle.writeFile。pidfile+exec 与只读 proc 原始 cmdline/direct children 确认 helper PID1404、其 docker wait 子进程1659正等待确切 CID；发送信号前 Node 再次核对，然后只对该 helper 发一次 SIGKILL。随后 `/proc/1404` 明确 ENOENT，不以外层 docker exec 客户端结束代替内层进程消失。

31.507252167秒后，原任务仍是同 CID/PID，FD设备/inode/0600未变，工作根0700与永久 marker0600保留。maintenance-status 返回 running、exitCode null、outputText为空。使用原 image 的另一个独立 CID 对同工作根执行 verify，实际 busy／退出2；这是显式冲突测试，不是对未知原调用的自动重放。

释放 gate 后，不向应用发 TERM；单独只读 docker wait 返回0，同 CID inspect 为 exited0，原任务日志及 maintenance-status 都保留 verified、原备份 metadata、businessOpen=false。源封装 SHA 不变，临时明文只在真实收场后消失；工作根与 marker 的身份、所有者和私有模式保持。owner lock 实际0644仅记录，不擅加独立0600保证。

被杀 helper 没有 maintenance-finished 或结果 stdout。外层 docker exec 实际退出137、stdout为空；它的原调用仍是结果未确认，不能因任务后来成功而倒写成正常返回。Engine任务事件没有 kill；原任务容器和输出在状态查询时仍保留。业务判定后才清理夹具及孤立只读 wait 客户端；独立标签查询容器、卷、网络均空，六个创建名称均不存在。

输入摘要 `8bf0c72daa831daf49ac01a055c2161e2511e5329d15e2ca40c30c3907306e6d`，driver SHA256 `fc35cf19f0e1706dc9131e9d9f197e7eeb72aae1d4d56c2d59cc7198b92076b5`，oracle `2ec64db4b31738aebe862154d020f69904d760e879e5d50d94c0fb59a393f09a`。4个合成正例与45个反例只检查测量器。本轮不覆盖创建身份尚未知时失联、网络自然断开、不同工作根并行、daemon 关机竞态或物理断电，不宣称完整 Docker 交付。
