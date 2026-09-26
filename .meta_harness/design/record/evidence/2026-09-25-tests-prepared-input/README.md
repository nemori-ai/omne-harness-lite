# CG2固定动作交互输入的实现验证

2026-09-25，D048接受的CG2 S16新增路径与既有完整Input回归。最终139项测试（106既有+33新增）、build/typecheck通过，日志prepared-review-{build,types,tests}.log。宏观规则20项通过，prepared-rules-r1.log属于修复两处取消分支之前的规则运行；最终修复没有新增规则豁免。源码与精确输入在source.tar.gz、SOURCE-SHA256SUMS。形式/114个Schema场景归[独立模型运行](../2026-09-25-formal-prepared-input/README.md)。

最终prepared-review-macos.log及-linux.log为实际编译CG2+CLS+Cordis中心HTTPS/SQLite，两平台arm64、Node24.21.0。除了既有治理旅程，还验证安全CA摘要预览及预览期间另一客户端真实登录不同账号，原目标仍按原账号执行、原CAS冲突不覆盖新登录。中心和客户端同进程loopback、时钟受控、密码成本为测试配置；输入回调为受控函数，不是实际TTY/CLI。Linux镜像固定node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6，网络none仍可内部loopback。

复跑：Node24.21.0恢复源码、pnpm install --frozen-lockfile、pnpm build，构建结束后运行成员typecheck/test，再以TMPDIR=/tmp运行tmp/production-cli-onboarding/prepared-integration/run.mjs；Linux以固定镜像只读挂载仓库/repo执行同一文件。TLS材料均为仓库测试夹具，没有实际员工账号。

失败保留：r2两个错误夹具（AR2成功误写结构、OG23误写组织字段）修正为权威表示；macOS r1的登录数仍沿旧流程2，新增外部换登录后显式重新登录使Alice共有3个登录，驱动据实际步骤改正。独立审查提出两处真实实现缺陷：complete返回后取消仍交付副本、health失败绕过取消回退；review-negative两份日志分别证明新增断言失败，修复后139项和两平台重跑通过。不能把此前137项当修复后验证。

本次不覆盖真实终端/输入法、任意第三方输入回调、不同物理机、安装分发、升级备份或生产接受。JS字符串没有可靠擦除承诺。
