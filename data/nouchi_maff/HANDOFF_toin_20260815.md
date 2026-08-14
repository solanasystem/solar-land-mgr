# 引き継ぎメモ: 東員町 農地ナビデータ (2026-08-15)

ノートPCで作業した内容をデスクトップPCへ引き継ぐためのメモ。

## やったこと

- 農地ナビ(eMAFF地図 map.maff.go.jp)からDLした東員町の農地ピン **11ファイル**(`農地ピン_20260815*.geojson`, C:\Users\kurim\Downloads)を統合
- 生 77,665件 → 重複除去(DaichoId基準)で **36,594件**
- ダウンロード範囲には北勢一帯が含まれていた:
  - 四日市市(242021) 11,062 / 桑名市(242055) 9,951 / **東員町(243248) 7,727** / いなべ市(242144) 7,076 / 菰野町(243418) 778
- 東員町を抽出し、**青地(農用地区域内, SectionOfNoushinhou=1)を除去** → **3,400筆**(白地3,359 + 設定なし34 + 農振外7)

## ファイル

- `data/nouchi_maff/toin_shirochi_20260815.geojson` … 東員町・青地除去済 3,400筆(このブランチでコミット済み)
- 桑名市9,951 / いなべ市7,076 のデータもノートPCにローカル保存あり(未コミット、必要なら共有可)

## 属性(分析に使えるフィールド)

各フィーチャの properties に以下が入っている:
`ClassificationOfLandCodeName`(地目 田/畑) / `AreaOnRegistry`(登記面積㎡) /
`SectionOfNoushinhouCodeName`(農振区分) / `SectionOfToshikeikakuhouCodeName`(都市計画) /
`OwnerFarmIntentionCodeName`(出し手意向 ※東員町は全件「非公表」) /
`UsageSituationInvestigationResultCodeName`(遊休農地判定) / `Address` / `Tiban` / `DaichoId`

## 未実施(次のステップ)

- **AI分析(reject スコアリング)**は未実施。フロントは reject を「読むだけ」で、算出本体(重み付け・ハザード/系統/接道の地理照合)は別プロセス(デスクトップ側)にあるため、ノート単体では同一スコアを再現不可。
- 東員町の完全判定 → farmland_snapshots へ反映 → トラッカーにフラグ表示、が残タスク。

## 受け取り方(デスクトップで)

```bash
git fetch origin
git checkout data/toin-shirochi-20260815
```
