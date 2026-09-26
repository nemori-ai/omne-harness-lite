# 不停服维护的模块分工候选（2026-09-25）

产品INT010选择不停服后，在已有EC3语义内比较实际归属；不是新的产品政策或接受。

| 候选 | 资源/行为拥有者 | 收益 | 代价与否决条件 |
|---|---|---|---|
| A | storage-sql整体持源/文件/封装，通过中心元信息回调拼接 | 单一close容易集中 | 中心格式/每日状态进通用SQL；为避免污染还要建无独立消费者的codec框架 |
| B（推荐） | storage-sql持源/隔离/读数，entry ops持中心封装/发布/状态；host仅装配 | 保持领域语义归属，离线复用同一表示，source.run守住整个生命周期 | 两个资源收场须明确；借用view不能逃逸，controller与source均等待真实结束 |
| C | entry或host另开NodeSQLite连接，storage只授源资格 | 单个功能短路径 | 形成第二源连接owner，重造guard/close/取消协议，易绕过原属主 |

B不必增加fiber：维护和ops同生共死、没有独立service消费者；ops一个effect显式组合close。离线工具直接调用entry公开文件算法并消费独立inspection owner，生命周期归工具作用域。若以后后台备份独立于ops热替换继续工作或出现第二在线消费者，再复核独立fiber/service边界。

同一提交对象仍是当前SQLite数据库+WAL；没有把多库/未来资产纳入。核负面清单：Cordis不提供文件持久、备份回滚、排他和有序异步close；相应责任在存储run/永久隔离/独占发布与host显式顺序。旧治理服务和登录活动不在此动作链，不新增治理权限。

具体候选：core/storage/maintenance.md、infra/storage-sql/maintenance.md、tenancy/governance-center-entry/maintenance.md、apps/tenancy-host/maintenance-binding.md（均在realization对应节点）。独立review和主线采用尚待完成。
