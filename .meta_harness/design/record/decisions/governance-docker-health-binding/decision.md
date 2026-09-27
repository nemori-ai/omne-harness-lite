# D-072 · 采用健康探针单进程绑定修补

2026-09-27，主线依据用户“自己设计和架构、由Sol xhigh编程、负责验收review并决定接受”的授权，接受[局部候选](../../proposals/governance-docker-deployment/health-single-process.md) SHA256 `169c9a265da0114d396fd01d91b8b0207dc5971c814bef50ff5a90b7c6647efc`。独立架构[评审与处置](../../proposals/governance-docker-deployment/review.md#f5-单进程绑定的独立架构评审与处置)范围内无阻断；不把评审意见当作产品验证。

只精化D071继承的健康包装器绑定：由另起CLI进程改为在Docker健康探针同一进程调用已公开main(argv,MainIo)。原ops命令参数、Unix socket、权限/身份、HT3解析与输出、只读语义由原入口/客户端继续承担；包装器只拥有完整调用期限、输出字节上界和严格就绪判定。期限含动态加载，过期不许迟到成功；沿现有shutdownSignal→AbortController→callOps.destroy取消读请求，完成/失败清理自身计时器，不建立新transport、服务或reaper。

理由是旧包装器的CLI后代在Docker先取消探针时可能转由Node PID1接管，不能以默认7秒大于内部5秒保证回收；支持的较短外期限也可触发。这里只认领源码可因果解释的条件路径，未声称已测到产品僵尸。保留反论：公开index加载图更广，新包装器须用精确期限/字节上界补齐旧execFileSync提供的边界。

取代范围仅为健康探针的调用机制；D071停止/等待/unknown、D070其他部署采用和EC3/HT3不变，不发布新语言无关契约。D071原快照和旧I3结果保持原身份。当前节点和PF017 projection/v8记录此后续版本，精确文件见provider-snapshot；不原地改写v7。

实施者负责局部源码、真实公开main/ops socket及截止清理测试。最终新镜像须验证正常完整体检，并在先确认真实请求在途后由Docker较短外期限终止，观察探针消失、无后代和客户端断开。新制品重建与身份核验是接受前提；未变helper/Compose/领域源码的旧证据可逐文件核对后保留原范围，不改称新镜像实跑。root整合与独立验证、Fable定向复核后另行决定Docker整体接受。当前仅设计与实施路径接受。
