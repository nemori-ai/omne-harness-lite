# 清单存储实际组件检查（2026-09-27）

D-079 采用的 MF4 六操作源码在真实 SQLite 文件库通过 76 项组件测试；同轮静态工具 403 项测试、实际源码规则扫描、全仓 build/typecheck 退出 0。源码、测试、工具配置、输入哈希及原始成功/失败输出见 [归档](mf-component-checks-run-1.tar.gz)与[逐文件清单](mf-component-checks-inputs.json)。归档 98 个输入文件已逐项读回验 SHA，压缩的 MF 制品内部同样检查 provider key/private PEM 模式，命中 0。

真实检查包括六类别逐次替换后按固定 H 认回最后 given、全记录和精确数保留、SQLite 重开、两实例条件追加、跨会话全局引用竞争、实际 ReadTx、SIGKILL 提交前/提交后回执前恢复、具名 UNIQUE 后整次回滚及旧宽 catch 半截提交负控。缺失 schema 列曾被 selectAll 隐藏成内容损坏，失败输出保留；修复为显式列读取后，实际 schema 缺陷正常上抛。已知严格 JSON/持久值损坏与投影不合法沿各读面分支，坏最新 given 不回退旧源。

公开制品另在仓库外临时目录解包，声明编译与实际 Node 运行通过：独立闭包和 Cordis 六操作服务均消费打包导出，真实 SQLite 及无损数值往返通过。其依赖明确链接本次已构建 workspace 包；没有声称独立安装依赖闭包或跨环境可移植发行物。前三次工具/配置/SQL 行原型差异导致的失败与最后通过分别保存。

这是实施者组件检查，不是独立验收。六表存储 fixture 不冒充真实 AR 完整 fill；AR/EIS 原根和旧报告恢复链仍待接线。安全整数容量是受控边界 fixture，未实际建立 2^53 条历史；PostgreSQL 分支未执行；SIGKILL 不提升 SQLite NORMAL 的断电保证。双诊断输出异常隔离只证明业务结果不被替换，装配独立退化状态查询尚待验。bindings 不因本次测试自动新增；生产认证仍 0/37。
