#!/usr/bin/env python3
"""Round-2 mutation campaign for w3-mcp-contract (M53 on): apply one violation, rebuild dist,
run the named test files, record which cases went red, restore the files byte-exact from git,
rebuild. Each mutation is a violating transport (or a broken fixture) that a round-2 case must
catch."""
import json, os, re, subprocess, sys

PKG = '/home/user/omne-harness-lite/.worktrees/w3-mcp-contract/packages/mcp/mcp-contract'
OUT = '/home/user/omne-harness-lite/.worktrees/w3-mcp-contract/tmp/closures/w3-mcp-contract/red'
ST = 'src/testing-scripted-transport.ts'
TT = 'src/testing-transport.ts'
CL = 'src/classify.ts'
TC = 'tests/transport-conformance.spec.ts'
CS = 'tests/classify.spec.ts'
WT = 'src/wire.ts'
WS = 'tests/wire.spec.ts'

OLD_OBSERVED = '''function observedProcess(process: ProcessHandle, events: string[]): ProcessHandle {
  return {
    stdin: new WritableStream<Uint8Array>({
      close() {
        events.push('stdin-closed')
      },
    }),
    stdout: new ReadableStream<Uint8Array>({
      cancel() {
        events.push('stdout-cancelled')
      },
    }),
    stderr: process.stderr,
    exited: process.exited,
    stop: async () => {
      events.push('stop')
      return process.stop()
    },
  }
}
'''

def observed_new():
    src = open(os.path.join(PKG, TT)).read()
    a = src.index('function observedProcess(')
    b = src.index('\n}\n', a) + 3
    return src[a:b]

META = """    const meta: PlainRecord =
      method === 'tools/call'
        ? { ...this.envelope(version), progressToken: id }
        : this.envelope(version)"""
