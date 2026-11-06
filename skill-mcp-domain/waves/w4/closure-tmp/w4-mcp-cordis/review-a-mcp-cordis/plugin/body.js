// The bounded reading of an HTTP body: the whole text up to the byte bound, and a cancelled body
// above it. The HTTP line reads error-status bodies with it, the authorization discovery reads
// the metadata documents with it (contract R4).
import { BYTE_LIMIT } from './limits.js';
/** The whole body as text, up to the byte bound; above it the body is cancelled and this rejects. */
export async function bodyOf(response) {
    const body = response.body;
    if (body === null)
        return '';
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    for await (const chunk of body) {
        bytes += chunk.byteLength;
        if (bytes > BYTE_LIMIT) {
            await body.cancel().catch(() => undefined);
            throw new RangeError('the body is above the byte bound');
        }
        text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
}
//# sourceMappingURL=body.js.map