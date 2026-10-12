# pi-exa

Exa API を Pi から使うための拡張です。Exa の公開 API のエンドポイントを呼べます。

Exa には検索・本文抽出・回答・Agent・Websets・Batch など多くのエンドポイントがあります。すべてを Pi のツールとして常時登録すると、使わない引数の説明までが毎回のプロンプトを圧迫します。pi-exa は常時有効にするツールを 4 つに絞り、残りは必要になったときだけ開示します。

| 層 | ツール | 有効になるタイミング |
|---|---|---|
| 常時 | `exa_search` / `exa_contents` / `exa_answer` / `exa_help` | セッション開始時 |
| オンデマンド | `exa_similar` / `exa_agent_*` / `exa_monitor` / `exa_websets` / `exa_webhooks` / `exa_batch` / `exa_request` | `exa_help` でトピックを指定したとき、または設定・`/exa enable` で有効にしたとき |
| 任意のエンドポイント | `exa_request` | `raw` グループを有効にしたとき |

## 使い方

`EXA_API_KEY` を設定して Pi を起動します。

```bash
export EXA_API_KEY=...
pi
```

モデルは Web の調査が必要になると `exa_search` を呼びます。ユーザーが URL を渡せば `exa_contents` で本文を読みます。

高度な引数や別のエンドポイントが必要になると、モデルは `exa_help` でトピックを指定して詳細を読み、必要なツールを有効にします。

## インストール

要件は次のとおりです。

- Node.js 22.19 以上（`package.json` の `engines`）
- Pi（開発時の検証は 0.87.1）

```bash
pi install git:github.com/kurowashi/pi-exa
```

ref を固定する場合は `pi install git:github.com/kurowashi/pi-exa@<tag|commit>` を使います。

ローカルの作業コピーを使う場合は次のとおりです。

```bash
pi install /path/to/pi-exa
```

インストールせずに読み込む場合は次のとおりです。

```bash
pi --extension /path/to/pi-exa/src/index.ts
```

## 設定

設定ファイルは次の 2 つです。後のファイルが前のファイルを上書きします。

| ファイル | 対象 | 読み込み |
|---|---|---|
| `~/.pi/agent/exa.json`（`PI_CODING_AGENT_DIR` で場所を変更） | ユーザー全体 | 常に読み込む |
| `<cwd>/.pi/exa.json` | プロジェクト | プロジェクトが信頼されているときだけ読み込む |

API キーは次の順で探します。

1. 設定の `apiKeyEnv` で指定した環境変数（既定は `EXA_API_KEY`）
2. 環境変数 `EXA_API_KEY`
3. 設定ファイルの `apiKey`（プロジェクト、ユーザーの順）

`baseUrl` は環境変数 `EXA_BASE_URL` があればそれを使います。

```json
{
  "apiKeyEnv": "EXA_API_KEY",
  "baseUrl": "https://api.exa.ai",
  "timeoutSeconds": 60,
  "groups": ["core"],
  "defaults": {
    "search": { "type": "auto", "numResults": 8, "contents": { "highlights": true } },
    "contents": { "text": { "maxCharacters": 12000 } },
    "answer": { "model": "exa" },
    "agentRun": { "effort": "medium" }
  },
  "wait": {
    "agent": { "enabled": true, "timeoutSeconds": 600, "pollIntervalSeconds": 2 }
  },
  "output": {
    "maxResults": 10,
    "maxCharsPerResult": 4000,
    "maxTotalChars": 24000,
    "includeCost": true
  }
}
```

主なキーは次のとおりです。

