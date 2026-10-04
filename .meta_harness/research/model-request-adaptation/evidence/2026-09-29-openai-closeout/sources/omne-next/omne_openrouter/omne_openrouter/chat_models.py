"""OpenRouter chat models.

OMNE-maintained fork of `langchain-openrouter`; see `UPSTREAM.md` for the fork
baseline and the patch inventory.
"""

from __future__ import annotations

# Every annotation below stays a *runtime* import, and the `TC00x` suppressions say so
# deliberately. `langchain_core.runnables.fallbacks` resolves a wrapped runnable's method
# annotations with `typing.get_type_hints` on plain attribute access, so moving any name
# that appears in a method signature into a `TYPE_CHECKING` block turns
# `model.with_fallbacks([...]).bind_tools` into a `NameError` — measured, not theorised.
# `Mapping` additionally annotates the `default_headers` pydantic field, which pydantic
# resolves at class construction, and is used at runtime by the produced-image seam's
# `isinstance` checks — which is the only reason the `collections.abc` line below needs no
# `TC003` suppression today. That is a property of the current contents, not a guarantee;
# `tests/unit/test_fork_invariants.py` is what actually holds these imports in place.
# Upstream ignores TC002/TC003 wholesale for the same underlying reason; this fork records
# the reason instead of inheriting the silence.
import json
import logging
import math
import re
import threading
import warnings
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Mapping, Sequence
from contextvars import ContextVar
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from importlib.metadata import version as _package_version
from operator import itemgetter
from typing import Any, Final, Literal, Self, cast

import httpx
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun  # noqa: TC002
from langchain_core.language_models import (
    LangSmithParams,
    LanguageModelInput,
    ModelProfile,
    ModelProfileRegistry,
)
from langchain_core.language_models._compat_bridge import achunks_to_events, amessage_to_events
from langchain_core.language_models.chat_model_stream import AsyncChatModelStream  # noqa: TC002
from langchain_core.language_models.chat_models import (
    BaseChatModel,
    agenerate_from_stream,
    generate_from_stream,
)
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    BaseMessageChunk,
    ChatMessage,
    ChatMessageChunk,
    HumanMessage,
    HumanMessageChunk,
    InvalidToolCall,
    SystemMessage,
    SystemMessageChunk,
    ToolCall,
    ToolMessage,
    ToolMessageChunk,
    is_data_content_block,
)
from langchain_core.messages.ai import (
    InputTokenDetails,
    OutputTokenDetails,
    UsageMetadata,
)
from langchain_core.messages.block_translators.openai import (
    convert_to_openai_data_block,
)
from langchain_core.messages.tool import tool_call_chunk
from langchain_core.output_parsers import JsonOutputParser, PydanticOutputParser
from langchain_core.output_parsers.base import OutputParserLike  # noqa: TC002
from langchain_core.output_parsers.openai_tools import (
    JsonOutputKeyToolsParser,
    PydanticToolsParser,
    make_invalid_tool_call,
    parse_tool_call,
)
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.runnables import Runnable, RunnableMap, RunnablePassthrough
from langchain_core.runnables.config import RunnableConfig  # noqa: TC002
from langchain_core.runnables.schema import StreamEvent  # noqa: TC002
from langchain_core.tools import BaseTool  # noqa: TC002
from langchain_core.utils import from_env, get_pydantic_field_names, secret_from_env
from langchain_core.utils.function_calling import (
    convert_to_json_schema,
    convert_to_openai_tool,
)
from langchain_core.utils.pydantic import is_basemodel_subclass
from langchain_core.utils.utils import LC_ID_PREFIX
from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, SecretStr, field_validator, model_validator

from omne_openrouter.data._profiles import _PROFILES  # pyright: ignore[reportPrivateUsage]
from omne_openrouter.transport.sse import SseLimitError, SseProtocolError, aiter_sse_events, iter_sse_events
from omne_openrouter.wire.blocks import (
    NativeMediaAssembler,
    NativeMediaLimitError,
    NativeMediaProtocolError,
    inline_image_block,
    strict_base64_size,
)
from omne_openrouter.wire.envelope import WireEnvelope

_MODEL_PROFILES = cast("ModelProfileRegistry", _PROFILES)

# LangChain-internal kwargs that must not be forwarded to the SDK.
_INTERNAL_KWARGS = frozenset({"ls_structured_output_format"})


@dataclass(frozen=True)
class _EventStreamControl:
    """One public event-call's original streaming preference.

    LangChain's v1/v2 event helpers internally force ``stream=True`` while
    advancing the model. The adapter must still apply the user's original
    hard-veto at that internal seam, without forwarding a duplicate local
    control through LangChain or mutating the model instance.
    """

    model: object
    stream: object


_EVENT_STREAM_CONTROL: ContextVar[_EventStreamControl | None] = ContextVar(
    "omne_openrouter_event_stream_control", default=None
)
_EVENT_STREAM_UNSET = object()

# Public aliases which are not permitted to coexist with their canonical field. Pydantic's
# normal alias population otherwise chooses one after coercion, losing the caller's conflict.
_CANONICAL_ALIASES = {
    "model": "model_name",
    "api_key": "openrouter_api_key",
    "base_url": "openrouter_api_base",
    "timeout": "request_timeout",
    "stop_sequences": "stop",
}

# ``provider`` is the wire spelling of the explicit public ``openrouter_provider`` field.
# It is not an unknown provider parameter that may enter through ``model_kwargs``.
_WIRE_ALIASES = {"provider": "openrouter_provider"}

# Call parameters describe a provider JSON body, so their canonical names are the wire
# spellings. Constructor aliases above instead map into Pydantic field names.
_CALL_CANONICAL_ALIASES = {
    "model_name": "model",
    "stop_sequences": "stop",
    "openrouter_provider": "provider",
}

_CALL_LOCAL_CONTROLS = frozenset(
    {
        "api_key",
        "openrouter_api_key",
        "base_url",
        "openrouter_api_base",
        "client",
        "http_client",
        "http_async_client",
        "default_headers",
        "max_retries",
        "max_wire_event_bytes",
        "max_response_bytes",
        "max_media_bytes",
        "model_kwargs",
    }
)

# ---------------------------------------------------------------------------
# Provider-reported response failures
# ---------------------------------------------------------------------------

#: What the message renders in place of a code the provider did not send. Upstream's
#: spelling, kept verbatim: two OMNE consumers match this message with a numeric pattern,
#: and a word is what tells them "no code" apart from one.
_UNKNOWN_CODE_RENDERING: Final[str] = "unknown"
_SUPPORTED_FINISH_REASONS: Final[frozenset[str]] = frozenset(
    {"stop", "length", "tool_calls", "function_call", "content_filter"}
)
_BEARER_CREDENTIAL_PATTERN: Final[re.Pattern[str]] = re.compile(r"(?i)(authorization\s*[: ]\s*bearer\s+)\S+")
_DATA_URI_PATTERN: Final[re.Pattern[str]] = re.compile(r"(?i)data:[^\s,;]+(?:;[^\s,;]+)*,[^\s]+")
_WIRE_EXTRAS_KEY: Final[str] = "openrouter_wire_extras"
# This marker exists only while a generated LangChain message travels back through
# the adapter.  It distinguishes the standard live view derived from canonical
# provider details from independently supplied ``content`` reasoning without a
# fragile text comparison, and is removed before a provider request is serialized.
_CANONICAL_REASONING_LIVE_VIEW_KEY: Final[str] = "_openrouter_canonical_reasoning_live_view"
_UNKNOWN_WIRE_LOGGER = logging.getLogger(__name__)

_TOP_LEVEL_WIRE_FIELDS: Final[frozenset[str]] = frozenset(
    {"id", "object", "created", "model", "provider", "system_fingerprint", "choices", "usage", "error"}
)
_CHOICE_WIRE_FIELDS: Final[frozenset[str]] = frozenset(
    {"index", "message", "delta", "finish_reason", "native_finish_reason", "logprobs"}
)
_MESSAGE_WIRE_FIELDS: Final[frozenset[str]] = frozenset(
    {
        "id",
        "role",
        "content",
        "reasoning",
        "reasoning_details",
        "tool_calls",
        "annotations",
        "refusal",
        "images",
        "audio",
        "function_call",
    }
)
_TOOL_CALL_WIRE_FIELDS: Final[frozenset[str]] = frozenset({"index", "id", "type", "function"})
_TOOL_FUNCTION_WIRE_FIELDS: Final[frozenset[str]] = frozenset({"name", "arguments"})
_AUDIO_WIRE_FIELDS: Final[frozenset[str]] = frozenset({"id", "index", "data", "transcript", "expires_at"})
_IMAGE_WIRE_FIELDS: Final[frozenset[str]] = frozenset({"image_url"})
_IMAGE_URL_WIRE_FIELDS: Final[frozenset[str]] = frozenset({"url"})
_SUPPORTED_CONTENT_BLOCK_TYPES: Final[frozenset[str]] = frozenset(
    {"text", "image", "audio", "file", "video", "reasoning"}
)


class OpenRouterClientLifecycleError(RuntimeError):
    """A model close operation conflicts with its owned client lifecycle."""


class OpenRouterResponseError(ValueError):
    """OpenRouter answered with an error object instead of a completion.

    Raised at the three places a provider-reported failure can surface: the `error` object on
    a non-streaming response body, and the `error` chunk that can arrive mid-stream on either
    transport.

    Subclasses `ValueError` on purpose. Upstream raised a bare one, so every existing handler
    — `omne_core_v1`'s in-stream retry loop among them — catches `ValueError`; widening the
    type would have silently stopped those handlers from firing, turning a retried hiccup into
    a failed run. What the subclass adds is that the code no longer has to be parsed back out
    of English: `str(exc)` still ends in the `(code: NNN)` suffix, and `code` / `status` /
    `provider_message` say the same things as data.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status: int | None = None,
        provider_message: str = "",
        failure_origin: str = "provider_body",
        output_started: bool = False,
        request_id: str | None = None,
        provider_metadata: Mapping[str, Any] | None = None,
    ) -> None:
        """Initialize the error, keeping the provider's own answer readable as data.

        Args:
            message: The full message, this class's framing and the `(code: NNN)` suffix
                included.
            code: The provider's error code exactly as it reported it, or `None` when it
                reported none. Kept as text because OpenRouter's codes are not all numeric.
            status: Observed HTTP response status, if there was one. Never inferred from code.
            provider_message: The provider's own sentence, without this class's framing around
                it.
            failure_origin: Boundary at which the failure was observed.
            output_started: Whether output was already delivered to a consumer.
            request_id: Provider correlation identifier, when observed.
            provider_metadata: Safe provider metadata retained for callers.
        """
        super().__init__(message)
        self.code = code
        self.status = status
        self.provider_message = provider_message
        self.failure_origin = failure_origin
        self.output_started = output_started
        self.request_id = request_id
        self.provider_metadata = dict(provider_metadata or {})


def _response_error(
    error: Mapping[str, Any],
    *,
    during_streaming: bool,
    status: int | None = None,
    failure_origin: str = "provider_body",
    output_started: bool = False,
    request_id: str | None = None,
    sensitive_values: Sequence[str] = (),
    provider_metadata: Mapping[str, Any] | None = None,
) -> OpenRouterResponseError:
    """Build the error for one provider-reported failure payload.

    Args:
        error: The `error` object, as it arrived on the response body or the stream chunk.
        during_streaming: Whether the failure interrupted a stream, which the message says so
            a reader can tell a refused request from an abandoned one.

    Returns:
        The error to raise, message and structured fields derived from the same payload.
    """
    raw_message = error.get("message")
    provider_message = (
        _redact_provider_text(raw_message, sensitive_values)
        if isinstance(raw_message, str)
        else "provider returned an error without a public message"
    )
    raw_code = error.get("code")
    code = None if raw_code is None else str(raw_code)
    rendered_code = _UNKNOWN_CODE_RENDERING if code is None else _redact_provider_text(code, sensitive_values)
    transport = " during streaming" if during_streaming else ""
    message = f"OpenRouter API returned an error{transport}: {provider_message} (code: {rendered_code})"
    return OpenRouterResponseError(
        message,
        code=code,
        status=status,
        provider_message=provider_message,
        failure_origin=failure_origin,
        output_started=output_started,
        request_id=request_id,
        provider_metadata=provider_metadata,
    )


def _redact_provider_text(message: str, sensitive_values: Sequence[str] = ()) -> str:
    """Remove configured credentials and inline-media values from provider diagnostics."""
    redacted = _BEARER_CREDENTIAL_PATTERN.sub(r"\1[REDACTED]", message)
    redacted = _DATA_URI_PATTERN.sub("data:[REDACTED]", redacted)
    for sensitive_value in sensitive_values:
        if sensitive_value:
            redacted = redacted.replace(sensitive_value, "[REDACTED]")
    return redacted


def _require_finite_json(value: object, field_name: str) -> None:
    """Require an actual finite JSON value before it can reach the provider boundary."""
    try:
        json.dumps(value, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a finite JSON value") from error


def _request_id(response: httpx.Response) -> str | None:
    """Return an observed correlation identifier without retaining full response headers."""
    return response.headers.get("x-request-id") or response.headers.get("x-openrouter-request-id")


def _unknown_fields(
    value: Mapping[str, Any], known_fields: frozenset[str], *, path: str, event_seq: int, choice_index: int | None
) -> list[dict[str, Any]]:
    """Preserve unmapped provider fields without treating them as supported semantics."""
    return [
        {
            "event_seq": event_seq,
            "choice_index": choice_index,
            "field_path": f"{path}.{key}",
            "value": item,
        }
        for key, item in value.items()
        if key not in known_fields
    ]


def _wire_extras(  # noqa: C901
    envelope: Mapping[str, Any], *, event_seq: int, choice: Mapping[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Return ordered public preservation records for an envelope and one choice."""
    records = _unknown_fields(
        envelope,
        _TOP_LEVEL_WIRE_FIELDS,
        path="$",
        event_seq=event_seq,
        choice_index=None,
    )
    selected_choices: Sequence[Mapping[str, Any]]
    if choice is not None:
        selected_choices = (choice,)
    else:
        raw_choices = envelope.get("choices")
        selected_choices = (
            tuple(item for item in raw_choices if isinstance(item, Mapping)) if isinstance(raw_choices, list) else ()
        )
    for selected_choice in selected_choices:
        raw_index = selected_choice.get("index")
        choice_index = raw_index if type(raw_index) is int else None
        records.extend(
            _unknown_fields(
                selected_choice,
                _CHOICE_WIRE_FIELDS,
                path="$.choices[]",
                event_seq=event_seq,
                choice_index=choice_index,
            )
        )
        for field_name in ("message", "delta"):
            field_value = selected_choice.get(field_name)
            if isinstance(field_value, Mapping):
                records.extend(
                    _unknown_fields(
                        field_value,
                        _MESSAGE_WIRE_FIELDS,
                        path=f"$.choices[].{field_name}",
                        event_seq=event_seq,
                        choice_index=choice_index,
                    )
                )
                tool_calls = field_value.get("tool_calls")
                if isinstance(tool_calls, list):
                    for tool_call in tool_calls:
                        if not isinstance(tool_call, Mapping):
                            continue
                        tool_path = f"$.choices[].{field_name}.tool_calls[]"
                        records.extend(
                            _unknown_fields(
                                tool_call,
                                _TOOL_CALL_WIRE_FIELDS,
                                path=tool_path,
                                event_seq=event_seq,
                                choice_index=choice_index,
                            )
                        )
                        function = tool_call.get("function")
                        if isinstance(function, Mapping):
                            records.extend(
                                _unknown_fields(
                                    function,
                                    _TOOL_FUNCTION_WIRE_FIELDS,
                                    path=f"{tool_path}.function",
                                    event_seq=event_seq,
                                    choice_index=choice_index,
                                )
                            )
                content = field_value.get("content")
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, Mapping) and block.get("type") not in _SUPPORTED_CONTENT_BLOCK_TYPES:
                            records.append(
                                {
                                    "event_seq": event_seq,
                                    "choice_index": choice_index,
                                    "field_path": f"$.choices[].{field_name}.content[]",
                                    "value": dict(block),
                                }
                            )
                audio = field_value.get("audio")
                if isinstance(audio, Mapping):
                    records.extend(
                        _unknown_fields(
                            audio,
                            _AUDIO_WIRE_FIELDS,
                            path=f"$.choices[].{field_name}.audio",
                            event_seq=event_seq,
                            choice_index=choice_index,
                        )
                    )
                images = field_value.get("images")
                if isinstance(images, list):
                    for image in images:
                        if not isinstance(image, Mapping):
                            continue
                        image_path = f"$.choices[].{field_name}.images[]"
                        records.extend(
                            _unknown_fields(
                                image,
                                _IMAGE_WIRE_FIELDS,
                                path=image_path,
                                event_seq=event_seq,
                                choice_index=choice_index,
                            )
                        )
                        image_url = image.get("image_url")
                        if isinstance(image_url, Mapping):
                            records.extend(
                                _unknown_fields(
                                    image_url,
                                    _IMAGE_URL_WIRE_FIELDS,
                                    path=f"{image_path}.image_url",
                                    event_seq=event_seq,
                                    choice_index=choice_index,
                                )
                            )
    return records


