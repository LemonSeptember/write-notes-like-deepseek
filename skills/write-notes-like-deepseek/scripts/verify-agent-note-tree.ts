/**
 * 校验目录树：lifecycle/class/文件名/INDEX 以及活跃笔记内部的相对 Markdown 链接。
 * 运行：npx tsx <skill目录>/scripts/verify-agent-note-tree.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";

const { notes, errors } = walkAgentNoteTree();

// 检查活跃笔记里的相对 Markdown 链接
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

for (const note of notes) {
  const noteFullPath = resolve(agentNoteRoot, note.rel);
  const content = readFileSync(noteFullPath, "utf8");
  let match: RegExpExecArray | null;

  while ((match = LINK_REGEX.exec(content)) !== null) {
    let rawTarget = match[2]?.trim();
    if (!rawTarget) continue;

    // 兼容 CommonMark 尖括号目标：[text](<path>)
    if (rawTarget.startsWith("<") && rawTarget.endsWith(">")) {
      rawTarget = rawTarget.slice(1, -1).trim();
    }

    // 忽略网页链接、页内锚点和省略号占位
    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://") || rawTarget.startsWith("#") || rawTarget.startsWith("mailto:") || rawTarget.includes("…")) {
      continue;
    }

    // 去掉锚点片段
    const fileTarget = rawTarget.split("#")[0];
    if (!fileTarget) continue;

    const resolvedTarget = resolve(dirname(noteFullPath), fileTarget);

    // 只校验 agentNoteRoot 内部的链接（按边界判断：像 .agents/notes-backup/ 这样的兄弟目录不能前缀误判）
    if (!resolvedTarget.startsWith(agentNoteRoot + sep)) {
      continue;
    }

    if (!existsSync(resolvedTarget)) {
      errors.push(`链接错误：${note.rel} -> "${rawTarget}" 目标文件不存在`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}

console.log(`通过：已验证 ${notes.length} 篇笔记的目录结构与相对链接`);
