# Fable 真实前缀缓存 public 与 service 验证

2026-09-29，HUB e949760d，Node 24.18.0 / pnpm 10.28.1。实际 OpenRouter → Anthropic 的 `anthropic/claude-fable-5.1` definition2 / `pi-ai:anthropic/mp4-5`，明确配置 `ttl: 1h`、`last_message`，low effort、每次输出上限256。配置是本场景输入，不是产品写死政策。

## 实际结果

- public 同一实际 wire：冷请求写入8256 tokens，暖请求读取8256 tokens；两次均complete。
- 真实认证/Cordis/SQLite/SL3 service 三轮：首轮写入8222，第二轮读取8222并写入20，第三轮读取8242并写入19；全部complete，实际回复OK/CEDAR/CEDAR。真实usage/cost随原[M,R]物理批耐久。
- 原账本五笔全部settled，实际合计 **$0.33802**，无新增unknown。原11笔unknown hold保留；本包不复制全账本，也不将未知费用填零。
- 业务和诊断完整关闭，宿主在业务关闭后实际released。临时原始凭据文件在进程确认退出后删除；认证数据目录与凭据副本仍在私有tmp，未发布。

[inputs.json](inputs.json)记录精确源码、环境与所有输入/原始输出SHA；[scenario](inputs/scenario.json)保存完整ASCII输入、固定路由、配置与源SHA；[outputs](outputs/)保存五笔安全原始收据、实际关闭、原账本五条、物理批逐行hash核对及dry/review原输出。[scripts](scripts/)保留本次实际执行脚本。恢复脚本时应置于原源码修订的 `tmp/priority-certification/`；密钥从授权私有来源重新提供，不能从本包恢复。

## 执行与边界

生产执行前，HUB同一场景两次各5个本机HTTPS正向及unknown停止已通过，价目由公开models/精确endpoints接口采集并核hash；root审过场景后使用 `paid.mjs --mode production`，指定场景/价目SHA、1小时价目有效期、唯一原ledger和私有凭据路径。每笔以项目完整输入上限872000及256输出预留$17.4528，前笔实际结清后才继续，共5笔；不是同时预留五笔或更改预算。

这证明本精确绑定、配置和前缀下显式缓存实际生效；不证明TTL到期、其它TTL、其它厂商/型号、工具/图片/全部effort或完整37模型认证。service公开入口不暴露live wire hash，收据明确标为unavailable；其本机hash仅是核准输入，不冒称生产抓线。public hash来自实际plan。未将上游缓存命中等同于本地tokenizer精确性；实际tokens和费用均采用上游事实。

首次物理批核对脚本误把reply完整对象按标量ID比较而失败；修正验证器后原批全值相等，未改产品或原始结果，失败说明留在outputs。
