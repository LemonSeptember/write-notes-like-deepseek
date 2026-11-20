/**
 * 强制校验 Agent Note 的头块、生命周期专属节与备选方案节。
 * implemented 笔记不得保留提案期标题；正文现在时是散文纪律，不做词法扫描。
 * 运行：npx tsx <skill目录>/scripts/verify-agent-note-format.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";

const STATUS: Record<string, RegExp> = {
  proposed: /^Status: proposed$|^状态[:：] ?(?:proposed|已提议)$/,
  implemented: /^Status: implemented$|^状态[:：] ?(?:implemented|已实现)$/,
  rejected: /^Status: rejected — .+$|^状态[:：] ?(?:rejected|已否决) — .+$/,
};

const PROBLEM_FIRST = ["## Problem", "## 问题"];

const REQUIRED: Record<string, string[][]> = {
  proposed: [
    ["## Proposal", "## 提议", "## 方案", "## 提案"],
    ["## Acceptance criteria", "## 验收标准", "## 验收条件", "## 接受标准"],
    ["## Risks", "## 风险"],
  ],
  implemented: [
    ["## Decision", "## 决定", "## 决策"],
    ["## Consequences", "## 后果", "## 影响", "## 结果", "## 结果与代价", "## 影响与验证", "## 后果与边界"],
  ],
  rejected: [
    ["## Proposal", "## 提议", "## 方案", "## 提案"],
  ],
};

const BANNED_IMPLEMENTED = new Set([
  "## proposal", "## plan", "## migration plan", "## acceptance criteria",
  "## 提议", "## 方案", "## 提案",
  "## 计划", "## 规划", "## 迁移计划",
  "## 验收标准", "## 验收条件", "## 接受标准",
]);

const ALTERNATIVES_RE = /^## (?:Alternatives considered|.{0,8}?(?:替代方案|备选(?:方案)?|其他做法))$/;
const FORMAT_ADOPTED = "2026-07-05";
const GRANDFATHER = "<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->";

/** 去掉尾部括号：`## Decision（说明）` → `## Decision`。 */
function headingBase(h: string): string {
  return h.replace(/[（(].*$/, "").trimEnd();
}

interface MaskedSource {
  lines: string[];
  /** 位于围栏代码块内的行号 */
  fenced: boolean[];
  /** 位于 HTML 注释内的行号 */
  commented: boolean[];
}

/** 归一化 BOM/CRLF，然后屏蔽围栏代码与 HTML 注释区域。 */
function maskSource(raw: string): MaskedSource {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const fenced = new Array<boolean>(lines.length).fill(false);
  const commented = new Array<boolean>(lines.length).fill(false);
  let inFence = false;
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    fenced[i] = inFence;
    commented[i] = inComment;
    // 围栏只在独立一行（前置空格不超过 3 个）开合；行内代码或散文里提到 ``` 不会切换状态。
    if (!inComment && /^\s{0,3}```/.test(l)) {
      fenced[i] = true;
      inFence = !inFence;
    } else if (inFence) {
      fenced[i] = true;
    }
    // 围栏内部不透明：HTML/JSX 示例里的 `<!--` 不能让注释屏蔽状态越过闭合围栏。
    if (inFence) continue;
    const openIdx = inComment ? -1 : l.indexOf("<!--");
    const closeIdx = l.indexOf("-->");
    if (inComment) {
      commented[i] = true;
      if (closeIdx !== -1) inComment = false;
    } else if (openIdx !== -1) {
      commented[i] = true;
      if (closeIdx === -1 || closeIdx < openIdx) inComment = true;
    }
  }
  return { lines, fenced, commented };
}

function isProseLine(src: MaskedSource, i: number): boolean {
  if (src.fenced[i] || src.commented[i]) return false;
  return !/^\s*>/.test(src.lines[i]);
}

const { notes, errors } = walkAgentNoteTree();

for (const note of notes) {
  const fail = (msg: string) => { errors.push(`格式错误：${note.rel} — ${msg}`); };
  const src = maskSource(readFileSync(resolve(agentNoteRoot, note.rel), "utf8"));
  const { lines } = src;
  const proseIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) if (isProseLine(src, i)) proseIdx.push(i);
  const prose = proseIdx.map((i) => lines[i]);

  // 半角或全角冒号（中文输入法常打出 ：）
  if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? "")) fail("第 1 行必须是 `# Agent Note: <title>`");
  if (lines[1] !== "") fail("第 2 行必须为空行");

  const re = STATUS[note.lifecycle];
  if (re && !re.test(lines[2] ?? "")) fail(`第 3 行必须匹配 ${note.lifecycle} 的状态语法（${String(re)}）`);
  if (lines[3] !== "") fail("第 4 行必须为空行");

  // Status 行只能出现一次（围栏、引用和注释免疫）。只匹配严格的状态行，
  // 正文散文如 "Status: 200 means OK" 不能被误算成重复状态头。
  const looksLikeStatusLine = (l: string) => {
    const t = l.trim();
    return Object.values(STATUS).some((re) => re.test(t));
  };
  const statusCount = prose.filter(looksLikeStatusLine).length;
  if (statusCount !== 1) fail("Status: 行必须且只能出现一次");

  const h2s = prose.filter((l: string) => l.startsWith("## ")).map((l: string) => l.trimEnd());
  const bases = h2s.map(headingBase);
  if (!PROBLEM_FIRST.includes(headingBase(h2s[0] ?? ""))) {
    fail(`首节必须是 ## Problem 或 ## 问题（实际为 ${JSON.stringify(h2s[0] ?? "<无>")}）`);
  }

  for (const group of REQUIRED[note.lifecycle] ?? []) {
    if (!group.some((h: string) => bases.includes(h))) fail(`缺少以下任一节：${JSON.stringify(group)}`);
  }

  if (note.lifecycle === "implemented") {
    for (const h of bases.filter((x: string) => BANNED_IMPLEMENTED.has(x.toLowerCase()))) {
      fail(`implemented 中禁止出现：${h}`);
    }
  }

  const hasSection = bases.some((h: string) => ALTERNATIVES_RE.test(h));
  const rawText = readFileSync(resolve(agentNoteRoot, note.rel), "utf8");
  const hasGrandfather = rawText.includes(GRANDFATHER);
  if (hasSection && hasGrandfather) fail("同时含有 ## Alternatives considered 与豁免注释 — 请删除该注释");
  if (!hasSection && !hasGrandfather) {
    fail("缺少 ## Alternatives considered / ## 备选方案");
  }
  if (hasGrandfather && note.date >= FORMAT_ADOPTED) fail(`豁免注释仅在 ${FORMAT_ADOPTED} 之前有效`);
}

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}

console.log(`通过：已验证 ${notes.length} 篇笔记`);
