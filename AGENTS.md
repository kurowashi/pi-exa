# AGENTS.md — pi-exa で作業するエージェント向けの指示

読者は pi-exa を変更する AI エージェントと開発者です。利用者向けの仕様は README に、
設計の判断基準は DESIGN.md と PHILOSOPHY.md(このプラグイン群共通)に書きます。

ここには、壊してはいけない制約と、制約に触れる変更の手順だけを書きます。制約の正はテストで、
下表はその索引です。実装と表が食い違った場合はテストが正です。検証手段を併記できないものは
制約として書かず、自動テストできない範囲は末尾に分けます。

## 完了条件

`npm run verify`(= `npm run check` + `npm test` + `npm run test:coverage`)が通ること。
フックが通っても CI が通らなければ未完了。下表の「検証」列は個別の検証箇所であり、
自動検証はすべて `verify` に含まれます。

## 制約

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 登録ツールは `EXPECTED_TOOLS` の13個で固定(増減・改名は契約テストの更新を伴う) | `test/contract/tool-surface.test.ts` | 同ファイルの `EXPECTED_TOOLS`、`src/registry.ts` の `MANAGED_TOOLS` |
| 既定でセッション開始時に有効なのは `exa_search` / `exa_contents` / `exa_answer` / `exa_help` の4つだけ | `test/contract/tool-surface.test.ts` + `test/integration/extension.test.ts` | 同ファイルの `ALWAYS_ON`、`src/index.ts` の `applyStartupGroups` |
| 常時有効な4ツールの定義(説明+スキーマ)の合計が **1800 トークン**以内(4文字=1トークン換算) | `test/contract/tool-surface.test.ts` | 同ファイルの `TOKEN_BUDGET`(計測値はコメント) |
| 全ツールが label・description・object schema を持つ | `test/contract/tool-surface.test.ts` | `src/tools/*.ts` |
| ツール群を active にするのは設定の `groups`・`exa_help`・`/exa enable` だけ | `test/integration/extension.test.ts` + `test/integration/tools-misc.test.ts` | `src/index.ts` の `activate` / `applyStartupGroups` |
| 実行時依存を持たない(`dependencies` は空) | `test/contract/dependencies.test.ts` | `package.json` |
| `src` の import は node builtin(`node:fs` / `node:os` / `node:path`)・相対 `.ts`・Pi 提供パッケージ・`typebox` のみ | `test/contract/dependencies.test.ts` | 同ファイルの `ALLOWED_EXTERNAL` |
| devDependency は allowlist 内のみ | `test/contract/dependencies.test.ts` | 同ファイルの `DEV_TOOLS` |
| 配布物は `src/` と `package.json` / `README.md` のみ | `test/ci/tarball.test.ts` | `package.json` の `files` |
| リクエストボディは設定の `defaults` → ツール引数 → `options` の順に重なる | `test/unit/body.test.ts` | `src/body.ts` の `buildBody` |
| 設定はグローバル→プロジェクトの順にマージし、API キーは `apiKeyEnv` → `EXA_API_KEY` → 設定の順で解決する | `test/unit/config.test.ts` | `src/config.ts` の `loadConfigs` / `resolveApiKey` |
| モデルへの出力は `output` の上限(`maxResults` / `maxTotalChars` / `maxCharsPerResult`)に従う | `test/unit/format.test.ts` | `src/format.ts` |
| 全エンドポイントが `exa_help` のトピックから到達でき、未知のパスは候補付きで拒否される | `test/unit/reference.test.ts` + `test/integration/tools-misc.test.ts` | `src/reference.ts` |
| `/exa config` は API キーをマスクする | `test/integration/extension.test.ts` | `src/index.ts` の `maskKey` |
| `enum` / `namespace` / parameter properties を使わない | `npx tsc --noEmit` | `tsconfig.json` の `erasableSyntaxOnly` |
| 型は `any` なし、非null断言なし、浮いた Promise なし | `npx biome check .` | `biome.jsonc` の `suspicious` / `nursery` |
| `console` を使わない | `npx biome check .` | `biome.jsonc` |
| 認知複雑度は 12 以下 | `npx biome check .` | `biome.jsonc` の `noExcessiveCognitiveComplexity` |
| 相対 import は `.ts` 拡張子付き、パスエイリアスなし | `npx tsc --noEmit` + Node 実行 | `tsconfig.json` |
| ビルド工程を持たない(TS を直接配布) | `test/ci/tarball.test.ts` | `package.json`(`build` script なし、`pi.extensions` が `./src/index.ts`) |

