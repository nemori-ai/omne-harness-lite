# 单机中心分发与SQLite备份机制 · 2026-09-25

事实一：Node24.21.0/pnpm10.28.1从当前host生产依赖闭包部署到仓库外目录，实际keygen/serve及CLI治理旅程、正常与强杀重启/同库排他通过。host与CLI都从独立目录运行，客户端为D051实际制品；中心探针归档与逐文件/链接清单在本目录。只将既有e2e deploy夹具的HOST_APP改为该目录、client.ts导入保持原仓库测试工具，未改产品实现。使用真实时钟、默认scrypt及新生成测试TLS/密钥。没有安装服务管理器、制作OCI镜像或正式host打包脚本，也不是Linux中心运行证据；本轮是在macOS arm64上核模块闭包。

事实二：Node24.21.0内置SQLite3.53.4，readOnly连接通过backup取得含未checkpoint WAL提交的完整副本，integrity_check/foreign_key_check通过，源WAL字节未变；原目标为有效数据库时会被覆盖。sqlite-backup.mjs与原始结果可复跑。只验证这一机制，没有验证产品备份的发布、目录同步、取消/关闭、容量、磁盘损毁、隔离恢复或安全再开放。

来源：[Node精确版本文档](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/sqlite.md) sqlite.backup节，2026-09-25通过网页工具读取；直接curl取源码因SSL连接失败，未关闭TLS验证。文档说明已有目标会被覆盖、分批异步完成、其他连接写入会重启复制；因此这项API自身没有给出任意写压下的完成时限。[SQLite Backup API](https://www.sqlite.org/backup.html)补充其一致复制范围。这里不把文档通用说明升级为应用已拥有的安全恢复能力。

复跑：从D051实现运行包source.tar.gz恢复仓库/构建，在同Node/pnpm版本执行pnpm --filter @omne-harness-lite/tenancy-host --config.inject-workspace-packages=true deploy --prod --offline --ignore-scripts <新绝对目录>，将测试deploy.ts里的HOST_APP指到该目录；TMPDIR=/tmp node host-journey.mjs <CLI制品入口> <新raw输出>。需要openssl/script/mkfifo；脚本原有相对路径以其归档前的tmp/production-cli-onboarding/maintenance-probe位置为准。sqlite-backup.mjs只依赖Node，自建合成库并清理。

本报告只提供观察和局限，不选择备份/部署架构。方案由design/record/proposals/governance-production-mechanisms/single-host-delivery.md承接。
