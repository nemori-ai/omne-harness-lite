# Docker R5 实际正常运维纵线

root接受源码 `f8f286c95cb9458fe3173190edbeab6076339b08`、[D-071](../../decisions/governance-docker-stop-adoption/decision.md) 部署绑定下的**有限正常运维验收**，不代表整个Docker交付完成。受测helper SHA `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`，host BUILD_ID `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`。首次错误挂载校验及修复另见[前一记录](../2026-09-27-tests-docker-helper-start/README.md)。

最终I3 manifest SHA `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`。root以独立脚本核host／CLI每个文件、内部链接、额外项、BUILD_ID、归档内字节，以及两镜像归档摘要与实际image身份；54份生产日志和9份部署材料hash一致。arm64镜像 `sha256:27c0665146265afefe39012aaea26bdae7499784eaaeb74aea712a6fcdfc03f2`；amd64版本／Node／UID探针使用Docker Desktop的arm64宿主仿真，本记录的真实helper纵线仅跑arm64。

[原始包](raw.tar.gz) SHA256 `6ed17197f052d8a4a848ea1f3c72bf7d1d8e0910ab51f226a15e748faf243a80`，[逐件摘要](files.sha256.json)。包内分开保留以下三次执行，原测量器与输入不覆盖。大镜像tar未放入此小包，仅保留精确身份和摘要；仍在交付工作树由后续QA消费，不能称本小包足以独立还原二进制。

| run | 实际结果与边界 |
| --- | --- |
| `20260926T194210Z-e35ed6f7` | 启动、健康、备份、验证／恢复返回成功后，测量器误查target目录的隔离marker失败。实际设计marker属于维护workRoot，target只含原备份封装。保留203件原件；timer／stop未进入。 |
| `20260926T195422Z-cacce7db` | 修正路径并实测marker及原封装字节相同；第一次真实timer、正常stop及初始exited拒绝均完成。第二timer之前多余reset-failed因unit已卸载而失败，第二timer未触发。保留267件原件。 |
| `20260926T200041Z-cf0e82ba` | 删除无必要的fixture reset-failed；driver和独立oracle均退出0，root逐hash保全303件原件，并在副本上独立复跑冻结oracle通过。两个timer均实际触发，夹具清理与独立精确标签查询通过。 |

最后一轮的Linux控制宿主为root，应用为UID10023／GID10024；私有Engine29.1.3／Compose2.40.3／systemd252。应用启动后直接观测 `/proc/self/mountinfo` 与目录stat：唯一tmpfs、`rw,nosuid,nodev,noexec`、正确UID/GID和0700。普通Mounts为两个bind，secrets只读，固定tmpfs配置独立核对。正常backup/status、无服务密钥的verify／restore原JSON与metadata一致；工作根marker普通0600且内容准确，target目录0700、封装0600并与源完整SHA相同，`businessOpen:false`。

实际运行中的timer新触发后service为success／exit0；随后helper仅一次SIGTERM，等待真实同ID exited／ExitCode0再返回clean。对初始exited再次stop返回非零的stop-intent-unconfirmed。中心停止后timer再次触发，新ExecMain时间、service exit1／failed；中心同ID仍exited0，StartedAt不变，事件只有signal15的kill和die，无start。timer测试仅以QA OnActiveSec=2s、90秒观测窗口加速，原生产service保持不变，**未等待原每小时墙钟到点**。停止timer之前采集完成状态，避免systemd对已卸载unit遗失统计；未用缺失统计推断成功。

每轮业务判断与强制fixture清理分开；外层容器／卷／网络按唯一标签独立查询均空。未操作用户的其他Docker资源。有限通过**不覆盖**长IO／close失败、第二owner、离线取消／失联／并发、daemon重启／强杀、业务并发backup、Mac/Linux真实治理互联、升级、公司DNS/TLS安装、整机损毁灾备或最终Fable整体评审。旧I1探针不提升为这些项目的最终通过。
