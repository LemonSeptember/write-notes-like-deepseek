/**
 * Agent Note 目录树的结构基准（单一事实来源）。
 * 可移植：从当前工作目录解析 .agents/notes（也可用 AGENT_NOTE_ROOT 环境变量覆盖）。
 */
import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** 递归 `dir`，返回以 `prefix` 为前缀的 posix 风格 `.md` 相对路径。兼容 Node 18（不用 fs.globSync）。 */
function listMd(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listMd(resolve(dir, entry.name), rel))
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(rel)
  }
  return out
}

function resolveAgentNoteRoot(): string {
  if (process.env.AGENT_NOTE_ROOT) return resolve(process.env.AGENT_NOTE_ROOT)
  return resolve(process.cwd(), '.agents/notes')
}

export const agentNoteRoot = resolveAgentNoteRoot()

const AGENT_NOTE_LIFECYCLES = ['proposed', 'implemented', 'rejected'] as const
export const AGENT_NOTE_CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'] as const
const AGENT_NOTE_ARCHIVE = 'archived'
const ROOT_ALLOWLIST = new Set(['AGENTS.md', 'CLAUDE.md'])

export interface AgentNote {
  lifecycle: string
  rel: string
  date: string
}

export function walkAgentNoteTree(): { notes: AgentNote[]; errors: string[] } {
  const notes: AgentNote[] = []
  const errors: string[] = []
  if (!existsSync(agentNoteRoot)) return { notes, errors }
  for (const entry of readdirSync(agentNoteRoot, { withFileTypes: true })) {
    if (entry.name === 'INDEX.md') {
      errors.push('结构错误：INDEX.md — 禁止集中式 Agent Note 索引；请浏览 lifecycle/class 目录树或搜索仓库')
      continue
    }
    if (entry.isDirectory() && entry.name !== AGENT_NOTE_ARCHIVE && !(AGENT_NOTE_LIFECYCLES as readonly string[]).includes(entry.name)) {
      errors.push(`结构错误：${entry.name}/ — 未知的生命周期文件夹（允许：${AGENT_NOTE_LIFECYCLES.join(', ')}，另有 ${AGENT_NOTE_ARCHIVE}/）`)
    }
  }
  for (const lifecycle of AGENT_NOTE_LIFECYCLES) {
    for (const match of listMd(resolve(agentNoteRoot, lifecycle), lifecycle).sort()) {
      const segs = match.split('/')
      if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1] ?? '')) continue
      if (match.endsWith('.zh.md')) continue
      const cls = segs[1]
      const base = segs[2]
      if (segs.length !== 3 || cls === undefined || base === undefined) {
        errors.push(`结构错误：${match} — 路径应为 {lifecycle}/{class}/file.md（实际深度 ${segs.length}）`)
        continue
      }
      if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(cls)) {
        errors.push(`结构错误：${match} — 未知的分类文件夹 "${cls}"（允许：${AGENT_NOTE_CLASSES.join(', ')}）`)
        continue
      }
      if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(base)) {
        errors.push(`结构错误：${match} — 文件名必须为 yyyy-mm-dd-topic.md`)
        continue
      }
      notes.push({ lifecycle, rel: match, date: base.slice(0, 10) })
    }
  }
  return { notes, errors }
}