ENV = """      [CLIENT_INFO_KEY]: this.options.clientInfo ?? { name: 'scripted-transport', version: '0' },
"""
M = [
 ('M53 B1: tasks/update and tasks/cancel carry no _meta', [(ST, META, META.replace(": this.envelope(version)", ": method === 'tasks/update' || method === 'tasks/cancel'\n          ? {}\n          : this.envelope(version)"))], [TC]),
 ('M54 B1b: no clientInfo in any _meta', [(ST, ENV, ENV.replace('[CLIENT_INFO_KEY]', 'clientInfo'))], [TC]),
 ('M55 B1c: a notification carries the capabilities only', [(ST, "      params: { ...params, _meta: this.envelope() },", "      params: { ...params, _meta: { [CLIENT_CAPABILITIES_KEY]: CLIENT_CAPABILITIES } },")], [TC]),
 ('M56 B2b: legacy initialize declares sampling and roots', [(ST, "const LEGACY_CAPABILITIES: PlainJson = {}", "const LEGACY_CAPABILITIES: PlainJson = { sampling: {}, roots: {} }")], [TC]),
 ('M57 ruling 3: legacy initialize declares the tasks extension', [(ST, "        capabilities: LEGACY_CAPABILITIES,", "        capabilities: CLIENT_CAPABILITIES,")], [TC]),
 ('M58 B3: reportRejection only for tools/call', [(ST, "    if (this.credential !== undefined && this.authorized.has(request.id))", "    if (\n      this.credential !== undefined &&\n      this.authorized.has(request.id) &&\n      request.method === 'tools/call'\n    )")], [TC]),
 ('M59 B3b: no reportRejection for tools/list', [(ST, "    if (this.credential !== undefined && this.authorized.has(request.id))", "    if (\n      this.credential !== undefined &&\n      this.authorized.has(request.id) &&\n      request.method !== 'tools/list'\n    )")], [TC]),
 ('M60 B4: any 403 with a Bearer challenge is authorization-required', [(ST, "(status === 403 && challenge.get('error') === 'insufficient_scope')", "(status === 403 && challenge.size > 0)")], [TC]),
 ('M61 B5a: -32022 without a version in common falls back to legacy', [(ST, "      ? { kind: 'final', failure: malformed('discover-shape') }\n      : { kind: 'retry', version: common }", "      ? { kind: 'fallback', failure: malformed('discover-shape') }\n      : { kind: 'retry', version: common }")], [TC]),
 ('M62 B5b: -32021 and -32020 fall back to legacy', [(ST, "    if (MODERN_ERROR_CODES.includes(answer.code)) return { kind: 'final', failure: answer }", "    if (answer.code === -32022) return { kind: 'final', failure: answer }")], [TC]),
 ('M63 B5c: -32022 after the retry falls back to legacy', [(ST, "    if (MODERN_ERROR_CODES.includes(answer.code)) return { kind: 'final', failure: answer }", "    if (MODERN_ERROR_CODES.includes(answer.code) && answer.code !== -32022)\n      return { kind: 'final', failure: answer }")], [TC]),
 ('M64 B6: legacy instructions not bounded', [(ST, "                ...boundInstructions(instructions, this.material.instructionsByteLimit),", "                ...boundInstructions(\n                  instructions,\n                  isLegacyProtocolVersion(version)\n                    ? Number.MAX_SAFE_INTEGER\n                    : this.material.instructionsByteLimit,\n                ),")], [TC]),
 ('M65 B8: _meta keeps the highest version after legacy negotiation', [(ST, "    const version = how.version ?? this.version ?? this.highest", "    const version = how.version ?? this.highest"), (ST, "  private envelope(version = this.version ?? this.highest): PlainRecord {", "  private envelope(version = this.highest): PlainRecord {")], [TC]),
 ('M66 ruling 2: _meta keeps the highest version after a -32022 retry', [(ST, "      return { failure: 'no-common-version' }\n    this.version = version", "      return { failure: 'no-common-version' }\n    this.version = this.highest")], [TC]),
 ('M67 ruling 2: initialize carries the modern version in _meta', [(ST, "      },\n      OFFERED_LEGACY_VERSION,\n    )", "      },\n    )")], [TC]),
 ('M68 ruling 1: no Mcp-Name on tasks/*', [(ST, "  'tasks/get': 'taskId',\n  'tasks/update': 'taskId',\n  'tasks/cancel': 'taskId',\n", "")], [TC]),
 ('M69 ruling 1: Mcp-Name on every request', [(ST, "    ...(typeof name === 'string' ? { 'mcp-name': name } : {}),", "    'mcp-name': typeof name === 'string' ? name : method,")], [TC]),
 ('M70 ruling 1: MCP-Protocol-Version header is always the highest version', [(ST, "        ? { headers: headersOf(method, params, version, this.session) }", "        ? { headers: headersOf(method, params, this.highest, this.session) }")], [TC]),
 ('M71 ruling 4: every 400 on discover is a legacy peer', [(ST, "  return error === undefined ? { kind: 'legacy-signal' } : { kind: 'error', error }", "  return { kind: 'legacy-signal' }")], [TC]),
 ('M72 ruling 4: every JSON-RPC 400 on discover is an error answer', [(ST, "  return code !== undefined && MODERN_ERROR_CODES.includes(code) ? error : undefined", "  return code !== undefined ? error : undefined")], [TC]),
 ('M73 ruling 4: a JSON-RPC error body of an HTTP error is not-sent', [(ST, "  if (error !== undefined) return { kind: 'error', error }\n  return reply.status >= 500", "  if (error !== undefined) return { kind: 'not-sent', failure: notSent }\n  return reply.status >= 500")], [TC]),
 ('M74 ruling 6: legacy version not checked against the list', [(ST, "        !isLegacyProtocolVersion(version) ||\n", "")], [TC]),
 ('M75 T3: -32601 reports the modern failure', [(ST, "    if (answer.code === METHOD_NOT_FOUND) return { kind: 'legacy-peer' }\n", "")], [TC]),
 ('M76 C6: probe time starts before the pace hook', [(ST, "    await this.options.pace?.(request)\n    if (!this.pending.has(request.id)) return\n    if (probeTimeoutMs !== undefined) entry.startProbe(probeTimeoutMs)", "    if (probeTimeoutMs !== undefined) entry.startProbe(probeTimeoutMs)\n    await this.options.pace?.(request)\n    if (!this.pending.has(request.id)) return")], [TC]),
 ('M77 C6: probe timer not cleared by the answer', [(ST, "        clearTimeout(probe)\n", "")], [TC]),
 ('M78 C7: failed without error makes up an error', [(ST, "  if (status === 'failed' && !isObject(member(result, 'error')))\n    return { failure: malformed('error-missing') }\n", ""), (ST, "      const error = member(result, 'error')\n      return error === undefined\n        ? { failure: malformed('error-missing') }\n        : { ok: { kind: 'finished', answer: { kind: 'error', error } } }", "      const error = member(result, 'error') ?? jsonOf({ code: -32603, message: 'failed' })\n      return { ok: { kind: 'finished', answer: { kind: 'error', error } } }")], [TC]),
 ('M79 C7: an error that is not an object is accepted', [(ST, "  if (status === 'failed' && !isObject(member(result, 'error')))", "  if (status === 'failed' && member(result, 'error') === undefined)")], [TC]),
 ('M80 C9: a negative hint is kept', [(CL, "const COUNT = /^\\d+$/u", "const COUNT = /^-?\\d+$/u")], [CS, TC]),
 ('M81 C9: an unsafe hint is kept', [(CL, "  return Number.isSafeInteger(count) ? count : undefined", "  return count")], [CS, TC]),
 ('M82 C1: observedProcess does not carry the pipes (round-1 shape)', 'OBSERVED', [TC]),
 ('M84 C2: another 403 with a challenge still reports the rejection', [(ST, "    if (reply.status === 403) return { kind: 'not-sent', failure: notSent }", "    if (reply.status === 403) {\n      if (challenge.size > 0) await this.credential?.reportRejection()\n      return { kind: 'not-sent', failure: notSent }\n    }")], [TC]),
 ('M86 C1: observedProcess forwards the end of stdout', [(TT, "        if (cancelled || next.done) return\n        controller.enqueue(next.value)", "        if (cancelled) return\n        if (next.done) controller.close()\n        else controller.enqueue(next.value)")], [TC]),
 ('M87 N2: tools/call keeps the highest version after a modern retry', [(ST, "    const version = how.version ?? this.version ?? this.highest", "    const version =\n      how.version ??\n      (method === 'tools/call' && this.version !== undefined && isModernProtocolVersion(this.version)\n        ? this.highest\n        : (this.version ?? this.highest))")], [TC]),
 ('M88 N2b: notifications/cancelled keeps the highest version', [(ST, "      params: { ...params, _meta: this.envelope() },", "      params: {\n        ...params,\n        _meta: this.envelope(method === 'notifications/cancelled' ? this.highest : undefined),\n      },")], [TC]),
 ('M89 N2c: tasks/* keep the highest version after a modern retry', [(ST, "    const version = how.version ?? this.version ?? this.highest", "    const version =\n      how.version ??\n      (method.startsWith('tasks/') && this.version !== undefined && isModernProtocolVersion(this.version)\n        ? this.highest\n        : (this.version ?? this.highest))")], [TC]),
 ('M90 N1d: MCP-Protocol-Version header is the highest while _meta follows negotiation', [(ST, "        ? { headers: headersOf(method, params, version, this.session) }", "        ? { headers: headersOf(method, params, this.highest, this.session) }")], [TC]),
 ('M91 N4c: a 400 JSON-RPC answer to tools/call is not-sent', [(ST, "      if (wire.kind === 'not-sent') return { failure: wire.failure }", "      if (wire.kind === 'not-sent') return { failure: wire.failure }\n      if (wire.kind === 'error') return { failure: notSent }")], [TC]),
 ('M92 N4d: a 400 JSON-RPC answer to tools/list is connection-unavailable', [(ST, "    return request.method === 'server/discover' ? probeAnswerOf(reply) : errorAnswerOf(reply)", "    if (request.method === 'tools/list') return { kind: 'not-sent', failure: notSent }\n    return request.method === 'server/discover' ? probeAnswerOf(reply) : errorAnswerOf(reply)")], [TC]),
 ('M93 N5c: getTask accepts an error that is not an object', [(ST, "  if (status === 'failed' && !isObject(member(result, 'error')))", "  if (status === 'failed' && member(result, 'error') === undefined)"), (ST, "      return error === undefined", "      return !isObject(error)")], [TC]),
 ('M94 N6b: legacy initialize accepts a version the transport speaks on discover', [(ST, "        !isLegacyProtocolVersion(version) ||\n", "        !(isLegacyProtocolVersion(version) || this.versions.includes(version)) ||\n")], [TC]),
 ('M95 N6c: legacy version checked by date range', [(ST, "        !isLegacyProtocolVersion(version) ||\n", "        !(version >= '2024-10-07' && version < '2026-07-28') ||\n")], [TC]),
 ('M96 D2: the legacy connection _meta declares the tasks extension', [(ST, "      [CLIENT_CAPABILITIES_KEY]: isModernProtocolVersion(version)\n        ? CLIENT_CAPABILITIES\n        : LEGACY_CAPABILITIES,", "      [CLIENT_CAPABILITIES_KEY]: CLIENT_CAPABILITIES,")], [TC]),
 ('M97 D3: -32022 without a modern supported version is discover-shape', [(ST, "    if (modern.length === 0) return { kind: 'legacy-peer' }", "    if (modern.length === 0) return { kind: 'final', failure: malformed('discover-shape') }")], [TC]),
 ('M98 D3: -32022 supported versions are not filtered to modern ones', [(ST, "    const modern = (supportedOf(data) ?? []).filter(isModernProtocolVersion)", "    const modern = supportedOf(data) ?? []")], [TC]),
 ('M99 D3: a discover result with no version in common is discover-shape', [(ST, "        if (read.failure === 'no-common-version') return { kind: 'legacy-peer' }", "        if (read.failure === 'no-common-version')\n          return { kind: 'final', failure: malformed('discover-shape') }")], [TC]),
 ('M100 D4: the scripted transport speaks a legacy version on discover', [(ST, "  if (versions.length === 0 || !versions.every(isModernProtocolVersion))", "  if (versions.length === 0)")], [TC]),
 ('M101 D4: the suite accepts a fixture that lists a legacy version', [(TT, "    fixture.protocolVersions.every(isModernProtocolVersion),", "    fixture.protocolVersions.length > 0,")], [TC]),
 ('M102 D16: a 5xx to discover is read like a 4xx', [(ST, "  if (reply.status >= 500) return { kind: 'server-error' }\n", "")], [TC]),
 ('M103 D5: a discover body of another status is ignored', [(ST, "  return error === undefined ? { kind: 'legacy-signal' } : { kind: 'error', error }", "  return error === undefined || reply.status !== 400\n    ? { kind: 'legacy-signal' }\n    : { kind: 'error', error }")], [TC]),
 ('M104 R4-5: legacy initialize declares elicitation.form (round-3 shape)', [(ST, "const LEGACY_CAPABILITIES: PlainJson = {}", "const LEGACY_CAPABILITIES: PlainJson = { elicitation: { form: {} } }")], [TC]),
 ('M105 R4-5: a ping of the peer gets -32601', [(ST, "        request.method === 'ping'\n", "        request.method === 'never'\n")], [TC]),
 ('M106 R4-5: requests of the peer before initialize is answered get no answer', [(ST, "    this.answerPeerRequests('initialize')\n", "")], [TC]),
 ('M107 R4-5: legacy Streamable HTTP cancel ends the answer stream', [(ST, "    if (this.material.kind === 'stdio' || this.legacy) {", "    if (this.material.kind === 'stdio') {")], [TC]),
 ('M108 R4-5: the legacy session id is not carried', [(ST, "        ? { headers: headersOf(method, params, version, this.session) }", "        ? { headers: headersOf(method, params, version, undefined) }")], [TC]),
 ('M109 S07: a 404 to the legacy session is connection-unavailable', [(ST, "      return { kind: 'not-sent', failure: { kind: 'not-sent', cause: 'session-ended' } }", "      return { kind: 'not-sent', failure: notSent }")], [TC]),
 ('M110 S07: the transport stays usable after the session ended', [(ST, "      this.dead = 'session-ended'\n", "")], [TC]),
 ('M111 R4-4: progress of another token reaches observe', [(ST, "    if (params['progressToken'] !== entry.progressToken) return\n", "")], [TC]),
 ('M112 R4-4: any notification reaches observe as progress', [(ST, "    if (notification.method !== 'notifications/progress' || observe === undefined) return", "    if (observe === undefined) return")], [TC]),
 ('M113 R4-3: a rejecting authorize rejects the operation', [(ST, "      .then(() => credential.authorize(headers))\n      .catch(() => undefined)", "      .then(() => credential.authorize(headers))")], [TC]),
 ('M114 R4-3: a rejecting reportRejection rejects the operation', [(ST, "        .then(() => this.credential?.reportRejection())\n        .catch(() => undefined)", "        .then(() => this.credential?.reportRejection())")], [TC]),
 ('M115 L03: a nextCursor that is not text is dropped', [(ST, "      if (cursor !== undefined && nextCursor === undefined)\n        return { failure: malformed('cursor-invalid') }\n", "")], [TC]),
 ('M116 D15/O05: a 2xx without an answer is not-sent', [(ST, "    if (reply.status < 300) return { kind: 'no-answer', cause: 'stream-broken' }", "    if (reply.status < 300) return { kind: 'not-sent', failure: notSent }")], [TC]),
 ('M117 O07/C04: a 5xx without a JSON-RPC error is re-sent like a broken stream', [(ST, "  return reply.status >= 500 ? { kind: 'server-error' } : { kind: 'not-sent', failure: notSent }", "  return reply.status >= 500\n    ? { kind: 'no-answer', cause: 'stream-broken' }\n    : { kind: 'not-sent', failure: notSent }")], [TC]),
 ('M118 O08/C05/I07: a 4xx without a JSON-RPC error is no-answer', [(ST, "  return reply.status >= 500 ? { kind: 'server-error' } : { kind: 'not-sent', failure: notSent }", "  return reply.status >= 500 ? { kind: 'server-error' } : { kind: 'server-error' }")], [TC]),
 ('M119 R4: a metadata document that is not an object counts as fetched', [(ST, "      if (isPlainRecord(metadata)) {\n        found = { url, metadata }", "      if (metadata !== undefined) {\n        found = { url, metadata: isPlainRecord(metadata) ? metadata : {} }")], [TC]),
 ('M120 D12: a 4xx body -32602 on discover is read as the answer', [(ST, "  return code !== undefined && MODERN_ERROR_CODES.includes(code) ? error : undefined", "  return code !== undefined && [...MODERN_ERROR_CODES, -32602].includes(code) ? error : undefined")], [TC]),
 ('M121 S01: a broken stdio stream leaves the transport usable', [(ST, "        if (this.material.kind === 'stdio') return this.die('stream-broken')", "        if (this.material.kind === 'stdio')\n          return entry.settle({ kind: 'no-answer', cause: 'stream-broken' })")], [TC]),
 ('M122 G06: -32602 on tasks/get is error-answer, not expired', [(ST, "  return errorOf(wire.error)?.code === -32602 ? { ok: 'expired' } : undefined", "  return errorOf(wire.error)?.code === -32600 ? { ok: 'expired' } : undefined")], [TC]),
 ('M123 N01: an HTTP answer to a notification ends the transport', [(ST, "    if (reply === undefined || this.material.kind !== 'stdio') return", "    if (reply === undefined) return\n    if (this.material.kind !== 'stdio' && reply.kind === 'http') this.die('stream-broken')\n    if (this.material.kind !== 'stdio') return")], [TC]),
 ('M124 D02: a discover result with no version in common reports discover-shape', [(ST, "        if (read.failure === 'no-common-version') return { kind: 'legacy-peer' }", "        if (read.failure === 'no-common-version')\n          return { kind: 'fallback', failure: malformed('discover-shape') }")], [TC]),
 ('M125 (r1 M04) D10: a non-modern error on discover is final', [(ST, "    return { kind: 'fallback', failure: answer }", "    return { kind: 'final', failure: answer }")], [TC]),
 ('M126 (r1 M05) D13: the stdio probe time is final, not a fallback', [(ST, "      case 'legacy-signal':\n      case 'probe-timeout':\n        return { kind: 'legacy-peer' }", "      case 'legacy-signal':\n        return { kind: 'legacy-peer' }\n      case 'probe-timeout':\n        return { kind: 'final', failure: malformed('discover-shape') }")], [TC]),
 ('M127 (r1 M08) D01: the version is the peer first one, not the highest in common', [(ST, "    return this.versions.find(version => offered.includes(version))", "    return offered.find(version => this.versions.includes(version))")], [TC]),
 ('M128 (r1 M09) D01: serverInfo not read', [(ST, "    const serverInfo = isObject(meta) ? member(meta, SERVER_INFO_KEY) : undefined", "    const serverInfo = undefined")], [TC]),
 ('M129 (r1 M23) D11/O03: an error with a non-integer code is read', [(ST, "  if (code?.kind !== 'number' || !INTEGER.test(code.lexeme) || message === undefined)", "  if (code?.kind !== 'number' || message === undefined)")], [TC]),
 ('M130 (r1 M24) L02: a result without tools is an empty page', [(ST, "      if (!isObject(result) || tools === undefined) return { failure: malformed('tools-missing') }", "      if (!isObject(result)) return { failure: malformed('tools-missing') }\n      if (tools === undefined) return { ok: { tools: [] } }")], [TC]),
 ('M131 (r1 M25) G02: an unknown status is working', [(ST, "  const status = TASK_STATUSES.find(known => known === written)", "  const status = TASK_STATUSES.find(known => known === written) ?? 'working'")], [TC]),
 ('M132 (r1 M26) G03: input_required without inputRequests is read', [(ST, "  if (status === 'input_required' && !isObject(inputRequests))", "  if (status === 'input_required' && inputRequests === undefined && status !== 'input_required')")], [TC]),
 ('M133 (r1 M27) G04: completed without result is read', [(ST, "  if (status === 'completed' && member(result, 'result') === undefined)", "  if (status === 'completed' && member(result, 'result') === undefined && status !== 'completed')")], [TC]),
 ('M134 (r1 M29) G01: hints dropped from the task report', [(ST, "    ...taskHintsOf(result),", "")], [TC]),
 ('M135 (r1 M41) C01/L01: a result is not handed over as written', [(ST, "          result: jsonOf(reply.result),", "          result: jsonOf({ wrapped: reply.result }),")], [TC]),
 ('M136 (r1 M45) W01: tasks/update sends the responses under another name', [(ST, "inputResponses: plainOf(inputResponses)", "responses: plainOf(inputResponses)")], [TC]),
 ('M137 (r1 M46) W01: cancelTask sends tasks/get', [(ST, "    const wire = await this.request('tasks/cancel', { taskId })", "    const wire = await this.request('tasks/get', { taskId })")], [TC]),
 ('M138 (r1 M49) L01: nextCursor dropped from the page', [(ST, "          ...(nextCursor === undefined ? {} : { nextCursor }),", "")], [TC]),
 ('M139 (r1 M20) O04/I05/D14/C03: close does not settle the requests in flight', [(ST, "    for (const entry of this.pending.values())\n      entry.settle({ kind: 'no-answer', cause: 'abandoned' })\n    if (this.material.kind !== 'stdio') return", "    if (this.material.kind !== 'stdio') return")], [TC]),
 ('M140 (r1 M19) C03: the signal after sending does not settle the answer', [(ST, "      () => entry?.settle({ kind: 'no-answer', cause: 'abandoned' }),", "      () => undefined,")], [TC]),
 ('M141 (r1 M22) S02/S04: a process exit is reported as a broken stream', [(ST, "        return this.die('process-exited')", "        return this.die('stream-broken')")], [TC]),
 ('M142 D03: an unreadable discover result reports the legacy failure', [(ST, "        return { kind: 'fallback', failure: malformed('discover-shape') }", "        return { kind: 'legacy-peer' }")], [TC]),
 ('M143 I01: notifications/initialized is not sent', [(ST, "    this.sendNotification('notifications/initialized', {})\n", "")], [TC]),
 ('M144 W01: cancelTask reads only an empty result', [(ST, "    return interpret(wire, () => ({ ok: 'requested' }))", "    return interpret(wire, result =>\n      isObject(result) && result.entries.length === 0\n        ? { ok: 'requested' }\n        : { failure: malformed('status-unknown') },\n    )")], [TC]),
 ('M145 R6-3: the envelope does not check jsonrpc', [(WT, "  if (textOf(member(message, 'jsonrpc')) !== '2.0') return undefined\n", "")], [WS, TC]),
 ('M146 R6-3: an answer with both result and error is read as the result', [(WT, "  if (result !== undefined && error === undefined) return { result }", "  if (result !== undefined) return { result }")], [WS, TC]),
 ('M147 R6-3: a stdio line of another id answers the request', [(WT, "member(message, 'method') === undefined && sameId(message, context.id)", "member(message, 'method') === undefined && idOf(message) !== undefined")], [WS, TC]),
 ('M148 R6-3: an HTTP error body is read without the envelope', [(WT, "  if (envelope === undefined || !('error' in envelope)) return 'plain'\n  return errorClassOf(envelope.error, versions)", "  const error = isObject(message) ? member(message, 'error') : undefined\n  if (envelope === undefined && error === undefined) return 'plain'\n  return error === undefined ? 'plain' : errorClassOf(error, versions)")], [WS, TC]),
 ('M149 R6-3: an error without a text message is read by its code', [(WT, "  if (textOf(member(error, 'message')) === undefined) return 'unreadable'\n", "")], [WS, TC]),
 ('M150 R6-4: the exit window is a second', [(WT, "export const PROCESS_EXIT_WINDOW_MS = 100", "export const PROCESS_EXIT_WINDOW_MS = 1000")], [WS, TC]),
 ('M151 R6-4: an exit exactly at the window is a broken stream', [(WT, "exitedAt - stdoutEndedAt <= PROCESS_EXIT_WINDOW_MS", "exitedAt - stdoutEndedAt < PROCESS_EXIT_WINDOW_MS")], [WS, TC]),
 ('M152 R6-4: an exit before stdout ended is a broken stream', [(WT, "exitedAt - stdoutEndedAt <= PROCESS_EXIT_WINDOW_MS", "(exitedAt >= stdoutEndedAt && exitedAt - stdoutEndedAt <= PROCESS_EXIT_WINDOW_MS)")], [WS, TC]),
 ('M153 R6-2: a 3xx is read as a 400', [(WT, "  return STATUS_CLASSES[status] ?? '4xx'", "  if (status < 400) return '400'\n  return STATUS_CLASSES[status] ?? '4xx'")], [WS, TC]),
 ('M154 R6-2: an open 2xx stream counts as ended', [(WT, "      return event.ended ? answer('http:2xx') : { kind: 'waiting' }", "      return answer('http:2xx')")], [WS, TC]),
 ('M155 R6-2: a non-JSON stdio line is not about the request', [(WT, "      if (message === undefined) return answer('stream-broken')", "      if (message === undefined) return { kind: 'other' }")], [WS, TC]),
 ('M156 R6-2: a request that failed before it left is a broken stream', [(WT, "      return answer('unsent')", "      return answer('stream-broken')")], [WS, TC]),
 ('M157 N6: the classifier does not require taskId', [(WT, "    taskId === undefined ||\n    taskId === '' ||\n", "")], [WS, TC]),
 ('M158 X02: stdio stays usable after a request could not be written', [(ST, "      if (this.material.kind === 'stdio') this.die('stream-broken')\n", "")], [TC]),
 ('M159 X01: a request that failed before it left reaches the peer', [(ST, "      if (this.material.kind === 'stdio') this.die('stream-broken')\n", "      if (this.material.kind === 'stdio') this.die('stream-broken')\n      this.peer.log.push(request)\n")], [TC]),
 ('M160 N5: a legacy HTTP notification carries no session', [(ST, "              ...(this.session === undefined ? {} : { 'mcp-session-id': this.session }),\n", "")], [TC]),
 ('M161 N1: a modern HTTP cancel leaves the answer waiting', [(ST, "    this.peer.log.push({ kind: 'stream-aborted', id: requestId })\n    entry.settle({ kind: 'no-answer', cause: 'abandoned' })", "    this.peer.log.push({ kind: 'stream-aborted', id: requestId })")], [TC]),
 ('M162 N6: a negative ttl of a page is kept', [(ST, "      const ttlMs = countOf(member(result, 'ttlMs'))", "      const ttlNode = member(result, 'ttlMs')\n      const ttlMs = ttlNode?.kind === 'number' ? Number(ttlNode.lexeme) : undefined")], [TC]),
 ('M163 N6: tasks/get without taskId is read', [(ST, "  if (status === undefined || taskId === undefined || taskId === '')", "  if (status === undefined)")], [TC]),
 ('M164 R6-3: an HTTP error body without the envelope is read as an error', [(ST, "  if (parsed['jsonrpc'] !== '2.0' || error === undefined || parsed['result'] !== undefined)", "  if (error === undefined)")], [TC]),
 ('M85 record: headers recorded on stdio too', [(ST, "      ...(this.material.kind === 'streamable-http'\n        ? { headers: headersOf(method, params, version, this.session) }\n        : {}),", "      headers: headersOf(method, params, version, this.session),")], [TC]),
]

