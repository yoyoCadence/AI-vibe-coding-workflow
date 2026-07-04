# Profile 範例與切換

**角色固定、工具可互換**。profile 是「角色 → 工具/provider/model」的對照表,
放在 `.ai/vibe-flow.config.json`。workflow 與 role 定義完全不知道 Claude 或
Codex 的存在;工具只是 adapter。

## 查看與切換

```powershell
node scripts/vibeflow/vibe.mjs profile                                # 目前分工
node scripts/vibeflow/vibe.mjs profile set codex-build-claude-review  # 切換
node scripts/vibeflow/vibe.mjs ui                                     # 或用 UI 下拉選單切
```

切換影響:之後的「下一步」建議、`review-request` 印出的 reviewer 指令。
不影響:已完成的 review(對其 `reviewed_commit` 仍有效)、`.ai/` 既有內容。
切換時機:任何 phase 都可以;下一棒 agent 照常讀 `.ai/handoff.md` 接手。

## 內建 profile

### `claude-build-codex-review`(預設)

| 角色 | 工具 | model |
|---|---|---|
| spec_writer / architect | Claude Code | claude-opus-4-8 |
| implementer / fix_agent | Claude Code | claude-sonnet-5 |
| verifier | Claude Code | claude-haiku-4-5 |
| reviewer | Codex | gpt-5-codex |

流程入口:Claude 用 `/vibe-spec`、`/vibe-build`;Codex 審用 `$vibe-review`。

### `codex-build-claude-review`(反向)

| 角色 | 工具 | model |
|---|---|---|
| spec_writer | Claude Code | claude-opus-4-8 |
| architect / implementer / verifier / fix_agent | Codex | gpt-5-codex |
| reviewer | Claude Code | claude-opus-4-8 |

流程入口:Codex 用 `$vibe-spec`、`$vibe-build`、`$vibe-fix`、`$vibe-merge-gate`
(prompts 在 `assets/adapters/codex/prompts/`,可複製到 `~/.codex/prompts/`);
Claude 審:**開新 session** 跑 `/vibe-review`,或用 `.claude/agents/vibe-reviewer.md`
subagent(read-only 工具組,只能寫 `.ai/review-result.md`)。

## 自訂 profile

直接在 config 的 `profiles` 加一組,例如「全 Claude、但審查用新 session」:

```json
"claude-solo": {
  "spec_writer":  { "tool": "claude", "provider": "anthropic", "model": "claude-opus-4-8" },
  "architect":    { "tool": "claude", "provider": "anthropic", "model": "claude-opus-4-8" },
  "implementer":  { "tool": "claude", "provider": "anthropic", "model": "claude-sonnet-5" },
  "verifier":     { "tool": "claude", "provider": "anthropic", "model": "claude-haiku-4-5" },
  "reviewer":     { "tool": "claude", "provider": "anthropic", "model": "claude-opus-4-8" },
  "fix_agent":    { "tool": "claude", "provider": "anthropic", "model": "claude-sonnet-5" }
}
```

然後 `vibe profile set claude-solo`。

## 獨立性規則(不因 profile 而鬆動)

允許:Claude 寫+Codex 審、Codex 寫+Claude 審、同工具寫+審(**必須是新的獨立
session,且明確讀 `.ai/review-request.md`**)。
不允許:同一個 session 剛寫完就自己批准自己;reviewer 動手修 code;review 過了自動 merge。

## Model 同步注意事項

profile 是「宣告的意圖」;各工具實際吃的設定:

- **Codex**:`codex exec -m <model>` — `review-request` 印出的指令會自動帶入 profile 的 model。
- **Claude Code subagents**:讀 `.claude/agents/vibe-*.md` frontmatter 的 `model:` —
  改 profile 的 Claude 側 model 後,記得同步這些檔案(`vibe profile set` 會提醒)。
- **Claude Code 主 session**:用 `/model` 或啟動參數選擇。

## 向後相容

舊版 config 只有平面的 `agents` 欄位時,VibeFlow 照舊生效(legacy 模式,
`vibe profile` 會標註)。第一次 `vibe profile set` 會把 profiles 寫進 config,
從此進入 profile 模式;原 `agents` 欄位保留不動、不再被讀取。
