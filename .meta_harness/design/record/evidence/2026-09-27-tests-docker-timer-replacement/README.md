# 定时器与同schema镜像替换的实际顺序

root 有限接受 v2 运行 `20260927T015021Z-9746a05a`：新镜像验证、暂停实际systemd timer、旧中心确认停止、新镜像启动及健康/治理事实核对、再恢复timer的操作顺序已实测。依据为 [Docker升级映射](../../../realization/apps/tenancy-host/docker.md)及[D071](../../decisions/governance-docker-stop-adoption/decision.md)。这是支持的运维步骤，没有新增自动升级或timer协调服务。

原最终helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`，新I3 manifest `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`。旧cad70及新f8镜像、CLI和公开治理旅程沿[原恢复B输入](../2026-09-27-tests-docker-recovery/README.md)。实际环境为macOS arm64上的私有Linux Engine29.1.3、Compose2.40.3、systemd252；不是原生公司部署或新schema迁移。

[原始包](raw.tar.gz) SHA256 `77fdf6abece77c6ab703b72eb12ac50e697a7c75759f34e534601f463a5a3f21`，[逐件摘要](files.sha256.json)共666件。v2原381件清单摘要 `983872ffe913829053a6575f4dc886b9d8491cebba306e70185f6f5e13d346da`；root执行审定工具，独立复跑冻结oracle退出0，复核关键systemd观测后复制核对归档。原始输出与退出信息齐全。

旧中心健康且公开账号、组织、当前租户事实已确认后，实际timer为active/waiting。新镜像validate完成时旧CID仍运行；停止timer并实际读到inactive后，才执行旧中心正式stop并核应用0。新中心采用不同CID、精确新image/BUILD，旧日志与元信息已导出，原治理事实和full-health通过后，才恢复timer为active/waiting。最后先停timer，再正式停止新中心；清理不替代这两个应用停止事实。

原timer/service文件逐字节未改。唯一QA drop-in将OnCalendar清空，改为OnActiveSec600s、Persistent=false，使短测试不被另一次调度干扰；其原文、加载路径及有效属性均记录。整条链LastTriggerUSec保持空、service调用时间和InvocationID不变、service日志为空，因此本轮没有定时任务插入升级。激活及恢复后的NextElapseUSecMonotonic均有实际有限时刻，停止态为infinity。本测试不验证600秒周期或修改生产每小时调度承诺。

v1 `20260927T014239Z-a5a54ed6` 在序列前失败：systemctl252省略了空数组TimersCalendar，而测量器误要求该行存在。其余九个属性齐全，283件清单摘要 `c1778c4da6303e768c3de749bd107816e3ca62122fbc888749021fea0aa690b4`和原失败保留。v2仅允许该项省略，原raw保留缺席；出现时仍须空，其余字段须完整，并结合原单位、唯一精确drop-in及实际未触发事实判断，没有补造返回值。

v2输入摘要 `80b57424847d8d5a26a92567eb60b349eaf6dcd89d0490e1350e60cff0505f37`；两个合成正例和八个错误反例只验证判定器。两轮root独立反查均确认私有容器、网络、卷的标签查询为空及六个精确名称不存在。本轮不执行失败升级、自动schema回滚或物理故障；启动失败的真实停止与非零返回仍单独引用[既有C证据](../2026-09-27-tests-docker-startup-expiry/README.md)，不能冒称一次组合失败升级。
