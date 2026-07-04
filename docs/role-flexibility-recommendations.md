# VibeFlow Role Flexibility Recommendations

> **狀態:已實作(2026-07-04)**。P1–P3 全部完成,P4(自動 dispatch)依本文件建議刻意不做。
> 實作結果見 [quickstart.md](quickstart.md)、[profile-examples.md](profile-examples.md)、
> `vibe profile` 與 `vibe ui` 指令。本檔保留為設計依據。

這份文件是給下一位 agent 的改進 brief。請先閱讀，不要直接開始重構；目標是評估並規劃如何把 VibeFlow 從「Claude Code 寫碼、Codex review」改成「角色固定、工具可互換」的 workflow。

## 背景

目前 VibeFlow 的設計已經能支援一條清楚的 AI coding 流程：

```text
Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate
```

但目前文件與 adapter 語氣偏向：

- Claude Code = spec / build / fix / verify
- Codex = review

這符合目前使用習慣，但長期會限制 workflow。Codex 也可能適合寫碼，Claude 也可能適合 review；不同專案、不同模型版本、不同任務類型，都可能需要換分工。

## 核心建議

請把 VibeFlow 定位改成：

> VibeFlow 不是「Claude 寫、Codex 審」，而是「Build Agent 寫、Review Agent 審」。Claude、Codex 只是可插拔 adapter。

也就是把設計拆成三層：

1. **Workflow 層**
   固定流程，不知道 Claude 或 Codex。

2. **Role 層**
   固定角色與責任。

3. **Adapter / Profile 層**
   決定每個角色由哪個工具、provider、model 扮演。

## 建議架構

### 1. Workflow 層

Workflow 應維持不變：

```text
Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate
```

這層不應該寫死任何工具名稱。文件中可以用「implementation agent」「review agent」這類中性詞。

### 2. Role 層

保留現有角色：

- `spec-writer`
- `architect`
- `implementer`
- `verifier`
- `reviewer`
- `fix-agent`

每個 role 只定義：

- 觸發條件
- 輸入
- 輸出
- 必跑 script
- 禁止事項
- handoff 規則

Role 不應該假設自己一定在 Claude 或 Codex 裡執行。

### 3. Adapter / Profile 層

新增或擴充 `.ai/vibe-flow.config.json`，讓使用者可以選 active profile。例如：

```json
{
  "active_profile": "claude-build-codex-review",
  "profiles": {
    "claude-build-codex-review": {
      "spec_writer": { "tool": "claude", "provider": "anthropic", "model": "claude-opus-4-8" },
      "architect": { "tool": "claude", "provider": "anthropic", "model": "claude-opus-4-8" },
      "implementer": { "tool": "claude", "provider": "anthropic", "model": "claude-sonnet-5" },
      "verifier": { "tool": "claude", "provider": "anthropic", "model": "claude-haiku-4-5" },
      "reviewer": { "tool": "codex", "provider": "openai", "model": "gpt-5-codex" },
      "fix_agent": { "tool": "claude", "provider": "anthropic", "model": "claude-sonnet-5" }
    },
    "codex-build-claude-review": {
      "spec_writer": { "tool": "claude", "provider": "anthropic", "model": "claude-opus-4-8" },
      "architect": { "tool": "codex", "provider": "openai", "model": "gpt-5-codex" },
      "implementer": { "tool": "codex", "provider": "openai", "model": "gpt-5-codex" },
      "verifier": { "tool": "codex", "provider": "openai", "model": "gpt-5-codex" },
      "reviewer": { "tool": "claude", "provider": "anthropic", "model": "claude-opus-4-8" },
      "fix_agent": { "tool": "codex", "provider": "openai", "model": "gpt-5-codex" }
    }
  }
}
```

這只是建議格式。實作前請確認是否要維持向後相容現有 `agents` 設定。

## 必須保留的安全原則

角色可互換，但 review 不能失去獨立性。建議保留這條硬規則：

> Reviewer 必須是不同 session / 不同視角的 agent；最好不是剛剛寫 code 的同一個上下文。

可以允許：

- Claude build, Codex review
- Codex build, Claude review
- Claude build, Claude review, 但必須是新的獨立 session，且明確讀 `.ai/review-request.md`
- Codex build, Codex review, 但必須是新的獨立 session，且不能沿用 build chat context

不建議：

- 同一個 agent 在同一段上下文中「剛寫完就自己批准自己」
- reviewer 自動修 code
- review 通過後自動 merge

## 建議調整項目

### 文件

建議修改：

- `README.md`
- `docs/workflow.md`
- `docs/examples.md`
- `assets/adapters/shared/memory-snippet.md`
- `assets/skills/vibe-flow/SKILL.md`
- `assets/skills/vibe-flow/agents.md`

