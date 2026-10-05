import { infrai } from "./infrai";
import { decideCreatorJobResult } from "./creator_job_policy";
import { CreatorJob, ProcessingResult, creatorJobSchema } from "./creator_job_types";

export async function ensureQueue(queue: string): Promise<void> {
  await infrai.queue.create({ name: queue });
}

export async function enqueueCreatorJob(job: CreatorJob): Promise<void> {
  const parsed = creatorJobSchema.parse(job);
  await infrai.queue.publish({
    queue: parsed.queue,
    idempotency_key: parsed.jobId,
    payload: {
      job: parsed
    }
  });
}

function readMessageId(message: Record<string, unknown>): string {
  const value = message.message_id;
  if (typeof value !== "string" || !value) {
    throw new Error("Message missing message_id");
  }
  return value;
}

function readJob(message: Record<string, unknown>): CreatorJob {
  const payload = message.payload;
  if (!payload || typeof payload !== "object") {
    throw new Error("Message missing payload");
  }
  const payloadObject = payload as Record<string, unknown>;
  return creatorJobSchema.parse(payloadObject.job);
}

export async function processOneMessage(
  queue: string,
  simulateFailure?: (job: CreatorJob) => string | undefined
): Promise<ProcessingResult | null> {
  const batch = await infrai.queue.consume({
    queue,
    max_messages: 1,
    visibility_timeout: 30
  });

  const message = batch.messages?.[0];
  if (!message) {
    return null;
  }

  const messageId = readMessageId(message);
  const job = readJob(message);
  const failureReason = simulateFailure?.(job);
  const decision = decideCreatorJobResult(job, failureReason);

  if (decision.outcome === "ack") {
    await infrai.queue.ack({ queue, message_id: messageId });
    return decision;
  }

  await infrai.queue.nack({ queue, message_id: messageId });
  return decision;
}

export async function listDeadLetters(queue: string): Promise<Array<Record<string, unknown>>> {
  const result = await infrai.queue.dlq.list(queue);
  return result.items ?? [];
}

export async function redriveDeadLetters(queue: string): Promise<void> {
  await infrai.queue.dlq.redrive(queue);
}
