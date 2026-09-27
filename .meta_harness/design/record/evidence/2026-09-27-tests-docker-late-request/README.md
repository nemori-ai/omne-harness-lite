# 调用者消失后，原停止请求晚到

root 对运行 `20260927T013409Z-1d405f02` 的完整原始观测作有限接受：原 helper 消失且本地生命周期锁可取后，仍有未结算请求；只读状态不消除该不确定性；原请求随后到达 Engine 并停止原容器，原调用仍没有成功结果。依据为 [Docker R4/R5](../../../realization/apps/tenancy-host/docker.md)关于未知请求和人工接续的义务，以及 [D071](../../decisions/governance-docker-stop-adoption/decision.md)。没有新增持久意图协调器或自动重试规则。

**这是对既有观测的追加复核，不是一次新的产品运行。** 原运行的 driver 完成107条命令与业务观测，冻结 oracle 因错误比较内外 Engine 的镜像ID而退出1；其原始失败、stdout/stderr和退出码保持不变。新判定器修正镜像身份关系后，root 在独立副本核完输入、原始命令流、因果事实和清理结果，作本页有限接受。

产品源 `f8f286c95cb9458fe3173190edbeab6076339b08`，I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`。环境为macOS arm64上的私有Linux Engine29.1.3，原最终应用与helper运行，无应用注入。QA只在控制容器的Unix socket代理中保留一个确切CID的SIGTERM请求，转发真实只读响应；代理不挂宿主Docker socket，没有网络监听，不自动释放或重试请求。

[原始包](raw.tar.gz)及[逐件摘要](files.sha256.json)保留两次原始运行、v3判定器、追加复核脚本与root结果；包摘要在后者顶层 `archive_sha256`。v1 `20260927T012616Z-5c8f416b` 因QA客户端以文件形式执行却按 `node -e` 解析参数而失败，未进入停止或故障信号，415件原清单摘要 `baa3326d89382d313a26dec3d9038d40cb1eb5ae73e0f211a313bda4da4f8107`。v2修正该一行后取得完整观测，304件清单摘要 `2d87ec413bebb1fbbdf7ef1c4fc618bbc410e1f5decf426ec01f223b0584bd29`。root均逐件核对复制，原失败不改判。

v2的确切中心 CID `3f9c2eb2deaa54a7f64d54f4a94e84c1e4f14c20729da2a98dd43e26e32c53cc`。原helper PID1338及其唯一直接子进程Docker kill PID1508由原始cmdline和父子关系绑定。代理记录原POST SIGTERM但尚未转发；随后只终止helper，再断开其原连接，确认helper及子进程消失、原锁inode无持有者，并实际成功取得和释放非阻塞flock。

此时原中心仍以同PID/StartedAt运行，直接status/full-health正常；代理仍有一个待处理请求、forwardCount0，Engine尚无kill事件。显式QA释放只转发那一个原请求，取得真实204响应及同CID的一次SIGTERM事件；真实wait返回应用0，inspect核同CID exited0。原helper外层观察137、stdout为空；没有新的start/stop，没有重新发送原请求，也没有向已死亡调用者补造成功JSON。最终状态只说明当前事实。

v2误判在于：外层OCI image ID为 `sha256:27c0665146265afefe39012aaea26bdae7499784eaaeb74aea712a6fcdfc03f2`，同一制品载入私有Engine后的ID为 `sha256:217d7b6a27aa35f1ffa02036f31544c776575f0d5ae0da45255a5ea0ed625fba`。v3分别核各自ID，要求完整RootFS、平台及采用标签一致、2851个应用文件和115个链接的原清单保持；运行时start/inspect/status绑定实际私有Engine ID。其余生命周期判据未放宽。

v3 oracle SHA256 `f97580e8436fa4d46f406db8ae91468e7e46101daf900b568a85056a162d68cb`。追加复核验证18份原冻结输入、214个命令流和275个run文件，前后run快照摘要均为 `d4a41031096105cb0f3a1fe505cd5e9bdde3998d5739478d1db710f7c5c1784c`；原oracle摘要 `05b0adff37e57f36e990e759f9a297df2ad99a502764b9ab78aec2f04db00413`及退出1仍在。root独立重放追加复核得到limited-pass；1个正例、32个反例仅验证判定器。归档按原相邻目录名排列，可从 `docker-late-request-v3/recheck_existing.py`重放只读复核。

两轮清理后，独立查询均确认三类标签资源为空、六个精确资源名不存在。结论限本次可控请求延迟、失联与实际完成窗口；不包含任意网络故障、Engine停机、分布式协调、物理持久性或Docker整体交付。此证据说明为何锁释放和一次状态查询不足以解除unknown，不提供自动解除unknown的工具承诺。