def _warn_unknown_paths(records: Sequence[Mapping[str, Any]]) -> None:
    """Log bounded path-only diagnostics for preserved provider extensions."""
    paths = list(dict.fromkeys(str(record["field_path"]) for record in records))
    for path in paths[:64]:
        _UNKNOWN_WIRE_LOGGER.warning("Preserving unmapped OpenRouter wire field at path %s", path)
    if len(paths) > 64:
        _UNKNOWN_WIRE_LOGGER.warning("Suppressed %s additional unmapped OpenRouter wire field paths", len(paths) - 64)


def _with_wire_extras[MessageT: BaseMessage](message: MessageT, records: Sequence[Mapping[str, Any]]) -> MessageT:
    """Attach serializable provider extension records without replacing mapped facts."""
    if not records:
        return message
    return message.model_copy(
        update={"additional_kwargs": {**message.additional_kwargs, _WIRE_EXTRAS_KEY: list(records)}}
    )


@dataclass
class _StreamResponseFacts:
    """Observed response facts shared by every stream projection path."""

    status: int
    request_id: str | None
    media: NativeMediaAssembler = dataclass_field(
        default_factory=lambda: NativeMediaAssembler(64 * 1024 * 1024, 128 * 1024 * 1024)
    )
    response_id: str | None = None
    choice_index: int | None = None
    finish_reason: str | None = None
    generated_output_started: bool = False
    terminal_generation_info: dict[str, Any] = dataclass_field(default_factory=dict)
    event_seq: int = 0
    wire_extras: list[dict[str, Any]] = dataclass_field(default_factory=list)
    usage_snapshots: list[dict[str, Any]] = dataclass_field(default_factory=list)
    usage_metadata: UsageMetadata | None = None
    usage_response_metadata: dict[str, Any] = dataclass_field(default_factory=dict)
    reasoning_details: list[dict[str, Any]] = dataclass_field(default_factory=list)
    observed_route: dict[str, Any] = dataclass_field(default_factory=dict)
    media_handled_current: bool = False
    required_output_media: str | None = None
    observed_required_media: bool = False
    observed_unknown_required_media: bool = False

    def protocol_error(self, message: str) -> OpenRouterResponseError:
        """Project a protocol failure with every response fact observed so far."""
        return OpenRouterResponseError(
            f"{message} (code: unknown)",
            status=self.status,
            failure_origin="protocol",
            output_started=self.generated_output_started,
            request_id=self.request_id,
            provider_metadata=self.error_metadata(),
        )

    def limit_error(self, message: str) -> OpenRouterResponseError:
        """Project a local media or framing limit without dropping response facts."""
        return OpenRouterResponseError(
            f"{message} (code: unknown)",
            status=self.status,
            failure_origin="limit",
            output_started=self.generated_output_started,
            request_id=self.request_id,
            provider_metadata=self.error_metadata(),
        )

    def validate_completion(self, done_seen: bool) -> None:
        """Require the applicable text or P0-audio terminal facts before success."""
        try:
            self.media.require_complete_at_end()
        except NativeMediaProtocolError as error:
            raise self.protocol_error(str(error)) from error
        if self.required_output_media == "audio" and self.media.audio_published:
            self.observed_required_media = True
        if self.required_output_media and self.observed_unknown_required_media and not self.observed_required_media:
            raise self.protocol_error("OpenRouter returned an unsupported required media block")
        if (
            not done_seen
            or (self.finish_reason is None and not self.media.audio_published)
            or not self.generated_output_started
        ):
            raise self.protocol_error(
                "OpenRouter SSE stream ended without generated output, a supported finish, and [DONE]"
            )

    def observe_envelope(self, envelope: Mapping[str, Any], event_seq: int) -> None:
        """Reduce one wire event before any LangChain chunk projection can merge it."""
        self.wire_extras.extend(_wire_extras(envelope, event_seq=event_seq))
        self._observe_route(envelope)
        usage = envelope.get("usage")
        if isinstance(usage, Mapping):
            snapshot = dict(usage)
            self.usage_snapshots.append(snapshot)
            usage_metadata = _create_usage_metadata(snapshot)
            if usage_metadata is not None:
                self.usage_metadata = usage_metadata
            for field_name in ("cost", "cost_details"):
                if field_name in snapshot:
                    self.usage_response_metadata[field_name] = snapshot[field_name]
        choices = envelope.get("choices")
        if not isinstance(choices, list):
            return
        for choice in choices:
            if not isinstance(choice, Mapping) or not isinstance(choice.get("delta"), Mapping):
                continue
            details = choice["delta"].get("reasoning_details")
            if isinstance(details, list):
                self.reasoning_details.extend(item for item in details if isinstance(item, dict))

    def _observe_route(self, envelope: Mapping[str, Any]) -> None:
        """Keep the first observed response route facts, never request defaults."""
        response_id = envelope.get("id")
        self.observe_response_id(response_id)
        for field_name in ("id", "model", "provider"):
            value = envelope.get(field_name)
            if value is not None and field_name not in self.observed_route:
                self.observed_route[field_name] = value

    def error_metadata(self) -> dict[str, Any]:
        """Expose reduced pre-error wire facts without pretending they were output."""
        metadata: dict[str, Any] = {}
        if self.wire_extras:
            metadata[_WIRE_EXTRAS_KEY] = self.wire_extras
        if self.usage_snapshots:
            metadata["openrouter_usage_snapshots"] = self.usage_snapshots
        if self.observed_route:
            metadata["openrouter_route"] = self.observed_route
        return metadata

    def final_projection(self) -> ChatGenerationChunk | None:
        """Project aggregation-sensitive response facts exactly once after stream completion."""
        additional_kwargs: dict[str, Any] = {}
        if self.wire_extras:
            additional_kwargs[_WIRE_EXTRAS_KEY] = self.wire_extras
        if self.usage_snapshots:
            additional_kwargs["openrouter_usage_snapshots"] = self.usage_snapshots
        if self.reasoning_details:
            additional_kwargs["reasoning_details"] = _reduce_stream_reasoning_details(self.reasoning_details)
        response_metadata = {"model_provider": "openrouter", **self.usage_response_metadata}
        has_route_projection = False
        for wire_field, metadata_field in (("id", "id"), ("model", "model"), ("provider", "provider")):
            if wire_field in {"id", "provider"} and wire_field in self.terminal_generation_info:
                continue
            if wire_field in self.observed_route:
                response_metadata[metadata_field] = self.observed_route[wire_field]
                has_route_projection = True
        if (
            not additional_kwargs
            and self.usage_metadata is None
            and not self.usage_response_metadata
            and not has_route_projection
        ):
            return None
        return ChatGenerationChunk(
            message=AIMessageChunk(
                content="",
                additional_kwargs=additional_kwargs,
                usage_metadata=self.usage_metadata,
                response_metadata=response_metadata,
            )
        )

    def observe_response_id(self, value: object) -> None:
        """Require every non-empty wire response id to name the same response."""
        if value is None:
            return
        if not isinstance(value, str) or not value:
            raise self.protocol_error("OpenRouter SSE response id is malformed")
        if self.response_id is None:
            self.response_id = value
        elif self.response_id != value:
            raise self.protocol_error("OpenRouter SSE response id changed within one stream")

    def observe_choice_index(self, value: object) -> None:
        """Bind the one supported stream choice while allowing its sparse provider index."""
        if type(value) is not int or value < 0:
            raise self.protocol_error("OpenRouter SSE choice index is invalid")
        if self.choice_index is None:
            self.choice_index = value
        elif self.choice_index != value:
            raise self.protocol_error("OpenRouter SSE stream contains a second choice")

    def next_event_seq(self) -> int:
        """Allocate the wire-order number for one non-terminal SSE data event."""
        event_seq = self.event_seq
        self.event_seq += 1
        return event_seq


def _has_generated_output(chunk: ChatGenerationChunk) -> bool:
    """Return whether a chunk carries generated content rather than accounting metadata."""
    message = chunk.message
    if message.content not in (None, "", []):
        return True
    if message.additional_kwargs.get("reasoning_content"):
        return True
    if message.additional_kwargs.get("refusal"):
        return True
    return bool(getattr(message, "tool_call_chunks", None) or getattr(message, "tool_calls", None))


def _required_output_media(modalities: object) -> str | None:
    """Return the sole requested native output modality, if any."""
    if isinstance(modalities, list) and modalities in (["image"], ["audio"]):
        return cast("str", modalities[0])
    return None


def _content_has_supported_media(content: object, media_type: str) -> bool:
    """Return whether a wire content list carries one requested standard media type."""
    return isinstance(content, list) and any(
        isinstance(block, Mapping) and block.get("type") == media_type for block in content
    )


def _publication_chunks(entries: Sequence[dict[str, Any] | object]) -> list[ChatGenerationChunk]:
    """Project one ordered media-timeline release through the normal LC chunk contract."""
    chunks: list[ChatGenerationChunk] = []
    for entry in entries:
        if isinstance(entry, ChatGenerationChunk):
            chunks.append(entry)
        elif isinstance(entry, Mapping):
            chunks.append(ChatGenerationChunk(message=AIMessageChunk(content=[dict(entry)])))
        else:
            raise RuntimeError("OpenRouter native publication timeline contained an unsupported entry")
    return chunks


# ---------------------------------------------------------------------------
# Produced-image extraction (OpenRouter private protocol extension)
# ---------------------------------------------------------------------------

IMAGE_OUTPUT_MODALITIES: Final[tuple[str, ...]] = ("image", "text")
"""What a request asks for when the target model can answer with pictures.

OpenRouter's `modalities` names the *output* modalities and text must stay in the list — a
request asking for images alone gets a reply with no words. Never sent unconditionally: a
model that cannot answer with images rejects the whole request, losing its text reply too, so
the parameter rides an explicit per-model capability answer rather than a constant.
"""

#: The block type a produced image lands on. Matches the LangChain content-block vocabulary
#: field-for-field, which is the whole reason no translation layer sits between a provider's
#: answer and what a consumer stores and streams.
_IMAGE_BLOCK_TYPE: Final[str] = "image"


class StreamedImageOutputUnsupportedError(RuntimeError):
    """An image-output request was made on a transport that cannot deliver the image.

    Raised instead of streaming a reply whose picture was already destroyed: the OpenRouter
    SDK's streaming delta model declares no `images` field and its base model leaves
    pydantic's `extra` at the default, so the field is *silently ignored* while the model is
    built — the image is gone before `model_dump` is ever called, one layer below anything
    this class can override. (Ignored, not refused: nothing raises. Verified 2026-09-02
    against openrouter 1.1.112, whose `ChatStreamDelta` still declares no `images`, so this is
    not a version to wait out. It does mean the loss happens at the SDK's own send seam rather
    than at an impassable wall — a future transport that does not go through it could still
    read `delta.images` off the wire.) Answering with the text alone would be exactly the
    silent loss the extraction below exists to end — so the call refuses and names the way
    through.
    """


def extract_openrouter_image_blocks(
    images: Sequence[Mapping[str, Any]], *, max_media_bytes: int | None = None
) -> list[dict[str, Any]]:
    """Translate OpenRouter's produced-image entries into content blocks.

    `message.images` is OpenRouter's private extension to the OpenAI protocol: each entry
    holds an `image_url.url` carrying the generated picture as a base64 data URL. The result
    is an ordinary LangChain media block, so nothing downstream needs to know an image ever
    had a provider-specific shape.

    Args:
        images: The provider's image entries, in the order it produced them.

    Returns:
        One media block per entry, order preserved.

    Raises:
        ValueError: If an entry names no url, or names one this process cannot inline. Both
            are refusals rather than skips: a dropped entry would reach the caller as a reply
            that is merely missing a picture, which is indistinguishable from a model that
            drew nothing and is unrecoverable by the time anyone notices.
    """
    blocks = [_image_block(entry, position) for position, entry in enumerate(images)]
    if max_media_bytes is not None:
        decoded_bytes = sum(strict_base64_size(str(block["base64"]), "image") for block in blocks)
        if decoded_bytes > max_media_bytes:
            raise NativeMediaLimitError("OpenRouter decoded media exceeded a configured byte limit")
    return blocks


def _image_block(entry: Mapping[str, Any], position: int) -> dict[str, Any]:
    """Translate one produced-image entry into a media block.

    Args:
        entry: One `message.images` element.
        position: Its index, named in any refusal so a caller can find the bad entry.

    Returns:
        The media block carrying the image's octets and media type.

    Raises:
        ValueError: If the entry carries no url, or a url that is not inline data.
    """
    image_url = entry.get("image_url")
    url = image_url.get("url") if isinstance(image_url, Mapping) else None
    if not isinstance(url, str):
        raise ValueError(f"OpenRouter produced image {position} carries no image url")
    if url.startswith("data:") and "," not in url:
        raise ValueError(f"OpenRouter produced image {position} is not a parseable data URL")
    try:
        return inline_image_block(entry, position)
    except NativeMediaProtocolError as error:
        raise ValueError(str(error)) from error


