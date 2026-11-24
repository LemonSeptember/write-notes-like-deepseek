<!--
  【用法】这是 write-notes-like-deepseek 的现成规则模板。
  1. 复制本文件到你的项目根目录并命名为 AGENTS.md；若已有 AGENTS.md / CLAUDE.md，
     把下面「## 重要改动必须留笔记」整段合并进去即可。
  2. 下面按多数 Agent 的全局安装目录 ~/.agents/skills/write-notes-like-deepseek 书写。
     若你的安装位置不同，把规则里的该前缀换成实际目录，常见：
       ~/.claude/skills/write-notes-like-deepseek   （Claude Code）
       .agents/skills/write-notes-like-deepseek      （安装到当前项目）
  3. `~` 在 PowerShell、bash、zsh 下都会展开；只有 Windows cmd 不展开——建议用 PowerShell 执行，
     或把 `~` 换成 %USERPROFILE%（cmd）或绝对路径。
  4. 已按 README「本地校验」一节在 package.json 配好 npm script 的项目，
     第 4 条也可直接用 npm run verify-notes。
-->

## 重要改动必须留笔记

1. 非平凡改动（改了行为、架构、跨文件契约、流程与工具链、测试策略、落盘/网络/配置格式）前，遵循 `~/.agents/skills/write-notes-like-deepseek/SKILL.md` 写或更新笔记；机械性小改（样式、格式化、打标、不改行为的补丁）直接提交。
2. 写之前先检索 `.agents/notes/` 里的同主题旧笔记：有归属就地更新；新想法先放 `proposed/`，落地随同代码改动转 `implemented/`；新方案彻底取代旧决策时，同批归档旧篇并标明被谁取代。
3. 被放弃的方案先写它最强的理由，再解释为什么不用。
4. 提交前在仓库根目录跑校验（需用能展开 `~` 的 shell：PowerShell / bash / zsh），红了先修再交：
   `npx tsx ~/.agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-tree.ts && npx tsx ~/.agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-format.ts && npx tsx ~/.agents/skills/write-notes-like-deepseek/scripts/verify-archived-agent-notes.ts`
