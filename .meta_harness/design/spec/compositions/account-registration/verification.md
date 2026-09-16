# 注册组合验证与缺口

| 条款与性质 | 需取得的证据 | 当前结果与受阻消费 |
|---|---|---|
| ACR-01～03 身份/个人范围唯一 | 账号与 Tenant 权威的同键并发、唯一 claim、目标稳定性场景；后续 Tenant 入口规范 | 单原操作有限行为模型已检查；多原操作、摘要冲突、真实 owner 并发未执行，TG-01 增量及提供者仍需闭合。 |
| AI-02a/ACR-03 可信一次后果交付 | 凭据唯一绑定后源事实耐久、CC-05 受信导入与去重、旧实例隔离、Account 失联后已导入事实可继续 | 现有单原操作模型将源授权与导入作为前提，没有建模错绑/伪造/多操作；真实 provider 与跨域导入未验证。 |
| ACR-02/04 注册成功时默认一个 personal tenant | Tenant 同批唯一 personal owner、注册不自动建立组织成员；独立组织入会的准入与并发另按其契约验证 | 场景已补，跨 Account/Tenant 共同门及真实并发未执行。 |
| ACR-04/05 成功及 unknown 屏障 | 跨 owner TLA+ 行为模型，覆盖 pending、durable、unknown、回执丢失、重启、publication blocked 与公平前提；真实存储故障注入 | 下述 TLC 安全/进展检查通过；真实存储与完整 CC-06 恢复未验证，不得宣布注册恢复就绪。 |
| ACR-06 原操作认回 | 双进程并发/崩溃重启的权威回执与稳定目标测试 | 模型验证同操作两个协调者及历史成功；真实跨进程 fencing/命令通道未执行。 |
| ACR-07 范围隔离 | 两账号、多组织、账号级与租户级设置/资产、额度及旧缓存的组合测试 | 未执行；PF-006 字段 owner/scope 和本地资源 locator 未定义。 |

规范场景见 [v1/scenarios.md](v1/scenarios.md)，模型映射与前提见
[formal/README](v1/formal/README.md)。有限 TLC 只能覆盖其建模范围；真实数据库和认证
provider 仍须符合性测试。

## 2026-09-16 有限 TLC 执行

模型输入为 [AccountRegistration.tla](v1/formal/AccountRegistration.tla)，安全配置
[Safety.cfg](v1/formal/Safety.cfg)、进展配置 [Progress.cfg](v1/formal/Progress.cfg)。
TLC `2026.09.12.025210 (rev: 867aefb)`、Temurin `21.0.12.1`、单 worker、512 MiB heap。
两个配置均检查 814 个不同状态、生成 3386 个状态、完整图深度 19、队列归零，exit 0。
安全检查无需公平前提；进展只在模型声明的最终恢复/公平调度前提下成立。

7 个故意错误的变体分别提前激活、提前成功、重分配 target、产生第二个逻辑个人目标占位、unknown
释放占位、旧 blocked completion 直接发布及同时授予两个推进许可；均以对应不变量反例
exit 12 被检出。10 个可达性探针产生逻辑未耐久、耐久未发布、unknown 已提交/未提交、
崩溃位置、发布后尚未观察的位置、完成、publication blocked、从新基线恢复完成及关闭后历史成功的见证。
这些预期反例属于测试有效性证据，不是候选正常模型违反契约。

| 输入 | SHA-256 |
|---|---|
| AccountRegistration.tla | `0b382af63182e5d9c8aaa7cf76107dd8c436581a4e2b91ac28f1778e469e15d2` |
| Safety.cfg | `fa645b511271acbecac29cfd82bd279d937637bd82f95247f6e6d7610d10606c` |
| Progress.cfg | `0632db5875c329f6810345274f763acea47954709b1e17e12df1d6a07bc7cb8d` |
| tla2tools.jar | `db131ddb48e7004d823bef4493df7b35694babe37505b9d9fa5685e7a331f1f1` |

本次本地原始证据已复制并核对至 HUB `tmp/account-registration-formal/`：`results.json` 记录
逐任务实际命令、退出码及结果；`sha256.json` 绑定模型、配置、工具、脚本和原始日志；
`inputs/` 含故障变体和探针配置，`run_checks.py` 可复跑。原 `results.json` SHA-256 为
`e1247d681bc8deebb56091397bbd6a14bf7de6646219d673212a9c824abba2a5`。
Astra 独立复核在临时目录串行重跑 19 项，两个正例 exit 0、7 个指定性质反例及 10 个
可达性探针均按预期 exit 12；45 项输入/日志哈希匹配。此临时证据不是已发布的长期
证据；集成后形式任务清单尚未登记，不能据此升级规格状态。
