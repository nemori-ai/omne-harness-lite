# D055/D056 维护实现、制品与有限部署验证

2026-09-26，Node 24.21.0、pnpm 10.28.1，macOS arm64 与 Docker Linux arm64/amd64。依据 [D055](../../decisions/governance-online-maintenance-adoption/README.md)、[D056](../../decisions/governance-maintenance-resources-adoption/README.md)。本包保存实际执行，不增加恢复后重新开放业务的权限，也不是公司网络或整机损毁灾备验收。

[summary.json](summary.json) 列出结果与制品；[source.tar.gz](source.tar.gz) 和 [source-sha256.json](source-sha256.json) 是最终未提交源码快照；[runs.tar.gz](runs.tar.gz) 与 [runs-sha256.json](runs-sha256.json) 保存脚本、全部本轮原始成功和失败输出。早期日志针对迭代中的输入，最终源码摘要不能冒认为每次早期运行的源码摘要。旧 D053/D054 与 D055 形式模型、上游研究原文均不覆盖。

## 源码与故障验证

18 个 workspace 成员合并结果为 **1908 通过、34 明确跳过**：17 个成员来自 `maintenance-full-tests-r1.log`，host 来自修正后的 `maintenance-host-full-r2.log`（182 通过、11 跳过）。这不是一次全绿命令：原全量中的四处 host 失败完整保留，修正了 HT3 健康读法、时间字符串等价的夹具、提前拒绝无升级守卫的判据，以及新登录场景的取证标签。独立检查确认没有放宽产品断言。另有 175 项开发工具测试通过；build、typecheck、格式、20 条源码规则、导航、agent 生成检查通过。设计检查明确使用 `--formal skip`，不冒充重跑形式模型；PostgreSQL 跳过不算通过。

维护实现包括固定只读观察、有界封装与摘要、各 schema owner 的只读结构核验、在线单槽、候选目录与外中心过滤、20 小时到期/超过 24 小时逾期、文件与目录同步、不确定发布后的重确认、离线校验和只保留封装的隔离恢复。`run` 托管调用方资源，worker 消息不代替真实退出，取消不抛弃在途 IO；关闭失败保留强引用和源/工作根锁。生产打开路径拒绝永久隔离标记祖先和恢复封装。

实际进程反例覆盖 SQLite close 失败、迟到或未关闭资源、startup 失败时保锁、Cordis 吞 disposer 拒绝后的双观察槽、父目录 fsync 失败不启动 fiber、SIGINT/SIGTERM 与工作目录互斥。ops 客户端中断不撤回中心已接收的工作，也不重放。30 秒只记录 still-stopping，继续等待真实收场；存储与 controller 两槽、升级守卫分别确认。原失败和修正日志均在 runs 中。

e2e 已改为真实在线 `backup` → `verify`/`restore-isolated` → 封装字节一致 → 实际 `serve` 拒绝。备份之后撤销的登录和移除的成员在活库继续失效；后续注册与加入保留。秘密扫描同时检查完整封装和提取的 SQLite；仅测试取证副本位于带永久标记的工作根，绝不交给业务入口。

## 固定制品与独立 QA

最终 [host r3](omne-host-d056-r3.tar.gz)：SHA-256 `94e39d788f790db5f17d83bfdc1409d70d4376581862cbbe8a6a4ed635c9f181`，BUILD_ID `e8033f3bb8fda92287afe943cce5dab16994c95df0ed932b4bed932c7ca05566`。

最终 [CLI r1](omne-cli-d056-r1.tar.gz)：SHA-256 `803a4f5c7234ab7a0c0169e2c5dd4c66da669d0fc71ca633568999b739db618a`，BUILD_ID `2a7ad07c28eadac80507261e17fdda109de432b5af74b46f27e65554412213ed`。