| キー | 既定 | 意味 |
|---|---|---|
| `apiKey` | なし | API キーを直接書く。環境変数がある場合は環境変数が優先される |
| `apiKeyEnv` | `"EXA_API_KEY"` | API キーを読む環境変数の名前 |
| `baseUrl` | `"https://api.exa.ai"` | API の接続先 |
| `timeoutSeconds` | `60` | リクエストごとのタイムアウト（秒） |
| `groups` | `["core"]` | 起動時に有効にするツール群。`"all"` を指定すると全部有効にする |
| `headers` | なし | すべてのリクエストに付ける HTTP ヘッダ |
| `defaults.<操作>` | なし | 操作ごとのリクエストボディの既定値。ツールの引数が優先される |
| `wait.<agent\|webset\|batch>` | 有効、600 秒、2 秒 | 非同期処理の完了を待つ設定（有効化、最大待ち時間、ポーリング間隔） |
| `output` | 下の値 | モデルに返す量の上限（後述） |

`output` の既定値は次のとおりです。

- `maxResults`: 10
- `maxCharsPerResult`: 4000
- `maxTotalChars`: 24000
- `includeCost`: true

`defaults.<操作>` は操作ごとに `search` / `contents` / `answer` / `similar` / `agentRun` / `websetSearch` / `batchRequest` があります。どの操作も既定値は空で、Exa API の既定値に従います。

設定の扱いは次のとおりです。

- 同じキーは後のファイルが上書きします。`defaults` と `headers` はキーごとにマージし、`groups` は配列ごと置き換えます。
- `groups` に未知の名前があると警告を出し、その名前を無視します。有効な名前がなければ `["core"]` を使います。
- `groups` に `"all"` と書けるのは文字列として書いたときだけです。
- `timeoutSeconds`、`output`、`wait` の数値が下限未満・数値以外のときは、警告を出して既定値に戻します。下限は `maxResults` が 1、`maxCharsPerResult` が 200、`maxTotalChars` が 1000、`timeoutSeconds` と `wait` の秒数が 1 です。
- JSON が壊れているか、オブジェクトでないファイルは警告して読みません。
- 信頼されていないプロジェクトの `exa.json` は読みません。警告を出します。
- API キーが見つからないときは警告を出します。API を呼ぶツールは、呼び出し時にエラーを返します。
- 設定は次のタイミングで読み込まれます。
  - セッション開始時（起動、`/reload`、新規、再開、フォーク）
  - `/exa` コマンドを実行したとき
- `groups` は起動時と `/reload` で適用されます。適用後に `/exa enable` や `exa_help` で有効にしたツールは、セッション中そのまま残ります。

`/exa init` は `~/.pi/agent/exa.json` にサンプル設定を書き出します。既存のファイルは `/exa init force` で上書きします。

## 仕組み

### 常時有効のツール

| ツール | エンドポイント | 用途 |
|---|---|---|
| `exa_search` | `POST /search` | Web 検索。既定では各結果の抜粋（highlights）を返す。`text` / `summary` / `none` も指定できる |
| `exa_contents` | `POST /contents` | 既知の URL から本文・要約・抜粋を取り出す。サブページやリンクもオプションで取得できる |
| `exa_answer` | `POST /answer` | 引用付きの回答を 1 つ返す |
| `exa_help` | なし | トピックの詳細なパラメータ一覧を返し、そのトピックのツールを有効にする |

`exa_search` の `content` と `exa_contents` の `content` で本文の形式を指定しなかった場合は、設定の `defaults` の値を使います。どちらも設定がなければ、`exa_search` は抜粋、`exa_contents` は本文を返します。

### オンデマンドのツール

`exa_help` に次のトピックを指定すると、トピックの詳細が返り、対応するツールが有効になります。

