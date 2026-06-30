# Visual Evidence Layer — makxas-search

SoT: ADR-0076 / makxas-ai-native docs/25-visual-evidence-layer.md

## Rollout status

- rollout_status: `done`
- kind: `ui_no_e2e_manifest`
- ui_e2e: `false`
- sensitive: `true`
- blocked_sensitive_required: `true`
- upload_raw_artifacts: `false`

## Policy

This repo uses `blocked_sensitive` as the default safety boundary. Screenshots, Playwright trace, video, and HTML reports must not be uploaded when the run may include PII, secrets, accounting data, recordings, customer contact data, OAuth, 2FA, CAPTCHA, password, or identity-verification screens. The workflow keeps only `visual-evidence-manifest.json` as the alternative evidence.

## Alternative verification

verify:production and readonly assessment smokes provide text evidence. Any screenshot/trace must be blocked_sensitive unless a non-sensitive route is explicitly allowlisted.

## Not applicable reason

Assessment UI exists, but no Playwright E2E workflow is currently installed. Existing verification is smoke/readonly script based.

## Future UI/E2E trigger

Adding Playwright, e2e-prod.yml, visual diff, screenshot, or trace storage requires Visual Evidence manifest gating before merge.

## Verification fields

- UI: UIなし / UI E2Eなし。例外理由と代替確認をこのファイルと registry に記録済み。
- Function: `node scripts/visual-evidence-manifest.mjs --input <manifest>`
- DB: DB影響なし
