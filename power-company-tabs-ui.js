/* =========================================================
   power-company-tabs-ui.js
   電力会社タブUI(ボタン形式)の共通描画ロジック
   - field-survey.html / landowner-visit.html で共有
   - 重複ファイル台帳グループ3(2026-08-25共通化)
   - main.htmlはプルダウンUIで構造が異なるため対象外(意図的に別実装)
   - 件数の集計方法(何を数えるか)は各ページ固有のため、ここでは扱わない。
     呼び出し側が counts オブジェクト({電力会社名: 件数})を渡す。
   ========================================================= */
(function(global){
'use strict';

function renderPowerCompanyTabButtons(containerEl, counts, currentPowerCompany){
  if(!containerEl) return;
  var companies = (global.POWER_COMPANIES || []);
  containerEl.innerHTML = companies.map(function(pc){
    var n = counts[pc] || 0;
    var active = pc === currentPowerCompany ? ' active' : '';
    var empty = n === 0 ? ' style="opacity:.4"' : '';
    var onclickAttr = pc === currentPowerCompany
      ? 'onclick="togglePcExpanded(event)"'
      : ('onclick="setPowerCompany(\'' + pc + '\')"');
    return '<button class="pc-tab' + active + '"' + empty + ' ' + onclickAttr + '>' + pc + '<span class="pc-count">(' + n + ')</span></button>';
  }).join('');
}

/* モバイル：電力会社ドロップダウン展開トグル。#pcTabs を持つページ共通 */
function togglePcExpanded(event){
  if (window.innerWidth > 1024) return;
  if (event) event.stopPropagation();
  var tabs = document.getElementById('pcTabs');
  if (tabs) tabs.classList.toggle('expanded');
}

global.renderPowerCompanyTabButtons = renderPowerCompanyTabButtons;
global.togglePcExpanded = togglePcExpanded;

})(window);