def _carries_media_block(content: Any) -> bool:
    """Whether a message's content already holds a media block.

    The retreat condition for the extraction: should `_convert_dict_to_message` ever learn
    `images` itself, its result already carries the block and extracting again would duplicate
    the picture.

    Args:
        content: A converted message's content, in whatever shape the conversion produced.

    Returns:
        `True` when the content is a block list containing at least one media block.
    """
    if not isinstance(content, list):
        return False
    return any(isinstance(block, Mapping) and block.get("type") == _IMAGE_BLOCK_TYPE for block in content)


def _content_with_media(content: Any, media_blocks: list[dict[str, Any]]) -> list[str | dict[Any, Any]]:
    """Compose the message content a produced image belongs in.

    The words come first and the pictures after, which is the order the provider's own payload
    expresses: `content` is one text body and `images` is a list beside it, so there is no
    interleaving to preserve and inventing one would be a claim the wire did not make.

    Args:
        content: The message's text content as the conversion produced it.
        media_blocks: The translated produced images.

    Returns:
        The block list: the text block when there were words, then every media block.
    """
    if isinstance(content, list):
        return [*content, *media_blocks]
    text_blocks: list[str | dict[Any, Any]] = (
        [{"type": "text", "text": content}] if isinstance(content, str) and content else []
    )
    return [*text_blocks, *media_blocks]


def _is_unknown_required_media(content: object) -> bool:
    """Identify a sole image-request result that has no supported image representation."""
    if not isinstance(content, list) or not content:
        return False
    return all(
        isinstance(block, Mapping) and block.get("type") not in _SUPPORTED_CONTENT_BLOCK_TYPES for block in content
    )


def _apply_produced_images(
    message: BaseMessage, raw_message: Mapping[str, Any], *, media: NativeMediaAssembler
) -> None:
    """Land the images one choice produced onto the message built from that same choice.

    Called with the choice body already in hand, so the private `images` field is read from
    the one parse `_create_chat_result` performed rather than from a second pass over the
    response.

    Args:
        message: The converted message for this choice, rewritten in place when it drew.
        raw_message: That choice's `message` object as it arrived on the wire.

    Raises:
        ValueError: Propagated from the extraction when an image entry names a location this
            seam cannot inline. Refusing beats answering with a block a storage seam
            downstream would have nothing to land.
    """
    media.validate_response_content(message.content)
    images = raw_message.get("images") or []
    if not images:
        return
    produced = media.response_images(images)
    if not _carries_media_block(message.content):
        message.content = _content_with_media(message.content, produced)
        return
    assert isinstance(message.content, list)
    present = {
        (block.get("mime_type"), block.get("base64"))
        for block in message.content
        if isinstance(block, Mapping) and block.get("type") == _IMAGE_BLOCK_TYPE
    }
    message.content = [
        *message.content,
        *[block for block in produced if (block["mime_type"], block["base64"]) not in present],
    ]


def _get_default_model_profile(model_name: str) -> ModelProfile:
    default = _MODEL_PROFILES.get(model_name) or {}
    return default.copy()


def _create_stream_generation_info(
    chunk_dict: dict[str, Any], choice: dict[str, Any], model_name: str
) -> dict[str, Any]:
    generation_info = {"finish_reason": choice["finish_reason"]}
    generation_info["model_name"] = chunk_dict.get("model") or model_name
    if provider := chunk_dict.get("provider"):
        generation_info["provider"] = provider
    if system_fingerprint := chunk_dict.get("system_fingerprint"):
        generation_info["system_fingerprint"] = system_fingerprint
    if native_finish_reason := choice.get("native_finish_reason"):
        generation_info["native_finish_reason"] = native_finish_reason
    if response_id := chunk_dict.get("id"):
        generation_info["id"] = response_id
    if created := chunk_dict.get("created"):
        generation_info["created"] = int(created)
    if object_ := chunk_dict.get("object"):
        generation_info["object"] = object_
    return generation_info


def _wire_response_metadata(envelope: Mapping[str, Any], choice: Mapping[str, Any]) -> dict[str, Any]:
    """Project observed routing and terminal facts without falling back to request defaults."""
    metadata: dict[str, Any] = {"model_provider": "openrouter"}
    for wire_field, metadata_field in (("model", "model"), ("provider", "provider"), ("id", "id")):
        value = envelope.get(wire_field)
        if value is not None:
            metadata[metadata_field] = value
    finish_reason = choice.get("finish_reason")
    if finish_reason is not None:
        metadata["finish_reason"] = finish_reason
    native_finish_reason = choice.get("native_finish_reason")
    if native_finish_reason is not None:
        metadata["native_finish_reason"] = native_finish_reason
    return metadata


