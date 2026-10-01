# Model request runtime：P1 补证与 P2 局部生产构件

2026-09-27 在 `panqiwei/model-request-runtime` hub 实际执行；HEAD 为
`cb83084b88ce685a65fda2118854d2600ddbfff4`，源码尚有未提交修改，不能只用 HEAD 重现。
施工仍消费 revision 5 计划和 D-076 精确采用，冻结规格与 v3-design 未覆盖。
本次是组件与制品证据，不是 P2 完整放行或总体接受。

## 实际结果

| 入口 | 结果与实际范围 | 原文位置（source-config-and-runs.tar.gz 内） |
| --- | --- | --- |
| transport 最终整包 | 196 passed：plan 12、真实本机 TLS 44、registry 8、Cordis lifecycle 6、37 窄定义 126 | `input/logs-and-entries/p2-transport-tests-final.txt` |
| runtime 整包 | 6 passed；显式成因表及函数消费者 | `input/logs-and-entries/p2-runtime-tests.txt` |
| 构建与类型 | transport 依赖闭包 build、两个 model 包 typecheck 全部 exit 0 | `p2-build-closure.txt`、`p2-runtime-typecheck.txt`、`p2-transport-typecheck-final.txt` |
| 源码规则 | 27 包规则＋6 仓库路径规则扫描通过；scoped format、diff check 通过 | `p2-source-scan.txt`、`p2-format-final.txt`、`p2-diff-check.txt` |
| 两包双语 README | 4 份、10 个 TS 代码块类型检查与模块执行通过；逐字核对，files 包含两语文档 | `input/checks/p2-readme-consumer-2/`；另见 [readme-checks.json](readme-checks.json) |
| 仓库外 r2 制品 | 根入口在禁止解析 Cordis/kernel-basis 的 loader 下可用；注册 37 项；实际本机 HTTPS 一次请求/一次 socket close；保留 tracked callback；真实 Cordis 贡献装卸后两个 service 均 closed | `p2-artifact-root-r2.stdout`、`p2-artifact-consumer-r2.stdout`、`p2-artifact-r2-results.json` |

路径简写的日志均在 `input/logs-and-entries/`。环境为 Linux、Node 24.18.0、pnpm 10.28.1、
TypeScript 6.0.3、Vitest 4.1.11、真实 Cordis 4.0.4；详见 [environment.json](environment.json)。
README 模块执行没有调用其导出的 `invokeOnce`，没有付费调用。

P1 新增 17 个 TLS 检查保留 HTTP 400/401/402/403/404/408/413/429/500/502/503/504/418/302
的实际脱敏响应头及重复值、过界错误体的头、调用期间不可变政策，以及大于 2^53 的负 token 关系诊断。
计数不一致不填零，高精度 cost 仍保留。普通完整 HTTP 错误响应可留下池内空闲连接，测试在所属
transport.close 后确认关闭；过界体与取消的检查才要求立即关闭实际 socket。

P2 引用检查覆盖：登记 V2 不替换稳定 service、不改旧 lease；未知版本/非法配置拒绝；A 释放后
再取得 B 的真实空闲交错仍阻止撤除；幂等 release、不同完整配置、不让历史 retire 删除新 owner；
超时报告 remaining_active 且贡献 fiber 仍 UNLOADING；清理失败保留所有权。
强制路径让 direct 和 invokeModel 各发一次真实 HTTPS，两个 socket/读循环停止后，外部 gate/callback
未完成仍保留引用，完成后才允许清理。可信本机装配经 ctx.provide 组合公开 factory 与生产贡献插件；
这不是固定 OpenRouter 插件发出的真实网络请求。

37 定义对应确认的八家清单，共享家族实现 revision 3、模型 definition revision 1；自动缓存 26 项、
显式候选 11 项，OpenAI 提醒为 developer，其余 user。DeepSeek 只登记已有采用表和成功暖读依据的
deepinfra/fp8，不能据此推原生路由。新定义须显式选择/登记；默认静态集仍是两 pilot。
126 项离线检查不证明逐模型完整 offer、上游 TTL 采纳/到期或生产认证。

