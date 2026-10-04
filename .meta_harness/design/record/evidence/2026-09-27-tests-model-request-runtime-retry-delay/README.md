# W16：公开精确 retryDelay 的有限技术签收

2026-09-27，主线核对并技术签收 RT4 S60 根公开纯 `retryDelay` 增量。独立产品 slice **Pass**、整体证据 **Pass with issues**：早期部分外层测量 driver PID 与首次 formatter PID 不可恢复，报告原样保留。人的整体接受、P2、实际重试等待或完整 runtime 不由本次签收。

受测提交 `b6833514f9b4d4ecd7dbc8dbc59d5bfd4602eb17`，包含原实现 `430f2d185e49f258503b9d406ceba6435d49721a`；采用 D086 的 RT4 S60、D076 R3-P7 与 D087 保留的精确纯关系，以及 TD3 Duration、CB3/CA2 精确数。HUB 当前 `4cf612e9314bd042abe61591abf7156fd6861d09` 相对受测源仅三份 realization 导航/绑定变化，所有受测产品源码/dist/依赖/双语README相同。时间投影采用不改变此受测函数。

## 实际覆盖

| 范围 | 独立实际执行与限制 |
| --- | --- |
| 两公开制品 | 15 fresh pack；每目录29产品副本、1274发布成员逐字匹配，130内部链接无坏链/源码回链。原deploy/B/C隐藏metadata的workspace/catalog差异保留，另造最终两目录以pack原metadata实跑，不改执行代码/声明 |
| 数学/接收/所有权 | 每目录2181通过：独立Python Fraction直接S60的2133有限用例，46严格拒绝、所有权1、纯边界1；3kind×4jitter、端点/封顶/退化/长小数/超2^53/巨大科学n。压缩巨量n只在列明cap或退化代数witness下验证，不声称无限复杂度或全域证明 |
| 可独立取用 | 真移除Cordis/kernel及失败导入确认，公开根retry/guard可用；调用期禁止env/clock/random/timer/IO，getters/toJSON零调用，mutable输入不改、结果冻结且不保留跨调用输入 |
| 真编译行为负控 | `half-uses-full` 与 `decorrelated-lo-unclamped` 仅改隔离compiled JS一处，syntax0，同一Fraction oracle指定AssertionError exit1、真实wait；其余1274发布成员不变，不计loader/fixture失败 |
| 双语例与真实生命周期 | 当前runtime六个literal TS块×两个目录，TS6 strict NodeNext/skipLibCheck=false编译/实际执行12模块；公开类型亦实际编译执行。四次本地HTTPS/SSE请求各1、complete、真实Agent销毁、双向socket close/0、server停止、owned timers0；末全局快照仍有两个Immediate/FD22，不称全局句柄0。没有付费或公网模型请求 |

最终26命令均有actual child PID/argv/cwd/wait：24退出0，2个指定行为negative退出1。root亲读报告、四TLS原资源事实、两目录2181具名结果与两负控，亲核1135冻结输入、15pack零漂移，并完整读回归档43678常规文件、1756内部闭合链接和4552目录，加一内嵌manifest共49987成员。

HUB原合入后120/120测试、六个literal及13最终集成检查的原始记录已保存在[前次root集成归档](../2026-09-27-tests-model-request-runtime-guard-log/root-integration.tar.gz)；只沿同产品字节复用，不冒称本次又运行。机器负控与源适用输入可从本次归档恢复。

## 原件与证据记账限制

[完整原件归档（已外置）](../2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件)132652935bytes，SHA256 `934e639cd3174959aa41ce4d4e581a1f8a9fc3a08eb4e9efedda91b36dffac07`；[逐成员清单](archive-manifest.json)SHA `e09f9bba2f2d5662391df21bd5330966bc6457c77b9c51c8dec081c8883a37f4`。原[报告字节快照](independent-REPORT.txt)、[机器摘要](independent-summary.json)、[封存元数据](independent-archive.json)、[冻结hash](input-hashes.json)、[root核对](root-verification.json)、[限定接受](acceptance-summary.json)、[root测量脚本与原输出](root-verification-runs.tar.gz)和[file-hashes](file-hashes.json)可读。报告作为txt保留原字节/绝对路径；解开归档后的 `evidence/`/`os/` 布局不修改。

早期所有实际业务子进程argv/PID/raw/wait保留，但setup/numeric/docs/nooptional及首次controls的外层driver PID未单存；首次formatter仅有明确归因tool transcript，后次带PID复现不冒充首次原件。最终driver/命令/负控已完整记录。原generator/类型fixture/formatter/隐藏metadata/首次socket Set1失败与修正全保留，不把fixture非零算产品反例，也不靠修改源码放宽oracle。

首次Set1没捕获物理FD，不能补称该原run已证明FD关闭。仅另次具名诊断实际观测Agent.destroy返回后client FD消失、server关闭后socket FD全无、close事件随后清掉Set。最终四次await真实双向close事件，没有强关客户端或放宽socket0。root自己的首次archive审计错假设manifest在根，实际在 `evidence/ARCHIVE-MANIFEST.json`，指定member-set AssertionError在任何readback前发生；修正测量路径后全量readback通过，原错误记账保留，产品不变。

## 未覆盖

未执行decideRetry/default retry plugin/P5调度、R3-G7大时长等待与实际停止、生产observer、G28/G29真实写方/历史/G30/G31、五共同结算构件、十三服务/租户访问、完整P2～P6或37模型生产认证。本函数只计算明确提供事实下的精确延迟，不建策略默认、不读随机、不安排第二次send。官方认证 **0/37**，费用新增0；旧W15/804 Fail原件及其范围保持。

本记录注册检查原件见[检查归档](post-registration-checks.tar.gz)：首次因root尚未创建file-hashes链接目标退出1，真实原输出保留；补齐hash索引后internal checker formal=skip实际退出0，不改变产品。归档另含独立封存后外置completion的4份原件及hash核对，未假称它们已包含在原tar。

## 2026-10-01 归档位置变更

原运行结论和原始摘要保持。成批源码、制品及依赖归档已按用户选择移出 Git，原文件逐 SHA-256 保全；取回位置、字节摘要及历史提交映射见[归档迁移记录](../2026-10-01-checks-model-runtime-repository-cleanup/README.md)。原清单中的路径是运行时地址，读取外置文件时按迁移清单恢复，不能把本机保全称为远程备份。
