# VibeFlow Quickstart — 從零跑通(含 UI 與雙向 profile)

不熟 VibeFlow 也能照著做。每一步都寫明:**在哪個工具、執行什麼、看哪個檔案**。
以下命令以 Windows PowerShell 為例,macOS/Linux 相同(路徑分隔符自行調整)。

## 0. 安裝到既有專案(一次)

```powershell
cd C:\path\to\your-project        # 必須是 git repo;不是就先 git init + 首次 commit
node "C:\path\to\vibeflow\scripts\vibe.mjs" init          # 要 GitHub 自動 review 加 --with-github-action
git add -A ; git commit -m "chore: install VibeFlow"
```

建立內容:`.ai/`(狀態與交接檔)、`scripts/vibeflow/`(自足 CLI+UI)、
`.claude/skills/` + `.agents/skills/`(兩邊同內容的 skills)、`.claude/agents/`
(subagents)、`.claude/settings.json`(Stop hook)、`CLAUDE.md`/`AGENTS.md` 指引區塊。

## 1. 選 profile(誰寫、誰審)

```powershell
node scripts/vibeflow/vibe.mjs profile                                # 看目前分工
node scripts/vibeflow/vibe.mjs profile set claude-build-codex-review  # 預設:Claude 寫、Codex 審
node scripts/vibeflow/vibe.mjs profile set codex-build-claude-review  # 反向:Codex 寫、Claude 審
```

也可以開 UI 用下拉選單切:

```powershell
node scripts/vibeflow/vibe.mjs ui      # 打開 http://127.0.0.1:7317
```

UI 的「下一步」卡片會隨 profile 告訴你:**現在該去 Claude Code 還是 Codex、貼哪行指令**(附複製鈕)。

## 2. Spec(spec-writer + architect)

| profile | 去哪裡 | 輸入 |
|---|---|---|
| Claude 寫 | Claude Code | `/vibe-spec 幫 API 加 healthz endpoint` |
| Codex 寫 | Codex | `$vibe-spec 幫 API 加 healthz endpoint` |

agent 會追問需求、寫 `.ai/current-spec.md`(含 Acceptance Criteria、Scope、Non-goals)。

**🧑 人工步驟**:打開 `.ai/current-spec.md`,確認內容後把 `status: draft` 改成
`status: approved`。**沒有這步,preflight/review/merge-gate 全部會被 script 擋下。**

## 3. Build(implementer)

| profile | 去哪裡 | 輸入 |
|---|---|---|
| Claude 寫 | Claude Code | `/vibe-build` |
| Codex 寫 | Codex | `$vibe-build` |

agent 會自己跑(你也可以在終端機或 UI 按鈕手動跑):

```powershell
node scripts/vibeflow/vibe.mjs preflight --phase build --fetch   # 在 main → FAIL,擋下
git switch -c feat/T-001-healthz
node scripts/vibeflow/vibe.mjs set working_branch=feat/T-001-healthz --agent implementer
node scripts/vibeflow/vibe.mjs preflight --phase build           # 此時應 PASS
# ...實作、commit...
```

## 4. Verify(記錄測試,綁定 commit)

```powershell
node scripts/vibeflow/vibe.mjs verify -- npm test
```

預期輸出結尾:`verify: PASSED (exit 0) — recorded in .ai/state.json for commit <sha>`。
結果寫入 `state.json.tests_run`(含 commit);**之後每個新 commit 都要重跑**,
merge-gate 會核對。UI 的 verify 欄位可代跑(需手動輸入指令並確認)。

## 5. 產生 review request

```powershell
node scripts/vibeflow/vibe.mjs review-request
```

寫出 `.ai/review-request.md`(凍結 head commit、diff 摘要、AC、reviewer 指令),
並印出「該去哪個工具跑 review」— 內容隨 profile 改變。
若 Claude 側裝了 Stop hook:Claude 停止時,只要 tree 乾淨 + spec approved,會**自動**產生。

## 6. Review(reviewer — 必須是全新 session)

