import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "msg-123" }, error: null }),
    },
  })),
}));

// --------------------------------------------------------------------------
// Environment setup helpers
// --------------------------------------------------------------------------

function setValidResendEnv() {
  vi.stubEnv("RESEND_API_KEY", "re_testkey_abc123");
  vi.stubEnv("RESEND_AUTH_FROM", "Blumo <no-reply@mail.arpankarki.com.np>");
  vi.stubEnv("RESEND_TASKS_FROM", "Blumo Tasks <tasks@mail.arpankarki.com.np>");
  vi.stubEnv("RESEND_PROGRESS_FROM", "Blumo Progress <progress@mail.arpankarki.com.np>");
  vi.stubEnv("RESEND_SUPPORT_FROM", "Blumo Support <support@mail.arpankarki.com.np>");
  vi.stubEnv("RESEND_REPLY_TO", "support@example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  // Required base env
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "service-key");
  vi.stubEnv("GITHUB_APP_ID", "1234567");
  vi.stubEnv("GITHUB_APP_SLUG", "blumo-dev");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "webhook-secret");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// --------------------------------------------------------------------------
// A. Configuration validation
// --------------------------------------------------------------------------

describe("server env — Resend configuration", () => {
  it("accepts a valid re_ API key", async () => {
    setValidResendEnv();
    const { serverEnv } = await import("@/lib/env/server");
    expect(serverEnv.RESEND_API_KEY).toBe("re_testkey_abc123");
  });

  it("rejects a non-re_ API key", async () => {
    setValidResendEnv();
    vi.stubEnv("RESEND_API_KEY", "sk-not-resend");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(import("@/lib/env/server")).rejects.toThrow(
      "Invalid server environment variables"
    );
  });

  it("accepts optional missing RESEND_API_KEY", async () => {
    setValidResendEnv();
    vi.stubEnv("RESEND_API_KEY", "");
    const envMod = await import("@/lib/env/server");
    // Empty string is treated as missing (falsy); configured returns false
    expect(envMod.isResendConfigured()).toBe(false);
  });

  it("rejects a sender address not using the verified domain", async () => {
    setValidResendEnv();
    vi.stubEnv("RESEND_AUTH_FROM", "Blumo <no-reply@gmail.com>");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(import("@/lib/env/server")).rejects.toThrow(
      "Invalid server environment variables"
    );
  });

  it("getResendConfigState returns no secrets", async () => {
    setValidResendEnv();
    const { getResendConfigState } = await import("@/lib/env/server");
    const state = getResendConfigState();
    expect(state).toMatchObject({
      configured: true,
      hasApiKey: true,
      hasAuthFrom: true,
    });
    // Must not expose the API key value
    expect(JSON.stringify(state)).not.toContain("re_testkey");
  });

  it("isResendConfigured returns false when key is missing", async () => {
    setValidResendEnv();
    vi.stubEnv("RESEND_API_KEY", "");
    const { isResendConfigured } = await import("@/lib/env/server");
    expect(isResendConfigured()).toBe(false);
  });
});

// --------------------------------------------------------------------------
// B. Resend client
// --------------------------------------------------------------------------

describe("Resend client", () => {
  it("returns null when not configured", async () => {
    setValidResendEnv();
    vi.stubEnv("RESEND_API_KEY", "");
    const { getResendClient } = await import("@/lib/email/client");
    expect(getResendClient()).toBeNull();
  });

  it("returns a client when configured", async () => {
    setValidResendEnv();
    const emailMod = await import("@/lib/email/client");
    const client = emailMod.getResendClient();
    expect(client).not.toBeNull();
  });
});

// --------------------------------------------------------------------------
// C. sendEmail — normalized result
// --------------------------------------------------------------------------

