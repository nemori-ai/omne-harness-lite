# Docker 正常停止与镜像替换的有限验收

root 接受以下两次真实运行的有限结论：支持入口正常停止后，健康私有 Engine 重启不使本次中心复活；同 Schema 的新旧制品替换保留已确认治理事实，并由正式 helper 导出旧容器工程记录。依据为 [D-071](../../decisions/governance-docker-stop-adoption/decision.md)、[Docker 映射](../../../realization/apps/tenancy-host/docker.md)，其余停止／升级／故障义务不因本轮通过而消失。

受测产品源码为 `f8f286c95cb9458fe3173190edbeab6076339b08`，测试工作树 `a91b889750d2cd819bf066b0e950bb9225fffdd4` 只增加前序证据、产品字节不变。最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`；最终 host BUILD_ID `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`，CLI BUILD_ID `f38e46f1f169aea8993640c8ccf0ffc42545f2d64adf21f96b6658b2c83bb9f1`。

[原始包](raw.tar.gz) SHA256 `468deee99e91f2da9352e8b86d0c2a83f24dbe798047ec7eb160c7f3fa9c1750`，[逐件摘要](files.sha256.json) 共 592 件，分别保留 A/B 配置、冻结工具、raw stdout/stderr、实际退出码、inspect、判定与独立清理检查。root 分别逐件核对 A 的 248 件和 B 的 333 件原始清单，复制后独立运行冻结 oracle 均退出 0；归档后再次核对 tar 内字节。大镜像 tar 仅保留固定摘要与外部原件，不包含在本包；B 所用 CLI tar 的冻结副本包含在包内。

运行环境：macOS arm64 上 Docker Desktop 的私有 Linux DinD Engine29.1.3、Compose2.40.3、systemd252 控制容器，控制方 root，应用 UID10023/GID10024。没有宿主 Docker socket 进入控制容器，没有外层网络端口发布。私有 legacy Engine 导入后的实际镜像 ID 与外层 I3 ID 不同，逐一核对原始层、平台、版本和 BUILD 标签后，helper 使用实际内层 ID；不把相同标签单独当成相同制品的证明。

| 运行 | 原始结果与接受范围 |
| --- | --- |
| A `20260926T205335Z-66387b1e` | driver 0、冻结 oracle limited_pass。helper 正常 stop 同 CID，真实 exited/0、clean:true；只重启本次唯一标签的 DinD，其容器 ID、metadata 卷与 Mounts 不变。Engine 恢复后，同中心 ID 在 11 次检查、首末原始开始时间跨度 10.169118 秒内持续 exited/0、StartedAt 不变、RestartCount=0；查询无 start 事件。 |
| B `20260926T205742Z-45affc19` | driver 0、冻结 oracle limited_pass。旧 cad70 制品 BUILD `b921f14cdac3a3246a32b0745794e8e36b2e8a5e37c37cdd32fee18db918479b` 启动后，最终 CLI 经真实 TLS 注册、登录、建团队、切换身份；旧中心正常 stop/exit0，再由同一新 helper 换到最终镜像。新容器 ID、image、BUILD 与状态均正确，centerId 与公开 `tenant current/list --refresh` 的已确认事实保持一致；新中心最后也经 helper 正常 stop/exit0。 |

A 的前提仅为本次 Engine 元数据健康且无并发 shutdown 或外部管理动作；Docker 事件历史可能在 daemon 断点不连续，无 start 事件只是辅证，不能替代真实 ID/StartedAt/RestartCount 和持续观察。它不覆盖非零退出后的重启、未按支持入口停止、Engine 存储损坏或任意时长。

B 中旧镜像自带的旧 helper 没有执行。新 helper 的真实 stderr 先报告 `operations-exported`，后发新中心启动请求；导出目录及父目录 root0700，三个普通文件 root0600。metadata 为完整 pretty JSON，旧 CID、实际 image、BUILD、exited/0、FinishedAt 与原 inspect 一致；stdout.log 实际为空，stderr.log 为 5089 字节，两流与停止后直接取得的原容器日志逐字节相等。空日志在 GNU stat 中显示 `regular empty file`，不误判为非普通文件。

B 显式使用私有测试凭据政策 `minLength:12`，在旧中心启动前写入测试 settings 并读回；这是测试配置，不是产品新增默认。随机测试凭据只通过私有文件传入，未写入 argv，记录输出经过凭据字节泄露核查。业务事实全部通过公开 CLI 读取，未直接修改业务 SQL。

测量器 driver SHA256 `521c952b2930460cb68d6e98294e86272d4f45f1f09af4f94c49901bb0de6926`、fixture `42ada54c8a9c5248206fb2a3e6927e55303c1db59298393e23728e371e66a56c`、oracle `2481d05268ae8a44e6a35664bc2aeb06cbc2fede9dcd08c196bef4050a8e53a4`。A 输入摘要 `73436a2cefae0932312c37604ebbc562314c2e4400a85991cf42741512a19d66`，B 输入摘要 `c221ea5e81a65acd8b105860e61ea36a506ca5d26405c2c65e828c85cbcab358`。28 项离线正负例及 root 副本复核属于测量器检查，不替代这两次实际运行。

两轮业务结算先于夹具清理；各轮独立外层标签查询容器、卷、网络均空，六个创建名称均确认不存在。有限接受不含新 Schema 迁移、timer 停复链、启动健康观察超时、运行中强杀／daemon 失联、旧请求晚到、离线维护取消、跨 OS 治理、原生 amd64、公司实际安装或整机损毁灾备。整个 Docker 交付及最终 Fable 整体评审尚未完成。
