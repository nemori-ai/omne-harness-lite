# 同一中心的并发启动与停止

root 有限接受运行 `20260926T215159Z-57306cd0`：第一次 start 尚在等待健康时，同 project 的第二次 start 与 stop 均由生命周期锁返回精确 busy，没有替换或终止原容器。依据为 [Docker 映射](../../../realization/apps/tenancy-host/docker.md) 与 [D-071](../../decisions/governance-docker-stop-adoption/decision.md) 的生命周期串行化绑定；[启动观察过期](../2026-09-27-tests-docker-startup-expiry/README.md) 是本轮复用的已验故障夹具。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`，最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`。macOS arm64 上的私有 Linux Engine29.1.3／Compose2.40.3，root控制宿主，应用 UID10023/GID10024。QA 仅在原 health.mjs 进程中挂起，原应用全文件、链接、BUILD、启动入口及 health 命令不变；没有改生产代码或操作用户 Engine 生命周期。

[原始包](raw.tar.gz) SHA256 `b1fe1c25697c1ecfdbaf361438be4fe2255aad157eb501cdcdc19ca0e6a007b6`；[逐件摘要](files.sha256.json) 共273件。270件实际清单 SHA256 `8dbc5d813de85c797e5769d9a733e5a9d940445cdd75f7e729ad8b58d49e40d2` 由 root 逐项核对并复制，副本冻结 oracle 独立复跑退出0；root 另核两次 busy、锁属性、初次启动收场与两路日志。归档内字节再次核验。大镜像 tar 不在包内。

45秒是 QA 的启动健康观察预算。第一次异步 start 创建确切 CID，实际 inspect 为 running、health 尚未 healthy。在它完成之前，第二 start 与 stop 分别实际退出1、stdout为空、stderr恰 `omne-center: busy`。锁根为 root:root／0700、inode130，锁文件为 root:root／0600、inode131，竞争前后相同；这是 helper 生命周期锁，不是维护工作根中的协调文件。

存活采样来自外层本地 Docker exec 客户端，不声称读取了内层 helper 的 proc PID。它与调用时间包围、真实 busy、锁文件、同 CID 的 running／StartedAt／RestartCount0，以及 pre-expiry 事件只有一次 create/start 相互核对。没有观察到竞争调用产生额外容器、TERM 或重启。

第一次 start 随后观察过期，正式 helper 对该 CID 发送一次 TERM，等实际 exited0 后在 stderr 报 clean:true；start 自身仍退出1、stdout为空。最终 Engine 事件为一次 create、start、signal15、die(exit0)，status 保留同 CID/image/BUILD 和退出事实。正常停止配置仍为 unless-stopped、SIGTERM、StopTimeout=-1。

竞争前后中心 stdout 日志均为空，stderr 各654字节真实应用 JSONL，SHA256 同为 `d5b2adb2dcfac6265a96e8188bf528441681e27ff79886d0f29cbf9036e76fe3`；本轮证明的是这段已有 stderr 日志保留。原检查者曾只读 stdout 而误报两流为空，已在实际 finding 中更正，原 run/oracle 未变。独立标签查询容器、卷、网络皆空，六个创建名称均不存在，清理不充当业务收场。

输入摘要 `1b0e0dbd12fb558edf3f97f548ed89bc3a86d95eb551554bd098090cf53bbbad`；driver SHA256 `7295c5461dca4c1ce5e410a4a939150abb99fad25e5d1db1c680ddbb56b66c37`，oracle `cb9af8372a211443dac4b4615664b3ebfebfff561e1ead4ce4e408dfe9941f36`。1个合成正例、16个反例和 preload 两分支仅验证测量器。本轮不覆盖调用者消失后的旧 Engine 请求晚到、任意并发时序、不同主机共同控制或完整 Docker 交付。
