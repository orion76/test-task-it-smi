/**
 * Stops what `npm run dev` started: the backend and the client, found by the ports they listen on.
 *
 * `pkill -f "ng serve"` reaches into every project on the machine, so the port is the only honest
 * sign that a process belongs to this checkout. The database is stopped only with `--db`: it is
 * meant to survive between runs.
 */
import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { connect } from 'node:net';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Root of the project: `docker compose` must read the compose file the npm scripts refer to. */
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DB_FLAG = '--db';
const DB_SERVICE = 'db';
const LOCAL_HOST = '127.0.0.1';
const SIGNAL_TERM = 'SIGTERM';
const SIGNAL_KILL = 'SIGKILL';
const TERM_TIMEOUT_MS = 5000;
const KILL_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 200;
const PROBE_TIMEOUT_MS = 1000;
const OWNER_HINT = 'процесс принадлежит другому пользователю, посмотрите `sudo ss -ltnp`';

/** Roles of `npm run dev` and the ports they listen on; the backend owns the `PORT` variable. */
const TARGETS = [
  { title: 'backend', port: readPort('PORT', 3000) },
  { title: 'клиент', port: readPort('CLIENT_PORT', 5173) },
];

/** Tools that name the process listening on a port, in the order they are tried. */
const PORT_TOOLS = [
  { command: 'ss', readArgs: (port) => ['-ltnp', `sport = :${port}`], parse: parseSsPids },
  { command: 'lsof', readArgs: (port) => ['-t', `-i:${port}`], parse: parseLsofPids },
  { command: 'fuser', readArgs: (port) => [`${port}/tcp`], parse: parseFuserPids },
];

await main();

/** Stops every target, optionally the database, prints the summary and sets the exit code. */
async function main() {
  const tools = PORT_TOOLS.filter((tool) => isInstalled(tool.command));

  if (tools.length === 0) {
    fail(
      'Не удалось определить процессы: нет ни ss, ни lsof, ни fuser.\n' +
        'Установите хотя бы один из них (ss входит в iproute2) и повторите.',
    );
  }

  const outcomes = [];

  for (const target of TARGETS) {
    outcomes.push(await stopTarget(target, tools));
  }

  if (process.argv.slice(2).includes(DB_FLAG)) {
    outcomes.push(await stopDatabase());
  }

  printSummary(outcomes);

  process.exitCode = outcomes.some(isFailure) ? 1 : 0;
}

/**
 * Stops the processes listening on the port of one target and reports what happened to them. A free
 * port is a normal outcome: the environment was already stopped.
 */
async function stopTarget(target, tools) {
  const listeners = await locateListeners(target.port, tools);

  if (listeners.pids.length === 0) {
    return {
      kind: 'process',
      title: target.title,
      port: target.port,
      status: listeners.busy ? 'unknown' : 'idle',
      pids: [],
    };
  }

  console.log(
    `  ${target.title} на :${target.port}: останавливаем PID ${listeners.pids.join(', ')}…`,
  );

  return stopProcesses(target, listeners.pids);
}

/** Sends the signals and waits for the port to be released, escalating to SIGKILL on a timeout. */
async function stopProcesses(target, pids) {
  const base = { kind: 'process', title: target.title, port: target.port, pids };

  try {
    pids.forEach((pid) => sendSignal(pid, SIGNAL_TERM));
  } catch (error) {
    return { ...base, status: 'failed', message: toMessage(error) };
  }

  if (await waitForFreePort(target.port, TERM_TIMEOUT_MS)) {
    return { ...base, status: 'stopped' };
  }

  console.log(
    `  ${target.title} на :${target.port}: порт занят дольше ${TERM_TIMEOUT_MS / 1000} с, ` +
      `применяем ${SIGNAL_KILL}.`,
  );

  try {
    pids.forEach((pid) => sendSignal(pid, SIGNAL_KILL));
  } catch (error) {
    return { ...base, status: 'failed', message: toMessage(error) };
  }

  if (await waitForFreePort(target.port, KILL_TIMEOUT_MS)) {
    return { ...base, status: 'forced' };
  }

  return { ...base, status: 'failed', message: 'порт остался занятым после SIGKILL' };
}

/**
 * Reads the PIDs listening on the port with the first tool that reports them. A tool that sees
 * nothing is not trusted on its own: a direct connect separates a free port from a port whose owner
 * the tool is not allowed to name, and the next tool gets its chance.
 */
async function locateListeners(port, tools) {
  for (const tool of tools) {
    const pids = await readPids(tool, port);

    if (pids.length > 0) {
      return { pids, busy: true };
    }

    if (!(await probePort(port))) {
      return { pids: [], busy: false };
    }
  }

  return { pids: [], busy: true };
}

/**
 * Runs one tool and parses its output. A missing binary and the non-zero exit of `lsof` and `fuser`
 * both mean "nothing to report here", so the caller simply tries the next tool.
 */
async function readPids(tool, port) {
  try {
    const result = await execFileAsync(tool.command, tool.readArgs(port));

    return tool.parse(result.stdout);
  } catch {
    return [];
  }
}

