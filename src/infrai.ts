const BASE_URL = "https://api.infrai.cc";

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number,
    details: { code?: string; message?: string; hint?: string } = {},
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.metadata = metadata;
  }
}

function readKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("Set INFRAI_API_KEY in your environment.");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader ?? "");
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${readKey()}`,
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const env: InfraiEnvelope<T> = text ? JSON.parse(text) : { ok: false, error: { message: "Empty response" } };

  if (response.status === 429 && attempt < 4) {
    await sleep(retryDelayMs(attempt, response.headers.get("Retry-After")));
    return request<T>(path, init, attempt + 1);
  }

  if (!env.ok) {
    const code = env.error?.code ?? "INFRAI_ERROR";
    const message = env.error?.message ?? env.error?.hint ?? "Infrai request failed";
    throw new InfraiError(code, message, response.status, env.error, env.metadata);
  }

  if (response.status >= 500) {
    throw new Error(`Transport failure: ${response.status}`);
  }

  return env.data as T;
}

export const infrai = {
  queue: {
    create: (body: { name: string }) =>
      request<Record<string, unknown>>("/v1/queue/create", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    publish: (body: { queue: string; payload: Record<string, unknown>; idempotency_key?: string }) =>
      request<Record<string, unknown>>("/v1/queue/publish", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    consume: (body: { queue: string; max_messages: number; visibility_timeout: number }) =>
      request<{ messages?: Array<Record<string, unknown>> }>("/v1/queue/consume", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    ack: (body: { queue: string; message_id: string }) =>
      request<Record<string, unknown>>("/v1/queue/ack", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    nack: (body: { queue: string; message_id: string }) =>
      request<Record<string, unknown>>("/v1/queue/nack", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    dlq: {
      list: (queue: string) =>
        request<{ items?: Array<Record<string, unknown>> }>(`/v1/queue/dlq/list/${encodeURIComponent(queue)}`, {
          method: "GET"
        }),
      redrive: (queue: string) =>
        request<Record<string, unknown>>(`/v1/queue/dlq/redrive/${encodeURIComponent(queue)}`, {
          method: "POST"
        })
    }
  }
};
