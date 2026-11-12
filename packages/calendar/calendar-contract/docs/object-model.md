# 对象模型

## 对象与关系

CalendarSnapshot 绑定 calendarId、versionId、覆盖、周默认、逐日 override、knowledgeAsOf、contentHash 和来源 authority 引用。CalculationBasis 记录本次实际依据。版本选择区分 latest 与 pinned，CalendarResolve 的 selection 区分 effective 与 explicit。CalendarInfo 的 versions 和 list 都分页，supplyStanding=null 表示没有供应健康投影。供应回执关联完整原操作、发布引用与 generation，不成为执行资格。

精确类型与 schema 见[定义索引](public-api.md)，本页不复制类型声明。

## 生命周期

这些对象是可序列化值与服务类型，不拥有宿主资源。旧 snapshot 不随新发布变化。公开值不持有连接、Clock、Cordis Context 或调用者释放责任。
