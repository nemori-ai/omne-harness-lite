# Docker 最终制品首轮 helper 启动验收：失败

固定源码 `cad70bb799cc1e4b949a27858b6a16e92ec2938f`；消费 [D-071](../../decisions/governance-docker-stop-adoption/decision.md) 的部署绑定。独立验证者只执行一次冻结调用，run `20260926T191856Z-f3b18dbd`。`validate` 返回 `deployment-structure-valid`；`start` 在创建容器后、启动应用前返回 `actual-container-unsafe`，driver 退出 1，记录为 `observation-incomplete`。

受测 helper SHA256 `0602a52ef521a3a41971097e80c560db2fb24cc69cb2d5098634f81774bd156d`；host BUILD_ID `b921f14cdac3a3246a32b0745794e8e36b2e8a5e37c37cdd32fee18db918479b`；linux/arm64 image `sha256:1bf9d98472460e63750f192b02fb0c062f2dc912e5ed248f73da1107a2a7c895`。Linux 测试控制宿主、私有 Engine 29.1.3／Compose 2.40.3、自定义 UID 10023／GID 10024；外层运行在 macOS Docker Desktop，未触碰用户的其他 daemon、容器或部署。

[原始记录包](raw.tar.gz) SHA256 `3200b64e27136610989fd2858634945da094ace8f6055cf62095e8a8f7a02a0b`，[逐文件哈希](files.sha256.json)。包含冻结参数、受测 helper／Compose／timer、oracle、每条命令原始输出、实际 inspect、逐项诊断与清理。root独立复核原始174件文件并保全，另附此次事实读数和实际测量器源码。大体积镜像归档不在此小包中，精确 image／BUILD 身份不能被理解为本包单独可还原该镜像。

已创建容器的 `Mounts` 实际只有 `/state` 和只读 `/secrets` 两个 bind，`HostConfig.Tmpfs` 含正确目录和选项。helper 的19个实际配置判据中，“Mounts数量为3”和“Mounts含该tmpfs”两项失败，其余17项成立；该观察交回实现者修复，未通过修改独立 oracle 将失败转为成功。

夹具清理成功，独立按本轮精确标签查询容器、卷、网络均退出0且为空。**应用启动、健康、在线备份、离线验证／恢复、停止和timer均尚未进入，不能据本次推断成立或失败。** 清理完成不等于业务验收通过；后续修复与重跑必须记录新源码、制品和运行标识，不覆盖本次原件。

后续局部修复 `5f7c9e6fb34566cf1f2e8ad3b802cdfc11f03996` 的[检查原件](fix-checks.tar.gz)（SHA256 `ae98a182a3fe904257bb39d2d053f4b0b10d6d719298c4f0edf2a6a9e024d3b0`）与[清单](fix-files.sha256.json)另存，不改写上次运行。新helper SHA `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365` 校验两个bind、唯一tmpfs键和精确六项选项，拒绝重复、额外或UID/GID子串误匹配。root审阅全部变更、复核worker日志与源码，并在HUB运行4文件22项、typecheck、docs检查通过；另外只读重放原实际inspect通过，两个UID/GID变异拒绝。重放时image verifier被stub，仅验证配置映射，不代表新容器运行。root接受此局部修复；最终制品须重建，真实QA仍待。
