| 变异 | 变红的用例（T8 行号或手写用例名首段） | 退出码 |
| --- | --- | --- |
| M53 B1: tasks/update and tasks/cancel carry no _meta | 「cancelTask sends tasks/cancel with the envelope; the ack is …」；「streamable-http: each request carries MCP-Protocol-Version, …」；「updateTask sends tasks/update with the task id, the input re…」 | 1 |
| M54 B1b: no clientInfo in any _meta | 「-32022 with supported versions: one retry with the highest v…」；「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「cancelTask sends tasks/cancel with the envelope; the ack is …」；「every request and notification carries the three _meta keys …」；「stdio: cancelRequest sends notifications/cancelled with the …」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: each request carries MCP-Protocol-Version, …」；「streamable-http: on the legacy path each later request carri…」；「updateTask sends tasks/update with the task id, the input re…」 | 1 |
| M55 B1c: a notification carries the capabilities only | 「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「stdio: after a -32022 retry the cancel notification carries …」；「stdio: cancelRequest sends notifications/cancelled with the …」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M56 B2b: legacy initialize declares sampling and roots | 「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「legacy: initialize offers the highest legacy version and dec…」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M57 ruling 3: legacy initialize declares the tasks extension | 「legacy: initialize offers the highest legacy version and dec…」 | 1 |
| M58 B3: reportRejection only for tools/call | S05；「401 on discover: authorization-required with no legacy fallb…」；「401 on listActions without resource_metadata: the well-known…」 | 1 |
| M59 B3b: no reportRejection for tools/list | S05；「401 on listActions without resource_metadata: the well-known…」 | 1 |
| M60 B4: any 403 with a Bearer challenge is authorization-required | S06 | 1 |
| M61 B5a: -32022 without a version in common falls back to legacy | D05 | 1 |
| M62 B5b: -32021 and -32020 fall back to legacy | D08 | 1 |
| M63 B5c: -32022 after the retry falls back to legacy | D07 | 1 |
| M64 B6: legacy instructions not bounded | 「legacy: the instructions of initialize are cut to the byte l…」 | 1 |
| M65 B8: _meta keeps the highest version after legacy negotiation | 「-32022 with supported versions: one retry with the highest v…」；「after negotiation every request carries the negotiated versi…」；「stdio: after a -32022 retry the cancel notification carries …」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M66 ruling 2: _meta keeps the highest version after a -32022 retry | 「-32022 with supported versions: one retry with the highest v…」；「stdio: after a -32022 retry the cancel notification carries …」 | 1 |
| M67 ruling 2: initialize carries the modern version in _meta | 「legacy: initialize offers the highest legacy version and dec…」 | 1 |
| M68 ruling 1: no Mcp-Name on tasks/* | 「-32022 with supported versions: one retry with the highest v…」；「cancelTask sends tasks/cancel with the envelope; the ack is …」；「every request and notification carries the three _meta keys …」；「streamable-http: each request carries MCP-Protocol-Version, …」；「updateTask sends tasks/update with the task id, the input re…」 | 1 |
| M69 ruling 1: Mcp-Name on every request | 「-32022 with supported versions: one retry with the highest v…」；「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「every request and notification carries the three _meta keys …」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: each request carries MCP-Protocol-Version, …」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M70 ruling 1: MCP-Protocol-Version header is always the highest version | 「-32022 with supported versions: one retry with the highest v…」；「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M71 ruling 4: every 400 on discover is a legacy peer | D04；D05；D07；D08 | 1 |
| M72 ruling 4: every JSON-RPC 400 on discover is an error answer | D12 | 1 |
| M73 ruling 4: a JSON-RPC error body of an HTTP error is not-sent | C02；G06；I03；I04；O01；O02；O03 | 1 |
| M74 ruling 6: legacy version not checked against the list | I02 | 1 |
| M75 T3: -32601 reports the modern failure | D09；I02；I03；I04；I05；I06；I07；S01；S02；S05；S06 | 1 |
| M76 C6: probe time starts before the pace hook | 「counts the stdio probe time from when the pace hook lets the…」 | 1 |
| M77 C6: probe timer not cleared by the answer | 「clears the stdio probe timer when the modern answer comes fi…」 | 1 |
| M78 C7: failed without error makes up an error | G05 | 1 |
| M79 C7: an error that is not an object is accepted | G05 | 1 |
| M80 C9: a negative hint is kept | 「a poll interval or ttl that is not a non-negative safe integ…」；「task: a hint written with an exponent or a sign is left out,…」；「task: a negative or fractional poll interval or ttl is left …」 | 1 |
| M81 C9: an unsafe hint is kept | 「a poll interval or ttl that is not a non-negative safe integ…」；「task: zero is a hint; an integer past the safe range is left…」 | 1 |
| M82 C1: observedProcess does not carry the pipes (round-1 shape) | 「stdio: close() closes stdin, then cancels stdout, and does n…」 | 1 |
| M84 C2: another 403 with a challenge still reports the rejection | S06 | 1 |
| M85 record: headers recorded on stdio too | 「records the MCP request headers of a Streamable HTTP request…」 | 1 |
| M86 C1: observedProcess forwards the end of stdout | 「stdio: close() closes stdin, then cancels stdout, and does n…」 | 1 |
| M87 N2: tools/call keeps the highest version after a modern retry | 「-32022 with supported versions: one retry with the highest v…」 | 1 |
| M88 N2b: notifications/cancelled keeps the highest version | 「stdio: after a -32022 retry the cancel notification carries …」 | 1 |
| M89 N2c: tasks/* keep the highest version after a modern retry | 「-32022 with supported versions: one retry with the highest v…」 | 1 |
| M90 N1d: MCP-Protocol-Version header is the highest while _meta follows negotiation | 「-32022 with supported versions: one retry with the highest v…」；「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M91 N4c: a 400 JSON-RPC answer to tools/call is not-sent | C02 | 1 |
| M92 N4d: a 400 JSON-RPC answer to tools/list is connection-unavailable | O01；O03；O07 | 1 |
| M93 N5c: getTask accepts an error that is not an object | G05 | 1 |
| M94 N6b: legacy initialize accepts a version the transport speaks on discover | I02 | 1 |
| M95 N6c: legacy version checked by date range | I02 | 1 |
| M96 D2: the legacy connection _meta declares the tasks extension | 「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M97 D3: -32022 without a modern supported version is discover-shape | D06 | 1 |
| M98 D3: -32022 supported versions are not filtered to modern ones | D06 | 1 |
| M99 D3: a discover result with no version in common is discover-shape | D02 | 1 |
| M100 D4: the scripted transport speaks a legacy version on discover | 「refuses a legacy version among the versions it speaks on ser…」 | 1 |
| M101 D4: the suite accepts a fixture that lists a legacy version | 「fails each case before it opens a transport」 | 1 |
| M102 D16: a 5xx to discover is read like a 4xx | D16 | 1 |
| M103 D5: a discover body of another status is ignored | D04；D05；D07；D08 | 1 |
| M104 R4-5: legacy initialize declares elicitation.form (round-3 shape) | 「a legacy peer: discover falls back to initialize and initial…」；「after negotiation every request carries the negotiated versi…」；「legacy: initialize offers the highest legacy version and dec…」；「streamable-http on a legacy revision: cancelRequest sends no…」；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M105 R4-5: a ping of the peer gets -32601 | 「legacy: a ping of the peer gets an empty result and any othe…」 | 1 |
| M106 R4-5: requests of the peer before initialize is answered get no answer | 「legacy: a ping of the peer gets an empty result and any othe…」 | 1 |
| M107 R4-5: legacy Streamable HTTP cancel ends the answer stream | 「streamable-http on a legacy revision: cancelRequest sends no…」 | 1 |
| M108 R4-5: the legacy session id is not carried | S07；「streamable-http: on the legacy path each later request carri…」 | 1 |
| M109 S07: a 404 to the legacy session is connection-unavailable | S07 | 1 |
| M110 S07: the transport stays usable after the session ended | S07 | 1 |
| M111 R4-4: progress of another token reaches observe | 「a call carries a progress token unique per request; its prog…」 | 1 |
| M112 R4-4: any notification reaches observe as progress | 「a call carries a progress token unique per request; its prog…」 | 1 |
| M113 R4-3: a rejecting authorize rejects the operation | 「a credential handle whose authorize rejects or throws: not-s…」 | 1 |
| M114 R4-3: a rejecting reportRejection rejects the operation | 「a credential handle whose reportRejection rejects: the refus…」 | 1 |
| M115 L03: a nextCursor that is not text is dropped | L03 | 1 |
| M116 D15/O05: a 2xx without an answer is not-sent | C04；D15；I06；O05；O06 | 1 |
| M117 O07/C04: a 5xx without a JSON-RPC error is re-sent like a broken stream | O07 | 1 |
| M118 O08/C05/I07: a 4xx without a JSON-RPC error is no-answer | C05；I07；O08 | 1 |
| M119 R4: a metadata document that is not an object counts as fetched | 「401: a named resource_metadata that is not a JSON object cou…」 | 1 |
| M120 D12: a 4xx body -32602 on discover is read as the answer | D12 | 1 |
| M121 S01: a broken stdio stream leaves the transport usable | S01；S03 | 1 |
| M122 G06: -32602 on tasks/get is error-answer, not expired | G06 | 1 |
| M123 N01: an HTTP answer to a notification ends the transport | N01 | 1 |
| M124 D02: a discover result with no version in common reports discover-shape | D02 | 1 |
71
