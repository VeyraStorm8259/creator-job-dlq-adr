import test from "node:test";
import assert from "node:assert/strict";
import { decideCreatorJobResult } from "../src/creator_job_policy";
import { CreatorJob } from "../src/creator_job_types";

const failingDelivery: CreatorJob = {
  queue: "creator-commerce-jobs",
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

test("sends a poisoned creator delivery job to dead letter on the final attempt", () => {
  const result = decideCreatorJobResult(failingDelivery, "signed download generation failed");

  assert.deepEqual(result, {
    outcome: "dead_letter",
    state: "sent_to_dlq",
    summary: "Moved job job_order_204_asset_delivery to DLQ after 3 attempts: signed download generation failed"
  });
});
