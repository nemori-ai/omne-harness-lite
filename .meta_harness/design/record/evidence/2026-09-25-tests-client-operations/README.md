# CG1共享治理用例的实现验证

2026-09-25。D047 / CG1 S1～15，依赖D045 EC2/HT2协议客户端与D046 CLS1。最终源码在source.tar.gz，SOURCE-SHA256SUMS固定实际输入；真实组合驱动及节点快照同时保留。所有报告不包含实际用户账号，TLS与密钥均为测试材料。

- 最终106项包内测试通过，5个文件；原始输出`logs/client-operations-review-fix-tests.log`。覆盖全部31路由、13读面、固定使用、原快照结算、五种未知查证、查证缺陷、读写失效、已知失权清理失败以及installed具体副本例外。
- macOS/Linux arm64 Node24.21.0的编译CG1+真实CLS+真实Cordis中心/SQLite/HTTPS通过12组，最终`client-operations-review-fix-macos.log`与`-linux.log`。包含组织创建/切换、邀请接受/拒绝、成员升降权/解除、隶属绑定/解除、实际notAuthorized路径、改密使全部旧登录失效、退出、一小时空闲和八小时绝对期限。
- `client-operations-review-fix-build.log`/`-types.log`通过；此前workspace完整build/types通过。结构工具66tests及20rules通过；observation-time.ts是D047已定显示取时的唯一具名新增豁免，其他frontend取墙钟仍会失败。
- CG1冻结输入77例及模型输入对照归[独立后续运行](../2026-09-25-formal-client-operations-2/README.md)，此实现运行不重说有限模型等于代码证明。

## 可复跑入口与边界

恢复源码后，先用Node24.21.0执行`pnpm install --frozen-lockfile`及`pnpm build`，构建结束再执行成员test/typecheck。macOS：`TMPDIR=/tmp fnm exec --using 24 node tmp/production-cli-onboarding/cg-integration/run.mjs`。Linux：以metadata固定镜像、仓库只读挂载到/repo、工作目录/repo运行同一驱动，`--network none`；内部使用loopback HTTPS。

真实组合在同一进程装配中心与多个实际客户端，中心时钟可控，密码成本为测试配置；不证明不同物理机网络、生产密码成本、所有CPU或实际终端表现。故障矩阵包装真实CLS的公开边界；不同store恢复分支注入读数，不冒充物理重建恢复。没有CLI/TUI、IME、安装分发、备份恢复或整机灾备验收。

## 失败记录与修复

r1构建为类型投影问题；首轮用例暴露切换后仍保存准备阶段OG36旧副本，已修复并保留反例。另一失败是测试以空数组代替OG27必须存在的个人租户，修正夹具。r3缓存测试从空记录一次装入新登录及副本，被CLS正确拒绝；改为先安装登录再同引用保存副本，r4通过。格式r1误传目录给只接受文件的工具，r2改为明确文件。集成r1把成功改密/退出后需要重进的状态4误断为0，驱动已按CG1 S15修正。

独立实施映射复核发现：写失败的同查询规则会无意义地延长改密凭据引用。修复限定规则为可缓存读面、规则仅保留非秘密查询串，完整close后释放知识表；新增带会抛出的凭据getter反例，修复后106项及双平台驱动重跑通过。不声称JS字符串可靠擦除。
