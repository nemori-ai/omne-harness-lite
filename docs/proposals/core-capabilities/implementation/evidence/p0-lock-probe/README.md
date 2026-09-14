# P0 原生 `flock` 与同步探针

## 结论

在本页列出的单个真实环境中，`fs-ext@2.1.1` 可以在 Node.js 24 上构建并加载，且
Linux `flock(2)` 绑定满足 P0 需要继续实施的基础语义：两个进程和同一进程的两个
独立 open file description 不能同时取得排他锁；持锁进程进入 `SIGSTOP` 后不会
被超时接管；持锁进程死亡或关闭持锁 fd 后，另一进程可以取得锁；整个测量中锁
文件保持同一 device/inode。探针还执行了完整 JSON 行的写入、文件 `fsync`、新建
目录项所需的目录 `fsync`，随后按字节和结构读回同一记录。

这是 P0 可行性和环境测量，给 A06/A07/A30/A31 的后续正式实现与验证提供前提。
它没有实现或验收 `core-journal/1`、writer epoch、旧句柄封闭、损坏恢复或独立
tarball 产品消费者，因而不表示 A06、A07、A30 或 A31 已通过。

## 采用输入和官方发行物

- 仓库输入基线：`e11cc6990c1354e7baf138cc2f501effc7b413f6`；消费
  `capability.durable-records` v1 的 DR-03/04/05 和
  `composition.core-work-coordination` v1 的 CC-03。
