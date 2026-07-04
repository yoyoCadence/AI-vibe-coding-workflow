# 端到端範例:一次任務的完整時間軸

情境:在既有專案 `my-app` 加一個 `/healthz` endpoint。

## 0. 一次性安裝

```powershell
cd C:\code\my-app          # 已是 git repo
node C:\path\to\vibeflow\scripts\vibe.mjs init --with-github-action
git add -A ; git commit -m "chore: install VibeFlow"
```

## 1. Spec(Claude Code)

你在 Claude Code 輸入:

> /vibe-spec 幫 API 加一個 healthz endpoint,監控系統要用

spec-writer 追問細節 → 寫 `.ai/current-spec.md`(task_id: T-001,AC 例如
「GET /healthz 回 200 與 `{status:"ok"}`(test: tests/healthz.test.js)」,
Scope: `src/routes/`, `tests/`)→ architect 補 Approach/Risks →
你把 `status: draft` 改成 `status: approved`。

## 2. Build + Verify(Claude Code)

> /vibe-build

Claude 執行:

```
node scripts/vibeflow/vibe.mjs preflight --phase build --fetch   # 在 main → FAIL
git switch -c feat/T-001-healthz
node scripts/vibeflow/vibe.mjs set working_branch=feat/T-001-healthz --agent implementer
node scripts/vibeflow/vibe.mjs preflight --phase build           # PASS
# ...實作、commit...
node scripts/vibeflow/vibe.mjs verify -- npm test                # 記錄 passed@HEAD
```

AC 打勾(附證據)→ commit → Claude 停下 → **Stop hook 自動**重生 handoff 並產生
`.ai/review-request.md`。

## 3. Review(Codex)

切到 Codex 視窗:

```
$vibe-review
```

或在終端機:

```powershell
codex exec -m gpt-5-codex "Read .ai/review-request.md and follow its Reviewer instructions exactly."
```

Codex 讀 spec + diff + rubric → 寫 `.ai/review-result.md`,例如:

```markdown
- verdict: changes_requested
- reviewed_commit: 3f2a...(full sha)
## Findings
- [P1] src/routes/healthz.js:12 — 未處理 DB ping 逾時,監控會誤報
```

並執行 `vibe set review_status=changes_requested phase=fix owner_agent=fix-agent ...` + handoff。

## 4. Fix(Claude Code)

> /vibe-build  (state 顯示 phase=fix,Claude 走 fix-agent 路徑)

fix-agent 修 P1 → `vibe verify -- npm test` → 標 `[resolved]` →
`vibe review-request` → 回到步驟 3,這次 verdict: `approved`。

## 5. PR + Merge Gate

```powershell
gh pr create --fill                                   # 人開 PR(或授權 agent)
node scripts/vibeflow/vibe.mjs merge-gate --fetch     # READY 才算過
gh pr merge 42 --squash --delete-branch               # 人執行 merge
node scripts/vibeflow/vibe.mjs set phase=done merge_status=merged next_action="pick next task"
node scripts/vibeflow/vibe.mjs handoff --notes "T-001 merged in PR #42"
```

若裝了 GitHub Action,PR 開啟/更新時 Codex 會自動在 PR 留一則 rubric 格式的
review comment(需 repo secret `OPENAI_API_KEY`)。

## 常用查詢

```powershell
node scripts/vibeflow/vibe.mjs status      # 我在哪、誰持球、下一步
node scripts/vibeflow/vibe.mjs pr-status   # PR 狀態並寫回 state
type .ai\handoff.md                        # 上一個 agent 留了什麼
```