describe("sendEmail", () => {
  it("returns ok with messageId on success", async () => {
    setValidResendEnv();
    const mockClient = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "msg-456" }, error: null }),
      },
    };
    const { sendEmail } = await import("@/lib/email/client");
    const result = await sendEmail({
      to: "user@example.com",
      from: "Blumo <no-reply@mail.arpankarki.com.np>",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
      emailType: "welcome",
      idempotencyKey: "test-key",
      // @ts-expect-error injected mock
      _client: mockClient,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toBe("msg-456");
      expect(result.emailType).toBe("welcome");
    }
  });

  it("returns configuration_error when client is null", async () => {
    setValidResendEnv();
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendEmail } = await import("@/lib/email/client");
    const result = await sendEmail({
      to: "user@example.com",
      from: "Blumo <no-reply@mail.arpankarki.com.np>",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
      emailType: "welcome",
      idempotencyKey: "test-key",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("configuration_error");
    }
  });

  it("returns rate_limited on 429", async () => {
    setValidResendEnv();
    const mockClient = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "rate_limit_exceeded", statusCode: 429, message: "Rate limit" },
        }),
      },
    };
    const { sendEmail } = await import("@/lib/email/client");
    const result = await sendEmail({
      to: "user@example.com",
      from: "Blumo <no-reply@mail.arpankarki.com.np>",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
      emailType: "welcome",
      idempotencyKey: "test-key",
      // @ts-expect-error injected mock
      _client: mockClient,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("rate_limited");
      expect(result.retryable).toBe(true);
    }
  });

  it("returns unauthorized on 401", async () => {
    setValidResendEnv();
    const mockClient = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "unauthorized", statusCode: 401, message: "Unauthorized" },
        }),
      },
    };
    const { sendEmail } = await import("@/lib/email/client");
    const result = await sendEmail({
      to: "user@example.com",
      from: "Blumo <no-reply@mail.arpankarki.com.np>",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
      emailType: "welcome",
      idempotencyKey: "test-key",
      // @ts-expect-error injected mock
      _client: mockClient,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthorized");
      expect(result.retryable).toBe(false);
    }
  });

  it("never logs the API key", async () => {
    setValidResendEnv();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mockClient = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "internal_server_error", statusCode: 500, message: "Error" },
        }),
      },
    };
    const { sendEmail } = await import("@/lib/email/client");
    await sendEmail({
      to: "user@example.com",
      from: "Blumo <no-reply@mail.arpankarki.com.np>",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
      emailType: "welcome",
      idempotencyKey: "test-key",
      // @ts-expect-error injected mock
      _client: mockClient,
    });
    const logged = consoleSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("re_testkey");
    consoleSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// D. Templates
// --------------------------------------------------------------------------

describe("email templates", () => {
  it("welcomeTemplate produces absolute CTA URL", async () => {
    setValidResendEnv();
    const { welcomeTemplate } = await import("@/lib/email/templates");
    const { html, text } = welcomeTemplate({
      recipientName: "Alice",
      goal: "Learn TypeScript",
    });
    // Must contain absolute URL, not relative
    expect(html).toMatch(/href="http(s)?:\/\//);
    expect(text).toContain("http");
  });

  it("welcomeTemplate escapes HTML in user name", async () => {
    setValidResendEnv();
    const { welcomeTemplate } = await import("@/lib/email/templates");
    const { html } = welcomeTemplate({
      recipientName: "<script>alert(1)</script>",
      goal: "Learn React",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("commitSuccessTemplate includes GitHub commit URL", async () => {
    setValidResendEnv();
    const { commitSuccessTemplate } = await import("@/lib/email/templates");
    const { html, text } = commitSuccessTemplate({
      recipientName: "Bob",
      missionTitle: "Learn arrays",
      repositoryFullName: "bob/my-repo",
      branch: "blumo/2026-01-01-learn-arrays",
      filePath: "blumo/2026-01-01-learn-arrays.md",
      commitMessage: "docs: add learning note",
      commitUrl: "https://github.com/bob/my-repo/commit/abc1234",
      commitSha: "abc1234567890",
      taskId: "task-uuid",
    });
    expect(html).toContain("abc1234");
    expect(text).toContain("abc1234");
    // CommitUrl must appear in the html
    expect(html).toContain("https://github.com/bob/my-repo/commit/abc1234");
  });

  it("templates do not contain raw JavaScript", async () => {
    setValidResendEnv();
    const { welcomeTemplate } = await import("@/lib/email/templates");
    const { html } = welcomeTemplate({ recipientName: "Alice", goal: "Test" });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/javascript:/i);
    // Check specifically for inline event handlers (onclick, onload, etc.)
    expect(html).not.toMatch(/\s+on[a-z]+\s*=/i);
  });

  it("testEmailTemplate includes no-production notice", async () => {
    setValidResendEnv();
    const { testEmailTemplate } = await import("@/lib/email/templates");
    const { html } = testEmailTemplate({ recipientName: "Dev" });
    expect(html).toContain("development");
  });
});

// --------------------------------------------------------------------------
// E. No secrets in output
// --------------------------------------------------------------------------

describe("no secrets in output", () => {
  it("EMAIL_ERROR_MESSAGES does not contain API key pattern", async () => {
    const { EMAIL_ERROR_MESSAGES } = await import("@/lib/email/types");
    const allMessages = Object.values(EMAIL_ERROR_MESSAGES).join(" ");
    expect(allMessages).not.toMatch(/re_[a-zA-Z0-9]/);
    expect(allMessages).not.toContain("api_key");
  });
});
