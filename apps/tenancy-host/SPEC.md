# 租户治理宿主的整体承诺

本应用拥有启动、配置接入、共享事务域、开闸与撤除协调责任。
本页在[系统架构](../../docs/architecture/README.md)约束下细化PF-017的治理宿主责任；旧整体装配接受记录不授权连带停止无关能力。当前限制和未兑现责任见[保留义务与实际范围](#保留义务与实际范围)。
公开类型和最终插件树表达当前形状，不替代本文件的整体性质。

## 启动与开放服务

配置先校验，签名/验证密钥须配对，私钥不从公开服务面输出。
所有相关治理对象与共同业务操作使用同一存储保护域。迁移、预检、快照确认与开闸保持可观察顺序。
守卫绑定到实际存储实例，复制配置不能伪造确认。依赖未就绪不能开始对外服务。

启动必须等待所需提供者 ACTIVE，完成快照确认，再发出开放信号。
入口在开闸时再次核时钟，确认之后开闸失败不得谎报成功或随意还原已经确认的库。
错误说明须区分未确认可恢复、已确认须核钟重启及无法证明恢复安全的情况。
启动失败撤除已经开始的组件，并报告初始原因和收场失败。不得吞第二个错误。

## 撤除与数据责任

先停止入口并排空有界网络工作，再按依赖关系撤除提供者。
维护/存储工作未实际结束时继续等待，停止诊断阈值不能充当强制释放许可。
已提交事实不得因卸载插件而删除。升级与恢复保留真实事务、文件及持有实例的边界。
SQLite 的单机耐久前提不扩大为整机/磁盘毁损恢复保证。
PG 迁移后装配失败的整体回滚尚未闭合，不能开放成已支持生产升级路径。

本文件拥有已采用的宿主集成行为。身份、租户、治理、维护、数据格式及网络业务语义由各能力现行契约拥有；设计采用不表示全部真实组合或后继增量已经验收。

## 插件树准备与装载

- `buildDistributionTree` 只产生八个既有职责的稳定行 id、公共插件引用及 JSON 配置。运行对象、守卫、检查函数及完成回调通过正式 StorageStartup、StorageCompletion、EntryMaintenance、EntryOpening 服务提供。
- `boot` 先读取配置、核对密钥配对及原路径约束，合并发行树与运维修改，再准备全部插件并核验角色声明。准备或政策失败时不创建数据库、监听器、备份目录或运行资源，不 apply 任何行。当前宿主只接受 SQLite。
- 必需职责恰好各有一个已核验角色；替代提供者须提供该角色所需服务，并保持原配置投影。资格不由包名或固定行数推断。资源在准备通过后创建，每次 boot 使用新的同一代际及同一真实升级守卫。
- loader 使用同一个 assembly-lifecycle 拥有管理工作，逐行观察 OwnedWork.ready、实际 fiber ACTIVE、声明服务可见及代际仍有效。全部就绪后按原顺序确认升级、兑现 EntryOpening、观察 serving，再返回 host。确认前两张网络面均拒绝业务准入。

## 失败与关闭

- 原 setup 异常在同一行登记时私有捕获；只有安全树错误的同一 rowId、已核验角色及 apply-failed 条件成立，才按原分类器返回原 cause。错误分类和公开定位逐项遵循宿主接缝的诊断表，日志不得输出配置、凭据或任意私有异常文字。
- 撤除或失败按真实依赖停止受影响的新准入，不连带停止无关工作。已经开始的工作按原提交边界收场；资源关闭等待真实工作及setup前缀结算。停止请求、停止事实和资源释放不相互替代。当前整代停止的限制见[实现偏离](README.md#当前装配限制与架构偏离)。
- `treeCreated` 发生于句柄已保存且尚未 apply 时；它抛错后仍由同一句柄完成实际收场。`dispose` 在调用可重入的关闭路径前保存稳定 Promise，重复调用返回同一观察。
- loader 先等已登记工作真实关闭，再逆序撤 fiber 与行端口。宿主随后核对原维护完成状态和 guard.pending，最后撤外部资源 fiber；原主错误不被收尾错误遮盖。
- 30 秒只报告未完成项，随后继续等待。HostDisposal.complete 仅在树撤除、原维护与守卫核对全部闭合时为 true。关闭异常或完成通知缺失不得伪装成功。

## 保持与验证

数据库身份、表、迁移前缀、Schema URI、两张网络面的 wire 版本、授权和同提交行为保持原承诺。接口变化同步迁移消费者，旧 manifest、资源 Config 回调及兼容别名不继续提供。

资产治理与流转的未实现承诺分别归[资产治理](../../.meta_harness/design/architecture/asset-governance/README.md)与[资产流转](../../.meta_harness/design/architecture/asset-transfer/README.md)；模型档案目录承诺归[公共拥有者](../../packages/core/model-profile-directory/README_ZH.md)。中心新增跨进程投影仍未实现，不因包内类型或本次搬迁宣称兑现。时钟来源与部署发布由各实际拥有者约束。

## 迁移合成、崩溃恢复与分发

各owner拥有自身表迁移，宿主唯一合成顺序及跨owner外键的目标与名称；OG工厂通过参数接受目标，不从AI私有实现取得。所需升级检查使用同一实际快照和同一guard，未确认快照必须先恢复再启动，不能绕过确认路径重新开放。

SQLite采用WAL、synchronous=FULL及foreign_keys=ON。SIGKILL后重启保留最后完整提交，时钟残留lease最多延迟一个lease宽度；该前提不是历史45秒冷恢复失败的原因证明。ready与terminate原45秒测试观察阈值保持，不能用放宽阈值关闭旧问题。

开发分发只搬同一稳定源码/锁/dist的生产闭包，运行时密钥、库、套接字及备份不进制品。离仓库离线运行不install。唯一共享发布算法归tools/artifact-builder；宿主薄适配不复制算法。只向新的绝对目标作同文件系统独占发布，只清本次暂存；发布后stdout失败不得删除已有效的制品。平台仅声称实际验证的范围，不从Node大版本范围推整个平台验证。

BUILD_ID为排序后文件清单SHA-256，不含inventory本身及BUILD_ID，不充当HOST_VERSION或wire版本。纯--version不读配置、密钥、数据库或套接字，不建Context，验证BUILD_ID，开发检出缺失时标development；内容损坏安全失败，等待真实stdout完成。归档成功不表示安装或生产接受，不保证强杀清理或归档掉电耐久。

应用测试保留真实 SQLite、TLS、Unix、确认前关闸、失败回滚、逆序关闭、在途及重启观察。插件树替换、准备零副作用、失败前缀、服务换代、纯入口与部署制品由 T4 冻结验收接续；切片测试不能关闭完整 T4 或身份领域验收。

## CLI 树配置

`serve [--plugins <file>] [--print-plugins]` 按已采用调用坐标读取 JSON 后交同一准备；两个选项各至多一次，可交换。打印仅输出安全 DTO 数组加换行，不建立停机信号订阅，也不创建实际守卫、目录、库或监听器。语法拒绝为64；文件/JSON或静态准备拒绝为1，使用同一安全启动记录；成功打印为0。常规 serve 沿原信号及真实关闭完成决定退出码。

## 维护命令与提供者选择

command-data.ts 唯一拥有命令与输出端口形状。maintenance-command.ts 只解析、运行及决定退出码，消费具名校验、ops调用、离线lease和失败转换。maintenance-assembly.ts 选择原提供者，main 只在原维护分支选择它；构造不打开inspection、不读取迁移检查结果。

离线路径保持原open→create→操作→finally close顺序；create失败仍关闭已取得的同一inspection，open失败不虚构关闭。ops-client.ts 的socket名称和原回复解码函数由maintenance-assembly.ts通过必需私有OpsClientProtocol注入；createOpsClient仅绑定，不连接或提前解码。ops-client.ts 保持一次Unix请求及原HTTP校验、字节上限、取消和socket清理；取消仅结束本地等待，不能撤销或重投远端。诊断、输出失败、未知结果及退出码不变。原信号、读取门和dispose故障注入保持实际路径。

## Docker健康探针

Docker exec探针在同一进程调用原main的ops full-health，不创建CLI后代。5秒期限包含动态加载，发送前及成功返回前核单调截止；64KiB上限按实际字节累计。超限/失败不报告ready，shutdownSignal沿原AbortController结束socket，finally清理自身计时器。成功形状与业务体检语义归公共入口，不以Docker Engine受理或探针进程退出代替原应用责任完成。

## 角色声明与发行树

宿主解释tenancy-host命名空间的八项version=1 claim。通用loader只验数据形状；提供者不得反向依赖应用。准备通过后、创建guard或打开数据前，宿主一次核对职责、服务及配置投影。

| 角色 | 必需provides | 宿主语义投影 |
| --- | --- | --- |
| storage | storage | SQLite、file、synchronous=full、startup=migrate及maintenance.workDirectory，与HostConfig及路径投影一致 |
| clock | clock | 原clock全部数据字段，保持storage、lease和readiness参数关系 |
| credentials | credentials | 已校验算法参数；替代算法仍守公共凭据接缝，不由宿主复制算法校验 |
| accounts | accounts、logins | 公钥、有效期及policy；缺席policy保持undefined业务语义，声明省略字段 |
| organizations | organizations、offers、memberships、organizationPurge | 密钥及有效期与宿主原投影相同 |
| registration | registration | activation私钥与已核验密钥对一致 |
| ops | 无业务Service | socket、部署、维护路径、版本和migrationNames，与同一次资源一致 |
| entry | 无业务Service | TLS、listen、version和超时，与HostConfig界限一致 |

每项恰一次。缺失、重复、不支持版本、服务不合或投影不合分别拒绝；未知tenancy-host名称拒绝，不回显任意claim名。其他命名空间不由宿主解释，helper可以没有宿主claim。稳定id不是职责证明，停用原行后插入等价角色允许，保留id却换成不承担职责的helper必须失败。

首版八个稳定id为storage-sql、clock-lease、credential-verification、account-identity、organization-governance、account-registration、governance-center-ops、governance-center-entry。id与包名分开，替换提供者不迫使运维修改id。发行删除或改id须同步发行说明。数据只从host配置和显式operator层取得，没有隐含第三层。

声明是受信代码的协议承诺，不证明实际行为。宿主仍核真实readiness、serving、升级确认、维护完成和guard身份；任意不可信Node模块不能因通过声明进入当前受信装配路径。

## 启动诊断的精确映射

boot只以HostStartupFailure拒绝。prepare和合层拒绝先于资源创建；启动失败仍等真实收场和原守卫、维护核对后拒绝。原setup异常只进入私有观察表；登记给真实协调器的仍是同一OwnedWork，不能让错误观察取得关闭权或改变ready。

| 原因 | stage | cause及安全定位 |
| --- | --- | --- |
| StartError为apply-failed且同一row已捕获原setup异常 | 按已核验角色沿occupied、restore、preflight、snapshot、migration、storage-open、clock-unreadable或plugin分类 | 保原cause、item及允许snapshot；首行优先，不把异常塞进通用树错误 |
| 其余StartError的apply-failed或stopped | plugin | 安全StartError和合法rowId |
| StartError为dependency-unavailable、missing-registration或provided-service-missing | manifest | 安全StartError和合法rowId |
| TreeError或PreparationError为invalid-config | plugin | 原安全错误和合法rowId |
| TreeError或PreparationError其余code | manifest | 原安全错误和合法rowId |
| UsageError全部code | manifest | 安全UsageError，不暗示已经接管或关闭资源 |
| HostPluginPolicyError全部code | manifest | 安全政策错误和已知role，unknown-role不回显未知名称 |

HostPluginPolicyCode保持missing-role、duplicate-role、unsupported-role-version、role-service-mismatch、incompatible-role-config、unknown-role。公开role仅storage、clock、credentials、accounts、organizations、registration、ops、entry。安全树或政策cause使用固定说明plugin tree rejected，由HostStartupFailure加阶段前缀。

startup-failed保留event、stage、item、errorType、message；安全cause可另交code及核验过的role或rowId。序列化前核封闭集合，省略缺席可选字段，不展开任意cause/message或异常属性。原具名setup错误保原允许说明及快照，不打印秘密。若首次原因为stopped，迟到setup异常不能改写该结果。loader.ready可先拒绝，boot仍承担完整清理。

serve的--plugins选项带一个文件参数，--print-plugins无值，两者可交换且各至多一次。未知、重复或缺参数沿usage拒绝。打印成功只交安全DTO数组JSON加换行并退出，不等待shutdownSignal；准备失败使用同一映射且failed退出，语法失败仍usage。打印不得创建guard、backup目录、数据库、端口或socket。

backup路径先只读解析核验，准备及政策通过后才durable创建并重验同一规范路径的owner、mode及symlink条件。同一次资源使用同一migrationNames及checks，不从operator JSON注入函数或重算另一份集合。

## 保留义务与实际范围

本应用的SQLite路径不表示PG迁移后整体恢复已闭合；类型可用不能开放成支持部署。当前单代整体停止是[明确的装配偏离](README.md#当前装配限制与架构偏离)，不能作为局部重装配的目标政策，不可信代码还需架构要求的受限执行域及受控桥接。目标、现行前提和未兑现保证各由其拥有者维护。

资产治理与目录中心未实现增量归相关公共定义，OG3继续由[治理公共承诺](../../packages/core/organization-governance/SPEC.md#已接受而未实现的资产治理增量)持有；完整Session候选从[架构保留源](../../.meta_harness/design/architecture/session-agent-runtime-phase1/README.md)进入。实际验证与原恢复观察义务见[本应用验证](verification/README.md)，不得以旧批次完成状态关闭这些义务。
