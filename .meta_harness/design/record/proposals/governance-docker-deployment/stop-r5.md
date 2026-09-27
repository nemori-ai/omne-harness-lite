# R5 候选：让正常停止请求的收场证据更精确

**候选，尚未接受，不供 I2 自行改停机协议。**沿 D-067 的单一 Engine 重启、非 root 应用、无限正常排空、未知不冒成功、无自动重放要求，只检查 helper 的 stop 实现接缝。依据[固定 Engine 源观察](../../../../research/governance-docker-runtime/reports/2026-09-27-engine-stop-source.md)；没有新产品能力或存储对象。

## 继承性质与新发现

用户要正常停止后完成资源排空，已停止中心不因计划 daemon 重启复活；客户端失联只能报告未知。应用 exit0 与停止意图分开：一个自行退出的应用也可能 exit0。I2 当前用 preinspect running、docker stop 退出0、postinspect exited 推出成功，但两个 stop API 早返使这种推断不充分；源观察尚不是已执行的竞态反例。

本次先读过机制，新的双盲读数未达成；性质直接继承 D-067/EC3/HT3，不按实现方便性删除。Engine 不提供跨 API 调用的原子事务；root helper flock 只排除本 helper 的并发控制，不能把三个 Docker 请求合成一次事务。

## 三条实际候选

| 候选 | 承载及优势 | 代价／反例 |
|---|---|---|
| S-A：保持 stop(-1)，另取这次确实发信号的事件证据 | 保留现有受审停止原语，监听同容器 kill/stop 事件，再等待实际退出 | 必须可靠关联事件与本次请求，不能用缓存旧事件或时钟猜关联；监听断流／早返时未知；多一个受管事件流生命周期。 |
| S-B：显式 Engine TERM 请求，再单独无限等待 | `docker kill --signal=SIGTERM <exact ID>` 只发正常终止信号；成功后 `docker wait` 与 inspect 核真实 exited/code。非 SIGKILL 路径无 stop 的 NotModified 早返，不用额外事件流或改 restart policy | API 名为 kill 但不得省略 signal 或换 KILL；不能把发信号成功当排空完成；已经退出／API错误保留意图未知；需用真实应用验证。 |
| S-C：先把 restart policy 置 no 再停止，显式 start 恢复原策略 | 停止意图作为 Engine 可读配置，操作人员容易查看 | SetPolicy 不撤销已安排 timer，仍须另行处理正在重启的执行；支持的配置状态变多，升级/create 的复用行为要新协议，代价超过本接缝。 |

主线目前推荐 S-B，但须先做固定版本最小实验和独立架构复核。S-A 的最强理由是保持原路径；当前事件关联成本没有独立收益。S-C 的最强理由是可读配置；不能把只改策略误当撤销所有已排程重启。

## S-B 精确候选边界

支持镜像为已验 Node 直作 PID1、应用处理 SIGTERM 的固定制品；start 的实际检查拒绝自定义非 TERM StopSignal。保持 unless-stopped，不动运行期策略。取得 project/service/image 对应确切 ID，持有既有 start/stop 锁；正常停止只对其发一次 Engine SIGTERM，**绝不发 SIGKILL、不从容器内部绕过 Engine 发信号、不为制造停止意图先启动**。API 失败或结果丢失为 unknown，不自动重发。

请求成功仅记“Engine 已接受正常终止请求”；然后单独等待该 ID 真正退出，inspect 与 wait 的退出码相符才报告应用 clean0 或 stopped-with-error。等待没有截止后强杀，客户端离开不删资源。初始就 exited 的容器可报告观察到的进程终态，但本次没有获得停止意图确认，返回非零且保留身份，不能因为重复调用就捏造新确认。

离线维护 restart=no，仍只须对已取得的单次 ID 发正常 TERM 并等实际结束；如果信号到来前任务已经真实完成，可以基于该任务真实退出与原工具输出结算，不能把中心跨 daemon 的 restart 意图问题机械套到单次任务。创建期间尚无 ID 时显示已生成唯一 name／未知，不启动或重放另一任务。

**条件保证**：Engine 正常运行且其元数据存储正常、没有与支持 stop 并发的 daemon shutdown／外部管理命令，才采用该路径的人工停止标记含义。源观察已发现 checkpoint warning 不透传、shuttingDown 跳过标记；不声称 API ack 是无条件耐久证明。计划 daemon 维护仍先完成支持 stop；并发 Engine 故障落原未知／故障恢复范围。这个条件也限制 S-A 和原 D-067 的跨 daemon 正例，不能藏在测试通过里。

## 验证与采用门

先用私有 Engine29.1.3：实际 TERM 后仍需持有门超过31秒、释放后才退出；exit0/exit1 各跨私有 daemon 重启不复活；已经退出时 stop API 的返回与非 KILL signal API 的返回分别原样记录；restarting 状态下的实际行为单列，不拿 stable 正例替代。模拟调用者丢失，不能从下一次 exited 样本倒推本次请求成功。

再在最终 helper 和真实应用 IO 门上验停止等待、第二 owner 拒绝、关闭残余错误；场景与原 DK-I6/7/10 同义，变的是停止请求承载路径，不是减少验收。若固定版本实验不支持 S-B，回本表比较，不由实现者连改连跑或自加策略状态。

本次若采用，须新决定明确取代 D-067 中正常 stop 的具体 CLI 绑定、更新 provider hash 与 PF017 新 projection；冻结 EC3/HT3、停止资源责任、single Engine 重启及其余 R4 保持。当前 I2 其余修复可继续，本停止接缝保持实施门。
