# AGENTS.md — pi-exa

読者: pi-exa を変更するエージェントと開発者。利用者向けの仕様は README、設計判断は DESIGN.md。
共通の検証と規則はルートの `AGENTS.md` にある。

`npm install` で入る依存はすべて devDependency。実行時依存はゼロ（`dependencies` は空）。

## 壊してはいけない制約

### ツール面とコンテキストコスト

- 登録ツールは 13 個で固定。増減・改名は `test/contract/tool-surface.test.ts` の `EXPECTED_TOOLS` の更新を伴う。
- 既定でセッション開始時に有効なのは `exa_search` / `exa_contents` / `exa_answer` / `exa_help` の4つだけ。
- 常時有効な4ツールの定義（説明 + スキーマ）の合計は **1800 トークン**以内（4文字 = 1トークン換算）（`test/contract/tool-surface.test.ts`）。
- 全ツールが label・description・object schema を持つ（`test/contract/tool-surface.test.ts`）。
- ツール群を active にするのは、設定の `groups`、`exa_help`、`/exa enable` だけ（`test/integration/extension.test.ts`）。

### 設定と認証

- 設定はグローバル → プロジェクトの順にマージする（`test/unit/config.test.ts`）。
- リクエストボディは設定の `defaults` → ツール引数 → `options` の順に重なる（`test/unit/body.test.ts`）。
- API キーは `apiKeyEnv` → `EXA_API_KEY` → 設定の順で解決する（`test/unit/config.test.ts`）。
- `/exa config` は API キーをマスクする（`test/integration/extension.test.ts`）。
- 数値設定が不正（非数・下限未満）なら警告を出し、既定値に戻す（`test/unit/config.test.ts`）。

### モデルへの出力

- モデルへの出力は `output` の上限（`maxResults` / `maxTotalChars` / `maxCharsPerResult`）に従う（`test/unit/format.test.ts`）。
- 全エンドポイントが `exa_help` のトピックから到達でき、未知のパスは候補付きで拒否される（`test/unit/reference.test.ts`、`test/integration/tools-misc.test.ts`）。

### ビルドと配布

- ビルド工程を持たない（TS を直接配布）。配布物は `src/`、`package.json`、`README.md` だけ（`test/ci/tarball.test.ts`）。
- `src` の import は node builtin（`node:fs` / `node:os` / `node:path`）・相対 `.ts`・Pi 提供パッケージ・`typebox` だけ（`test/contract/dependencies.test.ts`）。

## 変更手順

- ツールを増やす・引数を増やすときは、`src/registry.ts`（`GROUPS` / `MANAGED_TOOLS` / `TOOL_SIGNATURES`）と `test/contract/tool-surface.test.ts` の `EXPECTED_TOOLS` を先に更新する。常時有効にするなら `ALWAYS_ON` も更新する。
- `TOKEN_BUDGET` は上げるための数値ではなく、交渉するための数値として扱う。上げるときは計測値をテストのコメントに、理由をコミットメッセージに残す。
- エンドポイントやトピックを足すときは、`src/reference.ts` の索引も更新する。到達性は `test/unit/reference.test.ts` が検査する。
- 依存を追加するときは devDependency だけ。`test/contract/dependencies.test.ts` の `DEV_TOOLS` を更新し、コミットメッセージに理由を書く。
- 契約テストは jiti 経由で `src` をもう一度ロードするため、同じファイルが2実体として数えられる。カバレッジの数値はこの影響を受ける。
- 手動で確認する項目は [docs/manual-checks.md](docs/manual-checks.md) に書く。
