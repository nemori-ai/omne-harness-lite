# 本机维护命令与Linux服务装配 · 候选 R1

本页是[维护机制候选](maintenance.md)的具体装配，PF017 rev5/INT010为已确认产品输入，EC3/HT3仍候选。实现待独立架构/规格/计划准入，未发布。

保持八fiber及现有逆序撤除；ops内部维护控制器复用其fiber。config新增OMNE_TENANCY_BACKUP_DIR，可选，缺省为规范化SQLite文件路径加`.backups`，绝对路径；备份目录须当前uid/0700且不跟随软链，允许首次mkdir但父须存在。只创建最后一级，不递归创建目录链；新建后在维护装载/任何明文之前fsync新目录及已存在父目录，任一步失败整体启动失败。既有目录也重新确认这两级，不把未确认的新目录作为已持久来源。静态工作根为该目录下`.quarantine`；离线工具必须显式给别的工作根，不能抢占运行中心的根。host只传源构建标识/完整迁移清单/各owner的snapshotChecks，不SQL私有表。构建未知为null，已打包读取受审计BUILD_ID。

## 命令和退出

保留keygen/serve/--version；新增：

- `ops --socket-dir <absolute> full-health`
- `ops --socket-dir <absolute> backup --only-if-due`，无此flag为onlyIfDue=false。
- `ops --socket-dir <absolute> backup-status`
- `verify --source <absolute-file> --work-dir <absolute-new-or-protected-root>`
- `restore-isolated --source <absolute-file> --target <absolute-new-directory> --work-dir <absolute-new-or-protected-root>`

严格唯一选项，无位置猜测/重复/未知项；不加载serve环境或密钥即可用离线工具。路径还须EC3标量值约束。ops仅连接指定本机socket按HT3固定body发送，一次请求不重试；网络失败/断开只能诊断本次结果未取得，不能把维护结果当cancelled。默认不设短业务应答期限，SIGINT/TERM终止客户端等待不取消服务工作；离线信号只请求取消，等待真实收场再退出。

stdout恰一个EC3结果JSON+LF（full-health原形状），等待真实write callback；诊断stderr不泄漏内容。退出0为completed/not-due/verified/restored-isolated或backup-status current；status overdue/missing及已知操作拒绝2；unknown/依赖故障/网络断开/输出失败1；语法错误64。full-health沿当前返回体，退出0仅代表读到体检，服务项故障由调用者读字段，不冒充健康。没有安全再开放命令。

## 停机、调度与制品

disposeInReverse不在30秒后返回，改30秒发一次still-stopping诊断并继续await当前真实disposer，然后才下一个fiber。仍保留业务网络排空界，延迟是后端任务真实等待。重复dispose共用同一Promise。失败/清理状态不能因Cordis吞disposer异常而被主线误判成功：boot静态构造维护收场观察对象，分controller/storage两槽，初值pending。controller在全部任务/暂存结束后写clean或residual/error；storage仅在其close最外层（工作根锁/全部句柄/源owner的最后释放均结束）写clean，任一步异常写error，不能由controller代填。host等逆序撤除后同时检查两槽，pending/residual/error均使HostDisposal.complete=false和非零exit；Cordis吞异常不改变槽。此对象只记录实例级事实，没有动作/权限，不从环境构造。存储已有guard.pending继续核对。

Linux发行归档包含本应用`deploy/`静态模板：专属非rootUser/Group、绝对Node24与制品/0600EnvironmentFile、WorkingDirectory私有数据目录、UMask0077、Restart=on-failure、TimeoutStopSec=infinity、KillSignal=SIGTERM；不设置会在期限后自动强杀的第二上界。运维者先替换示例路径并systemd-analyze verify，安装步骤在开发部署说明中指向本设计，不另写产品正文副本。升级流程为stop并等inactive、先验证制品、原子切换版本目录指向、start与公开/完整体检；失败不自动降级数据库，沿既有升级guard规则。

timer每小时触发oneshot备份命令`--only-if-due`，Persistent=true补漏；oneshot仅After=center.service，绝不Wants/Requires/BindsTo拉起中心。首次中心启动后下个小时到期补跑；停止中心时timer可报失败但不启动中心。systemd本身记录oneshot失败与unknown，状态命令判断24小时缺失。备份不自动清理，容量满明确失败，部署步骤含人工检查/迁走和journal检查。整机灾备仍不在单机保证内。

## 必须实测

实际产品在systemd中并发业务与备份、超过30秒后源owner仍持有/进程仍stopping、有意停止不重启、timer不拉起；Linux/macOS文件同步/权限/稳定读取；打包后所有命令不依赖仓库，Node路径明确。备份每日边界用可控时钟检查+真实timer机制，不能把几分钟试验写24小时耐久证明。当前仅有独立systemd机制探针，未完成产品验收。

排他域澄清：在线一个中心属主单维护工作；离线每调用作用域单工作，同工作根跨进程锁。不同工作根可并行只读校验同一封装，每个固定自身输入与隔离暂存；相同恢复目标仍独占。没有全机IO/内存总量封顶承诺。此精化须与EC3候选同步，不以工作根锁冒称同源文件全局锁。

R2只读结构检查装配：host从各owner公开入口合并accountIdentitySnapshotCheck、organizationGovernanceSnapshotCheck(既有ownerAccountReference参数)、clockSnapshotCheck、governanceCenterSnapshotCheck及迁移登记检查。每个检查只接固定副本读面及结构值，无运行中治理服务句柄。合并owner声明的允许表/索引/views/triggers后拒绝未知结构；跨owner organization.owner_account外键按现有装配参数核对。启动格式前缀检查仍是另一动作，不以dataFormatPreflight代替维护完整结构检查。
