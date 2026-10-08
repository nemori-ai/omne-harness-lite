# SQL 存储的公开面与资源责任

根入口提供独立 openStorage、SqlStorage、配置、升级守卫、驱动及维护工具。
`./cordis` 提供 StorageSqlPluginConfig、storageSqlPlugin、managedStorageSqlPlugin 和 SqlStorageService。
服务键、启动资源和完成目标由 core/storage 拥有，提供者不重复导出键或迁出的结果类型。
公共事务、完成观察与维护协议归 [core/storage](../../core/storage/SPEC.md)。本页拥有 SQL 方言、升级、维护物理实现及集成责任。

## 拥有插件

两种拥有绑定使用严格的数据配置 StorageSqlPluginConfig。startup 缺省为 plain；plain 不取启动资源，也不允许 maintenance。
migrate 从 storageStartup 取得原 migrations/upgrade；启用 maintenance 时另从 storageCompletion 取得 closed 目标。
转换保留同一真实 guard、检查函数及完成目标，原 StorageSqlConfig 和 openStorage 独立输入仍可使用运行对象。
缺资源或非法资源使启动失败，不降级为 plain。条件依赖在子作用域 inject，声明列出全部条件键。

storageSqlPlugin 在打开前登记关闭 effect。撤除时等待已开始的 setup，再关闭取得的资源；启动失败不丢失已取得前缀。
managedStorageSqlPlugin 同步登记原 AssemblyLifetime 的 OwnedWork，再启动条件子作用域及原打开路径。
其 ready 独立于 fiber ACTIVE；条件子作用域撤除停止同一代，撤除完成等待真实 SQL 关闭。
该等待不依赖父 fiber.dispose，避免父子撤除相互等待。首次失败继续拒绝 ready，closed 另报告收场结果。
Service 构造或重复键失败仍由同一拥有路径收场。
基类构造器负责占键，插件不再登记同一个键。

关闭仍归原 SqlStorage：停止新准入、等待在途、关闭句柄，再按原升级/维护责任恢复或释放。
关闭失败的诊断与守卫核查保持原规则；不能以 fiber.dispose 返回成功断言底层已经释放。
在途事务不随服务不可见而凭空消失，也不新增基于调用方 fiber 的事务取消。

## 借用绑定

SqlStorageService 只发布已经打开的 SqlStorage，不接管它的资源。
撤除借用发布不关闭底层实例；装配拥有者继续负责等待业务并调用 close。
服务显式 close 与独立 close 是同一个资源动作，保持原返回 Promise、幂等与失败语义。
maintenance 转交同一底层对象，不新开维护控制器或旁路数据库连接。

## 同提交身份

独立实例和它的 Service 调用方代理可参加同一 SqlStorageUnit。
提供者通过不导出的局部 Symbol 将自己建立的访问面关联到确切底层实例；属性在运行时不可写且不可重配。
unit 保留原 frame、busy、既有污染的校验次序，再核验实例身份。
不能读取身份的非法对象按原不同实例路径拒绝并污染整单元；业务捕获这次异常也不能提交或通知。

同一文件上的另一个实例、替换后的新底层实例、没有合法对应身份的对象都不能参加原单元。
该投影不是租户授权或跨进程事务协议。公共 read/write、atomic、原回调、异常对象和提交后通知的语义均保持。
私有投影不从包入口导出，纯 SQL 根不加载 Cordis。

验证必须覆盖双向参与、多个调用方、跨实例拒绝、污染、回滚、通知、拥有/借用撤除及提供者换代。
既有 SQLite 符合性、升级、维护、真实治理/模型消费者与实际制品消费继续承担各自验证责任。

## SQLite 的异步执行与排他

每个SQLite连接及其原生SQL执行属于独立worker。打开、SQL、提交、回滚和关闭不得在应用事件循环上执行。main仍拥有事务回调和准入队列；同一连接的命令按进入顺序执行。等待不会隐式重放语句或事务回调。引擎的整数、字节、扩展错误和自动回滚状态保持，不以JS布尔值猜测事务是否仍在。

读池在等待打开前预占名额；失败退还名额，关停拒绝未取得连接的等候者。打开中的连接计入未关闭资源。关闭停止新命令、排空原队列与备份、关闭原生连接，并等待worker实际退出。error事件、发送close或发送terminate均不能替代退出。未知结果不得伪装成未提交。线程异常退出不自动重建连接或重放请求。

SQLite属主及维护工作根用永久文件的flock排他。main强持有文件描述符；helper只有无signal且退出码0才授予准入。失败或未知取得结果先等helper停止，再尝试关闭描述符。worker退出不释放main持有的排他。全部数据库工作、文件操作和升级恢复收场后，最后关闭描述符。关闭未证实成功时保留强引用和原排他。运行期间不得删除或替换锁文件。

`NodeSqliteDialect` 的 `readOnly: true` 仅允许用于 read 角色：以原生只读模式打开已有文件，不创建缺失文件、不设置 journal_mode。默认池保留原连接模式与 query_only 保护，避免改变最后连接关闭时的 WAL 检查点行为。

此Linux提供者需要util-linux的flock可执行文件。缺少依赖则启动失败，不降级为无锁模式。旧空SQLite锁与新flock锁不构成互斥协议；升级本实现前必须停止旧进程，不支持两种版本并发访问同一属主数据。本节取代旧节点设计中的空协调库机制，保留其唯一属主、恢复和关闭责任。

备份继续借原固定read transaction。取消只提出停止请求，资源仍保有到原生backup实际收场。查询元信息必须保留容量限制。worker内部同步执行不是应用线程同步执行，也不表示任意同步业务回调已被异步化。

## 方言事务与错误