方向：

- 把「Claude implements; Codex reviews」改成「default profile: Claude implements, Codex reviews」
- 明確說明 roles are tool-agnostic
- 新增 profile 範例
- 說明如何切換成 Codex build / Claude review

### Skills

目前 `.claude/skills` 和 `.agents/skills` 都會安裝完整 step skills，這個方向是好的。請確保文字不要暗示：

- Codex 只能 review
- Claude 只能 build

每個 step skill 應該寫成 role-first：

- `/vibe-build` 或 `$vibe-build` 都是 implementer role
- `/vibe-review` 或 `$vibe-review` 都是 reviewer role

### Adapters

Claude adapter 可以保留 Stop hook，但要定義成「Claude 專用便利功能」，不是核心 workflow 依賴。

Codex adapter 可以補：

- `$vibe-build` prompt
- `$vibe-fix` prompt
- `$vibe-merge-gate` prompt

如果 Codex 沒有 prompt/skill 自動觸發，也應在 `AGENTS.md` 裡提供 fallback：

```text
If asked for $vibe-build and no skill triggers, read .agents/skills/vibe-flow/steps/build.md and follow it.
```

### Scripts

短期不一定要讓 scripts 自動 dispatch 到 Claude/Codex。第一版可以只讓 scripts 繼續負責 deterministic state。

未來可以考慮新增：

```bash
node scripts/vibeflow/vibe.mjs whoami
node scripts/vibeflow/vibe.mjs profile
node scripts/vibeflow/vibe.mjs profile set codex-build-claude-review
```

但不要把 workflow 變成複雜 orchestrator。VibeFlow 的價值是簡單、可手動接力、狀態清楚。

## 優先順序

### P1: 先改觀念與文件

- README 改成 role-first
- docs 補 profile 概念
- examples 保留預設 Claude build / Codex review，但新增反向範例
- memory snippet 避免把工具分工寫死

### P2: 補 config profile

- 在 `.ai/vibe-flow.config.json` 新增 `active_profile`
- 保留現有 `agents` 欄位的向後相容
- 文件說明 model 設定與實際 adapter 設定可能需要同步

### P3: 補 Codex build / Claude review adapter

- Codex prompt 不只 review，也提供 build/fix
- Claude reviewer subagent 或 prompt
- Review independence rule 寫清楚

### P4: 再考慮自動 dispatch

只有在前面穩定後，才考慮 script 幫忙輸出「下一步該在哪個工具跑什麼命令」。不要一開始就做自動切換 agent。

## UI / 控制台需求

使用者不想靠記憶流程或手動背一堆命令。因此，如果可行，請一起設計一個簡單的 VibeFlow UI / 控制台，讓 workflow 的狀態與下一步非常明確。

目標不是做大型產品，而是做一個本地、低風險、可理解的操作面板。UI 必須仍然以 `.ai/` 檔案與 deterministic scripts 作為事實來源；不要讓 UI 自己另存一套狀態，也不要讓 UI 繞過 `vibe.mjs` 的安全檢查。

### UI 主要目標

- 讓使用者不用記住整條流程
- 清楚顯示現在在哪個 phase
- 清楚顯示目前 owner agent 是誰
- 清楚顯示 active profile 與每個 role 對應的工具/model
- 可以用 UI 切換 profile，例如 Claude build / Codex review 或 Codex build / Claude review
- 顯示下一步應該在哪個工具執行什麼
- 用按鈕執行安全的 deterministic scripts
- 把危險或需要人類判斷的動作標示為「人工步驟」，不要自動執行

### 建議 UI 形式

優先考慮簡單、跨平台、低依賴方案：

1. 本地靜態 HTML + Node script 啟動小 server
2. VS Code task / simple webview 文件入口
3. CLI TUI 也可考慮，但對一般使用者可能不如 web UI 直觀

不建議第一版就做完整 Electron app 或大型前端框架。VibeFlow 的核心價值是流程清楚，不是 UI 複雜。

### 建議畫面

最小可用 UI 可以包含：

- **Status Dashboard**
  - project
  - current_task_id
  - phase
  - owner_agent
  - base_branch
  - working_branch
  - pr_number
  - tests_run
  - review_status
  - merge_status
  - blockers
  - next_action

- **Profile Switcher**
  - 顯示 active profile
  - 顯示每個 role 的 tool/provider/model
  - 可切換 profile
  - 切換前提示會影響後續 handoff，但不應改掉已完成的 review 結果