| トピック | 有効になるツール | 対象 |
|---|---|---|
| `search` / `contents` / `answer` | 常時有効のツール | 各ツールの詳細パラメータ |
| `similar` | `exa_similar` | `POST /findSimilar` |
| `agent` | `exa_agent_run` / `exa_agent_get` / `exa_agent_control` | `/agent/runs` |
| `monitors` | `exa_monitor` | `/monitors` |
| `websets` | `exa_websets` | `/websets/v0/websets` とその配下 |
| `webhooks` | `exa_webhooks` | `/websets/v0/webhooks` とイベント |
| `batches` | `exa_batch` | `/batches` |
| `raw` | `exa_request` | 索引にある任意のエンドポイント |
| `research` | `exa_request` | 非推奨の `/research/v0/tasks` |
| `teams` | `exa_request` | `/websets/v0/teams/me` |
| `all` | 全グループ | トピックの一覧と、全グループの有効化 |
| `overview` / `config` | なし | 全体像、設定の説明 |

`exa_help` の `activate` 引数を使うと、トピックを読まずにグループを有効にできます。

### 既定値の重なり順

リクエストボディは次の順に重ねます。後のものが優先されます。

1. 設定の `defaults.<操作>`
2. ツールの引数（`query` や `numResults` など）
3. ツールの `options` 引数

`options` は引数の一覧にない詳細パラメータを渡すための箱です。`options` の中身は `exa_help` のトピックで確認できます。

### 出力の量

ツールがモデルに返す本文は、`output` の上限に収まるように切り詰めます。

- 結果の件数は `maxResults` まで。
- 1 件の本文は `maxCharsPerResult` まで。切り詰めた箇所には `…[truncated N chars]` と注記する。
- 全体は `maxTotalChars` まで。収まらない結果は省略し、省略した件数を注記する。
- `includeCost` が `true` で、応答にコストがあれば、コストを表示する。

応答の全体は、モデルに返す本文とは別にツールの結果の `details` に保持します。応答の JSON が 80,000 文字を超えるときは、`details` に要約だけを保持します。

### 非同期処理の待ち

Agent の実行、Websets、Batch は、完了まで時間がかかります。既定では完了まで待ちます。

- 待ち時間の上限とポーリング間隔は `wait` で決まります。
- 上限に達したときは、途中の状態を返し、続きを取得する方法を注記します。
- 待たずに戻すには、`exa_agent_run` などの `wait` 引数に `false` を指定します。その後は `exa_agent_get` などで状態を確認します。

### 送信の扱い

- リクエストは JSON で送ります。ストリーミングには対応していません。`stream: true` は無視し、注記を付けます。
- `exa_batch` は Batch API に必要な `Exa-Beta` ヘッダを自動で付けます。
- `exa_request` は、パスを索引と照合してから送ります。索引にないパスは、近いパスの候補を返して拒否します。
- リクエストは `timeoutSeconds` を超えるとタイムアウトします。

## コマンド

| コマンド | 動作 |
|---|---|
| `/exa status`（`/exa help` も同じ） | 設定ファイル、API キーの有無と取得元、起動時のグループ、有効な Exa ツールを表示する |
| `/exa config` | 解決済みの設定を表示する。API キーは先頭 4 文字と末尾 4 文字を残してマスクする（8 文字以下は `***`） |
| `/exa enable <group...>` | 指定したグループのツールを有効にする。`all` で全グループ |
| `/exa init [force]` | `~/.pi/agent/exa.json` にサンプル設定を書き出す。`force` がないときは既存のファイルを上書きしない |

グループ名は `core` / `similar` / `agent` / `monitors` / `websets` / `webhooks` / `batches` / `raw` です。

## 制限

- Exa の API キーが必要です。キーがないと、API を呼ぶツールはエラーを返します。
- 索引はトピックと `exa_request` が受け付けるパスを決めています。索引は Exa の公開仕様を元にしています。仕様に新しいエンドポイントが増えると、pi-exa を更新するまで `exa_request` で呼べません。
- `research` トピックのエンドポイントは、Exa のドキュメントで legacy / deprecated と記載されています。新しい用途では使わず、Deep 検索や Agent の利用を検討してください。
- Agent の実行、deep 系の検索、Batch は通常の検索より課金が大きくなります。`includeCost` を有効にすると、応答に含まれるコストを確認できます。
- ストリーミングには対応していません。
