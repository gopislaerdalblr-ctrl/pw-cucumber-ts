import fs from "node:fs";
import path from "node:path";

export type EnvName = "qa" | "preprod";

export type InstanceConfig = {
  env: EnvName;
  baseUrl: string;
  subdomain: string;
  orgId: string;
};

export type Secrets = {
  adminEmail: string;
  adminPassword: string;
};

export type CourseConfig = {
  courseName: string;
  courseId?: string;
  defaultTags?: string;
};

type InstancesFile = Record<string, InstanceConfig>;

function sanitizeJsonText(raw: string): string {
  // Remove UTF-8 BOM if present and any null characters
  return raw.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
}

function readJson<T>(p: string): T {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(sanitizeJsonText(raw)) as T;
}

function firstExistingPath(candidates: string[]): string {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // show candidates to make debugging easy
  throw new Error(
    `Required file not found. Tried:\n- ${candidates.join("\n- ")}`,
  );
}

/**
 * Supports different repo layouts WITHOUT breaking current setup:
 * - src/config/instances.json (your current)
 * - src/data/instances.json
 * - src/instances.json
 */
function resolveInstancesPath(): string {
  return firstExistingPath([
    path.resolve(__dirname, "instances.json"),
    path.resolve(__dirname, "../data/instances.json"),
    path.resolve(__dirname, "../instances.json"),
  ]);
}

/**
 * Supports:
 * - src/config/course.json (your current)
 * - src/data/course.json
 * - src/course.json
 */
function resolveCoursePath(): string {
  return firstExistingPath([
    path.resolve(__dirname, "course.json"),
    path.resolve(__dirname, "../data/course.json"),
    path.resolve(__dirname, "../course.json"),
  ]);
}

export function loadInstance(instanceName: string): InstanceConfig {
  const filePath = resolveInstancesPath();
  const instances = readJson<InstancesFile>(filePath);
  const cfg = instances[instanceName];

  if (!cfg) {
    const names = Object.keys(instances).join(", ");
    throw new Error(`Unknown instance "${instanceName}". Available: ${names}`);
  }
  return cfg;
}

/**
 * ✅ NEW: Load secrets by INSTANCE first, then fallback to ENV.
 *
 * This allows:
 * - src/data/secrets/qa-samurai.json (recommended)
 * OR if you created qaSamurai.json, it will still be detected (fuzzy match).
 * Fallback remains: qa.json / preprod.json (so existing setups don't break).
 */
export function loadSecretsForInstance(
  instanceName: string,
  env: EnvName,
): Secrets {
  const secretsDir = firstExistingPath([
    path.resolve(__dirname, "../data/secrets"),
    path.resolve(__dirname, "../secrets"),
  ]);

  const direct = path.join(secretsDir, `${instanceName}.json`);
  if (fs.existsSync(direct)) {
    return readJson<Secrets>(direct);
  }

  // Fuzzy match file name ignoring case and symbols:
  // "qa-samurai" should match "qaSamurai.json" or "qa_samurai.json" etc.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(instanceName);

  try {
    const files = fs.readdirSync(secretsDir);
    for (const f of files) {
      if (!f.toLowerCase().endsWith(".json")) continue;
      const base = f.slice(0, -5); // remove .json
      if (norm(base) === target) {
        return readJson<Secrets>(path.join(secretsDir, f));
      }
    }
  } catch {
    // ignore
  }

  // Fallback to env-based secrets (existing behavior)
  const envFile = path.join(secretsDir, `${env}.json`);
  return readJson<Secrets>(envFile);
}

/**
 * Backward compatible: existing calls loadSecrets("qa") still work.
 */
export function loadSecrets(env: EnvName): Secrets {
  return loadSecretsForInstance(env, env);
}

export function loadCourseConfig(): CourseConfig {
  const filePath = resolveCoursePath();
  return readJson<CourseConfig>(filePath);
}