- **Workflow Stepper**
  - Spec
  - Build
  - Verify
  - Review
  - Fix
  - PR
  - Merge Gate
  - Done

  每一步都顯示：
  - 狀態：not started / current / blocked / done
  - owner role
  - 建議工具：Claude 或 Codex
  - 建議命令或 prompt
  - 需要人工確認的地方

- **Actions**
  安全按鈕可以包含：
  - status
  - preflight
  - handoff
  - review-request
  - pr-status
  - merge-gate

  謹慎處理：
  - verify：需要使用者輸入 test command，不能默默跑任意 shell
  - profile switch：要明確確認
  - init：只在尚未安裝或 repair 模式下出現

  不應提供：
  - auto merge
  - force push
  - reset hard
  - reviewer 直接修 implementation files

- **Handoff Preview**
  - 顯示 `.ai/handoff.md`
  - 顯示 `.ai/review-request.md`
  - 顯示 `.ai/review-result.md`
  - 提醒哪些區塊是 generated、哪些區塊可手動編輯

### UI 的安全規則

- UI 只能透過 `node scripts/vibeflow/vibe.mjs <command>` 更新 workflow 狀態。
- UI 不應直接手改 `.ai/state.json`，除非是透過正式 script/API。
- UI 不應把 secret、token、`.env` 內容顯示出來。
- UI 不應自動 merge。
- UI 不應讓 reviewer 寫 implementation files。
- UI 顯示 command 時要清楚標示「複製到 Claude」「複製到 Codex」「在終端機執行」。
- UI 應該顯示每個 BLOCKED 原因，並連到對應修復步驟。

### UI 完成後也要有文件

如果實作 UI，請在文件中補：

- 如何啟動 UI
- UI 每個區塊代表什麼
- 哪些按鈕會執行 scripts
- 哪些動作仍需手動去 Claude / Codex 視窗完成
- 如何切換 profile
- 如何用 UI 跑通最小範例

## 完成後的交付要求

完成 role flexibility 改進後，請務必整理一份完整、可照著操作的使用流程。這份流程要讓不熟 VibeFlow 的使用者也知道每一步該在哪個工具、執行什麼命令、看哪個檔案。

至少要包含：

- 如何把 VibeFlow 安裝到一個既有專案
- 如何選擇或切換 active profile
- Claude build / Codex review 的預設流程
- Codex build / Claude review 的反向流程
- 如何產生 spec
- 如何讓 build agent 開工作分支並實作
- 如何執行 verify 並把測試結果記錄到 `.ai/state.json`
- 如何產生 `.ai/review-request.md`
- reviewer 要如何產生 `.ai/review-result.md`
- changes requested 時如何回到 fix-agent
- approved 後如何跑 merge gate
- 哪些步驟仍然需要人類確認，例如 approve spec、開 PR、merge
- 如果有 UI，如何透過 UI 完成上述流程，而不是只靠命令列

也請附上一個簡單、可跑通的最小範例。建議用一個非常小的 Node.js 專案或純文字 fixture，不要依賴大型框架。範例目標是驗證 workflow 本身，不是展示複雜功能。

範例至少要證明：

- `vibe init` 能建立必要檔案
- `current-spec.md` 能被填成一個 approved spec
- build/fix agent 能在非 main/master 分支工作
- `vibe preflight` 能跑
- `vibe verify -- <command>` 能把測試結果寫入 state
- `vibe review-request` 能產生 review request
- reviewer 能寫出 review result
- `vibe merge-gate` 在條件齊全時能到 READY，缺條件時會 BLOCKED

請把使用流程與範例放在文件中，建議新增或更新：

- `docs/workflow.md`
- `docs/examples.md`
- 可選：新增 `docs/quickstart.md`
- 可選：新增 `docs/profile-examples.md`

如果實際跑通範例需要建立臨時測試 repo，請在文件中寫清楚使用的命令、預期輸出、以及哪些檔案會被建立。不要要求使用者靠聊天歷史理解流程。

## 不建議做的事

- 不要把 Claude/Codex 抽象成完全自動互叫；使用者目前是手動切換 agent 視窗，先優化 handoff 比自動 orchestration 更重要。
- 不要讓 reviewer 可以修改 implementation branch。
- 不要讓同一個 session 自寫自審。
- 不要讓 GitHub Action 自動 merge。
- 不要為了 profile 引入大型 dependency 或複雜插件系統。

## 建議結論

應該改成可互換，但不要改成自由混亂。

推薦原則：

```text
Roles fixed.
Tools configurable.
Review independent.
Scripts deterministic.
Merge human-only.
```

預設 profile 仍可維持 Claude build / Codex review，因為這符合目前使用者習慣；但 VibeFlow 的核心文件與資料結構應該避免把這件事寫死。
