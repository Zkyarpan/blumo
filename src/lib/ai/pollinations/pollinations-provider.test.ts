import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AIProviderError } from "../ai-provider.errors";
import { validateMissionOutput } from "@/features/missions/mission-output.schema";
import { PollinationsProvider } from "./pollinations-provider";
import { POLLINATIONS_TEXT_ENDPOINT } from "./pollinations.config";

const REQUEST = {
  systemPrompt: "system mission rules",
  userPrompt: '{"goal":"practice"}',
  responseSchemaVersion: "mission-v1",
  temperature: 0.2,
  maxOutputTokens: 1_500,
};

describe("PollinationsProvider", () => {
  it("accepts a real-provider-shaped envelope whose content is a valid mission", async () => {
    const mission = {
      title: "Practice state transition reasoning",
      description:
        "Create a conceptual example explaining how a value changes across two user interactions.",
      estimated_minutes: 30,
      difficulty: "beginner",
      acceptance_checklist: [
        "Describe two observable state transitions in plain language",
        "Explain why each transition produces its expected result",
      ],
      suggested_commit_message: "Document state transition reasoning",
      suggested_branch: "main",
      learning_outcome:
        "Explain predictable state transitions using a focused example.",
    };
    const provider = new PollinationsProvider(
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "plln-request-123",
            object: "chat.completion",
            created: 1_753_000_000,
            model: "openai-fast",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(mission),
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 420,
              completion_tokens: 180,
              total_tokens: 600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ),
      () => ({ apiKey: "secret", model: "openai" })
    );

    const result = await provider.generateMission(REQUEST, {
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      providerId: "pollinations",
      modelId: "openai-fast",
      usage: { inputUnits: 420, outputUnits: 180 },
    });
    expect(
      validateMissionOutput(result.content, {
        dailyMinutes: 30,
        experienceLevel: "beginner",
        defaultBranch: "main",
      })
    ).toEqual({ ok: true, mission });
  });

  it("sends the documented safe, non-streaming structured request without leaking the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "safe-request-id",
          model: "openai-fast",
          choices: [{ message: { content: '{"title":"Mission"}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const provider = new PollinationsProvider(fetchMock, () => ({
      apiKey: "sk-super-secret",
      model: "openai",
    }));

    const result = await provider.generateMission(REQUEST, {
      signal: new AbortController().signal,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(POLLINATIONS_TEXT_ENDPOINT);
    expect(url).not.toContain("sk-super-secret");
    expect(init.headers).toEqual({
      Authorization: "Bearer sk-super-secret",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "openai",
      messages: [
        { role: "system", content: REQUEST.systemPrompt },
        { role: "user", content: REQUEST.userPrompt },
      ],
      stream: false,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1_500,
      safe: "sexual,violence",
    });
    expect(String(init.body)).not.toContain("sk-super-secret");
    expect(result).toEqual({
      content: '{"title":"Mission"}',
      providerId: "pollinations",
      modelId: "openai-fast",
      usage: { inputUnits: 12, outputUnits: 8 },
      requestId: "safe-request-id",
    });
  });

  it.each([
    [401, "authentication_error", false],
    [402, "quota_exhausted", false],
    [408, "timed_out", true],
    [429, "rate_limited", true],
    [502, "temporarily_unavailable", true],
    [503, "temporarily_unavailable", true],
    [504, "temporarily_unavailable", true],
    [400, "request_rejected", false],
  ] as const)("maps HTTP %i to %s", async (status, code, retrySafe) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = new PollinationsProvider(
      vi.fn().mockResolvedValue(
        new Response("provider body must stay private", {
          status,
          headers: { "Retry-After": "1" },
        })
      ),
      () => ({ apiKey: "secret-key", model: "openai" })
    );

    try {
      await provider.generateMission(REQUEST, {
        signal: new AbortController().signal,
      });
      throw new Error("expected provider error");
    } catch (error) {
      expect(error).toBeInstanceOf(AIProviderError);
      expect(error).toMatchObject({ code, retrySafe });
      expect(String(error)).not.toContain("provider body");
      expect(String(error)).not.toContain("secret-key");
      expect(warning).toHaveBeenCalledWith("[mission-validation]", {
        stage: "provider_envelope",
        failedFields: ["request"],
        issueCodes: ["custom"],
        category: `provider_http_${status}`,
      });
      expect(JSON.stringify(warning.mock.calls)).not.toContain("provider body");
      expect(JSON.stringify(warning.mock.calls)).not.toContain("secret-key");
      warning.mockRestore();
    }
  });

  it("rejects missing choices and non-JSON envelopes as invalid_response", async () => {
    const missingChoice = new PollinationsProvider(
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [] }), { status: 200 })
      ),
      () => ({ apiKey: "secret", model: "openai" })
    );
    await expect(
      missingChoice.generateMission(REQUEST, {
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: "invalid_response", retrySafe: false });

    const nonJson = new PollinationsProvider(
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
      () => ({ apiKey: "secret", model: "openai" })
    );
    await expect(
      nonJson.generateMission(REQUEST, {
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: "invalid_response", retrySafe: false });
  });

  it("normalizes transport and abort failures", async () => {
    const networkProvider = new PollinationsProvider(
      vi.fn().mockRejectedValue(new TypeError("socket with secret")),
      () => ({ apiKey: "secret", model: "openai" })
    );
    await expect(
      networkProvider.generateMission(REQUEST, {
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: "temporarily_unavailable",
      retrySafe: true,
    });

    const controller = new AbortController();
    controller.abort();
    const abortProvider = new PollinationsProvider(
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
      () => ({ apiKey: "secret", model: "openai" })
    );
    await expect(
      abortProvider.generateMission(REQUEST, { signal: controller.signal })
    ).rejects.toMatchObject({ code: "timed_out", retrySafe: true });
  });
});
