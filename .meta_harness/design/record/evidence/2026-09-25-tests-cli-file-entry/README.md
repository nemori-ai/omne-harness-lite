# D049受保护文件CLI实现验证

2026-09-25，最终应用68项测试通过，workspace build/typecheck通过，20项结构规则和设计/文档检查通过。CLI的7个src文件、两份测试、工作区构建输入和测试直接引用的冻结规范都在source.tar.gz/SOURCE-SHA256SUMS。不是仅有提供者的API验证。

实际CLI作为独立子进程访问同一测试进程装配的真实Cordis中心/HTTPS/SQLite。macOS/Linux arm64、Node24.21.0各完成JSON管道、script实际PTY人读预览/报告、注册登录、组织/邀请/成员/隶属/切换、主动改密与旧登录拒绝、退出、空闲1h/绝对8h；输出EPIPE时中心记录恰一个目标业务请求。错误凭据文件涵盖权限、符号链接、FIFO无对端、字符设备、非法UTF8、超限；Linux以root测试进程另核外UID文件。拒绝这些输入时login目标请求数没有增加。最终仓库路径原始输出cli-file-review-macos/linux.log。

内部Runtime测试单独构造读取/实际工作屏障、CG/CLS close拒绝、stderr失败；不作为用户故障开关，也不冒称正常CG黑盒会自然拒绝close。机器模式回归覆盖全局选项前置后出现未知选项，不改准入、不打开状态；源架构审查只读，执行结果归这些日志。

驱动随后增加可选制品路径参数并清空子进程NODE_PATH；这份当前驱动实际运行在cli-portable-macos/linux-r2.log，两平台CLI执行路径位于仓库外（macOS /private/tmp，Linux /app）。对应包由pnpm10.28.1 deploy、临时inject-workspace-packages=true、prod/offline构造，全部79包复用已有存储；没有根配置或依赖版本改动。199条内部软链接均未逃逸包根，57MiB；部分测试依赖来自既有storage/conformance的明确运行时依赖，不擅自删改。这个实验尚未采用安装器/制品发布，也不等于员工已安装。Linux另用只挂制品、不挂仓库的容器完成模块加载/version探针。

复跑：恢复source.tar.gz到仓库根，Node24.21.0下pnpm install --frozen-lockfile、pnpm build；构建结束后应用typecheck/test，再执行TMPDIR=/tmp node tmp/production-cli-onboarding/cli-integration/run.mjs。可选第二参数替换CLI构建入口。Linux镜像node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6，只读挂仓库，network none仍可loopback；须有/usr/bin/script/mkfifo。包内测试不是实际终端输入测试。

失败保留：首个build的联合判别字段未拆开导致TS错误，拆为独立help/version分支；节点README两次不满足交付面字段格式，按模板修正。portable legacy/offline会重解析旧缓存索引而失败，改用共享锁的常规deploy临时配置后通过；没降低pg或改锁定版本。第一次软链接审计把macOS /tmp别名与/private/tmp真路径直接比较产生假阳性，规范化包根后审计0条逃逸，原判断不是实际符号链接漏洞。

不覆盖交互秘密TTY、TUI、不同物理机网络、apps/tenancy-host进程部署、生产凭据成本、独立安装制品、升级/每日备份或整机灾备。形式模型也只覆盖抽象输入/关闭次序，不证明2004帧可信。