def run(cmd):
    return subprocess.run(cmd, cwd=PKG, capture_output=True, text=True)

def restore(paths):
    for path in paths:
        subprocess.run(['git', 'checkout', '--', path], cwd=PKG, check=True)

results = []
only = sys.argv[1:]
for name, patches, tests in M:
    if only and not any(name.startswith(o + ' ') for o in only):
        continue
    if patches == 'OBSERVED':
        patches = [(TT, observed_new(), OLD_OBSERVED)]
    touched = sorted({p[0] for p in patches})
    sources = {p: open(os.path.join(PKG, p)).read() for p in touched}
    texts = dict(sources)
    missing = [old for f, old, _ in patches if texts[f].count(old) != 1]
    if missing:
        results.append({'name': name, 'error': 'pattern not unique or not found'}); print(name, 'PATTERN', missing[0][:60]); continue
    for f, old, new in patches:
        texts[f] = texts[f].replace(old, new, 1)
    try:
        for f in touched:
            open(os.path.join(PKG, f), 'w').write(texts[f])
        build = run(['pnpm', 'run', 'build'])
        if build.returncode != 0:
            results.append({'name': name, 'build': 'failed', 'red': ['(build failed) ' + ' | '.join(l for l in build.stdout.splitlines() if 'error TS' in l)[:300]]})
            print(name, 'BUILD FAILED'); continue
        env = dict(os.environ, NO_COLOR='1')
        test = subprocess.run(['pnpm', 'exec', 'vitest', 'run', '--mode', 'fast', *tests], cwd=PKG, capture_output=True, text=True, env=env, timeout=900)
        red = sorted({re.sub(r'\s+\d+ms$', '', l.strip()[1:].strip()) for l in test.stdout.splitlines() if l.strip().startswith('×')})
        results.append({'name': name, 'exit': test.returncode, 'red': red})
        print(name, 'exit', test.returncode, 'red', len(red))
        with open(os.path.join(OUT, re.sub(r'[^A-Za-z0-9]+', '-', name)[:60] + '.log'), 'w') as fh:
            fh.write(test.stdout)
    finally:
        restore(touched)
subprocess.run(['pnpm', 'run', 'build'], cwd=PKG, capture_output=True)
path = os.path.join(OUT, 'mutations-r2.json')
prev = json.load(open(path)) if only and os.path.exists(path) else []
names = {r['name'] for r in results}
merged = sorted([r for r in prev if r['name'] not in names] + results, key=lambda r: r['name'])
json.dump(merged, open(path, 'w'), ensure_ascii=False, indent=1)
print('done', len(results))