- npm 精确发行：`fs-ext@2.1.1`，发布时间 `2024-11-04T18:08:56.745Z`；
  [npm 元数据](https://registry.npmjs.org/fs-ext/2.1.1)声明安装脚本
  `node-gyp configure build`、依赖 `nan@^2.21.0`，包内许可字段为 MIT。
- 官方源码 tag：[`v2.1.1`](https://github.com/baudehlo/node-fs-ext/tree/v2.1.1)，
  实测 `git ls-remote` 得到 commit
  `aded976099c2b06c944f0897a9b004dbf266e234`。
- 官方 tarball：SHA-1
  `f60bdb6506681ccc21e5ea5623bc990dd0216fd7`，SRI
  `sha512-/TrISPOFhCkbgIRWK9lzscRzwPCu0PqtCcvMc9jsHKBgZGoqA0VzhspVht5Zu8lxaXjIYIBWILHpRotYkCCcQA==`。
  探针下载后独立计算并核对两者，再从该 tarball 安装。

## 实际环境与构建边界

通过环境为 Node.js `v24.18.0`（ABI 137）、pnpm `10.28.1`、npm `11.16.0`、
Ubuntu 20.04.6、Linux `5.15.0-1084-aws`、x86-64、本地 ext4
`/dev/nvme1n1` 挂载 `/data`（`rw,noatime`）。node-gyp `11.5.0` 使用 Python
`3.8.10`、GNU make 和 Node `v24.18.0` 的官方 headers。

默认宿主只有 `g++ 9.4.0`；它不能解析 Node 24 gyp 生成的
`-std=gnu++20`，第一次显式 rebuild 因而失败。系统路径中还逐项核对了
`g++-10/11/12/13/14`、`clang++` 与 `clang++-16/17/18`，均不存在。没有修改
宿主系统；从当前 Ubuntu 仓库下载六个固定版本的 GCC 10 deb，在本任务 `tmp/`
中验证 SHA-256 后用 `dpkg-deb -x` 解开。成功运行仅设置：

```text
CC=<toolchain-root>/usr/bin/gcc-10
CXX=<toolchain-root>/usr/bin/g++-10
GCC_EXEC_PREFIX=<toolchain-root>/usr/lib/gcc/
PATH 保持原值；CC/CXX 使用绝对路径
```

完整包名、来源路径、哈希和当前保留位置见 [toolchain.json](toolchain.json)。默认
编译器的完整失败日志见 [default-compiler-failure.json](default-compiler-failure.json)。
成功构建仍出现上游 NAN/C++ 的 function-cast warnings；这些 warning 没阻止本次
加载和锁测试，但后续采用时应作为 Node 升级与依赖维护风险保留，而不是视为干净构建。

## 安装与探针结果

隔离项目先执行以下命令，`package.json` 同时只允许 `fs-ext` 成为可构建依赖：

```text
pnpm install --ignore-workspace --ignore-scripts --store-dir <sandbox>/.pnpm-store --reporter append-only
pnpm rebuild fs-ext --pending --ignore-workspace --store-dir <sandbox>/.pnpm-store --reporter append-only
```

第一条之后 `build/Release/fs_ext.node` 不存在，实际 `require('fs-ext')` 返回
`MODULE_NOT_FOUND`；这证实安装退出 0 并不代表 native addon 可用。第二条只运行
`fs-ext` 的 `node-gyp configure build`，成功生成并加载 addon；本次 addon SHA-256
为 `5a480ff04f21754f6c3a8d5efd91b05d9df0ae82a72d71092a215ee2b0ae9a0d`。

[summary.json](summary.json) 保存完整命令、stdout/stderr、环境、具体 PID、错误码、
inode、同步边界和以下结果：

| 场景 | 实际观察 |
|---|---|
| 两进程排他 | holder PID 90463 持锁时 contender PID 90475 得到 `EAGAIN` |
| 同进程独立 fd | fd 22 持锁时 fd 23 得到 `EAGAIN`；前者解锁后后者成功 |
| 暂停与死亡 | `/proc` 确认 holder PID 90488 为 `T (stopped)`；contender PID 90510 仍得 `EAGAIN`；holder `SIGKILL` 退出后 PID 90526 成功取得锁 |
| 关闭释放 | holder PID 90552 关闭 fd 前另一进程得 `EAGAIN`；关闭后 holder 仍存活，PID 90594 成功取得锁 |
| 稳定 inode | 全程 device `66304`、inode `12898511`，锁文件未删除或替换 |
| 最小记录 | 171-byte、LF 结尾的 probe-only JSON 行，SHA-256 `c8a6f0ea8c078e4e60e6d899088767a18e6fc4980170e1d76257bd7ead7c2ef6`，精确字节与结构 round-trip 均相等 |
| 同步 | 锁文件、记录文件和每个新建目录项的所属目录均收到成功的 `fsync` 返回 |
| 清理 | 所有受管子进程自然退出或按场景等待 `SIGKILL` 退出；最终计数为 0 |

## 精确复现

在指定 worktree/分支或包含本提交的后继检出中执行。每次给探针一个不存在的 fresh
sandbox 路径；探针拒绝复用旧目录，避免把旧 addon 或 inode 当作本次结果。

当前主机复现所用的隔离编译器准备命令为：

```bash
mkdir -p tmp/p0-lock-probe/replay-gcc10-debs tmp/p0-lock-probe/replay-gcc10-root
cd tmp/p0-lock-probe/replay-gcc10-debs
apt-get download \
  g++-10=10.5.0-1ubuntu1~20.04 \
  gcc-10=10.5.0-1ubuntu1~20.04 \
  cpp-10=10.5.0-1ubuntu1~20.04 \
  libstdc++-10-dev=10.5.0-1ubuntu1~20.04 \
  libgcc-10-dev=10.5.0-1ubuntu1~20.04 \
  gcc-10-base=10.5.0-1ubuntu1~20.04
sha256sum ./*.deb
for archive in ./*.deb; do dpkg-deb -x "$archive" ../replay-gcc10-root; done
cd ../../..
```

将 `sha256sum` 输出与 [toolchain.json](toolchain.json) 逐项核对，再执行：

```bash
probe_root=$PWD
toolchain_root=$probe_root/tmp/p0-lock-probe/replay-gcc10-root
CC=$toolchain_root/usr/bin/gcc-10 \
CXX=$toolchain_root/usr/bin/g++-10 \
GCC_EXEC_PREFIX=$toolchain_root/usr/lib/gcc/ \
node docs/proposals/core-capabilities/implementation/evidence/p0-lock-probe/probe.mjs \
  --sandbox $probe_root/tmp/p0-lock-probe/replay-node24-fs-ext-2.1.1 \
  --output $probe_root/tmp/p0-lock-probe/replay-summary.json
jq -e '.status == "passed" and .cleanup.managedChildrenRemaining == 0' \
  tmp/p0-lock-probe/replay-summary.json
```

已保留本次隔离工具链与两个安装 sandbox，供 HUB 复验；它们均位于
`tmp/p0-lock-probe/`，没有进入产品包或根锁文件。

## 后续集成的精确要求和未知

后续 workspace 与独立消费者需要锁定 `fs-ext@2.1.1` 及其闭包，在默认禁用所有
依赖脚本的安装后，以 allowlist 明确允许并仅 rebuild `fs-ext`，随后在 Node 24
实际 `require` addon。构建环境必须提供支持 `-std=gnu++20` 的 C++ 编译器、C
编译器、make、Python 和与实际 Node 24 patch 版本匹配的 headers；本机的
`g++ 9.4` 不满足。根配置、workspace/lockfile 和 package-checks 的实际接入归
整合者，当前探针没有改动它们。

正式提供者还必须自行兑现：规范化且由部署控制的本地域目录、稳定锁 inode、同进程
第二 owner 拒绝、epoch 持久化与旧句柄封闭、关闭时关门/排空/同步、完整坏行与断尾
恢复分类，以及写失败后的 unknown/隔离。`flock` 是 advisory lock，不能阻止绕过
提供者的恶意代码直接写文件，也没有测试 NFS 或其它网络文件系统。

本次 `SIGKILL` 只证明真实进程死亡会释放内核锁；它不模拟断电。文件/目录
`fsync` 成功只表示本机 Linux/ext4/设备栈接受了同步请求，不能证明任意硬件和掉电
条件下的耐久性。probe-only `p0-lock-probe/1` 记录也没有 `core-journal/1` 的长度、
摘要、重复键、stream revision、operation 去重或恢复语义；正式 codec 固定后必须
另做故障注入和重启验证。
