# Docker 中心与 macOS／Linux CLI 的治理互通

root 有限接受最终制品在 arm64 Linux 中心上的两客户端治理旅程，以及固定 Rosetta 环境中的 amd64 中心旅程。依据为 [Docker 映射](../../../realization/apps/tenancy-host/docker.md)、[CLI 治理装配](../../../realization/apps/cli/governance.md) 与 [D-071](../../decisions/governance-docker-stop-adoption/decision.md)。amd64 结果明确属于仿真，不是原生 amd64 CPU 验收；本包不覆盖 TUI、人读界面或完整 Docker 交付。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`，I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`。host BUILD_ID `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`，CLI BUILD_ID `f38e46f1f169aea8993640c8ccf0ffc42545f2d64adf21f96b6658b2c83bb9f1`；两个 CLI 都使用同一正式归档，Node24.21.0。镜像分别为 `sha256:27c0665146265afefe39012aaea26bdae7499784eaaeb74aea712a6fcdfc03f2` 与 `sha256:e73d31143e092515a6c65e27a124e94c020115e9b3f7a250900a7e70d1c61280`。私有 Engine 导入后的实际 image ID 另按完整 RootFS、架构与标签核对，不假设 legacy 导入 ID 与外层相同。

[原始包](raw.tar.gz) SHA256 `4fe5fd52f7d9c4914c931295b3a6f3d47771843d06a5e804f7af84d04a65672c`；[逐件摘要](files.sha256.json) 共2547件，保留六轮原结果、冻结工具、配置与输入、CLI归档、原始命令输出、退出码、镜像及容器 inspect、进程测量和独立清理。大镜像 tar 不在包内。root 分别逐项核对实际清单并复制，对两个通过轮次独立复跑冻结 oracle，再核归档字节。

**私有输入限制：**各轮 `private/**` 均不归档，里面包括临时测试凭据和客户端状态。root 在受保护本地副本使用未打印的两份临时凭据复跑泄漏扫描；公共原始包不包含它们的字节或摘要。独立重放冻结 oracle 的完整泄漏检查需要原临时输入，不能声称仅靠公共包即可重复这一步。其他原始业务、运行及清理输出均按清单保留。

| 工具／run | 实际结果与后继处理 |
| --- | --- |
| v1 `20260926T204032Z-bfae1c01` | docker exec 在 control 的 /tmp 创建目录成功，docker cp 却找不到目标，未进入业务。原185件保留；后继将 Linux QA 素材放到普通 rootfs 的 /opt 私有目录。没有宣称已定位 systemd 的全部原因。 |
| v2 `20260926T204754Z-c5556093` | 两系统 health 成功；注册因没有配置凭据政策而被拒，另有测试记录标签重复。原246件保留；后继显式配置 QA minLength12 并拆分标签，不改变产品默认。 |
| v3 `20260926T205619Z-7ff1477c` | 业务走完，但 oracle 误把 proc comm 的 MainThread 当成错误可执行程序；后续诊断还发现 logout 与日志通道判据错误。原408件和失败结论不改，诊断不算通过。 |
| v4 arm64 `20260926T211436Z-392c69a5` | 新采真实 exe/cmdline、核正确 logout 语义及两路日志；159条原始命令、43步旅程，driver/oracle0。原420件清单 SHA256 `112c2f0eff3be4c905a71c356781f42d8ae35b110ca4e1bf5846df13771ab384`；root 独立复跑通过。 |
| v4 amd64 `20260926T212021Z-3e766912` | 业务走完，但固定 Node exe 判据不能解释外部观察到的 Rosetta exe/shim。原828件清单 SHA256 `7ab6cab0816df37f0dc0c8704b016ee0bceb07a8b269248df472899f9fced0bd` 保留为失败，不翻为通过。 |
| v5 amd64 `20260926T213900Z-09f23948` | 新增具名 Rosetta 观察器后重新单次运行；167条原始命令、43步旅程，driver/oracle0。原436件公开清单 SHA256 `a599f64bcbcb41640297a849aa986040ae1b41d62532e844c26250b3548a7401`；root 独立复跑通过。 |

中心运行在唯一标识的私有 Linux DinD 中，control 不挂用户宿主 Docker socket。Mac 通过宿主回环临时端口访问，Linux CLI 从 control 访问 DinD 私网；只做 TCP 转发，TLS 始终由正式中心终结。测试 CA/SAN 覆盖这两条路径，不代表公司 DNS/CA 部署。固定测试政策为 `OMNE_TENANCY_CREDENTIAL_POLICY={"minLength":12}`。

两个账号分别注册、登录、建团队、切换身份；实际租户列表及操作核对账号和组织隔离。跨账号邀请接受后获得对应身份，成员升级／降级改变超管操作结果，退出团队后不能继续成员操作。成功 logout 的正式结果是 reenter-required／CLI退出4；下一次读取是未登录、本地阻断、未发送，不误判成功退出应返回普通业务0。两系统错误 CA 均拒绝且不降级；TLS1.2 负例要求真实 peer protocol-version alert，排除连接失败或握手成功后的 EOF。

正式 helper 正常停旧中心，独立 inspect 核 exited0，保留原 CID 两路日志及运维导出，再删除该容器并用相同 state 重建。新 CID 不同，centerId 及已确认组织／身份事实不变。同库第二中心实际遭占用拒绝，原中心 full-health 五项均 true、defectCount0。旅程末再次正常停止，业务判定在夹具清理前完成。各轮独立按唯一标签反查容器、卷、网络为空，六个创建名称不存在。

arm64 实际 PID1 exe 为 `/usr/local/bin/node`，NUL argv 为原 `node /opt/omne/app/dist/cli.js serve`；comm 的 MainThread 只作诊断。amd64 仿真中，前后中心外部 exe 均为 `/run/rosetta/rosetta`，argv 精确包含 `--no-opt -r /proc/.reset`；同 PID1 maps 含 Node 与 Rosetta 可执行段，UID四列为10001。Node 文件 SHA256 `7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c`、ELF machine62、运行时 x64/Linux/Node24.21 均匹配；reset 原字节 SHA256 `86c6676bd07477697e8aed12348041dc1ef6bdeee70bdd4d346dd1ce2e27aacd`。这些精确条件来自本包的固定镜像只读观察及实际 raw，不扩展为 Rosetta 通用保证；--no-opt 也不支持原生性能结论。任何其他翻译器、flags、shim 或缺映射均拒绝。

v5 输入摘要 `390c08ada3317fe3c6669b91914ab42b921f6adf142f77bdcb922ab2a0028713`，driver SHA256 `5e2857935db344c88caba685e84ecf5fff255947e8ba059f10fd9e834677842a`，oracle `2eeb804259923df7675a091850b60eb177346e97533db48497ffe54b21b539ba`。原40项与新增13项合成负控仅验证测量器。未覆盖业务并发备份、全部安装负例、运行中断电／daemon 损坏、原生 amd64、公司部署或独立灾备，不据此关闭这些义务。
