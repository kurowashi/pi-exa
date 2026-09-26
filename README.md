# pi-exa

Exa API を Pi から使うための拡張です。Exa の全エンドポイントをカバーしつつ、常時コンテキストに載るツールは最小限に抑えています。

- **厳選したコアツール**（`exa_search` / `exa_contents` / `exa_answer` / `exa_help`）だけがセッション開始時に有効
- **詳細オプションや追加 API は `exa_help` で要求したときだけ開示**（同時にそのツール群が有効化される）
- **デフォルト値はすべてコンフィグで設定可能**（検索タイプ、件数、content モード、出力上限、待機設定など）
- **全エンドポイントに到達可能**（型付きツール + 任意パスを叩ける `exa_request`）

## インストール

```bash
pi install /path/to/pi-exa
```

または `pi --extension /path/to/pi-exa/src/index.ts` で直接読み込みます。

## 設定

設定ファイル（後のものが優先）:

| ファイル | 対象 |
|---|---|
| `~/.pi/agent/exa.json` | ユーザー全体（`PI_CODING_AGENT_DIR` で変更可） |
| `<cwd>/.pi/exa.json` | プロジェクト（信頼されたプロジェクトのみ） |

API キーは環境変数 `apiKeyEnv`（既定 `EXA_API_KEY`）→ `EXA_API_KEY` → 設定ファイルの `apiKey` の順で解決します。

```json
{
  "apiKeyEnv": "EXA_API_KEY",
  "baseUrl": "https://api.exa.ai",
  "timeoutMs": 60000,
  "groups": ["core"],
  "defaults": {
    "search": { "type": "auto", "numResults": 8, "contents": { "highlights": true } },
    "contents": { "text": { "maxCharacters": 12000 } },
    "answer": { "model": "exa" },
    "similar": { "numResults": 8, "contents": { "highlights": true } },
    "agentRun": { "effort": "medium" },
    "websetSearch": { "behavior": "override" },
    "batchRequest": {}
  },
  "wait": {
    "agent": { "enabled": true, "timeoutMs": 600000, "pollIntervalMs": 2000 },
    "webset": { "enabled": true, "timeoutMs": 300000, "pollIntervalMs": 3000 },
    "batch": { "enabled": true, "timeoutMs": 600000, "pollIntervalMs": 3000 }
  },
  "output": {
    "maxResults": 10,
    "maxCharsPerResult": 4000,
    "maxTotalChars": 24000,
    "includeCost": true
  }
}
```

- `defaults.<操作>` はその操作のリクエストボディに毎回マージされます。**ツール呼び出しの引数が常に優先**されます。
- `output` はモデルに返す量の上限です。全文はツール結果の `details` に保持されます。
- `groups` に `"all"` を指定すると全ツールを最初から有効にします（コンテキスト消費は増えます）。

`/exa init` でサンプル設定を書き出せます。コマンド:

```
/exa status            現在の設定と有効ツール
/exa config            解決済み設定（API キーはマスク）
/exa enable <group>    ツール群を有効化（all も可）
/exa init [force]      サンプル設定を書き出す
```

## ツール

### 常時有効（core）

| ツール | エンドポイント | 用途 |
|---|---|---|
| `exa_search` | `POST /search` | Web 検索。highlights（既定）/ text / summary、フィルタ、deep 系モード |
| `exa_contents` | `POST /contents` | 既知 URL からの本文抽出・要約・サブページ取得 |
| `exa_answer` | `POST /answer` | 引用付きの回答を 1 つ生成 |
| `exa_help` | — | トピックの詳細リファレンスを返し、必要なツール群を有効化 |

### オンデマンド（`exa_help(<topic>)` または `/exa enable`）

| トピック | グループ | ツール | 対象 API |
|---|---|---|---|
| `similar` | similar | `exa_similar` | `POST /findSimilar` |
| `agent` | agent | `exa_agent_run` / `exa_agent_get` / `exa_agent_control` | `/agent/runs`（作成・取得・一覧・cancel・stop・events・delete） |
| `monitors` | monitors | `exa_monitor` | `/monitors`（作成・一覧・更新・削除・trigger・runs・batch） |
| `websets` | websets | `exa_websets` | `/websets/v0`（websets・items・searches・enrichments・imports・v0 monitors） |
| `webhooks` | webhooks | `exa_webhooks` | `/websets/v0/webhooks`・`/events` |
| `batches` | batches | `exa_batch` | `/batches`（Beta ヘッダは自動付与） |
| `raw` | raw | `exa_request` | 任意の documented エンドポイント |
| `search` / `contents` / `answer` | core | 上記コア | 詳細パラメータの全リスト |
| `research` | raw | （`exa_request` で実行） | 非推奨の `/research/v0/tasks` |
| `teams` | raw | （`exa_request` で実行） | `/websets/v0/teams/me` |
| `overview` / `config` / `all` | — | — | 全体像・設定リファレンス |

### フルカバレッジ

`exa_request({ method, path, body?, query?, beta? })` が任意の documented エンドポイントを叩けます。パスは索引と照合し、未知のパスは近い候補を返して拒否します。

例:

```js
exa_request({ method: "GET",  path: "/agent/runs", query: { limit: 5 } })
exa_request({ method: "GET",  path: "/websets/v0/teams/me" })
exa_request({ method: "POST", path: "/websets/v0/websets/webset_abc/cancel" })
```

## 詳細オプションの開示

コアツールのスキーマには日常的に使う引数だけを載せ、それ以外は `options` オブジェクトとして受け取ります。`options` の中身は `exa_help` を呼ぶまでモデルには見えません。

```js
exa_help({ topic: "search" })   // → /search の全パラメータ + 用例を返す
exa_search({ query: "...", options: {
  additionalQueries: ["..."],
  outputSchema: { type: "object", properties: { ... } },
  systemPrompt: "Prefer official sources",
  contents: { text: { maxCharacters: 20000 }, maxAgeHours: 0 }
} })
```

未使用のツールは登録されていても inactive なので、システムプロンプトとツール一覧を圧迫しません。

## 開発

```bash
npm install          # 依存(すべて devDependency。実行時依存はゼロ)
npm run verify       # 完了条件: biome + tsc + 全テスト + カバレッジ閾値
npm test             # 全テスト
```

`npm run verify` の内訳は `package.json` にある。契約テストは `test/contract/`(登録ツール面・
always-on トークン予算・import 境界)と `test/ci/`(npm pack の内容)にあり、`src` を Pi の
ローダー経由で読み込んで検証する。カバレッジ閾値は `test/unit/` と `test/integration/` の
実行で計測する。

ローカルの git フックは [lefthook](lefthook.yml) が管理する。フックは利便性のためのもので、
完了条件は常に `npm run verify` が通ること(CI も同じコマンドを Node 22.19 / 24 で実行する)。

- `src/config.ts` — 設定の探索・マージ
- `src/client.ts` — HTTP クライアント
- `src/format.ts` — モデル向け整形と出力上限
- `src/reference.ts` — `exa_help` のトピック群（全エンドポイント索引）
- `src/registry.ts` — ツール名・グループ
- `src/tools/*.ts` — ツール実装
