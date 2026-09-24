# Authentication

> For the complete documentation index, see [llms.txt](/llms.txt). Markdown versions of documentation pages are available by appending `.md` to the page URL.

## Authenticate your users

Many plugin MCP servers can operate in a read-only, anonymous mode, but
anything that exposes customer-specific data or write actions should
authenticate users.

Published plugins can run in ChatGPT and Codex. The MCP authorization contract
applies across both products; this guide calls out ChatGPT-specific client
details when a callback, metadata document, or linking interface differs by
surface.

You can integrate with your own authorization server when you need to connect
to an existing server-side application or share data between users.

## Custom auth with OAuth 2.1

For an authenticated MCP server, you are expected to implement an OAuth 2.1 flow that conforms to the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

### Components

- **Resource server:** Your MCP server, which exposes tools and verifies access tokens on each request.
- **Authorization server:** Your identity provider or custom implementation that issues tokens and publishes discovery metadata.
- **Client:** The OpenAI host, such as ChatGPT or Codex, acting on behalf of the
  user. Supported clients use Client ID Metadata Documents (CIMD), dynamic
  client registration (DCR), predefined OAuth clients, and PKCE.

### MCP authorization spec requirements

- Host protected resource metadata on your MCP server
- Publish OAuth metadata from your authorization server
- Echo the `resource` parameter throughout the OAuth flow
- Choose how the OpenAI host identifies or registers its OAuth client: CIMD,
  DCR, or a predefined OAuth client
- Publish the token endpoint authentication methods your authorization server accepts

Here is what the spec expects, in plain language.

#### Host protected resource metadata on your MCP server

- You need an HTTPS endpoint such as `GET https://your-mcp.example.com/.well-known/oauth-protected-resource` (or advertise the same URL in a `WWW-Authenticate` header on `401 Unauthorized` responses) so ChatGPT knows where to fetch your metadata.
- That endpoint returns a JSON document describing the resource server and its available authorization servers:

```json
{
  "resource": "https://your-mcp.example.com",
  "authorization_servers": ["https://auth.yourcompany.com"],
  "scopes_supported": ["files:read", "files:write"],
  "resource_documentation": "https://yourcompany.com/docs/mcp"
}
```

- Key fields you must populate:
  - `resource`: the canonical HTTPS identifier for your MCP server. ChatGPT sends this exact value as the `resource` query parameter during OAuth.
  - `authorization_servers`: one or more issuer base URLs that point to your identity provider. ChatGPT will try each to find OAuth metadata.
  - `scopes_supported`: optional list that helps ChatGPT explain the permissions it is going to ask the user for.
  - Optional extras from [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) such as `resource_documentation`, `resource_policy_uri`, or `resource_tos_uri` make it easier for clients and admins to understand your setup.

When you block a request because it is unauthenticated, return a challenge like:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://your-mcp.example.com/.well-known/oauth-protected-resource",
                         scope="files:read"
```

That single header lets ChatGPT discover the metadata URL even if it has not seen it before.

#### Publish OAuth metadata from your authorization server

- Your identity provider must expose one of the well-known discovery documents so ChatGPT can read its configuration:
  - OAuth 2.0 metadata at `https://auth.yourcompany.com/.well-known/oauth-authorization-server`
  - OpenID Connect metadata at `https://auth.yourcompany.com/.well-known/openid-configuration`
- Each document answers three big questions for the OpenAI host: where to send
  the user, how to exchange codes, and how to identify itself. A typical
  response looks like:

```json
{
  "issuer": "https://auth.yourcompany.com",
  "authorization_response_iss_parameter_supported": true,
  "authorization_endpoint": "https://auth.yourcompany.com/oauth2/v1/authorize",
  "token_endpoint": "https://auth.yourcompany.com/oauth2/v1/token",
  "client_id_metadata_document_supported": true,
  "token_endpoint_auth_methods_supported": ["none", "private_key_jwt"],
  "registration_endpoint": "https://auth.yourcompany.com/oauth2/v1/register",
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["files:read", "files:write"]
}
```

