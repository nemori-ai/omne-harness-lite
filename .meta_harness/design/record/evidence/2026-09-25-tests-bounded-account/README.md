# 有界账号提供者 · 局部实现验证

2026-09-24晚至09-25（Asia/Shanghai），D-041局部实施；没有提交/发布/部署，没有宣称治理CLI/TUI闭环。

## 结果与范围

- macOS arm64 Node24.21.0：AI包80通过、10原有跳过；新增14项覆盖空闲/绝对截止、纯验证不touch、成功活动与晚完成、最终时钟失败回滚、自撤通知、暂存观察、改密旧凭据竞争、G优先、票据单次/跨实例、同密码更换、重启与旧库迁移。
- 观察测试同一SQL提供者的另一个只读连接实际看到旧L且已按旧值到期（负控），正式verify/exchange/list等待写提交后读取新L。不是多节点/跨进程证明。
- host lifecycle/upgrade40通过；真实旧九条全局迁移的中心文件追加第十条后启动、再次启动保留centerId；另AI旧表带账号/登录行迁移与重启验证旧登录全部撤销、原材料/I保留。没有把空库创建代替旧序列验证。
- 受影响消费者：OG99通过4跳过（见consumer-regressions前段）；AR60通过1跳过；entry旧版422通过2跳过。新entry2尚未实现，这些只证明旧消费者回归，不是新共同提交闭环。
- 全workspace类型检查通过；20条静态规则通过。Linux arm64固定Node镜像上的真实Cordis插件装配5组smoke通过；不是Linux全套测试或跨网络CLI。

## 复跑入口

`fnm exec --using 24 pnpm --filter @omne-harness-lite/account-identity test`

`TMPDIR=/tmp fnm exec --using 24 pnpm --filter @omne-harness-lite/account-registration test`

`TMPDIR=/tmp fnm exec --using 24 pnpm --filter @omne-harness-lite/tenancy-host exec vitest run tests/lifecycle.spec.ts tests/upgrade.spec.ts`

entry套件还设置OMNE_TEST_ALTERNATE_SOURCE_ADDRESS为该次mac机器实际存在的非loopback IPv4，不能照抄旧地址；命令为`TMPDIR=/tmp OMNE_TEST_ALTERNATE_SOURCE_ADDRESS=<实际IPv4> fnm exec --using 24 pnpm --filter @omne-harness-lite/governance-center-entry test`。

Linux命令：Docker镜像 `node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`，无网络，工作区只读挂到/repo，运行本包linux/run.mjs的工作区副本。脚本从/repo公开dist入口装配，数据库只在容器/tmp；前提是按锁文件完成构建。结果含平台/Node版本。

## 失败与修正

保留初轮失败日志：AI旧测试仍期待九方法/四列/无限登录/两字段列表，已按AI3更新精确断言；host旧测试把第十条当测试附加片段，改为第十一条，并新增实际旧前缀断言。AR/entry的故障Storage包装起初没有atomic扩展，导致装载失败；已补显式作用域转发并保留故障、暂停、提交失败钩子。AR原等待点假设AI read不写，已移到账号read实际提交之后；读取计数对应新边界，原孤儿/重放/清除断言保留。I7原凭据/数据库速度使1ms窗口未必触发过期，现显式产生并等待一份未激活过期见证，再继续原并发负载断言。

host新装配按D040拒绝PG；旧PG整装测试在PG锁序精化之前明确延期（即使给URL），不声称通过。共享storage-sql的PG能力不撤销。

## 未闭合

entry2/OG2共同参与、业务成功与最后活动接线、CLI/TUI、HTTPS新版采用、完整业务Promise排空、正式升级故障恢复全部旅程、备份安全开放及整机灾备验收仍未完成。物理断电与磁盘损毁未测试，Linux仅局部smoke。独立架构评审允许局部实施，不代表最终QA接受。

源快照见source-manifest.json；格式化不改变所记录测试语义。后续源变更须新证据，不能据本运行声称新代码通过。
