import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { 
  CronJob, 
  CronJobState, 
  CronPayload, 
  CronSchedule, 
  CronStore, 
  AddJobConfig 
} from './types';

function nowMs(): number {
  return Date.now();
}

function computeNextRun(schedule: CronSchedule, now: number): number | null {
  if (schedule.kind === "at") {
    return schedule.atMs && schedule.atMs > now ? schedule.atMs : null;
  }

  if (schedule.kind === "every") {
    if (!schedule.everyMs || schedule.everyMs <= 0) {
      return null;
    }
    return now + schedule.everyMs;
  }

  if (schedule.kind === "cron" && schedule.expr) {
    try {
      const cronparser = require('cron-parser');
      const interval = cronparser.parseExpression(schedule.expr);
      const nextTime = interval.next().getTime();
      return nextTime;
    } catch {
      return null;
    }
  }

  return null;
}

export class CronService {
  private storePath: string;
  private onJob?: (job: CronJob) => Promise<string | null>;
  private store: CronStore | null = null;
  private timerTask: Promise<void> | null = null;
  private running = false;
  private resolveTimer: (() => void) | null = null;

  constructor(
    storePath: string,
    onJob?: (job: CronJob) => Promise<string | null>
  ) {
    this.storePath = storePath;
    this.onJob = onJob;
  }

  private loadStore(): CronStore {
    if (this.store) {
      return this.store;
    }

    if (existsSync(this.storePath)) {
      try {
        const data = JSON.parse(readFileSync(this.storePath, 'utf-8'));
        const jobs: CronJob[] = [];
        
        for (const j of data.jobs ?? []) {
          jobs.push({
            id: j.id,
            name: j.name,
            enabled: j.enabled ?? true,
            schedule: {
              kind: j.schedule.kind,
              atMs: j.schedule.atMs,
              everyMs: j.schedule.everyMs,
              expr: j.schedule.expr,
              tz: j.schedule.tz,
            },
            payload: {
              kind: j.payload.kind ?? "agent_turn",
              message: j.payload.message ?? "",
              deliver: j.payload.deliver ?? false,
              channel: j.payload.channel,
              to: j.payload.to,
            },
            state: {
              nextRunAtMs: j.state?.nextRunAtMs,
              lastRunAtMs: j.state?.lastRunAtMs,
              lastStatus: j.state?.lastStatus,
              lastError: j.state?.lastError,
            },
            createdAtMs: j.createdAtMs ?? 0,
            updatedAtMs: j.updatedAtMs ?? 0,
            deleteAfterRun: j.deleteAfterRun ?? false,
          });
        }
        
        this.store = { version: data.version ?? 1, jobs };
      } catch (e) {
        console.warn(`Failed to load cron store: ${e}`);
        this.store = { version: 1, jobs: [] };
      }
    } else {
      this.store = { version: 1, jobs: [] };
    }

    return this.store;
  }

  private saveStore(): void {
    if (!this.store) return;

    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: this.store.version,
      jobs: this.store.jobs.map(j => ({
        id: j.id,
        name: j.name,
        enabled: j.enabled,
        schedule: {
          kind: j.schedule.kind,
          atMs: j.schedule.atMs,
          everyMs: j.schedule.everyMs,
          expr: j.schedule.expr,
          tz: j.schedule.tz,
        },
        payload: {
          kind: j.payload.kind,
          message: j.payload.message,
          deliver: j.payload.deliver,
          channel: j.payload.channel,
          to: j.payload.to,
        },
        state: {
          nextRunAtMs: j.state.nextRunAtMs,
          lastRunAtMs: j.state.lastRunAtMs,
          lastStatus: j.state.lastStatus,
          lastError: j.state.lastError,
        },
        createdAtMs: j.createdAtMs,
        updatedAtMs: j.updatedAtMs,
        deleteAfterRun: j.deleteAfterRun,
      })),
    };

