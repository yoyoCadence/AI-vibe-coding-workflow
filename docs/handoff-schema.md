# `.ai/` Handoff Schema

原則:**state.json 給機器,handoff.md 給下一個 agent 的腦**。
state.json 只能由 vibe scripts(含 `vibe set`)寫入;handoff.md 的生成區塊由
script 重生、`Agent notes` 區塊由 agent 手寫(marker 之間的內容會被保留)。

## state.json

| 欄位 | 型別 | 寫入者 | 意義 |
|---|---|---|---|
| `schema_version` | int | init | schema 版本(目前 1) |
| `project` | string | init | 專案名 |
| `current_task_id` | string\|null | `vibe set` | 如 `T-003` |
| `phase` | enum | `vibe set` / scripts | `idle, spec, build, verify, review, fix, merge_gate, done` |
| `owner_agent` | enum\|null | `vibe set` | 現在持球者:`spec-writer, architect, implementer, verifier, reviewer, fix-agent, human` |
| `base_branch` | string | init / `vibe set` | 通常 main |
| `working_branch` | string\|null | preflight / `vibe set` | 任務 branch;preflight 會與實際 branch 對帳 |
| `pr_number` | int\|null | pr-status / preflight | gh 查到的 PR 編號 |
| `last_commit` | string\|null | scripts | HEAD full sha(state 是否過期的判準) |
| `dirty_files` | string[] | scripts | `git status --porcelain` 快照(上限 100) |
| `tests_run` | object | `vibe verify` | `{status: none/passed/failed, command, exit_code, commit, at}` — **綁 commit** |
| `review_status` | enum | review-request / `vibe set` | `none, requested, in_review, changes_requested, approved` |
| `merge_status` | enum | merge-gate / `vibe set` | `none, blocked, ready, merged` |
| `blockers` | string[] | `vibe set` | 阻塞原因(空 = 無) |
| `next_action` | string | `vibe set` | 下一步的一句話,給下一個 agent |
| `preflight` | object | preflight | `{at, ok, phase, checks:{id:{level,detail}}}` |
| `merge_gate` | object | merge-gate | 同上 |
| `updated_at` / `updated_by` | string | 所有 scripts | 最後更新時間與角色 |

## handoff.md 區塊

| 區塊 | marker | 寫入者 |
|---|---|---|
| Snapshot | `vibeflow:generated` | `vibe handoff` / Stop hook(branch、HEAD、dirty、tests、review/merge、近 5 commits) |
| Preflight | `vibeflow:preflight` | `vibe preflight` |
| Merge gate | `vibeflow:gate` | `vibe merge-gate` |
| Agent notes | `vibeflow:manual` | **agent 手寫**:做了什麼 / 沒做什麼 / 地雷 / 下一步先做什麼 |

## 其他檔案

- `current-spec.md` — 唯一進行中的 spec。機器可讀欄位:`task_id`, `status`,
  `working_branch`;機器檢查的區塊:`## Acceptance Criteria`(checkbox)、
  `## Scope`(檔案前綴/glob 白名單)。placeholder 標記 `vibeflow:no-active-spec`。
- `review-request.md` — 由 script 產生,凍結「審什麼」:head_commit、diff base、
  AC 摘錄、changed files、tests 狀態、reviewer 指令。
- `review-result.md` — reviewer 唯一輸出。機器讀:`verdict:`、`reviewed_commit:`、
  `- [P0]/[P1]` 行(未標 `[resolved]` 即擋 merge)。placeholder 標記
  `vibeflow:no-review-yet`。
- `decisions.md` — append-only 決策記錄(未來 agent 無法從 code 推回來的事)。
- `task-log.md` — append-only 事件表(time / agent / phase / event),稽核用。
- `vibe-flow.config.json` — 角色 model、`base_branch`、`protected_branches`、
  `auto_review`、`hooks_enabled`、`allow_auto_pr`、`require_pr`、`test_command`。
  `allow_auto_merge` 被程式強制為 false。

## 更新規約

1. 誰轉 phase,誰負責 `vibe set` + `vibe handoff` + 手寫 notes,三件缺一不可。
2. 禁止手改 state.json / 生成區塊(JSON 壞掉整條 pipeline 會停)。
3. `--agent <role>` 必帶,task-log 才追得到責任鏈。
