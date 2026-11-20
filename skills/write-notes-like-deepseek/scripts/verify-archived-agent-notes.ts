/**
 * 校验已冻结的归档 Agent Note：精确头部布局、manifest.json 封印，
 * 以及与 git 基线对比的 append-only（无 git 时优雅降级）。
 * 用法：
 *   npx tsx <skill目录>/scripts/verify-archived-agent-notes.ts          # 仅校验
 *   npx tsx <skill目录>/scripts/verify-archived-agent-notes.ts --write  # 校验后为未封印文件补封印
 * 环境变量：AGENT_NOTE_ARCHIVE_BASE_REF（默认 HEAD）—— manifest 对比的 git 基线。
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { agentNoteRoot } from "./agent-note-tree.ts";

const isWrite = process.argv.includes("--write");
const errors: string[] = [];
const warnings: string[] = [];
const fail = (msg: string) => { errors.push(msg); };

// --- 收集归档文件（顺带跳过误入的 .zh.md）
const archivedDir = join(agentNoteRoot, "archived");
const files: string[] = [];
function scan(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".zh.md")) {
      const rel = relative(archivedDir, full).split("\\").join("/");
      if (rel === "AGENTS.md" || rel === "manifest.json") continue;
      files.push(rel);
    }
  }
}
if (existsSync(archivedDir)) scan(archivedDir);

// --- 头部布局：L1 标题 / L2 空行 / L3 Status / L4 Archived / L5 空行
const TITLE_RE = /^# Agent Note[:：] ?\S/;
const ARCHIVED_RE = /^Archived: \d{4}-\d{2}-\d{2}$/;
for (const rel of files) {
  const lines = readFileSync(join(archivedDir, rel), "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (!TITLE_RE.test(lines[0] ?? "")) fail(`${rel} — 第 1 行必须是 \`# Agent Note: <title>\``);
  if (lines[1] !== "") fail(`${rel} — 第 2 行必须为空行`);
  if (lines[2] !== "Status: implemented") fail(`${rel} — 第 3 行必须是 \`Status: implemented\``);
  if (!ARCHIVED_RE.test(lines[3] ?? "")) fail(`${rel} — 第 4 行必须是 \`Archived: YYYY-MM-DD\`，紧接 Status 下方`);
  if (lines[4] !== "") fail(`${rel} — 第 5 行必须在 Archived 之后为空行`);
}

// --- manifest 封印
const manifestPath = join(archivedDir, "manifest.json");
interface Manifest { version: 1; files: Record<string, string>; }
let manifest: Manifest = { version: 1, files: {} };
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail("archived/manifest.json 存在但不是有效 JSON");
  }
} else if (files.length > 0 && !isWrite) {
  fail("archived/manifest.json 缺失 — 请用 --write 为已有归档笔记补封印");
}

const sealOf = (relFromRoot: string) =>
  `sha256:${createHash("sha256").update(readFileSync(join(agentNoteRoot, relFromRoot))).digest("hex")}`;

for (const rel of files) {
  const key = `archived/${rel}`;
  const entry = manifest.files[key];
  if (!entry) {
    if (isWrite) {
      manifest.files[key] = sealOf(key);
    } else {
      fail(`${key} — manifest.json 中缺少封印（请用 --write）`);
    }
  } else if (entry !== sealOf(key)) {
    fail(`${key} — 封印不匹配：归档笔记在封印后被修改（冻结笔记绝不可改动）`);
  }
}
for (const key of Object.keys(manifest.files)) {
  if (!existsSync(join(agentNoteRoot, key))) fail(`${key} — 封印条目在磁盘上没有对应文件`);
}

// --- 与 git 基线对比 append-only（无 git 时跳过）
const repoRoot = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: agentNoteRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
})();
if (repoRoot) {
  const baseRef = process.env.AGENT_NOTE_ARCHIVE_BASE_REF || "HEAD";
  const manifestRel = relative(repoRoot, manifestPath).split("\\").join("/");
  let baselineRaw: string | null = null;
  try {
    baselineRaw = execFileSync("git", ["show", `${baseRef}:${manifestRel}`], { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    // 基线里没有 manifest — 无可对比
  }
  if (baselineRaw !== null) {
    try {
      const baseline = JSON.parse(baselineRaw) as Manifest;
      for (const [key, seal] of Object.entries(baseline.files ?? {})) {
        if (manifest.files[key] !== seal) {
          fail(`${key} — 相对 ${baseRef} 的封印被新增/改动/删除；归档封印只增不改`);
        }
      }
    } catch {
      fail(`基线 ${baseRef} 处的 archived/manifest.json 不是有效 JSON`);
    }
  }
} else {
  warnings.push("不是 git 仓库 — 已跳过 append-only 检查（仍校验封印哈希与磁盘一致）");
}

if (errors.length) {
  for (const e of errors) console.error(`归档错误：${e}`);
  process.exit(1);
}

if (isWrite) {
  const sorted = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, JSON.stringify({ version: 1, files: sorted }, null, 2) + "\n", "utf8");
}

for (const w of warnings) console.warn(`警告：${w}`);
console.log(`通过：已验证 ${files.length} 篇归档笔记，manifest 中有 ${Object.keys(manifest.files).length} 条封印`);
