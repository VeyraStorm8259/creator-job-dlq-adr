import { z } from "zod";

export const creatorJobSchema = z.object({
  queue: z.string().min(1),
  jobId: z.string().min(1),
  orderId: z.string().min(1),
  creatorId: z.string().min(1),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1),
  task: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("digital_asset_delivery"),
      assetId: z.string().min(1),
      email: z.string().email()
    }),
    z.object({
      kind: z.literal("subscriber_update"),
      subscriberId: z.string().min(1),
      plan: z.enum(["free", "supporter", "vip"]),
      action: z.enum(["activate", "cancel"])
    }),
    z.object({
      kind: z.literal("content_processing"),
      contentId: z.string().min(1),
      format: z.enum(["mp4", "pdf", "zip"]),
      sourceUrl: z.string().url()
    })
  ])
});

export type CreatorJob = z.infer<typeof creatorJobSchema>;

export type ProcessingResult =
  | { outcome: "ack"; state: "delivered" | "updated" | "processed"; summary: string }
  | { outcome: "retry"; state: "queued_for_retry"; summary: string }
  | { outcome: "dead_letter"; state: "sent_to_dlq"; summary: string };