/** Extracts `pid=1234` from the process column of `ss -ltnp`. */
function parseSsPids(stdout) {
  const pids = [...String(stdout ?? '').matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));

  return uniquePids(pids);
}

/** Parses the one-PID-per-line output of `lsof -t`. */
function parseLsofPids(stdout) {
  const lines = String(stdout ?? '').split('\n');

  return uniquePids(lines.map((line) => Number(line.trim())));
}

/** Parses the numbers `fuser` prints for the port. */
function parseFuserPids(stdout) {
  const matches = String(stdout ?? '').match(/\d+/g) ?? [];
  const pids = matches.map((match) => Number(match));

  return uniquePids(pids);
}

/** Drops duplicates and garbage: one process may hold several sockets on the same port. */
function uniquePids(pids) {
  return [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
}

/** Polls the port until nothing accepts connections on it or the limit expires. */
async function waitForFreePort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!(await probePort(port))) {
      return true;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return !(await probePort(port));
}

/**
 * Tells whether something accepts connections on the port. The connect attempt needs no special
 * rights, unlike the listing tools, so it also covers a port whose owner they cannot name.
 */
function probePort(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: LOCAL_HOST, port });
    const finish = (busy) => {
      socket.destroy();
      resolve(busy);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * Stops the `db` service. An already stopped container is not an error: the command promises a
 * stopped database, and it is stopped either way.
 */
async function stopDatabase() {
  const base = { kind: 'database', title: `база ${DB_SERVICE}` };

  try {
    const running = await readDatabaseRunning();

    if (!running) {
      return { ...base, status: 'idle' };
    }

    await execFileAsync('docker', ['compose', 'stop', DB_SERVICE], { cwd: PROJECT_ROOT });

    return { ...base, status: 'stopped' };
  } catch (error) {
    return { ...base, status: 'failed', message: describeDockerError(error) };
  }
}

/** Tells whether the database container runs: `ps --quiet` prints nothing for a stopped service. */
async function readDatabaseRunning() {
  const result = await execFileAsync('docker', ['compose', 'ps', '--quiet', DB_SERVICE], {
    cwd: PROJECT_ROOT,
  });

  return String(result.stdout ?? '').trim() !== '';
}

/** Turns a failed `docker compose` call into a message the developer can act on. */
function describeDockerError(error) {
  if (error?.code === 'ENOENT') {
    return 'команда `docker` недоступна в PATH';
  }

  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
  const message = stderr !== '' ? stderr : toMessage(error);

  if (/cannot connect to the docker daemon|is the docker daemon running/i.test(message)) {
    return 'Docker не запущен: демон не отвечает. Запустите Docker и повторите.';
  }

  return message;
}

/** Sends a signal to a process; `ESRCH` means it has already exited, which is the goal here. */
function sendSignal(pid, name) {
  try {
    process.kill(pid, name);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw new Error(`PID ${pid}: ${toMessage(error)}`, { cause: error });
    }
  }
}

/** Checks `PATH` for an executable with the given name: a missing tool is skipped, not an error. */
function isInstalled(command) {
  const directories = (process.env.PATH ?? '').split(delimiter);

  return directories.some(
    (directory) => directory !== '' && isExecutable(join(directory, command)),
  );
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);

    return true;
  } catch {
    return false;
  }
}

/** Reads the port of a target from the environment, with the default `npm run dev` relies on. */
function readPort(variable, fallback) {
  const raw = process.env[variable];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const port = Number(raw);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail(`Неверный порт в ${variable}: «${raw}» — ожидалось число от 1 до 65535.`);
  }

  return port;
}

function printSummary(outcomes) {
  console.log('Итог:');

  for (const outcome of outcomes) {
    console.log(`  - ${describeOutcome(outcome)}`);
  }
}

/** Turns an outcome into one summary line: what was stopped and what was already down. */
function describeOutcome(outcome) {
  if (outcome.kind === 'database') {
    return describeDatabaseOutcome(outcome);
  }

  const where = `${outcome.title} на :${outcome.port}`;

  if (outcome.status === 'failed') {
    return `${where} — остановить не удалось: ${outcome.message}`;
  }

  if (outcome.status === 'unknown') {
    return `${where} — порт занят, но владелец не определён: ${OWNER_HINT}`;
  }

  if (outcome.status === 'idle') {
    return `${where} — не запущен`;
  }

  if (outcome.status === 'forced') {
    return `${where} — остановлен жёстко (${SIGNAL_KILL}, PID ${outcome.pids.join(', ')})`;
  }

  return `${where} — остановлен (PID ${outcome.pids.join(', ')})`;
}

function describeDatabaseOutcome(outcome) {
  if (outcome.status === 'failed') {
    return `${outcome.title} — остановить не удалось: ${outcome.message}`;
  }

  return outcome.status === 'idle'
    ? `${outcome.title} — уже остановлена`
    : `${outcome.title} — остановлена`;
}

function isFailure(outcome) {
  return outcome.status === 'failed' || outcome.status === 'unknown';
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function toMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
