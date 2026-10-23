import { expect, mock, test } from "bun:test";

// Stub external delivery and configuration, not validation or route handling.
const send = mock(async (message: unknown) => {
  void message;
  return { data: { id: "test-message" }, error: null };
});
mock.module("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
mock.module("@/app/env", () => ({
  env: {
    RESEND_API_KEY: "schema-test-placeholder",
    CMUX_FEEDBACK_FROM_EMAIL: "sender@example.test",
    CMUX_FEEDBACK_RATE_LIMIT_ID: "schema-test",
  },
}));
mock.module("@vercel/firewall", () => ({
  checkRateLimit: async () => ({ rateLimited: false }),
}));
const { POST } = await import("../app/api/feedback/route");

for (const [email, message] of [
  ["not-an-email", "hello"],
  ["parent@example.test", "   "],
  ["parent@example.test", "x".repeat(4001)],
]) {
  test(`feedback rejects invalid input (${email}, ${message.length} characters)`, async () => {
    send.mockClear();
    const data = new FormData();
    data.set("email", email!);
    data.set("message", message!);
    const response = await POST(new Request("https://example.test/api/feedback", { method: "POST", body: data }));
    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
}

test("feedback accepts and trims valid schema input before delivery", async () => {
  send.mockClear();
  const data = new FormData();
  data.set("email", "  parent@example.test  ");
  data.set("message", "  hello  ");
  const response = await POST(new Request("https://example.test/api/feedback", { method: "POST", body: data }));
  expect(response.status).toBe(200);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "parent@example.test" }));
});
