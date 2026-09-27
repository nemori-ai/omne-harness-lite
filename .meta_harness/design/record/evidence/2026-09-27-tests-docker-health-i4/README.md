# D072 新镜像的正常治理与外层超时验证

本次验证消费 [D072](../../decisions/governance-docker-health-binding/decision.md)，产品源码为 `b88da2da9e7bb30bd23a6dc097631e987bca319b`。root 审核固定输入并实际执行，独立 Sol xhigh QA 编写测量与判定设施、复核原始结果；[独立报告](final-assessment.md)记录逐项边界。这里只接受下述有限观察，Docker 整体交付仍待 Fable 定向复审与 root 最终验收。

I4 清单 SHA256 为 `14c1e85d561e844338c866976c8a01db7f2fbb87a5fbce93ed36bd1f9a646c25`。host BUILD 为 `becc64049cec8200e4af8a4589282127f3ff4ff9c843a2107eca31f361bac8b7`，CLI BUILD 为 `877de31f102e5bf86dac95bf78c777f868fe4797ff9982e9b91c9103fbb88f1c`。官方脚本构建、保存、重新载入 arm64/amd64 镜像；root 独立核验归档 SHA、完整应用清单、BUILD、源码与部署文件。原始镜像归档保留在清单指定的本地制品位置，本证据包保存其摘要、构建命令和原始输出，不包含约 2.35 GB 的镜像文件。

与 I3 的逐件比较中，host 的直接源码差异为 health.mjs 与操作 README。dist 下的 JavaScript 字节和逻辑链接不变；其他差异精确对应检出／打包暂存路径、pnpm 路径编码及两项时间戳。比较没有改写真实归档或 BUILD。第三方 `.bin` 中存在旧包已有的暂存绝对路径，其可移植性未验证；本次实际检查的是支持的产品入口。旧 I3 的故障矩阵保留旧身份和原覆盖范围。

| 实际运行 | 结果与范围 |
| --- | --- |
| N arm64，`20260927T034715Z-bf56db1b` | 私有 Linux Engine 内原镜像，96 条命令；正式 helper validate/start、真实 Engine healthy、完整 HT3、Linux 封装 CLI 注册／登录／当前身份／创建组织、备份及状态、真实文件属主与权限、同容器正常停止 exit0。追加修正判定通过，原判定失败保留。 |
| N amd64，`20260927T035257Z-8464b246` | 同一精简正常流程，100 条命令，判定与清理通过。使用已明确的 Rosetta 适配并核对实际可执行文件、命令行、映射、重置脚本、UID 与 Node ELF；不称原生 amd64 硬件验收。 |
| C arm64，`cancel-20260927T035032Z-e28b2958` | 原镜像、原健康命令和公开 main，QA socket 服务端暂不应答。实际请求已在途，Engine 记录外层 2 秒超时；原探针 PID 13／startticks 535861 消失，未观察到遗留后代，迟写得到 EPIPE，精确标签资源清理通过。详见[原始观察复核](case-c-assessment.md)。 |

C 的服务端是 QA Node PID1 夹具，不是治理中心；N 补足真实中心组合与完整响应。环境为 macOS arm64 上 Docker Desktop 29.1.3，私有 Linux Docker 29.1.3／Compose 2.40.3，Node 24.21.0。C 的显式启动宽限期为 1ms，实际 inspect 为 1000000ns；外层期限 2s 短于探针内部 5s，判定同时要求真实请求和实际超时，未用参数配置代替发生事实。

失败与追加复核均保留：首次 N 缺少 root 的 Node 24 环境，进入治理前失败；完整 arm64 N 的旧判定误把 `/proc/1/comm` 当成可执行文件身份，实际值为 MainThread。追加判定只将线程名称改为观察值，保留严格 exe／argv／UID／Node 检查，236 份原文件前后摘要不变，root 独立重放通过，没有重跑产品或覆盖原 FAIL。两个完整 N 的继承字段 `business_complete=false` 未由测量器更新，不用它声称成功，结论来自原始命令、Engine 状态、判定和清理。C 两次先导分别因 0s 继承镜像 30s 和 1ns 低于 Engine 最小 1ms 而失败；原输入、输出和清理都保留。

本轮未重复旧故障矩阵、完整跨 OS 旅程、隔离恢复或 TUI 操作，也不增加公司真实网络、原生 amd64、物理断电和独立整机灾备的验证声明。离线判定器的一正五负检查仅检查测量逻辑。

[原始包](raw.tar.gz) SHA256 `1b575c44f88903462e8744b199648d35897859056e790ce9a99b9032b6f64b3f`；[逐件摘要](files.sha256.json)共 900 件，含生产输入与日志、六次实际尝试及冻结测量代码、追加判定、root 检查与独立报告。临时私钥和凭据目录未纳入，原始公开输出未改写；绝对位置依赖沿原场景读取，不声称归档可在任意机器直接重放。

后续事件：固定本记录后的 Fable 定向复审已完成，root 结合继承证据作出[M0 限定技术验收](../../proposals/governance-docker-deployment/review.md#i4-定向复审与-m0-技术验收--2026-09-27)。该后续结论不修改上面各次运行、原 FAIL、归档字节或未覆盖范围。