运行主体证据使用的 [host r1](omne-host-d056-r1.tar.gz)：SHA-256 `d57549451e84b409ce6b442ea910e212d5f91ce4b5947a600af1e61b7b985ab5`，BUILD_ID `809a36c45177d66f59213659d4f01f83e98e7d039143dc61fcfc958fd4a16778`。主线和独立 QA 各核清单：host 4454 项，CLI 4426 项。r3 的 4431 项与 r1 完全相同；23 项差异逐项核对：部署说明补工作根父目录的同属主/0700 要求、20 个 pnpm `.bin` 包装只改变构建 staging 的 NODE_PATH、两项 pnpm 安装元数据仅改变时间戳。全部运行 JS、声明、source maps、依赖、package、软链与 systemd 模板同字节。BUILD_ID 识别清单，不是可复现构建或来源认证承诺。另一个独立源位置打出的 r2 造成 pnpm 路径变化，不用于本次最终交付或“只改文档”的比较；失败的比较假设保留在摘要与审计记录。

[独立 r1 报告原文](maintenance-independent-qa-r1-report.txt) 为 **Pass with issues**：45 项可判定运行检查通过，未发现产品代码阻断。包括两个真实中心、独立 CLI 登录/身份、备份与状态、坏封装/权限/符号链接拒绝、外中心未来时间过滤、本中心未来时间拒绝、实际 SIGSTOP/SIGCONT 的同工作根排他。两次初始 oracle 错误保留，不假称首轮通过。原位源变动探针无法精确定位 hash/fstat 阶段，只观察到拒绝；精确分支记 **Unable to verify**，不计入通过数。

[独立 r3 有限复核](maintenance-independent-qa-r3-report.txt) 为 **Pass**：独立清单差异核验通过，原 38 项主旅程一次通过，新 BUILD_ID 进入元信息，校验/隔离恢复及原 CLI 兼容通过。没有把 r3 的有限 Pass 扩大成 r1 未覆盖项已验证。

## 实际 Linux 服务与跨 OS

`maintenance-systemd-product-r1` 在独立 Docker 内以非 root 账号安装真实制品及三份模板，经 systemd 252.39 验证、启动、在线备份、离线校验、隔离恢复成功。给真实输入 FileHandle 的 read 加测试 gate 后，正常停机第 31 秒仍 deactivating，第二中心因源 occupied 拒绝；放行读取后正常收场。小时 timer 仅用测试 drop-in 加速触发，停止的中心未被拉起，备份单元以失败退出。不是实际每日周期、任意 IO 停止时限或物理断电验证；测试容器已清理。

`cross-os/d056-linux-center-r1`、`d056-mac-center-r2`、`d056-linux-amd64-old-cli-r1` 通过真实 TLS 的双客户端治理旅程，包括组织/邀请/隶属/角色/移除/改密撤旧登录/退出、SIGTERM 与 SIGKILL 重启、停机不伪报在线或重放写。amd64 使用旧 D054 CLI 访问新中心，业务协议 2 不因 opsVersion 1 改变。Mac 首轮一次 Docker health timeout 原文保留，原判据重跑通过，没有调大产品 timeout 或添加重放。Docker 客户端没有中心数据库或私钥挂载；不是两台物理机器或公司 DNS/防火墙验收。

## 接近容量上界的有限观察

`maintenance-load-mac-r1` 与 `maintenance-load-linux-r2` 使用真实 host 制品、当前完整 schema 和索引，停机时生成 2,950,000 个合成未激活账号，SQLite 为 **959,926,272 字节**。Mac/Linux 分别执行 2/3 次在线备份，期间 167/138 次 TLS 认证业务访问成功，观察到真实 clock 续约；完成封装离线校验。最大观察延迟约 39/257 ms，**不是 SLA**。Linux r1 的测试父目录为 0755，工具正确拒绝离线工作根；r2 只修夹具父目录 0700 后通过。数据库和容器已清理，原始结果和脚本保留。Mac r1 与 Linux r1 使用修正前脚本，差异仅为是否对已存在的 fixture 根显式 chmod。

首版仍只有同机备份；每日运行及告警检查由部署者执行，整机/磁盘损毁的 RPO/RTO 留待独立备份位置。恢复结果保持 `businessOpen:false`，没有安全重新开放、管理员找回凭据或会话续期入口。TUI 的终端/输入法范围继续沿 D054 的有限结论，不因本包提升。用户指定的最终 Claude Code `fable` review 另行记录，本包不含该结论；没有提交、推送或安装真实公司中心。
