# AGENTS.md — pi-exa で作業するエージェント向けの指示

読者は pi-exa を変更する AI エージェントと開発者です。利用者向けの仕様は README に、
設計の判断基準は DESIGN.md と PHILOSOPHY.md(このプラグイン群共通)に書きます。

ここには、壊してはいけない制約と、制約に触れる変更の手順だけを書きます。制約の正はテストで、
下の表はその索引です。実装と表が食い違った場合はテストが正です。検証手段を併記できないものは制約として書かず、
自動テストできない範囲は末尾に分けます。

## 完了条件

`npm run verify`(= `npm run check` + `npm run knip` + `npm test` + `npm run test:coverage`)が通ること。
フックが通っても CI が通らなければ未完了。CI は同じ `verify` を Node 22.19 / 24 で実行します。
カバレッジは `test/unit` と `test/integration` で計測します。下の表の「検証」列は個別の検証箇所であり、
自動検証はすべて `verify` に含まれます。

## ローカル開発

- `npm install`: 依存を入れる。依存はすべて devDependency で、実行時依存はゼロ。
- `npx lefthook install`: git フックを有効にする。手動で実行する。
  `package.json` の lifecycle script には置かない。`pi install git:...` は `npm install --omit=dev` を実行するため、
  devDependency の lefthook が無い状態で script が走るとインストールごと失敗する。
- フックは利便性のためのもの。完了条件は常に `npm run verify`。
- ソースの対応: `src/config.ts`(設定の探索・マージ)、`src/client.ts`(HTTP)、`src/format.ts`(モデル向け整形と出力上限)、
  `src/reference.ts`(`exa_help` のトピックと全エンドポイント索引)、`src/registry.ts`(ツール名・グループ)、`src/tools/*.ts`(ツール実装)。
- 契約テストは `test/contract/`(ツール面・常時予算・import 境界)と `test/ci/`(npm pack の内容)。`src` を Pi のローダー経由で読み込んで検証する。

## 制約

### ツール面

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 登録ツールは13個で固定(増減・改名は契約テストの更新を伴う) | `test/contract/tool-surface.test.ts` | `test/contract/tool-surface.test.ts` の `EXPECTED_TOOLS`、`src/registry.ts` の `MANAGED_TOOLS` |
| 既定でセッション開始時に有効なのは `exa_search` / `exa_contents` / `exa_answer` / `exa_help` の4つだけ | `test/contract/tool-surface.test.ts` + `test/integration/extension.test.ts` | `test/contract/tool-surface.test.ts` の `ALWAYS_ON`、`src/index.ts` の `applyStartupGroups` |
| 常時有効な4ツールの定義(説明+スキーマ)の合計が **1800 トークン**以内(4文字=1トークン換算) | `test/contract/tool-surface.test.ts` | `test/contract/tool-surface.test.ts` の `TOKEN_BUDGET`(計測値はコメント) |
| 全ツールが label・description・object schema を持つ | `test/contract/tool-surface.test.ts` | `src/tools/*.ts` |
| ツール群を active にするのは設定の `groups`・`exa_help`・`/exa enable` だけ | `test/integration/extension.test.ts` + `test/integration/tools-misc.test.ts` | `src/index.ts` の `activate` / `applyStartupGroups` |

### 依存関係・import

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 実行時依存を持たない(`dependencies` は空) | `test/contract/dependencies.test.ts` | `package.json` |
| `src` の import は node builtin(`node:fs` / `node:os` / `node:path`)・相対 `.ts`・Pi 提供パッケージ・`typebox` のみ | `test/contract/dependencies.test.ts` | `test/contract/dependencies.test.ts` の `ALLOWED_EXTERNAL` |
| 循環依存を作らない | `npx biome check .` | `biome.jsonc` の `noImportCycles` |
| 未宣言の依存を import しない(import 元パッケージの `package.json` へ先に宣言する) | `npx biome check .` | `biome.jsonc` の `noUndeclaredDependencies` |
| 未使用の export・依存・ファイルを検出しない | `npm run knip` | `knip.jsonc` |
| devDependency は allowlist 内のみ | `test/contract/dependencies.test.ts` | `test/contract/dependencies.test.ts` の `DEV_TOOLS` |

