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

async function tick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const now = new Date().toISOString();
    const due = listDueSchedules(now);
    for (const schedule of due) {
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
    }
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