- Fields that must be correct:
  - `issuer`: the canonical authorization server identifier. Use this exact
    value in the protected resource metadata `authorization_servers` list.
  - `authorization_response_iss_parameter_supported`: set this to `true`
    only when your authorization server returns an `iss` parameter in every
    authorization response, including error responses.
  - `authorization_endpoint`, `token_endpoint`: the URLs ChatGPT needs to run the OAuth authorization-code + PKCE flow end to end.
  - `client_id_metadata_document_supported`: set to `true` when you want ChatGPT to use CIMD for client registration. ChatGPT prioritizes CIMD when it is available, but the plugin builder can choose DCR when both CIMD and DCR are available.
  - `token_endpoint_auth_methods_supported`: include the token endpoint authentication methods your authorization server accepts. This applies to CIMD, DCR, and predefined OAuth clients. For CIMD, ChatGPT supports `none` for public-client token exchange and `private_key_jwt` for signed client assertion token exchange. Other OAuth clients commonly use `none`, `client_secret_post`, or `client_secret_basic`.
  - `registration_endpoint`: include this when you support dynamic client registration (DCR), which lets ChatGPT create and reuse a dedicated `client_id` for the MCP server connection.
  - `code_challenge_methods_supported`: must include `S256`. MCP servers are
    unsupported when their authorization server metadata omits this field or
    does not advertise `S256`, as required by the
    [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#authorization-code-protection).
  - Optional fields follow [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) / [OpenID Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html); include whatever helps your administrators configure policies.

#### OIDC scopes

- If your provider advertises OIDC scopes (for example, `openid`, `email`, `profile`) in `scopes_supported` of its `.well-known/oauth-authorization-server` or `.well-known/openid-configuration` document, ChatGPT requests those scopes by default during the OAuth flow.
- Some identity providers may not enable advertised OIDC scopes by default. Check your provider's configuration settings and make sure every advertised scope is enabled for the OAuth client, whether it uses CIMD, was created manually, or was created through DCR.

#### Support workspace domain restrictions

ChatGPT Enterprise workspaces can verify ownership of email domains. When an
OAuth-linked plugin provides the user's verified email address, ChatGPT can use
the email domain to prevent that corporate identity from linking the plugin in
a personal workspace or another workspace outside the organization.

To support this protection, configure your authorization server to:

- Publish OpenID Connect discovery metadata.
- Advertise and enable the `openid` and `email` scopes.
- Advertise a UserInfo Endpoint that returns the user's `email` claim and
  `email_verified: true`.

You can also return these claims in an ID token during the OAuth flow, but the
UserInfo Endpoint is required for workspace domain restrictions.

The Enterprise workspace must also verify its domain. Your authorization server
provides the user identity that ChatGPT compares with verified domains
configured for the workspace; it does not verify workspace ownership of a
domain.

#### Preserve login context during reauthorization

When ChatGPT reauthorizes an existing link, including to request additional OAuth scopes, it may include the prior OIDC ID token in the authorization request as the standard `id_token_hint` parameter. To let users grant additional scopes without starting login from scratch, configure your authorization server to issue an ID token during the original OAuth flow and honor `id_token_hint` during authorization.

This optimization is optional. Reauthorization still works when an ID token is unavailable or your authorization server does not use the hint.

#### Protect callbacks with issuer identification

OpenAI hosts use [RFC 9207 issuer
identification](https://www.rfc-editor.org/rfc/rfc9207#section-2.4) to protect
OAuth callbacks against authorization server mix-up attacks. To let ChatGPT
and Codex use a stable redirect URI when creating an eligible OAuth client:

- Set `authorization_response_iss_parameter_supported: true` in your
  [authorization server
  metadata](https://www.rfc-editor.org/rfc/rfc9207#section-3).
- Use the same exact issuer identifier in the metadata `issuer` field and
  the protected resource metadata `authorization_servers` list.
- Return `iss` in every successful and error authorization response. Its value
  must exactly match the metadata `issuer`; clients use exact string
  comparison and do not normalize trailing slashes, paths, ports, or casing.

ChatGPT and Codex record the selected metadata `issuer` before redirecting
the user and check the returned `iss` before exchanging the authorization
code. If the server advertises issuer identification but omits `iss` or
returns a mismatch, ChatGPT and Codex reject the response. These requirements
follow the [MCP authorization response validation
rules](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#authorization-response-validation).

#### Redirect URL

Copy the exact production redirect URI shown in the MCP server's management page into
your authorization server's allowlist.

- If your authorization server does not meet the issuer identification
  requirements above, ChatGPT uses the callback-ID-specific redirect URI
  `https://chatgpt.com/connector/oauth/{callback_id}`.
- If your authorization server meets those requirements, ChatGPT uses the
  stable redirect URI
  `https://chatgpt.com/connector_platform_oauth_redirect`.

MCP servers published before ChatGPT introduced callback-ID-specific redirects also
continue to use the stable redirect URI.

#### Echo the `resource` parameter throughout the OAuth flow

- Expect ChatGPT to append `resource=https%3A%2F%2Fyour-mcp.example.com` to both the authorization and token requests. This ties the token back to the protected resource metadata shown above.
- Configure your authorization server to copy that value into the access token (commonly the `aud` claim) so your MCP server can verify the token was minted for it and nobody else.
- If a token arrives without the expected audience or scopes, reject it and rely on the `WWW-Authenticate` challenge to prompt ChatGPT to re-authorize with the correct parameters.

#### Support the authorization-code flow

- ChatGPT, acting as the MCP client, performs the authorization-code flow with PKCE using the `S256` code challenge so intercepted authorization codes cannot be replayed by an attacker.
- Your authorization server must publish `code_challenge_methods_supported` with `S256` so clients can confirm PKCE support from metadata.

### OAuth flow

Provided that you have implemented the MCP authorization spec delineated above, the OAuth flow will be as follows:

1. ChatGPT queries your MCP server for protected resource metadata.

![](https://developers.openai.com/images/apps-sdk/protected_resource_metadata.png)

2. ChatGPT identifies itself as the OAuth client. When the MCP server uses CIMD, ChatGPT skips dynamic client registration and sends a CIMD document URL as the `client_id`. For authorization servers that meet the issuer identification requirements above, ChatGPT uses the stable `https://chatgpt.com/oauth/client.json`; for other servers, it uses the callback-ID-specific `https://chatgpt.com/oauth/{callback_id}/client.json`. The MCP server's management page shows the exact client metadata document and redirect URI for the connection's callback mode. When the MCP server uses DCR, ChatGPT calls your authorization server's `registration_endpoint` once for the MCP server connection, receives a generated `client_id`, and reuses that client for the connection.

When using CIMD, there is no client registration step. The following screen shows the DCR path:

![](https://developers.openai.com/images/apps-sdk/client_registration.png)

3. When the user first invokes a tool, the ChatGPT client launches the OAuth authorization code + PKCE flow. The user authenticates and consents to the requested scopes.

![](https://developers.openai.com/images/apps-sdk/preparing_authorization.png)

4. ChatGPT exchanges the authorization code for an access token and attaches it to subsequent MCP requests (`Authorization: Bearer <token>`).

![](https://developers.openai.com/images/apps-sdk/auth_complete.png)

5. Your server verifies the token on each request (issuer, audience, expiration, scopes) before executing the tool.

### Client registration

Use [Client ID Metadata Documents (CIMD)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#client-id-metadata-documents) as the preferred client registration method when your authorization server supports it and the plugin builder chooses it. With CIMD, ChatGPT uses an HTTPS metadata document URL as its `client_id`. Your authorization server fetches that document, validates the published client metadata and redirect resource identifiers, and treats the URL as ChatGPT's stable client identity.

If you support CIMD, set `client_id_metadata_document_supported: true` in your authorization server metadata. This lets ChatGPT use one stable client identity for MCP servers that choose CIMD, which your authorization server can use for redirect URI allowlists, rate limits, and other policies.

ChatGPT is adopting the CIMD transition proposed in
[MCP SEP-3149](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3149).
Its production CIMD document publishes
`token_endpoint_auth_methods_supported` as an array of methods that ChatGPT
can use, with no preference order. During the transition, it also publishes
the legacy singular `token_endpoint_auth_method` as a preference:

```json
{
  "token_endpoint_auth_methods_supported": ["none", "private_key_jwt"],
  "token_endpoint_auth_method": "private_key_jwt"
}
```

The plural field has different perspectives in the two documents:
authorization server metadata lists the methods your token endpoint accepts,
while ChatGPT's CIMD document lists the methods ChatGPT can use. ChatGPT
selects a method from the intersection of those sets. When the singular legacy
preference is in the intersection, ChatGPT uses it for compatibility with
authorization servers that still treat the singular field as binding.
Otherwise, ChatGPT can use another method in the intersection.

Authorization servers that read the plural CIMD field should accept any method
in the intersection unless local security policy disallows that method for the
client. They must reject methods outside the intersection. The `client_id` URL
stays stable and does not use query parameters to select a method-specific
document.

The supported methods are:

- `none`: use this public-client flow when your token endpoint supports PKCE-based authorization-code exchange without client authentication. ChatGPT does not store a per-client secret.
- `private_key_jwt`: use this signed client assertion flow when your token endpoint requires client authentication. ChatGPT publishes a public JWKS URL in its CIMD metadata. The JWKS is served from `/oauth/jwks.json` on the metadata origin. ChatGPT signs token requests server-side with a managed private key and `kid`; your authorization server verifies the assertion against the public JWKS.

DCR is still supported. If you include `registration_endpoint`, ChatGPT can register dynamically when the plugin builder chooses DCR or CIMD is not available. ChatGPT runs DCR once per MCP server connection, then keeps and reuses the registered OAuth client for that connection. DCR can still create many registered clients across many separate connections, so CIMD is usually easier to administer at scale.

Keep the registered OAuth client and any client secret valid while the MCP server connection is in use. If your authorization server expires, deletes, or replaces either credential, users and reviewers may receive an `invalid_client` error when they connect. Access and refresh tokens can still expire or rotate normally.

### Client identification

A frequent question is how your MCP server can confirm that a request actually comes from ChatGPT. ChatGPT presents an OpenAI-managed client certificate when connecting to MCP servers, so you can verify the client at the transport layer with mTLS. You can also allowlist ChatGPT’s [published egress IP ranges](https://developers.openai.com/api/docs/guides/ip-addresses). ChatGPT does **not** support machine-to-machine OAuth grants such as client credentials, service accounts, or JWT bearer assertions, nor can it present custom API keys or customer-provided mTLS certificates.

CIMD further strengthens client identification by giving your authorization server a stable, HTTPS-hosted declaration of ChatGPT’s identity. When you use `private_key_jwt`, verify ChatGPT's token endpoint client assertion against the public JWKS published in the CIMD metadata.

### Mutual TLS (mTLS)

ChatGPT now presents an OpenAI-managed client certificate when establishing TLS connections to MCP servers. If your application validates client certificates, configure it to trust the OpenAI certificate chain below.

- [Download OpenAI Root CA](https://developers.openai.com/plugins/mtls/openai-root-ca.pem)
- [Download OpenAI Connectors mTLS intermediate CA](https://developers.openai.com/plugins/mtls/openai-connectors-mtls-ca.pem)

To validate the client certificate when establishing the TLS connection to your MCP server:

- Verify a leaf certificate is present and chains to the OpenAI Connectors mTLS intermediate CA.
- Verify the leaf certificate is valid for client authentication.
- Verify the leaf certificate’s SAN `dnsName` is `mtls.prod.connectors.openai.com`.
- Avoid pinning a leaf certificate fingerprint; OpenAI may rotate the leaf certificate while keeping it under the published CA chain.

Use mTLS to authenticate ChatGPT as the MCP client. Continue to use OAuth 2.1 to authenticate the end user and authorize tool access.

### Choosing an identity provider

Most OAuth 2.1 identity providers can satisfy the MCP authorization requirements once they expose a discovery document, support CIMD with `none` or `private_key_jwt`, support DCR when needed, and echo the `resource` parameter into issued tokens. Prefer providers that support CIMD for client registration.

We _strongly_ recommend that you use an existing established identity provider rather than implementing authentication from scratch yourself.

Here are instructions for some popular identity providers.

#### Auth0

Auth0 enables MCP clients to securely connect to MCP servers by providing metadata discovery, CIMD registration, API security, and token exchange for first- and third-party tool calls.

- [Guide to configuring Auth0 for MCP authorization](https://github.com/openai/openai-mcpkit/blob/main/python-authenticated-mcp-server-scaffold/README.md#2-configure-auth0-authentication)
- [Auth0 securing MCP servers overview](https://auth0.com/ai/docs/mcp/intro/overview)
- [Auth0 securing MCP servers quickstart guides](https://auth0.com/ai/docs/mcp/get-started/overview)

#### Hosted provider example

- [Provider guide to MCP authorization](https://stytch.com/docs/guides/connected-apps/mcp-server-overview)
- [MCP authorization overview](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)
- [Authentication guide for ChatGPT UI](https://stytch.com/blog/guide-to-authentication-for-the-openai-apps-sdk/)

### Implementing token verification

When the OAuth flow finishes, ChatGPT directly attaches the access token it received to subsequent MCP requests (`Authorization: Bearer …`). Once a request reaches your MCP server you must assume the token is untrusted and perform the full set of resource-server checks yourself—signature validation, issuer and audience matching, expiry, replay considerations, and scope enforcement. That responsibility sits with you, not with ChatGPT.

In practice you should:

- Fetch the signing keys published by your authorization server (usually via JWKS) and verify the token’s signature and `iss`.
- Deny tokens that have expired or have not yet become valid (`exp`/`nbf`).
- Confirm the token was minted for your server (`aud` or the `resource` claim) and contains the scopes you marked as required.
- Run any server-specific policy checks, then either attach the resolved identity to the request context or return a `401` with a `WWW-Authenticate` challenge.

If verification fails, respond with `401 Unauthorized` and a `WWW-Authenticate` header that points back to your protected-resource metadata. This tells the client to run the OAuth flow again.

#### SDK token verification primitives

Both Python and TypeScript MCP software development kits include helpers so you do not have to wire this from scratch.

- [Python](https://github.com/modelcontextprotocol/python-sdk?tab=readme-ov-file#authentication)
- [TypeScript](https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#proxy-authorization-requests-upstream)

## Support multiple accounts

Multi-account lets users connect more than one account to the same plugin—for example, personal and work accounts. OpenAI routes each tool call using the selected connection’s authenticated credentials. Users can connect multiple accounts without a profile tool. To help users distinguish connections and recognize the same profile after reconnection, provide an authenticated profile tool with a stable ID and useful display metadata.

### How multi-account works for users

Users can connect additional accounts from the plugin’s settings page. All connected accounts are available to the model, which selects the relevant account or accounts when invoking tools based on the user’s request. Each tool call uses the selected account’s credentials and permissions.

### Improve account identification

To help OpenAI recognize connected profiles and show useful labels:

- Provide an authenticated profile tool that returns an opaque ID uniquely and stably identifying the profile represented by the request’s credentials. This lets OpenAI recognize the same profile across reconnections and distinguish it from other profiles. A field named `id` is useful for this only if its value meets those guarantees.
- Designate the profile tool in MCP metadata so OpenAI can discover which tool to call for authenticated profile information.

When profile information is needed, OpenAI discovers the designated tool at runtime, calls it with the connection’s credentials, and validates the response before using the profile data. Without a profile tool, users can still connect accounts, but account labels, recognition, or duplicate detection may be less reliable. If you declare a profile tool, return a valid identity; an invalid response can prevent account connection.

### Define a stable profile identity

A profile identifies the identity represented by the request’s authenticated credentials. Your service defines which profiles can be connected independently; this contract does not prescribe your service’s organization or authorization model.

Return an opaque profile ID that is unique within your app. The same profile must retain its ID across token refresh and reconnection; distinct profiles must have distinct IDs. OpenAI compares these IDs without interpreting their contents.

Use an existing immutable, opaque provider ID when it identifies the full profile. Otherwise, assign an opaque ID once, persist its association with that profile, and retrieve the same ID on future requests. Keep any internal relationships in your service; do not encode names, email addresses, or organizational relationships into the returned ID.

Your `id` must:

- Be a non-empty, non-whitespace string. Serialize numeric provider IDs as strings.
- Remain the same for the same profile across token refresh, reconnect, and scope upgrades.
- Differ for distinct profiles that can connect through the app.
- Remain unchanged when the profile’s email, name, or display label changes.
- Never be reassigned to a different profile after deletion.

Do not generate a new ID per login, token, session, or tool call. Keep email and editable names in display metadata: an email address that can change or be reassigned cannot serve as the stable profile ID. For Google OIDC, use the stable `sub` rather than the email claim; Google documents that email may change while `sub` remains unchanged and is never reused. See [Google identity documentation](https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload).

Preserve existing profile IDs when updating your integration. A display-name change, new token, or new connection must not create a new profile identity.

### Implement and declare your profile tool

Expose an authenticated, read-only tool that accepts an empty argument object and returns the current profile. The tool may be named `get_profile`, `whoami`, or another name; its metadata identifies it as the profile tool for runtime discovery. The response must satisfy the identity requirements below so OpenAI can use it correctly.

- Resolve identity from the request’s validated credentials.
- Make the operation read-only and available with the normal connection’s permissions.
- Return exactly one profile: the profile represented by the current request’s credentials.
- Do not require the caller to supply a user ID, email, or account selector.
- On authentication failure, return the appropriate auth error instead of a placeholder ID or another account’s profile.

The profile response must conform to this JSON Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1,
      "pattern": "\\S",
      "description": "Opaque profile identifier, unique within this app and unchanged across token refresh, reconnection, and display-metadata changes. Never reassigned to another profile."
    },
    "name": {
      "type": "string",
      "description": "Display name for the authenticated profile."
    },
    "email": {
      "type": "string",
      "description": "Email address for display; not used as the profile identity."
    },
    "nickname": {
      "type": "string",
      "description": "A useful label that helps users distinguish connected profiles."
    }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

The response must contain a non-empty, non-whitespace string `id`. Display fields are optional. The tool’s metadata tells OpenAI where to retrieve profile information; the response identifies the profile represented by the current credentials.

Schema validation checks whether a response has the structure and field types needed for profile handling. Your service must also guarantee ID uniqueness, stability, and correct credential scoping; neither metadata nor a passing schema check proves those behavioral properties.

Include `name`, `email`, and/or `nickname` when available so users can distinguish profiles. Omit unavailable optional values; do not invent them or add unrelated personal data. Put useful human-readable context in `nickname` rather than in the ID.

Mark the tool with `_meta["openai/profile"]: true` and publish the profile response schema as its `outputSchema`. The marker tells OpenAI which tool supplies profile information; it does not enable the feature or grant eligibility. An absent or false marker means this tool is not designated as a profile source through this mechanism. Strings, numbers, and null are invalid marker values.

```json
{
  "name": "get_profile",
  "description": "Return the profile represented by this request's authenticated credentials. The opaque id is unique within this app and remains unchanged across token refresh, reconnection, and display-metadata changes.",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "outputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "minLength": 1,
        "pattern": "\\S",
        "description": "Opaque profile identifier, unique within this app and unchanged across token refresh, reconnection, and display-metadata changes. Never reassigned to another profile."
      },
      "name": {
        "type": "string",
        "description": "Display name for the authenticated profile."
      },
      "email": {
        "type": "string",
        "description": "Email address for display; not used as the profile identity."
      },
      "nickname": {
        "type": "string",
        "description": "A useful label that helps users distinguish connected profiles."
      }
    },
    "required": ["id"],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "openWorldHint": false
  },
  "securitySchemes": [
    {
      "type": "oauth2",
      "scopes": []
    }
  ],
  "_meta": {
    "openai/profile": true
  }
}
```

Use your integration’s actual OAuth scopes if profile access requires them. The declaration does not implement authentication; the server must validate credentials and enforce permissions. See [Implementing token verification](#implementing-token-verification) and the [tool reference](https://developers.openai.com/plugins/reference).

Return the profile in `structuredContent` so it can be validated against `outputSchema`. For compatibility, also include the same profile serialized as JSON in a text content item:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"id\":\"prf_8d7e4b19\",\"name\":\"Alex Chen\",\"email\":\"alex@example.com\",\"nickname\":\"Alex — Moonwaffle work\"}"
    }
  ],
  "structuredContent": {
    "id": "prf_8d7e4b19",
    "name": "Alex Chen",
    "email": "alex@example.com",
    "nickname": "Alex — Moonwaffle work"
  },
  "isError": false
}
```

Use a single JSON object with profile fields at the top level.

**Already have a profile tool?** Keep its name, add the profile metadata declaration, and return the standard profile response. If the existing response has a different shape, adapt it on your server or expose a small wrapper tool that conforms to the schema. The standard integration path uses the same declaration and response shape for every app.

### Concrete example: Persistent Moonwaffle profiles

Suppose Moonwaffle, a fictional service, lets Alex connect two profiles independently. Moonwaffle stores a different opaque ID for each profile. Request credentials resolve to one of those stored profiles, and the profile tool returns its existing ID.

**Example stored profiles.** The labels can change; the identifiers remain the same:

```text
Alex — Moonwaffle personal: prf_42a9c6e0
Alex — Moonwaffle work:     prf_8d7e4b19
```

These example IDs do not encode profile labels or internal relationships. They are persisted once per profile and reused across reconnection, token refresh, and changes to email or display name.

**Build the response from the authenticated profile.** This JavaScript example shows handler logic you can connect to your MCP SDK. `loadAuthenticatedProfile` is your application’s integration code: it validates the request credentials, enforces their permissions, and retrieves the corresponding profile’s persisted ID and display metadata. `requestContext` comes from your server’s request handling; it is not a model-supplied tool argument.

```javascript
async function getProfile(requestContext) {
  // Your auth/provider integration validates credentials and loads
  // the existing profile. Auth failures use normal MCP auth handling.
  const account = await loadAuthenticatedProfile(requestContext);
  const id = account.profileId;

  if (typeof id !== "string" || id.trim().length === 0) {
    return {
      isError: true,
      content: [{ type: "text", text: "Profile identity unavailable." }],
    };
  }

  // Return the persisted ID unchanged; do not generate an ID per call.
  const profile = {
    id,
    ...(typeof account.name === "string" ? { name: account.name } : {}),
    ...(typeof account.email === "string" ? { email: account.email } : {}),
    ...(typeof account.nickname === "string"
      ? { nickname: account.nickname }
      : {}),
  };

  return {
    isError: false,
    structuredContent: profile,
    content: [{ type: "text", text: JSON.stringify(profile) }],
  };
}
```

Register this handler with the metadata declaration and input/output schemas above. `loadAuthenticatedProfile` must resolve the same stored profile for equivalent credentials and after reconnection. It must not create a fresh profile ID for each OAuth grant or session. All other tools must use the request’s credentials to enforce the same profile’s permissions.

**Verify identity behavior:**

| Test                                                                | Expected result                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Moonwaffle work profile, called repeatedly                          | `prf_8d7e4b19` every time                                            |
| The same profile after token refresh, reconnect, or a scope upgrade | `prf_8d7e4b19`                                                       |
| The same profile after an email or display-label change             | `prf_8d7e4b19`; labels can change                                    |
| Moonwaffle personal profile                                         | `prf_42a9c6e0`, distinct from the work profile                       |
| The persisted profile ID is missing or blank                        | An error result; no invented identity or fallback to another profile |

The identity guarantee must hold across all profiles and future changes to your integration. Preserve it independently of display metadata, token contents, and connection lifecycle events.

## Testing and rollout

- **Local testing:** Start with a development tenant that issues short-lived tokens so you can iterate quickly.
- **Dogfood:** Once authentication works, gate access to trusted testers before rolling out broadly. You can require linking for specific tools or the entire MCP server.
- **Rotation:** Plan for token revocation, refresh, and scope changes. Your server should treat missing or stale tokens as unauthenticated and return a helpful error message.
- **OAuth debugging:** Use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) Auth settings to walk through each OAuth step and pinpoint where the flow breaks before you ship.

With authentication in place, you can expose user-specific data and write
actions to ChatGPT and Codex users.

## Triggering authentication UI

ChatGPT only surfaces its OAuth linking UI when your MCP server signals that OAuth is available or necessary.

Triggering the tool-level OAuth flow requires both metadata (`securitySchemes` and the resource metadata document) **and** runtime errors that carry `_meta["mcp/www_authenticate"]`. Without both halves ChatGPT will not show the linking UI for that tool.

1. **Publish resource metadata.** The MCP server must expose its OAuth configuration at a well-known URL such as `https://your-mcp.example.com/.well-known/oauth-protected-resource`.

2. **Describe each tool’s auth policy with `securitySchemes`.** Declaring `securitySchemes` per tool tells ChatGPT which tools require OAuth versus which can run anonymously. Stick to per-tool declarations even if the entire server uses the same policy; server-level defaults make it difficult to evolve individual tools later.

   Two scheme types are available today, and you can list more than one to express optional auth:
   - `noauth`: The tool is callable anonymously; ChatGPT can run it immediately.
   - `oauth2`: The tool needs an OAuth 2.0 access token; include the scopes you will request so the consent screen is accurate.

   If you omit the array entirely, the tool inherits whatever default the server advertises. Declaring both `noauth` and `oauth2` tells ChatGPT it can start with anonymous calls but that linking unlocks privileged behavior. Regardless of what you signal to the client, your server must still verify the token, scopes, and audience on every invocation.

   Example (public + optional auth)—TypeScript SDK

```ts



   declare const server: McpServer;

   server.registerTool(
     "search",
     {
       title: "Public Search",
       description: "Search public documents.",
       inputSchema: {
         q: z.string(),
       },
       outputSchema: {},
       securitySchemes: [
         { type: "noauth" },
         { type: "oauth2", scopes: ["search.read"] },
       ],
     },
     async ({ q }) => {
       return {
         content: [{ type: "text", text: `Results for ${q}` }],
         structuredContent: {},
       };
     }
   );
```

   Example (auth required)—TypeScript SDK

```ts



   declare const server: McpServer;

   server.registerTool(
     "create_doc",
     {
       title: "Create Document",
       description: "Make a new doc in your account.",
       inputSchema: {
         title: z.string(),
       },
       outputSchema: {},
       securitySchemes: [{ type: "oauth2", scopes: ["docs.write"] }],
     },
     async ({ title }) => {
       return {
         content: [{ type: "text", text: `Created doc: ${title}` }],
         structuredContent: {},
       };
     }
   );
```

3. **Check tokens inside the tool handler and emit `_meta["mcp/www_authenticate"]`** when you want ChatGPT to trigger the authentication UI. Inspect the token and verify issuer, audience, expiry, and scopes. If no valid token is present, return an error result that includes `_meta["mcp/www_authenticate"]` and make sure the value contains both an `error` and `error_description` parameter. This `WWW-Authenticate` payload is what actually triggers the tool-level OAuth UI once steps 1 and 2 are in place. When a challenge prompts reauthorization, your provider can [preserve the user's existing login context](#preserve-login-context-during-reauthorization) during that flow.

   Example

```json
   {
     "jsonrpc": "2.0",
     "id": 4,
     "result": {
       "content": [
         {
           "type": "text",
           "text": "Authentication required: no access token provided."
         }
       ],
       "_meta": {
         "mcp/www_authenticate": [
           "'Bearer resource_metadata=\"https://your-mcp.example.com/.well-known/oauth-protected-resource\", error=\"insufficient_scope\", error_description=\"You need to login to continue\"'"
         ]
       },
       "isError": true
     }
   }
```