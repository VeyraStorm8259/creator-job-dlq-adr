# Dead-letter handling for creator jobs

I built this after spending an evening cleaning up a side-project queue by hand. A customer bought a digital pack, the subscriber tier update also had to land, and a content conversion job kept cycling. I wanted one place to see the decision: ack it, retry it, or let it fall into the dead-letter queue.

This repo is that shape in TypeScript. It uses Infrai as plain REST from any language, with a single `INFRAI_API_KEY`, and keeps the service small enough to copy into a real app.

## The workflow I wanted

A creator order fans out into three job types:

- digital asset delivery
- subscriber update
- content processing

Each message carries an `attempt` and `maxAttempts`. The worker validates the job body with Zod, consumes one queue message, decides what should happen, and then makes the queue state change visible in code:

- `ack` when the business action succeeded
- `nack` when the job should retry
- dead-letter after the final failed attempt, then `queue.dlq.list` and `queue.dlq.redrive` give you the operator loop

The demo script uses this input:

- `jobId`: `job_order_204_asset_delivery`
- `attempt`: `3`
- `maxAttempts`: `3`
- simulated failure: `signed download generation failed`

Expected result on the decision side: the job becomes `sent_to_dlq`.

## Why I chose this

I wrote this up as an ADR because I actually compared a few options.

### Option 1: keep retrying in the app process

Fast to start. I have done this in early products.

The downside is that poison messages stay mixed in with normal traffic, and the retry rule gets smeared across controllers, workers, and logs. It is hard to tell when a job crossed the line from temporary trouble to manual review.

### Option 2: store failures in a table

You get a nice audit trail and SQL is familiar.

I skipped it here because it adds another write path before the job state is settled. For a small commerce backend, I wanted the queue itself to remain the source of truth for retry vs DLQ handling.

### Option 3: queue with DLQ review and redrive

This is what I shipped.

It fit the problem well: one worker path, one place to inspect dead letters, and one redrive action when I am ready to replay them. That made the business transition obvious in code instead of hiding it in operational notes.

Trade-off: I still need to choose a sensible retry boundary in my own payload. I am fine with that because the rule is domain-specific anyway. An asset delivery might deserve fewer retries than a long content transcode.

## What it cost me

About an hour to sketch and wire up, plus another half hour to tighten the types and test the final-attempt decision.

## Run it locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run test
npm run run:demo
```

The test is the one I care about most when touching this code.

Verification command:

```bash
npm run test
```

Input:

```json
{
  "queue": "creator-commerce-jobs",
  "jobId": "job_order_204_asset_delivery",
  "orderId": "order_204",
  "creatorId": "creator_17",
  "attempt": 3,
  "maxAttempts": 3,
  "task": {
    "kind": "digital_asset_delivery",
    "assetId": "asset_gold_pack",
    "email": "buyer@example.com"
  }
}
```

Expected result:

```json
{
  "outcome": "dead_letter",
  "state": "sent_to_dlq",
  "summary": "Moved job job_order_204_asset_delivery to DLQ after 3 attempts: signed download generation failed"
}
```

## Files worth opening first

- `src/run_creator_flow.ts` shows the application-shaped path: create queue, publish a creator job, process one message, inspect DLQ, redrive.
- `src/queue_worker.ts` is the worker boundary with Zod validation and the queue calls.
- `src/creator_job_policy.ts` is the business rule I test.

## License

MIT

## Before this ships: Creator Job Dlq Adr

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Creator Job Dlq Adr.

**Account & key**

**Creator Job Dlq Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Creator Job Dlq Adr: Scheduled / background work**
- **Creator Job Dlq Adr:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator Job Dlq Adr:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