### 設定・出力

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| リクエストボディは設定の `defaults` → ツール引数 → `options` の順に重なる | `test/unit/body.test.ts` | `src/body.ts` の `buildBody` |
| 設定はグローバル→プロジェクトの順にマージする | `test/unit/config.test.ts` | `src/config.ts` の `loadConfigs` |
| API キーは `apiKeyEnv` → `EXA_API_KEY` → 設定の順で解決する | `test/unit/config.test.ts` | `src/config.ts` の `resolveApiKey` |
| 数値設定が不正(非数・下限未満)なら警告を出し、既定値に戻す | `test/unit/config.test.ts` | `src/config.ts` の `positiveInt` |
| モデルへの出力は `output` の上限(`maxResults` / `maxTotalChars` / `maxCharsPerResult`)に従う | `test/unit/format.test.ts` | `src/format.ts` |
| `/exa config` は API キーをマスクする | `test/integration/extension.test.ts` | `src/index.ts` の `maskKey` |

### リファレンス

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 全エンドポイントが `exa_help` のトピックから到達でき、未知のパスは候補付きで拒否される | `test/unit/reference.test.ts` + `test/integration/tools-misc.test.ts` | `src/reference.ts` |

### コード品質

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| `enum` / `namespace` / parameter properties を使わない | `npx tsc --noEmit` | `tsconfig.json` の `erasableSyntaxOnly` |
| 型は `any` なし、非null断言なし、浮いた Promise なし | `npx biome check .` | `biome.jsonc` の `suspicious` / `nursery` |
| `console` を使わない | `npx biome check .` | `biome.jsonc` |
| 認知複雑度は 12 以下 | `npx biome check .` | `biome.jsonc` の `noExcessiveCognitiveComplexity` |
| 相対 import は `.ts` 拡張子付き、パスエイリアスなし | `npx tsc --noEmit` + Node 実行 | `tsconfig.json` |

### 配布・ビルド

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 配布物は `src/` と `package.json` / `README.md` のみ | `test/ci/tarball.test.ts` | `package.json` の `files` |
| ビルド工程を持たない(TS を直接配布) | `test/ci/tarball.test.ts` | `package.json`(`build` script なし、`pi.extensions` が `./src/index.ts`) |

## 変更時の手順

- ツールを増やす・引数を増やす場合は、`src/registry.ts`(`GROUPS` / `MANAGED_TOOLS` / `TOOL_SIGNATURES`)と `test/contract/tool-surface.test.ts` の `EXPECTED_TOOLS` を更新する。
  常時有効にする場合は `ALWAYS_ON` を更新する。
  `TOKEN_BUDGET` は「上げるもの」ではなく「交渉するもの」として扱い、再導出は PHILOSOPHY.md の判断手順に立ち返る。
  上げる場合は計測値をテストのコメントに更新し、コミットメッセージに理由を残す。
- エンドポイントやトピックを足す場合は `src/reference.ts` の索引も更新する。
  「全エンドポイントがトピックから到達可能」を `test/unit/reference.test.ts` が検査する。
- 依存を追加する場合は devDependency のみ可能。`DEV_TOOLS` の更新とコミットメッセージの理由をセットで行う。
  実行時依存(`dependencies`)の追加は不可。
- 決定の記録は `docs/adr/` に置く(1決定 = 1ファイル、`NNNN-<topic>.md`)。追加するのは、
  却下した代替を再提案されうる決定、機能や振る舞いを削除・置き換える決定、DESIGN.md / PHILOSOPHY.md に触れる決定のときだけ。
  却下案は結果ではなく理由を書く。
- ツール・コマンド・設定・公開の振る舞いを変える前に、`docs/adr/` の ADR から変更する領域に関係するものをファイル名と見出しで選んで読み、却下済みの代替を再提案しない。
  決定が変わったら同じコミットで状態を更新する(採用 → 廃止)。
- カバレッジの数値は契約テストの影響を受けます。契約テストは jiti 経由で `src` をもう一度ロードするため、
  同じファイルが2実体として数えられます。
- ドキュメントの段落内の改行は、文末(。！？)・読点(、)・コロン(:)の直後に置く。

## 手動確認

自動検証の対象外の確認は [docs/manual-checks.md](docs/manual-checks.md) に書きます。
