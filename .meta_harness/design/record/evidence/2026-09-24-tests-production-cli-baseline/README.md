# 2026-09-24 治理 CLI/TUI 开发基线与首批局部修复

本次在 macOS arm64 单主机、独立工作树 `pandazki/add-tui-developer` 上执行。基线提交 `cc01c8322e71d48d784bcb66e27cb81814fd4b6f`；Node 24.21.0、pnpm 10.28.1、系统 OpenSSL 3.6.3、真实 SQLite 文件库。**这是开发基线与局部回归，不是生产准入或独立产品验收。**

原始环境、命令、时间、退出码和 JSON 测试结果保留在以下各阶段目录。输入差异与文件哈希在 [manifest.json](manifest.json)；从基线应用两个 patch 可恢复本次测试相关源码。原始运行结果不改写。

## 实际运行与结论

| 阶段 | 输入 | 结果 | 原始输出 |
|---|---|---|---|
| 原始基线 | clean `cc01c832`；`TMPDIR=/tmp`；第二来源地址缺省 `127.0.0.2` | build/typecheck/design-check 退出 0；e2e **45 通过、1 失败、0 跳过** | [环境](original/environment.json)、[build](original/build.log)、[typecheck](original/typecheck.log)、[design-check](original/design-check.log)、[e2e](original/e2e.log)、[JSON](original/e2e-results.json) |
| 第二来源地址配置修复 | 基线 + [address-fix.patch](inputs/address-fix.patch)；显式使用已配置、不同于回环的本机 IPv4 来源 | e2e **46/46 通过**；入口 `center.spec.ts` **15/15 通过** | [环境](address-fix/environment.json)、[e2e](address-fix/e2e.log)、[center](address-fix/entry-center.log)、[JSON](address-fix/entry-center-results.json) |
| N-18 具名时钟超时错误 | 再加 [clock-error.patch](inputs/clock-error.patch)；真实库/插件/端口释放 | build 通过；入口生命周期 **44 通过、1 原有跳过**；装配生命周期 **17/17 通过**；真实等钟超时 **1 通过、3 未选中** | [入口](clock-error/entry-lifecycle.log)、[装配](clock-error/host-lifecycle.log)、[等钟](clock-error/host-clock-timeout.log)及同目录 JSON/run 记录 |
| 最终代码回归 | 基线 + 两个 patch | typecheck、format、结构规则退出 0；e2e **46/46 通过** | [typecheck](final-code/typecheck.log)、[format](final-code/format.log)、[lint](final-code/lint-rules.log)、[e2e](final-code/e2e.log)、[JSON](final-code/e2e-results.json)、[完整遮蔽证据](final-code/e2e/output/environment.txt) |
| 来源地址负向自检 | 把第二来源强制设为第一来源 `127.0.0.1`，只选入口 T-16 | 按预期在配置前提处失败；不让同源比较冒充两来源。其余 14 项因过滤未执行 | [原始输出](negative-control/result.log)、[运行记录](negative-control/result.json)、[判读修正](negative-control/assessment.json) |

## 首次失败与修复边界

首次失败的 [传输记录](original/e2e/transcript/pf017-not-the-client.jsonl)显示 `EADDRNOTAVAIL`、`requestWritten: false`，故请求没有到达治理中心。独立本地连接探针也观察到该错误，而本机已配置的另一 IPv4 地址可连接回环监听。

修复只增加测试变量 `OMNE_TEST_ALTERNATE_SOURCE_ADDRESS`，并拒绝非 IPv4、第一来源地址和未指定地址 `0.0.0.0`；不可绑定仍失败，不跳过、不回退同源，原有逐字节断言保留。该变量也供入口包组合测试使用，日志泄漏检查随实际所用来源更新。**两来源仍在同一台机器，不能替代不同客户端主机。**

负向自检首次结果摘要里的 `expected_failure_observed: false` 是临时判读脚本匹配 `not to include`、实际 Vitest 输出 `to not include` 所致；原始日志明确在前提断言拒绝同源。保留原记录，以独立 assessment 说明修正，没有重写或放宽测试。

## N-18 的证据

真实入口等钟超时现在抛出 `GovernanceCenterClockTimeoutError` 并释放端口。装配使用公开错误类型映射 `clock-unreadable`：更换该错误的说明文字仍正确归类，普通 Error 仅带旧字符串 `(cause: clock)` 不再被误归类。真实时钟不可读用例仍验证其他 fiber 撤除、升级快照恢复和失败阶段。

入口生命周期的一个原有 skip 是“开闸前崩溃/升级快照”的跨应用用例，原文件将其交给 tenancy-host；本次不把它记作通过。slow 文件只执行了真实等钟超时一项，其余三项未执行。

## 保密、复现与限制

- 原始可发布材料拷贝前，使用三轮 e2e 实际采集的秘密表示列表扫描，**0 命中**；秘密清单本身没有发布。套件自身扫描也记录在 [secret-scan.txt](final-code/e2e/output/secret-scan.txt)。
- 验证环境用了隔离临时目录和生成的测试密钥，未访问公司中心或生产账号；未修改系统网络/时钟。Node 24 通过 `fnm exec --using 24` 选择，不改变系统默认 Node。
- 复现：按原始各 `*-run.json` 的 argv，在 Node 24 环境构建；第二来源地址必须换为执行机器真实可绑定的不同 IPv4，`TMPDIR` 应是足够短的可写目录。原始文件中的绝对路径是本次运行坐标，不要求新机器复用。
- 没有验证 Linux、多机、断电、PostgreSQL、全部存储故障或生产升级/恢复目标；SIGKILL 只代表进程故障。未执行新的形式模型。
- e2e 通过覆盖其现有断言，仍保留 PR #7 的产品/规格冲突和弱断言边界；不据此宣布新的登录寿命、换密或灾备政策已经实现。
- 产品候选与正文此后修订不会改变上述旧行为基线；新语义必须另作实现和验收，不能沿用本 run 声称兑现。
