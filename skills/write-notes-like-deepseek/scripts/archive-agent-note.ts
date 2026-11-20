/**
 * 把一篇 implemented Agent Note 归档，并用冻结 manifest 封印的命令行工具。
 * 用法：npx tsx <skill目录>/scripts/archive-agent-note.ts .agents/notes/implemented/<class>/<filename>.md [--superseded-by <新笔记路径>]
 * --superseded-by 只在「新笔记」里写相对链接，绝不改归档篇。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { agentNoteRoot, AGENT_NOTE_CLASSES, walkAgentNoteTree } from "./agent-note-tree.ts";

const args = process.argv.slice(2);
const targetArg = args[0];
const supersededByArgIdx = args.indexOf("--superseded-by");
const supersededByArg = supersededByArgIdx !== -1 ? args[supersededByArgIdx + 1] : undefined;
if (supersededByArgIdx !== -1 && !supersededByArg) {
  console.error("错误：--superseded-by 需要指定笔记路径");
  process.exit(1);
}
if (!targetArg) {
  console.error("用法：npx tsx <skill目录>/scripts/archive-agent-note.ts <笔记路径> [--superseded-by <新笔记路径>]");
  process.exit(1);
}

let successorPath: string | undefined;
let successorRel: string | undefined;
if (supersededByArg) {
  successorPath = resolve(process.cwd(), supersededByArg);
  if (!existsSync(successorPath)) {
    console.error(`错误：--superseded-by 目标不存在：${successorPath}`);
    process.exit(1);
  }
}

const targetPath = resolve(process.cwd(), targetArg);
if (!existsSync(targetPath)) {
  console.error(`错误：目标笔记不存在：${targetPath}`);
  process.exit(1);
}

const relToRoot = relative(agentNoteRoot, targetPath).replace(/\\/g, "/");
const segs = relToRoot.split("/");

if (segs[0] !== "implemented" || segs.length !== 3) {
  console.error(`错误：只有 .agents/notes/implemented/<class>/ 下的笔记可以归档（实际：${relToRoot}）`);
  process.exit(1);
}

const [, cls, filename] = segs;
if (!AGENT_NOTE_CLASSES.includes(cls as any)) {
  console.error(`错误：未知分类 "${cls}"`);
  process.exit(1);
}

// 1. 读取并更新内容，插入 Archived 行
const raw = readFileSync(targetPath, "utf8");
const lines = raw.split("\n");
const statusIdx = lines.findIndex((l) => l === "Status: implemented");
if (statusIdx === -1) {
  console.error("错误：笔记必须含有 `Status: implemented` 才能归档");
  process.exit(1);
}

// 用本地日历日期，不用 UTC — toISOString() 会让东半球的晚间运行回退一天。
const nowLocal = new Date();
const pad2 = (n: number) => String(n).padStart(2, "0");
const today = `${nowLocal.getFullYear()}-${pad2(nowLocal.getMonth() + 1)}-${pad2(nowLocal.getDate())}`;
// DSH 契约：`Archived:` 紧邻 `Status:`（L3/L4）。
if (!lines.some((l) => l.startsWith("Archived:"))) {
  lines.splice(statusIdx + 1, 0, `Archived: ${today}`);
}

if (successorPath) {
  const rel = relative(agentNoteRoot, successorPath).replace(/\\/g, "/");
  successorRel = rel;
  const successorSegs = rel.split("/");
  if (successorSegs.length !== 3 || !["proposed", "implemented", "rejected"].includes(successorSegs[0] ?? "")) {
    console.error(`错误：--superseded-by 目标必须是 {lifecycle}/{class}/ 下的活跃笔记（实际：${rel}）`);
    process.exit(1);
  }
}

const oldTitle = (lines[0] ?? "").replace(/^# Agent Note[:：] ?/, "").trim() || basename(filename, ".md");
const updatedContent = lines.join("\n");

// 2. 确定归档目标位置
const archivedDir = join(agentNoteRoot, "archived", cls);
mkdirSync(archivedDir, { recursive: true });
const archivedPath = join(archivedDir, filename);

if (existsSync(archivedPath)) {
  console.error(`错误：归档目标已存在：${archivedPath}`);
  console.error("拒绝覆盖已有归档笔记。请手动检查并处理文件名冲突。");
  process.exit(1);
}

writeFileSync(targetPath, updatedContent, "utf8");
renameSync(targetPath, archivedPath);
console.log(`已移动：${relToRoot} -> archived/${cls}/${filename}`);

// 3. 更新 archived/manifest.json 的 SHA-256 封印
const manifestPath = join(agentNoteRoot, "archived", "manifest.json");
interface Manifest {
  version: 1;
  files: Record<string, string>;
}
let manifest: Manifest = { version: 1, files: {} };
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    console.warn("警告：已有 manifest.json 无效，将重建");
  }
}

const newArchivedRel = `archived/${cls}/${filename}`;
const sha256 = `sha256:${createHash("sha256").update(readFileSync(archivedPath)).digest("hex")}`;
manifest.files[newArchivedRel] = sha256;

// 键名确定性排序
const sortedFiles = Object.fromEntries(
  Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))
);
writeFileSync(manifestPath, JSON.stringify({ version: 1, files: sortedFiles }, null, 2) + "\n", "utf8");
console.log(`已在 archived/manifest.json 中封印，哈希 ${sha256.slice(0, 16)}...`);

// 4. 扫描活跃笔记里的入站链接（精确解析 Markdown 相对链接）
const { notes } = walkAgentNoteTree();
const inboundFound: string[] = [];
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
for (const note of notes) {
  const noteFullPath = resolve(agentNoteRoot, note.rel);
  const content = readFileSync(noteFullPath, "utf8");
  let match: RegExpExecArray | null;
  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(content)) !== null) {
    const rawTarget = match[2]?.trim();
    if (!rawTarget || rawTarget.startsWith("http://") || rawTarget.startsWith("https://") || rawTarget.startsWith("#") || rawTarget.startsWith("mailto:")) continue;
    const fileTarget = rawTarget.split("#")[0];
    if (!fileTarget) continue;
    // 从链接所在笔记解析目标，再与被归档笔记的原位置比较
    const resolvedTarget = resolve(dirname(noteFullPath), fileTarget);
    if (resolvedTarget === targetPath) {
      inboundFound.push(note.rel);
      break;
    }
  }
}

if (inboundFound.length > 0) {
  console.log("\n[提示] 以下活跃笔记链接到该归档笔记：");
  for (const rel of inboundFound) {
    console.log(`  - ${rel}`);
  }
  console.log("请检查并按需更新它们的相对 Markdown 链接。");
} else {
  console.log("\n没有活跃笔记链接到该归档笔记。");
}

if (successorPath && successorRel) {
  const relLink = relative(dirname(successorPath), archivedPath).replace(/\\/g, "/");
  const newRaw = readFileSync(successorPath, "utf8");
  if (!newRaw.includes(`archived/${cls}/${filename}`) && !newRaw.includes(relLink)) {
    writeFileSync(successorPath, `${newRaw.replace(/\s*$/, "")}\n\n[历史快照：${oldTitle}](${relLink})\n`, "utf8");
    console.log(`已在 ${successorRel} 中补链接：[历史快照：${oldTitle}](${relLink})`);
  }
}
