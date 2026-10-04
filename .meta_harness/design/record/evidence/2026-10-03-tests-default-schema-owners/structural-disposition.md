# 默认 owner 片的结构读数处置

候选75c6a66ef，真实基线52bc6005d。严格硬线通过，方向/环/新增跨成员依赖/新增装配偏离均为0，验收锁未破。CLI未受影响，实际跳过账本已记录，不声称运行CLI验收。

9个碰过的原超线函数在真实源码基线比较中均没有变差：
- packages/assets/evaluation-input-store/src/publication.ts / captureSessionRecipe：CC 34，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/assets/evaluation-input-store/src/registry-history.ts / createRegistryHistoryReader.read：CC 28，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/assets/evaluation-input-store/src/registry-history.ts / binding：CC 26，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/assets/evaluation-input-store/src/publication.ts / publication：CC 21，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/assets/evaluation-input-store/src/data.ts / checkDependencies：CC 15，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/assets/evaluation-input-store/src/data.ts / recipeFromRow：CC 15，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/tools/asset-registry/src/registry.ts / createAssetRegistry.rebuild：CC 13，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/assets/evaluation-input-store/src/registry-history.ts / request：CC 12，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。
- packages/assets/evaluation-input-store/src/registry-inputs.ts / request：CC 11，基线同值。本片只把原owner引用改为getter；不在此片改写已有业务分支。

六组克隆的两端在52bc源文件中已存在；仅规范化getter写法和空白后逐项匹配，机器对账default-owners-clone-comparison.json。属于既有来源/版本核验与当前/历史读取片段；本片无新复制块。getter缓存分别归三个不同模块owner，不能为消除局部相似代码合成跨消费者全局缓存。

全仓329超alert/2.8%重复/104个MRR超alert等趋势使用最近祖先f226b4cca快照，不是精确52bc快照，因此不把趋势变化归给本片。20红成员、并行工作树12/重叠43、topic churn及357既有装配deviation是全仓读数，未经本片交付提升状态。未运行CRAP或TLC/Alloy。

原MRR一次unavailable原因未知，两个基线和两个候选原文件窄重测均过；独立QA还须覆盖一次原慢层多文件组合。原失败不擦除。
