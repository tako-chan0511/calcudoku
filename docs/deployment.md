# GitHub・Vercel公開手順

## 構成

- GitHub: https://github.com/tako-chan0511/calcudoku
- 本番ブランチ: `main`。force pushは使用しない。
- Node.js: 22系、22.22.2以上。`.nvmrc`と`package.json`のenginesに従う。
- Vercel: Vite、プロジェクトルート`.`、Build Command `npm run build`、Output Directory `dist`。
- バックエンド、APIキー、環境変数は不要。
- GitHubとVercelを連携し、mainへのpushをProductionに反映する。

## 公開前・CI

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

GitHub ActionsのCIでもNode 22で上記検証を実行する。npm 10/11で同じロックを使用できるよう、globのoverrideはバージョン条件を付けず、既存の14系修正版へ統一している。条件付きoverrideではnpm 10の`npm ci`がglob 13系の不足と判定したため、採用バージョンを変えずに指定形式だけを修正した。`build`も型チェックを含む。
`node_modules`、`dist`、`.env*`、`.vercel`、ログ、キャッシュはコミットしない。個別の認証情報をソースやCI変数へ追加する必要はない。

## 本番確認

- 新しいブラウザ状態で5×5・normal・四則演算・生成器v3が既定であること。
- `dist/assets/puzzle.worker-*.js`が本番URLからロードでき、生成・大盤面復元が動くこと。
- 数字入力、クリア、Undo/Redo、候補・答え、ベスト記録、再読み込み復元。
- サイズ3〜9、各難易度、演算制限、シード指定と再現。
- キャンセル・失敗で現在問題と入力が保持されること。
- PCと320px/390px幅でページ全体の横はみ出しやコンソールエラーがないこと。
- v1/v2は同じ版・設定・シードで再現し、旧保存を最新へ変換しないこと。

9×9・除算のみ・hardは生成成功が未確認で、動作保証対象外。別設定を提案し、指定と異なる難易度や未確認問題を採用しない。成功を保証する表示をしない。

## ローカル保存

記録と途中状態は同じブラウザ・同じオリジンのlocalStorageにのみ保存する。localhost・プレビュードメイン・本番ドメイン間では共有されない。ログインやサーバー同期はない。

Game Hubへの登録、toppageや他プロジェクトの変更は、この単独公開には含めない。
