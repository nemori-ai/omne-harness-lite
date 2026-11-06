| id | 变异 | 命令 | 退出码 | 变红用例 | 日志 sha256 |
|---|---|---|---|---|---|
| BASE-HL-FAST | 未变异基线（41 条全过） | HL-F | 0 | — | beb9dfec5723 |
| BASE-HL-SLOW | 未变异基线（13 条全过） | HL-S | 0 | — | 5a7cc1e7ed1c |
| BASE-CC-ENTRY | 未变异基线（10 条全过） | CC-E | 0 | — | e100a1c26282 |
| BASE-CC-ROOT | 未变异基线（2 条全过） | CC-R | 0 | — | 08204fc06584 |
| F01 | eligibility absent answers granted | HL-F | 1 | answers unknown, and asks no landing, while the use eligibility is absent, and checks it once it is provided | a139d2818b1c |
| F02 | adoption endpoint absent answers not-adopted | HL-F | 1 | answers unknown, and asks no landing, while the adoption view is absent, and reads the view once it is provided | 67dfd63ab84b |
| F03 | adoption endpoints absent answers an empty list | HL-F | 1 | answers unknown, and asks no landing, while the adoption view is absent, and reads the view once it is provided | 4065e0f12eb8 |
| F04 | credential absent answers missing | HL-F | 1 | answers an unknown credential, and asks no landing, while the credential use is absent, and acquires once it is provided | 589ba7c2040d |
| F05 | landing absent answers facility-missing | HL-F | 0 | — | 988e40981090 |
| F06 | eligibility adapter reads the port at apply | HL-F | 1 | answers unknown, and asks no landing, while the use eligibility is absent, and checks it once it is provided；uses the replacement eligibility at the next port call after a swap | ee14653e7f0d |
| F07 | eligibility adapter caches the first reference | HL-F | 1 | uses the replacement eligibility at the next port call after a swap | 5996ad017f9a |
| F08 | adoption adapter reads the port at apply | HL-F | 1 | answers unknown, and asks no landing, while the adoption view is absent, and reads the view once it is provided；reads the replacement adoption view at the next refresh after a swap | 1c4084643684 |
| F09 | adoption adapter caches the first reference | HL-F | 1 | reads the replacement adoption view at the next refresh after a swap | 2f408f6f5509 |
| F10 | credential adapter reads the port at apply | HL-F | 1 | answers an unknown credential, and asks no landing, while the credential use is absent, and acquires once it is provided；uses the replacement credential use at the next port call after a swap | 9496de4173c7 |
| F11 | landing adapter reads the port at apply | HL-F | 1 | answers landing-unavailable while the process landing is absent, and asks the landing once it is provided；uses the replacement process landing at the next port call after a swap | b8677b15d9fb |
| F12 | the endpoint status service is not provided | HL-F | 1 | provides the three services on load with a complete lawful configuration and removes them when the plugin unloads；answers each operation of the three services while there is no connection；answers unknown, and asks no landing, while the adoption view is absent, and reads the view once it is provided；…共 5 条 | 8acfaa373d64 |
| F13 | current is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | fd6ada81aa20 |
| F14 | refresh is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection；answers unknown, and asks no landing, while the adoption view is absent, and reads the view once it is provided；answers unknown, and asks no landing, while the use eligibility is absent, and checks it once it is provided；…共 9 条 | fbc1b4209f82 |
| F15 | peer is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | 984a8b570c25 |
| F16 | invoke is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | 20083590a539 |
| F17 | continueWithInput is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | 19e1526c8938 |
| F18 | cancel is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | 80eb5b4b6450 |
| F19 | queryTask is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | 469d4f25d2b8 |
| F20 | taskResult is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | be9b7e8e4fa7 |
| F21 | provideTaskInput is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | 1e291b04af5e |
| F22 | cancelTask is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | b0864021a618 |
| F23 | inspect is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection；answers unknown, and asks no landing, while the use eligibility is absent, and checks it once it is provided；uses the replacement eligibility at the next port call after a swap | 6968f7b58057 |
| F24 | list is not forwarded | HL-F | 1 | answers each operation of the three services while there is no connection | ec1687150b6a |
| F25 | plain record does not check the prototype | HL-F | 1 | refuses a configuration that is a Date；fails to load with a configuration that is a Date, with the ValidationError of Cordis；refuses a configuration that inherits every field；fails to load with a configuration that inherits every field, with the ValidationError of Cordis | dde8df24b9de |
| F26 | plain record refuses a null prototype | HL-F | 1 | accepts a configuration without a prototype | 8946b0bbe834 |
| F27 | extra keys found with Object.keys | HL-F | 1 | refuses a configuration that has a symbol key；fails to load with a configuration that has a symbol key, with the ValidationError of Cordis | abf6567d10b7 |
| F28 | an extra field is not reported | HL-F | 1 | refuses a configuration that has an extra field；fails to load with a configuration that has an extra field, with the ValidationError of Cordis；refuses a configuration that has a symbol key；…共 6 条 | 39ad3d9a696d |
| F29 | a missing field is not reported | HL-F | 1 | refuses a configuration that lacks a field；fails to load with a configuration that lacks a field, with the ValidationError of Cordis；refuses a configuration whose clientInfo lacks a field；fails to load with a configuration whose clientInfo lacks a field, with the ValidationError of Cordis | 49ecc5fcf9c9 |
| F30 | clientInfo is not checked for extra fields | HL-F | 1 | refuses a configuration whose clientInfo has an extra field；fails to load with a configuration whose clientInfo has an extra field, with the ValidationError of Cordis | 6ac49fef0322 |
| F31 | the message of maxListingPages names another field | HL-F | 1 | refuses a configuration whose bound is not a number；fails to load with a configuration whose bound is not a number, with the ValidationError of Cordis | 3bfc1a68faba |
| F32 | the message of probeTimeoutMs names another field | HL-F | 1 | refuses a configuration whose probeTimeoutMs is not a number；fails to load with a configuration whose probeTimeoutMs is not a number, with the ValidationError of Cordis | 40c60da87ee0 |
| F33 | two bounds swap their values | HL-F | 1 | accepts a complete lawful configuration as a copy；accepts a configuration without a prototype | 7e40a033fa45 |
| F34 | clientInfo.name has the message of version | HL-F | 1 | refuses a configuration whose clientInfo.name is not a text；fails to load with a configuration whose clientInfo.name is not a text, with the ValidationError of Cordis | af083340e75b |
| F35 | clientInfo.version has the message of name | HL-F | 1 | refuses a configuration whose clientInfo.version is not a text；fails to load with a configuration whose clientInfo.version is not a text, with the ValidationError of Cordis | d37fe266991d |
| F36 | clientInfo that is not an object has another message | HL-F | 1 | refuses a configuration whose clientInfo is not an object；fails to load with a configuration whose clientInfo is not an object, with the ValidationError of Cordis | e9a57ae3dbdd |
| F37 | a configuration that is not an object has another message | HL-F | 1 | refuses a configuration that is not an object；fails to load with a configuration that is not an object, with the ValidationError of Cordis；refuses a configuration that is a Date；…共 6 条 | 2c3d1ac4bdd9 |
| F38 | the schema accepts any value | HL-F | 1 | accepts a complete lawful configuration as a copy；refuses a configuration that is not an object；fails to load with a configuration that is not an object, with the ValidationError of Cordis；…共 27 条 | dbc796e330aa |
| F39 | the plugin replaces a zero maxActions | HL-F | 1 | fails to load when maxActions is 0, with the RangeError of createMcp | 27321b3ef94b |
| F40 | the plugin replaces a zero probe timeout | HL-F | 1 | fails to load when probeTimeoutMs is 0, with the RangeError of the transport factory | bdb388494c58 |
| F41 | test-side: the probe removal resolves instead of throwing (the probe tests Cordis) | HL-F | 1 | Cordis mechanism probe: each error of an AggregateError a removal throws is logged and the unload completes | dac719ce5e9a |
| F42 | credential adapter caches the first reference | HL-F | 1 | uses the replacement credential use at the next port call after a swap | 1e221f0f16e8 |
| F43 | landing adapter caches the first reference | HL-F | 1 | uses the replacement process landing at the next port call after a swap | a8703bb59dd4 |
| K01 | ActionDiscoveryService registers under the key of ActionInvokerService | CC-E | 1 | provides a loaded subclass of ActionDiscoveryService under its key and removes it when the fiber unloads | 96457f442ab9 |
| K02 | ActionInvokerService registers under the key of EndpointStatusService | CC-E | 1 | provides a loaded subclass of ActionInvokerService under its key and removes it when the fiber unloads | 8ec000bd46b1 |
| K03 | EndpointStatusService registers under the key of AdoptionViewService | CC-E | 1 | provides a loaded subclass of EndpointStatusService under its key and removes it when the fiber unloads | db718b974e50 |
| K04 | AdoptionViewService registers under the key of UseEligibilityService | CC-E | 1 | provides a loaded subclass of AdoptionViewService under its key and removes it when the fiber unloads | 91169f75651b |
| K05 | UseEligibilityService registers under the key of CredentialUseService | CC-E | 1 | provides a loaded subclass of UseEligibilityService under its key and removes it when the fiber unloads | db083ed07324 |
| K06 | CredentialUseService registers under the key of ProcessLandingService | CC-E | 1 | provides a loaded subclass of CredentialUseService under its key and removes it when the fiber unloads | 6679883d69ec |
| K07 | ProcessLandingService registers under the key of ActionDiscoveryService | CC-E | 1 | provides a loaded subclass of ProcessLandingService under its key and removes it when the fiber unloads | 2b5539bb56fc |
| K08 | a key literal changes | CC-E | 1 | writes each service key once, on its abstract Service, and exports a constant equal to it | 953ee3fafbf6 |
| K09 | two Services share a key | CC-E | 1 | writes each service key once, on its abstract Service, and exports a constant equal to it；gives the seven services seven different keys | a62a3decbbdd |
| K10 | an extra runtime export | CC-E | 1 | exports exactly the seven abstract Service classes and the seven key constants | da9817a33af0 |
| K11 | a key constant differs from its provide | CC-E | 1 | writes each service key once, on its abstract Service, and exports a constant equal to it；provides a loaded subclass of AdoptionViewService under its key and removes it when the fiber unloads | fb146ffc3b05 |
| K12 | the root entry has a runtime value | CC-R | 1 | keeps the root entry free of runtime values | 7b3bb0f334ff |
| K13 | the root entry loads Cordis | CC-R | 1 | keeps the root entry source and built file free of Cordis | 1e503a2d3d1f |
| S01 | current is not forwarded | HL-S | 1 | loads with a complete lawful configuration and walks refresh then invoke on a scripted stdio peer；answers each operation of the three services through the plugin；signals a call in flight that cancel names；…共 13 条 | 0dd9e7f65663 |
| S02 | refresh is not forwarded | HL-S | 1 | loads with a complete lawful configuration and walks refresh then invoke on a scripted stdio peer；answers each operation of the three services through the plugin；signals a call in flight that cancel names；…共 13 条 | 45481cafad63 |
| S03 | peer is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | 06f9f4fb0ab9 |
| S04 | invoke is not forwarded | HL-S | 1 | loads with a complete lawful configuration and walks refresh then invoke on a scripted stdio peer；answers each operation of the three services through the plugin；signals a call in flight that cancel names；…共 8 条 | a4cdc3e3267e |
| S05 | continueWithInput is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | 243ee802b5c4 |
| S06 | cancel is not forwarded | HL-S | 1 | signals a call in flight that cancel names | 3ab997769a69 |
| S07 | queryTask is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | 55796472df9e |
| S08 | taskResult is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | ec64fcca3787 |
| S09 | provideTaskInput is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | d79cda04207d |
| S10 | cancelTask is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | 942200834cae |
| S11 | inspect is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | 36ce7a024674 |
| S12 | list is not forwarded | HL-S | 1 | answers each operation of the three services through the plugin | 4524d48647c1 |
| S13 | eligibility adapter reads the port at apply | HL-S | 1 | publishes the catalog of a stdio peer once the absent eligibility port is provided | 7cd1c5e8fa9b |
| S14 | adoption adapter caches the first reference | HL-S | 1 | reads the replacement adoption view at the next refresh after a swap | c71fcca90943 |
| S15 | credential adapter reads the port at apply | HL-S | 1 | publishes the catalog of a stdio peer once the absent credentials port is provided | 75af8fc1555c |
| S16 | landing adapter reads the port at apply | HL-S | 1 | publishes the catalog of a stdio peer once the absent landing port is provided | 1f2385f7ae56 |
| S17 | the removal does not await closeAll | HL-S | 1 | loads with a complete lawful configuration and walks refresh then invoke on a scripted stdio peer；answers each operation of the three services through the plugin；signals a call in flight that cancel names；…共 13 条 | 53f9dfc38558 |
| S18 | the removal does not call closeAll | HL-S | 1 | loads with a complete lawful configuration and walks refresh then invoke on a scripted stdio peer；answers each operation of the three services through the plugin；signals a call in flight that cancel names；…共 13 条 | 531118d72c68 |
| S19 | the removal warns only of unconfirmed | HL-S | 1 | warns of the endpoint and the scope when the stop of its process is root-only at unload | 0d7f9e1c9906 |
| S20 | the removal warns of every scope but no-process | HL-S | 1 | does not warn when the stop of the process is tree-confirmed at unload | 5a98bdc79a23 |
| S21 | the warning does not name the endpoint | HL-S | 1 | warns of the endpoint and the scope when the stop of its process is root-only at unload；warns of the endpoint and the scope when the stop of its process is unconfirmed at unload | 458b58f4e8d5 |
