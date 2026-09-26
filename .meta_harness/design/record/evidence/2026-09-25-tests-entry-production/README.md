# EC2 / HT2 入口与真实中心回归

2026-09-25；macOS arm64 / Node24.21.0，SQLite + Cordis。D044 采用后的局部实现验证，非生产全链路验收。

- entry2-tests-r4：14文件468通过、2原有跳过。31路由及可达失败、规范Schema和字节、真实TLS/Unix、生命周期与旧回归。production-boundary14场景覆盖共同提交、暂存业务后的时钟/编码/异常回滚、吞掉污染异常仍不提交、预期身份冲突、按名邀请先授权、拒绝终结、改密全部旧登录失效、G优先、运输超时及清理异常后仍等待准备/提交结束、失效单元不继续补授权SQL。
- entry2-host-r1：4文件83通过，真实装配、生命周期、子进程和升级。命令里一个不存在文件模式未匹配，不计为测试。
- entry2-host-e2e-r2：46通过。独立进程部署，测试驱动器按新协议完成治理旅程；驱动器先明确读取当前选择，发送expectedTenant。非真实用户CLI。手动walk同样显式传已确认选择；原r1漏传而失败保留。
- entry2-linux-r1：固定Node镜像下构建产物与真实Linux arm64 SQLite/HTTPS回环七组通过，network none。不是Linux全套或独立物理客户端；宿主产物在容器挂载执行，不声称Linux离线从零构建。
- workspace类型检查r4与最后局部r5通过；构建r3通过；工具65项自测、20条源码规则r2通过。初次规则仍禁止accounts注入与EC2 S50冲突，按D044更新为禁止普通账号读写；只凭出示物认人及不解析/断言网络句柄仍保留，新增合规/违规反例。
- design-check通过，模型仅登记未执行；本运行不替代已有有限模型证据。

失败与边界：初次编译误加类型参数、旧协议/载荷/期限字段和桩未更新、AJV strictRequired编写检查不识别外层条件字段、旧排空测试在业务未放行前等待撤除造成互等，均保留日志。不是删掉失败用例：新测试明确断言网络已关但fiber未静止，放行业务后才完成。真实事务排除了旧认证后外部插写窗口，改为期限跨界和请求前撤销，另有共同边界SQL测试。一次测试缺macOS第二来源地址失败，后续使用10.0.0.251通过。

输入：source.tar.gz保存最终源码/夹具/Schema/包清单/锁文件与Linux驱动，source-sha256逐文件核对；基线cc01c8322e71d48d784bcb66e27cb81814fd4b6f，分支pandazki/add-tui-developer，未提交工作区。原始失败运行未逐次留完整源码，仅日志可复原当时故障，不用最终源码hash冒充失败输入。测试证书与演示秘密均为仓库夹具，不是部署凭据。

Linux镜像node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6；命令docker run --rm --network none -v "$PWD:/repo:ro" <image> node /repo/tmp/production-cli-onboarding/entry2-linux/run.mjs。macOS运行使用TMPDIR=/tmp、OMNE_TEST_ALTERNATE_SOURCE_ADDRESS=10.0.0.251和fnm exec --using 24 pnpm；具体任务名见各原始输出。

未覆盖：全部未知提交路径、物理多机、Linux完整回归、真实终端IME、安装分发、本地登录状态与CLI/TUI、每日备份恢复及灾备。没有提交/push/部署/生产准入声明。
