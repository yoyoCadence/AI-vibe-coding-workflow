# Review Rubric(驗收準則)

> 正式(normative)版本是英文檔
> [`assets/skills/vibe-flow/references/review-rubric.md`](../assets/skills/vibe-flow/references/review-rubric.md),
> 安裝後位於 `.agents/skills/vibe-flow/references/review-rubric.md`(Codex)與
> `.claude/skills/vibe-flow/references/review-rubric.md`(Claude)。reviewer 讀那份;
> 本檔是給人看的中文對照。

嚴重度:**P0** 破壞 AC / 安全 / 資料;**P1** merge 前必修;**P2** 儘快修;**P3** 小毛病。
merge-gate 會擋所有未標 `[resolved]` 的 P0/P1。

| # | 檢查 | 不過的後果 |
|---|---|---|
| 1 | **Acceptance criteria**:每條 AC 都有證據(測試名、指令輸出)驗證 | 未達 → P0/P1,verdict 最多 changes_requested |
| 2 | **Regression**:diff 是否改到 Goal 以外的行為?檢查被改函式的呼叫端、預設值、回傳形狀、移除的 export | P1+ |
| 3 | **Missing tests**:新行為沒有「壞掉會亮」的測試 → P1;弱化/刪除測試且 spec 未授權 → P0 | |
| 4 | **Security**:injection、authn/authz 缺口、path traversal、SSRF、XSS、信任邊界未驗證輸入 | P0 |
| 5 | **Secret / env leak**:diff 內有憑證、token、私鑰、.env;log 印出 secret。**finding 只寫 file:line,不得引用 secret 值** | P0 + verdict blocked |
| 6 | **Debug 殘留**:print/console.log、註解掉的 code、無 issue 的 TODO | P2(有印資料 → P1) |
| 7 | **Branch 正確**:在 spec 指定的 working branch,不在 main/master | P0 |
| 8 | **PR 存在**:open、非 draft(require_pr 時) | P1 |
| 9 | **無不相關檔案**:changed files 都在 spec `## Scope` 內(`.ai/` 等 workflow 檔豁免) | P1 |
| 10 | **無過度工程**:沒有 Non-goals 排除的抽象層;沒有 spec 未點名的新依賴 | 依賴 P1、鍍金 P2 |
| 11 | **架構相容**:不違反既有 pattern、不破壞模組邊界、不重複既有 utility、無循環依賴 | P1/P2,附既有 pattern 位置 |

另外交叉核對確定性資料:`state.json.tests_run` 必須是 `passed` 且綁定受審 commit;
review-request 標記 STALE 就直接 changes_requested。
