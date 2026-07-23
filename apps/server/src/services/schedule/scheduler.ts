/**
 * 进程内调度器：每分钟扫描 due 订阅并执行
 * 单实例部署足够；多实例需另加分布式锁
 */
import { listDueSchedules, pruneOldRuns } from './store.js';
import { runScheduleOnce } from './runner.js';

let timer: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;
let started = false;

const TICK_MS = 30_000;
/** 同一 tick 内最多并行执行的订阅数，避免互相堵死 */
const MAX_PARALLEL = 2;

async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  const concurrency = Math.max(1, Math.min(limit, items.length));
  let idx = 0;
  async function next(): Promise<void> {
    while (idx < items.length) {
      const cur = items[idx++]!;
      await worker(cur);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
}

async function tick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const now = new Date().toISOString();
    const due = listDueSchedules(now);
    await mapPool(due, MAX_PARALLEL, async (schedule) => {
      try {
        const run = await runScheduleOnce(schedule.id);
        console.info(
          '[schedule] run id=%s name=%s status=%s created=%s skipped=%s fetched=%s',
          schedule.id,
          schedule.name,
          run.status,
          run.createdJobs,
          run.skipped,
          run.fetched,
        );
      } catch (err) {
        console.warn(
          '[schedule] run failed id=%s:',
          schedule.id,
          err instanceof Error ? err.message : err,
        );
      }
    });
    // 偶尔清理
    if (Math.random() < 0.05) pruneOldRuns(50);
  } catch (err) {
    console.warn('[schedule] tick error:', err);
  } finally {
    tickRunning = false;
  }
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  // 启动后稍延迟首轮，避免和迁移/插件扫描抢启动
  setTimeout(() => {
    void tick();
  }, 5_000);
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // 不阻止进程退出
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
  console.info('[schedule] scheduler started (interval=%sms)', TICK_MS);
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}

export function isSchedulerStarted(): boolean {
  return started;
}
