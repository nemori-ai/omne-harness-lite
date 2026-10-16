# Model Cordis 消费者

本包服务于 Cordis 插件作者、提供者与应用装配者。独立程序仅使用领域类型时，消费 model-contract；选择执行函数时，消费 model。两个入口目前为空，以下是设计消费关系。

插件从 `@omne-harness/model-cordis-contract/cordis` 导入唯一键、类和增补，声明静态依赖。提供者继承定义，不能复制 provide 键或从具体运行插件转取 Service。应用负责选择提供者与生命周期。

本包安装包含 Cordis，即使消费者只引用根类型也不能据此声称安装无框架。定义自有目录可以有登记状态，模型业务状态仍由领域提供者拥有。装配顺序及局部依赖见 [cordis](cordis.md)，精确接口见 [public-api](public-api.md)。
