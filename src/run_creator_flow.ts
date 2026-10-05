import { enqueueCreatorJob, ensureQueue, listDeadLetters, processOneMessage, redriveDeadLetters } from "./queue_worker";
import { CreatorJob } from "./creator_job_types";

const queue = process.env.CREATOR_QUEUE_NAME ?? "creator-commerce-jobs";

const sampleJob: CreatorJob = {
  queue,
  jobId: "job_order_204_asset_delivery",
  orderId: "order_204",
  creatorId: "creator_17",
  attempt: 3,
  maxAttempts: 3,
  task: {
    kind: "digital_asset_delivery",
    assetId: "asset_gold_pack",
    email: "buyer@example.com"
  }
};

async function main(): Promise<void> {
  await ensureQueue(queue);
  await enqueueCreatorJob(sampleJob);

  const firstPass = await processOneMessage(queue, (job) => {
    if (job.task.kind === "digital_asset_delivery") {
      return "signed download generation failed";
    }
    return undefined;
  });

  console.log("first pass", firstPass);

  const dlqItems = await listDeadLetters(queue);
  console.log("dlq count", dlqItems.length);

  await redriveDeadLetters(queue);
  console.log("redrive requested", { queue });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
