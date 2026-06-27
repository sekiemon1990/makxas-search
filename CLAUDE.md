
<!-- ADR-0059-SAFE-AUTONOMOUS-IMPROVEMENT-BEGIN -->
## 安全な自律改善の既定（ADR-0059）
- マクサスイズムに反しない safe なバグ修正、エラー改善、テスト追加、再発防止、監査スクリプト化、hook/self-test/CI guard 化、docs/runbook整備、自己学習ループ改善は、Claude Code / Codex / automation / subagent が確認待ちにせず自律実行する。
- 人間に確認を戻すのは、secret/PII、OAuth/2FA/CAPTCHA、権限変更、外部送信、本人名義送信、課金・契約、DNS/公開範囲、本番DB破壊、危険なmigration/RLS、force push、法令・信用・マクサスイズム違反、事業上の最終意思決定だけに限定する。
- 止まった場合は、理由、AIが試した代替、残る1アクション、次回から止めない改善案を同じturnで記録する。
<!-- ADR-0059-SAFE-AUTONOMOUS-IMPROVEMENT-END -->

@AGENTS.md
