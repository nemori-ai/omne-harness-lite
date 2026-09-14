# D1 目录修订的来源与采用交接

当前提供者设计归 [diagnostics/design.md](../../../../packages/observation/diagnostics/design.md)。
本页保留 R1 反例、选型比较、受审来源和采用差异，不再拥有第二套当前接口、
账本或关闭规则。已实现签名由包公开源码维护，尚未实现的目录目标签名只在包
design 中维护；消费者采用必须固定该正文的 Git 修订。

## 来源、审阅与状态

- 原 D-010 提供者选择：设计 `99fc7a3`，接受 `5e81ee8`，见
  [D-010](../../../decisions/D-010-shared-diagnostics.md) 和
  [原观测施工来源](observability.md)。本次只迁移实现映射，不改变正式
  [OB](../../../../spec/capabilities/engineering-observation/v1/contract.md)/
  [CD](../../../../spec/data/core-work/v1/contract.md)/
  [DR](../../../../spec/capabilities/durable-records/v1/contract.md)/
  [CC](../../../../spec/compositions/core-work-coordination/v1/contract.md) v1。
- R1 完整受审稿：`d4cd27ed33df815179f57af398c8cb6b5444302a`，原四输入为
  `82b2baf7f88bcbe8b089b9c53278135a545169b7`；Git 保留迁移前全文。
  独立评审无阻断，主调度已按下文证据通过 D-011 接受提供者修订；产品仍未通过。
- 本次归属迁移起点 `1ab8635d57829bb8aed7b32506289285ddd5209a`，包含
  `1368c52` 的[计划归属](plan.md#任务输入与写入归属)与
  [最小运行基线](runtime-baseline.md)。本会话完成真实基线交接后停止；
  M1/M2、完整 A01–A32 保留为后续目录，不继续充当本会话的终点。
- R1 产品反例仍未闭合；主调度确认 R6
  `4fa2c74f4816fe37850a812ca59032cb889d75fd` 窄缺口已经闭合，
  不据此认定 R1、整个 D1 或真实组合已通过。本次只改文档归属。

## 反例与选型理由

`diagnostics@66d92a9` 每次 factory 只扫描物理文件，再累计本实例接收量。
固定 RED `fefb6c5b7ff9b82dc9f1a7648d58409f4a0a165d` 挂起旧 span 的
真实 fs.write 后创建新来源，单文件均未超限，目录却为 **3356 > 2400 bytes**；
两个 factory 都完成 prepare 才放行真实 `open('wx')`，得到 **2 > 1 来源文件**。
这直接挑战原设计“包含旧 generation 和未确认 pending”的实现方式。

[原始证据](evidence/observability-directory/README.md)保留完整 RED 源码/日志、
4个真实文件机制 case及哈希。机制探针只支持共同额度算术和保留策略的可行性，
不抵扣产品 GREEN。[P0 原生锁](evidence/p0-lock-probe/README.md)已验证固定
fs-ext@2.1.1 的同进程/跨进程排他、SIGSTOP/SIGKILL及稳定 inode，本次沿用，
不重启原生依赖或全栈观测选型。

| 比较对象 | 原受审判断 |
|---|---|
| 仅约定宿主创建一次 | 不能让两个公开 factory、模块副本或进程发现误装配 |
| 隐式全局 Map | 不拥有目录，跨进程/模块副本失效 |
| mkdir/wx 作为所有权锁 | 死亡残留需要另加 stale lease/删除协议 |
| 复用 JSONL writer 的锁 | D1 初始化先于 writer，且诊断目录不是业务 journal |
| 稳定锁文件上的 fs-ext@2.1.1 flock(exnb) | 候选采用已有原语；本包新增实际目录唯一 owner 与资源集成责任 |

逐条动态额度可让新旧来源共享余额；均分、每次开后复扫、隐式全局表和禁止
新旧来源并存都不能替代所需保证。具体算法、公共面和生命周期只归包 design。

## 采用差异及整合义务

相对 D-010 原采用，D-011 接受的差异为：

1. 统一目录 owner 创建多个来源、同步预留 slot/编码字节，以唯一
   createLocalDiagnosticsDirectory → owner.create 取代独立来源 factory；
   源码和消费者尚未迁移，不保留未上线兼容入口。
2. 增加固定 fs-ext@2.1.1 依赖；maxFiles 指来源文件，默认 **8个来源文件加1个
   零字节稳定锁文件**。总字节仍64 MiB；原“8文件”措辞不能被当成已许可
   任意额外文件。native安装、稳定锁路径与所有权前提由包正文说明。
3. 只有全部子来源/prepare/扫描静止且资源核对完成，才释放最后锁 fd。
   最后真实 close 结果未知保留 release_unknown，不盲 retry 可能复用的 raw fd，
   原 handle 永久失去写入能力；后继 owner 按实际 flock 判断。R2 的 close 前
   注入失败只证明那次 fd 尚未真实关闭，不是任意 syscall 错误都可重试的依据。

这三项沿 d4 原受审选择迁移，本次未增加或放宽业务语义。装载、部分失败、
撤除与原件保留责任已一并迁入包设计；实际产品 RED/GREEN、O01–O08/R1 和
公开产物/消费者验证仍由原 D1 实施者及主调度完成。

主调度已通过 D-011 对账限定采用、observability.md 的提供者映射/旧 factory
导航、implementation-spec/plan/delivery、包 README/契约可变入口。根依赖及
native构建 allowlist 随产品整合交付；应用设计引用包正文并承担挂载/退出。
jsonl/admission 的记录面注入类型保持原义，创建者和独立消费者迁移目录管理面。
P3工程查询和保留仍属原 owner，不因本次目录修订增成本会话硬门。

[本次迁移检查](evidence/observability-directory/migration.md)记录具体移动范围、
未改的历史资产、真实 docs/diff/scope 结果与未测量范围。它不替代主调度采用、
产品测试或正式规格发布。

## 采用与验证

主调度通过 [D-011](../../../decisions/D-011-diagnostics-directory-ownership.md)
接受上述三项提供者修订。固定技术稿 `d4cd27e` 已独立审阅；HUB `1368c52`
核对原 manifest 并重跑四个机制案例通过，见
[HUB 证据](evidence/provider-design-hub/README.md)。`327735f` 归属迁移经实际
核对，唯一目录接口块及九份原证据逐字不变，已通过 `01998d3` 整合。

这个接受只固定 R1 施工输入。R1 真实 RED、raw fd 未知后的资源身份、真实
flock/owner 关闭、O01–O08 及独立消费者仍由原实施者交付后在 HUB 验证；
下游不能因为本设计已接受就使用尚未实现的目录 owner。
