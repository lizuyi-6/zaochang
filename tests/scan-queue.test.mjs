import assert from "node:assert/strict";
import { test } from "node:test";
import { ScanQueue } from "../deploy/server/scan-queue.mjs";

test("scan queue grants waiting slots in FIFO order", async () => {
  const queue = new ScanQueue({ maxActive: 1, maxQueued: 3, waitMs: 100 });
  const first = await queue.acquire();
  const secondPending = queue.acquire();
  const thirdPending = queue.acquire();
  assert.equal(queue.queued, 2);

  first.release();
  const second = await secondPending;
  assert.equal(queue.queued, 1);
  second.release();
  const third = await thirdPending;
  assert.equal(queue.queued, 0);
  third.release();
  assert.equal(queue.busy, false);
});

test("scan queue rejects immediately when its waiting capacity is full", async () => {
  const queue = new ScanQueue({ maxQueued: 1, waitMs: 100 });
  const active = await queue.acquire();
  const waiting = queue.acquire();
  assert.equal(await queue.acquire(), null);
  assert.equal(queue.queued, 1);
  active.release();
  const granted = await waiting;
  assert.ok(granted);
  granted.release();
});

test("scan queue timeout rejects without occupying a slot", async () => {
  const queue = new ScanQueue({ maxQueued: 1, waitMs: 5 });
  const active = await queue.acquire();
  const timedOut = await queue.acquire();
  assert.equal(timedOut, null);
  assert.equal(queue.queued, 0);
  active.release();
  assert.equal(queue.busy, false);
  const next = await queue.acquire();
  assert.ok(next);
  next.release();
});

test("releasing a slot admits only the next waiter and duplicate release is inert", async () => {
  const queue = new ScanQueue({ maxQueued: 3, waitMs: 100 });
  const first = await queue.acquire();
  const secondPending = queue.acquire();
  const thirdPending = queue.acquire();
  first.release();
  const second = await secondPending;

  let fourthResolved = false;
  const fourthPending = queue.acquire().then((lease) => {
    fourthResolved = true;
    return lease;
  });
  second.release();
  second.release();
  const third = await thirdPending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fourthResolved, false, "the duplicate release must not grant a second active slot");

  third.release();
  const fourth = await fourthPending;
  assert.ok(fourth);
  fourth.release();
  assert.equal(queue.busy, false);
});

test("canceling a waiter removes it and the next FIFO waiter receives the released slot", async () => {
  const queue = new ScanQueue({ maxQueued: 2, waitMs: 100 });
  const active = await queue.acquire();
  const controller = new AbortController();
  const canceledPending = queue.acquire(controller.signal);
  const nextPending = queue.acquire();

  controller.abort();
  assert.equal(await canceledPending, null);
  assert.equal(queue.queued, 1);
  active.release();
  const next = await nextPending;
  assert.ok(next);
  assert.equal(queue.queued, 0);
  next.release();
  assert.equal(queue.busy, false);
});
