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

## 誰在哪個工具做事

- **Claude Code**:spec-writer、architect、implementer、verifier、fix-agent
  (各自是 `.claude/agents/vibe-*.md` subagent,model 可各自設定)。
- **Codex**:reviewer(手動 `$vibe-review`、`codex exec`、或 GitHub Action)。
- **人**:核准 spec(status: approved)、開 PR(或授權 agent 開)、執行 merge。

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
   - 若 `auto_review=true`、phase ∈ {build, verify, fix}、tree 乾淨、spec 存在、
     且 review-request 還沒涵蓋這個 HEAD → 自動產生 `.ai/review-request.md`
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
