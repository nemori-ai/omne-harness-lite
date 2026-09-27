# Docker单进程健康绑定的局部实现检查

依据[D072](../../decisions/governance-docker-health-binding/decision.md)，实现提交73382d84与文档精修9c69e066合入主线 `b88da2da9e7bb30bd23a6dc097631e987bca319b`。独立实施者Sol xhigh只改health.mjs、操作README和health测试；root审完整差异并在HUB验证实际整合。公开CLI main、ops客户端、helper、Compose与领域源码不变。

健康探针改为同进程动态调用发布包公开main；5秒期限从加载前起按单调时间核对，过期不发新请求、不接纳迟到成功；MainIo信号沿原AbortController关闭读socket。输出按UTF8字节限64KiB，严格体检保持；完成/错误清理计时器，不再创建CLI子进程。运维说明补可信归档SHA与加载后本机镜像ID的区别、版本管理、备份新鲜度、锁继承与日志命令，并只声明TUI测试边界。

macOS arm64，Node24.21.0、pnpm10.28.1、Bash5.3.15、TMPDIR=/private/tmp。实施者build、typecheck和局部format通过；最终4文件37项通过、0跳过，包括maintenance-command。root在HUB重新build/typecheck，实际3个docker测试文件26项通过、0跳过；命令原件和精确文件清单分别保存，不相加为63项，也不称全仓测试。

健康测试用实际公开main与真实Unix socket，成功路径加载本地构建的dist/index并验证原ops请求及完整HT3答复；取消路径使用公开源main，同样经原客户端，未应答时按期限失败，服务端迟写得到EPIPE/ECONNRESET确认整连接结束。服务端为测试夹具，不把该测试称作治理中心真实部署。加载迟到、结果迟到、错误/超界与原严格健康字段分别有有界检查；无child_process源码路径检查只作补充，不代替真实进程验收。

首次超时测试只等待服务端close，忽略原socket.end()是写半关闭，因测量方式挂起而失败；失败日志保留。修订后用迟写错误核连接关闭。早轮默认Bash等环境条件造成15项跳过，也保留原日志；最终显式Bash及GNU工具路径运行37项均通过。实现复核另纠正操作说明引用不存在的image-build version字段，改指实际封装build-info与BUILD。

本记录仅接受局部源码/整合检查，不接受新镜像或Docker整体交付；新制品重建、实际请求在途时的Docker外期限取消/无后代与Fable定向复核仍待。旧I3保留原BUILD和覆盖，不迁移为本次产品执行。

[原始包](raw.tar.gz) SHA256 `1d136f0bdd1a6681cba95a83acbd01dd8a570bc4069023e7a3bab1667eb473f7`；[逐件摘要](files.sha256.json)共22件，含输入源码、实际日志与配置。镜像、宿主环境故障和未覆盖组合不从此有限运行推断。
