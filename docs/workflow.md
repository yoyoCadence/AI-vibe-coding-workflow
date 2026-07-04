# VibeFlow 完整流程

## 狀態機

```
idle -> spec -> build -> verify -> review -> merge_gate -> done
                  ^                   |
                  |___ fix <----------
                       (changes_requested)
```

| phase | owner | 進入條件 | 離開條件(可驗收輸出) |
|---|---|---|---|
| `idle` | — | 無任務 | 使用者提出需求 |
| `spec` | spec-writer → architect | 需求出現 | `.ai/current-spec.md` `status: approved`(人核准),AC 可驗證,有 Scope/Non-goals |
| `build` | implementer | spec approved、preflight PASS、在 working branch | 實作 commit 完成、決策記入 decisions.md |
| `verify` | verifier | 實作完成 | `vibe verify` 記錄 `passed` 且綁定 HEAD;AC 逐項打勾(附證據);tree 乾淨 |
| `review` | reviewer(Codex) | `vibe review-request` 產生請求 | `.ai/review-result.md` 有 verdict + reviewed_commit + findings |
| `fix` | fix-agent | verdict = changes_requested | P0/P1 全部 resolved、重跑 verify、重發 review-request(回到 review) |
| `merge_gate` | verifier / 人 | verdict = approved | `vibe merge-gate` READY → **人**執行 merge |
| `done` | — | PR merged | state 標記 done、最終 handoff |

## 誰在哪個工具做事(由 profile 決定)

角色是固定的;**工具是可插拔的 adapter**。`.ai/vibe-flow.config.json` 的
`active_profile` 決定每個角色由 Claude Code 還是 Codex 扮演
(`vibe profile` 查看、`vibe profile set <name>` 切換,或用 UI 切):

- **預設 `claude-build-codex-review`**:Claude 做 spec-writer / architect /
  implementer / verifier / fix-agent(各自是 `.claude/agents/vibe-*.md`
  subagent,model 可各自設定);Codex 做 reviewer(`$vibe-review`、
  `codex exec`、或 GitHub Action)。
- **反向 `codex-build-claude-review`**:Codex 做 build 側(`$vibe-build`、
  `$vibe-fix`、`$vibe-merge-gate` prompts);Claude 做 reviewer
  (`.claude/agents/vibe-reviewer.md` subagent,或新 session 跑 `/vibe-review`)。
- **人(不隨 profile 改變)**:核准 spec(status: approved)、開 PR(或授權
  agent 開)、執行 merge。

**Review 獨立性**:reviewer 必須是全新獨立 session,不能是剛寫 code 的上下文。
同工具可以(新 session + 明確讀 `.ai/review-request.md`),同 session 自審不行。

## UI 控制台

`node scripts/vibeflow/vibe.mjs ui` 開本地控制台(127.0.0.1:7317):顯示 phase、
下一步(該去哪個工具貼什麼)、stepper、阻擋原因、profile 切換、`.ai/` 預覽與安全
按鈕。事實來源仍是 `.ai/` 檔案;UI 所有變更都經 `vibe.mjs`,沒有 merge 類按鈕。
操作流程見 [quickstart.md](quickstart.md)。

## Handoff 機制(為什麼不會「忘記」)

每個會「忘記」的東西都有一個確定性的家:

| 容易忘的事 | 防呆機制 |
|---|---|
| 在錯 branch 做事 | `preflight` 開工前必跑,main/master 直接 FAIL;`state.working_branch` 與實際 branch 漂移會警告 |
| 忘記 PR 狀態 | `pr-status` / preflight 每次把 gh 查到的事實寫回 state |
| 忘記驗收 | Claude Stop hook:phase 在 build/verify/fix 且 tree 乾淨時,自動產生 `.ai/review-request.md`;`review_status` 卡在 state 裡,merge-gate 沒 approved 就 BLOCKED |
| 忘記更新交接 | Stop hook 每次自動重生 handoff 快照;merge-gate 檢查 handoff 是否提到 HEAD |
| 測試過期 | `verify` 把結果綁 commit;HEAD 一變,merge-gate 立刻要求重跑 |
| review 過期 | review-result 記 reviewed_commit;HEAD 一變,merge-gate 要求重審 |

## 半自動驗收(handoff 到 Codex)

1. Claude 完成工作停下 → Stop hook 跑 `vibe.mjs hook-stop`:
   - 重生 `.ai/handoff.md` 快照
   - 若 `auto_review=true`、phase ∈ {build, verify, fix}、tree 乾淨(`.ai/` 除外)、
     spec 存在**且 status: approved**、review-request 還沒涵蓋這個 HEAD
     → 自動產生 `.ai/review-request.md`
2. 你切到 Codex 視窗,輸入 `$vibe-review`(或跑
   `codex exec "Read .ai/review-request.md and follow its Reviewer instructions exactly."`)。
3. Codex 寫 `.ai/review-result.md`、用 `vibe set` 更新 state、更新 handoff。
4. 你切回 Claude:`/vibe-build` 續跑 fix(state 會告訴它該做什麼),或 verdict
   approved 時跑 `/vibe-merge-gate`。

全自動(PR 觸發)見 `.github/workflows/vibeflow-codex-review.yml`
(`init --with-github-action` 安裝)。

## Hook 行為與邊界

- 只有一個 hook:`Stop` → `node scripts/vibeflow/vibe.mjs hook-stop`。
- 它**只寫 `.ai/` 檔案**,永遠 exit 0(不會把 Claude 卡住),不 merge、不碰程式碼、
  不開 PR。
- 關閉方式:`.ai/vibe-flow.config.json` 設 `hooks_enabled: false`(hook 會自我跳過),
  或從 `.claude/settings.json` 移除。

## 一次任務的完整時間軸

見 [examples.md](examples.md)。
