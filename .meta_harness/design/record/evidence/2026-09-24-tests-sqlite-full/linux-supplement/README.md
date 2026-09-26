# Linux arm64 补充运行

Node 24.21.0，镜像 `node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`，关闭网络，仓库只读挂载 `/workspace`。运行本脚本，库文件创建在容器独占临时目录，结束后删除。消费已构建 dist 与 workspace 依赖；不代表离线安装或分发已验证。

NORMAL/FULL 各首次打开与重开，共四组通过；每组核实际读写句柄的 PRAGMA 和 WAL，写入后读到已提交行。第一次脚本误要求 SQLite 行具有普通 Object 原型而失败；node:sqlite 实际返回 null prototype，修正为比较完整自有字段后重跑。首轮脚本与失败输出保留在 attempt-1，没有改变参数或持久行断言。

没有跑 Linux 全部符合性/host 黑盒、性能或物理断电。原 macOS 证据范围不改。
