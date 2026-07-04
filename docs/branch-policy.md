# Branch / PR 政策

> 正式(normative)版本:
> [`assets/skills/vibe-flow/references/branch-policy.md`](../assets/skills/vibe-flow/references/branch-policy.md)
> (安裝後在 `.claude/skills/` 與 `.agents/skills/` 各一份)。本檔為中文對照。

## 保護分支
- `main` / `master`(config `protected_branches`)。任何 agent 不得在其上
  commit / amend / force-push / reset。preflight(build/fix)與 merge-gate 直接 FAIL。

## 工作分支
- 命名:`feat/T-00X-<slug>`、`fix/T-00X-<slug>`、`chore/T-00X-<slug>`。
- **一個任務 = 一條 branch = 一份 spec = 一個 PR**,不疊任務。
- 從最新 base 建立:`git switch main && git pull --ff-only && git switch -c feat/T-00X-slug`。
- 建立後立刻 `vibe set working_branch=...`,之後 preflight 會對帳 —
  這就是「防止 agent 在錯 branch 做事」的機制。

## 同步政策
- build 開工前與 merge-gate 前:不得落後 base(`behind == 0`;用 `--fetch` 拿最新遠端)。
- 未發佈 branch 用 `git rebase`,已開 PR 用 `git merge base`。
- 任何同步後:重跑 verify、重發 review-request(HEAD 變了,舊結果一律作廢)。

## PR 政策
- 由人開 PR(`allow_auto_pr` 預設 false;agent 要開必須先問)。建議先 draft。
- base = config 的 `base_branch`;title = `T-00X: <spec title>`。
- **merge 永遠是人類動作**,且必須在 merge-gate READY 之後。建議 squash。

## 全 agent 禁止事項
- `git push --force`(含 --force-with-lease)於共享 branch。
- 未經人明確要求的 `git reset --hard` / `git checkout --`(會滅掉未 commit 的工作)。
- 改寫已開 PR 的歷史;刪除未 merge 的 branch;`--no-verify` 跳過 hook。
