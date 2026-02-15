import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CronService } from '../../src/cron/service';
import type { CronSchedule, AddJobConfig } from '../../src/cron/types';
import { unlinkSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const TEST_STORE_PATH = '/tmp/deadbot_test_cron.json';

describe('CronService', () => {
  let service: CronService;

  beforeEach(() => {
    if (existsSync(TEST_STORE_PATH)) {
      unlinkSync(TEST_STORE_PATH);
    }
    service = new CronService(TEST_STORE_PATH);
  });

  afterEach(() => {
    service.stop();
    if (existsSync(TEST_STORE_PATH)) {
      unlinkSync(TEST_STORE_PATH);
    }
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(service).toBeDefined();
    });
  });

  describe('addJob()', () => {
    it('should add a job with "every" schedule', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job = service.addJob({
        name: 'Test Job',
        schedule,
        message: 'Hello',
      });

      expect(job.id).toBeDefined();
      expect(job.name).toBe('Test Job');
      expect(job.schedule.kind).toBe('every');
      expect(job.enabled).toBe(true);
    });

    it('should add a job with "at" schedule', async () => {
      await service.start();

      const futureTime = Date.now() + 3600000;
      const schedule: CronSchedule = { kind: 'at', atMs: futureTime };
      const job = service.addJob({
        name: 'One-time Job',
        schedule,
        message: 'Hello',
      });

      expect(job.schedule.kind).toBe('at');
      expect(job.schedule.atMs).toBe(futureTime);
    });

    it('should add a job with deleteAfterRun flag', async () => {
      await service.start();

      const futureTime = Date.now() + 3600000;
      const schedule: CronSchedule = { kind: 'at', atMs: futureTime };
      const job = service.addJob({
        name: 'One-time Job',
        schedule,
        message: 'Hello',
        deleteAfterRun: true,
      });

      expect(job.deleteAfterRun).toBe(true);
    });
  });

  describe('listJobs()', () => {
    it('should return empty list initially', async () => {
      await service.start();
      const jobs = service.listJobs();
      expect(jobs).toEqual([]);
    });

    it('should list all jobs including disabled', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      service.addJob({ name: 'Job 1', schedule, message: 'Hello' });
      service.addJob({ name: 'Job 2', schedule, message: 'World' });

      const jobs = service.listJobs(true);
      expect(jobs).toHaveLength(2);
    });

    it('should filter disabled jobs by default', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job1 = service.addJob({ name: 'Job 1', schedule, message: 'Hello' });
      service.addJob({ name: 'Job 2', schedule, message: 'World' });

      service.enableJob(job1.id, false);

      const jobs = service.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('Job 2');
    });
  });

  describe('removeJob()', () => {
    it('should remove a job by id', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job = service.addJob({ name: 'Test Job', schedule, message: 'Hello' });

      const removed = service.removeJob(job.id);
      expect(removed).toBe(true);

      const jobs = service.listJobs(true);
      expect(jobs).toHaveLength(0);
    });

    it('should return false for non-existent job', async () => {
      await service.start();
      const removed = service.removeJob('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('enableJob()', () => {
    it('should disable a job', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job = service.addJob({ name: 'Test Job', schedule, message: 'Hello' });

      const result = service.enableJob(job.id, false);
      expect(result).toBeDefined();
      expect(result?.enabled).toBe(false);
    });

    it('should enable a disabled job', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job = service.addJob({ name: 'Test Job', schedule, message: 'Hello' });
      service.enableJob(job.id, false);

      const result = service.enableJob(job.id, true);
      expect(result).toBeDefined();
      expect(result?.enabled).toBe(true);
    });

    it('should return null for non-existent job', async () => {
      await service.start();
      const result = service.enableJob('non-existent', true);
      expect(result).toBeNull();
    });
  });

  describe('runJob()', () => {
    it('should manually run a job', async () => {
      await service.start();

      let executed = false;
      service = new CronService(TEST_STORE_PATH, async () => {
        executed = true;
        return 'done';
      });

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job = service.addJob({ name: 'Test Job', schedule, message: 'Hello' });

      const result = await service.runJob(job.id);
      expect(result).toBe(true);
      expect(executed).toBe(true);
    });

    it('should not run disabled job without force', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job = service.addJob({ name: 'Test Job', schedule, message: 'Hello' });
      service.enableJob(job.id, false);

      const result = await service.runJob(job.id, false);
      expect(result).toBe(false);
    });

    it('should run disabled job with force flag', async () => {
      await service.start();

      let executed = false;
      service = new CronService(TEST_STORE_PATH, async () => {
        executed = true;
        return null;
      });

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      const job = service.addJob({ name: 'Test Job', schedule, message: 'Hello' });
      service.enableJob(job.id, false);

      const result = await service.runJob(job.id, true);
      expect(result).toBe(true);
      expect(executed).toBe(true);
    });
  });

  describe('status()', () => {
    it('should return correct status', async () => {
      await service.start();

      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      service.addJob({ name: 'Job 1', schedule, message: 'Hello' });
      service.addJob({ name: 'Job 2', schedule, message: 'World' });

      const status = service.status();
      expect(status.enabled).toBe(true);
      expect(status.jobs).toBe(2);
      expect(status.nextWakeAtMs).toBeDefined();
    });

    it('should return not enabled before start', () => {
      const status = service.status();
      expect(status.enabled).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist jobs to disk', async () => {
      const schedule: CronSchedule = { kind: 'every', everyMs: 60000 };
      service.addJob({ name: 'Test Job', schedule, message: 'Hello' });
      service.stop();

      const service2 = new CronService(TEST_STORE_PATH);
      await service2.start();

      const jobs = service2.listJobs(true);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('Test Job');

      service2.stop();
    });
  });
});