class ChatOpenRouter(BaseChatModel):
    """OpenRouter chat model integration.

    OpenRouter is a unified API that provides access to hundreds of models from
    multiple providers (OpenAI, Anthropic, Google, Meta, etc.).

    ???+ info "Setup"

        Depend on the `omne-openrouter` workspace package and set environment
        variable `OPENROUTER_API_KEY`.

        ```bash
        export OPENROUTER_API_KEY="your-api-key"
        ```

    ??? info "Key init args — completion params"

        | Param | Type | Description |
        | ----- | ---- | ----------- |
        | `model` | `str` | Model name |
        | `temperature` | `float | None` | Sampling temperature. |
        | `max_tokens` | `int | None` | Max tokens to generate. |

    ??? info "Key init args — client params"

        | Param | Type | Description |
        | ----- | ---- | ----------- |
        | `api_key` | `str | None` | OpenRouter API key. |
        | `base_url` | `str | None` | Base URL for API requests. |
        | `timeout` | `float | None` | Timeout in seconds. |
        | `app_url` | `str | None` | App URL for attribution. |
        | `app_title` | `str | None` | App title for attribution. |
        | `app_categories` | `list[str] | None` | Marketplace attribution categories. |
        | `session_id` | `str | None` | Group related requests for observability. |
        | `trace` | `dict[str, Any] | None` | Trace metadata for broadcasts. |
        | `default_headers` | `Mapping[str, str] | None` | Extra request headers. |
        | `max_retries` | `int` | Max retries (default `2`). Set to `0` to disable. |

    ??? info "Instantiate"

        ```python
        from omne_openrouter import ChatOpenRouter

        model = ChatOpenRouter(
            model="anthropic/claude-sonnet-4-5",
            temperature=0,
            # api_key="...",
            # openrouter_provider={"order": ["Anthropic"]},
        )
        ```

    See https://openrouter.ai/docs for platform documentation.
    """

    client: Any = Field(default=None, exclude=True)
    """Retired SDK client slot, accepted only as ``None`` for compatibility."""

    http_client: httpx.Client | None = Field(default=None, exclude=True)
    """Optional caller-owned synchronous HTTP client."""

    http_async_client: httpx.AsyncClient | None = Field(default=None, exclude=True)
    """Optional caller-owned asynchronous HTTP client."""

    openrouter_api_key: SecretStr | None = Field(
        alias="api_key",
        default_factory=secret_from_env("OPENROUTER_API_KEY", default=None),
    )
    """OpenRouter API key."""

    openrouter_api_base: str | None = Field(
        default_factory=from_env("OPENROUTER_API_BASE", default=None),
        alias="base_url",
    )
    """OpenRouter API base URL. Maps to SDK `server_url`."""

    app_url: str | None = Field(
        default_factory=from_env(
            "OPENROUTER_APP_URL",
            default="https://github.com/nemori-ai/omne-next",
        ),
    )
    """Application URL for OpenRouter attribution.

    Maps to `HTTP-Referer` header.

    Defaults to this repository. Upstream defaults to the LangChain docs URL, which
    would make every unconfigured call report an identity that is not the caller's;
    the header is sent on every request and is what the OpenRouter dashboard
    attributes traffic to. Set this to your app's URL to be credited instead.

    See https://openrouter.ai/docs/app-attribution for details.
    """

    app_title: str | None = Field(
        default_factory=from_env("OPENROUTER_APP_TITLE", default="OMNE"),
    )
    """Application title for OpenRouter attribution.

    Maps to `X-Title` header.

    Defaults to `'OMNE'`, for the same reason `app_url` defaults to this
    repository: the value goes on the wire on every request. Set this to your
    app's name to be credited instead.

    See https://openrouter.ai/docs/app-attribution for details.
    """

    app_categories: list[str] | None = Field(
        default=None,
    )
    """Marketplace categories for OpenRouter attribution.

    Maps to `X-OpenRouter-Categories` header. Pass a list of lowercase,
    hyphen-separated category strings (max 30 characters each),
    e.g. `['cli-agent', 'programming-app']`.

    Only recognized categories are accepted (unrecognized values are silently
    dropped by OpenRouter).

    See https://openrouter.ai/docs/app-attribution for recognized categories.
    """

    request_timeout: float | None = Field(default=None, alias="timeout")
    """Per-request timeout in **seconds** — the unit every other LangChain provider uses.

    Upstream declares this same field in milliseconds and hands it straight to the
    OpenRouter SDK's `timeout_ms`, so the idiomatic `timeout=120` buys a 120 *millisecond*
    budget: the request does not fail fast, it hangs, and nothing raises to say why. This
    fork restores the ecosystem meaning and converts at the client seam instead, so the
    attribute keeps reporting the seconds it was given and a model rebuilt from its own
    stored value keeps its budget rather than multiplying it a thousandfold.

    `None` leaves the SDK's own default in place; `0` is an explicit budget of none. The
    two are not interchangeable.
    """

    max_retries: int = 0
    """Retired compatibility setting; only ``0`` is accepted because the fork never retries."""

    model_name: str = Field(alias="model")
    """The name of the model, e.g. `'anthropic/claude-sonnet-4-5'`."""

    @property
    def model(self) -> str:
        """Same as model_name."""
        return self.model_name

    temperature: float | None = None
    """Sampling temperature."""

    max_tokens: int | None = None
    """Maximum number of tokens to generate."""

    max_completion_tokens: int | None = None
    """Maximum number of completion tokens to generate."""

    top_p: float | None = None
    """Nucleus sampling parameter."""

    frequency_penalty: float | None = None
    """Frequency penalty for generation."""

    presence_penalty: float | None = None
    """Presence penalty for generation."""

    seed: int | None = None
    """Random seed for reproducibility."""

    stop: list[str] | str | None = Field(default=None, alias="stop_sequences")
    """Default stop sequences."""

    n: int = Field(default=1, ge=1)
    """Number of chat completions to generate for each prompt."""

    streaming: bool = False
    """Whether to stream the results or not."""

    stream_usage: bool = True
    """Whether to include usage metadata in streaming output.

    If `True`, additional message chunks will be generated during the stream including
    usage metadata.
    """

    model_kwargs: dict[str, Any] = Field(default_factory=dict)
    """Any extra model parameters for the OpenRouter API."""

    reasoning: dict[str, Any] | None = None
    """Reasoning settings to pass to OpenRouter.

    Controls how many tokens the model allocates for internal chain-of-thought
    reasoning.

    Accepts an `openrouter.components.OpenResponsesReasoningConfig` or an
    equivalent dict.

    Supported keys:

    - `effort`: Controls reasoning token budget.

        Values: `'xhigh'`, `'high'`, `'medium'`, `'low'`, `'minimal'`, `'none'`.
    - `summary`: Controls verbosity of the reasoning summary returned in the
        response.

        Values: `'auto'`, `'concise'`, `'detailed'`.

    Example: `{"effort": "high", "summary": "auto"}`

    See https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    """

    openrouter_provider: dict[str, Any] | None = None
    """Provider preferences to pass to OpenRouter.

    Example: `{"order": ["Anthropic", "OpenAI"]}`
    """

    route: str | None = None
    """Route preference for OpenRouter, e.g. `'fallback'`."""

    plugins: list[dict[str, Any]] | None = None
    """Plugins configuration for OpenRouter."""

    default_headers: Mapping[str, str] | None = Field(default=None, exclude=True)
    """Additional HTTP headers to include on every request to OpenRouter.

    Headers set here become the underlying httpx client's default headers, so
    they are sent on every request to OpenRouter. Useful for upstream provider
    features that require custom headers — for example, xAI's `x-grok-conv-id`
    for sticky-routing prompt cache hits, region routing, A/B test bucketing
    headers, or provider-specific authentication. Whether a given header is
    forwarded to the upstream provider (versus consumed by OpenRouter itself)
    is determined by OpenRouter; consult its docs for which headers propagate.

    Because these headers may contain credentials, they are excluded from
    LangChain serialization.

    Example: `{"x-grok-conv-id": "session-abc123"}`

    Headers set via this field are merged with the OpenRouter app-attribution
    headers (`HTTP-Referer`, `X-Title`, `X-OpenRouter-Categories`); on a
    collision the value from `default_headers` takes precedence, matched
    case-insensitively (HTTP header names are case-insensitive).
    """

    session_id: str | None = Field(
        default_factory=from_env("OPENROUTER_SESSION_ID", default=None),
    )
    """Identifier used by OpenRouter to group related requests together.

    Useful any time multiple requests should share an observability
    grouping (e.g. a conversation, an agent workflow, a batch job, or a CI
    run). Equivalent to setting the `x-session-id` HTTP header on the
    underlying request. OpenRouter rejects values longer than 256
    characters.

    Falls back to the `OPENROUTER_SESSION_ID` environment variable when
    unset, so callers can group all requests from a process without
    threading the value through application code. Empty strings are
    treated as unset.

    Example: `"conv-2026-04-30-abc"`

    See https://openrouter.ai/docs/guides/features/broadcast/overview
    """

    image_output: bool = False
    """Whether the target model can answer with generated images.

    Off by default and never inferred from the model name: OpenRouter rejects the *whole*
    request when a model that cannot produce images is asked for them, so a wrong guess costs
    the text reply as well. Set it from a capability answer about the configured model.
    """

    trace: dict[str, Any] | None = None
    """Trace metadata for observability tools (e.g. Langfuse, LangSmith).

    Forwarded by OpenRouter to configured broadcast destinations. Common
    keys include `trace_id`, `trace_name`, `span_name`, `generation_name`,
    and `parent_span_id`; see the OpenRouter broadcast docs for the
    current full set. Unknown keys are forwarded as custom metadata.

    No environment-variable fallback — set per-call or on the constructor.

    Example: `{"trace_id": "abc-123", "span_name": "summarize"}`

    See https://openrouter.ai/docs/guides/features/broadcast/overview
    """

    modalities: list[str] | None = None
    """Explicit requested output modalities, omitted when unset."""

    audio: dict[str, Any] | None = None
    """Requested OpenRouter chat audio output configuration."""

    image_config: dict[str, Any] | None = None
    """Requested OpenRouter chat image generation configuration."""

    usage: dict[str, Any] | None = None
    """Requested OpenRouter usage response configuration."""

    models: list[str] | None = None
    """Requested model candidates for this chat request."""

    transforms: list[str] | None = None
    """Requested OpenRouter transforms for this chat request."""

    max_wire_event_bytes: int = 16 * 1024 * 1024
    """Local maximum size of one unparsed SSE event."""

    max_response_bytes: int = 128 * 1024 * 1024
    """Local maximum cumulative response size."""

    max_media_bytes: int = 64 * 1024 * 1024
    """Local maximum decoded media bytes per response."""

    model_config = ConfigDict(arbitrary_types_allowed=True, populate_by_name=True)

    _owned_http_client: httpx.Client | None = PrivateAttr(default=None)
    _owned_http_async_client: httpx.AsyncClient | None = PrivateAttr(default=None)
    _client_lock: threading.Lock = PrivateAttr(default_factory=threading.Lock)
    _admission_closed: bool = PrivateAttr(default=False)
    _closed: bool = PrivateAttr(default=False)

    @model_validator(mode="before")
    @classmethod
    def build_extra(cls, values: dict[str, Any]) -> Any:
        """Move only unknown JSON wire fields into ``model_kwargs`` without mutation."""
        if not isinstance(values, dict):
            return values
        values = dict(values)
        for alias, canonical in _CANONICAL_ALIASES.items():
            if alias in values and canonical in values:
                raise ValueError(f"{alias} and {canonical} cannot both be supplied")
        for wire_name, canonical in _WIRE_ALIASES.items():
            if wire_name in values:
                if canonical in values:
                    raise ValueError(f"{wire_name} and {canonical} cannot both be supplied")
                values[canonical] = values.pop(wire_name)
        if values.get("client") is not None:
            raise ValueError("legacy SDK client is unsupported; use http_client or http_async_client")
        if "timeout" in values and "request_timeout" in values:
            raise ValueError("timeout and request_timeout cannot both be supplied")
        extra = values.get("model_kwargs", {})
        if not isinstance(extra, dict):
            raise ValueError("model_kwargs must be a mapping of JSON values")
        extra = dict(extra)
        field_names = get_pydantic_field_names(cls)
        aliases = {field.alias for field in cls.model_fields.values() if field.alias}
        accepted_names = field_names | aliases
        for field_name in list(values):
            if field_name in {"model_kwargs"} or field_name in accepted_names:
                continue
            if field_name in extra:
                raise ValueError(f"Found {field_name} supplied twice.")
            value = values.pop(field_name)
            _require_finite_json(value, f"model_kwargs value for {field_name!r}")
            extra[field_name] = value
        invalid_model_kwargs = (accepted_names | _WIRE_ALIASES.keys()).intersection(extra)
        if invalid_model_kwargs:
            raise ValueError(f"Parameters {invalid_model_kwargs} must be specified explicitly, not in model_kwargs")
        for name, value in extra.items():
            _require_finite_json(value, f"model_kwargs value for {name!r}")
        values["model_kwargs"] = extra
        return values

    @field_validator("request_timeout")
    @classmethod
    def validate_timeout(cls, value: float | None) -> float | None:
        """Keep timeout in finite non-negative seconds."""
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError("timeout must be finite and non-negative seconds")
        return value

    @field_validator("max_retries", mode="before")
    @classmethod
    def validate_max_retries(cls, value: object) -> int:
        """Reject all fork retry configurations before transport construction."""
        if type(value) is not int or value != 0:
            raise ValueError("max_retries must be the integer 0; the fork does not retry")
        return value

    @field_validator("max_wire_event_bytes", "max_response_bytes", "max_media_bytes", mode="before")
    @classmethod
    def validate_positive_limit(cls, value: object) -> int:
        """Keep parser safety bounds local and positive."""
        if type(value) is not int or value <= 0:
            raise ValueError("wire resource limits must be positive integers")
        return value

    @model_validator(mode="after")
    def _set_openrouter_version(self) -> Self:
        """Set package version in metadata."""
        self._add_version("omne-openrouter", _package_version("omne-openrouter"))
        return self

    @model_validator(mode="after")
    def validate_environment(self) -> Self:
        """Validate local controls without constructing an SDK or opening a connection."""
        if not (self.openrouter_api_key and self.openrouter_api_key.get_secret_value()):
            msg = "OPENROUTER_API_KEY must be set."
            raise ValueError(msg)
        if self.n > 1 and self.streaming:
            msg = "n must be 1 when streaming."
            raise ValueError(msg)
        if self.image_output and self.modalities is not None:
            raise ValueError("image_output conflicts with explicit modalities")
        self._validate_output_configuration(
            {"modalities": self.modalities, "audio": self.audio, "image_config": self.image_config}
        )
        if self.default_headers and any(name.casefold() == "authorization" for name in self.default_headers):
            raise ValueError("Authorization must be supplied only through api_key")
        self._endpoint_url()
        return self

    def _resolve_model_profile(self) -> ModelProfile | None:
        return _get_default_model_profile(self.model_name) or None

    #
    # Serializable class method overrides
    #
    @property
    def lc_secrets(self) -> dict[str, str]:
        """A map of constructor argument names to secret ids."""
        return {"openrouter_api_key": "OPENROUTER_API_KEY"}

    @classmethod
    def is_lc_serializable(cls) -> bool:
        """Return whether this model can be serialized by LangChain."""
        return True

    #
    # BaseChatModel method overrides
    #
    @property
    def _llm_type(self) -> str:
        """Return type of chat model."""
        return "openrouter-chat"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        """Get the identifying parameters."""
        return {
            "model": self.model_name,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "top_p": self.top_p,
            "streaming": self.streaming,
            "reasoning": self.reasoning,
            "openrouter_provider": self.openrouter_provider,
            "route": self.route,
            "model_kwargs": self.model_kwargs,
        }

    def _get_ls_params(
        self,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> LangSmithParams:
        """Get standard params for tracing."""
        params = self._get_invocation_params(stop=stop, **kwargs)
        ls_params = LangSmithParams(
            ls_provider="openrouter",
            ls_model_name=params.get("model", self.model_name),
            ls_model_type="chat",
            ls_temperature=params.get("temperature", self.temperature),
        )
        if ls_max_tokens := params.get("max_tokens", self.max_tokens):
            ls_params["ls_max_tokens"] = ls_max_tokens
        if ls_stop := stop or params.get("stop", None) or self.stop:
            ls_params["ls_stop"] = ls_stop if isinstance(ls_stop, list) else [ls_stop]
        return ls_params

    def _endpoint_url(self) -> str:
        """Return the one permitted chat-completions endpoint for this instance.

        Raises:
            ValueError: If a configured base URL could leak credentials or double the path.
        """
        base_url = self.openrouter_api_base or "https://openrouter.ai/api/v1"
        url = httpx.URL(base_url)
        if url.scheme not in {"http", "https"} or url.userinfo:
            raise ValueError("base_url must be an http(s) URL without userinfo")
        if url.path.rstrip("/").endswith("/chat/completions"):
            raise ValueError("base_url must not already include /chat/completions")
        return str(url.copy_with(path=f"{url.path.rstrip('/')}/chat/completions"))

    def _request_headers(self) -> dict[str, str]:
        """Build fresh auth and attribution headers for one request."""
        api_key = self.openrouter_api_key.get_secret_value()  # type: ignore[union-attr]
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        if self.app_url:
            headers["HTTP-Referer"] = self.app_url
        if self.app_title:
            headers["X-Title"] = self.app_title
        if self.app_categories:
            headers["X-OpenRouter-Categories"] = ",".join(self.app_categories)
        if self.default_headers:
            custom_headers = {
                name: value for name, value in self.default_headers.items() if name.casefold() != "authorization"
            }
            custom_names = {name.casefold() for name in custom_headers}
            headers = {name: value for name, value in headers.items() if name.casefold() not in custom_names}
            headers.update(custom_headers)
        return headers

    def _provider_error(
        self,
        error: Mapping[str, Any],
        *,
        during_streaming: bool,
        status: int | None = None,
        failure_origin: str = "provider_body",
        output_started: bool = False,
        request_id: str | None = None,
        provider_metadata: Mapping[str, Any] | None = None,
    ) -> OpenRouterResponseError:
        """Project a provider error without exposing this model's configured credential."""
        api_key = self.openrouter_api_key.get_secret_value() if self.openrouter_api_key else ""
        return _response_error(
            error,
            during_streaming=during_streaming,
            status=status,
            failure_origin=failure_origin,
            output_started=output_started,
            request_id=request_id,
            sensitive_values=(api_key,),
            provider_metadata=provider_metadata,
        )

    def _resolve_timeout(self, kwargs: dict[str, Any]) -> float | None:
        """Pop and validate an optional call-level timeout in seconds."""
        supplied = [name for name in ("timeout", "request_timeout") if name in kwargs]
        if len(supplied) > 1:
            raise ValueError("timeout and request_timeout cannot both be supplied")
        if not supplied:
            return self.request_timeout
        value = kwargs.pop(supplied[0])
        if value is None:
            return self.request_timeout
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError("timeout must be finite and non-negative seconds")
        return float(value)

    def _request_payload(
        self, messages: list[BaseMessage], stop: list[str] | None, kwargs: dict[str, Any], *, stream: bool
    ) -> tuple[dict[str, Any], float | None]:
        """Build an isolated JSON body and selected timeout for exactly one attempt."""
        call_kwargs = dict(kwargs)
        timeout = self._resolve_timeout(call_kwargs)
        effective_image_output = self._normalize_call_kwargs(call_kwargs, stop=stop)
        message_dicts, params = self._create_message_dicts(
            messages,
            stop,
            image_output=effective_image_output,
        )
        params = {**params, **call_kwargs, "stream": stream}
        _strip_internal_kwargs(params)
        for local_control in {
            "client",
            "http_client",
            "http_async_client",
            "max_retries",
            "max_wire_event_bytes",
            "max_response_bytes",
            "max_media_bytes",
        }:
            params.pop(local_control, None)
        if stream and self.stream_usage:
            params["stream_options"] = {"include_usage": True}
        if stream and params.get("n", 1) != 1:
            raise ValueError("n must be 1 when streaming")
        self._validate_output_configuration(params)
        _require_finite_json(params, "request payload")
        return {"messages": message_dicts, **params}, timeout

    def _requests_native_audio(self, kwargs: Mapping[str, Any]) -> bool:
        """Whether invoke must aggregate the verified audio profile from an SSE response.

        This is deliberately independent of LangChain's public streaming preference. A
        caller can hard-disable public chunk delivery and still receive one final message;
        the provider request remains a single internal SSE attempt because the observed
        audio profile has no non-streaming completion representation.
        """
        return kwargs.get("audio") is not None or self.audio is not None

    def _normalize_call_kwargs(self, kwargs: dict[str, Any], *, stop: list[str] | None) -> bool:
        """Normalize call aliases and return the effective legacy image switch."""
        forbidden = _CALL_LOCAL_CONTROLS.intersection(kwargs)
        if forbidden:
            name = sorted(forbidden)[0]
            raise ValueError(f"{name} is a local constructor control and cannot be overridden per call")
        for alias, canonical in _CALL_CANONICAL_ALIASES.items():
            if alias not in kwargs:
                continue
            if canonical in kwargs or (canonical == "stop" and stop is not None):
                raise ValueError(f"{alias} and {canonical} cannot both be supplied")
            kwargs[canonical] = kwargs.pop(alias)
        effective_image_output = self._effective_image_output(kwargs)
        kwargs.pop("image_output", None)
        return effective_image_output

    def _effective_image_output(self, kwargs: Mapping[str, Any]) -> bool:
        """Resolve the legacy switch and native-field provenance for one call."""
        supplied_image_output = kwargs.get("image_output")
        call_image_output = self.image_output if supplied_image_output is None else supplied_image_output
        if not isinstance(call_image_output, bool):
            raise ValueError("image_output must be a boolean")
        if call_image_output and ("modalities" in kwargs or self.modalities is not None):
            raise ValueError("image_output conflicts with explicit modalities")
        return call_image_output

    @staticmethod
    def _validate_output_configuration(params: Mapping[str, Any]) -> None:
        """Reject output configuration that cannot be represented by requested modalities."""
        modalities = params.get("modalities")
        for field, modality in (("audio", "audio"), ("image_config", "image")):
            if params.get(field) is not None and (not isinstance(modalities, list) or modality not in modalities):
                raise ValueError(f"{field} requires modalities containing {modality!r}")
        audio = params.get("audio")
        if audio is not None and (not isinstance(audio, Mapping) or audio.get("format") != "pcm16"):
            raise ValueError("audio format is outside the verified pcm16 chat-wire profile")

    def _http_request_options(self, payload: dict[str, Any], timeout: float | None) -> dict[str, Any]:
        """Build per-attempt httpx options without overriding a client default with ``None``."""
        options: dict[str, Any] = {"follow_redirects": False, "headers": self._request_headers(), "json": payload}
        if timeout is not None:
            options["timeout"] = timeout
        return options

    def _sync_client(self) -> httpx.Client:
        """Return a borrowed client or lazily create one owned synchronous client."""
        with self._client_lock:
            if self._admission_closed:
                raise OpenRouterClientLifecycleError("ChatOpenRouter is closed")
            if self.http_client is not None:
                return self.http_client
            if self._owned_http_client is None:
                self._owned_http_client = httpx.Client(follow_redirects=False)
            return self._owned_http_client

    def _async_client(self) -> httpx.AsyncClient:
        """Return a borrowed client or lazily create one owned asynchronous client."""
        with self._client_lock:
            if self._admission_closed:
                raise OpenRouterClientLifecycleError("ChatOpenRouter is closed")
            if self.http_async_client is not None:
                return self.http_async_client
            if self._owned_http_async_client is None:
                self._owned_http_async_client = httpx.AsyncClient(follow_redirects=False)
            return self._owned_http_async_client

    def close(self) -> None:
        """Close owned synchronous resources and permanently close this model instance."""
        with self._client_lock:
            if self._closed:
                return
            if self._owned_http_async_client is not None:
                raise OpenRouterClientLifecycleError("owned async client is live; call aclose()")
            self._admission_closed = True
            sync_client = self._owned_http_client
        if sync_client is not None:
            sync_client.close()
        with self._client_lock:
            self._closed = True

    async def aclose(self) -> None:
        """Close every owned resource and permanently close this model instance."""
        with self._client_lock:
            if self._closed:
                return
            self._admission_closed = True
            sync_client = self._owned_http_client
            async_client = self._owned_http_async_client
        try:
            if async_client is not None:
                await async_client.aclose()
        except BaseException as error:
            if sync_client is not None:
                try:
                    sync_client.close()
                except BaseException as cleanup_error:
                    error.add_note(f"owned synchronous client cleanup also failed: {cleanup_error.__class__.__name__}")
            raise
        if sync_client is not None:
            sync_client.close()
        with self._client_lock:
            self._closed = True

    def __enter__(self) -> Self:
        """Enter a synchronous owned-client lifecycle context."""
        with self._client_lock:
            if self._admission_closed:
                raise OpenRouterClientLifecycleError("ChatOpenRouter is closed")
        return self

    def __exit__(self, _type: object, _value: object, _traceback: object) -> None:
        """Close owned synchronous resources at context exit."""
        self.close()

    async def __aenter__(self) -> Self:
        """Enter an asynchronous owned-client lifecycle context."""
        with self._client_lock:
            if self._admission_closed:
                raise OpenRouterClientLifecycleError("ChatOpenRouter is closed")
        return self

    async def __aexit__(self, _type: object, _value: object, _traceback: object) -> None:
        """Close all owned resources at asynchronous context exit."""
        await self.aclose()

    def _read_response(self, response: httpx.Response) -> bytes:
        """Read a non-stream body incrementally within the configured response cap."""
        if response.is_stream_consumed:
            if len(response.content) > self.max_response_bytes:
                raise OpenRouterResponseError(
                    "OpenRouter response exceeded configured byte limit (code: unknown)",
                    status=response.status_code,
                    failure_origin="limit",
                    request_id=_request_id(response),
                )
            return response.content
        chunks: list[bytes] = []
        size = 0
        for chunk in response.iter_bytes():
            size += len(chunk)
            if size > self.max_response_bytes:
                raise OpenRouterResponseError(
                    "OpenRouter response exceeded configured byte limit (code: unknown)",
                    status=response.status_code,
                    failure_origin="limit",
                    request_id=_request_id(response),
                )
            chunks.append(chunk)
        return b"".join(chunks)

    async def _aread_response(self, response: httpx.Response) -> bytes:
        """Asynchronously read a non-stream body incrementally within the response cap."""
        if response.is_stream_consumed:
            if len(response.content) > self.max_response_bytes:
                raise OpenRouterResponseError(
                    "OpenRouter response exceeded configured byte limit (code: unknown)",
                    status=response.status_code,
                    failure_origin="limit",
                    request_id=_request_id(response),
                )
            return response.content
        chunks: list[bytes] = []
        size = 0
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > self.max_response_bytes:
                raise OpenRouterResponseError(
                    "OpenRouter response exceeded configured byte limit (code: unknown)",
                    status=response.status_code,
                    failure_origin="limit",
                    request_id=_request_id(response),
                )
            chunks.append(chunk)
        return b"".join(chunks)

    def _decode_response_body(self, raw: bytes, response: httpx.Response) -> dict[str, Any]:
        """Decode a JSON response body or raise a protocol error with HTTP facts."""
        try:
            parsed = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise OpenRouterResponseError(
                "OpenRouter returned malformed JSON (code: unknown)",
                status=response.status_code,
                failure_origin="protocol",
                request_id=_request_id(response),
            ) from error
        if not isinstance(parsed, dict):
            raise OpenRouterResponseError(
                "OpenRouter returned a non-object JSON body (code: unknown)",
                status=response.status_code,
                failure_origin="protocol",
                request_id=_request_id(response),
            )
        WireEnvelope.model_validate(parsed)
        return parsed

    def _decode_error_body(self, raw: bytes) -> dict[str, Any]:
        """Best-effort parse a non-2xx body without hiding its HTTP status.

        A text or empty failure response still has a valid transport fact. Its body is
        optional provider detail, so malformed JSON must not change ``http_status`` into
        a protocol failure.
        """
        try:
            parsed = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _raise_http_status_error(self, response: httpx.Response, body: Mapping[str, Any]) -> None:
        """Raise an observed non-2xx response without retrying or parsing code as status."""
        if 200 <= response.status_code < 300:
            return
        error = body.get("error")
        if isinstance(error, Mapping):
            raise self._provider_error(
                error,
                during_streaming=False,
                status=response.status_code,
                failure_origin="http_status",
                request_id=_request_id(response),
            )
        raise OpenRouterResponseError(
            f"OpenRouter HTTP status {response.status_code} (code: unknown)",
            status=response.status_code,
            failure_origin="http_status",
            request_id=_request_id(response),
        )

    def stream(
        self,
        input: LanguageModelInput,
        config: Any = None,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> Iterator[AIMessageChunk]:
        """Honor LangChain's hard streaming opt-out before its stream method forces ``stream=True``."""
        if self._streaming_disabled(**kwargs):
            yield cast("AIMessageChunk", self.invoke(input, config=config, stop=stop, **kwargs))
            return
        yield from super().stream(input, config=config, stop=stop, **kwargs)

    async def astream(
        self,
        input: LanguageModelInput,
        config: Any = None,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[AIMessageChunk]:
        """Async counterpart of ``stream`` that preserves the same hard opt-out boundary."""
        if self._streaming_disabled(**kwargs):
            yield cast("AIMessageChunk", await self.ainvoke(input, config=config, stop=stop, **kwargs))
            return
        stream_iter = super().astream(input, config=config, stop=stop, **kwargs)
        try:
            async for chunk in stream_iter:
                yield chunk
        finally:
            await cast("Any", stream_iter).aclose()

    def astream_events(  # pyright: ignore[reportIncompatibleMethodOverride]
        self,
        input: LanguageModelInput,
        config: RunnableConfig | None = None,
        *,
        version: Literal["v1", "v2", "v3"] = "v2",
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[StreamEvent] | Awaitable[AsyncChatModelStream]:
        """Preserve a call-level stream veto through LangChain's event adapters.

        The v1/v2 helpers consume this model lazily and force their internal
        ``stream=True``. Version 3 additionally creates its producer task only
        when a projection starts. In both cases the original public control is
        kept in one private call context, never added to provider JSON or model
        state.
        """
        event_kwargs = dict(kwargs)
        stream_control = event_kwargs.pop("stream", _EVENT_STREAM_UNSET)
        if stream_control is _EVENT_STREAM_UNSET:
            return super().astream_events(input, config=config, version=version, stop=stop, **event_kwargs)
        control = _EventStreamControl(model=self, stream=stream_control)
        if version == "v3":
            return self._astream_events_v3_with_control(input, config, stop=stop, control=control, **event_kwargs)
        event_iter = super().astream_events(input, config=config, version=version, stop=stop, **event_kwargs)
        return self._iterate_events_with_control(event_iter, control)

    async def _astream_events_v3_with_control(
        self,
        input: LanguageModelInput,
        config: RunnableConfig | None,
        *,
        stop: list[str] | None,
        control: _EventStreamControl,
        **kwargs: Any,
    ) -> AsyncChatModelStream:
        """Bind one v3 stream's lazy producer task to its public call control."""
        stream = await super().astream_events(input, config=config, version="v3", stop=stop, **kwargs)
        start = stream._ensure_started  # pyright: ignore[reportPrivateUsage]
        if start is None:
            raise RuntimeError("LangChain v3 event stream did not expose a start callback")

        async def start_with_control() -> None:
            token = _EVENT_STREAM_CONTROL.set(control)
            try:
                await start()
            finally:
                _EVENT_STREAM_CONTROL.reset(token)

        # `set_start` fans this callback to every v3 projection. The producer
        # task copies this context at creation, while callers regain their own
        # context before any event or projection value is yielded.
        stream.set_start(start_with_control)
        return stream

    async def _iterate_events_with_control(
        self, event_iter: AsyncIterator[StreamEvent], control: _EventStreamControl
    ) -> AsyncIterator[StreamEvent]:
        """Advance a v1/v2 event iterator under call control, never user yields."""
        try:
            while True:
                token = _EVENT_STREAM_CONTROL.set(control)
                try:
                    event = await anext(event_iter)
                except StopAsyncIteration:
                    return
                finally:
                    _EVENT_STREAM_CONTROL.reset(token)
                yield event
        finally:
            await cast("Any", event_iter).aclose()

    def _streaming_disabled(self, **kwargs: Any) -> bool:
        """Honor an event call's original stream preference at an internal seam."""
        control = _EVENT_STREAM_CONTROL.get()
        if control is not None and control.model is self:
            return super()._streaming_disabled(**{**kwargs, "stream": control.stream})
        return super()._streaming_disabled(**kwargs)

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        needs_native_audio = self._requests_native_audio(kwargs)
        if (self.streaming and not self._streaming_disabled(**kwargs)) or needs_native_audio:
            internal_run_manager = None if needs_native_audio and self._streaming_disabled(**kwargs) else run_manager
            stream_iter = self._stream(messages, stop=stop, run_manager=internal_run_manager, **kwargs)
            return generate_from_stream(stream_iter)
        payload, timeout = self._request_payload(messages, stop, kwargs, stream=False)
        try:
            with self._sync_client().stream(
                "POST", self._endpoint_url(), **self._http_request_options(payload, timeout)
            ) as response:
                raw = self._read_response(response)
                if not 200 <= response.status_code < 300:
                    self._raise_http_status_error(response, self._decode_error_body(raw))
                body = self._decode_response_body(raw, response)
                return self._create_chat_result(
                    body,
                    status=response.status_code,
                    request_id=_request_id(response),
                    required_output_media=_required_output_media(payload.get("modalities")),
                )
        except OpenRouterResponseError:
            raise
        except httpx.HTTPError as error:
            raise OpenRouterResponseError(
                "OpenRouter transport failed (code: unknown)",
                failure_origin="transport",
                provider_message=str(error),
            ) from error

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        needs_native_audio = self._requests_native_audio(kwargs)
        if (self.streaming and not self._streaming_disabled(**kwargs)) or needs_native_audio:
            internal_run_manager = None if needs_native_audio and self._streaming_disabled(**kwargs) else run_manager
            stream_iter = self._astream(messages, stop=stop, run_manager=internal_run_manager, **kwargs)
            return await agenerate_from_stream(stream_iter)
        payload, timeout = self._request_payload(messages, stop, kwargs, stream=False)
        try:
            async with self._async_client().stream(
                "POST", self._endpoint_url(), **self._http_request_options(payload, timeout)
            ) as response:
                raw = await self._aread_response(response)
                if not 200 <= response.status_code < 300:
                    self._raise_http_status_error(response, self._decode_error_body(raw))
                body = self._decode_response_body(raw, response)
                return self._create_chat_result(
                    body,
                    status=response.status_code,
                    request_id=_request_id(response),
                    required_output_media=_required_output_media(payload.get("modalities")),
                )
        except OpenRouterResponseError:
            raise
        except httpx.HTTPError as error:
            raise OpenRouterResponseError(
                "OpenRouter transport failed (code: unknown)",
                failure_origin="transport",
                provider_message=str(error),
            ) from error

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        """Stream one strict SSE response through the LangChain chunk contract."""
        self._refuse_streamed_image_output(kwargs)
        if self._streaming_disabled(**kwargs):
            run_manager = None
        payload, timeout = self._request_payload(messages, stop, kwargs, stream=True)
        default_chunk_class: type[BaseMessageChunk] = AIMessageChunk
        done_seen = False
        facts: _StreamResponseFacts | None = None
        try:
            with self._sync_client().stream(
                "POST", self._endpoint_url(), **self._http_request_options(payload, timeout)
            ) as response:
                facts = _StreamResponseFacts(
                    response.status_code,
                    _request_id(response),
                    NativeMediaAssembler(self.max_media_bytes, self.max_response_bytes),
                    required_output_media=_required_output_media(payload.get("modalities")),
                )
                if not 200 <= response.status_code < 300:
                    self._raise_http_status_error(response, self._decode_error_body(self._read_response(response)))
                for event in iter_sse_events(
                    response.iter_bytes(),
                    max_event_bytes=self.max_wire_event_bytes,
                    max_response_bytes=self.max_response_bytes,
                ):
                    if done_seen:
                        raise OpenRouterResponseError(
                            "OpenRouter sent data after [DONE] (code: unknown)",
                            status=response.status_code,
                            failure_origin="protocol",
                            output_started=facts.generated_output_started,
                            request_id=_request_id(response),
                        )
                    if event.data == "[DONE]":
                        done_seen = True
                        continue
                    chunk_dict = self._decode_sse_data(event.data, facts)
                    event_seq = facts.next_event_seq()
                    if "error" in chunk_dict:
                        error = chunk_dict["error"]
                        if not isinstance(error, Mapping):
                            raise facts.protocol_error("OpenRouter SSE error is malformed")
                        raise self._provider_error(
                            error,
                            during_streaming=True,
                            status=response.status_code,
                            failure_origin="sse_event",
                            output_started=facts.generated_output_started,
                            request_id=facts.request_id,
                            provider_metadata=facts.error_metadata(),
                        )
                    facts.observe_envelope(chunk_dict, event_seq)
                    generation_chunk, default_chunk_class, _finished = self._generation_from_wire_chunk(
                        chunk_dict, default_chunk_class, facts, event_seq=event_seq
                    )
                    publications = (
                        _publication_chunks(facts.media.publish(generation_chunk))
                        if facts.media_handled_current
                        else ([] if generation_chunk is None else [generation_chunk])
                    )
                    for publication in publications:
                        if run_manager:
                            run_manager.on_llm_new_token(
                                publication.text,
                                chunk=publication,
                                logprobs=publication.generation_info.get("logprobs")
                                if publication.generation_info
                                else None,
                            )
                        facts.generated_output_started = facts.generated_output_started or _has_generated_output(
                            publication
                        )
                        yield publication
                facts.validate_completion(done_seen)
                final_projection = facts.final_projection()
                if final_projection is not None:
                    yield final_projection
        except OpenRouterResponseError:
            raise
        except SseLimitError as error:
            raise OpenRouterResponseError(
                "OpenRouter SSE stream exceeded a configured byte limit (code: unknown)",
                status=facts.status if facts else None,
                failure_origin="limit",
                output_started=facts.generated_output_started if facts else False,
                request_id=facts.request_id if facts else None,
                provider_metadata=facts.error_metadata() if facts else None,
            ) from error
        except (SseProtocolError, json.JSONDecodeError) as error:
            raise OpenRouterResponseError(
                "OpenRouter SSE stream is malformed (code: unknown)",
                status=facts.status if facts else None,
                failure_origin="protocol",
                output_started=facts.generated_output_started if facts else False,
                request_id=facts.request_id if facts else None,
                provider_metadata=facts.error_metadata() if facts else None,
            ) from error
        except httpx.HTTPError as error:
            raise OpenRouterResponseError(
                "OpenRouter transport failed (code: unknown)",
                status=facts.status if facts else None,
                failure_origin="transport",
                output_started=facts.generated_output_started if facts else False,
                request_id=facts.request_id if facts else None,
                provider_metadata=facts.error_metadata() if facts else None,
            ) from error

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        """Asynchronously stream one strict SSE response through LangChain chunks."""
        self._refuse_streamed_image_output(kwargs)
        if self._streaming_disabled(**kwargs):
            run_manager = None
        payload, timeout = self._request_payload(messages, stop, kwargs, stream=True)
        default_chunk_class: type[BaseMessageChunk] = AIMessageChunk
        done_seen = False
        facts: _StreamResponseFacts | None = None
        try:
            async with self._async_client().stream(
                "POST", self._endpoint_url(), **self._http_request_options(payload, timeout)
            ) as response:
                facts = _StreamResponseFacts(
                    response.status_code,
                    _request_id(response),
                    NativeMediaAssembler(self.max_media_bytes, self.max_response_bytes),
                    required_output_media=_required_output_media(payload.get("modalities")),
                )
                if not 200 <= response.status_code < 300:
                    self._raise_http_status_error(
                        response, self._decode_error_body(await self._aread_response(response))
                    )
                async for event in aiter_sse_events(
                    response.aiter_bytes(),
                    max_event_bytes=self.max_wire_event_bytes,
                    max_response_bytes=self.max_response_bytes,
                ):
                    if done_seen:
                        raise OpenRouterResponseError(
                            "OpenRouter sent data after [DONE] (code: unknown)",
                            status=response.status_code,
                            failure_origin="protocol",
                            output_started=facts.generated_output_started,
                            request_id=_request_id(response),
                        )
                    if event.data == "[DONE]":
                        done_seen = True
                        continue
                    chunk_dict = self._decode_sse_data(event.data, facts)
                    event_seq = facts.next_event_seq()
                    if "error" in chunk_dict:
                        error = chunk_dict["error"]
                        if not isinstance(error, Mapping):
                            raise facts.protocol_error("OpenRouter SSE error is malformed")
                        raise self._provider_error(
                            error,
                            during_streaming=True,
                            status=response.status_code,
                            failure_origin="sse_event",
                            output_started=facts.generated_output_started,
                            request_id=facts.request_id,
                            provider_metadata=facts.error_metadata(),
                        )
                    facts.observe_envelope(chunk_dict, event_seq)
                    generation_chunk, default_chunk_class, _finished = self._generation_from_wire_chunk(
                        chunk_dict, default_chunk_class, facts, event_seq=event_seq
                    )
                    publications = (
                        _publication_chunks(facts.media.publish(generation_chunk))
                        if facts.media_handled_current
                        else ([] if generation_chunk is None else [generation_chunk])
                    )
                    for publication in publications:
                        if run_manager:
                            await run_manager.on_llm_new_token(
                                token=publication.text,
                                chunk=publication,
                                logprobs=publication.generation_info.get("logprobs")
                                if publication.generation_info
                                else None,
                            )
                        facts.generated_output_started = facts.generated_output_started or _has_generated_output(
                            publication
                        )
                        yield publication
                facts.validate_completion(done_seen)
                final_projection = facts.final_projection()
                if final_projection is not None:
                    yield final_projection
        except OpenRouterResponseError:
            raise
        except SseLimitError as error:
            raise OpenRouterResponseError(
                "OpenRouter SSE stream exceeded a configured byte limit (code: unknown)",
                status=facts.status if facts else None,
                failure_origin="limit",
                output_started=facts.generated_output_started if facts else False,
                request_id=facts.request_id if facts else None,
                provider_metadata=facts.error_metadata() if facts else None,
            ) from error
        except (SseProtocolError, json.JSONDecodeError) as error:
            raise OpenRouterResponseError(
                "OpenRouter SSE stream is malformed (code: unknown)",
                status=facts.status if facts else None,
                failure_origin="protocol",
                output_started=facts.generated_output_started if facts else False,
                request_id=facts.request_id if facts else None,
                provider_metadata=facts.error_metadata() if facts else None,
            ) from error
        except httpx.HTTPError as error:
            raise OpenRouterResponseError(
                "OpenRouter transport failed (code: unknown)",
                status=facts.status if facts else None,
                failure_origin="transport",
                output_started=facts.generated_output_started if facts else False,
                request_id=facts.request_id if facts else None,
                provider_metadata=facts.error_metadata() if facts else None,
            ) from error

    async def _astream_chat_model_events(
        self,
        messages: list[BaseMessage],
        *,
        run_manager: AsyncCallbackManagerForLLMRun,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[Any]:
        """Bridge native wire chunks or one hard-veto final message into LC events.

        LangChain calls this integration seam from the v3 producer. A hard
        public streaming veto still permits the adapter's required internal
        audio SSE aggregation, but the public event protocol receives only the
        complete final message through LangChain's own event mapper.
        """
        message_id = f"{LC_ID_PREFIX}{run_manager.run_id}"
        if self._streaming_disabled(**kwargs):
            self._refuse_streamed_image_output(kwargs)
            if kwargs.get("n", self.n) != 1:
                raise ValueError("n must be 1 when streaming")
            result = await self._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
            if len(result.generations) != 1:
                raise ValueError("OpenRouter returned multiple generations to one streaming event call")
            async for event in amessage_to_events(result.generations[0].message, message_id=message_id):
                yield event
            return
        async for event in achunks_to_events(
            self._astream(messages, stop=stop, run_manager=run_manager, **kwargs),
            message_id=message_id,
        ):
            yield event

    #
    # Internal methods
    #
    def _decode_sse_data(self, data: str, facts: _StreamResponseFacts) -> dict[str, Any]:
        """Decode one complete SSE data field into an extensible wire envelope."""
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError as error:
            raise facts.protocol_error("OpenRouter SSE event contains malformed JSON") from error
        if not isinstance(parsed, dict):
            raise facts.protocol_error("OpenRouter SSE event is not a JSON object")
        WireEnvelope.model_validate(parsed)
        return parsed

    def _generation_from_wire_chunk(
        self,
        chunk_dict: dict[str, Any],
        default_chunk_class: type[BaseMessageChunk],
        facts: _StreamResponseFacts,
        *,
        event_seq: int,
    ) -> tuple[ChatGenerationChunk | None, type[BaseMessageChunk], bool]:
        """Map one decoded wire chunk using existing LangChain-compatible chunk semantics."""
        choices = chunk_dict.get("choices")
        if "choices" not in chunk_dict or choices == []:
            if choices == [] and not isinstance(chunk_dict.get("usage"), Mapping):
                raise facts.protocol_error("OpenRouter SSE empty choices event has no usage")
            return None, default_chunk_class, False
        if not isinstance(choices, list) or len(choices) != 1:
            raise facts.protocol_error("OpenRouter SSE event must contain exactly one choice")
        choice = choices[0]
        if not isinstance(choice, Mapping):
            raise facts.protocol_error("OpenRouter SSE choice is malformed")
        facts.observe_choice_index(choice.get("index"))
        if not isinstance(choice.get("delta"), Mapping):
            raise facts.protocol_error("OpenRouter SSE choice delta is malformed")
        facts.media_handled_current = NativeMediaAssembler.handles(choice["delta"], audio_started=facts.media.has_audio)
        message_chunk = self._message_chunk_from_wire(chunk_dict, default_chunk_class, facts)
        generation_info: dict[str, Any] = {}
        finish_reason = choice.get("finish_reason")
        finished = finish_reason is not None
        if finished:
            if not isinstance(finish_reason, str) or finish_reason not in _SUPPORTED_FINISH_REASONS:
                raise facts.protocol_error("OpenRouter SSE finish reason is unsupported")
            candidate_generation_info = _create_stream_generation_info(chunk_dict, dict(choice), self.model_name)
            prior_finish_reason = facts.finish_reason
            candidate_finish_reason = candidate_generation_info["finish_reason"]
            if prior_finish_reason is not None and prior_finish_reason != candidate_finish_reason:
                raise facts.protocol_error("OpenRouter SSE stream has contradictory finish reasons")
            facts.finish_reason = candidate_finish_reason
            generation_info.update(
                {
                    key: value
                    for key, value in candidate_generation_info.items()
                    if key not in facts.terminal_generation_info
                }
            )
            facts.terminal_generation_info.update(candidate_generation_info)
        logprobs = choice.get("logprobs")
        if logprobs:
            generation_info["logprobs"] = logprobs
        if generation_info:
            generation_info["model_provider"] = "openrouter"
            message_chunk = message_chunk.model_copy(
                update={"response_metadata": {**message_chunk.response_metadata, **generation_info}}
            )
        if (
            message_chunk.content in (None, "", [])
            and not message_chunk.additional_kwargs
            and not getattr(message_chunk, "tool_call_chunks", None)
            and not generation_info
        ):
            return None, message_chunk.__class__, finished
        return (
            ChatGenerationChunk(message=message_chunk, generation_info=generation_info or None),
            message_chunk.__class__,
            finished,
        )

    @staticmethod
    def _message_chunk_from_wire(
        chunk_dict: Mapping[str, Any], default_chunk_class: type[BaseMessageChunk], facts: _StreamResponseFacts
    ) -> BaseMessageChunk:
        """Map one delta while retaining shared response facts on media failures."""
        try:
            message = _convert_chunk_to_message_chunk(
                chunk_dict,
                default_chunk_class,
                media=facts.media,
                include_reasoning_details=False,
                include_usage=False,
            )
            choice = chunk_dict["choices"][0]
            delta = choice.get("delta", {}) if isinstance(choice, Mapping) else {}
            if isinstance(delta, Mapping) and facts.required_output_media:
                raw_content = delta.get("content")
                has_native_image = facts.required_output_media == "image" and bool(delta.get("images"))
                if has_native_image or _content_has_supported_media(raw_content, facts.required_output_media):
                    facts.observed_required_media = True
                if _is_unknown_required_media(raw_content):
                    facts.observed_unknown_required_media = True
                    message = message.model_copy(update={"content": ""})
            if (
                isinstance(message, AIMessageChunk)
                and isinstance(delta, Mapping)
                and not delta.get("reasoning")
                and isinstance(delta.get("reasoning_details"), list)
            ):
                live_details = [
                    {
                        "type": "reasoning",
                        "reasoning": detail["text"],
                        _CANONICAL_REASONING_LIVE_VIEW_KEY: True,
                    }
                    for detail in delta["reasoning_details"]
                    if isinstance(detail, Mapping) and isinstance(detail.get("text"), str) and detail["text"]
                ]
                if live_details:
                    existing = message.content
                    content = (
                        [*existing, *live_details]
                        if isinstance(existing, list)
                        else ([{"type": "text", "text": existing}, *live_details] if existing else live_details)
                    )
                    message = message.model_copy(update={"content": content})
            return message
        except NativeMediaLimitError as error:
            raise facts.limit_error(str(error)) from error
        except NativeMediaProtocolError as error:
            raise facts.protocol_error(str(error)) from error

    @property
    def _default_params(self) -> dict[str, Any]:  # noqa: C901
        """Get the default parameters for calling OpenRouter API."""
        params: dict[str, Any] = {
            "model": self.model_name,
            "stream": self.streaming,
            **self.model_kwargs,
        }
        if self.temperature is not None:
            params["temperature"] = self.temperature
        if self.max_tokens is not None:
            params["max_tokens"] = self.max_tokens
        if self.max_completion_tokens is not None:
            params["max_completion_tokens"] = self.max_completion_tokens
        if self.top_p is not None:
            params["top_p"] = self.top_p
        if self.frequency_penalty is not None:
            params["frequency_penalty"] = self.frequency_penalty
        if self.presence_penalty is not None:
            params["presence_penalty"] = self.presence_penalty
        if self.seed is not None:
            params["seed"] = self.seed
        if self.n > 1:
            params["n"] = self.n
        if self.stop is not None:
            params["stop"] = self.stop
        # OpenRouter-specific params
        if self.reasoning is not None:
            params["reasoning"] = self.reasoning
        if self.openrouter_provider is not None:
            params["provider"] = self.openrouter_provider
        if self.route is not None:
            params["route"] = self.route
        if self.plugins is not None:
            params["plugins"] = self.plugins
        if self.session_id:
            params["session_id"] = self.session_id
        if self.trace is not None:
            params["trace"] = self.trace
        if self.modalities is not None:
            params["modalities"] = list(self.modalities)
        if self.audio is not None:
            params["audio"] = dict(self.audio)
        if self.image_config is not None:
            params["image_config"] = dict(self.image_config)
        if self.usage is not None:
            params["usage"] = dict(self.usage)
        if self.models is not None:
            params["models"] = list(self.models)
        if self.transforms is not None:
            params["transforms"] = list(self.transforms)
        return params

    def _create_message_dicts(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None,
        *,
        image_output: bool | None = None,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        params = self._default_params
        if stop is not None:
            params["stop"] = stop
        effective_image_output = self.image_output if image_output is None else image_output
        if effective_image_output:
            params["modalities"] = list(IMAGE_OUTPUT_MODALITIES)
        message_dicts = [_convert_message_to_dict(m) for m in messages]
        return message_dicts, params

    def _refuse_streamed_image_output(self, kwargs: Mapping[str, Any] | None = None) -> None:
        """Refuse a streaming call that asked for images, rather than stream a reply without one.

        Raises:
            StreamedImageOutputUnsupportedError: Whenever legacy ``image_output`` was
                requested. Image-stream assembly is a later wire-mapping phase; allowing the
                legacy switch before that mapper exists would promise an image this transport
                cannot yet deliver intact.
        """
        if not self._effective_image_output(kwargs or {}):
            return
        msg = (
            f"model {self.model_name!r} was asked to produce images through legacy image_output, but "
            "the current streaming mapper does not yet assemble image deltas. Issue the call "
            "non-streaming, or use an explicit image capability path."
        )
        raise StreamedImageOutputUnsupportedError(msg)

    def _create_chat_result(  # noqa: C901
        self,
        response: Any,
        *,
        status: int | None = None,
        request_id: str | None = None,
        required_output_media: str | None = None,
    ) -> ChatResult:
        """Create a ``ChatResult`` from an already-decoded OpenRouter response.

        Args:
            response: A decoded body, or a legacy object exposing ``model_dump``.
            status: Observed HTTP status for a provider body error.
            request_id: Observed provider correlation identifier.

        Returns:
            The chat result, one generation per choice the provider answered with.

        Raises:
            OpenRouterResponseError: If the body reports a provider-side failure in place of a
                completion.
            ValueError: If the body carries no choices at all, which the provider reports as
                neither a completion nor a failure.
        """
        if not isinstance(response, dict):
            response = response.model_dump(by_alias=True)

        if "error" in response:
            error = response["error"]
            if not isinstance(error, Mapping):
                raise OpenRouterResponseError(
                    "OpenRouter response error is malformed (code: unknown)",
                    status=status,
                    failure_origin="protocol",
                    request_id=request_id,
                )
            raise self._provider_error(
                error,
                during_streaming=False,
                status=status,
                failure_origin="provider_body",
                request_id=request_id,
            )

        generations = []
        response_media = NativeMediaAssembler(self.max_media_bytes, self.max_response_bytes)
        token_usage = response.get("usage") or {}

        choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            raise OpenRouterResponseError(
                "OpenRouter API returned a response with no choices (code: unknown)",
                status=status,
                failure_origin="protocol",
                request_id=request_id,
            )

        # Extract top-level response metadata
        response_model = response.get("model")
        system_fingerprint = response.get("system_fingerprint")
        provider = response.get("provider")
        response_id = response.get("id")

        for res in choices:
            if not isinstance(res, Mapping) or not isinstance(res.get("message"), Mapping):
                raise OpenRouterResponseError(
                    "OpenRouter response choice is malformed (code: unknown)",
                    status=status,
                    failure_origin="protocol",
                    request_id=request_id,
                )
            message = _convert_dict_to_message(res["message"])
            try:
                _apply_produced_images(message, res["message"], media=response_media)
            except (NativeMediaLimitError, ValueError) as error:
                origin = "limit" if isinstance(error, NativeMediaLimitError) else "protocol"
                raise OpenRouterResponseError(
                    "OpenRouter native image response is invalid (code: unknown)",
                    status=status,
                    failure_origin=origin,
                    request_id=request_id,
                ) from error
            required_media = required_output_media
            extras = _wire_extras(response, event_seq=0, choice=res)
            if (
                required_media
                and _is_unknown_required_media(message.content)
                and not _content_has_supported_media(message.content, required_media)
            ):
                raise OpenRouterResponseError(
                    "OpenRouter returned an unsupported required media block (code: unknown)",
                    status=status,
                    failure_origin="protocol",
                    request_id=request_id,
                    provider_metadata={_WIRE_EXTRAS_KEY: extras},
                )
            message = _with_wire_extras(message, extras)
            if token_usage and isinstance(message, AIMessage):
                message.usage_metadata = _create_usage_metadata(token_usage)
                message.additional_kwargs["openrouter_usage_snapshots"] = [dict(token_usage)]
                # Surface OpenRouter cost data in response_metadata
                if "cost" in token_usage:
                    message.response_metadata["cost"] = token_usage["cost"]
                if "cost_details" in token_usage:
                    message.response_metadata["cost_details"] = token_usage["cost_details"]
            if isinstance(message, AIMessage):
                message.response_metadata.update(_wire_response_metadata(response, res))
                if provider:
                    message.response_metadata["provider"] = provider
                if system_fingerprint:
                    message.response_metadata["system_fingerprint"] = system_fingerprint
                if native_finish_reason := res.get("native_finish_reason"):
                    message.response_metadata["native_finish_reason"] = native_finish_reason
            generation_info: dict[str, Any] = {
                "finish_reason": res.get("finish_reason"),
            }
            if "logprobs" in res:
                generation_info["logprobs"] = res["logprobs"]
            gen = ChatGeneration(
                message=message,
                generation_info=generation_info,
            )
            generations.append(gen)

        all_extras: list[dict[str, Any]] = []
        for choice in choices:
            if isinstance(choice, Mapping):
                all_extras.extend(_wire_extras(response, event_seq=0, choice=choice))
        _warn_unknown_paths(all_extras)

        llm_output: dict[str, Any] = {
            "model_name": response_model or self.model_name,
        }
        if response_id:
            llm_output["id"] = response_id
        if created := response.get("created"):
            llm_output["created"] = int(created)
        if object_ := response.get("object"):
            llm_output["object"] = object_
        return ChatResult(generations=generations, llm_output=llm_output)

    def bind_tools(
        self,
        tools: Sequence[dict[str, Any] | type[BaseModel] | Callable | BaseTool],
        *,
        tool_choice: dict | str | bool | None = None,
        strict: bool | None = None,
        parallel_tool_calls: bool | None = None,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, AIMessage]:
        """Bind tool-like objects to this chat model.

        Args:
            tools: A list of tool definitions to bind to this chat model.

                Supports any tool definition handled by
                `langchain_core.utils.function_calling.convert_to_openai_tool`.
            tool_choice: Which tool to require the model to call.
            strict: If `True`, model output is guaranteed to exactly match the
                JSON Schema provided in the tool definition.

                If `None`, the `strict` argument will not be passed to
                the model.
            parallel_tool_calls: Set to `False` to disable parallel tool use.
                Defaults to `None` (no specification, which allows parallel
                tool use).
            **kwargs: Any additional parameters.
        """
        if parallel_tool_calls is not None:
            kwargs["parallel_tool_calls"] = parallel_tool_calls
        formatted_tools = [convert_to_openai_tool(tool, strict=strict) for tool in tools]
        if tool_choice is not None and tool_choice:
            if tool_choice == "any":
                tool_choice = "required"
            if isinstance(tool_choice, str) and (tool_choice not in ("auto", "none", "required")):
                tool_choice = {"type": "function", "function": {"name": tool_choice}}
            if isinstance(tool_choice, bool):
                if len(tools) > 1:
                    msg = f"tool_choice can only be True when there is one tool. Received {len(tools)} tools."
                    raise ValueError(msg)
                tool_name = formatted_tools[0]["function"]["name"]
                tool_choice = {
                    "type": "function",
                    "function": {"name": tool_name},
                }
            kwargs["tool_choice"] = tool_choice
        return super().bind(tools=formatted_tools, **kwargs)

    def with_structured_output(
        self,
        schema: dict | type[BaseModel] | None = None,
        *,
        method: Literal["function_calling", "json_schema", "json_mode"] = "function_calling",
        include_raw: bool = False,
        strict: bool | None = None,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, dict | BaseModel]:
        """Model wrapper that returns outputs formatted to match the given schema.

        Args:
            schema: The output schema as a Pydantic class, TypedDict, JSON Schema,
                or OpenAI function schema.
            method: The method for steering model generation. `"json_mode"` is accepted as a
                deprecated spelling of `"json_schema"`: it warns and is treated as the
                latter.
            include_raw: If `True` then both the raw model response and the
                parsed model response will be returned.
            strict: If `True`, model output is guaranteed to exactly match the
                JSON Schema provided in the schema definition.

                If `None`, the `strict` argument will not be passed to
                the model.
            **kwargs: Any additional parameters.

        Returns:
            A `Runnable` that takes same inputs as a `BaseChatModel`.
        """
        # The legacy "json_mode" spelling is accepted and immediately re-pointed at
        # "json_schema", which is what upstream already did — the declared Literal simply did
        # not say so, leaving a live, tested branch that the type checker read as dead.
        if method == "json_mode":
            warnings.warn(
                "Unrecognized structured output method 'json_mode'. Defaulting to 'json_schema' method.",
                stacklevel=2,
            )
            method = "json_schema"
        is_pydantic_schema = _is_pydantic_class(schema)
        if method == "function_calling":
            if schema is None:
                msg = "schema must be specified when method is 'function_calling'. Received None."
                raise ValueError(msg)
            formatted_tool = convert_to_openai_tool(schema)
            tool_name = formatted_tool["function"]["name"]
            llm = self.bind_tools(
                [schema],
                tool_choice=tool_name,
                strict=strict,
                ls_structured_output_format={
                    "kwargs": {"method": "function_calling", "strict": strict},
                    "schema": formatted_tool,
                },
                **kwargs,
            )
            if is_pydantic_schema:
                output_parser: OutputParserLike = PydanticToolsParser(
                    # `is_pydantic_schema` already proved `schema` is a BaseModel subclass,
                    # but the proof was stored in a bool, so the narrowing does not reach here.
                    tools=[schema],  # pyright: ignore[reportArgumentType]
                    first_tool_only=True,
                )
            else:
                output_parser = JsonOutputKeyToolsParser(key_name=tool_name, first_tool_only=True)
        elif method == "json_schema":
            if schema is None:
                msg = "schema must be specified when method is 'json_schema'. Received None."
                raise ValueError(msg)
            json_schema = convert_to_json_schema(schema)
            schema_name = json_schema.get("title", "")
            json_schema_spec: dict[str, Any] = {
                "name": schema_name,
                "schema": json_schema,
            }
            if strict is not None:
                json_schema_spec["strict"] = strict
            response_format = {
                "type": "json_schema",
                "json_schema": json_schema_spec,
            }
            ls_format_info = {
                "kwargs": {"method": "json_schema", "strict": strict},
                "schema": json_schema,
            }
            llm = self.bind(
                response_format=response_format,
                ls_structured_output_format=ls_format_info,
                **kwargs,
            )
            output_parser = (
                PydanticOutputParser(pydantic_object=schema)  # type: ignore[type-var, arg-type]
                if is_pydantic_schema
                else JsonOutputParser()
            )
        else:
            msg = (
                f"Unrecognized method argument. Expected one of 'function_calling' "
                f"or 'json_schema'. Received: '{method}'"
            )
            raise ValueError(msg)

        if include_raw:
            parser_assign = RunnablePassthrough.assign(
                parsed=itemgetter("raw") | output_parser, parsing_error=lambda _: None
            )
            parser_none = RunnablePassthrough.assign(parsed=lambda _: None)
            parser_with_fallback = parser_assign.with_fallbacks([parser_none], exception_key="parsing_error")
            return RunnableMap(raw=llm) | parser_with_fallback
        return llm | output_parser


def _is_pydantic_class(obj: Any) -> bool:
    return isinstance(obj, type) and is_basemodel_subclass(obj)


def _strip_internal_kwargs(params: dict[str, Any]) -> None:
    """Remove LangChain-internal keys that the SDK does not accept."""
    for key in _INTERNAL_KWARGS:
        params.pop(key, None)


#
# Type conversion helpers
#
def _convert_video_block_to_openrouter(block: dict[str, Any]) -> dict[str, Any]:
    """Convert a LangChain video content block to OpenRouter's `video_url` format.

    Args:
        block: A LangChain `VideoContentBlock`.

    Returns:
        A dict in OpenRouter's `video_url` format.

    Raises:
        ValueError: If no video source is provided.
    """
    if "url" in block:
        return {"type": "video_url", "video_url": {"url": block["url"]}}
    if "base64" in block or block.get("source_type") == "base64":
        base64_data = block["data"] if "source_type" in block else block["base64"]
        mime_type = block.get("mime_type", "video/mp4")
        return {
            "type": "video_url",
            "video_url": {"url": f"data:{mime_type};base64,{base64_data}"},
        }
    msg = "Video block must have either 'url' or 'base64' data."
    raise ValueError(msg)


def _convert_file_block_to_openrouter(block: dict[str, Any]) -> dict[str, Any]:
    """Convert a LangChain file content block to OpenRouter's `file` format.

    OpenRouter accepts files as::

        {"type": "file", "file": {"filename": "...", "file_data": "..."}}

    where `file_data` is either a public URL or a `data:` URI.

    Args:
        block: A LangChain file content block.

    Returns:
        A dict in OpenRouter's `file` format.

    Raises:
        ValueError: If the block contains neither a URL, base64 data, nor a
            file ID.
    """
    file: dict[str, str] = {}

    # --- resolve file_data ---------------------------------------------------
    if "url" in block:
        file["file_data"] = block["url"]
    elif block.get("source_type") == "base64" or "base64" in block:
        base64_data = block["data"] if "source_type" in block else block["base64"]
        mime_type = block.get("mime_type", "application/octet-stream")
        file["file_data"] = f"data:{mime_type};base64,{base64_data}"
    elif block.get("source_type") == "id" or "file_id" in block:
        msg = "OpenRouter does not support file IDs."
        raise ValueError(msg)
    else:
        msg = "File block must have either 'url' or 'base64' data."
        raise ValueError(msg)

    # --- resolve filename ----------------------------------------------------
    if filename := block.get("filename"):
        file["filename"] = filename
    elif ((extras := block.get("extras")) and "filename" in extras) or (
        (extras := block.get("metadata")) and "filename" in extras
    ):
        file["filename"] = extras["filename"]

    return {"type": "file", "file": file}


def _format_message_content(content: Any) -> Any:
    """Format message content for OpenRouter API.

    Converts LangChain data content blocks to the expected format.

    Args:
        content: The message content (string or list of content blocks).

    Returns:
        Formatted content suitable for the OpenRouter API.
    """
    if content and isinstance(content, list):
        formatted: list = []
        for block in content:
            if isinstance(block, dict) and is_data_content_block(block):
                if block.get("type") == "video":
                    formatted.append(_convert_video_block_to_openrouter(block))
                elif block.get("type") == "file":
                    formatted.append(_convert_file_block_to_openrouter(block))
                elif block.get("type") == "audio":
                    formatted.append(_convert_audio_block_to_openrouter(block))
                else:
                    formatted.append(convert_to_openai_data_block(block))
            else:
                formatted.append(block)
        return formatted
    return content


def _convert_audio_block_to_openrouter(block: dict[str, Any]) -> dict[str, Any]:
    """Preserve an explicitly verified audio format for a subsequent chat turn.

    LangChain's generic converter derives the format from ``mime_type``. Native P0 audio
    intentionally says ``audio/pcm`` *and* ``pcm16``: the former identifies media while the
    latter is the exact reversible request format, so dropping it would change the bytes'
    interpretation on the next turn.
    """
    base64_data = block.get("data") if block.get("source_type") == "base64" else block.get("base64")
    if not isinstance(base64_data, str) or not base64_data:
        raise ValueError("Audio block must have non-empty base64 data.")
    try:
        decoded_size = strict_base64_size(base64_data, "audio")
    except NativeMediaProtocolError as error:
        raise ValueError("Audio block must contain strict base64 data.") from error
    if not decoded_size:
        raise ValueError("Audio block must have non-empty base64 data.")
    mime_type = block.get("mime_type")
    mime_to_format = {
        "audio/pcm": "pcm16",
        "audio/wav": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/flac": "flac",
        "audio/ogg": "ogg",
    }
    format_name = block.get("format")
    if format_name is None:
        format_name = mime_to_format.get(mime_type) if isinstance(mime_type, str) else None
    if not isinstance(format_name, str) or format_name not in set(mime_to_format.values()):
        raise ValueError(f"Audio block format {format_name!r} is unsupported.")
    accepted_mime_types = {mime for mime, supported_format in mime_to_format.items() if supported_format == format_name}
    if mime_type is not None and mime_type not in accepted_mime_types:
        raise ValueError("Audio block MIME type conflicts with its explicit format.")
    return {"type": "input_audio", "input_audio": {"data": base64_data, "format": format_name}}


def _format_assistant_message_content(message: AIMessage) -> Any:
    """Format assistant content without replaying canonical reasoning details twice.

    Details-only streaming publishes a standard reasoning block for live delivery;
    the final assistant message also carries the canonical provider detail records.
    On a subsequent request the canonical records are authoritative, so that
    structurally standard live view is omitted rather than re-sent beside them.
    """
    content = message.content
    if isinstance(content, list):
        has_canonical_details = bool(message.additional_kwargs.get("reasoning_details"))
        sanitized_content: list[Any] = []
        for block in content:
            if not isinstance(block, Mapping) or _CANONICAL_REASONING_LIVE_VIEW_KEY not in block:
                sanitized_content.append(block)
                continue
            clean_block = {key: value for key, value in block.items() if key != _CANONICAL_REASONING_LIVE_VIEW_KEY}
            if not has_canonical_details:
                sanitized_content.append(clean_block)
        content = sanitized_content
    return _format_message_content(content)


def _merge_reasoning_run(run: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge a run of consecutive same-`(type, index)` reasoning fragments."""
    merged_entry: dict[str, Any] = {}
    text_parts: list[str] = []
    has_text = False
    for frag in run:
        for k, v in frag.items():
            if k == "text":
                has_text = True
                if v:
                    text_parts.append(v)
            elif v is not None:
                merged_entry[k] = v
    if has_text:
        merged_entry["text"] = "".join(text_parts)
    return merged_entry


def _strip_ephemeral_reasoning_ids(value: Any) -> Any:
    """Remove OpenAI Responses reasoning item IDs from outbound payloads."""
    if isinstance(value, list):
        return [_strip_ephemeral_reasoning_ids(item) for item in value]
    if isinstance(value, dict):
        return {
            key: _strip_ephemeral_reasoning_ids(item)
            for key, item in value.items()
            if not (key == "id" and isinstance(item, str) and item.startswith("rs_"))
        }
    return value


def _merge_reasoning_details(
    details: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge fragmented `reasoning_details` from streaming chunk concatenation.

    During streaming, `AIMessageChunk.__add__` list-concatenates
    `reasoning_details` in `additional_kwargs`, fragmenting a single entry
    into many. When serialized back to the API via
    `_convert_message_to_dict`, these fragments cause
    `BadRequestResponseError` on multi-turn conversations (the provider
    rejects the malformed thinking block with `Invalid signature`).

    Streaming deltas tag each fragment with the `index` of the entry it
    belongs to in the original (non-streamed) array, so this function groups
    consecutive entries by `(type, index)` and merges each group into one.
    Entries without an `index` are preserved as-is, since non-streaming
    responses can legitimately contain multiple entries.

    Within a merged group, `text` values are concatenated in order. Other
    metadata fields (e.g. `format`, `signature`) use last-non-`None`-wins
    semantics, which preserves stable provider metadata without concatenating
    repeated strings — Anthropic-style reasoning streams emit a single
    signature-bearing fragment at the end of the block.

    A list with zero or one items passes through unchanged.
    """
    if not isinstance(details, list) or len(details) <= 1:
        return details

    merged: list[dict[str, Any]] = []
    i = 0
    while i < len(details):
        entry = details[i]
        if not isinstance(entry, dict) or entry.get("index") is None:
            merged.append(entry)
            i += 1
            continue
        entry_type = entry.get("type", "")
        entry_index = entry["index"]
        run = [entry]
        i += 1
        while i < len(details):
            next_entry = details[i]
            if (
                isinstance(next_entry, dict)
                and next_entry.get("type", "") == entry_type
                and next_entry.get("index") == entry_index
            ):
                run.append(next_entry)
                i += 1
            else:
                break
        merged.append(entry if len(run) == 1 else _merge_reasoning_run(run))
    return merged


def _reduce_stream_reasoning_details(details: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse indexed stream fragments before LangChain can merge their metadata.

    This reduction applies only to one response's observed stream. Outbound messages still
    retain the conservative consecutive-run semantics in ``_merge_reasoning_details``.
    """
    grouped: dict[tuple[object, object], list[dict[str, Any]]] = {}
    order: list[tuple[str, object]] = []
    for detail in details:
        if detail.get("index") is None:
            order.append(("standalone", detail))
            continue
        key = (detail.get("type", ""), detail["index"])
        if key not in grouped:
            grouped[key] = []
            order.append(("indexed", key))
        grouped[key].append(detail)
    reduced: list[dict[str, Any]] = []
    for kind, value in order:
        if kind == "standalone":
            reduced.append(cast("dict[str, Any]", value))
            continue
        run = grouped[cast("tuple[object, object]", value)]
        reduced.append(run[0] if len(run) == 1 else _merge_reasoning_run(run))
    return reduced


def _convert_message_to_dict(message: BaseMessage) -> dict[str, Any]:
    """Convert a LangChain message to an OpenRouter-compatible dict payload.

    Handles role mapping, multimodal content formatting, tool call
    serialization, and reasoning content preservation for multi-turn
    conversations.

    Args:
        message: The LangChain message.

    Returns:
        A dict suitable for the OpenRouter chat API `messages` parameter.
    """
    message_dict: dict[str, Any]
    if isinstance(message, ChatMessage):
        message_dict = {"role": message.role, "content": message.content}
    elif isinstance(message, HumanMessage):
        message_dict = {
            "role": "user",
            "content": _format_message_content(message.content),
        }
    elif isinstance(message, AIMessage):
        message_dict = {"role": "assistant", "content": _format_assistant_message_content(message)}
        if message.tool_calls or message.invalid_tool_calls:
            message_dict["tool_calls"] = [_lc_tool_call_to_openrouter_tool_call(tc) for tc in message.tool_calls] + [
                _lc_invalid_tool_call_to_openrouter_tool_call(tc) for tc in message.invalid_tool_calls
            ]
            if message_dict["content"] == "" or (
                isinstance(message_dict["content"], list) and not message_dict["content"]
            ):
                message_dict["content"] = None
        elif "tool_calls" in message.additional_kwargs:
            message_dict["tool_calls"] = message.additional_kwargs["tool_calls"]
            if message_dict["content"] == "" or (
                isinstance(message_dict["content"], list) and not message_dict["content"]
            ):
                message_dict["content"] = None
        # Preserve reasoning content for multi-turn conversations (e.g.
        # tool-calling loops). OpenRouter stores reasoning text in `reasoning`
        # and structured fragment details in `reasoning_details`; the latter
        # is merged before serialization to undo streaming fragmentation.
        if "reasoning_content" in message.additional_kwargs:
            message_dict["reasoning"] = message.additional_kwargs["reasoning_content"]
        if "reasoning_details" in message.additional_kwargs:
            message_dict["reasoning_details"] = _strip_ephemeral_reasoning_ids(
                _merge_reasoning_details(message.additional_kwargs["reasoning_details"])
            )
    elif isinstance(message, SystemMessage):
        message_dict = {"role": "system", "content": message.content}
    elif isinstance(message, ToolMessage):
        message_dict = {
            "role": "tool",
            "content": message.content,
            "tool_call_id": message.tool_call_id,
        }
    else:
        msg = f"Got unknown type {message}"
        raise TypeError(msg)
    if "name" in message.additional_kwargs:
        message_dict["name"] = message.additional_kwargs["name"]
    return message_dict


def _convert_dict_to_message(_dict: Mapping[str, Any]) -> BaseMessage:
    """Convert an OpenRouter API response message dict to a LangChain message.

    Extracts tool calls, reasoning content, and maps roles to the appropriate
    LangChain message type (`HumanMessage`, `AIMessage`, `SystemMessage`,
    `ToolMessage`, or `ChatMessage`).

    Args:
        _dict: The message dictionary from the API response.

    Returns:
        The corresponding LangChain message.
    """
    id_ = _dict.get("id")
    role = _dict.get("role")
    if role == "user":
        return HumanMessage(content=_dict.get("content", ""))
    if role == "assistant":
        content = _dict.get("content", "") or ""
        additional_kwargs: dict = {}
        if reasoning := _dict.get("reasoning"):
            additional_kwargs["reasoning_content"] = reasoning
        if reasoning_details := _dict.get("reasoning_details"):
            additional_kwargs["reasoning_details"] = reasoning_details
        _copy_response_message_facts(_dict, additional_kwargs)
        tool_calls = []
        invalid_tool_calls = []
        if raw_tool_calls := _dict.get("tool_calls"):
            for raw_tool_call in raw_tool_calls:
                try:
                    tool_calls.append(parse_tool_call(raw_tool_call, return_id=True))
                except Exception as e:
                    invalid_tool_calls.append(make_invalid_tool_call(raw_tool_call, str(e)))
        return AIMessage(
            content=content,
            id=id_,
            additional_kwargs=additional_kwargs,
            tool_calls=tool_calls,
            invalid_tool_calls=invalid_tool_calls,
            response_metadata={"model_provider": "openrouter"},
        )
    if role == "system":
        return SystemMessage(content=_dict.get("content", ""))
    if role == "tool":
        additional_kwargs = {}
        if "name" in _dict:
            additional_kwargs["name"] = _dict["name"]
        return ToolMessage(
            content=_dict.get("content", ""),
            tool_call_id=_dict.get("tool_call_id"),
            additional_kwargs=additional_kwargs,
        )
    if role is None:
        msg = f"OpenRouter response message is missing the 'role' field. Message keys: {list(_dict.keys())}"
        raise ValueError(msg)
    warnings.warn(
        f"Unrecognized message role '{role}' from OpenRouter. Falling back to ChatMessage.",
        stacklevel=2,
    )
    return ChatMessage(content=_dict.get("content", ""), role=role)


def _convert_chunk_to_message_chunk(
    chunk: Mapping[str, Any],
    default_class: type[BaseMessageChunk],
    *,
    media: NativeMediaAssembler | None = None,
    include_reasoning_details: bool = True,
    include_usage: bool = True,
) -> BaseMessageChunk:
    """Convert a streaming chunk dict to a LangChain message chunk.

    Args:
        chunk: The streaming chunk dictionary.
        default_class: Default message chunk class.

    Returns:
        The LangChain message chunk.
    """
    choice = chunk["choices"][0]
    _dict = choice.get("delta", {})
    role = cast("str", _dict.get("role"))
    content = cast("str | list[str | dict[Any, Any]]", _dict.get("content") or "")
    additional_kwargs: dict = {}
    tool_call_chunks: list = []

    if raw_tool_calls := _dict.get("tool_calls"):
        for rtc in raw_tool_calls:
            try:
                tool_call_chunks.append(
                    tool_call_chunk(
                        name=rtc["function"].get("name"),
                        args=rtc["function"].get("arguments"),
                        id=rtc.get("id"),
                        index=rtc["index"],
                    )
                )
            except (KeyError, TypeError, AttributeError):
                warnings.warn(
                    f"Skipping malformed tool call chunk during streaming: unexpected structure in {rtc!r}.",
                    stacklevel=2,
                )

    if role == "user" or default_class == HumanMessageChunk:
        return HumanMessageChunk(content=content)
    if role == "assistant" or default_class == AIMessageChunk:
        content = _stream_content_with_native_media(_dict, content, media)
        if reasoning := _dict.get("reasoning"):
            additional_kwargs["reasoning_content"] = reasoning
        if include_reasoning_details and (reasoning_details := _dict.get("reasoning_details")):
            additional_kwargs["reasoning_details"] = reasoning_details
        _copy_response_message_facts(_dict, additional_kwargs)
        usage_metadata = None
        response_metadata: dict[str, Any] = {"model_provider": "openrouter"}
        if include_usage and (usage := chunk.get("usage")):
            usage_metadata = _create_usage_metadata(usage)
            # Surface OpenRouter cost data in response_metadata
            if "cost" in usage:
                response_metadata["cost"] = usage["cost"]
            if "cost_details" in usage:
                response_metadata["cost_details"] = usage["cost_details"]
        return AIMessageChunk(
            content=content,
            additional_kwargs=additional_kwargs,
            tool_call_chunks=tool_call_chunks,
            usage_metadata=usage_metadata,
            response_metadata=response_metadata,
        )
    if role == "system" or default_class == SystemMessageChunk:
        return SystemMessageChunk(content=content)
    if role == "tool" or default_class == ToolMessageChunk:
        return ToolMessageChunk(content=content, tool_call_id=_dict.get("tool_call_id", ""))
    if role:
        warnings.warn(
            f"Unrecognized streaming chunk role '{role}' from OpenRouter. Falling back to ChatMessageChunk.",
            stacklevel=2,
        )
        return ChatMessageChunk(content=content, role=role)
    if default_class is ChatMessageChunk:
        return ChatMessageChunk(content=content, role=role or "")
    return default_class(content=content)  # type: ignore[call-arg]


def _stream_content_with_native_media(
    delta: Mapping[str, Any], content: str | list[str | dict[Any, Any]], media: NativeMediaAssembler | None
) -> str | list[str | dict[Any, Any]]:
    """Queue media-aware content for the one response-local publication timeline."""
    if media is None or not NativeMediaAssembler.handles(delta, audio_started=media.has_audio):
        return content
    media.consume(delta)
    return ""


def _copy_response_message_facts(source: Mapping[str, Any], destination: dict[str, Any]) -> None:
    """Preserve provider refusal and annotation facts in LangChain metadata."""
    for field_name in ("annotations", "refusal"):
        if field_name in source:
            destination[field_name] = source[field_name]


def _lc_tool_call_to_openrouter_tool_call(tool_call: ToolCall) -> dict[str, Any]:
    """Convert a LangChain `ToolCall` to an OpenRouter tool call dict.

    Serializes `args` (a dict) via `json.dumps`.
    """
    return {
        "type": "function",
        "id": tool_call["id"],
        "function": {
            "name": tool_call["name"],
            "arguments": json.dumps(tool_call["args"], ensure_ascii=False),
        },
    }


def _lc_invalid_tool_call_to_openrouter_tool_call(
    invalid_tool_call: InvalidToolCall,
) -> dict[str, Any]:
    """Convert a LangChain `InvalidToolCall` to an OpenRouter tool call dict.

    Unlike the valid variant, `args` is already a raw string (not a dict) and
    is passed through as-is.
    """
    return {
        "type": "function",
        "id": invalid_tool_call["id"],
        "function": {
            "name": invalid_tool_call["name"],
            "arguments": invalid_tool_call["args"],
        },
    }


def _create_usage_metadata(token_usage: Mapping[str, Any]) -> UsageMetadata | None:
    """Create usage metadata from OpenRouter token usage response.

    OpenRouter may return token counts as floats rather than ints, so complete
    snapshots are explicitly cast to int. A partial accounting shape cannot be
    represented by LangChain's required three-count metadata without inventing
    provider facts, so it remains absent while raw provider details stay available.

    Args:
        token_usage: Token usage dict from the API response.

    Returns:
        Complete usage metadata, or ``None`` for a partial provider snapshot.
    """
    raw_input = token_usage.get("prompt_tokens", token_usage.get("input_tokens"))
    raw_output = token_usage.get("completion_tokens", token_usage.get("output_tokens"))
    raw_total = token_usage.get("total_tokens")
    if raw_input is None or raw_output is None or raw_total is None:
        return None
    input_tokens = int(raw_input)
    output_tokens = int(raw_output)
    total_tokens = int(raw_total)

    input_details_dict = token_usage.get("prompt_tokens_details") or token_usage.get("input_tokens_details") or {}
    output_details_dict = token_usage.get("completion_tokens_details") or token_usage.get("output_tokens_details") or {}

    cache_read = input_details_dict.get("cached_tokens")
    cache_creation = input_details_dict.get("cache_write_tokens")
    input_token_details: dict = {
        "cache_read": int(cache_read) if cache_read is not None else None,
        "cache_creation": int(cache_creation) if cache_creation is not None else None,
    }
    reasoning_tokens = output_details_dict.get("reasoning_tokens")
    output_token_details: dict = {
        "reasoning": int(reasoning_tokens) if reasoning_tokens is not None else None,
    }
    usage_metadata: UsageMetadata = {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }

    filtered_input = {k: v for k, v in input_token_details.items() if v is not None}
    if filtered_input:
        usage_metadata["input_token_details"] = InputTokenDetails(**filtered_input)
    filtered_output = {k: v for k, v in output_token_details.items() if v is not None}
    if filtered_output:
        usage_metadata["output_token_details"] = OutputTokenDetails(**filtered_output)
    return usage_metadata
