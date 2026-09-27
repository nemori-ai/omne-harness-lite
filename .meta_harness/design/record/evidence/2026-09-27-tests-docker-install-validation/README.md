# Docker 安装坏配置与真实挂载拒绝

root 有限接受 v3 单次运行 `20260927T012156Z-a7880e59`：原 helper 的 validate/start 对10类无效配置分别拒绝；另以真实 Engine inspect 验证原 `validate_actual_center` 能区分正常与多一条绑定挂载的配置。后者是组件故障探针，不声称一次完整 start 拒绝了外部预建容器。依据为 [Docker 装配](../../../realization/apps/tenancy-host/docker.md)及[D071](../../decisions/governance-docker-stop-adoption/decision.md)。

产品源 `f8f286c95cb9458fe3173190edbeab6076339b08`，I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，helper `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`。macOS arm64 上的私有 Linux Engine29.1.3／Compose2.40.3，配置应用 UID12017/GID12019。使用原最终镜像、真实 Docker/jq/stat/realpath，没有替换其返回值。

[原始包](raw.tar.gz)与[逐件摘要](files.sha256.json)保留三轮原件及 root 的独立重放输出，包摘要在后者顶层 `archive_sha256`。root 逐项核对原清单并复制，v3 副本冻结 oracle 独立退出0，另直接检查10项 start 的实际具名拒绝。大镜像按固定输入摘要引用，秘密文件不归档。

| run | 原始结果 |
| --- | --- |
| v1 `20260927T010856Z-c602856a` | 测量器复用镜像导入代码却缺少 `cli_build_id`，在安装用例前失败。159件清单 SHA256 `42205be431476cc6ac50c319cd89f40545c313305d16fe454679ea31f0cef5e5`。 |
| v2 `20260927T011424Z-97396925` | 249条命令取得安装与挂载观测，冻结 oracle 因 Config.Env 数组顺序变化失败。683件清单 SHA256 `88cc77a3d7502fb5260473f73983e3c3474eefc5eaf6e4547c9f6f070ffb803a`，原失败不改。 |
| v3 `20260927T012156Z-a7880e59` | 新判定器另行单次实跑，249条命令、driver/oracle0，root有限接受。683件清单 SHA256 `b8ff43fe54887cf815c301c4755fc5e22238aef31999a4c868aa5711b133b937`。 |

拒绝项为 UID0、data目录0755、错误属主、秘密文件0644、state软链、祖先软链、祖先隔离标记、缺必填设置、未知STORAGE_FILE设置，以及COMPOSE_FILE覆盖。每项都取得变更前、错误状态与恢复后的文件元数据；validate/start须精确退出1、stdout为空且匹配预定诊断，项目及精确容器名不存在；恢复后正常validate须成功。祖先标记是本轮刻意制造的无效安装配置，不冒充恢复工具产物。

组件探针创建两个从未启动的真实容器：正常配置与只增加 `/qa-extra` bind 的配置。原 state/secrets 完整挂载记录一致；原 helper 源被加载后直接调用其未修改函数，真实 inspect 字节经 stdin 传入，并核输入源路径、摘要和参数。正常返回 actual-container-valid/0，额外挂载返回 actual-container-unsafe/1。完整生命周期正常案例另见[helper启动](../2026-09-27-tests-docker-helper-start/README.md)和[跨OS治理](../2026-09-27-tests-docker-cross-os/README.md)。

v2两份实际 Env 各21个唯一键，键值映射完全相同，只是顺序不同。v3按本装配的具名变量语义比较完整键值映射，严格拒绝非法或重复键，原值不改；其余配置、挂载与调用判据保持。对旧raw的新判定器诊断仅用于定位测量错误，不能将旧v2改判为通过。v1修复只补固定manifest已有的CLI BUILD元数据，没有执行CLI。

v3输入摘要 `d341bd0350018a2313d7149bb302800d5d18c77ba355aefbc1b803a8d39c9192`，driver SHA256 `23304925dac922a6bb2abb095091020431fd601ea3aa0db97297e59acc2407da`，oracle `ecf790ff229c419b07a28b66c73b05e5514f0b87d93dc34c3cde294edc60dbc7`。29项离线检查只检查测量器。三轮均完成私有资源清理；独立标签查询三类资源为空，六个具名资源明确不存在。早期审计对不存在对象 stdout 的空白解释错误保留原记录及修正说明，不修改查询结果。

范围限本轮Linux文件系统、这10类配置及一个真实额外挂载反例；不覆盖任意LSM、文件系统、全部配置输入组合或完整Docker交付。
