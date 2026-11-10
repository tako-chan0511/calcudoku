# STEP 4 実装・検証結果

設定は3×3〜9×9、easy/normal/hard、演算子15通り、32ビット整数シードに対応。編集だけでは現在の問題を変更せず、生成・一意性・指定難易度の確認成功後だけ切り替えます。失敗・キャンセルでは入力・時間・履歴を保持します。

## 検証

- Vitest: 17ファイル、371件成功（既存173件を維持、追加198件）。
- TypeScript strict / ESLint / Vite本番ビルド: 成功。依存関係の追加なし。
- v1の固定シード契約と旧保存を維持し、v2も固定シードIDを契約テストで保持。
- 全サイズの入力・移動・固定セル・クリア・再挑戦・描画、演算子15通り、一意性、難易度、設定分離、キャンセル、古い応答、保存互換性を検証。

## ブラウザ

- PC Chromium: 9×9 normalと3×3 hard（シード17）をクリア。異なる設定のベスト記録分離、適用済みシードのコピー、ランダムシード、無効入力を確認。
- 約1秒以上かかる9×9の加算のみnormalで、82フレームの描画が継続し、最大フレーム間隔は約16.8ms。失敗後も元の問題へ入力でき、キャンセルも確認。
- タッチ対応のスマートフォン相当環境: 9×9 easyを数字パッドでクリア。Undo/Redo、候補・答え、保存復元、再挑戦を確認。
- 幅390pxで盤面内部のスクロール幅516px/表示領域324px。幅320pxでもページ全体に横はみ出しなし。数字ボタンの最小高さ44px、幅約44.39px。
- 6以上の復元はWorkerで再検証後に公開。本番ビルドのローカルプレビューでも9×9、設定分離、ヒント・Undo・復元を確認。ブラウザエラー0件。実機スマートフォンの性能保証ではありません。

## 生成性能と残る制限

- Node v22.23.4。全演算の各サイズ×難易度50シード＝1,050件と、9×9の演算子15通り×難易度×5シード＝225件、合計1,275件。成功1,177件はすべて一意性・難易度を再検証。
- 全演算の5×5〜9×9は全難易度50/50。3×3 hardは2/50、4×4 hardは44/50。指定難易度を下げて採用しません。3×3 hardの再現例はシード17・38。
- 全演算9×9: easy中央値3.960ms、normal42.308ms、hard18.920ms。最大はnormal346.951ms。Worker起動と再検証時間を含みません。
- 演算制限: 9×9加算のみnormalは1/5、加減除normalは0/5、除算のみは各難易度0/5。この生成方式・予算・固定値上限で得られなかった結果です。数学的に不可能とは断定しません。制限下の最大時間は約1.40秒。
- 成功率が低い設定の生成手法の改善と、人間による難易度校正が残課題です。全設定で必ず生成できる実装とは報告しません。

詳細は [performance.md](performance.md)、原データは [benchmark-v2.json](benchmark-v2.json)。

## 保存と再現性

- 適用済みの全設定は問題定義と一緒に保存。編集中の設定は保存せず、再開時は適用済み値に戻します。
- 外枠version 1は互換維持。旧v1の5×5問題と記録を勝手にv2へ置換しません。問題IDには生成版・全設定・実際のケージが含まれます。
- 最新生成はv2。旧v1は5×5 normalの再現専用として明示。`currentSettings()`はv2、互換API`settingsForSeed()`は旧v1。
- 一意性マーカーだけを信用せず、構造・ID・入力範囲・一意性とv2の難易度を再確認。予算超過や不正データを出題しません。
- 正解全体をUI・保存データへ追加しません。復元後の操作履歴は初期化します。

## 変更ファイル一覧

合計42ファイル。

| ファイル | 区分 |
|---|---|
| [README.md](../README.md) | 変更 |
| [docs/benchmark-v2.json](../docs/benchmark-v2.json) | 追加 |
| [docs/core-design.md](../docs/core-design.md) | 変更 |
| [docs/performance.md](../docs/performance.md) | 追加 |
| [docs/persistence.md](../docs/persistence.md) | 変更 |
| [docs/rules.md](../docs/rules.md) | 変更 |
| [docs/step4-report.md](../docs/step4-report.md) | 追加 |
| [package.json](../package.json) | 変更 |
| [scripts/benchmark-matrix.ts](../scripts/benchmark-matrix.ts) | 追加 |
| [src/App.vue](../src/App.vue) | 変更 |
| [src/components/NumberPad.vue](../src/components/NumberPad.vue) | 変更 |
| [src/components/PuzzleBoard.vue](../src/components/PuzzleBoard.vue) | 変更 |
| [src/components/SettingsPanel.vue](../src/components/SettingsPanel.vue) | 追加 |
| [src/composables/useGamePersistence.ts](../src/composables/useGamePersistence.ts) | 変更 |
| [src/composables/usePuzzleGame.ts](../src/composables/usePuzzleGame.ts) | 変更 |
| [src/composables/usePuzzleGenerator.ts](../src/composables/usePuzzleGenerator.ts) | 変更 |
| [src/composables/usePuzzleSettings.ts](../src/composables/usePuzzleSettings.ts) | 追加 |
| [src/core/cages.ts](../src/core/cages.ts) | 変更 |
| [src/core/constraints.ts](../src/core/constraints.ts) | 変更 |
| [src/core/definition.ts](../src/core/definition.ts) | 追加 |
| [src/core/difficulty.ts](../src/core/difficulty.ts) | 追加 |
| [src/core/generator.ts](../src/core/generator.ts) | 変更 |
| [src/core/geometry.ts](../src/core/geometry.ts) | 変更 |
| [src/core/hints.ts](../src/core/hints.ts) | 変更 |
| [src/core/latinSquare.ts](../src/core/latinSquare.ts) | 変更 |
| [src/core/legacyGenerator.ts](../src/core/legacyGenerator.ts) | 追加 |
| [src/core/progress.ts](../src/core/progress.ts) | 変更 |
| [src/core/solver.ts](../src/core/solver.ts) | 変更 |
| [src/core/types.ts](../src/core/types.ts) | 変更 |
| [src/services/cellAnswer.ts](../src/services/cellAnswer.ts) | 変更 |
| [src/services/gameStorage.ts](../src/services/gameStorage.ts) | 変更 |
| [src/style.css](../src/style.css) | 変更 |
| [src/workers/handleGenerate.ts](../src/workers/handleGenerate.ts) | 変更 |
| [src/workers/handleVerify.ts](../src/workers/handleVerify.ts) | 追加 |
| [src/workers/protocol.ts](../src/workers/protocol.ts) | 変更 |
| [src/workers/puzzle.worker.ts](../src/workers/puzzle.worker.ts) | 変更 |
| [tests/components/settings.spec.ts](../tests/components/settings.spec.ts) | 追加 |
| [tests/composables/configurable.spec.ts](../tests/composables/configurable.spec.ts) | 追加 |
| [tests/core/configurable.spec.ts](../tests/core/configurable.spec.ts) | 追加 |
| [tests/fixtures.ts](../tests/fixtures.ts) | 変更 |
| [tests/game-fixture.ts](../tests/game-fixture.ts) | 変更 |
| [tests/services/configurable.spec.ts](../tests/services/configurable.spec.ts) | 追加 |

他プロジェクト、Supabase、Game Hubは変更していません。GitHubへのpush・Vercel公開は行っていません。
