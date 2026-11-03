# 作者验证

运行 pnpm --filter @omne-harness/tool-definitions build、typecheck、test。测试从包公开导出构造作者，并用 Tool binding 读者取得受信执行者，交给真实 executeTool/createIndependentToolScope。

public-entry 检查命令声明、help 和精确字节编辑。files-behavior 检查预检零写、重叠、批次未知、分页及操作映射。shell 检查明确配置、终端路由、cwd、后台零启动与中文字节上界。shell-control 检查单句柄停止、未确认及输出丢弃。contract-doubles 另外消费 Execution 已有内存文件与脚本进程。

files-behavior 在 move 与 copy 门面边界核对 replace 和 expectedVersion。shell-control 启动独立 Node 子进程运行 [early-result-rejection.ts](fixtures/early-result-rejection.ts)。该用例经公开作者与 executeTool 分别执行 command、terminal 路径，让终局先拒绝、输出后结束，核对未处理拒绝为零、输出排空及 unknown 结果。子进程消费已构建的包，测试前须完成 build。

这些是作者行为测试。fixture 不验证租户授权、安全文件根、PTY、真实进程停止或跨进程耐久。取消后的停止文本通过真实 scope.context 直接运行作者核对，因为独立包装器会拒绝已取消作用域的返回值。独立接受不在本测试目录内。
