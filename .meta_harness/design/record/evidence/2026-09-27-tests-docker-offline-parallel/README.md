# 不同工作根并行检查同一备份

root 有限接受 v2 运行 `20260926T220832Z-c8b0c9b0`：同 project 的两个 verify 使用不同工作根并行读取同一封装，各自保有任务、句柄和隔离状态；A 完成不会提前释放 B。依据为 [EC3 S-57/S-59](../../../spec/compositions/governance-center-entry/v3/contract.md#s-57-verify)、[工作根映射](../../../realization/packages/infra/storage-sql/maintenance.md) 与 [Docker 离线装配](../../../realization/apps/tenancy-host/docker.md)。同根 busy 和调用者终止分别见既有证据，本轮不重复替代。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`，最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`。私有 Linux Engine29.1.3／Compose2.40.3 运行于 macOS arm64，应用 UID/GID10001。原 image 生成一次真实备份并正常停止；QA image 只增加 probe、NODE_OPTIONS 及测试标签，原应用全部文件、链接、BUILD 与制品清单一致。两个 verify 均不接收 serve 秘密、配置或网络端口。

[原始包](raw.tar.gz) SHA256 `e9e2640c196c7b0d2ab2b41ce111e9705b01deef2d2663d612299c88474f8954`；[逐件摘要](files.sha256.json) 共842件。两轮各419件实际清单均由 root 逐项核对并复制；v2 副本冻结 oracle 独立复跑退出0，另核原始结果、B 在 A 完成后的状态与源哈希。归档字节再次核验。大镜像 tar 不包含在本包。

| run | 实际结论 |
| --- | --- |
| v1 `20260926T215940Z-8484376a` | driver/oracle1，unverified。两任务实际完成，但 oracle 误要求在线与离线 metadata 的时间字符串完全一致。419件清单 SHA256 `eff16cac0512234145066875b8ad7f8ccb6b1a4684eec030f96a429419e55023` 保留，原失败不改。独立清理审计最初也把 missing inspect 的 `[]` stdout 误读；原 rc1／精确 not-found stderr 保留，另附解释，未篡改原查询。 |
| v2 `20260926T220832Z-c8b0c9b0` | 新 oracle 修正时间比较后另做单次实际运行，driver/oracle0、limited_pass。419件清单 SHA256 `89a5b384e34534f065eebee57498a9b0788e09febd11b300c04711deeb92804f`；root 独立复跑通过。 |

v1 中 online finishedAt 为 `2026-09-26T22:00:08.4Z`，离线为 `2026-09-26T22:00:08.400Z`。这符合既有契约：EC3 S-59 引用 OE2 Instant 的时间点语义，[HT3 S-12](../../../spec/compositions/governance-center-entry-https-json/v3/contract.md) 要求线上 UTC／最少小数位，维护 Metadata 字节投影明确允许这种规范表示转换而不改变时刻。原封装和离线元信息没有漂移。v2 只对两时刻使用合法日期校验和精确小数字符串尾零规范化，其他成员保持严格比较；不使用浮点舍入或毫秒截断。这个测量器处理本夹具的 UTC 子集，不声称是通用 RFC3339 实现。

v2 两个原 helper 的内层 PID 与 direct docker wait 子进程分别绑定确切 CID。QA 门按各自 work-dir 选择 A/B，在真实 wx／0600 import FileHandle 的首次写之前挂起；不预造无标记工作根。B 已被观测持有后32.288451833秒，两客户端仍 pending、stdout为空；两个任务 CID、名称、FD设备/inode及工作根身份各自独立。工作根0700，永久 marker0600、内容准确；owner lock 的实际模式只记录，不另加独立0600承诺。

先只释放 A，A 的原客户端及应用均退出0，返回一行 verified JSON+LF、原 metadata、businessOpen:false，并在原 CID 的日志/status 中保留。B 随后仍是原 PID/FD、工作根和 marker，maintenance-status 为 running／exitCode null／outputText为空；其 FD stat 为 `65025:239914:10001:10001:600`。再释放 B，它独立完成0；A 的原 CID/输出没有被覆盖或重新启动。源封装 SHA 始终相同，任务临时明文在各自实际完成后消失，两个永久隔离根保留。

输入摘要 `d123079eaa9d3c4e2450c3a66d265f261f1c3e1e9ce4cd40bca0876873743a71`，driver SHA256 `9dccf98b0a032ddd83a10f42eeff571006c9634f30c5607fcc986d05684224ee`，oracle `1792226fe79121e109932f9a63ae0ac50476f217e43dcf2cb7144ddd1479dd03`。3个合成正例、40个反例只检查测量器；对 v1 raw 套用新比较函数的反事实诊断不是 v1 或 v2 的实际通过。

两轮业务判断后才清理私有环境；独立唯一标签查询容器、卷、网络皆空，六个创建名称不存在。32秒只是本次可控窗口，不是产品时限。有限接受不包括任意规模并行、相同恢复目标的竞争、网络断连、物理断电或完整 Docker 交付。