## 输入、失败与重现边界

[input-and-output-hashes.json](input-and-output-hashes.json) 记录 1228 个快照文件及三个归档的 SHA256。
`source-config-and-runs.tar.gz` 保存 15 个实际依赖包源码、workspace 配置/锁、规格 Schema、所检查的
Cordis 源码、执行入口、最终原始输出及所有保留失败。两份 `public-artifact-r*.tar.gz` 保存完整实际部署
字节，全部链接只指向各制品内部；r2 不借工作树模块解析。

重现时解包 source 快照为独立工作区，按所保存锁和工具链安装，运行表内 pnpm 命令；本机 TLS
测试需要 OpenSSL。README consumer 的显式 workspace 链接需按 `dependency-links.json` 重建，
它不是独立安装证据。外部 r2 制品自包含，进入 `artifact/` 分别执行 `node p2-artifact-root.mjs`
及 `node p2-artifact-consumer.mjs`。其消费者显式提供 Cordis 4.0.4 peer，解析到制品内已部署的精确字节。

保留的失败包括 registry TypeScript 初稿错误、测试把 unknown Config 传入类型化入口、普通 HTTP
完整响应被新测试错误要求立即关闭空闲 socket、README checker 初稿找不到根 tsc，以及 r1 外部
consumer 没有显式提供 Cordis peer。后者根入口已通过，插件消费者失败；r2 新制品补消费者 peer
解析后通过，不修改产品默认 endpoint。初稿失败并非全部都有完整源快照，不能以最终代码重演所有
中间失败。独立生命周期测试的 41 文件快照保留其实际跑过版本和 index 后续漂移；最终整包 196 项
已使用整合后代码重新执行。

[input-observations.json](input-observations.json) 的 44 项仍按原计划哈希核对。只有可变
transport verification 的上轮 P1 实际事件节、唯一 ledger 观察不同；冻结输入均一致。计划 hash
不是新运行的余额或可变证据版本。[secret-scan.json](secret-scan.json) 检查完整实际凭据及每个
八字符窗口，命中 0，不记录凭据或其哈希。

本轮付费请求 0；唯一账本仍为 170 settled、0 unsettled，累计 USD 1.139960389500000000，
USD100 上限不重置。先前八笔代表模型的真实请求沿 P1 原 run 读取，不挪作 revision 3 的上游验证。

## 继续开放的范围

P1/P2 尚缺全部 T/SC/G 逐项门、工具未定头片段/队列总界限、完整脱敏与观测矩阵、宿主服务替换
交错及逐模型参数/模态 offer、配置 Schema。目录采用、当前租户权限、耐久十三操作、opened ack
未知恢复、重试/回复结算、崩溃恢复、完整诊断退化/查询及 P6 public/service 认证未执行。
official 完整认证仍 **0/37**。本机有限交错、断言数或文件存在均不能代替这些性质的真实证据。

## 补充：实际映射核对

主归档完成后执行两处 model realization 的 entry/architecture/bindings/links 核对，错误为 0；
design checker 在 `formal=skip` 下 exit 0，实际执行形式任务 **0**。输入、入口与原始输出追加于
`final-mapping-check.tar.gz`，摘要和 SHA256 见 [final-mapping-check.json](final-mapping-check.json)。
这个结果只覆盖两节点及该工具模式，不表示其他节点的全体 realization 形状检查已通过，
也不关闭日志候选后续评审发现的组合缺口。既有三个制品／源码归档没有覆盖或换版本。

## 2026-10-01 归档位置变更

原运行结论和原始摘要保持。成批源码、制品及依赖归档已按用户选择移出 Git，原文件逐 SHA-256 保全；取回位置、字节摘要及历史提交映射见[归档迁移记录](../2026-10-01-checks-model-runtime-repository-cleanup/README.md)。原清单中的路径是运行时地址，读取外置文件时按迁移清单恢复，不能把本机保全称为远程备份。
