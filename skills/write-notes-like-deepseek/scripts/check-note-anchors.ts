/**
 * 软报告：物理反向锚点（`// Note: ... 见 .agents/notes/...`）。
 *   A. 源码里指向不存在笔记的锚点（悬空）
 *   B. 没有任何入站代码锚点的 implemented 笔记（疑似缺锚点）
 * 退出码恒为 0 — 这是建议性报告，不是门禁。
 * 环境变量：AGENT_NOTE_CODE_ROOT（默认当前目录）—— 要扫描的源码根。
 * 运行：npx tsx <skill目录>/scripts/check-note-anchors.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";

const codeRoot = resolve(process.env.AGENT_NOTE_CODE_ROOT || process.cwd());
const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".c", ".cc", ".cpp", ".h", ".hpp",
  ".cs", ".rb", ".swift", ".vue", ".svelte", ".php",
]);
const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", ".next",
  ".cache", ".agents", "vendor", "target",
]);
const ANCHOR_RE = /(?:\/\/|#|\/\*|\*\s*|<!--\s*)\s*Note[:：]/;
const PATH_RE = /\.agents\/notes\/([^\s'"`)>]+?\.md)/;

const anchorHits = new Map<string, string[]>(); // 笔记相对路径（以笔记根为基准）-> [代码相对路径:行号]
const dangling: string[] = [];
const notePathRefs: string[] = [];

function walk(dir: string, depth: number) {
  if (depth > 12) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".agents") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(full, depth + 1);
      continue;
    }
    const dot = entry.name.lastIndexOf(".");
    if (dot === -1 || !CODE_EXT.has(entry.name.slice(dot))) continue;
    const rel = full.slice(codeRoot.length + 1);
    const lines = readFileSync(full, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!ANCHOR_RE.test(l)) continue;
      const m = PATH_RE.exec(l);
      if (!m) {
        notePathRefs.push(`${rel}:${i + 1} — Note 锚点缺少 .agents/notes 路径`);
        continue;
      }
      const noteRel = m[1].split("#")[0].replace(/^\.\//, "");
      const key = noteRel.replace(/\\/g, "/");
      const list = anchorHits.get(key) ?? [];
      list.push(`${rel}:${i + 1}`);
      anchorHits.set(key, list);
      if (!existsSync(join(agentNoteRoot, key))) {
        dangling.push(`${rel}:${i + 1} — .agents/notes/${key} 不存在`);
      }
    }
  }
}

walk(codeRoot, 0);

// 没有任何入站锚点的 implemented 笔记
const { notes } = walkAgentNoteTree();
const implemented = notes.filter((n) => n.lifecycle === "implemented");
// basename -> 笔记数量：多个笔记共用 slug 时有歧义，不能让一篇笔记的锚点被算到另一篇头上。
const slugCount = new Map<string, number>();
for (const n of notes) {
  const slug = n.rel.split("/").pop()!;
  slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1);
}
const unanchored: string[] = [];
for (const n of implemented) {
  const slug = n.rel.split("/").pop()!;
  const direct = anchorHits.get(n.rel) ?? anchorHits.get(n.rel.replace(/\\/g, "/"));
  const bySlug = [...anchorHits.keys()].filter((k) => k === slug || k.endsWith("/" + slug));
  if (!direct && (bySlug.length === 0 || (slugCount.get(slug) ?? 0) > 1)) unanchored.push(n.rel);
}

console.log(`扫描目录：${codeRoot}`);
console.log(`找到锚点：${[...anchorHits.values()].reduce((a, b) => a + b.length, 0)} 处，涉及 ${anchorHits.size} 篇笔记`);
if (notePathRefs.length) {
  console.log(`\n[缺少笔记路径的锚点] ${notePathRefs.length}`);
  for (const r of notePathRefs.slice(0, 20)) console.log(`  - ${r}`);
}
if (dangling.length) {
  console.log(`\n[悬空锚点] ${dangling.length}`);
  for (const d of dangling.slice(0, 20)) console.log(`  - ${d}`);
} else {
  console.log("\n[悬空锚点] 无");
}
console.log(`\n[没有任何代码锚点的 implemented 笔记] ${unanchored.length} / ${implemented.length}`);
for (const u of unanchored.slice(0, 20)) console.log(`  - ${u}`);
if (unanchored.length > 20) console.log(`  …… 另有 ${unanchored.length - 20} 条`);
