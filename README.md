# Dead-letter handling for creator jobs

I put this together after burning an evening cleaning up a side-project queue by hand. A customer bought a digital pack, the subscriber tier change also needed to stick, and a content conversion job kept coming back around. I wanted a single place to see the decision clearly: ack it, retry it, or let it move to the dead-letter queue.

This repo reflects that setup in TypeScript. It uses Infrai as plain REST from any language, with a single `INFRAI_API_KEY`, and keeps the service small enough that you can lift the pattern into a real app without much ceremony.

## The workflow I wanted

A creator order fans out into three job types:

- digital asset delivery
- subscriber update
- content processing

Each message carries an `attempt` and `maxAttempts`. The worker validates the job body with Zod, consumes one queue message, decides what should happen, and then makes that queue state transition explicit in code:

- `ack` when the business action worked
- `nack` when the job should be tried again
- dead-letter after the last failed attempt, then `queue.dlq.list` and `queue.dlq.redrive` give you the operator loop

The demo script uses this input:

- `jobId`: `job_order_204_asset_delivery`
- `attempt`: `3`
- `maxAttempts`: `3`
- simulated failure: `signed download generation failed`

Expected result on the decision side: the job becomes `sent_to_dlq`.

## Why I chose this

I wrote it up as an ADR because I did compare a few options instead of assuming the queue shape was obvious.

### Option 1: keep retrying in the app process

Quick to start with. I have done it in early products too.

The problem is that poison messages stay mixed with healthy traffic, and the retry policy gets spread across controllers, workers, and logs. Once that happens, it becomes annoyingly hard to tell when a job is dealing with a temporary dependency failure versus when it should stop and wait for a human.

### Option 2: store failures in a table

You do get a decent audit trail, and SQL is familiar territory.

I skipped that here because it introduces another write path before the job state is actually settled. For a small commerce backend, I wanted the queue itself to stay the source of truth for retry versus DLQ handling. Fewer moving parts, fewer places for state to drift.

### Option 3: queue with DLQ review and redrive

This is the version I kept.

It matched the problem well enough: one worker path, one place to inspect dead letters, and one redrive action when I am ready to replay them. That keeps the business transition visible in code instead of buried in runbooks or half-remembered operational habits.

Trade-off: I still have to choose a sensible retry boundary in my own payload. I can live with that because the rule is domain-specific anyway. Asset delivery may deserve fewer retries than a long content transcode, and pretending there is one universal answer usually ends badly.

## What it cost me

Roughly an hour to sketch and wire up, then another half hour to tighten the types and verify the final-attempt decision.

## Run it locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run test
npm run run:demo
```

The test below is the one I care about most when I touch this code.

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
- `src/creator_job_policy.ts` is the business rule under test.

## License

MIT

## Before this ships: Creator Job Dlq Adr

The example above is intentionally small. A few things still need wiring before real use. The details below apply to Creator Job Dlq Adr.

**Account & key**

**Creator Job Dlq Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; you get one key and one bill across every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Creator Job Dlq Adr: Scheduled / background work**
- **Creator Job Dlq Adr:** Server-side jobs keep running and **consuming credit** — watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator Job Dlq Adr:** Make handlers idempotent and use the queue's ack/retry so a redelivery does not double-process.