## 変更時の手順

- ツールを増やす・引数を増やす場合は、`src/registry.ts`(`GROUPS` / `MANAGED_TOOLS` / `TOOL_SIGNATURES`)と
  `test/contract/tool-surface.test.ts` の `EXPECTED_TOOLS` を更新する。常時有効にする場合は `ALWAYS_ON` を
  更新する。`TOKEN_BUDGET` は「上げるもの」ではなく「交渉するもの」として扱い、上げる場合は計測値を
  テストのコメントに更新し、コミットメッセージに理由を残す。
- エンドポイントやトピックを足す場合は `src/reference.ts` の索引も更新する。「全エンドポイントが
  トピックから到達可能」を `test/unit/reference.test.ts` が検査する。
- 依存を追加する場合は devDependency のみ可能。`DEV_TOOLS` の更新とコミットメッセージの理由を
  セットで行う。実行時依存(`dependencies`)の追加は不可。
- カバレッジは `test/unit` と `test/integration` で計測する(`package.json` の `test:coverage`)。
  契約テストは jiti 経由で `src` をもう一度ロードするため、同じファイルが2実体として数えられる。

## 手動スモークテスト(自動検証の対象外)

HTTP はすべてモックでテストしているため、実際の Exa API との接続はここで確認する:

1. 実 `EXA_API_KEY` で `exa_search` / `exa_contents` / `exa_answer` / `exa_similar` が結果を返し、
   `includeCost` のコストが表示されること。
2. `exa_help` でグループを有効化し、以後そのツールが呼べること。有効化前はシステムプロンプトと
   ツール一覧に現れないこと。
3. `exa_request` で documented なパスを叩けること。未知のパスが近い候補付きで拒否されること。
4. `deep` 系モード・`outputSchema`・subpages が実 API で動くこと。
5. agent / websets / batch の `wait` ポーリングが実タスクで終端に達し、timeout 時に再開のヒントが
   出ること。
6. TUI で `/exa status` / `config` / `enable` / `init` が動き、`/exa config` が API キーをマスクすること。
7. 設定ファイル(`~/.pi/agent/exa.json`、信頼プロジェクトの `.pi/exa.json`)が探索・マージされ、
   壊れた値は警告になること。

## 手動レビュー(自動検証の対象外): ツール面の必要十分性

トークン予算は契約テストが守るが、「そのコストが機能と実使用に見合うか」は自動化できない。
ツール面(説明・スキーマ・引数)を変えた時と、定期的に確認する:

1. 計測: 常時有効な4ツールの `name + description + JSON.stringify(parameters)` を
   `test/contract/tool-surface.test.ts` の `tokensOf` と同じ式(4文字=1トークン)で
   ツール別・引数別に集計する。
2. 実使用: `~/.pi/agent/sessions/**/*.jsonl` と `~/.pi/agent/spawn-sessions/*.jsonl` を JSONL と
   して読み、`role: "assistant"` の `content[].type == "toolCall"` を集計する。ツール別の
   呼び出し回数、引数の使用率、`role: "toolResult"` のエラー(`details.error` か
   `Validation failed for tool`)を出す。
   - 開発セッションの意図的な境界値・不正値テストは誤用と数えず、通常利用と分ける。
   - 文字列 grep で `"name":"exa_search"` を数えると、システムプロンプトの `toolsAdded` を
     拾って過大になる。必ず toolCall パートをパースする。
3. 判定: トークン占有率と使用率を突き合わせる。
   - 余剰候補: トークンが大きく使用率が低い引数。削る場合は `exa_help` 経由の迂回と往復コストを
     比較する。
   - 不足: 誤用エラー、または同じ目的で `exa_request` へ逃げている形跡。
   - 非アクティブ群は呼び出しが無ければ常時有効にしない。
4. 記録: 計測値は契約テストのコメントに反映する(変更時の手順と同じ)。
