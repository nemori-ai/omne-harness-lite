# pnpm10.28.1的CLI离线依赖闭包观察

2026-09-25；源码CLI依D049实现，本报告只记录分发工具事实，不产生安装采用。官方[pnpm10 deploy文档](https://pnpm.io/10.x/cli/deploy)说明默认路径使用共享锁的独立部署，需要injected workspace配置；legacy路径可绕开该配置但不生成独立锁。实际本地help确认10.28.1，命令行为另以以下日志为准。

legacy/prod/offline探针失败：旧缓存元数据无法为pg8.23.0重新选版本。已安装的包与锁确实为8.23.0；未降低版本。使用仅本次命令的inject-workspace-packages=true、常规deploy/prod/offline后，79包全部从既有存储复制，根工作区配置不变。产物约57MiB；vitest是core/storage/conformance在已采用节点中的运行时依赖，不能因为CLI不用该子路径就静默修改旧依赖设计。

把包复制到仓库外实际目录，规范化macOS /tmp→/private/tmp后，199条软链接均落在该包内部；首次未规范化造成错误逃逸判断，不能称真实漏洞。Node24.21.0在macOS arm64、Linux arm64及Linux amd64均从仓库外/app执行完整CLI治理旅程，真实CLI子进程/PTY/管道/EPIPE和文件拒绝路径都通过。Linux arm64另用只挂制品而不挂仓库的容器完成version模块加载探针；完整旅程的中心驱动另读仓库代码，CLI模块不从该目录加载，NODE_PATH清空。

驱动第二argv是制品CLI入口；默认仍为仓库构建入口。记录保留原始命令日志、Linux24.21.0多架构manifest与所用amd64 digest。没有生产员工账号或部署；TLS是测试夹具，中心时钟受控，密码成本为测试值。macOS Intel、其他Node版本、真实物理多机网络及安装/升级脚本尚未验证。此观察支持包闭包可搬运，不证明安装原子性、制品来源可信或旧状态兼容。
