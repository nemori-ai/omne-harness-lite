> 本版 v9 示例继承 v7 的反例目的。下列完整快照中的项目 cap 与显式 unknown 都是本例预设事实，不是运行时默认值，也不是允许为旧记录回填的迁移规则。

# 规范实例：合法与非法

属于 `data.model-response` v9。它是**本版的规范工件之一**，不是说明材料：
[`model-response.schema.json`](../../schema/model-response.schema.json) 的每一条收场规则在这里各有正反实例，非法的一律注明**给哪个拒绝值、被哪一条挡住**。

**怎么读**：第一、二节的每个 JSON 块都是一条完整的响应体，**校验对象是根模式**（即 `$defs/ModelResponse`）；
块前一行写「预期」——`通过`，或 `拒绝：<拒绝值>`（拒绝值按 [S-27](../../SPEC.md) 的次序取第一条被违反的）。
**这个格式也是机检格式**：把每个块喂给 Draft 2020-12 校验器、拿「预期」比对，不另抄一份清单。第三节不参与机检，第四节是手算；第六节继承 v4 的增量块及其 Schema／纯判定预期，第七节增加 v5 多值响应头的完整实例与行为反例。前六节的实例值保持 v4 原值。

**三条读法上的边界：**

- **`通过` 只说形状合规。**[S-26](../../SPEC.md) 列的那些 Schema 管不到的条款，一条也不因通过而成立；第三节专门列它们的反例。
- **嵌在实例里的外部形状取各自的家**：`AssistantMessage`（`data.messages`）、`ContentBlock` 与 `AttachmentRef`（`data.content-blocks`）、
  `Usage`、`Cost`、`TrimSummary` 与 `RunId`、`AttemptId`、`ModelCallId`（`data.call-accounts`）、`ModelProfileRef`、`ModelProfileSnapshot`、`ModelAdaptationBinding`、`ProviderName` 与 `ModelRequestParameters`（`data.model-profile`）、`ScopeLayerIdentity`（`data.identity-values`）、`FailureCause`（`data.loop-extension`）。
  每一轮修订按它们当时的 Schema 把本页每个实例过一遍（[验证入口](../../SPEC.md)）。
  **档案快照按路由名各取一份**，它的「允许的供应商」把这一块第一次发出走的那一家排在第一——**每一次调用的第一次发出走第一家**（[S-9](../../SPEC.md)）；各份快照的其余成员为了短取同样的值。
- **标识串、供应商名、路由名只是占位**，不要从 `resp_`、`gen-` 这样的前缀推出任何规则（[S-6](../../SPEC.md)）。

## 一、合法实例

### E-1 正常收尾

预期：`通过`。依据 [S-13](../../SPEC.md) 第一行：有 `reply`、`ending = complete`、`replyDisposition = persisted`、有 `firstTokenAt`、没有 `failure`。
`selectedBy = session`：有效模型就是会话选中的那条（[S-10](../../SPEC.md)）。`raw` 两项都在（[S-20](../../SPEC.md)）。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-2 写到上限截断

预期：`通过`。依据 [S-13](../../SPEC.md) 第二行：`ending = truncated_at_limit`，**没长完的工具调用也在 `reply` 里、两位皆假**。
`selectedBy = layer_lock`：组织在上层锁死了这条（[S-10](../../SPEC.md)）。
要求的那一组是 `{ seed: 42, maxOutputTokens: 256 }`，传输适配认不得 `seed`：**`parameters` 只记实际发出的 `maxOutputTokens`**，`droppedParameters` 列出 `seed`（[S-11](../../SPEC.md)）。

