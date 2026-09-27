# D050可搬运CLI与独立治理中心进程验证

2026-09-25。应用/分发89项测试、类型检查、20条结构规则通过；本包保留真实失败和最终结果，不宣称完整TUI/生产接受。源码与已冻结测试依据在source.tar.gz，清单在SOURCE-SHA256SUMS；发行样本omne-cli.tar.gz是最终r3，不是通过联网安装得到的近似包。

## 实际制品

固定Node24.21.0、pnpm10.28.1，scripts/package-cli.sh先构建CLI依赖，再临时inject-workspace-packages=true、deploy prod/offline/ignore-scripts。79包全部来自已有存储，无根锁/config变更。最终归档解包至仓库外，4113项文件/内部相对软链接逐项重算，清单hash与BUILD_ID相等；根只包含dist/commands/node_modules/package.json/pnpm-lock.yaml/README/两个构建元文件，无本机SQLite状态/凭据输入文件。Linux仅挂制品的--version显示同一BUILD_ID而非development。

CLI字节闭包没有为体积擅自删除storage/conformance的既有运行时依赖；应用未增加渲染器、HTTP或授权包装层。归档构建不读用户状态、不全局安装、不上传；摘要用于完整性，不认证来源，也不承诺跨构建字节可重现。

## 三平台独立进程闭环

host-cli-*r6.log与对应raw.json：macOS arm64、Linux arm64/amd64均以真实keygen生成部署密钥、OpenSSL生成本次测试TLS材料、文件/环境配置启动dist/cli.js serve，CG/CLI不进入中心进程。客户端使用最终r3的仓库外入口；中心使用当前仓库构建。实际时钟与默认scrypt成本，无缩小时限或测试凭据配置。两个账号、多处CLI状态完整走组织创建/邀请/角色/隶属/切换/移除/拒绝邀请/改密/退出，真实PTY人读Preview、JSON管道、EPIPE中心恰一个目标请求。正常SIGTERM重启保留身份，重复serve因occupied失败，SIGKILL后重启仍保持身份且拒绝未使用的旧登录。raw.json包含部署命令、收集到的host stdout/stderr与CLI原始输出，测试断言不含输入凭据或登录出示物。

该驱动的expiry没有加速，不声称实等8小时。本包r2三平台CLI驱动另用受控中心时钟验证1小时空闲/8小时绝对边界；最终r3变更只隔离打包tar环境、编译CLI源码未变，版本marker随实际打包清单变化。r3独立中心旅程再验正式成本/重启。

镜像：Linux arm64 node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6；amd64 node@sha256:5a750d3be5e5c80275f8c9a5367c3aed99c2875656590c8d0701c7ee687f5f0a。容器临时安装测试TLS生成所需OpenSSL，实际3.0.20-1~deb12u2，版本及apt输出在日志；未把OpenSSL加进CLI制品。x64在Docker平台模拟下执行，不等于物理x64性能测量。

## 失败与局限

r1真实归档提取发现macOS tar自动加入._ AppleDouble元数据，清单失配；修复为tar独立COPYFILE_DISABLE=1，并用带xattr文件验证原始tar列表无额外成员。reviewer另指出GNU TAR_OPTIONS可排除清单；当前tar只取得PATH/LC_ALL/COPYFILE_DISABLE白名单环境，GNU容器实测继承恶意exclude时清单仍在。不是只在验收时跳过意外文件。初版审计根允许集合漏掉pnpm deploy的pnpm-lock.yaml，核其归属后补入，没有删除实际包成员。

单元故障包括build/deploy/tar失败、锁变化、坏/绝对/悬空链接、FIFO、已有目标及在tar完成时出现的竞争目标、发布后输出失败保留归档；fake command runner只造明确故障，tar/link本身是真实文件操作。源码独立架构复核无剩余本范围阻断，评审没有执行测试。

Linux最初缺openssl，之后一次Debian源503，均保留原始失败；重试没有绕过签名检查。SIGKILL是进程崩溃，不是停电/磁盘损毁。没有物理多机网络、服务管理器安装、TUI/交互秘密、升级数据迁移的新验收或每日备份/安全旧备份恢复，也没有生产发布。

复跑：恢复source到仓库根、Node24.21.0及pnpm10.28.1安装锁定依赖并完整build；构建结束再test/typecheck。调用scripts/package-cli.sh指定不存在的tar.gz，再用audit-cli-artifact.py审计；运行TMPDIR=/tmp node tmp/production-cli-onboarding/host-cli-integration/run.mjs <解包app/dist/main.js> <raw.json>。需openssl/script/mkfifo；Linux镜像挂/repo与/app并设-w /repo，安装openssl后用相同命令。输入源/dist在构建期间保持稳定，不并行重建正在被测的dist。
