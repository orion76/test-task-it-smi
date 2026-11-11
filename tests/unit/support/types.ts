/**
 * Types of the disposable project harness.
 *
 * The helpers themselves live in `temporary-project.ts`: a copy of the project under `.tmp/` that a
 * spec may break on purpose and run in a child process. The shapes of that exchange — what the
 * harness prints back and what the spec does with the copy — are declared here.
 */

/** What a harness prints on stdout: the result of the call it was written for. */
export type UHarnessResult =
  | { ok: true; value: unknown } |
  { ok: false; message: string };

/** Which interpreter runs the harness: ESM tooling uses plain `node`, the sources use `ts-node`. */
export type URunner = 'node' | 'ts-node';

/** One disposable project root under `.tmp/unit/<name>`. */
export interface ITemporaryProject {
  /** Absolute path of the copy, i.e. the project root its modules see. */
  readonly root: string;
  /** Writes a file relative to the copy, creating the directories it needs. */
  write(relativePath: string, content: string): void;
  /** Deletes the whole copy. */
  remove(): void;
  /** Runs a script of the copy and parses the JSON its harness prints. */
  run(script: string, runner: URunner): UHarnessResult;
}
