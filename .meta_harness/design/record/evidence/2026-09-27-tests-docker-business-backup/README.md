# 业务访问与不停服备份、离线恢复的组合验证

root 有限接受运行 `20260926T221555Z-622bb20f`：备份输出句柄实际挂起期间，macOS CLI 的邀请写入与 Linux CLI 的收件箱读取均成功；备份完成后，正式原镜像执行 verify/restore，恢复封装仍不能作为生产库开放。依据为 [EC3 S-55～S-59](../../../spec/compositions/governance-center-entry/v3/contract.md#s-55-backup)、[HT3 运维绑定](../../../spec/compositions/governance-center-entry-https-json/v3/contract.md#s-21-运维面的答复) 和 [Docker 映射](../../../realization/apps/tenancy-host/docker.md)。原镜像的[正常维护路径](../2026-09-27-tests-docker-r5-smoke/README.md)及[跨系统治理旅程](../2026-09-27-tests-docker-cross-os/README.md)另有独立证据，不与本轮 QA 门混为同一运行。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`；最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，host BUILD_ID `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`。macOS arm64 与私有 Linux Engine29.1.3／Compose2.40.3，应用 UID/GID10001，CLI/host Node24.21。原 image 导入后为 `sha256:217d7b6a27aa35f1ffa02036f31544c776575f0d5ae0da45255a5ea0ed625fba`，QA image 为 `sha256:8f8b63a64ef37761e0f0ede6cda2248d570ec7f913e77ccb08ef50c6aff60b85`。QA 仅增加 /probe、NODE_OPTIONS 和测试标签；两者完整应用文件、链接、BUILD 与最终清单逐项相同。它挂起的是真实封装发布 FileHandle.writeFile，不宣称 SQLite 引擎此刻仍在导出页或模拟了物理 I/O 故障。

[原始包](raw.tar.gz) SHA256 `7e1aec25250677324f9a5778f9f061b691f304eb71e7caf4617df8553bb5d1c8`；[逐件摘要](files.sha256.json) 共395件。392件实际清单 SHA256 `9a94c38d57fe1ea4e3de6878521eb0d5ff4928096f0a5cef909442b2303777d2` 由 root 逐 hash 核对并复制，副本冻结 oracle 独立复跑退出0，另核关键原始时序和拒绝原因，归档字节再次核验。大 image tar 不归档；同一 CLI tar 已在上述跨系统原始包保存，本包仅登记其3160862字节／SHA256 `b8431b6cdb176af43fe9af2002bbc480f927fdbcf64c69c8553f6ceab08e471c`，不重复打包。

所有 `private/**` 排除在公共清单／归档外。root 在受保护本地副本使用两份未打印的临时凭据执行完整泄漏检查；公共包不包含它们，单靠公共包不能重放该检查。原始业务与运行输出、冻结脚本、输入身份、退出码及清理均保留。独立反查本轮标签的容器、卷、网络均空，六个创建名称不存在。

两账号各自注册、登录、建团队、读身份列表，并确认同一 centerId。Mac 经回环转发，Linux 经私有网络，两端 TLS 由真实中心终结；显式 minLength12 仅为测试配置。中心 ID `d662231664ec387ff22da5a86f8b49d5` 在备份前已确认，后续 metadata 保持同一身份；不要求一致快照包含晚于其观察点的邀请，也不添加离线浏览业务的新接口。

备份异步进程在 `22:16:32.237602Z` 发起；真实 PID1 FD 的设备、inode、0600及路径于 `22:16:32.869233Z` 被观察持有。随后 Mac 发出邀请，Linux 收件箱读到同一邀请，业务读取在 `22:16:34.055556Z` 已确认；此时备份客户端仍在途。`22:16:34.138263Z` 才释放门，`22:16:34.183759Z` 观察到原客户端退出0与 completed。独立 backup-status 返回 current、同一完整 descriptor、invalidCount0；full-health 五项 true、defectCount0、同 centerId。全部动作只发一次，没有靠重放备份取得成功。

正式 helper 正常停中心，真实同 CID exited0 后，verify/restore 使用原 I3 image、完整 /state 绑定、network none、不挂 serve 秘密或配置，各自真实退出0和恰一行 JSON+LF。结果分别为 verified/restored-isolated，businessOpen:false；在线与离线 metadata 的两时刻按既有时间点语义比较，线上仍核 HT3 最少小数位，其余成员严格保持。源与目标 `data.omne-backup` 的 SHA256 同为 `b6fbb6637059439cc79bd49784a4753a319a3cc9658547b134699311714f5f21`，字节数一致，文件0600、目标目录0700。

三个拒绝路径分别解释，不能混称同一个 guard：

- helper 将原恢复目标作为 state-dir，实际 `invalid-state-path`／退出1且无中心创建；这证明正式 Docker 部署布局不把恢复目标直接当服务目录。
- 原 host serve 的公开 STORAGE_FILE 指向原恢复封装，仍挂完整 /state、正常秘密与设置、原入口，不开放端口；实际 storage-open 失败原因为 `file is not a database`，应用退出1，没有 serving。
- 相同原 host 入口指向工具已经建立永久 marker 的工作根下路径，实际 storage-open 失败原因为 `isolated maintenance data cannot be opened as production storage`，应用退出1，没有 serving。

后两项只验证原 host 公开配置入口，不声称 helper 支持任意 STORAGE_FILE 覆盖。没有添加保护 marker 或藏掉祖先来伪造拒绝。工具产生的 marker 前后为同设备/inode `65025:243095`、UID/GID10001、0600、原16字节；两份封装哈希也保持。恢复目标包含封装，永久 marker 属于检查用工作根，二者按现行设计分别取证。

输入摘要 `d5ce87969859467c8e5f6b2fe0e34ff2995dcf26502f5707487f02c98fbe31eb`，driver SHA256 `1cf7fa954ddbdada5a04f6a3ee46ebc621c20c76f7df1ce9b5d5b1beabc8b098`，oracle `5f9736c802b0300bb0c5365cc54e8303ea9d33c05012e21c1b0cb9419e0ecda4`。21项离线检查仅检查测量器。有限接受不包括备份客户端失联、任意负载下的性能保证、断电耐久、恢复后安全重新开放、公司实际安装或完整 Docker 交付。
