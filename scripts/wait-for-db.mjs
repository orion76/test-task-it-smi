/**
 * Blocks until the `db` service of docker compose reports a healthy container.
 *
 * `docker compose up -d db` returns as soon as the container is created, while PostgreSQL inside
 * still needs a few seconds to accept connections — migrations started earlier fail. The script
 * polls `docker compose ps` instead of sleeping a fixed time, so a warm database continues
 * immediately.
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Root of the project: `docker compose` must read the compose file the npm scripts refer to. */
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVICE = 'db';
const DEFAULT_TIMEOUT_SECONDS = 60;
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_ENV = 'WAIT_FOR_DB_TIMEOUT';
const TIMEOUT_FLAG = '--timeout';

await main();

/**
 * Polls the container until it is healthy, fails on a container that cannot become healthy, and
 * exits with a non-zero code when the limit is reached.
 */
async function main() {
  const timeoutSeconds = readTimeoutSeconds(process.argv.slice(2));
  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;

  console.log(`Ждём готовности PostgreSQL (сервис ${SERVICE}, лимит ${timeoutSeconds} с)…`);

  for (;;) {
    const probe = await probeService();

    if (probe.state === 'ready') {
      console.log(`PostgreSQL принимает соединения (${elapsedSeconds(startedAt)} с).`);
      return;
    }

    if (probe.state === 'failed') {
      fail(probe.message);
    }

    console.log(`  ${elapsedSeconds(startedAt)} с: ${probe.description}`);

    if (Date.now() >= deadline) {
      fail(
        `PostgreSQL не стал готов за ${timeoutSeconds} с ` +
          `(последнее состояние: ${probe.description}).\n` +
          `Логи базы: docker compose logs ${SERVICE}\n` +
          `Увеличить лимит: ${TIMEOUT_ENV}=120 npm run dev:db`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Resolves the wait limit in seconds: the `--timeout <seconds>` flag wins over the
 * `WAIT_FOR_DB_TIMEOUT` environment variable, the fallback is one minute.
 */
function readTimeoutSeconds(argv) {
  const raw = readFlag(argv) ?? process.env[TIMEOUT_ENV];

  if (raw === undefined || raw === '') {
    return DEFAULT_TIMEOUT_SECONDS;
  }

  const seconds = Number(raw);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    fail(`Неверный таймаут «${raw}»: ожидалось положительное число секунд.`);
  }

  return seconds;
}

/** Reads `--timeout <seconds>` or `--timeout=<seconds>` out of the arguments. */
function readFlag(argv) {
  const index = argv.indexOf(TIMEOUT_FLAG);

  if (index !== -1) {
    return argv[index + 1];
  }

  const prefixed = argv.find((argument) => argument.startsWith(`${TIMEOUT_FLAG}=`));

  return prefixed?.slice(TIMEOUT_FLAG.length + 1);
}

/**
 * Reads the container of the service: `ready` when it is healthy, `pending` while it is still
 * starting, `failed` when no further polling can help.
 */
async function probeService() {
  let stdout;

  try {
    const result = await execFileAsync(
      'docker',
      ['compose', 'ps', '--all', '--format', 'json', SERVICE],
      { cwd: PROJECT_ROOT },
    );

    stdout = result.stdout;
  } catch (error) {
    return classifyFailure(error);
  }

  const entries = parseEntries(stdout);
  const entry = pickEntry(entries);

  if (entry === undefined) {
    return { state: 'pending', description: 'контейнер ещё не создан' };
  }

  const containerState = readState(entry);
  const health = readHealth(entry);

  if (health === 'healthy') {
    return { state: 'ready' };
  }

  if (containerState === 'exited' || containerState === 'dead') {
    return {
      state: 'failed',
      message:
        `Контейнер ${SERVICE} остановился (state: ${containerState}).\n` +
        `Логи базы: docker compose logs ${SERVICE}`,
    };
  }

  return {
    state: 'pending',
    description: `state: ${containerState || 'неизвестно'}, health: ${health || 'нет'}`,
  };
}

/**
 * Keeps the reason of a failed `docker compose ps` call, because only Docker itself knows whether
 * the daemon is down or the service is missing from the compose file.
 */
function classifyFailure(error) {
  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
  const message = stderr !== '' ? stderr : toMessage(error);

  if (/cannot connect to the docker daemon|is the docker daemon running/i.test(message)) {
    return {
      state: 'failed',
      message:
        'Docker не запущен: демон не отвечает.\n' +
        'Запустите Docker и повторите `npm run dev`.',
    };
  }

  if (error?.code === 'ENOENT') {
    return {
      state: 'failed',
      message:
        'Docker не найден: команда `docker` недоступна в PATH.\n' +
        'Установите Docker и повторите `npm run dev`.',
    };
  }

  if (/no such service/i.test(message)) {
    return {
      state: 'failed',
      message:
        `Сервис ${SERVICE} не найден в docker compose.\n` +
        'Поднимите базу: `npm run dev:db` или `docker compose up -d db`.',
    };
  }

  return {
    state: 'failed',
    message: `Не удалось опросить docker compose: ${message}\nПроверьте, что Docker запущен.`,
  };
}

/**
 * Parses `docker compose ps --format json`: compose v2 prints a JSON array, older builds print one
 * object per line.
 */
function parseEntries(stdout) {
  const text = String(stdout ?? '').trim();

  if (text === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text
      .split('\n')
      .map((line) => parseLine(line))
      .filter((entry) => entry !== undefined);
  }
}

/** Parses one line of the JSON-lines output; returns `undefined` for a line that is not JSON. */
function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** Prefers the running container: `--all` may also list stopped one-off containers of the service. */
function pickEntry(entries) {
  return entries.find((entry) => readState(entry) === 'running') ?? entries[0];
}

/** Reads the container state reported by compose (`running`, `exited`, `created`, …). */
function readState(entry) {
  return String(entry?.State ?? entry?.state ?? '').toLowerCase();
}

/**
 * Reads the health reported by compose: versions disagree on the shape, so a string, an object with
 * `Status` and an array of either are all accepted.
 */
function readHealth(entry) {
  const health = entry?.Health ?? entry?.health;
  const items = Array.isArray(health) ? health : [health];

  for (const item of items) {
    const value = typeof item === 'string' ? item : item?.Status;

    if (typeof value === 'string' && value !== '') {
      return value.toLowerCase();
    }
  }

  return '';
}

function elapsedSeconds(startedAt) {
  return Math.round((Date.now() - startedAt) / 1000);
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