```json
{
  "id": "resp_7d20b4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1a08"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "openai/gpt-5-mini",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "openai/gpt-5-mini"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "openai/gpt-5-mini",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "openai",
        "azure"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "openai/gpt-5-mini-2025-08-07",
    "upstreamRequestId": "gen-1758621700-d4e5f6",
    "parameters": {
      "maxOutputTokens": 256
    },
    "droppedParameters": [
      "seed"
    ]
  },
  "outcome": "truncated",
  "stopReason": "length",
  "reply": {
    "id": "msg_52",
    "type": "assistant",
    "createdAt": "2026-09-23T10:01:09Z",
    "response": "resp_7d20b4",
    "ending": "truncated_at_limit",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "接下来改 main.rs："
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": false,
          "toModel": false
        },
        "complete": false,
        "rawArguments": "{\"path\": \"src/ma"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:01:00Z",
    "firstTokenAt": "2026-09-23T10:01:00.8Z",
    "endedAt": "2026-09-23T10:01:09Z"
  },
  "usage": {
    "input_tokens": 2210,
    "output_tokens": 256,
    "cache_read_tokens": 0,
    "cache_write_tokens": 2048,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0019,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-3 用户中断，已有内容

预期：`通过`。依据 [S-13](../../SPEC.md) 第三行：`initiator = user`、`ending = interrupted_by_user`，内容是已交付的那部分；它同样过了「消息落盘之前」那一关，`replyDisposition = persisted`；**不带 `failure`**——中断不是故障（[S-12](../../SPEC.md)）。
`selectedBy` 是一件拓展件：调模型之前它以 `select_model` 定了这一次（[S-10](../../SPEC.md)）。
流在交出用量之前就断了，所以用量与费用按「来源 = 无」记 `unknown`（[S-19](../../SPEC.md)）。

```json
{
  "id": "resp_0b3f71",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1c55"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "google/gemini-2.5-flash",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "google/gemini-2.5-flash"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "google/gemini-2.5-flash",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "google-vertex",
        "google-ai-studio"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": {
      "extension": "cheap-first-router"
    },
    "provider": "google-vertex",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "google/gemini-2.5-flash",
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "user",
  "reply": {
    "id": "msg_53",
    "type": "assistant",
    "createdAt": "2026-09-23T10:02:03Z",
    "response": "resp_0b3f71",
    "ending": "interrupted_by_user",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "这个问题可以分三步看。第一步"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:02:00Z",
    "firstTokenAt": "2026-09-23T10:02:01Z",
    "endedAt": "2026-09-23T10:02:03Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-4 用户中断，还没有内容——费用未知

预期：`通过`。依据 [S-13](../../SPEC.md) 最后一行（没开口）：**没有 `reply`、没有 `firstTokenAt`、不带 `failure`**——[不伪造一条空的消息](../../../../../.meta_harness/design/product/PF-009-context-message-types/design.md)，这次只留一笔账。
**这是「费用未知」的那一条**：请求到了上游、上游可能已经开始计费，但没交出用量就被叫停了——记 `unknown`，**不是零**（[S-19](../../SPEC.md)）。
**响应头已经到了，照样不算首 token**（[S-17](../../SPEC.md)）：`raw.headers` 在，`firstTokenAt` 不在。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-5 首 token 之后的故障，上游最后在流里回带内错误 429

预期：`通过`。依据 [S-13](../../SPEC.md)「`failed`，首 token 之后」那一行：**没有 `reply`、有 `delivered`、成因 `interrupted_mid_reply`、有 `firstTokenAt`**。
**上游最后在流里回的是带内错误 `code: 429`（HTTP 状态早已是 200），状态码取它、原样带着并标 `inBand: true`（[S-15](../../SPEC.md)），但成因不因此变成 `upstream_unavailable`**——首 token 已经出来，[无论上游最后返回什么，都归「说到一半断了」](../../../../../.meta_harness/design/product/PF-013-model-profiles-and-invocation/design.md)。
`upstreamError.message` 是**脱敏之后的原样**（[S-21](../../SPEC.md)）。这次调用**不会再有下一次发出**（[S-23](../../SPEC.md)）。

```json
{
  "id": "resp_9a61d2",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1f04"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758622000-77aa01",
    "parameters": {}
  },
  "outcome": "failed",
  "delivered": [
    {
      "id": "b1",
      "kind": "text",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "text": "我先检查一下测试为什么失败，看起来是"
    }
  ],
  "failure": {
    "cause": "interrupted_mid_reply",
    "statusCode": 429,
    "inBand": true,
    "upstreamError": {
      "code": "429",
      "message": "Rate limit exceeded for this provider. Please retry later."
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:04:00Z",
    "firstTokenAt": "2026-09-23T10:04:01.5Z",
    "endedAt": "2026-09-23T10:04:06Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-6 与 E-7 一次调用的两次发出

**同一次调用**（`call` 逐字相同），第一次发出走 `anthropic`、上游 503、首 token 之前失败；重试挂件换一家，第二次走 `amazon-bedrock`、正常收尾。
两条都预期 `通过`。它们一起演示 [S-8](../../SPEC.md)（`dispatch` 1、2，不重不跳）、[S-23](../../SPEC.md)（前一条是策略那一类失败、没有首 token；`reply` 只在最后一条）、
[S-19](../../SPEC.md)（两条各记各的账，两笔钱都在）。

E-6，预期：`通过`。首 token 之前的故障：没有 `firstTokenAt`，成因不是 `interrupted_mid_reply`。**上游没回报模型名**，`upstreamModel` 缺席而不是填路由名（[S-9](../../SPEC.md)）。

```json
{
  "id": "resp_e6a001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758622100-e6e6e6",
    "parameters": {
      "temperature": 0.2
    }
  },
  "outcome": "failed",
  "failure": {
    "cause": "upstream_unavailable",
    "statusCode": 503,
    "upstreamError": {
      "code": "503",
      "message": "Provider returned error",
      "raw": {
        "error": {
          "code": 503,
          "message": "Provider returned error"
        }
      }
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "application/json"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_e6a001",
      "mediaType": "application/json",
      "bytes": 96
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

E-7，预期：`通过`。同一次调用的第二次发出，正常收尾；`reply.response` 指回的是**它自己**的 `id`，不是 E-6 的。

```json
{
  "id": "resp_e7b002",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 2,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758622103-e7e7e7",
    "parameters": {
      "temperature": 0.2
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_60",
    "type": "assistant",
    "createdAt": "2026-09-23T10:05:09Z",
    "response": "resp_e7b002",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "测试失败是因为时区设置，已经定位到那一行。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:05:03Z",
    "firstTokenAt": "2026-09-23T10:05:04Z",
    "endedAt": "2026-09-23T10:05:09Z"
  },
  "usage": {
    "input_tokens": 3120,
    "output_tokens": 480,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0123,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-8 同一个 Run 里前后两次调用，前一次的回复被否决

**两次调用，不是一次调用的两次发出**：`call.callId` 不同（`mc_3a01`、`mc_3a02`），各自的 `dispatch` 都是 1。
前一次的模型回复里有一张图，挂在「消息落盘之前」的转换件给它交不出 transcript，**否决了这份回复**；
这次调用照样以 `complete` 结束，记 `replyDisposition = { vetoed }`，**不带 `failure`**。loop 在下一次迭代**另起一次新的模型调用**，这一次的回复落盘成了消息
（[S-13](../../SPEC.md) 的引注、[S-14](../../SPEC.md)、[S-17](../../SPEC.md)、[S-23](../../SPEC.md) 第 4 条）。
**两笔钱都照实记**：被否决的那一次同样消耗了上游（[S-19](../../SPEC.md)）。

E-8a，预期：`通过`。前一次调用：有首 token、有 `reply`，但 `replyDisposition` 是 `vetoed`——这份回复**没有成为消息**，它带的 `msg_70` 在会话日志里找不到。

```json
{
  "id": "resp_8a0001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_3a01"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "google/gemini-2.5-flash-image",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "google/gemini-2.5-flash-image"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "google/gemini-2.5-flash-image",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "google-vertex",
        "google-ai-studio"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "google-vertex",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "google/gemini-2.5-flash-image",
    "upstreamRequestId": "gen-1758622200-8a8a8a",
    "parameters": {}
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_70",
    "type": "assistant",
    "createdAt": "2026-09-23T10:06:07Z",
    "response": "resp_8a0001",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "这是改好的架构图："
      },
      {
        "id": "b2",
        "kind": "image",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "mediaType": "image/png",
        "data": {
          "storage": "attachments",
          "key": "blk/resp_8a0001/b2",
          "mediaType": "image/png",
          "bytes": 204800
        }
      }
    ]
  },
  "replyDisposition": {
    "vetoed": {
      "by": "image-transcriber",
      "reason": "no transcript produced for image/png"
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:06:00Z",
    "firstTokenAt": "2026-09-23T10:06:01Z",
    "endedAt": "2026-09-23T10:06:07Z"
  },
  "usage": {
    "input_tokens": 1500,
    "output_tokens": 1290,
    "cache_read_tokens": 1024,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0391,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

E-8b，预期：`通过`。loop 另起的**新调用**（`mc_3a02`），它的发出从 `dispatch = 1` 数起；回复落盘成了消息。

```json
{
  "id": "resp_8b0002",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_3a02"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "google/gemini-2.5-flash-image",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "google/gemini-2.5-flash-image"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "google/gemini-2.5-flash-image",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "google-vertex",
        "google-ai-studio"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "google-vertex",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "google/gemini-2.5-flash-image",
    "upstreamRequestId": "gen-1758622210-8b8b8b",
    "parameters": {}
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_71",
    "type": "assistant",
    "createdAt": "2026-09-23T10:06:15Z",
    "response": "resp_8b0002",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "架构图改好了：左侧是入口层，右侧是三个运行时。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:06:10Z",
    "firstTokenAt": "2026-09-23T10:06:11Z",
    "endedAt": "2026-09-23T10:06:15Z"
  },
  "usage": {
    "input_tokens": 1560,
    "output_tokens": 88,
    "cache_read_tokens": 1024,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0012,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-9 压缩摘要的那次调用：不属于任何运行，回复被系统拿去用了

预期：`通过`。**不属于任何运行**：`call` 只有 `callId`，也就没有 `attemptId`（[S-7](../../SPEC.md)、[S-8](../../SPEC.md)）。
回复是压缩要的那份摘要，**本来就不成为消息**：`replyDisposition = { consumed: { by: compaction } }`，账照记（[S-14](../../SPEC.md)）。
**用的是出厂格那一把凭据**：有效模型是一条官方档案（[S-9](../../SPEC.md)）。这条流上合并过 3 个增量，`trims` 如实写出（[S-19](../../SPEC.md)）。

```json
{
  "id": "resp_9c0001",
  "call": {
    "callId": "mc_9c01"
  },
  "dispatch": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "openai/gpt-5-mini",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "official",
      "routeName": "openai/gpt-5-mini"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "openai/gpt-5-mini",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "openai"
      ],
      "allowFallback": false,
      "inputModalities": [
        "text"
      ],
      "outputModalities": [
        "text"
      ],
      "maxInputTokens": 128000,
      "maxOutputTokens": 16000,
      "updatedAt": "2026-09-01T00:00:00Z",
      "inputConstraints": {},
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "credentialScope": {
      "layer": "factory"
    },
    "upstreamModel": "openai/gpt-5-mini-2025-08-07",
    "parameters": {
      "maxOutputTokens": 2000
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_c1",
    "type": "assistant",
    "createdAt": "2026-09-23T10:09:04Z",
    "response": "resp_9c0001",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": false,
          "toModel": true
        },
        "text": "摘要：用户要把配置迁到 TOML，已改完三处，剩测试未跑。"
      }
    ]
  },
  "replyDisposition": {
    "consumed": {
      "by": "compaction"
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:09:00Z",
    "firstTokenAt": "2026-09-23T10:09:01Z",
    "endedAt": "2026-09-23T10:09:04Z"
  },
  "usage": {
    "input_tokens": 9800,
    "output_tokens": 140,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0021,
    "source": "upstream_usage"
  },
  "trims": {
    "merged": 3,
    "cut": 0,
    "omittedBytes": 0,
    "byReason": {
      "rate_merged": 3,
      "frame_too_long": 0,
      "quota_exhausted": 0,
      "rejected": 0
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-10 开了口之后失去连续性：恢复时补写

预期：`通过`。进程在「已开口」写下之后、响应体写下之前停了；下一次尝试的对账补写这一条（`capability.model-request-runtime` v2 S-33）：
`initiator = runtime_lost`、**有首 token**（取自「已开口」那条记录）、**没有回复**，已交付的块在途内容随进程没了、**缺席**，由中断提醒兜底；账全未知（[S-12](../../SPEC.md)、[S-13](../../SPEC.md)）。
这次调用不再发出（[S-23](../../SPEC.md)）。`attemptId` 是**这一次发出出门时所在的那次尝试**（第 2 次），不是补写它的那一次（第 3 次）——它是事实，不是归属；这一条归到哪一组以承载它的条目为准（[S-8](../../SPEC.md)）。
补写时第 2 次尝试已被取代，所以带 **`late: true`**（[S-35](../../SPEC.md)）。`id` 是「已出门」那条记录上定下的那一个，对账沿用它（[S-6](../../SPEC.md)）。

```json
{
  "id": "resp_a10001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_4d10"
  },
  "dispatch": 1,
  "attemptId": 2,
  "late": true,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "runtime_lost",
  "timing": {
    "sentAt": "2026-09-23T10:10:00Z",
    "firstTokenAt": "2026-09-23T10:10:01Z",
    "endedAt": "2026-09-23T10:12:30Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-11 系统取消运行时已经开了口：在途的流被放弃

预期：`通过`。宿主停止（系统发起的运行取消）时这次发出已经开口，在途的流被放弃：`initiator = run_cancelled`、有首 token、**没有回复**，写入者手里还有已交付的块，**就必带在 `delivered`**（[S-13](../../SPEC.md)、[S-14](../../SPEC.md)；`data.messages/v7#S-10` 的回复流对应）。

```json
{
  "id": "resp_a11001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_4d11"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "run_cancelled",
  "delivered": [
    {
      "id": "b1",
      "kind": "text",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "text": "我先把迁移脚本跑一遍，"
    }
  ],
  "timing": {
    "sentAt": "2026-09-23T10:13:00Z",
    "firstTokenAt": "2026-09-23T10:13:01Z",
    "endedAt": "2026-09-23T10:13:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### E-12 传输适配改了两项的值、丢了一项 `extra`

预期：`通过`。要求的那一组是档案参数 `{ reasoningEffort: max, maxOutputTokens: 32000, extra: { top_k: 40 } }`（本次没有覆盖）。这一家的上游**推理强度最高只有 `high`**、**输出上限已降到 16000**（低于档案参数，档案不改，[`data.model-profile/v5#S-18`](../../../model-profile/SPEC.md)），**也不认 `top_k`**：
传输适配把前两项改了值再发出、`top_k` 不发。于是 **`parameters` 记实际发出的两项**，`parameterAdjustments` 记这两项改前改后，`droppedParameters` 记 `extra` 的键 `top_k`（[S-11](../../SPEC.md)）。

```json
{
  "id": "resp_b12001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_5e12"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "vendor-b/reasoner-l",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "tenant",
        "tenant": {
          "organization": "org_7fd2c1",
          "account": "acc_91ab40"
        }
      },
      "routeName": "vendor-b/reasoner-l"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "vendor-b/reasoner-l",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "provider-z"
      ],
      "allowFallback": false,
      "inputModalities": [
        "text"
      ],
      "outputModalities": [
        "text"
      ],
      "maxInputTokens": 128000,
      "maxOutputTokens": 64000,
      "parameters": {
        "reasoningEffort": "max",
        "maxOutputTokens": 32000,
        "extra": {
          "top_k": 40
        }
      },
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {},
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "provider-z",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "vendor-b/reasoner-l-2026-08",
    "upstreamRequestId": "gen-1758623000-b12b12",
    "parameters": {
      "reasoningEffort": "high",
      "maxOutputTokens": 16000
    },
    "parameterAdjustments": [
      {
        "name": "reasoningEffort",
        "requested": "max",
        "sent": "high"
      },
      {
        "name": "maxOutputTokens",
        "requested": 32000,
        "sent": 16000
      }
    ],
    "droppedParameters": [
      "top_k"
    ]
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_80",
    "type": "assistant",
    "createdAt": "2026-09-23T10:20:09Z",
    "response": "resp_b12001",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "三种方案里第二种最省：只改一处索引。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:20:00Z",
    "firstTokenAt": "2026-09-23T10:20:03Z",
    "endedAt": "2026-09-23T10:20:09Z"
  },
  "usage": {
    "input_tokens": 5200,
    "output_tokens": 610,
    "cache_read_tokens": 4096,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0087,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

- **还原要求的那一组**：`parameters` 里把两项换回 `requested`，再加上 `top_k`（它要求的值 40 从档案快照 `parameters.extra` 取）——正是档案参数（[S-11](../../SPEC.md) 约束 4）。
- **`maxOutputTokens` 改值是 [`data.model-profile/v5#S-21`](../../../model-profile/SPEC.md) 的固定情形**：上游收紧到档案参数之下，发出时改成收得下的值并记下实际发出的值。

## 二、非法实例：每个拒绝值至少一个

下面各块都以第一节的某个正例为底，**块前写明是哪一个、改了什么**。为了短，各块在底例上还可以做几处**本身合法**的删减：
`route` 只留必需成员、其中 `parameters` 写成 `{}`；`raw`、`stopReason`、`failure.upstreamError`、`trims` 省去；回复与已交付块的文字缩短。
**除这几处之外，块前写的就是全部改动。**
**每个块按 [S-27](../../SPEC.md) 的次序，第一条被违反的就是块前写的那一个**
（个别块同时违反排在后面的规则，例如 R-7 也缺 `delivered`，那不改变它给出的拒绝值）。

### R-1 `malformed`：缺必需成员

在 E-6 上删掉 `usage`。**缺席不是「没有用量」**——拿不到要写 `unknown`（[S-19](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r1",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "failure": {
    "cause": "upstream_unavailable",
    "statusCode": 503
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-2 `malformed`：「一项也没丢」写成了空数组

在 E-6 上加 `"droppedParameters": []`。「一项也没丢」只有一种写法——缺席（[S-11](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r2",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {},
    "droppedParameters": []
  },
  "outcome": "failed",
  "failure": {
    "cause": "upstream_unavailable",
    "statusCode": 503
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-3 `outcome_unknown`

在 E-7 上把 `outcome` 改成 `"success"`。收场四值闭合，不做「最接近」映射（[S-12](../../SPEC.md)）。预期：`拒绝：outcome_unknown`。

```json
{
  "id": "resp_r3",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 2,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "success",
  "reply": {
    "id": "msg_60",
    "type": "assistant",
    "createdAt": "2026-09-23T10:05:09Z",
    "response": "resp_r3",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "好的。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:05:03Z",
    "firstTokenAt": "2026-09-23T10:05:04Z",
    "endedAt": "2026-09-23T10:05:09Z"
  },
  "usage": {
    "input_tokens": 3120,
    "output_tokens": 480,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0123,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-4 `dispatch_zero`

在 E-6 上把 `dispatch` 改成 `0`。第几次发出从 1 起（[S-8](../../SPEC.md)）。预期：`拒绝：dispatch_zero`。

```json
{
  "id": "resp_r4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 0,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "failure": {
    "cause": "upstream_unavailable",
    "statusCode": 503
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-5 `cause_unknown`

在 E-6 上把成因改成 `"rate_limited"`。**「被限流」已经并进「上游这会儿给不出回复」**，差在哪由状态码说（[PF-013 §5.7 为什么是八个取值](../../../../../.meta_harness/design/product/PF-013-model-profiles-and-invocation/design.md)、[S-15](../../SPEC.md)）。预期：`拒绝：cause_unknown`。

```json
{
  "id": "resp_r5",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "failure": {
    "cause": "rate_limited",
    "statusCode": 429
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-6 `reply_missing`

在 E-7 上删掉 `reply`，同时删掉 `firstTokenAt`（否则还会撞上别的规则，这里只演示这一条）。`complete` 必带回复（[S-13](../../SPEC.md)）。预期：`拒绝：reply_missing`。

```json
{
  "id": "resp_r6",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 2,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "complete",
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:05:03Z",
    "endedAt": "2026-09-23T10:05:09Z"
  },
  "usage": {
    "input_tokens": 3120,
    "output_tokens": 480,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0123,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-7 `reply_on_failure`

在 E-5 上把 `delivered` 换成一条 `reply`。**故障断的不成为消息**（[S-13](../../SPEC.md)、[PF-009 §5.6](../../../../../.meta_harness/design/product/PF-009-context-message-types/design.md)）。预期：`拒绝：reply_on_failure`。

```json
{
  "id": "resp_r7",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1f04"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "reply": {
    "id": "msg_61",
    "type": "assistant",
    "createdAt": "2026-09-23T10:04:06Z",
    "response": "resp_r7",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "我先检查一下测试为什么失败，看起来是"
      }
    ]
  },
  "failure": {
    "cause": "interrupted_mid_reply",
    "statusCode": 429,
    "inBand": true
  },
  "timing": {
    "sentAt": "2026-09-23T10:04:00Z",
    "firstTokenAt": "2026-09-23T10:04:01.5Z",
    "endedAt": "2026-09-23T10:04:06Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-8 `reply_and_delivered`

在 E-3 上再加一份 `delivered`。**已交付的内容要么成了消息，要么记在账里，不能两处都放**（[S-14](../../SPEC.md)）。预期：`拒绝：reply_and_delivered`。

```json
{
  "id": "resp_r8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1c55"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "google/gemini-2.5-flash",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "google/gemini-2.5-flash"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "google/gemini-2.5-flash",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "google-vertex",
        "google-ai-studio"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": {
      "extension": "cheap-first-router"
    },
    "provider": "google-vertex",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "user",
  "reply": {
    "id": "msg_53",
    "type": "assistant",
    "createdAt": "2026-09-23T10:02:03Z",
    "response": "resp_r8",
    "ending": "interrupted_by_user",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "这个问题可以分三步看。第一步"
      }
    ]
  },
  "replyDisposition": "persisted",
  "delivered": [
    {
      "id": "b1",
      "kind": "text",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "text": "这个问题可以分三步看。第一步"
    }
  ],
  "timing": {
    "sentAt": "2026-09-23T10:02:00Z",
    "firstTokenAt": "2026-09-23T10:02:01Z",
    "endedAt": "2026-09-23T10:02:03Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-9 `failure_missing`

在 E-6 上删掉 `failure`。**故障必带成因**；缺了不等于「没认出来」——那要写 `unrecognized`（[S-15](../../SPEC.md)、[S-28](../../SPEC.md)）。预期：`拒绝：failure_missing`。

```json
{
  "id": "resp_r9",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-10 `failure_on_interrupted`

在 E-4 上加一条 `failure`。**用户中断不是非常态，不带任何成因**——加进来，用户的一次正常操作就被登记成一次失败（[S-12](../../SPEC.md)）。预期：`拒绝：failure_on_interrupted`。

```json
{
  "id": "resp_r10",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "user",
  "failure": {
    "cause": "unrecognized",
    "localError": "stream closed by client"
  },
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-11 `first_token_inconsistent`：说「断在半路」，却没有首 token

在 E-6 上把成因改成 `interrupted_mid_reply`。**没开口就谈不上「说到一半」**（[S-13](../../SPEC.md) 最后两行，Schema 第八支的①）。预期：`拒绝：first_token_inconsistent`。

```json
{
  "id": "resp_r11",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "failure": {
    "cause": "interrupted_mid_reply",
    "statusCode": 503
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-12 `first_token_inconsistent`：开了口，成因却不是「断在半路」

在 E-5 上把成因改成 `upstream_unavailable`——**这正是「看到 429 就当成上游那边的事」那种写法**，而首 token 已经出来了（Schema 第八支的②）。预期：`拒绝：first_token_inconsistent`。

> **回复在落盘之前被否决的那一次，若写成「`failed`、有首 token、成因是某个可重试的值」，也是这个形状，同样被挡住。**
> 那一次的正确写法是 `complete`／`truncated` 加 `replyDisposition = { vetoed }`，见 [E-8](#e-8-同一个-run-里前后两次调用前一次的回复被否决)；
> **不让实现挑一个成因凑数**。

```json
{
  "id": "resp_r12",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1f04"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "delivered": [
    {
      "id": "b1",
      "kind": "text",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "text": "我先检查一下测试为什么失败，看起来是"
    }
  ],
  "failure": {
    "cause": "upstream_unavailable",
    "statusCode": 429,
    "inBand": true
  },
  "timing": {
    "sentAt": "2026-09-23T10:04:00Z",
    "firstTokenAt": "2026-09-23T10:04:01.5Z",
    "endedAt": "2026-09-23T10:04:06Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-13 `first_token_inconsistent`：有回复，却没有首 token

在 E-7 上删掉 `firstTokenAt`。**有回复就交出过内容**（Schema 第八支的④）。预期：`拒绝：first_token_inconsistent`。

```json
{
  "id": "resp_r13",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 2,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_60",
    "type": "assistant",
    "createdAt": "2026-09-23T10:05:09Z",
    "response": "resp_r13",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "好的。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:05:03Z",
    "endedAt": "2026-09-23T10:05:09Z"
  },
  "usage": {
    "input_tokens": 3120,
    "output_tokens": 480,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0123,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-14 `first_token_inconsistent`：没开口的中断，却带着已交付的块

在 E-4 上加一份 `delivered`。**有已交付的块就交出过内容**，没有首 token 说不通（Schema 第八支的⑤）。预期：`拒绝：first_token_inconsistent`。
（原来的「没有回复的中断却有首 token」现在是合法的：开了口之后被中断、没有交出回复——见 E-10、E-11。）

```json
{
  "id": "resp_r14",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "user",
  "delivered": [
    {
      "id": "b1",
      "kind": "text",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "text": "先看"
    }
  ],
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-15 `failure_on_success`：正常收尾却带着故障

在 E-7 上加一条 `failure`。**主路径走完了就没有成因**；回复在落盘之前被否决也不例外，那记在 `replyDisposition` 上（[S-13](../../SPEC.md)、[S-27](../../SPEC.md)）。预期：`拒绝：failure_on_success`。

```json
{
  "id": "resp_r15",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 2,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_60",
    "type": "assistant",
    "createdAt": "2026-09-23T10:05:09Z",
    "response": "resp_r15",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "好的。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "failure": {
    "cause": "unrecognized",
    "statusCode": 200
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:03Z",
    "firstTokenAt": "2026-09-23T10:05:04Z",
    "endedAt": "2026-09-23T10:05:09Z"
  },
  "usage": {
    "input_tokens": 3120,
    "output_tokens": 480,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0123,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-16 `reply_ending_mismatch`：回复的收尾与收场错配

在 E-2 上把 `reply.ending` 改成 `complete`，`outcome` 仍是 `truncated`。**截断就是截断，不许在回复上写成正常收尾**（[S-13](../../SPEC.md)、[S-27](../../SPEC.md)）。预期：`拒绝：reply_ending_mismatch`。

```json
{
  "id": "resp_r16",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1a08"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "openai/gpt-5-mini",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "openai/gpt-5-mini"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "openai/gpt-5-mini",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "openai",
        "azure"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "truncated",
  "reply": {
    "id": "msg_52",
    "type": "assistant",
    "createdAt": "2026-09-23T10:01:09Z",
    "response": "resp_r16",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "接下来改 main.rs："
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:01:00Z",
    "firstTokenAt": "2026-09-23T10:01:00.8Z",
    "endedAt": "2026-09-23T10:01:09Z"
  },
  "usage": {
    "input_tokens": 2210,
    "output_tokens": 256,
    "cache_read_tokens": 0,
    "cache_write_tokens": 2048,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0019,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-17 `malformed`：正常收尾，却说不出回复有没有成为消息

在 E-7 上删掉 `replyDisposition`。**缺席不是「落盘了」**——正常收尾与截断的那份回复有没有成为消息，必须明说（[S-14](../../SPEC.md)）；
这一情形没有专名，按 [S-27](../../SPEC.md) 排在最后给 `malformed`。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r17",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 2,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_60",
    "type": "assistant",
    "createdAt": "2026-09-23T10:05:09Z",
    "response": "resp_r17",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "好的。"
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:03Z",
    "firstTokenAt": "2026-09-23T10:05:04Z",
    "endedAt": "2026-09-23T10:05:09Z"
  },
  "usage": {
    "input_tokens": 3120,
    "output_tokens": 480,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0123,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-18 `malformed`：被中断的回复没说有没有成为消息

在 E-3 上删掉 `replyDisposition`。**凡有回复就要说它成没成为消息**，被叫停时交出的半截回复也一样要过「消息落盘之前」那一关（[S-14](../../SPEC.md)、原 G-12）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r18",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1c55"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "google/gemini-2.5-flash",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "google/gemini-2.5-flash"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "google/gemini-2.5-flash",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "google-vertex",
        "google-ai-studio"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": {
      "extension": "cheap-first-router"
    },
    "provider": "google-vertex",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "user",
  "reply": {
    "id": "msg_53",
    "type": "assistant",
    "createdAt": "2026-09-23T10:02:03Z",
    "response": "resp_r18",
    "ending": "interrupted_by_user",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "这个问题可以分三步看。第一步"
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:02:00Z",
    "firstTokenAt": "2026-09-23T10:02:01Z",
    "endedAt": "2026-09-23T10:02:03Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-19 `malformed`：被中断，却不说是谁中断的

在 E-4 上删掉 `initiator`。**用户叫停、运行被取消、失去连续性是三件事**，缺席不读作其中任何一件（[S-12](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r19",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-20 `malformed`：失去连续性补写的那一条带了回复

在 E-3 上把 `initiator` 改成 `runtime_lost`。**补写时没有人还拿着一份回复**——在途内容随进程没了（[S-13](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r20",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1c55"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "google/gemini-2.5-flash",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "google/gemini-2.5-flash"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "google/gemini-2.5-flash",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "google-vertex",
        "google-ai-studio"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": {
      "extension": "cheap-first-router"
    },
    "provider": "google-vertex",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "runtime_lost",
  "reply": {
    "id": "msg_53",
    "type": "assistant",
    "createdAt": "2026-09-23T10:02:03Z",
    "response": "resp_r20",
    "ending": "interrupted_by_user",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "这个问题可以分三步看。第一步"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:02:00Z",
    "firstTokenAt": "2026-09-23T10:02:01Z",
    "endedAt": "2026-09-23T10:02:03Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-21 `malformed`：不属于任何运行，却带着尝试序号

在 E-9 上加 `"attemptId": 1`。**尝试序号只与运行合起来才有意义**；这次调用不属于任何运行（[S-7](../../SPEC.md)、[S-8](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r21",
  "call": {
    "callId": "mc_9c01"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "openai/gpt-5-mini",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "official",
      "routeName": "openai/gpt-5-mini"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "openai/gpt-5-mini",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "openai"
      ],
      "allowFallback": false,
      "inputModalities": [
        "text"
      ],
      "outputModalities": [
        "text"
      ],
      "maxInputTokens": 128000,
      "maxOutputTokens": 16000,
      "updatedAt": "2026-09-01T00:00:00Z",
      "inputConstraints": {},
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "credentialScope": {
      "layer": "factory"
    },
    "parameters": {}
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_c1",
    "type": "assistant",
    "createdAt": "2026-09-23T10:09:04Z",
    "response": "resp_r21",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": false,
          "toModel": true
        },
        "text": "摘要：……"
      }
    ]
  },
  "replyDisposition": {
    "consumed": {
      "by": "compaction"
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:09:00Z",
    "firstTokenAt": "2026-09-23T10:09:01Z",
    "endedAt": "2026-09-23T10:09:04Z"
  },
  "usage": {
    "input_tokens": 9800,
    "output_tokens": 140,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0021,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-22 `malformed`：「没认出来」却什么痕迹都没留

在 E-6 上把成因改成 `unrecognized`，同时删掉 `statusCode`、`upstreamError` 与 `raw`。**兜底值不许用来偷懒**（[S-15](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r22",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "failed",
  "failure": {
    "cause": "unrecognized"
  },
  "timing": {
    "sentAt": "2026-09-23T10:05:00Z",
    "endedAt": "2026-09-23T10:05:01Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-23 `malformed`：「一次也没砍」写成了全零的汇总

在 E-9 上把 `trims` 换成四项全零。**「没砍」只有一种写法——缺席**（[S-19](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r23",
  "call": {
    "callId": "mc_9c01"
  },
  "dispatch": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "openai/gpt-5-mini",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "official",
      "routeName": "openai/gpt-5-mini"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "openai/gpt-5-mini",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "openai"
      ],
      "allowFallback": false,
      "inputModalities": [
        "text"
      ],
      "outputModalities": [
        "text"
      ],
      "maxInputTokens": 128000,
      "maxOutputTokens": 16000,
      "updatedAt": "2026-09-01T00:00:00Z",
      "inputConstraints": {},
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "credentialScope": {
      "layer": "factory"
    },
    "parameters": {}
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_c1",
    "type": "assistant",
    "createdAt": "2026-09-23T10:09:04Z",
    "response": "resp_r23",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": false,
          "toModel": true
        },
        "text": "摘要：……"
      }
    ]
  },
  "replyDisposition": {
    "consumed": {
      "by": "compaction"
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:09:00Z",
    "firstTokenAt": "2026-09-23T10:09:01Z",
    "endedAt": "2026-09-23T10:09:04Z"
  },
  "usage": {
    "input_tokens": 9800,
    "output_tokens": 140,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0021,
    "source": "upstream_usage"
  },
  "trims": {
    "merged": 0,
    "cut": 0,
    "omittedBytes": 0,
    "byReason": {
      "rate_merged": 0,
      "frame_too_long": 0,
      "quota_exhausted": 0,
      "rejected": 0
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-24 `malformed`：凭据记在组织那一格

在 E-9 上把 `credentialScope` 换成组织那一格。**模型凭据只在租户层与出厂格**，组织那一层不持有凭据（[S-9](../../SPEC.md)、PF-013 rev 10 裁决 33）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r24",
  "call": {
    "callId": "mc_9c01"
  },
  "dispatch": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "openai/gpt-5-mini",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "official",
      "routeName": "openai/gpt-5-mini"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "openai/gpt-5-mini",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "openai"
      ],
      "allowFallback": false,
      "inputModalities": [
        "text"
      ],
      "outputModalities": [
        "text"
      ],
      "maxInputTokens": 128000,
      "maxOutputTokens": 16000,
      "updatedAt": "2026-09-01T00:00:00Z",
      "inputConstraints": {},
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "credentialScope": {
      "layer": "organization",
      "organization": "org_7fd2c1"
    },
    "upstreamModel": "openai/gpt-5-mini-2025-08-07",
    "parameters": {
      "maxOutputTokens": 2000
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_c1",
    "type": "assistant",
    "createdAt": "2026-09-23T10:09:04Z",
    "response": "resp_r24",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": false,
          "toModel": true
        },
        "text": "摘要：……"
      }
    ]
  },
  "replyDisposition": {
    "consumed": {
      "by": "compaction"
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:09:00Z",
    "firstTokenAt": "2026-09-23T10:09:01Z",
    "endedAt": "2026-09-23T10:09:04Z"
  },
  "usage": {
    "input_tokens": 9800,
    "output_tokens": 140,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0021,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-25 `malformed`：「不晚」写成了 `late: false`

在 E-10 上把 `late` 改成 `false`。**「不晚」只有一种写法——缺席**（[S-35](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r25",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_4d10"
  },
  "dispatch": 1,
  "attemptId": 2,
  "late": false,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "runtime_lost",
  "timing": {
    "sentAt": "2026-09-23T10:10:00Z",
    "firstTokenAt": "2026-09-23T10:10:01Z",
    "endedAt": "2026-09-23T10:12:30Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-26 `malformed`：不属于任何运行，却标了晚到

在 E-9 上加 `"late": true`。**没有运行就没有尝试可被栅栏关掉**（[S-35](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r26",
  "call": {
    "callId": "mc_9c01"
  },
  "dispatch": 1,
  "late": true,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "openai/gpt-5-mini",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "official",
      "routeName": "openai/gpt-5-mini"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "openai/gpt-5-mini",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "openai"
      ],
      "allowFallback": false,
      "inputModalities": [
        "text"
      ],
      "outputModalities": [
        "text"
      ],
      "maxInputTokens": 128000,
      "maxOutputTokens": 16000,
      "updatedAt": "2026-09-01T00:00:00Z",
      "inputConstraints": {},
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "credentialScope": {
      "layer": "factory"
    },
    "parameters": {}
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_c1",
    "type": "assistant",
    "createdAt": "2026-09-23T10:09:04Z",
    "response": "resp_r26",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": false,
          "toModel": true
        },
        "text": "摘要：……"
      }
    ]
  },
  "replyDisposition": {
    "consumed": {
      "by": "compaction"
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:09:00Z",
    "firstTokenAt": "2026-09-23T10:09:01Z",
    "endedAt": "2026-09-23T10:09:04Z"
  },
  "usage": {
    "input_tokens": 9800,
    "output_tokens": 140,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0021,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-27 `malformed`：出厂格那一把用在了自建档案上

在 E-1 上把 `credentialScope` 换成出厂格。E-1 的有效模型是一条组织层的自建档案；**出厂格那一把只供官方档案**（[S-9](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r27",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "factory"
    },
    "parameters": {}
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_r27",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-28 `malformed`：「一项值也没改」写成了空数组

在 E-7 上加 `"parameterAdjustments": []`。**「一项值也没改」只有一种写法——缺席**（[S-11](../../SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r28",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_2b77"
  },
  "dispatch": 2,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {},
    "parameterAdjustments": []
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_60",
    "type": "assistant",
    "createdAt": "2026-09-23T10:05:09Z",
    "response": "resp_r28",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "好的。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:05:03Z",
    "firstTokenAt": "2026-09-23T10:05:04Z",
    "endedAt": "2026-09-23T10:05:09Z"
  },
  "usage": {
    "input_tokens": 3120,
    "output_tokens": 480,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0123,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-29 `malformed`：改了值，却没记实际发出的是什么

在 E-12 上删掉第二项改值的 `sent`。**改值的留痕要记下实际发出的值**，只记要求的值等于没记（[S-11](../../SPEC.md)、[`data.model-profile/v5#S-21`](../../../model-profile/SPEC.md)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r29",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_5e12"
  },
  "dispatch": 1,
  "attemptId": 2,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "vendor-b/reasoner-l",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "tenant",
        "tenant": {
          "organization": "org_7fd2c1",
          "account": "acc_91ab40"
        }
      },
      "routeName": "vendor-b/reasoner-l"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "vendor-b/reasoner-l",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "provider-z"
      ],
      "allowFallback": false,
      "inputModalities": [
        "text"
      ],
      "outputModalities": [
        "text"
      ],
      "maxInputTokens": 128000,
      "maxOutputTokens": 64000,
      "parameters": {
        "reasoningEffort": "max",
        "maxOutputTokens": 32000,
        "extra": {
          "top_k": 40
        }
      },
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {},
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "provider-z",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high",
      "maxOutputTokens": 16000
    },
    "parameterAdjustments": [
      {
        "name": "reasoningEffort",
        "requested": "max",
        "sent": "high"
      },
      {
        "name": "maxOutputTokens",
        "requested": 32000
      }
    ],
    "droppedParameters": [
      "top_k"
    ]
  },
  "outcome": "complete",
  "reply": {
    "id": "msg_80",
    "type": "assistant",
    "createdAt": "2026-09-23T10:20:09Z",
    "response": "resp_r29",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "三种方案里第二种最省：只改一处索引。"
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:20:00Z",
    "firstTokenAt": "2026-09-23T10:20:03Z",
    "endedAt": "2026-09-23T10:20:09Z"
  },
  "usage": {
    "input_tokens": 5200,
    "output_tokens": 610,
    "cache_read_tokens": 4096,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0087,
    "source": "upstream_usage"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### R-30 `malformed`：标了「带内」，却没有状态码

在 E-5 的 `failure` 上删掉 `statusCode`、留下 `inBand: true`。**`inBand` 说的是「这个状态码从哪来」，没有状态码它就没有所指**（[S-15](../../SPEC.md)；Schema `Failure.dependentRequired`）。预期：`拒绝：malformed`。只列 `failure` 一段，其余成员照 E-5：

```json
"failure": {
  "cause": "interrupted_mid_reply",
  "inBand": true,
  "upstreamError": { "code": "429", "message": "Rate limit exceeded for this provider. Please retry later." }
}
```

## 三、Schema 挡不住、但同样非法的

**本节不参与机检**——这些值形状上一概合法，只能由写入者的约束、静态检查或规范场景拒绝。
列在这里，是为了让[「校验通过不表示条款成立」](../../SPEC.md)有具体例子，而不是一句免责声明。

| 做了什么 | 违反 |
|---|---|
| E-7 的 `reply.response` 写成 E-6 的 `id` | [S-14](../../SPEC.md)：回复指回的是产出它的那一条 |
| `sentAt` 晚于 `endedAt`，或 `firstTokenAt` 早于 `sentAt` | [S-17](../../SPEC.md) |
| 停机恢复后判不出开没开口，写了一条没有 `firstTokenAt` 的 `failed` | [S-18](../../SPEC.md)：缺席是断言，判不出不得写成缺席 |
| 上游没回报模型名，`upstreamModel` 填了路由名 | [S-9](../../SPEC.md) |
| `route.provider` 不在那条档案「允许的供应商」里 | [S-9](../../SPEC.md) |
| E-3 的 `route.provider` 换成 `google-ai-studio`（`dispatch = 1`，却不是第一家）；或一次 `profileSnapshot.allowFallback = false` 的调用，第二次发出走了列表里的第二家 | [S-9](../../SPEC.md)：第一次发出走第一家，不许回退时每一次都是第一家 |
| `droppedParameters` 列了一个仍在 `parameters` 里的名字，或者丢了项却不写 | [S-11](../../SPEC.md) |
| E-12 的 `parameters.reasoningEffort` 写回 `max`（记的是要求的值，不是实际发出的），或 `parameterAdjustments` 里 `sent` 与 `parameters` 那一项不一样 | [S-11](../../SPEC.md)：`parameters` 记实际发出的值 |
| 改了一项的值再发出，却不写 `parameterAdjustments`；或同一个项名同时出现在 `parameterAdjustments` 与 `droppedParameters` 里 | [S-11](../../SPEC.md) |
| 补写的那一条出门所在的尝试早已被取代，却没带 `late`；或一条当场写下的、尝试仍是当前的，带了 `late` | [S-35](../../SPEC.md) |
| 对账补写那一条时另铸了一个 `id`，不是「已出门」上定下的那一个 | [S-6](../../SPEC.md)：同一次发出从此有两个标识，按标识判重就失效 |
| 一条 `failed` 带成因 `withdrawn`（档案已撤回） | [S-16](../../SPEC.md)：撤回在出门之前就上交了，没有「一次发出」 |
| 一条 `unrecognized` 的 `localError` 是写入者编的一句「未知错误」，真正认不出来的那段上游回应没留 | [S-15](../../SPEC.md)：兜底留的得是认不出来的那样东西本身 |
| `route.credentialScope` 写出厂格，这一次实际用的是发起租户自己那一把 | [S-9](../../SPEC.md)：用量会记到错的那一格头上 |
| 运行被取消时写入者手里还有已交付的块，却写了一条没有 `delivered` 的 `interrupted` | [S-13](../../SPEC.md)：有才带，有就必带 |
| 会话归档（系统发起的运行取消）时模型已经开口，写成一条 `initiator = run_cancelled`、带 `reply`（`ending = interrupted_by_user`）的响应体 | [S-13](../../SPEC.md)：系统发起的取消在途的流被放弃、**没有回复**；`interrupted_by_user` 在这里是冒称用户（`data.messages/v7#S-10`） |
| 同一次调用有 `dispatch` 1 与 3，没有 2 | [S-8](../../SPEC.md)、[S-23](../../SPEC.md) |
| 同一次调用里第 1 条是 `failed`、成因 `request_rejected`，之后还有第 2 条 | [S-23](../../SPEC.md)：「重试没用」是事实，重试挂件推翻不了 |
| 同一次调用里有两条带 `reply` | [S-14](../../SPEC.md)、[S-23](../../SPEC.md) |
| E-8a 的回复被否决，这次调用之后却还有一条 `dispatch = 2` 再要一份 | [S-17](../../SPEC.md)、[S-23](../../SPEC.md)：有首 token 就不许重发，再试是**新的调用** |
| `replyDisposition` 是 `vetoed`，会话日志里却有一条消息的 `id` 等于那份 `reply.id` | [S-14](../../SPEC.md)：被否决的那份没有成为消息 |
| `replyDisposition` 是 `persisted`，会话日志里却找不到那条消息 | [S-14](../../SPEC.md) |
| `raw.headers` 里有 `authorization: Bearer sk-or-…`，或 `upstreamError.message` 里带着密钥的前几位 | [S-21](../../SPEC.md) |
| 传输层在一次发出之内自己换了一家再试，只写下一条响应体 | [S-24](../../SPEC.md) |
| 拿到了实际费用，回头把那条响应体的 `cost` 改掉 | [S-22](../../SPEC.md)：更正靠追加 `CostCorrection` |
| `ResponseId` 取上游的 generation id | [S-6](../../SPEC.md)：上游 id 另记，本系统的身份自己铸 |
| 按尝试汇总时，E-10 这一条按它的 `attemptId`（第 2 次）归组，而承载它的条目说的是另一组 | [S-8](../../SPEC.md)、[S-19](../../SPEC.md)：归属以条目为准，`attemptId` 只是出门所在尝试的事实 |

## 四、按尝试记明细、按 Run 汇总

**对象**：E-6 与 E-7——同一次调用（`mc_2b77`）的两次发出，都在运行 `run_7a02` 的第 2 次尝试里出门、当场写下；承载它们的条目也都归到这一次尝试。
**规则**取自 `data.call-accounts`：`unknown` **单独计数、不当零加**；一个目标有 `CostCorrection` 时取 `at` 最新的那一条覆盖它的 `cost_usd`；**一笔归哪一组由承载它的条目给**（[`data.call-accounts/v3#S-25`](../../../call-accounts/SPEC.md)）。
汇总怎样呈现（「已知合计 + 未知条数」这种两元组只是本页的演示写法）归那份契约。

**按尝试记明细**——每次发出一行，**两行都在**（「尝试」一列是条目给的归属；这两条当场写下，它与各自的 `attemptId` 相同）：

| 响应体 | 尝试 | `dispatch` | 那一家 | 收场 | `cost_usd` | `input_tokens` | `output_tokens` | `cache_read_tokens` | `cache_write_tokens` |
|---|---|---|---|---|---|---|---|---|---|
| E-6 `resp_e6a001` | (run_7a02, 2) | 1 | anthropic | failed · upstream_unavailable · 503 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` |
| E-7 `resp_e7b002` | (run_7a02, 2) | 2 | amazon-bedrock | complete | 0.0123 | 3120 | 480 | 0 | 0 |

**按 Run 汇总**（`run_7a02` 里只算这两条）：

| 量 | 已知部分之和 | 未知的条数 | 读法 |
|---|---|---|---|
| `cost_usd` | 0.0123 | 1 | **不是「0.0123 美元」**：有一笔不知道多少，已知部分是 0.0123。把 E-6 当零加，就把「可能已经计费的那一次」抹掉了（[S-19](../../SPEC.md) 第 1、2 条） |
| `input_tokens` | 3120 | 1 | 同上 |
| `output_tokens` | 480 | 1 | 同上 |
| `cache_read_tokens` | 0 | 1 | 同上；**已知部分的 0 是真的零，与 E-6 的 `unknown` 不是一回事** |
| `cache_write_tokens` | 0 | 1 | 同上 |

**之后补到了 E-6 的实际费用**：经 E-6 的 `upstreamRequestId`（`gen-1758622100-e6e6e6`）向上游补查，得到这次 503 实际收费 0。追加一条

```json
{
  "target": {
    "kind": "model_response",
    "responseId": "resp_e6a001"
  },
  "cost_usd": 0,
  "obtainedVia": "generation_endpoint",
  "at": "2026-09-23T11:00:00Z"
}
```

**E-6 本身一个字不改**（[S-22](../../SPEC.md)）。重算：

| 量 | 已知部分之和 | 未知的条数 | 变化 |
|---|---|---|---|
| `cost_usd` | 0.0123 + 0 = **0.0123** | **0** | 未知那一笔被更正覆盖，**这时 0.0123 才是完整的总数** |
| 四类 token | 同上表 | 仍各 **1** | **更正只动费用**，E-6 的用量仍然不知道——汇总照实保留这个「不知道」 |

**两点要看清：**

- **两条账两笔钱都进了明细**，哪怕第一笔最后被更正成 0——它是**查出来是 0**，不是**当作 0**。
  若 E-6 没有 `upstreamRequestId`，经上游补查这条来路就走不通，只能等人工更正或一直保持 `unknown`（[S-9](../../SPEC.md)、[S-19](../../SPEC.md)）。
- **「这个 Run 的成本减去最后一次尝试的成本，就是崩溃浪费掉的钱」**（[PF-012 成本两层](../../../../../.meta_harness/design/product/PF-012-agent-loop-and-run/design.md)）：
  这两条都归在第 2 次尝试里，它们之间的差额是**同一次尝试内**换家的代价，不是崩溃造成的——**归在哪次尝试由承载它的条目给，不来自 `dispatch`，也不以 `attemptId` 为准**：
  像 E-10 那样由对账在下一次尝试里补写的一条，`attemptId` 说的是它在哪次尝试里出门，归到哪一组仍看条目（[S-8](../../SPEC.md)）。

## v3 窄修订的规范对照

每一行均为本版本的规范实例；Schema 只判表示，拒绝值及派发限制按所列条款。

### reply带完整未解析坏名

校验对象：`$defs/ModelResponse`。预期 Schema：`通过`；契约结果：`—`。S-14：reply 的形状采用 messages/v6；其它条件取本页 E-1。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b_bad",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_bad",
        "tool": "bad:name",
        "rawArguments": "{\"x\":1}",
        "unparseable": true
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### delivered带完整未解析坏名

校验对象：`$defs/ModelResponse`。预期 Schema：`通过`；契约结果：`—`。S-14：已交付部分采用 content-blocks/v3；收场与时间条件保持原合法实例。

```json
{
  "id": "resp_9a61d2",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1f04"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758622000-77aa01",
    "parameters": {}
  },
  "outcome": "failed",
  "delivered": [
    {
      "id": "b_bad",
      "kind": "tool_call",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "complete": true,
      "callId": "call_bad",
      "tool": "bad:name",
      "rawArguments": "{\"x\":1}",
      "unparseable": true
    }
  ],
  "failure": {
    "cause": "interrupted_mid_reply",
    "statusCode": 429,
    "inBand": true,
    "upstreamError": {
      "code": "429",
      "message": "Rate limit exceeded for this provider. Please retry later."
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:04:00Z",
    "firstTokenAt": "2026-09-23T10:04:01.5Z",
    "endedAt": "2026-09-23T10:04:06Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### reply正常参数坏名仍拒

校验对象：`$defs/ModelResponse`。预期 Schema：`拒绝`；契约结果：`malformed`。S-14、S-27：采用闭包不放宽正常参数分支。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b_bad",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_bad",
        "tool": "bad:name",
        "arguments": {}
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### delivered正常参数坏名仍拒

校验对象：`$defs/ModelResponse`。预期 Schema：`拒绝`；契约结果：`malformed`。S-14、S-27：采用闭包不放宽正常参数分支。

```json
{
  "id": "resp_9a61d2",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1f04"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758622000-77aa01",
    "parameters": {}
  },
  "outcome": "failed",
  "delivered": [
    {
      "id": "b_bad",
      "kind": "tool_call",
      "visibility": {
        "toHuman": true,
        "toModel": true
      },
      "complete": true,
      "callId": "call_bad",
      "tool": "bad:name",
      "arguments": {}
    }
  ],
  "failure": {
    "cause": "interrupted_mid_reply",
    "statusCode": 429,
    "inBand": true,
    "upstreamError": {
      "code": "429",
      "message": "Rate limit exceeded for this provider. Please retry later."
    }
  },
  "timing": {
    "sentAt": "2026-09-23T10:04:00Z",
    "firstTokenAt": "2026-09-23T10:04:01.5Z",
    "endedAt": "2026-09-23T10:04:06Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

## 六、v4 适配绑定、实际执行方与缓存事实

每块是完整 ModelResponse。`预期 Schema` 只判形状；`纯判定` 是在形状通过后执行 S-36 的两个相等比较，并沿 S-27 报结果。写入者的真实来源义务不能从示例值证明。

### V4-E1 已知零与未报告分开

预期 Schema：`通过`；纯判定：`通过`。配置只为示例，不指定供应商的配置词表或默认。上游报告读取量零、未报告写入量；实际执行方未报告即缺席。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E2 真实暖读

预期 Schema：`通过`；纯判定：`通过`。上游报告读取量 2048、写入量零；实际执行方按报告保留。费用仍未知，不由缓存折扣估计。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    },
    "servingProvider": "anthropic"
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 2048,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E3 同修订却换了配置值

预期 Schema：`通过`；纯判定：`malformed`。两个配置 revision 相同，但 values 不同；只比较版本字符串的判定器会错误放过。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "explicit"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E4 实现修订错配

预期 Schema：`通过`；纯判定：`malformed`。快照仍是 impl-1，响应绑定换成 impl-2；Schema 放过，纯判定拒绝。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-2"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E5 两份绑定一致但模型不同

预期 Schema：`通过`；纯判定：`malformed`。两份绑定都改为别的模型，仍与 profile.routeName 不同。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "example/another-model",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "example/another-model",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E6 缺少响应绑定

预期 Schema：`拒绝`；纯判定：`malformed`。不得仅凭快照已有绑定就补齐必填 route.adaptation。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E7 缺少快照绑定

预期 Schema：`拒绝`；纯判定：`malformed`。不得从 route.adaptation 补齐缺失的快照绑定。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E8 实际执行方为空

预期 Schema：`拒绝`；纯判定：`malformed`。报告缺席用成员缺席表达，空串非法。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    },
    "servingProvider": ""
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E9 实际执行方不符合请求

预期 Schema：`通过`；纯判定：`通过`。先有实际名称核实、且首 token 之前发现错配。两项分别保存，沿既有 unrecognized 留故障事实；数据校验不自行以字面不同推断供应商不同。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    },
    "servingProvider": "example-other-provider"
  },
  "outcome": "failed",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "failure": {
    "cause": "unrecognized",
    "upstreamError": {
      "message": "Reported provider did not satisfy the fixed provider request."
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E10 缓存写入量不得缺席

预期 Schema：`拒绝`；纯判定：`malformed`。上游未报应保留 unknown，不能删必填计数。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E11 两项缓存未知而其他用量已知

预期 Schema：`通过`；纯判定：`通过`。缓存未知不影响已有 output_tokens = 0，usage.source 保持 upstream。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "upstream"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-E12 来源为无却有已知缓存数

预期 Schema：`拒绝`；纯判定：`malformed`。source=none 与已知零冲突；响应体按外部引用形状不合拒绝。

```json
{
  "id": "resp_v4",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {
          "prefixCache": {
            "mode": "automatic"
          }
        }
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {
            "prefixCache": {
              "mode": "automatic"
            }
          }
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621900-0a9b8c"
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### V4-M1 精确数值的单字段变异

以 V4-E1 为底，把两个绑定的 `configuration.values` 都换为 `{"threshold": 0.10000000000000000001}`；预期 Schema 与纯判定均通过。随后只把 `route.adaptation.configuration.values.threshold` 改成 `0.1`，Schema 仍通过，纯判定必须为 `malformed`。若读取时先按有限精度浮点舍入，两数会被误判相等，违反公共绑定的精确值保留。若仅改变对象成员顺序，预期仍通过；若交换数组中不同元素的顺序，则错配拒绝。另将配置中的 `true` 只在一侧改为数字 `1`，同样错配拒绝；JSON 值比较不采用把布尔值与数字相等的宿主语言规则。

### V4-M2 未提供实际执行方的错误写入者

上游报文不含实际执行方；正确响应为 V4-E1 那样省略 `servingProvider`。把请求的 `provider` 复制进去后 Schema 仍通过，纯数据判定也不能证明来源伪造；提供者场景必须抓取上游事实并发现该写入者违反 S-37。`upstreamModel` 的同类变异亦须拒绝生产事实，不能用请求名证明实际执行。

### V4-M3 配置不构成缓存证据

同一个上游报文只提供非缓存 token 用量，未提供缓存读写数；无论配置声明自动缓存、显式缓存、何种 TTL 或断点，结果均应是 V4-E11 的两个 `unknown`。把任一计数填零或正数的变异仅从文档形状看可能合法，提供者测试须以真实上游报文判违约。缓存读取为零但写入为正仍不构成读取命中；写入完成后下一次是否读取，必须由下一次自己的上报事实确认。

## 七、v5 多值响应头

本节每个 JSON 块都是完整响应体，使用 S-20 的表示与 S-27 的拒绝次序。预期只涉及表示与列出的纯关系，不证明采得事实真实或写方已兑现原样、脱敏和留存。

### MR5-H1 · 混合字符串与数组

预期：`通过`。字符串中的逗号只是原串；数组保留顺序、重复和空串，一元素数组仍是数组。v4 Schema 拒绝这个值；v5 Schema 接收。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-single": "a,b",
      "x-many": [
        "second",
        "first",
        "first",
        "",
        ""
      ],
      "x-one": [
        "one"
      ],
      "x-empty-array": [],
      "x-empty-string": ""
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H1 · 已采得空头对象

预期：`通过`。空对象是显式采得的值，与缺席不同；v4 与 v5 均接收。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {}
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H1 · 仅正文引用而无头成员

预期：`通过`。headers 缺席仍可有合法 body；不补空头对象。v4 与 v5 均接收。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H1 · raw 缺席

预期：`通过`。沿 S-20 的既有缺席语义，不从缺席补造上游事实。v4 与 v5 均接收。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H1 · 原单值头对象

预期：`通过`。旧单值和空字符串保持原形；v4 与 v5 均接收。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-single": "one",
      "x-empty": ""
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 非法头值：null

预期：`拒绝：malformed`。S-20 值域不合；其他成员合法，沿 S-27 成员层拒绝。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": null
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 非法头值：数字

预期：`拒绝：malformed`。S-20 值域不合；其他成员合法，沿 S-27 成员层拒绝。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": 7
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 非法头值：布尔值

预期：`拒绝：malformed`。S-20 值域不合；其他成员合法，沿 S-27 成员层拒绝。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": false
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 非法头值：对象

预期：`拒绝：malformed`。S-20 值域不合；其他成员合法，沿 S-27 成员层拒绝。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": {
        "a": "b"
      }
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 非法头值：嵌套数组

预期：`拒绝：malformed`。S-20 值域不合；其他成员合法，沿 S-27 成员层拒绝。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": [
        [
          "a"
        ]
      ]
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 非法头值：混合数组

预期：`拒绝：malformed`。S-20 值域不合；其他成员合法，沿 S-27 成员层拒绝。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": [
        "a",
        7
      ]
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 非法头值：数组中的 null

预期：`拒绝：malformed`。S-20 值域不合；其他成员合法，沿 S-27 成员层拒绝。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": [
        "a",
        null
      ]
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 空 raw

预期：`拒绝：malformed`。S-20 仍要求 headers/body 至少一项；不是合法空头对象。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {},
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · headers 不是对象

预期：`拒绝：malformed`。外层 headers 仍须为对象。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": [
      "a"
    ]
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 未知收场优先于坏头值

预期：`拒绝：outcome_unknown`。S-27 成员层的 outcome_unknown 仍先于一般 malformed。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "future",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": 7
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 发出序号优先于坏头值

预期：`拒绝：dispatch_zero`。S-27 成员层的 dispatch_zero 仍先于一般 malformed。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 0,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": 7
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 未知成因优先于坏头值

预期：`拒绝：cause_unknown`。S-27 成员层的 cause_unknown 仍先于一般 malformed 及跨成员错误。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "interrupted",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": 7
    }
  },
  "failure": {
    "cause": "future"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 坏头值先于跨成员缺回复

预期：`拒绝：malformed`。S-27 先检查成员形状，再检查 complete 缺 reply。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "complete",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-bad": 7
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H2 · 合法数组不掩盖跨成员缺回复

预期：`拒绝：reply_missing`。S-20 已合法；S-27 仍按原跨成员次序先给 reply_missing。

```json
{
  "id": "resp_52e0c8",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_1d90"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": {
      "reasoningEffort": "high"
    }
  },
  "outcome": "complete",
  "initiator": "user",
  "timing": {
    "sentAt": "2026-09-23T10:03:00Z",
    "endedAt": "2026-09-23T10:03:02Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "raw": {
    "headers": {
      "x-many": [
        "a",
        "b"
      ]
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR5-H4 · 表示合法仍会违反原样与脱敏

以上「混合字符串与数组」的响应，若写方把 `x-many` 排序、去重、取首、拼接为字符串或整体序列化为字符串，改后的值仍可能通过 Schema，却违反 S-20。把 `x-one` 从数组改成字符串、将 `x-empty-array` 删去、把缺席补成空头对象也同样违约。测试须以实际采得且脱敏后的完整值为 oracle，在真实消费链加入这些行为负控；本节没有执行该链。

凭据哨兵若出现在任何头名、字符串头值、数组元素或其他响应成员中，形状合法仍不符合 S-21。写前处理须按写方具名政策单独实测，不以本节的无秘密占位值代替脱敏证据。

### MR5-H5 · 持久事实交接的规范观察

真实消费者采用 v5 后，应将采得且脱敏后的头事实与同一次发出的完整响应、同一次日志追加和重开读取的结果逐值比较：字符串与数组形状相同，数组次序和重复相同，空值与缺席相同。覆盖成功、HTTP 失败、带内失败、断流和已观察响应后的取消；无法采得的事实不补造，未知账仍沿公共 Unknown，验证不得增加一次发送。写入后改动旧响应违反 S-22。具体交接、提交和恢复责任归运行时及写方；这里不定义新的服务操作，实际验证未开始。


## 六、v6 待提交投影与新版本边界

下列块的校验目标均为 `$defs/PendingModelResponse`，不是根模式。每条以 E-1 完整事实独立展示，S-39 的 Schema 外关联与真实来源仍须另核。

### MR7-complete

预期：通过。完整正常回复；Pending 合法，但持久根拒绝。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-truncated

预期：通过。截断仍是有回复的非故障收场。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "truncated",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "truncated_at_limit",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-interrupted

预期：通过。用户中断且已有回复，沿既有 ending 与首 token 规则。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "interrupted",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "interrupted_by_user",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "initiator": "user",
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-forbidden_replyDisposition

预期：拒绝。投影非法，malformed；持久根的规则仍单独存在。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "replyDisposition": "persisted",
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-forbidden_late

预期：拒绝。投影非法，malformed；持久根的规则仍单独存在。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "late": true,
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-forbidden_outcome

预期：拒绝。投影非法，malformed；持久根的规则仍单独存在。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "failed",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-missing_reply

预期：拒绝。待提交输入必带回复，malformed。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-ending_mismatch

预期：拒绝。reply_ending_mismatch。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "truncated_at_limit",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-missing_first_token

预期：拒绝。first_token_inconsistent。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-ordered_headers

预期：通过。完整保留多值头顺序、重复项与空串；本例串不含凭据。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3",
      "set-cookie": [
        "a=1",
        "a=1",
        ""
      ]
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-missing_limits

预期：拒绝。新版快照缺上游事实不能补unknown，malformed。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-runtime_lost_reply

预期：拒绝。继承既有 runtime_lost 不得有回复，malformed。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "interrupted",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "interrupted_by_user",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "timing": {
    "sentAt": "2026-09-23T10:00:00Z",
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "initiator": "runtime_lost",
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### MR7-commit · 晚到只在提交时决定

同一合法 pending 在交出时尝试仍有效，提交前尝试被栅栏关闭：待提交值始终不带 late，提交的 ModelResponse 必带 `late: true` 与已确定的 replyDisposition。逆例是拿 pending 缺 late 当作不晚直接保存。未带 runId 的 pending 提交时不带 late；回复处置未确定时不能补 persisted。该场景属于写入者交接/耐久性验证，Schema 正例不能证明已执行。

### MR7-facts · 投影不减记事实

从 E-1 只去处置和晚到得到 pending；回收时除合法处置、提交时晚到及消费方契约明确许可的消息处理以外，id、call、dispatch、attemptId、路由/绑定、用量费用、结束/首 token、raw 引用与各有序头值必须保留。`reply.response != id`、适配绑定不等即使单独 Schema 通过仍非法，按 S-14/S-36 继续纯校验。快照内 cap 超已知有限上游事实属于 MP5 S-27/S-33 的写入者违约，响应体接收方不据此返回 `malformed`（S-40）。真实事实与脱敏义务沿 S-21，不以 pending 作为漏带已知事实的理由。

### MR7-snapshot-boundary · 接收形状与写入者关系的反向边界

以 E-1 为完整根实例，仅替换以下两处，其余成员保持原值；也对 MR7-complete 的待提交实例作相同替换：

| JSON 路径 | 替换值 |
|---|---|
| `route.profileSnapshot.maxInputTokens` | `2` |
| `route.profileSnapshot.upstreamInputLimits.maxInputTokens` | `{ "status": "limited", "value": 1 }` |

**预期**：两个实例均通过各自 Schema；响应体接收方不因 `2 > 1` 增加表示层拒绝。该快照违反 MP5 S-33，表明写快照一方违反 MP5 S-27 的原样复制义务，须在该写入责任的证据中暴露；Schema 通过不表示写入者合规，也不授予新发送许可。反例是接收方额外复判 S-33 并返回 `malformed`。

再分别从上述两值删除 `route.profileSnapshot.upstreamInputLimits`：**预期均拒绝 `malformed`**，因为缺必填成员属于快照形状错误。不得据“不重判写入者关系”接受缺字段的快照。


## 七、MR7 与 LC6 完整失败主体的组合边界

### MR7-lc5-failure · 由 E-5 的同一批事实形成主体

校验目标为 `data.loop-extension/v6#/$defs/AfterModelCallFailureSubject`，**不是 ModelResponse 根**。预期通过。E-5 响应体自身仍通过 MR7 根校验；下列 `profile`、`dispatches[0].profileSnapshot` 与 E-5 的 `route.profileSnapshot` 是同一份完整 MP5 值，保留 image cap 与全部适用上游事实。`dispatches[0].response` 等于 E-5 的 `id`，call、dispatch、provider、绑定及本例未改写参数也对应同一次发出。本例日志此前确无已生效 retry，故 `retryConclusions` 显式为 `[]`；空数组不是缺历史时的默认值。首 token 后故障不因这一完整主体而取得重发许可。

```json
{
  "failure": "interrupted_mid_reply",
  "statusCode": 429,
  "inBand": true,
  "profile": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "providers": [
      "anthropic",
      "amazon-bedrock",
      "google-vertex",
      "openai"
    ],
    "allowFallback": true,
    "inputModalities": [
      "text",
      "image"
    ],
    "outputModalities": [
      "text",
      "image"
    ],
    "maxInputTokens": 200000,
    "maxOutputTokens": 64000,
    "updatedAt": "2026-09-20T08:00:00Z",
    "inputConstraints": {
      "maxImageBytes": 5242880
    },
    "upstreamInputLimits": {
      "maxInputTokens": {
        "status": "unknown"
      },
      "maxRequestBytes": {
        "status": "unknown"
      },
      "maxImageBytes": {
        "status": "unknown"
      },
      "maxImages": {
        "status": "unknown"
      }
    }
  },
  "dispatches": [
    {
      "kind": "model_call_dispatched",
      "call": "mc_1f04",
      "dispatch": 1,
      "response": "resp_9a61d2",
      "provider": "anthropic",
      "profile": {
        "origin": "custom",
        "scope": {
          "layer": "organization",
          "organization": "org_7fd2c1"
        },
        "routeName": "anthropic/claude-sonnet-4.5"
      },
      "profileSnapshot": {
        "adaptation": {
          "implementation": {
            "name": "example-family",
            "revision": "impl-1"
          },
          "definition": {
            "modelId": "anthropic/claude-sonnet-4.5",
            "revision": "model-1"
          },
          "configuration": {
            "revision": "config-1",
            "values": {}
          }
        },
        "providers": [
          "anthropic",
          "amazon-bedrock",
          "google-vertex",
          "openai"
        ],
        "allowFallback": true,
        "inputModalities": [
          "text",
          "image"
        ],
        "outputModalities": [
          "text",
          "image"
        ],
        "maxInputTokens": 200000,
        "maxOutputTokens": 64000,
        "updatedAt": "2026-09-20T08:00:00Z",
        "inputConstraints": {
          "maxImageBytes": 5242880
        },
        "upstreamInputLimits": {
          "maxInputTokens": {
            "status": "unknown"
          },
          "maxRequestBytes": {
            "status": "unknown"
          },
          "maxImageBytes": {
            "status": "unknown"
          },
          "maxImages": {
            "status": "unknown"
          }
        }
      },
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "parameters": {},
      "selectedBy": "session",
      "credentialScope": {
        "layer": "tenant",
        "tenant": {
          "organization": "org_7fd2c1",
          "account": "acc_91ab40"
        }
      }
    }
  ],
  "retryConclusions": []
}
```

反向边界：该完整值交给 LC3 的同名主体 Schema 必须拒绝（其采用旧闭合 MP2/MS3，且没有 retryConclusions）。在 LC6 上分别删除 `retryConclusions`、`profile.upstreamInputLimits`、`dispatches[0].profileSnapshot.inputConstraints`，每一支均须拒绝 `malformed`。跨记录相等、同调用归属、日志历史完整性仍是契约义务，不由这些形状检查证明。


## v9 实际发送时刻不可用

本节根 ModelResponse 的完整实例按根 Schema 检查；事实前提须另验，不从 Schema 通过推得。

### 恢复时没有可用实际发送时刻

预期：`通过`。权威完整日志确认 dispatched、无 opened、无原响应；旧工作实际停止。

```json
{
  "id": "resp_a10001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_4d10"
  },
  "dispatch": 1,
  "attemptId": 2,
  "late": true,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "runtime_lost",
  "timing": {
    "sentAt": null,
    "endedAt": "2026-09-23T10:12:30Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### 恢复时已开口但实际发送时刻丢失

预期：`通过`。权威 opened 时刻保留，不因 sentAt 为 null 放行重发。

```json
{
  "id": "resp_a10001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_4d10"
  },
  "dispatch": 1,
  "attemptId": 2,
  "late": true,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "runtime_lost",
  "timing": {
    "sentAt": null,
    "endedAt": "2026-09-23T10:12:30Z",
    "firstTokenAt": "2026-09-23T10:12:30Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### 锚点后零 send 的取消

预期：`通过`。确认 dispatched 后发送前取消；不从 null 本身推断未发出或费用为零。

```json
{
  "id": "resp_a10001",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_4d10"
  },
  "dispatch": 1,
  "attemptId": 2,
  "late": true,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "parameters": {}
  },
  "outcome": "interrupted",
  "initiator": "run_cancelled",
  "timing": {
    "sentAt": null,
    "endedAt": "2026-09-23T10:12:30Z"
  },
  "usage": {
    "input_tokens": "unknown",
    "output_tokens": "unknown",
    "cache_read_tokens": "unknown",
    "cache_write_tokens": "unknown",
    "source": "none"
  },
  "cost": {
    "cost_usd": "unknown",
    "source": "none"
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### 正常回复不能使用 null

预期：`拒绝：malformed`。其余合法，S-17 限定只允许 interrupted。

```json
{
  "id": "resp_4c1e9a",
  "call": {
    "runId": "run_7a02",
    "callId": "mc_19f3"
  },
  "dispatch": 1,
  "attemptId": 1,
  "route": {
    "adaptation": {
      "implementation": {
        "name": "example-family",
        "revision": "impl-1"
      },
      "definition": {
        "modelId": "anthropic/claude-sonnet-4.5",
        "revision": "model-1"
      },
      "configuration": {
        "revision": "config-1",
        "values": {}
      }
    },
    "profile": {
      "origin": "custom",
      "scope": {
        "layer": "organization",
        "organization": "org_7fd2c1"
      },
      "routeName": "anthropic/claude-sonnet-4.5"
    },
    "profileSnapshot": {
      "adaptation": {
        "implementation": {
          "name": "example-family",
          "revision": "impl-1"
        },
        "definition": {
          "modelId": "anthropic/claude-sonnet-4.5",
          "revision": "model-1"
        },
        "configuration": {
          "revision": "config-1",
          "values": {}
        }
      },
      "providers": [
        "anthropic",
        "amazon-bedrock",
        "google-vertex",
        "openai"
      ],
      "allowFallback": true,
      "inputModalities": [
        "text",
        "image"
      ],
      "outputModalities": [
        "text",
        "image"
      ],
      "maxInputTokens": 200000,
      "maxOutputTokens": 64000,
      "updatedAt": "2026-09-20T08:00:00Z",
      "inputConstraints": {
        "maxImageBytes": 5242880
      },
      "upstreamInputLimits": {
        "maxInputTokens": {
          "status": "unknown"
        },
        "maxRequestBytes": {
          "status": "unknown"
        },
        "maxImageBytes": {
          "status": "unknown"
        },
        "maxImages": {
          "status": "unknown"
        }
      }
    },
    "selectedBy": "session",
    "provider": "anthropic",
    "credentialScope": {
      "layer": "tenant",
      "tenant": {
        "organization": "org_7fd2c1",
        "account": "acc_91ab40"
      }
    },
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": {
      "reasoningEffort": "medium",
      "temperature": 0.7
    }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      {
        "id": "b1",
        "kind": "text",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "text": "先读一下配置文件。"
      },
      {
        "id": "b2",
        "kind": "tool_call",
        "visibility": {
          "toHuman": true,
          "toModel": true
        },
        "complete": true,
        "callId": "call_01",
        "tool": "read_file",
        "arguments": {
          "path": "config.toml"
        }
      }
    ]
  },
  "replyDisposition": "persisted",
  "timing": {
    "sentAt": null,
    "firstTokenAt": "2026-09-23T10:00:01.2Z",
    "endedAt": "2026-09-23T10:00:04Z"
  },
  "usage": {
    "input_tokens": 1840,
    "output_tokens": 212,
    "cache_read_tokens": 1536,
    "cache_write_tokens": 0,
    "source": "upstream"
  },
  "cost": {
    "cost_usd": 0.0031,
    "source": "upstream_usage"
  },
  "raw": {
    "headers": {
      "content-type": "text/event-stream",
      "x-generation-id": "gen-1758621600-a1b2c3"
    },
    "body": {
      "storage": "attachments",
      "key": "raw/resp_4c1e9a",
      "mediaType": "text/event-stream",
      "bytes": 18234
    }
  },
  "inputCalibration": {
    "requestInput": {
      "kind": "unavailable",
      "reason": "not_retained"
    },
    "observedInput": {
      "kind": "unavailable",
      "reason": "scope_unknown"
    },
    "outputGroup": {
      "kind": "unavailable",
      "reason": "not_retained"
    }
  }
}
```

### 待提交值仍须实际时刻

以本页 E-1 的完整合法值为基底，删除 replyDisposition 与 late 后，以 `$defs/PendingModelResponse` 为根校验：原实际 sentAt 通过；将其改成 null 则按 S-39 成员形状拒绝 malformed。相同变换作用于合法的有回复 interrupted 分支也拒绝；不得将持久恢复分支混进待提交投影。

### 不能由 Schema 证明的反例

- 没有 dispatched 的值即使形状合规，也违反 S-16；不得保存。
- 将锚点时刻或恢复当前时刻填进 sentAt，即使是合法 Instant，也违反 S-17 来源约束。
- 同次真实时刻仍可用却写 null，违反 S-17；已保存完整原批须原值认回。
- sentAt:null 且 opened 存在时放行重发，违反 S-17/S-18；firstTokenAt 缺席不是“未知”。
- null 与已知实际用量／费用并存时仍保留已知账；null 不能将它们归零或覆盖成未知。

### 其余 null 拒绝边界

对本页各完整合法基底单独做下列变换，其余字段保持；每行都是规范反例，不能借助另一处违规提前拒绝：

| 基底及变换 | 预期 |
|---|---|
| E-2 truncated，将 timing.sentAt 改 null | malformed，S-17/S-27 无专名跨成员条件 |
| 首 token 前合法 failed，将 timing.sentAt 改 null | malformed，同上 |
| 合法 interrupted 删除 timing.sentAt | malformed，必填成员缺席 |
| 合法 interrupted 将 timing.sentAt 改整数或空字符串 | malformed，成员形状 |
| 合法有回复 interrupted 删 replyDisposition/late，按 Pending 校验，将 sentAt 改 null | malformed，S-39 投影成员形状 |

合法中断在已经确认 durable dispatched、且同次实际 sentAt 不可用的事实前提下可以 null；不能用前述“形状通过”代替此前提。


### 锚点参数的恢复一致性

同次计划把要求参数的一项从 A 改为 B、另丢掉 C，并先 durable dispatched，再分别注入：①零 send 取消；②真实 send 后失联且 sentAt 不可用。两支恢复都保留适配后 B 与原 parameterAdjustments/droppedParameters，不把要求值 A 当结果、不把零 send 改写成空参数或全 dropped。真实发送分支抓到的请求必须与固定计划一致；零 send 分支没有 HTTP，不从参数存在宣称已发送，也不据 sentAt:null 推断零费用或重试资格。此为提供者行为义务，Schema 不证明实际来源。


## 本版计量关系实例

完整机器实例在 [examples.json](examples.json)，每例分别标 Schema 与纯关系预期。它们不是给旧日志回填的迁移规则。沿用实例中的 unavailable/scope_unknown 表示该实例未提供可建锚来源。跨分支、unknown 提交和 fixed plan 见 RT10 场景及模型。


## 本批新增规范实例

完整机器实例见 [ready-examples.json](ready-examples.json)；schemaValid只判断形状，不能证明权限、摘要实际相等、来源、跨记录或持久化。引用内容缺失必须unavailable而非空结果；同ResponseId ready费用1.25、final费用1.25，总账仍1.25；无final时仍1.25；若ready费用unknown，则未知笔数1；补账0.8后为0.8且不改两份原值。

## R2 跨记录正反场景（待真实组合验收）

| 场景 | 必须结果 | 证据边界 |
|---|---|---|
| ready.reply 原 image 块没有派生；真实系统转换件在首次 persisted 消息上新增合法文本 rendering + transcript | 接受同一 MessageId/ResponseId 的唯一消息；final.reply/inputCalibration 仍等于 ready 原值 | CB3 形状 + 来源/扩展关系/写权逐项验证 |
| 原块已有 rendering；消息修改它后剥去两侧 renderings 再比较 | 拒绝；原成员不可覆盖 | JSON Schema 各自合法仍不够 |
| 新 rendering.blocks 含新合法派生块，原块序列不变 | 允许；核块类型、id 全消息唯一、可见性合取 | 不能把派生块的新 id 当原块非法增添 |
| 消息改原文本、顺序、visibility、response/id，或仅有 transcript，没有配对 rendering | 拒绝 | 结构坏沿 malformed；合法形状但扩展关系坏仍拒绝写入 |
| 普通 consumer 自报 producedBy=system、没有真实转换来源或消息写权 | 不授权提交；来源不可核 unavailable | acquire 读权不授 anchored 写权 |
| persisted 同批实际提交、回执 unknown，重取转换件已换代 | 认回原消息+原 final 原批；不重跑转换 | 真实丢回执/重启故障验收未开始 |
| 原 outputHistory/response 来源或 blockDigests 可判矛盾，即使 caller 要求 full | invalidInput；零新发送 | full 不绕真实性 |
| 原事实真实，合法派生已证且本次实际选取派生，原 O/φ 映射不适用 | 全量计量；保持历史 inputCalibration | 若实际选取/来源不能确认则 unavailable，不降级掩盖未知 |
| 消费者消失，有 reply 的 ready 永远没人处分 | 保持调用终态+pending；账仍按 ResponseId 一次；不伪造 consumed | 无 reply 则直接 final |
