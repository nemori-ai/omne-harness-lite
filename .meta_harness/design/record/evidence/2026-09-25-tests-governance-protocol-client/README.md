# D045 无状态治理客户端运行

2026-09-25；Node24.21.0，macOS arm64 + Linux arm64容器。提供者增量采用后执行，不是CLI/TUI交付。

90项通过（原47 health回归及新增43项）：31路由逐一成功、冻结Schema副本、按操作拒绝错路由/失败/OG34分支、expectedTenant与版本出站拒绝、重复对象成员/转义同名/BOM/非规范版本字符串、深度限额、TLS失败与提前取消不尝试发送、发送后超时/取消保留sendAttempted、不重试/重定向、输入快照。类型检查及构建通过。测试HTTP对端为合成TLS服务器。

生产客户端包的编译产物分别在macOS和Linux驱动真实Cordis/SQLite/HTTPS组合，七组通过：注册登录、创建/切换、旧身份拒绝、按名邀请/拒绝、登录期限列表、改密失效、新登录/退出。每次先用无秘密health核对同一中心，再发送业务；中心与客户端同进程但经真实TLS回环，不是物理多机或独立进程CLI。Linux镜像node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6，--network none，源码挂载只读；不是离线重建/安装分发验证。

source.tar.gz与source-sha256保存客户端最终输入、锁文件和两个驱动器。服务端来自[本批入口快照](../2026-09-25-tests-entry-production/README.md)，新增依赖仅IV/OE公开Schema与既有Ajv；lockfile首次网络ECONNRESET重试后完成，失败输出保留。最终格式化只改变排版，未再次扩大测试声明。

未覆盖：本地登录保存/CAS、CLI命令与退出码、TUI/IME、响应超过64KiB的业务可用性、同证书端点在health和业务间换中心、安装分发或灾备。sendAttempted只说明可能发送，不证明远端效果；health保留EC1/HT1解码，业务消费EC2/HT2。
