# R1-T3：治理客户端公共定义与 CLI 生命周期

本次接受的产品候选为 `69492d46c10ec27bbc6943c7194d8be2d7b259d2`，实施 BASE 为 `beef18017170eb70cae2c6bf3afb121b18a0139e`。三个客户端能力分别具有 core 公共定义、限定名称提供者及 `./cordis` 绑定。CLI 通过同一 assembly-lifecycle 装配，公共操作、Schema 及实际消费者同步迁移。

## 实际验证与保持范围

| 范围 | 结果与限制 |
|---|---|
| 独立 L3 QA | 40 原标准加 7 CLI 差量共 47 项 Pass，判决 Pass with issues。539 个所选测试通过，0 失败、0 跳过；418 为客户端及 CLI，14 为共享生命周期，21 为 host 生命周期，86 为规则。不是全仓或完整 host/server 测试。 |
| 能力、业务与数据 | 56 个原导出去向接续；232 个具名体中 208 原样、24 采用变动、0 缺失。650 原断言中 639 原样、11 仅适配工厂参数。3 Schema 字节、URI 和引用保持，客户端仍消费 EC2/HT2。原 CAS、身份捕获、远端成功后本地失败及退出优先级保持。 |
| 实际旅程 | 固定 EC2 对端经真实 TLS 验证 31 路由及 34 CLI 动作；另外 14 项真实 tenancy-host SQLite/TLS/Unix/CLI 场景通过。前者不能写成 31 条完整真实中心业务旅程。 |
| 生命周期 | 52 项机制观察覆盖重入 close、完整工作登记、真实提供者替换、启动前缀、强撤 CLS 后迟到 TLS/CAS，以及输入/输出/恢复的完成门。CG close 拒绝没有被转成静止许可或资源释放。 |
| 四层入口 | 7 个纯根的源码、工作区声明和实际 tarball 声明共 21 个不同闭包通过。7 个实际 tarball 运行边界、7 个外部 cordis 入口与外部类型消费通过。12 个实际 tarball 及其依赖输入保全。 |
| 终端 | 5 项入口/非 TTY 检查及 4 项真实 OS PTY 生命周期场景通过。仅覆盖 xterm 40×100 和有限 DECRQM 设施，不是完整 GUI/IME/尺寸/宽字符/resize/scrollback/SIGKILL 矩阵。 |
| 有限模型 | 主会话实际运行原 CLS/CG 14 配置与 CQ 13 配置，共 5 正、22 负；QA 和实施评审独立读回 37 输入与原日志。原有限对象、公平性及外部最终完成前提保留；模型未覆盖 close 异常，异常另有实际故障输入。 |
| 最终共同硬线 | `69492d46c` 的可执行验收和 strict loop 均退出 0；无环、方向违规、验收锁违规、退卡违规或静默传感器。影响面选择和原失败另存。 |

独立完整构建及主体动态运行发生于 `7df742c4b`。最终 `69492d46c` 只修复一份新增负类型测试的注释定位。QA 核对 14799 tracked 输入仅此差量，生产、Schema、锁及 3244 个构建产物逐字相同。12 个成员类型检查、7 个绑定入口和共享 helper 11 项在最终候选实际复验。旧运行保留原提交，没有改写成重复执行。

## 原失败、架构判断与限制

三个 BASE 同步重入关闭反例通过先登记完整工作修复。S2 的实际 CLI/TUI 启动取消误报 70 修复后返回原 2，参与者开库/清理错误仍保留原优先级。最终类型检查曾因格式拆行使 `@ts-expect-error` 错位而失败；修复没有改变非法 credential 输入或公共约束。

独立实施评审发现三个 core 定义缺少已采用角色投影，`7df742c4b` 精确补齐。当前预期下原 ROLE unknown 行消失，12 条 CLI assembly→core 和 4 条共享错误关系 converged；工具没有产生 9 条 ROLE 正判。其余控制面角色 unknown 没有被改成装配豁免。

最终固定源码视图包含 52 个产品成员、17 个静态未知；符合性口径为 882 converged、88 存量 deviation、15261 unknown。88 项为 IC-4 73、IC-2 13、IC-1 1、IC-3 1。它们按精确来源保留 R1-T4/T5、R2 与联合验收责任，不能通过记录关闭。6 个变化复杂度、8 对克隆、32 条新依赖和 50 条旧映射逐项交代。旧映射的退役继续归 N5/N6，不伪建旧实现映射消项。

公共定义与提供者的职责已经分开。CLI 控制面消费公共接口，具体提供者由应用 assembly 选择。managed CG 的原关闭尝试、静止许可和整体完成分别有拥有者；CLS 释放等待表示收场实际结束。未知与静态标签不能替代这些行为观察。

QA 原件的一处类型首失链接指向空 stderr。实际 TS2578/TS2353 在 [stdout 第 26–27 行](qa-receipts/affected-typecheck.stdout)，对应 exit 2 收据完整；[勘误](qa-erratum.json)补充准确来源，冻结报告不改写。public-query ENOBUFS、错误的全字节保护判据、坐标/AST 观察器失败、原测试撞名及 Schema 格式事故均连同修正保存。首次归档因 Python 软链接 API 不可用而未完成校验，修正后的新归档逐项读回通过。首份 root 说明把全部 88 项误称为 IC-4，也已按原规则分项更正，原件保留。

原 A5 冷恢复 45 秒因果缺口、EIS 原 5 秒超时、完整 W6、PG、完整终端矩阵及 EC2 formal README 漏登记继续开放。本轮未重跑 17 冷场景，没有运行全量 make check、检查/合并队列、付费模型或完整基准。

## 接受与证据恢复

[限定技术接受](../../decisions/governance-clients-delivery/decision.md)只覆盖 R1-T3，完整身份领域、插件树、模型领域与旧范式退役仍待。

- [独立 QA 原报告](qa-report.txt)、[逐项结果](qa-report.json)、[冻结清单](qa-manifest.json)及[主会话读回](qa-root-readback.json)。
- [实施审阅与最终补审](implementation-review.txt)、[最终共同硬线](final-hard-lines.json)及[验证选择](verification-selection.json)。
- [原结构处置](structural-dispositions.json)、[最终视图及分项接续](architecture-readback.json)、[能力对应](exports-migration.json)、[保持审计](preservation-audit.json)与[业务差异说明](business-body-dispositions.json)。
- [原模型摘要](formal-summary.json)、[CQ 摘要](cli-formal-summary.json)，原配置、输入和输出在 `formal/`；实际旅程原结果在 `observations/`，独立命令原收据在 `qa-receipts/`。
- [候选继承](candidate-inheritance.json)、[最终输入读回](final-input-readback.json)、[接受输入](acceptance-inputs.json)及[保全收据](inputs-and-preservation.json)。

工作树外归档 `r1-t3-69492d46c-r2` 的 6129 项逐一读回。完整原布局、原失败、TLS/SQLite 测试材料、制品和合成 fixtures 保留；源码 bundle 以 BASE 为恢复前提。仅排除已释放且可重建的两个干净 clone 和制品消费者安装。只承诺本机留存，不声称远端备份。报告相对路径按归档 `r1-t3/` 解释，绝对路径保留原执行来源；恢复需原锁定工具链。
