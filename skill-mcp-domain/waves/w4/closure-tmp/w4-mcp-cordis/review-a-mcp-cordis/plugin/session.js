import { NOT_SENT_FAILURE, OFFERED_LEGACY_VERSION, PROBE_REQUESTS, authorizationChallengeOf, authorizationRequiredAnswerOf, callAnswerOf, callRequestOf, cancelTaskRequest, cancelsByNotification, classifyWireEvent, clientEnvelopeOf, concludeAnswer, discoverWith, endedCauseOf, fallbackGetConclusionOf, getTaskRequest, getTaskResultRequest, legacyIdentityOf, legacyInitializeParamsOf, lineGoneAnswerOf, listActionsRequest, mcpRequestHeadersOf, notificationTextOf, peerRequestAnswerOf, readPeerMessage, requestClassOf, requestMetaOf, requestTextOf, responseTextOf, startAuthorizationDiscovery, stopAnswerOf, updateTaskRequest, withOneResend, } from '@omne-harness/mcp-contract';
const AUTHORIZING = { kind: 'authorizing' };
const SENT = { kind: 'sent', exchange: { kind: 'line' } };
const NOT_SENT = { wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } };
/** Reads a stream to its end in the background: an answer nobody waits for (T8 N01). */
function drain(exchange) {
    if (exchange.kind !== 'stream')
        return;
    void (async () => {
        try {
            for await (const message of exchange.messages)
                void message;
        }
        catch {
            // The body of an answer nobody waits for may break; nothing depends on it.
        }
    })();
}
const answerOf = (answered) => callAnswerOf(answered.wire);
/** One transport over one line. */
export class Session {
    generation;
    line;
    material;
    options;
    /** The requests in flight: an entry leaves the table when it settles, and only then. */
    pending = new Map();
    /** Aborts what no request owns: notifications, responses to the peer, the fallback GET, metadata. */
    teardown = new AbortController();
    nextId = 0;
    connection = { kind: 'modern' };
    closed = false;
    /** The one close in progress, once `close()` ran: every caller of `close()` gets it. */
    closing;
    dead;
    constructor(line, material, options) {
        this.line = line;
        this.material = material;
        this.options = options;
        this.generation = material.generation;
        void this.pump();
    }
    get usable() {
        return !this.closed && this.dead === undefined;
    }
    get credential() {
        return this.material.kind === 'streamable-http' ? this.material.credential : undefined;
    }
    get stdio() {
        return this.line.kind === 'stdio';
    }
    get target() {
        return this.material.kind === 'streamable-http' ? this.material.target : undefined;
    }
    get bound() {
        return {
            generation: this.generation,
            instructionsByteLimit: this.material.instructionsByteLimit,
        };
    }
    /** The connection as the contract's T2 and T5 rules see it. */
    get view() {
        const version = this.connection.version;
        if (this.line.kind === 'stdio')
            return { kind: 'stdio', version };
        return {
            kind: 'streamable-http',
            version,
            mode: this.connection.kind === 'legacy-sse' ? 'sse' : 'streamable',
        };
    }
    /** The `Mcp-Session-Id` a message carries: the legacy session, outside the SSE mode. */
    get sessionHeader() {
        return this.connection.kind === 'legacy' ? this.connection.session : undefined;
    }
    /** Whether a request carries a legacy session for T8 S07: the session header, or the SSE endpoint. */
    get carriesSession() {
        return this.sessionHeader !== undefined || this.connection.kind === 'legacy-sse';
    }
    reserveId() {
        this.nextId += 1;
        return `r${this.nextId}`;
    }
    inFlight(entry) {
        return this.pending.has(entry.id);
    }
    // ---- The workflows the session owns ----
    /**
     * Starts background work the session owns. The caller does not wait for it: it waits on the
     * settlement of its entry. A reject the work did not expect is a defect of the session: it goes
     * to the outlet first, so that a stop that throws cannot lose it; then the entry it was for is
     * stopped where it stands (DP-06), and a throw of that stop goes to the outlet too. Work
     * without an entry has no outcome.
     */
    work(flow, entry) {
        void flow().catch((defect) => {
            this.options.reportDefect(defect);
            if (entry === undefined)
                return;
            try {
                this.stop(entry);
            }
            catch (stopDefect) {
                this.options.reportDefect(stopDefect);
            }
        });
    }
    settle(entry, answered) {
        if (!this.pending.delete(entry.id))
            return;
        const phase = entry.phase;
        if (phase.kind === 'sent' && phase.exchange.kind === 'probe')
            phase.exchange.cancel();
        entry.settle(answered);
    }
    /**
     * Stops a request where it stands: the caller's signal fired, `close()` ran, or its workflow
     * failed. The entry settles by its phase there and then with the contract's rule (T5); its
     * exchange is released.
     */
    stop(entry) {
        if (!this.inFlight(entry))
            return;
        entry.controller.abort();
        const phase = entry.phase;
        if (phase.kind === 'sent' && phase.exchange.kind === 'stream')
            phase.exchange.abort();
        this.settle(entry, phase.kind === 'discovery'
            ? { wire: stopAnswerOf(phase), headers: phase.headers }
            : { wire: stopAnswerOf(phase) });
    }
    /**
     * The line is gone (T8 S rows, the SSE mode, S07): the transport is unusable from now on, and
     * every request in flight settles by its phase with the contract's rule: one still authorizing
     * is `not-sent`, one handed to the line answers the cause (left alone when the peer ended the
     * session), one discovering its authorization goes on to `authorization-required`.
     */
    die(cause) {
        this.dead ??= cause;
        for (const entry of this.pending.values()) {
            const wire = lineGoneAnswerOf(entry.phase, cause);
            if (wire !== undefined)
                this.settle(entry, { wire });
        }
    }
    /**
     * Reads the events of the line until it closes. Events that reject are a line that broke its
     * port: the shared stream is gone, so the session dies as on a broken stream (`die`, the
     * requests in flight settle by their phase), and the reason goes to the outlet. A throw on
     * reading one event is a defect of the session: it goes to the outlet, and the reading goes on.
     */
    async pump() {
        const events = this.line.events[Symbol.asyncIterator]();
        for (;;) {
            let next;
            try {
                next = await events.next();
            }
            catch (broken) {
                this.die('stream-broken');
                this.options.reportDefect(broken);
                return;
            }
            if (next.done)
                return;
            try {
                this.onEvent(next.value);
            }
            catch (defect) {
                this.options.reportDefect(defect);
            }
        }
    }
    onEvent(event) {
        switch (event.kind) {
            case 'line': {
                const peer = readPeerMessage(event.text);
                if (peer !== undefined)
                    return this.onPeerMessage(peer);
                for (const entry of this.pending.values())
                    if (this.classify(entry, { kind: 'line', text: event.text }, {}))
                        return;
                return;
            }
            case 'ended':
                return this.die(endedCauseOf(event));
            case 'broken':
                return this.die('stream-broken');
            default: {
                const exhaustive = event;
                return exhaustive;
            }
        }
    }
    /**
     * A request or notification of the peer (T3): `ping` answers an empty result, every other
     * request `-32601`; a progress notification whose token is the token of a call in flight goes
     * to its observer, as written and untrusted (S6); every other notification is dropped.
     */
    onPeerMessage(message) {
        if (message.kind === 'request')
            return this.work(() => this.respond(message));
        if (message.method !== 'notifications/progress' || message.progressToken === undefined)
            return;
        const entry = this.pending.get(message.progressToken);
        if (entry?.observe === undefined || message.params === undefined)
            return;
        try {
            entry.observe({ kind: 'progress', notification: { untrusted: message.params } });
        }
        catch {
            // S6: an observer that throws does not change the outcome.
        }
    }
    // ---- The credential handle (T4, T9) ----
    /**
     * Calls one method of the credential handle: never after `close()` (V2). A handle that rejects
     * or throws answers nothing: its failure is the handle's (T9).
     */
    callHandle(call) {
        if (this.closed)
            return Promise.resolve(undefined);
        try {
            return Promise.resolve(call()).then(answer => answer, () => undefined);
        }
        catch {
            return Promise.resolve(undefined);
        }
    }
    /**
     * Authorizes an outgoing request with the credential handle, when the material has one. True
     * when the handle let it go out; a transport that cannot be used, or a handle that fails,
     * rejects or throws, leaves it not sent (T9). What happened while the handle was asked is the
     * caller's to re-check: a request by its entry in the in-flight table, a message with no entry
     * by `authorizedToWrite`.
     */
    async authorize(headers) {
        if (!this.usable)
            return false;
        const credential = this.credential;
        if (credential === undefined)
            return true;
        const answer = await this.callHandle(() => credential.authorize(headers));
        return answer !== undefined && !('failure' in answer);
    }
    /**
     * Authorizes a message that has no entry (a response to the peer, a notification, the fallback
     * GET): true when the handle let it go out and the session is still usable now that the handle
     * answered.
     */
    async authorizedToWrite(headers) {
        return (await this.authorize(headers)) && this.usable;
    }
    /**
     * The refusal flow of T4 for a request sent to `target`: `reportRejection` once on the handle
     * that authorized it (every request of a material with a handle was), and the discovery of R4,
     * both from now on. The signal ends the discovery: no fetch starts after it, the one in flight
     * is let go, and what was not fetched by then is unavailable.
     */
    refusalOf(target, headers, signal) {
        const credential = this.credential;
        const reported = credential === undefined
            ? Promise.resolve()
            : this.callHandle(() => credential.reportRejection());
        const challenge = authorizationChallengeOf(headers['www-authenticate']);
        const run = startAuthorizationDiscovery(target, challenge, this.options.fetchMetadata, signal);
        return { soFar: run.soFar, done: Promise.all([reported, run.done]).then(([, found]) => found) };
    }
    // ---- Writing: headers, notifications, responses to the peer ----
    /** The headers of a message that is not a request: the protocol version and the session. */
    plainHeaders() {
        const headers = new Headers();
        headers.set('mcp-protocol-version', this.connection.version ?? this.options.versions[0]);
        const session = this.sessionHeader;
        if (session !== undefined)
            headers.set('mcp-session-id', session);
        return headers;
    }
    setMcpHeaders(headers, method, params, version) {
        const mcp = mcpRequestHeadersOf(method, params, version, this.sessionHeader);
        for (const [name, value] of Object.entries(mcp))
            if (value !== undefined)
                headers.set(name, value);
    }
    /** Writes a message nobody waits for. Whatever the wire does with it has no outcome (N01). */
    async write(outbound) {
        try {
            drain(await this.line.send(outbound, this.teardown.signal));
        }
        catch {
            // A line that rejects a write is a defect of the line; the message has no outcome anyway.
        }
    }
    /** Writes a response to a request of the peer (T3, P7): the POST is authorized; none after close. */
    async respond(request) {
        const headers = new Headers();
        if (!(await this.authorizedToWrite(headers)))
            return;
        for (const [name, value] of this.plainHeaders().entries())
            headers.set(name, value);
        const answer = peerRequestAnswerOf(request);
        await this.write({ text: responseTextOf({ id: request.id, ...answer }), headers });
    }
    /** Writes a notification (T3). Whatever the peer answers to it does not change any outcome (N01). */
    async notify(method, params) {
        const version = this.connection.version ?? this.options.versions[0];
        const headers = new Headers();
        if (!(await this.authorizedToWrite(headers)))
            return;
        this.setMcpHeaders(headers, method, params, version);
        const text = notificationTextOf({
            method,
            params: { ...params, _meta: clientEnvelopeOf(version, this.options.clientInfo) },
        });
        await this.write({ text, headers });
    }
    // ---- Requests: registration, the workflow, and the answer ----
    versionOf(sending) {
        switch (sending.kind) {
            case 'probe':
                return sending.version;
            case 'legacy-initialize':
                return OFFERED_LEGACY_VERSION;
            case 'operation':
            case 'call':
                return this.connection.version ?? this.options.versions[0];
            default: {
                const exhaustive = sending;
                return exhaustive;
            }
        }
    }
    makeEntry(id, context, sending) {
        const answered = Promise.withResolvers();
        const departed = Promise.withResolvers();
        const observe = sending.kind === 'call' ? sending.observe : undefined;
        return {
            id,
            context,
            controller: new AbortController(),
            answered: answered.promise,
            settle: answered.resolve,
            departed: departed.promise,
            depart: departed.resolve,
            ...(observe === undefined ? {} : { observe }),
            phase: AUTHORIZING,
        };
    }
    /**
     * Registers one request and starts its workflow; the caller waits on the entry's settlement.
     * Undefined when the transport cannot be used: nothing is registered.
     */
    begin(method, params, sending) {
        if (!this.usable)
            return undefined;
        const id = this.reserveId();
        const context = {
            id,
            request: sending.kind === 'probe' ? sending.request : requestClassOf(method, false),
            session: this.carriesSession && method !== 'initialize',
            versions: this.options.versions,
            ...(this.connection.kind === 'legacy-sse' ? { mode: 'sse' } : {}),
        };
        const entry = this.makeEntry(id, context, sending);
        this.pending.set(id, entry);
        if (sending.kind === 'call')
            this.wireSignal(entry, sending.signal);
        this.work(() => this.sendOut(entry, method, params, sending), entry);
        return entry;
    }
    /** Wires the call's signal to the entry: once it fires, the entry is stopped where it stands (T5). */
    wireSignal(entry, signal) {
        const onAbort = () => this.stop(entry);
        if (signal.aborted)
            return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        void entry.answered.then(() => signal.removeEventListener('abort', onAbort));
    }
    /**
     * The workflow of one request: authorizes it, composes it (T3) and hands it to the line, then
     * settles it from what the wire did at once. An entry stopped meanwhile drops what came back.
     */
    async sendOut(entry, method, params, sending) {
        const headers = new Headers();
        if (!(await this.authorize(headers)))
            return this.settle(entry, NOT_SENT);
        if (!this.inFlight(entry))
            return;
        const version = this.versionOf(sending);
        this.setMcpHeaders(headers, method, params, version);
        const values = sending.kind === 'operation' || sending.kind === 'call' ? sending.values : undefined;
        const text = requestTextOf({
            id: entry.id,
            method,
            params: {
                ...params,
                _meta: requestMetaOf(method, entry.id, version, this.options.clientInfo),
            },
            ...(values === undefined ? {} : { values }),
        });
        entry.phase = SENT;
        let exchange;
        try {
            exchange = await this.line.send({ text, headers }, entry.controller.signal);
        }
        catch {
            // A line that rejects a send is a defect of the line: the exchange ended before an answer.
            exchange = { kind: 'aborted' };
        }
        this.dispatch(entry, exchange);
    }
    /** Settles the entry from what the wire did with the request at once, or keeps reading. */
    dispatch(entry, exchange) {
        if (!this.inFlight(entry))
            return drain(exchange);
        switch (exchange.kind) {
            case 'unsent':
                return void this.classify(entry, { kind: 'unsent' }, {});
            case 'sent':
                entry.depart();
                return this.armProbe(entry);
            case 'aborted':
                // The exchange ended before the answer head and the entry is still open: an HTTP reset.
                return void this.classify(entry, { kind: 'http-aborted' }, {});
            case 'status':
                return void this.classify(entry, {
                    kind: 'http-status',
                    status: exchange.status,
                    headers: exchange.headers,
                    body: exchange.body,
                }, exchange.headers);
            case 'stream':
                entry.phase = { kind: 'sent', exchange: { kind: 'stream', abort: () => exchange.abort() } };
                entry.depart();
                return this.work(() => this.consume(entry, exchange), entry);
            default: {
                const exhaustive = exchange;
                return exhaustive;
            }
        }
    }
    /** stdio: a probe waits for its answer no longer than the probe time (T3, T8 D13). */
    armProbe(entry) {
        if (!this.stdio || !PROBE_REQUESTS.includes(entry.context.request))
            return;
        const cancel = this.options.schedule(this.options.probeTimeoutMs, () => this.classify(entry, { kind: 'nothing' }, {}));
        entry.phase = { kind: 'sent', exchange: { kind: 'probe', cancel } };
    }
    /**
     * Reads a 2xx answer stream: the messages of the peer, and the answer when it comes. Only the
     * reading of the body can break; a throw on one message is a defect of the session, which
     * `work` settles by the phase and reports.
     */
    async consume(entry, exchange) {
        const messages = exchange.messages[Symbol.asyncIterator]();
        for (;;) {
            let next;
            try {
                next = await messages.next();
            }
            catch {
                // The body broke before it ended: a broken stream for an entry still open.
                return void this.classify(entry, { kind: 'http-aborted' }, {});
            }
            if (next.done)
                break;
            this.onBodyMessage(entry, next.value, exchange.headers);
        }
        // The body ended with no answer: `http:2xx` on a modern connection, `waiting` in the SSE mode.
        this.classify(entry, { kind: 'http-stream', messages: [], ended: true }, exchange.headers);
    }
    /** One message of a 2xx body: a request or notification of the peer, or a candidate answer. */
    onBodyMessage(entry, text, headers) {
        const peer = readPeerMessage(text);
        if (peer !== undefined)
            return this.onPeerMessage(peer);
        this.classify(entry, { kind: 'http-stream', messages: [text], ended: false }, headers);
    }
    /**
     * Classifies one wire event for the entry and applies the T8 conclusion. True when the event was
     * the answer (settled or entered a flow) or the entry is settled already; false when it was no
     * answer to this request, or the request was not handed to the line yet or has its conclusion
     * already (T5: the first event decides; an answer reaches a request in the `sent` phase only).
     */
    classify(entry, event, headers) {
        if (!this.inFlight(entry))
            return true;
        if (entry.phase.kind !== 'sent')
            return false;
        const classified = classifyWireEvent(event, entry.context);
        if (classified.kind !== 'answer')
            return false;
        this.apply(entry, concludeAnswer(classified, entry.context, this.line.kind), headers);
        return true;
    }
    /** Settles a request from its T8 conclusion and applies what the row says of the transport. */
    apply(entry, conclusion, headers) {
        switch (conclusion.kind) {
            case 'wait':
                return;
            case 'settle':
                this.settle(entry, { wire: conclusion.wire, headers });
                if (conclusion.unusable !== undefined)
                    this.die(conclusion.unusable);
                return;
            case 'authorization-required':
                return this.enterDiscovery(entry, headers);
            default: {
                const exhaustive = conclusion;
                return exhaustive;
            }
        }
    }
    /**
     * T4: the request was refused. The refusal flow runs in the background; the entry settles with
     * `authorization-required` when the flow ends, or with what was fetched when it is stopped first.
     */
    enterDiscovery(entry, headers) {
        const target = this.target;
        if (target === undefined)
            return this.settle(entry, { ...NOT_SENT, headers });
        const refusal = this.refusalOf(target, headers, AbortSignal.any([this.teardown.signal, entry.controller.signal]));
        entry.phase = { kind: 'discovery', headers, soFar: refusal.soFar };
        this.work(async () => {
            const discovery = await refusal.done;
            this.settle(entry, { wire: authorizationRequiredAnswerOf(discovery), headers });
        }, entry);
    }
    /** Sends one non-call request; a read request is re-sent once after a broken stream (D15, O05). */
    request(method, params, sending = { kind: 'operation' }) {
        return withOneResend(() => this.once(method, params, sending));
    }
    /** Registers one request and waits on its settlement only: never on its workflow. */
    async once(method, params, sending) {
        const entry = this.begin(method, params, sending);
        return entry === undefined ? NOT_SENT : entry.answered;
    }
    /** Sends the request an operation composed and reads its answer the way the operation does. */
    async perform(composed) {
        const sending = composed.values === undefined
            ? { kind: 'operation' }
            : { kind: 'operation', values: composed.values };
        return composed.read((await this.request(composed.method, composed.params, sending)).wire);
    }
    /**
     * Waits for `work` no longer than the session is open: the value when it settled first,
     * undefined once `close()` ran (or when the work rejected). The work itself goes on; its late
     * value is the caller's to discard.
     */
    untilClosed(work) {
        const signal = this.teardown.signal;
        if (signal.aborted)
            return Promise.resolve(undefined);
        return new Promise(resolve => {
            const onClose = () => resolve(undefined);
            signal.addEventListener('abort', onClose, { once: true });
            void work
                .then(value => resolve(value), () => resolve(undefined))
                .finally(() => signal.removeEventListener('abort', onClose));
        });
    }
    // ---- The operations (T2, T3, T5, T6) ----
    async discover() {
        const discovered = await discoverWith({
            probe: async (version, request) => (await this.request('server/discover', {}, { kind: 'probe', version, request })).wire,
            legacy: () => this.legacyPath(),
        }, this.options.versions, this.bound);
        if ('ok' in discovered &&
            this.connection.kind === 'modern' &&
            this.connection.version === undefined)
            this.connection = { kind: 'modern', version: discovered.ok.protocolVersion };
        return discovered;
    }
    /** The legacy path (T3): `initialize` with the highest legacy version, then `notifications/initialized`. */
    async legacyPath() {
        const params = legacyInitializeParamsOf(this.options.clientInfo);
        const sending = { kind: 'legacy-initialize' };
        let answered = await this.request('initialize', params, sending);
        if (answered.wire.kind === 'legacy-http') {
            // T8 I07: the peer may speak the legacy HTTP+SSE transport (T3).
            const entered = await this.enterSse();
            answered = entered ?? (await this.request('initialize', params, sending));
        }
        const read = legacyIdentityOf(answered.wire, this.bound);
        if ('failure' in read)
            return read;
        this.connection = this.negotiated(read.ok.protocolVersion, answered.headers?.['mcp-session-id']);
        // `notifications/initialized` goes out before `discover` returns, so the requests that follow
        // find the peer initialized; no longer than the session is open, since it has no settlement.
        await this.untilClosed(this.notify('notifications/initialized', {}));
        return read;
    }
    /** The connection once the legacy path read `initialize`: the revision, and the session when the peer gave one. */
    negotiated(version, session) {
        if (this.connection.kind === 'legacy-sse')
            return { kind: 'legacy-sse', version };
        return session === undefined
            ? { kind: 'legacy', version }
            : { kind: 'legacy', version, session };
    }
    /**
     * Tries the legacy HTTP+SSE fallback (T3), waiting on the handle and the line no longer than the
     * session is open. Undefined when the line entered the SSE mode; otherwise the answer that
     * `initialize` reports: a refused authorization of the GET (S05, S06), or `not-sent` (I07).
     */
    async enterSse() {
        const openGet = this.line.openGet?.bind(this.line);
        if (openGet === undefined || this.connection.kind === 'legacy-sse' || !this.usable)
            return NOT_SENT;
        const headers = new Headers();
        if ((await this.untilClosed(this.authorizedToWrite(headers))) !== true)
            return NOT_SENT;
        headers.set('mcp-protocol-version', OFFERED_LEGACY_VERSION);
        const opening = openGet(headers, this.teardown.signal);
        const opened = await this.untilClosed(opening);
        if (opened === undefined || !this.usable) {
            // A stream that comes back once the session is closed or dead is let go.
            void opening.then(late => {
                if (late.kind === 'stream')
                    late.discard();
            }, () => undefined);
            return NOT_SENT;
        }
        return this.enterFrom(opened);
    }
    /** Judges the GET the line reported (T3): the fallback holds, or it is read as a refusal or not-sent. */
    async enterFrom(opened) {
        switch (opened.kind) {
            case 'stream': {
                const endpoint = this.heldEndpoint(opened);
                if (endpoint === undefined) {
                    opened.discard();
                    return NOT_SENT;
                }
                opened.enter(endpoint);
                this.connection = { kind: 'legacy-sse' };
                return undefined;
            }
            case 'status':
                return this.refusedGet(opened);
            case 'unsent':
            case 'unavailable':
                return NOT_SENT;
            default: {
                const exhaustive = opened;
                return exhaustive;
            }
        }
    }
    /**
     * A GET answered with an error status, by the contract's rule for it (T3): S05 runs the refusal
     * flow until the session closes; the rest is I07's `not-sent`.
     */
    async refusedGet(opened) {
        const target = this.target;
        const conclusion = fallbackGetConclusionOf(opened, this.options.versions);
        if (conclusion.kind === 'settle')
            return { wire: conclusion.wire };
        if (target === undefined)
            return NOT_SENT;
        const refusal = this.refusalOf(target, opened.headers, this.teardown.signal);
        const discovery = (await this.untilClosed(refusal.done)) ?? refusal.soFar();
        return { wire: authorizationRequiredAnswerOf(discovery) };
    }
    /** Whether the GET stream holds the legacy HTTP+SSE fallback (T3): 200, event-stream, same-origin endpoint. */
    heldEndpoint(opened) {
        const target = this.target;
        const type = (opened.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
        if (opened.status !== 200 || type !== 'text/event-stream' || target === undefined)
            return undefined;
        const first = opened.first;
        if (first?.event !== 'endpoint')
            return undefined;
        try {
            const url = new URL(first.data, target);
            return url.origin === new URL(target).origin ? url.href : undefined;
        }
        catch {
            return undefined;
        }
    }
    listActions(cursor) {
        return this.perform(listActionsRequest(cursor, this.view));
    }
    /**
     * `call` waits for the request to leave or to settle, whichever comes first (T5): the line took
     * it (`SentCall`, the answer still to come), or it settled before: `not-sent` is the call's own
     * failure, anything else its answer.
     */
    async call(request, signal, observe) {
        if (signal.aborted)
            return { failure: NOT_SENT_FAILURE };
        const composed = callRequestOf(request);
        const entry = this.begin(composed.method, composed.params, {
            kind: 'call',
            values: composed.values,
            signal,
            ...(observe === undefined ? {} : { observe }),
        });
        if (entry === undefined)
            return { failure: NOT_SENT_FAILURE };
        const first = await Promise.race([entry.departed.then(() => undefined), entry.answered]);
        if (first?.wire.kind === 'not-sent')
            return { failure: first.wire.failure };
        return { ok: { requestId: entry.id, answer: entry.answered.then(answerOf) } };
    }
    /**
     * T5, by the contract's `cancelsByNotification`: the notification goes out as background work
     * and this returns at once (it does not prove the peer stopped); on modern Streamable HTTP the
     * answer stream is ended and the answer is abandoned.
     */
    cancelRequest(requestId) {
        if (cancelsByNotification(this.view))
            this.work(() => this.notify('notifications/cancelled', { requestId }));
        else {
            const entry = this.pending.get(requestId);
            if (entry !== undefined)
                this.stop(entry);
        }
        return Promise.resolve();
    }
    getTask(taskId) {
        return this.perform(getTaskRequest(taskId));
    }
    getTaskResult(taskId) {
        return this.perform(getTaskResultRequest(taskId));
    }
    updateTask(taskId, inputResponses) {
        return this.perform(updateTaskRequest(taskId, inputResponses));
    }
    cancelTask(taskId) {
        return this.perform(cancelTaskRequest(taskId));
    }
    /**
     * Closes the transport (T5): marks it closed, settles every request in flight by its phase there
     * and then, ends everything the session waits on, and then waits for the line's `close()` only.
     * One close for every caller: a second call gets the same result, after the line closed.
     */
    close() {
        if (this.closing === undefined) {
            this.closed = true;
            for (const entry of this.pending.values())
                this.stop(entry);
            this.teardown.abort();
            this.closing = this.line.close();
        }
        return this.closing;
    }
}
//# sourceMappingURL=session.js.map