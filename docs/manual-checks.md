# 手動確認 — pi-exa

自動検証の対象外の確認項目と手順です。

## 手動確認項目

HTTP はすべてモックでテストしているため、実際の Exa API との接続はここで確認します。

前提: 実 `EXA_API_KEY` を用意します。

1. `exa_search` / `exa_contents` / `exa_answer` / `exa_similar` が結果を返し、`includeCost` のコストが表示されること。
2. `exa_help` でグループを有効化し、以後そのツールが呼べること。有効化前はシステムプロンプトとツール一覧に現れないこと。
3. `exa_request` で公式ドキュメントに載っているパスを呼べること。未知のパスが近い候補付きで拒否されること。
4. `deep` 系モード・`outputSchema`・subpages が実 API で動くこと。
5. agent / websets / batch の `wait` ポーリングが実タスクで終端に達すること。timeout 時に再開のヒントが出ること。
6. TUI で `/exa status` / `config` / `enable` / `init` が動き、`/exa config` が API キーをマスクすること。
7. 設定ファイル（`~/.pi/agent/exa.json`、信頼プロジェクトの `.pi/exa.json`）が探索・マージされ、壊れた値は警告になること。

## ツール面の手動レビュー

トークン予算は契約テストが守ります。「そのコストが機能と実使用に見合うか」は自動化できないため、ツール面（説明・スキーマ・引数）を変えたときと定期的に次を行います。

1. 計測: 常時有効な4ツールの `name + description + JSON.stringify(parameters)` を、`test/contract/tool-surface.test.ts` の `tokensOf` と同じ式（4文字=1トークン）でツール別・引数別に集計します。
2. 実使用: `~/.pi/agent/sessions/**/*.jsonl` と `~/.pi/agent/spawn-sessions/*.jsonl` を JSONL として読み、`role: "assistant"` の `content[].type == "toolCall"` を集計します。ツール別の呼び出し回数、引数の使用率、`role: "toolResult"` のエラー（`details.error` か `Validation failed for tool`）を出します。
   - 開発セッションの意図的な境界値・不正値テストは誤用に数えず、通常利用と分けます。
   - 文字列 grep で `"name":"exa_search"` を数えると、システムプロンプトの `toolsAdded` を拾って過大になります。必ず toolCall パートをパースします。
3. 判定: トークン占有率と使用率を突き合わせます。
   - 余剰候補: トークンが大きく使用率が低い引数。削る場合は、`exa_help` 経由の迂回と往復コストを比較します。
   - 不足: 誤用エラー、または同じ目的で `exa_request` へ逃げている形跡。
   - 非アクティブ群は、呼び出しが無ければ常時有効にしません。
4. 記録: 計測値は契約テストのコメントに反映します（[変更時の手順](../AGENTS.md)と同じ）。
