// Plan morning-digest § 1. The contract every part of § 2 builds against.
// The reader itself lives in `src/digest/read.ts` and exports `readNight: ReadNight`.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of `runs/<night>.jsonl`, after parsing at the edge. */
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for the night. */
export type DigestRow = {
  job: string;
  owner: string | null; // views render null as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line that had one
  firstAt: string; // `at` of the first line, offset kept
  lastAt: string; // `at` of the last line, offset kept
};

/** Line counts by status, for the status board. */
export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job, so page and JSON agree
  counts: StatusCounts;
  badLines: number; // lines that did not parse: counted, never thrown
};

/**
 * Reads `<runsDir>/<night>.jsonl`. Returns `null` when the night has no file (routes answer 404).
 * An empty file gives a Night with no rows. Never throws on a bad line.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