    writeFileSync(this.storePath, JSON.stringify(data, null, 2));
  }

  async start(): Promise<void> {
    this.running = true;
    this.loadStore();
    this.recomputeNextRuns();
    this.saveStore();
    this.armTimer();
    console.log(`Cron service started with ${this.store?.jobs.length ?? 0} jobs`);
  }

  stop(): void {
    this.running = false;
    if (this.resolveTimer) {
      this.resolveTimer();
      this.resolveTimer = null;
    }
    this.timerTask = null;
  }

  private recomputeNextRuns(): void {
    if (!this.store) return;
    const now = nowMs();
    for (const job of this.store.jobs) {
      if (job.enabled) {
        job.state.nextRunAtMs = computeNextRun(job.schedule, now) ?? undefined;
      }
    }
  }

  private getNextWakeMs(): number | null {
    if (!this.store) return null;
    const times = this.store.jobs
      .filter(j => j.enabled && j.state.nextRunAtMs)
      .map(j => j.state.nextRunAtMs!);
    return times.length > 0 ? Math.min(...times) : null;
  }

  private armTimer(): void {
    const nextWake = this.getNextWakeMs();
    if (!nextWake || !this.running) return;

    const delayMs = Math.max(0, nextWake - nowMs());
    const delayS = delayMs / 1000;

    this.timerTask = new Promise<void>((resolve) => {
      this.resolveTimer = resolve;
      setTimeout(async () => {
        if (this.running) {
          await this.onTimer();
        }
        resolve();
      }, delayS * 1000);
    });
  }

  private async onTimer(): Promise<void> {
    if (!this.store) return;

    const now = nowMs();
    const dueJobs = this.store.jobs.filter(
      j => j.enabled && j.state.nextRunAtMs && now >= j.state.nextRunAtMs
    );

    for (const job of dueJobs) {
      await this.executeJob(job);
    }

    this.saveStore();
    this.armTimer();
  }

  private async executeJob(job: CronJob): Promise<void> {
    const startMs = nowMs();
    console.log(`Cron: executing job '${job.name}' (${job.id})`);

    try {
      if (this.onJob) {
        await this.onJob(job);
      }
      job.state.lastStatus = "ok";
      job.state.lastError = undefined;
      console.log(`Cron: job '${job.name}' completed`);
    } catch (e) {
      job.state.lastStatus = "error";
      job.state.lastError = String(e);
      console.error(`Cron: job '${job.name}' failed: ${e}`);
    }

    job.state.lastRunAtMs = startMs;
    job.updatedAtMs = nowMs();

    if (job.schedule.kind === "at") {
      if (this.store && job.deleteAfterRun) {
        this.store.jobs = this.store.jobs.filter(j => j.id !== job.id);
      } else {
        job.enabled = false;
        job.state.nextRunAtMs = undefined;
      }
    } else if (this.store) {
      job.state.nextRunAtMs = computeNextRun(job.schedule, nowMs()) ?? undefined;
    }
  }

  listJobs(includeDisabled = false): CronJob[] {
    const store = this.loadStore();
    const jobs = includeDisabled 
      ? store.jobs 
      : store.jobs.filter(j => j.enabled);
    return jobs.sort((a, b) => (a.state.nextRunAtMs ?? Infinity) - (b.state.nextRunAtMs ?? Infinity));
  }

  addJob(config: AddJobConfig): CronJob {
    const store = this.loadStore();
    const now = nowMs();

    const job: CronJob = {
      id: randomUUID().slice(0, 8),
      name: config.name,
      enabled: true,
      schedule: config.schedule,
      payload: {
        kind: "agent_turn",
        message: config.message,
        deliver: config.deliver ?? false,
        channel: config.channel,
        to: config.to,
      },
      state: {
        nextRunAtMs: computeNextRun(config.schedule, now) ?? undefined,
      },
      createdAtMs: now,
      updatedAtMs: now,
      deleteAfterRun: config.deleteAfterRun ?? false,
    };

    store.jobs.push(job);
    this.saveStore();
    this.armTimer();

    console.log(`Cron: added job '${config.name}' (${job.id})`);
    return job;
  }

  removeJob(jobId: string): boolean {
    const store = this.loadStore();
    const before = store.jobs.length;
    store.jobs = store.jobs.filter(j => j.id !== jobId);
    const removed = store.jobs.length < before;

    if (removed) {
      this.saveStore();
      this.armTimer();
      console.log(`Cron: removed job ${jobId}`);
    }

    return removed;
  }

  enableJob(jobId: string, enabled = true): CronJob | null {
    const store = this.loadStore();
    for (const job of store.jobs) {
      if (job.id === jobId) {
        job.enabled = enabled;
        job.updatedAtMs = nowMs();
        if (enabled) {
          job.state.nextRunAtMs = computeNextRun(job.schedule, nowMs()) ?? undefined;
        } else {
          job.state.nextRunAtMs = undefined;
        }
        this.saveStore();
        this.armTimer();
        return job;
      }
    }
    return null;
  }

  async runJob(jobId: string, force = false): Promise<boolean> {
    const store = this.loadStore();
    for (const job of store.jobs) {
      if (job.id === jobId) {
        if (!force && !job.enabled) {
          return false;
        }
        await this.executeJob(job);
        this.saveStore();
        this.armTimer();
        return true;
      }
    }
    return false;
  }

  status(): { enabled: boolean; jobs: number; nextWakeAtMs: number | null } {
    const store = this.loadStore();
    return {
      enabled: this.running,
      jobs: store.jobs.length,
      nextWakeAtMs: this.getNextWakeMs(),
    };
  }
}
