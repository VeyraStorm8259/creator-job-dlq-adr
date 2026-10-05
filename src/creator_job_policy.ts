import { CreatorJob, ProcessingResult } from "./creator_job_types";

export function decideCreatorJobResult(job: CreatorJob, failureReason?: string): ProcessingResult {
  if (!failureReason) {
    switch (job.task.kind) {
      case "digital_asset_delivery":
        return {
          outcome: "ack",
          state: "delivered",
          summary: `Delivered asset ${job.task.assetId} for order ${job.orderId}`
        };
      case "subscriber_update":
        return {
          outcome: "ack",
          state: "updated",
          summary: `Updated subscriber ${job.task.subscriberId} to ${job.task.plan}`
        };
      case "content_processing":
        return {
          outcome: "ack",
          state: "processed",
          summary: `Processed content ${job.task.contentId} as ${job.task.format}`
        };
    }
  }

  if (job.attempt >= job.maxAttempts) {
    return {
      outcome: "dead_letter",
      state: "sent_to_dlq",
      summary: `Moved job ${job.jobId} to DLQ after ${job.attempt} attempts: ${failureReason ?? "failed"}`
    };
  }

  return {
    outcome: "retry",
    state: "queued_for_retry",
    summary: `Retry job ${job.jobId} at attempt ${job.attempt + 1}: ${failureReason ?? "failed"}`
  };
}
