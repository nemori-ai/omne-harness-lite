# Files 与 Shell 作者行为

## 范围与依据

本包按 #421 修订 6 的 C-TOOLS 实施输入实现 Files 与 Shell 根作者。产品含义归 [Meta Capability](../../../.meta_harness/design/product/meta-capabilities/design.md)。多命令作者与普通文本返回采用 [Tool 契约](../tool-contract/SPEC.md)，设施采用 [Execution 契约](../../execution/execution-environment-contract/SPEC.md)。本包负责参数、操作映射和结果文本。宿主授权、真实文件系统、PTY、持久化与 Cordis 装配由消费者提供。

## 结果与不变量

### 命令与参数

全部命令使用 declared 参数。实现、参数校验、公开 schema 与 help 使用同一张[命令表](src/commands.ts)。未知字段、重复 JSON 键、错误类型及不完整输入均不进入执行者。Files 的 open 与 Shell 的后台标志在本次交付中明确返回 unsupported，且不启动设施。

### 精确编辑与批次

edit 要求非空原文恰好出现一次。它读完整原字节，以 UTF-8 解码，在内存修改，然后以读取的 expectedVersion 替换。中文、BOM、CRLF 与无末尾换行的未编辑内容保持原样。非法 UTF-8 拒绝编辑。

patch 先读取全部目标并针对原文计算所有范围。重复或重叠范围、不同路径指向同一对象、缺失或多处匹配均拒绝，尚未提交任何目标。全部预检通过后只调用一次 commitBatch。多文件提交不保证同时可见。返回包含计划 diff、原批次身份与已确认发布路径。unknown 不表示全批落盘，也不触发自动重发。原批次恢复由宿主继续承担。

### 文件观察

list 使用 FileEntry.name，不解析对象令牌。任一条目缺少有效名称时，整个列表返回 unavailable，不补造名称、不静默丢条目、不交出部分列表。read、list 与 find 保留版本和分页事实。write 和 edit 转交设施返回的 writeEffect，区分创建、原位修改与替换为新对象；未报告时明确标为 unreported，不猜测效果。find 显式区分 name 与 content。info 返回 stat 确认的类型、大小与时间，并读取至多 min(4096,resultMaxBytes) 字节作为二进制样本。样本观察不证明整份文件是文本。版本变化时不把样本归到旧 stat。

### 文件路径解析

本节按 R2-D290 定。执行环境的 `FileRequest` 没有工作目录字段，所以由 Files 作者解析相对路径。

- Files 的构造值可带 `cwd`，即工作区根。它与 Shell 的 `cwd` 同源，由运维者层给出。`cwd` 必须是绝对路径，否则构造失败。
- 路径风格取 `cwd` 自己的写法：盘符或 UNC 开头按 Windows，`/` 开头按 POSIX。不取运行作者的进程平台。
- 有 `cwd` 时，相对路径在调用设施之前解析成绝对路径。`.` 就是 `cwd`。适用的路径有 `path`、`move` 与 `copy` 的 `target`、`patch` 每一项的 `path`。末尾的分隔符保留。
- 绝对路径不变。Windows 风格下带盘符的相对路径（如 `C:a`）也不变。
- 解析只换字符串，不授予访问。解析后越出工作区的路径照常交给设施，由宿主的守卫与设施按现有规则答复，例如 `notAuthorized`。作者不另加放行，也不另加拒绝。
- 结果文本的头部保留模型给的路径。解析改变了路径时，另带 `resolved_path`。
- 没有 `cwd` 时，相对路径原样交给设施。设施以 `invalidInput` 拒绝时，结果文本末尾加一行说明：需要绝对路径。
- 工具说明与参数说明写明：相对路径按工作区根解析。

限制：声称 `filesystem-root` 的落点要求相对授予根的路径，绝对路径答 `invalidInput`。这种落点上不配置 `cwd`，相对路径原样交给落点。

### Shell 路由与控制

没有 terminal 参数时，execute 调用 command.start，使用显式配置的可执行文件、参数前缀、初始 cwd 与 env。create_session 声明 Session 保留；带 terminal 的 execute 与 close_session 先由本次获取 attach，再调用对应设施。缺保留或附着能力时明确 unsupported，不创建替代终端，也不回退为一次性执行。terminal 的持续状态归提供者，作者不保存会话表。单次 cwd 与 env 覆盖只转发到本次调用。

Windows terminal 的 completed 表示前台段结束，不证明持久 shell 退出或业务成功。输出按观察窗口归属，前台已写未读字节也可能出现在后窗；空脚本不保证排空；close 可释放尚未交付的空闲缓冲。help 说明这些限制，未知退出码不显示为成功，未交付字节不显示为已交付。

执行前已取消时不启动。启动后中断只请求当前 ProcessHandle.stop('forced')。未确认停止保留 unconfirmed。作者继续排空唯一输出读者并等待原终局。流或终局异常返回 unknown。停止未确认且提供者仍不终结时，作者可能继续等待，不能声称进程已结束。

### 文本上界

resultMaxBytes 必填，且是正安全整数。它限制作者返回字符串的 UTF-8 字节数，包括文本内的状态、元数据、diff 与截断标记。ToolResult 外层封装由 Tool 拥有。能容纳标记的预算保留首尾，并标出被省略的字节范围。过小预算只保留截断标记能放下的前缀，不能承诺完整帮助或完整状态文本。

Shell 为各输出流分别增量解码，连续块拆开的中文不会损坏。设施 observedOffset 的空洞与 discardedBytes 分别显示。工具自身的截断另有标记。文本窗口与空洞窗口使用有界内存，达到文本预算后仍继续读取输出。

## 所有权、失败与生命周期

环境门面只接受路径、字节与操作参数。每次请求的新 requestId、当前 access/origin/binding，以及授权对象 named 均由宿主填写。门面类型不授予权限。对象身份、句柄代与版本保留为观察事实。

设施的 done、rejected、unknown、unresolved 分别保留。done 只确认原请求的一项效果。输出失败、停止或 disposer 不回滚外部效果。文件句柄与终端的最终释放由原获取拥有者承担。根作者不缓存租约、权限或跨调用终端状态。

## 组合与验证

[成员测试](tests/README.md)通过公开根作者、真实 executeTool 与 createIndependentToolScope 运行。定向设施和 Execution 的内存/脚本替身只证明作者映射。取消时独立包装器不再交出返回值，因此停止文本另以真实作用域上下文核对。真实后端、跨获取 terminal 保留/附着、生产 Cordis 贡献及完整 ToolResult 交付仍由父线组合验证。
