# D1 原生依赖的 HUB 接入

HUB 在 `21519f07820efcbafaefe1b2a3ed6a6e21be7a06` 的叶 manifest 上生成根锁，
只新增 `fs-ext@2.1.1` 及 `nan@2.28.0`；根 `onlyBuiltDependencies` 仅列
`fs-ext`。实际 Node 24.18.0、pnpm 10.28.1，采用 P0 已验证的本地 GCC 10.5
工具链，未改变系统编译器。原始输出、退出码与字节哈希见 [manifest](manifest.json)。

冻结安装禁用依赖脚本。第一次根目录 `pnpm rebuild fs-ext --pending` 和
随后不带 pending 的调用均退出 0，但没有构建叶成员依赖；真实加载返回
`MODULE_NOT_FOUND`，失败原件保留。这两个退出码不算构建成功。

依照当前 CLI 帮助与 [pnpm 10 rebuild 文档](https://pnpm.io/10.x/cli/rebuild)
指定成员后，实际执行成功的命令为：

```sh
CC=<gcc10-root>/usr/bin/gcc-10 \
CXX=<gcc10-root>/usr/bin/g++-10 \
GCC_EXEC_PREFIX=<gcc10-root>/usr/lib/gcc/ \
pnpm --filter @omne-harness-lite/diagnostics rebuild fs-ext
pnpm --filter @omne-harness-lite/diagnostics exec node -e 'require("fs-ext")'
```

构建日志实际包含 node-gyp/C++ 编译、链接与复制 addon；随后从 diagnostics
成员加载真实 addon 成功，公开 `flock` 为函数。更完整的加载输出与 addon
SHA-256 在 manifest 及日志中，不能用这些结果替代 D1 的真实多进程锁、目录
账目、关闭未知、恢复或独立 tarball 验收。该依赖接入也没有合入作者尚在施工的
R1 产品实现。