| profile | 去哪裡 | 輸入 |
|---|---|---|
| Codex 審(預設) | Codex(新 session) | `$vibe-review` 或終端機 `codex exec -m gpt-5-codex "Read .ai/review-request.md and follow its Reviewer instructions exactly."` |
| Claude 審 | **新開的** Claude Code session | `/vibe-review`(或用 vibe-reviewer subagent) |

reviewer 產出 `.ai/review-result.md`:`verdict:`、`reviewed_commit:`(完整 sha)、
`- [P0]..[P3]` findings、逐條 AC 驗證(附證據),並用 `vibe set` 更新 state。
reviewer 只能寫這個檔,不能改實作、不能 merge。

## 7. changes_requested → Fix(fix-agent)

| profile | 去哪裡 | 輸入 |
|---|---|---|
| Claude 寫 | Claude Code | `/vibe-build`(state 是 fix,會走 fix-agent 路徑) |
| Codex 寫 | Codex | `$vibe-fix` |

逐條修 P0/P1 → 重跑 verify → 重發 review-request → 回到第 6 步重審(新 commit 一律重審)。

## 8. approved → PR + Merge Gate

```powershell
gh pr create --fill                                    # 🧑 人工開 PR(或授權 agent)
node scripts/vibeflow/vibe.mjs merge-gate --fetch      # 或按 UI 的 merge-gate 按鈕
```

- `BLOCKED`:UI「阻擋原因」卡會列出每個 [FAIL] 與修法;修完重跑。
- `READY`:**🧑 人工執行** `gh pr merge <n> --squash --delete-branch`,然後:

```powershell
node scripts/vibeflow/vibe.mjs set phase=done merge_status=merged next_action="pick next task"
node scripts/vibeflow/vibe.mjs handoff --notes "T-001 merged"
```

沒有 GitHub remote 的專案:config 設 `"require_pr": false`,gate 會跳過 PR 檢查。

## 永遠的人工步驟(不隨 profile / UI 改變)

1. 核准 spec(`status: approved`) 2. 開 PR(除非明確授權) 3. **Merge**(永遠)。

---

## 最小可跑範例(驗證 workflow 本身)

用一個兩檔案的 Node 專案即可,不需任何框架。以下已實測:

```powershell
mkdir demo-app ; cd demo-app ; git init -b main
echo "module.exports = () => 'hello';" > src/app.js    # 先建 src 資料夾
git add -A ; git commit -m "initial commit"
node "C:\path\to\vibeflow\scripts\vibe.mjs" init
git add -A ; git commit -m "chore: install VibeFlow"

node scripts/vibeflow/vibe.mjs preflight --phase build
# 預期:[FAIL] not on protected branch(在 main)+ [FAIL] current spec → exit 1 ✔ 有擋

git switch -c feat/T-001-greet
# (寫 .ai/current-spec.md:task_id T-001、status: approved、Scope: src/ test.js、兩條 AC)
node scripts/vibeflow/vibe.mjs preflight --phase build     # 預期 PASS
# (實作 src/app.js + test.js,git commit)
node scripts/vibeflow/vibe.mjs verify -- node test.js      # 預期 PASSED, recorded for commit <sha>
node scripts/vibeflow/vibe.mjs review-request              # 產生 .ai/review-request.md
# (reviewer 寫 .ai/review-result.md:verdict: approved + reviewed_commit: <HEAD 完整 sha>)
# (spec 的 AC 打勾成 - [x])
node scripts/vibeflow/vibe.mjs handoff
node scripts/vibeflow/vibe.mjs merge-gate
# 預期:無 PR → BLOCKED(exit 1);config 設 require_pr=false 後 → READY(exit 0)✔
```

READY 時的結尾輸出:

```text
-- merge gate: PASS (with warnings) (0 failed, 1 warnings)
Merge gate PASSED. VibeFlow never merges automatically — a human merges:
```

整個過程可以完全在 UI 上看著做:`node scripts/vibeflow/vibe.mjs ui`。
