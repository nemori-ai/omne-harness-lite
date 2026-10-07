# execution-environments-host

[English](README.md)

本包通过原环境注册表提供真实宿主命令和文件设施，包含持久Bash终端及耐久恢复责任。宿主环境不提供沙箱隔离。

## 公开入口

根入口提供独立原生函数、政策及提供者工厂。`./cordis`提供集成插件，`./migrations`提供宿主资源索引迁移。跨包使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis绑定](src/cordis.ts)
- [迁移](src/migrations.ts)
- [类型外行为](SPEC.md)
- [验证义务](verification/README.md)

`createHostEnvironment({ name, access, storage, policy? })`依赖原Storage；应用先组合并安装`hostEnvironmentMigrations`。创建工厂不执行用户命令。提供者登记到原环境注册表，原提供者和注册表保有责任直至撤除确认。

受管`hostEnvironment`插件注入原环境注册表、SessionAccess、Storage及assembly lifetime。配置只含provider名称和可选政策数据。assembly-lifecycle保有原登记及关闭责任。本包不增加HostService或ToolRuntime服务。

## 能力与使用边界

Command接收显式executable/args/cwd/env，提供合并PTY字节流（outputMode: terminal）、有界缓存及原停止控制。持久终端保留真实shell状态；每条后续命令取得当次call许可。创建call释放不关闭已移交终端。

Files提供有界read/write、stat/list/search、move/copy/remove/mkdir、条件批次和只读认回。版本表示metadata身份；外部进程仍可能在检查和发布间改写目标。多路径变更不是一次原子文件系统事务。

独立原生函数不依赖Storage或Runtime。调用者须保留原control/manifest。确认process stop后，才能用clearHostGateEntry清原准备证据；executeHostCommand返回的process.stop组合这两步。批次清理须携带prepare返回的物理stage身份。copy未知结果保留同原manifest、stage身份和发布收据，不自动重发。

平台前提是Linux、可用的systemd user manager/scope、Node及/bin/bash。用户命令取得显式环境；PTY将PWD设为cwd，TERM取显式值或xterm，不继承宿主变量。manager使用独立受控技术环境。输出、输入、时间、终端、文件及遍历有可配置预算。

## 开发

仓库安装继续禁用依赖脚本，之后只构建官方node-pty绑定。Linux的Node24需要支持C++20的编译器及node-gyp前提。旧默认编译器须显式设置CC/CXX，不开放全部依赖脚本。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness-lite/execution-environments-host rebuild node-pty
```

PTY尺寸由terminalColumns/terminalRows配置，默认80x24。增量块可以是半行或多行，不要求逐字节、逐行或硬实时交付。实际CRLF、ANSI及回车均保留，消费者按UTF-8增量解码。本包尚无实时输入或resize公开端口。

测试前先构建；真实子进程使用当轮dist worker。

```sh
pnpm --filter @omne-harness-lite/execution-environments-host run build
pnpm --filter @omne-harness-lite/execution-environments-host run typecheck
pnpm --filter @omne-harness-lite/execution-environments-host run test
```

真实进程、文件和SIGKILL测试标为slow。消费夹具不代表正式Shell或Files作者包已经交付。
