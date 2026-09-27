# 健康探针单进程修补 · F5 待审映射

范围：修正已采用Docker路径中健康探针的资源生命周期；不新增产品操作、服务、契约、Fiber或重启管理者。输入为D071固定R5、EC3/HT3，以及既有公开 `apps/tenancy-host` 的 `main(argv, MainIo)`。现行 `docker.md` 的只读full-health、五标志严格true/defectCount0、5秒读取期限、64KiB输出边界和Node作为中心PID1保持。源调查仅确认有条件路径，未声称实际产品已积累僵尸进程；[Fable报告F5](review-m0-final-2026-09-27.txt)是本次修补触发。

旧包装器 `health.mjs` 用execFileSync另起CLI进程。固定Moby29.1.3健康检查取消会终止其exec进程，不能由这一步推断所有子进程也被回收；Node PID1不能被假定为通用reaper。默认外层7秒、内层5秒不能覆盖允许配置的较短外层期限或调度延迟。既有“引入OS子进程须重验回收义务”的前提因此需要修补，不以低概率豁免。

选用既有公开CLI函数入口的同进程调用：健康探针本身仍由Docker exec启动，但不再创建OS子进程。包装器动态加载发布包公开index导出的main，传入原 `ops --socket-dir /run/omne-tenancy full-health` 参数及显式MainIo。main继续拥有命令解析、原客户端、HT3解析与序列化；包装器不复制Unix socket协议、不调用包内私有模块、不改变ops输出和服务端生命周期。包内默认函数闭包公开，runtime只是消费者的框架边界保持。

MainIo只接收有界stdout，stderr不外泄细节；期限触发shutdownSignal，沿main现有AbortController交给callOps关闭自身socket。完成、错误和超时时，包装器撤销自己的计时器/处理器；主命令非0、结构不完整、输出超界、任一健康条件不成立或期限已到均失败。只有原main成功且严格完整体检成立才返回健康。Docker先终止探针时，只有这一个探针进程及其文件描述符，不产生待中心PID1接管的CLI后代。只读客户端离开不取消服务端维护。

这是对“运行公开CLI”提供路径的精化：由执行CLI二进制改为调用同一CLI的既有公开main函数，公开CLI语义和外部Docker健康命令均保持。原D071快照不改写；接受时当前节点应明确这层映射，新快照记录新provider正文，旧映射和证据保留各自身份。修补不采用增加init/reaper、延长期限或新健康CLI动词：前两者改变进程责任或不能消除路径，后者无新的产品语义需求。

验收：沿原strict predicate；真实公开main读取本地ops socket的成功/不健康/不可达路径；期限触发原abort并关闭读客户端；超界/异常失败和计时器清理；最终镜像正常健康与较短外层期限场景中没有探针后代。代码/文档改变制品清单，必须重建、记录新BUILD/镜像身份并按实际影响验证，旧I3不自动算新制品通过。helper/Compose停止协议和领域业务源若字节未变，其原分支证据可按逐文件对照沿用原范围，不重复制造同一故障记录。root负责最终映射与接受，修补执行者不自验收。
