import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const normal = [
  { at: '2026-10-28T02:00:00+01:00', job: 'ingest', status: 'ok', owner: 'ana' },
  { at: '2026-10-28T02:10:00+01:00', job: 'build', status: 'retry', owner: 'ben', error: 'timeout' },
  { at: '2026-10-28T02:20:00+01:00', job: 'build', status: 'retry', owner: 'ben', error: 'timeout' },
  { at: '2026-10-28T02:30:00+01:00', job: 'build', status: 'retry', owner: 'ben', error: 'timeout' },
  { at: '2026-10-28T02:40:00+01:00', job: 'build', status: 'fail', owner: 'ben', error: 'out of memory' },
  { at: '2026-10-28T03:00:00+01:00', job: 'digest', status: 'ok', owner: null },
];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), normal.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-10-30.jsonl'),
    [
      JSON.stringify({ at: '2026-10-30T02:00:00+01:00', job: 'sync', status: 'ok', owner: 'ana' }),
      'this is not json',
      JSON.stringify({ at: '2026-10-30T02:05:00+01:00', job: 'ingest', status: 'ok', owner: 'ana' }),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders the normal night with its jobs in order', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest 2026-10-28');
    expect(html).toContain('3 retries');
    const order = ['<td>build</td>', '<td>digest</td>', '<td>ingest</td>'].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-11-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('no such night');
  });

  it('renders the empty night as nothing ran', async () => {
    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('renders the bad-line night with the good rows still there', async () => {
    const res = await app.request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line could not be read');
    expect(html).toContain('<td>ingest</td>');
    expect(html).toContain('<td>sync</td>');
    expect(html.indexOf('<td>ingest</td>')).toBeLessThan(html.indexOf('<td>sync</td>'));
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with the normal night and its jobs in order', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['build', 'digest', 'ingest']);
    expect(body.rows[0]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'fail', lastError: 'out of memory' });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: '2026-11-01' });
  });

  it('answers 200 with no rows for the empty night', async () => {
    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; badLines: number };
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('answers 200 with the bad line counted and the good rows kept', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['ingest', 'sync']);
  });
});
