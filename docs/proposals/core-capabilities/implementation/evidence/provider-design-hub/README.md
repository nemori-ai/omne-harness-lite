# 提供者设计机制的 HUB 复验

主调度在 HUB `1368c52b7255e16e9c2fcde30eebca6f870679f7` 独立读取固定
Git 对象、核对输入哈希并运行原脚本。结果归 [hub-summary.json](hub-summary.json)，
原始 stdout/stderr 与字节哈希归 [manifest.json](manifest.json)。未访问模型凭据、
发起网络请求、修改产品源码或安装依赖。

| 输入与实际操作 | 观察及边界 |
|---|---|
| `d4cd27ed33df815179f57af398c8cb6b5444302a` 的 `evidence/observability-directory/`；逐一核对原 manifest 的四个文件，再在全新目录运行原 `probe.mjs` | 四个案例通过，实际文件/容量观察与作者相符，脚本最终持有的文件句柄为零；仅证明其显式账目与有限文件交错，不证明产品 R1、Sonic/drop 接线、flock 集成、关闭未知或重启 |
| `5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18` 的 `evidence/runtime-provider-design/mechanism-artifacts.tar.gz`；核对全部 15 个普通文件与 manifest，运行原 `cordis-probe.mjs` | 三个断言组通过；stdout 与作者最终运行逐字节相同，采用 Cordis 4.0.2 的实际入口哈希一致。只观察显式延后 provide、UNLOADING 与 effect 的窗口及旧普通引用存续，不证明候选产品的同步撤代/授权门 |
| `0a6e91ea643497f309f1a69f8adecc8a98751df3` 的 `evidence/tool-decision-design/`；核对 checks 中全部来源资产、三个包设计及施工入口哈希，运行原 `cordis-current-window.mjs` | 两组观测通过，stdout 与作者逐字节相同；确认控制外壳与 apply Fiber 的区别、早于观察 stamp 的同步状态、必要 provider 的失联以及同一 consumer Fiber 重现后的旧闭包。仍不是实际 TL/HD/LE 末门验证 |

表中证据路径均相对 `docs/proposals/core-capabilities/implementation/`，由对应
固定提交提供。读取采用的 Cordis 入口为原 source-manifest 指向的 HUB 安装，
先核对 `lib/index.js` SHA-256，再执行；没有改动脚本或 source-manifest。
对应源码、来源记录和原机制结果保留在各自固定 Git 对象中，不把本目录变成
另一份提供者设计。

实际命令与结果退出码保存在 summary。临时复验目录是
`tmp/provider-design-hub-review/`；重现时从上述提交取回脚本/manifest，并为目录
探针选一个不存在的新目录。原脚本故意拒绝重用已有输出目录。复验环境是
Node v24.18.0、Linux 5.15.0-1084-aws、x64。

设计的独立评审与未闭合责任见 [review.md](../../review.md)。该证据只支持采用
这些有限机制前提，不能据此接受 diagnostics 产品、最小运行基线或完整 M1/M2。
