# 使用与消费者

## 使用方式

独立消费者只导入命令或查询接口。Access 由应用身份适配器构造，scope 使用同一 Legal Identity 的规范租户文本。序列化协议不接受 Service、函数、SQL participant 或 Cordis Context。

## 消费者与定位

本成员供应用适配器与治理提供者消费。Settings、Authorization 等领域拥有自己的 current-source 消费端口，应用负责桥接；领域不反向导入装配组。生产提供者和应用接入尚待本波交付。
