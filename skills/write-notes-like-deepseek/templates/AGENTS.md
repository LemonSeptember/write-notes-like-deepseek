<!--
  【用法】这是 write-notes-like-deepseek 的现成规则模板。
  1. 复制本文件到你的项目根目录并命名为 AGENTS.md；若已有 AGENTS.md / CLAUDE.md，
     把下面「## 重要改动必须留笔记」整段合并进去即可。
  2. 默认按全局安装路径 ~/.agents/skills/ 书写；若技能装在项目级，
     把下面所有 ~/.agents/skills 换成 .agents/skills。
  3. `~` 只有在 PowerShell（pwsh）下执行才会展开；用 cmd 请改写 %USERPROFILE% 或绝对路径。
  4. 已按 README「本地校验」一节在 package.json 配好 npm script 的项目，
     第 4 条也可直接用 npm run verify-notes。
-->

## 重要改动必须留笔记

1. 非平凡改动（改了行为、架构、跨文件契约、流程与工具链、测试策略、落盘/网络/配置格式）前，遵循 `~/.agents/skills/write-notes-like-deepseek/SKILL.md` 写或更新笔记；机械性小改（样式、格式化、打标、不改行为的补丁）直接提交。
2. 写之前先检索 `.agents/notes/` 里的同主题旧笔记：有归属就地更新；新想法先放 `proposed/`，落地随同代码改动转 `implemented/`；新方案彻底取代旧决策时，同批归档旧篇并标明被谁取代。
3. 被放弃的方案先写它最强的理由，再解释为什么不用。
4. 提交前在仓库根目录用 PowerShell（pwsh）跑校验（`~` 会展开），红了先修再交：
   `npx tsx ~/.agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-tree.ts && npx tsx ~/.agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-format.ts && npx tsx ~/.agents/skills/write-notes-like-deepseek/scripts/verify-archived-agent-notes.ts`
