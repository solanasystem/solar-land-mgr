/* ============================================================================
 * toki-ai.js
 * SOLAR LAND MGR フェーズ1 ※2: 登記簿AI自動転記メインロジック
 *
 * 公開関数:
 *   window.openTokiAiModal(documentId)        - 単一PDFのAI転記モーダルを開く
 *   window.openTokiAiHistoryModal(caseId)     - 案件のAI転記履歴を表示
 *
 * 依存:
 *   db (Supabase クライアント)         ← index.html で定義済み
 *   pdfjsLib (PDF.js)                  ← index.html で読込済み
 *   showToast(msg, type)               ← index.html で定義済み
 *   closeModal(id)                     ← index.html で定義済み
 *   loadDocuments(caseId)              ← index.html で定義済み（再読込用）
 *
 * 作成日: 2026/04/30
 * ============================================================================ */

(function() {
  'use strict';

  // ============================================================================
  // 定数
  // ============================================================================
  const STORAGE_KEY = 'solar_land_mgr_anthropic_api_key';
  const MODEL = 'claude-sonnet-4-6';
  const PRICE = { input: 3.00, output: 15.00 };  // $/Mtok

  // ============================================================================
  // 状態管理
  // ============================================================================
  const state = {
    documentId: null,
    caseId: null,
    docRecord: null,
    pdfImages: [],
    apiResponse: null,
    parsed: null,
    existingLandInfo: null,
    existingLandowners: [],
    decisions: {
      hyodaibu: {},        // { location: 'ai'|'db', chiban: ..., chimoku: ..., area_sqm: ... }
      owners: [],          // [ { action: 'insert'|'update'|'skip', existingId: null|uuid }, ... ]
      otsuku: 'skip',      // 'skip' | 'overwrite' | 'append'
    }
  };

  // ============================================================================
  // ユーティリティ
  // ============================================================================
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 地権者氏名を「三　浦　正　義」形式（文字間に全角スペース）に整形
  function formatOwnerNameWithSpaces(name) {
    if (!name) return name;
    const cleaned = String(name).replace(/[\s　]+/g, '');
    return cleaned.split('').join('　');
  }

  // 突合比較用：氏名の空白（半角・全角）を全て除去して正規化
  function normalizeNameForMatch(name) {
    if (!name) return '';
    return String(name).replace(/[\s　]+/g, '');
  }

  function formatDateJp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // ============================================================================
  // モーダル制御（既存パターンに準拠：classList.add('open')）
  // ============================================================================
  function openModalEl(modalEl) {
    document.body.appendChild(modalEl);
    requestAnimationFrame(() => modalEl.classList.add('open'));
  }
  function closeModalEl(modalEl) {
    modalEl.classList.remove('open');
    setTimeout(() => modalEl.remove(), 250);
  }

  // ============================================================================
  // APIキー管理
  // ============================================================================
  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY);
  }
  function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY, key);
  }
  function clearApiKey() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ============================================================================
  // JSON抽出（波括弧の対応で最初の完全JSONを抽出）
  // ============================================================================
  function extractFirstJsonObject(text) {
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.substring(start, i + 1);
      }
    }
    return null;
  }

  // ============================================================================
  // PDF→画像変換（既存※1で実績あるロジック・toki-ai-test.htmlと同等）
  // ============================================================================
  async function pdfBlobToImages(blob) {
    if (!window.pdfjsLib) throw new Error('PDF.jsライブラリが読み込まれていません');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.85));
    }
    return images;
  }

  // ============================================================================
  // Storage から PDF を取得
  // ============================================================================
  async function fetchPdfFromStorage(filePath) {
    const { data: urlData, error } = await db.storage.from('registry-docs').createSignedUrl(filePath, 600);
    if (error || !urlData) throw new Error('Storage URL取得失敗: ' + (error?.message || 'unknown'));
    const res = await fetch(urlData.signedUrl);
    if (!res.ok) throw new Error('PDF取得失敗: HTTP ' + res.status);
    return await res.blob();
  }

  // ============================================================================
  // Claude API 呼び出し（toki-ai-test.html と同等のプロンプト）
  // ============================================================================
  async function callClaudeApi(images, apiKey) {
    const systemPrompt = `あなたは日本の不動産登記簿（登記事項証明書）から構造化情報を抽出する専門家です。
添付された登記簿の画像を解析し、以下の3部構成に分けて情報を抽出してください。

【表題部】土地の物理的情報
- 所在（市町村+大字+小字）
- 地番
- 地目（田・畑・山林・宅地など）
- 地積（㎡、小数点以下も保持。「○○㎡」のような単位は含めず数値のみ）

【権利部（甲区）】所有権に関する事項
- 「所有権移転」または「所有権保存」の履歴を上から順に確認
- 「最下段（最新）の登記」の取得者を「現在の所有者」として抽出
- 共有名義の場合は所有者ごとに別オブジェクトで返す
- 持分の記載があれば抽出
- 各所有者の氏名と住所をペアで返す
- 抹消や登記名義人住所変更などは所有権取得とみなさず、直近の所有権移転/保存を採用

【権利部（乙区）】所有権以外の権利
- 「設定中」の抵当権・地役権・地上権等のみ抽出
- 「抹消」「解除」と記載されているものは絶対に含めない
- **乙区に記載されている権利が全て抹消・解除されている場合、empty: true を返し rights は空配列とする**
- 設定中の権利が複数あれば配列で返す
- 乙区が空白・「該当事項なし」の場合は empty: true を返す

【出力形式】
以下のJSON形式で**JSON以外のテキストを一切含めず**返してください。
不確実な値は confidence を 0.0〜1.0 で返し、読み取れなかったフィールドは null としてください。

{
  "hyodaibu": {
    "shozai": "所在文字列",
    "chiban": "地番文字列",
    "chimoku": "地目文字列",
    "chiseki_sqm": 数値,
    "confidence": 0.0〜1.0
  },
  "kouku": {
    "owners": [
      {
        "name": "氏名",
        "address": "住所",
        "mochibun": "持分（なければnull）",
        "confidence": 0.0〜1.0
      }
    ]
  },
  "otsuku": {
    "empty": true|false,
    "rights": [
      {
        "type": "抵当権/地役権/地上権 など",
        "details": "詳細（債権額・債務者・権利者など）",
        "confidence": 0.0〜1.0
      }
    ]
  }
}

【厳守事項】
- 出力は**1つのJSONオブジェクトのみ**。複数のJSONを並べたり、JSONの後に説明文を続けたりしない
- ${'```'}json などのMarkdownコードブロックも使わない
- 「以下が結果です」などの前置きも禁止
- 純粋なJSONテキストのみを返す`;

    const imageContents = images.map(dataUrl => {
      const base64 = dataUrl.split(',')[1];
      return {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
      };
    });

    const requestBody = {
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          ...imageContents,
          { type: 'text', text: '上記の登記簿画像から、指示通りJSON形式で情報を抽出してください。JSONのみを返し、説明文は一切含めないでください。' }
        ]
      }]
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API エラー (${response.status}): ${errText.substring(0, 300)}`);
    }
    return await response.json();
  }

  // ============================================================================
  // AIレスポンスをパース
  // ============================================================================
  function parseApiResponse(apiResponse) {
    const tc = apiResponse.content.find(c => c.type === 'text');
    if (!tc) throw new Error('AIレスポンスにテキストが含まれていません');
    let raw = tc.text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    try {
      return JSON.parse(raw);
    } catch (e) {
      const fj = extractFirstJsonObject(raw);
      if (fj) return JSON.parse(fj);
      throw new Error('AI出力のJSON解析失敗: ' + raw.substring(0, 200));
    }
  }

  // ============================================================================
  // 既存 land_info / landowner_info を取得
  // ============================================================================
  async function fetchExistingDbData(caseId) {
    const { data: liData } = await db.from('land_info').select('*').eq('case_id', caseId).maybeSingle();
    const { data: loData } = await db.from('landowner_info').select('*').eq('case_id', caseId);
    return { landInfo: liData || null, landowners: loData || [] };
  }

  // ============================================================================
  // 突合：name + address 完全一致で既存landowner_infoを検索
  // ============================================================================
  function matchOwner(aiName, aiAddress, existingLandowners) {
    // 氏名は整形（空白挿入）後・既存DB値（空白あり/なし両対応）の整合のため、空白除去で比較
    const normAiName = normalizeNameForMatch(aiName);
    const exact = existingLandowners.find(d => normalizeNameForMatch(d.name) === normAiName && d.address === aiAddress);
    if (exact) return { type: 'update', existing: exact };
    const sameName = existingLandowners.filter(d => normalizeNameForMatch(d.name) === normAiName);
    if (sameName.length > 0) return { type: 'new_with_warning', similar: sameName };
    return { type: 'new', existing: null };
  }

  // ============================================================================
  // メイン関数: AI転記モーダルを開く
  // ============================================================================
  async function openTokiAiModal(documentId) {
    state.documentId = documentId;
    try {
      // 書類レコード取得
      const { data: doc, error } = await db.from('case_documents').select('*').eq('id', documentId).single();
      if (error || !doc) throw new Error('書類取得失敗: ' + (error?.message || 'not found'));
      if (doc.document_type !== 'touki') {
        showToast('登記簿（touki）のみAI転記可能です', 'error');
        return;
      }
      state.docRecord = doc;
      state.caseId = doc.case_id;

      // 案件と既存DBデータ取得
      const { data: caseRec } = await db.from('cases').select('case_no').eq('id', doc.case_id).single();
      const existing = await fetchExistingDbData(doc.case_id);
      state.existingLandInfo = existing.landInfo;
      state.existingLandowners = existing.landowners;

      // モーダル生成
      const modal = createModal(caseRec?.case_no || '?', doc);
      openModalEl(modal);
    } catch (e) {
      showToast('AI転記モーダル起動失敗: ' + (e.message || e), 'error');
      console.error(e);
    }
  }

  // ============================================================================
  // モーダル本体生成
  // ============================================================================
  function createModal(caseNo, doc) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'tokiAiModal';
    overlay.innerHTML = `
      <div class="modal toki-ai-modal">
        <div class="modal-header">
          <div>
            <div class="modal-title">📄 登記簿AI自動転記</div>
            <div class="modal-subtitle">案件: ${escapeHtml(caseNo)} ／ ${escapeHtml(doc.file_name || '')}${doc.chiban ? ' ／ 地番: ' + escapeHtml(doc.chiban) : ''}</div>
          </div>
          <button class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('open');setTimeout(()=>this.closest('.modal-overlay').remove(),250)">✕</button>
        </div>
        <div class="modal-body">
          <!-- APIキー設定 -->
          <div class="toki-ai-section">
            <div class="toki-ai-section-title">
              <span>🔑 APIキー（Anthropic）</span>
              <span class="toki-ai-badge ${getApiKey() ? 'toki-ai-badge-success' : 'toki-ai-badge-info'}" id="taiApiKeyStatus">${getApiKey() ? '✅ 設定済' : '未設定'}</span>
            </div>
            <div class="toki-ai-apikey-row">
              <input type="password" id="taiApiKey" placeholder="sk-ant-api03-... をペースト" value="${getApiKey() || ''}">
              <button class="btn btn-primary" style="font-size:12px;" id="taiSaveKeyBtn">保存</button>
              <button class="btn btn-ghost" style="font-size:12px;" id="taiToggleKeyBtn">👁️ 表示</button>
              <button class="btn btn-ghost" style="font-size:12px;color:#ef4444;" id="taiClearKeyBtn">削除</button>
            </div>
            <div class="toki-ai-apikey-note">※ ブラウザの localStorage にのみ保存。サーバーには送信されない</div>
          </div>

          <!-- 解析実行 -->
          <div class="toki-ai-section">
            <div class="toki-ai-section-title">
              <span>🤖 AI解析実行</span>
              <span class="toki-ai-badge toki-ai-badge-info" id="taiAnalysisStatus" style="display:none">準備中</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="btn btn-primary" id="taiAnalyzeBtn" ${getApiKey() ? '' : 'disabled'}>🚀 解析実行</button>
              <div class="toki-ai-cost-stats" id="taiCostStats" style="display:none">
                <span id="taiCostInput">入力: -</span>
                <span id="taiCostOutput">出力: -</span>
                <span id="taiCostTotal">合計: -</span>
              </div>
            </div>
            <div class="toki-ai-progress" id="taiProgress"></div>
          </div>

          <!-- プレビュー結果（解析後に表示） -->
          <div id="taiPreviewSection" style="display:none"></div>

          <!-- 生レスポンス（折りたたみ・常時アクセス可能） -->
          <details class="toki-ai-raw-section" id="taiRawSection" style="display:none">
            <summary>🐛 AIの生レスポンス（デバッグ用）</summary>
            <textarea class="toki-ai-raw-textarea" id="taiRawText" readonly></textarea>
          </details>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').classList.remove('open');setTimeout(()=>this.closest('.modal-overlay').remove(),250)">閉じる</button>
          <button class="btn btn-primary" id="taiCommitBtn" style="display:none">✅ この内容で登録</button>
        </div>
      </div>
    `;
    setTimeout(() => bindModalEvents(overlay), 0);
    return overlay;
  }

  // ============================================================================
  // モーダル内イベントバインド
  // ============================================================================
  function bindModalEvents(overlay) {
    const apiKeyInput = overlay.querySelector('#taiApiKey');
    const saveBtn = overlay.querySelector('#taiSaveKeyBtn');
    const toggleBtn = overlay.querySelector('#taiToggleKeyBtn');
    const clearBtn = overlay.querySelector('#taiClearKeyBtn');
    const analyzeBtn = overlay.querySelector('#taiAnalyzeBtn');
    const commitBtn = overlay.querySelector('#taiCommitBtn');

    saveBtn.addEventListener('click', () => {
      const k = apiKeyInput.value.trim();
      if (!k) { showToast('APIキーを入力してください', 'error'); return; }
      if (!k.startsWith('sk-ant-')) {
        if (!confirm('Anthropic APIキーは通常 "sk-ant-" で始まります。続行しますか？')) return;
      }
      setApiKey(k);
      const badge = overlay.querySelector('#taiApiKeyStatus');
      badge.textContent = '✅ 設定済';
      badge.className = 'toki-ai-badge toki-ai-badge-success';
      analyzeBtn.disabled = false;
      showToast('APIキーを保存しました', 'success');
    });

    toggleBtn.addEventListener('click', () => {
      if (apiKeyInput.type === 'password') { apiKeyInput.type = 'text'; toggleBtn.textContent = '🙈 隠す'; }
      else { apiKeyInput.type = 'password'; toggleBtn.textContent = '👁️ 表示'; }
    });

    clearBtn.addEventListener('click', () => {
      if (!confirm('APIキーを削除しますか？')) return;
      clearApiKey();
      apiKeyInput.value = '';
      const badge = overlay.querySelector('#taiApiKeyStatus');
      badge.textContent = '未設定';
      badge.className = 'toki-ai-badge toki-ai-badge-info';
      analyzeBtn.disabled = true;
    });

    analyzeBtn.addEventListener('click', () => runAnalysis(overlay));

    commitBtn.addEventListener('click', () => commitChanges(overlay));
  }

  // ============================================================================
  // 解析実行
  // ============================================================================
  async function runAnalysis(overlay) {
    const apiKey = getApiKey();
    if (!apiKey) { showToast('APIキーを設定してください', 'error'); return; }

    const analyzeBtn = overlay.querySelector('#taiAnalyzeBtn');
    const statusBadge = overlay.querySelector('#taiAnalysisStatus');
    const progressDiv = overlay.querySelector('#taiProgress');
    progressDiv.innerHTML = '';
    overlay.querySelector('#taiPreviewSection').style.display = 'none';
    overlay.querySelector('#taiRawSection').style.display = 'none';
    overlay.querySelector('#taiCommitBtn').style.display = 'none';

    analyzeBtn.disabled = true;
    statusBadge.style.display = 'inline-block';
    statusBadge.textContent = '解析中';
    statusBadge.className = 'toki-ai-badge toki-ai-badge-warning';

    const addProgress = (text, cls) => {
      const div = document.createElement('div');
      div.className = 'toki-ai-progress-item ' + (cls || 'active');
      div.textContent = text;
      progressDiv.appendChild(div);
      return div;
    };

    try {
      // Step 1: PDF取得
      const p1 = addProgress('1. Storage からPDF取得中...', 'active');
      const blob = await fetchPdfFromStorage(state.docRecord.file_path);
      p1.textContent = `1. ✅ PDF取得完了（${(blob.size / 1024).toFixed(1)} KB）`;
      p1.className = 'toki-ai-progress-item done';

      // Step 2: 画像化
      const p2 = addProgress('2. PDF を画像化中...', 'active');
      state.pdfImages = await pdfBlobToImages(blob);
      p2.textContent = `2. ✅ 画像化完了（${state.pdfImages.length} ページ）`;
      p2.className = 'toki-ai-progress-item done';

      // Step 3: API呼び出し
      const p3 = addProgress('3. Claude Sonnet 4.6 へ送信中...', 'active');
      const apiResp = await callClaudeApi(state.pdfImages, apiKey);
      p3.textContent = '3. ✅ AI解析完了';
      p3.className = 'toki-ai-progress-item done';
      state.apiResponse = apiResp;

      // 生レスポンス表示
      const tc = apiResp.content.find(c => c.type === 'text');
      if (tc) {
        overlay.querySelector('#taiRawText').value = tc.text;
        overlay.querySelector('#taiRawSection').style.display = 'block';
      }

      // コスト表示
      if (apiResp.usage) {
        const inTok = apiResp.usage.input_tokens || 0;
        const outTok = apiResp.usage.output_tokens || 0;
        const inCost = inTok * PRICE.input / 1000000;
        const outCost = outTok * PRICE.output / 1000000;
        overlay.querySelector('#taiCostStats').style.display = 'flex';
        overlay.querySelector('#taiCostInput').textContent = `入力: ${inTok.toLocaleString()} tok ($${inCost.toFixed(4)})`;
        overlay.querySelector('#taiCostOutput').textContent = `出力: ${outTok.toLocaleString()} tok ($${outCost.toFixed(4)})`;
        overlay.querySelector('#taiCostTotal').textContent = `合計: $${(inCost + outCost).toFixed(4)}`;
      }

      // Step 4: パース
      const p4 = addProgress('4. JSON パース中...', 'active');
      state.parsed = parseApiResponse(apiResp);
      p4.textContent = '4. ✅ パース完了';
      p4.className = 'toki-ai-progress-item done';

      // Step 5: プレビューUI生成
      const p5 = addProgress('5. プレビュー生成中...', 'active');
      renderPreview(overlay);
      p5.textContent = '5. ✅ プレビュー表示';
      p5.className = 'toki-ai-progress-item done';

      statusBadge.textContent = '完了';
      statusBadge.className = 'toki-ai-badge toki-ai-badge-success';
      overlay.querySelector('#taiCommitBtn').style.display = 'inline-block';
    } catch (e) {
      addProgress('❌ エラー: ' + (e.message || e), 'error');
      statusBadge.textContent = 'エラー';
      statusBadge.className = 'toki-ai-badge toki-ai-badge-error';
      console.error(e);
      showToast('解析失敗: ' + (e.message || e), 'error');
    } finally {
      analyzeBtn.disabled = false;
    }
  }

  // ============================================================================
  // プレビュー UI 生成
  // ============================================================================
  function renderPreview(overlay) {
    const parsed = state.parsed;
    const li = state.existingLandInfo || {};
    const owners = parsed.kouku?.owners || [];

    // decisions 初期化（DB値が空ならAI採用、あればDB維持をデフォルト）
    state.decisions.hyodaibu = {
      location: !li.location && parsed.hyodaibu?.shozai ? 'ai' : 'db',
      chiban:   !li.chiban   && parsed.hyodaibu?.chiban ? 'ai' : 'db',
      chimoku:  !li.chimoku  && parsed.hyodaibu?.chimoku ? 'ai' : 'db',
      area_sqm: !li.area_sqm && parsed.hyodaibu?.chiseki_sqm !== null && parsed.hyodaibu?.chiseki_sqm !== undefined ? 'ai' : 'db',
    };
    state.decisions.owners = owners.map((o, idx) => {
      const m = matchOwner(o.name, o.address, state.existingLandowners);
      return {
        action: m.type === 'update' ? 'update' : (m.type === 'new' || m.type === 'new_with_warning' ? 'insert' : 'skip'),
        matchType: m.type,
        existingId: m.existing?.id || null,
        existingMemo: m.existing?.memo || null,
      };
    });
    state.decisions.otsuku = parsed.otsuku?.empty ? 'skip' : 'overwrite';

    const sec = overlay.querySelector('#taiPreviewSection');
    sec.style.display = 'block';
    sec.innerHTML = `
      ${renderHyodaibuSection(parsed.hyodaibu || {}, li)}
      ${renderKoukuSection(owners)}
      ${renderOtsukuSection(parsed.otsuku || { empty: true }, owners)}
    `;
    bindPreviewEvents(overlay);
  }

  // ----- 表題部 -----
  function renderHyodaibuSection(h, li) {
    const fields = [
      { key: 'location', label: '所在',   dbVal: li.location, aiVal: h.shozai },
      { key: 'chiban',   label: '地番',   dbVal: li.chiban,   aiVal: h.chiban },
      { key: 'chimoku',  label: '地目',   dbVal: li.chimoku,  aiVal: h.chimoku },
      { key: 'area_sqm', label: '地積㎡', dbVal: li.area_sqm, aiVal: h.chiseki_sqm },
    ];
    const conf = h.confidence !== null && h.confidence !== undefined ? `confidence: ${(h.confidence * 100).toFixed(0)}%` : '';
    return `
      <div class="toki-ai-section">
        <div class="toki-ai-section-title">
          <span>📐 表題部 → land_info</span>
          <span class="toki-ai-badge toki-ai-badge-info">${escapeHtml(conf)}</span>
        </div>
        <div class="toki-ai-preview-grid-header">
          <div>項目</div><div>DB値（現在）</div><div>AI値（提案）</div><div>採用</div>
        </div>
        ${fields.map(f => `
          <div class="toki-ai-preview-grid">
            <div class="toki-ai-field-label">${f.label}</div>
            <div class="toki-ai-field-db ${(f.dbVal === null || f.dbVal === undefined || f.dbVal === '') ? 'empty' : ''}">${(f.dbVal === null || f.dbVal === undefined || f.dbVal === '') ? '(空)' : escapeHtml(String(f.dbVal))}</div>
            <div class="toki-ai-field-ai ${(f.aiVal === null || f.aiVal === undefined || f.aiVal === '') ? 'empty' : ''}">${(f.aiVal === null || f.aiVal === undefined || f.aiVal === '') ? '(取得失敗)' : escapeHtml(String(f.aiVal))}</div>
            <div class="toki-ai-radio-group">
              <label><input type="radio" name="hyo_${f.key}" value="db" ${state.decisions.hyodaibu[f.key] === 'db' ? 'checked' : ''}>DB維持</label>
              <label><input type="radio" name="hyo_${f.key}" value="ai" ${state.decisions.hyodaibu[f.key] === 'ai' ? 'checked' : ''}>AI採用</label>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ----- 甲区 -----
  function renderKoukuSection(owners) {
    if (owners.length === 0) {
      return `<div class="toki-ai-section">
        <div class="toki-ai-section-title"><span>👥 甲区 → landowner_info</span></div>
        <div style="color:var(--text-muted);font-size:12px;">所有者情報が抽出できませんでした。</div>
      </div>`;
    }
    return `
      <div class="toki-ai-section">
        <div class="toki-ai-section-title">
          <span>👥 甲区 → landowner_info（${owners.length}名）</span>
          <span class="toki-ai-badge ${owners.length > 1 ? 'toki-ai-badge-warning' : 'toki-ai-badge-info'}">${owners.length === 1 ? '単独名義' : '共有 ' + owners.length + '名'}</span>
        </div>
        ${owners.map((o, idx) => renderOwnerCard(o, idx)).join('')}
      </div>
    `;
  }

  function renderOwnerCard(owner, idx) {
    const decision = state.decisions.owners[idx];
    const matchBadge = decision.matchType === 'update' ? '<span class="toki-ai-badge toki-ai-badge-update">🟡 更新候補（DB一致あり）</span>'
                     : decision.matchType === 'new_with_warning' ? '<span class="toki-ai-badge toki-ai-badge-warn">🟠 新規（同名あり要確認）</span>'
                     : '<span class="toki-ai-badge toki-ai-badge-new">🟢 新規作成</span>';
    const conf = owner.confidence !== null && owner.confidence !== undefined ? ` conf: ${(owner.confidence * 100).toFixed(0)}%` : '';
    const isPrimary = idx === 0;
    return `
      <div class="toki-ai-owner-card ${isPrimary ? 'primary' : ''}" data-owner-idx="${idx}">
        <div class="toki-ai-owner-header">
          <div class="toki-ai-owner-title">所有者${idx + 1} ${isPrimary ? '（筆頭）' : ''}${escapeHtml(conf)}</div>
          <div class="toki-ai-owner-actions">
            ${matchBadge}
            <div class="toki-ai-radio-group">
              ${decision.matchType === 'update'
                ? `<label><input type="radio" name="own_${idx}" value="update" ${decision.action === 'update' ? 'checked' : ''}>UPDATE</label>
                   <label><input type="radio" name="own_${idx}" value="skip" ${decision.action === 'skip' ? 'checked' : ''}>スキップ</label>`
                : `<label><input type="radio" name="own_${idx}" value="insert" ${decision.action === 'insert' ? 'checked' : ''}>INSERT</label>
                   <label><input type="radio" name="own_${idx}" value="skip" ${decision.action === 'skip' ? 'checked' : ''}>スキップ</label>`
              }
            </div>
          </div>
        </div>
        <div class="toki-ai-preview-grid">
          <div class="toki-ai-field-label">氏名</div>
          <div class="toki-ai-field-db ${decision.matchType === 'update' ? '' : 'empty'}">${decision.matchType === 'update' ? escapeHtml(state.existingLandowners.find(l => l.id === decision.existingId)?.name || '') : '(なし)'}</div>
          <div class="toki-ai-field-ai">${escapeHtml(owner.name || '')}</div>
          <div></div>
        </div>
        <div class="toki-ai-preview-grid">
          <div class="toki-ai-field-label">住所</div>
          <div class="toki-ai-field-db ${decision.matchType === 'update' ? '' : 'empty'}">${decision.matchType === 'update' ? escapeHtml(state.existingLandowners.find(l => l.id === decision.existingId)?.address || '') : '(なし)'}</div>
          <div class="toki-ai-field-ai">${escapeHtml(owner.address || '')}</div>
          <div></div>
        </div>
        ${owner.mochibun ? `
          <div class="toki-ai-preview-grid">
            <div class="toki-ai-field-label">持分</div>
            <div class="toki-ai-field-db empty">(DB保存対象外)</div>
            <div class="toki-ai-field-ai">${escapeHtml(owner.mochibun)}</div>
            <div style="font-size:10px;color:var(--text-muted);">参考のみ</div>
          </div>` : ''}
      </div>
    `;
  }

  // ----- 乙区 -----
  function renderOtsukuSection(otsuku, owners) {
    const empty = !!otsuku.empty;
    const rights = otsuku.rights || [];
    const aiText = empty || rights.length === 0 ? '' : rights.map(r =>
      `【${r.type || '権利'}】${r.details || ''}`
    ).join('\n');

    if (empty) {
      return `
        <div class="toki-ai-section">
          <div class="toki-ai-section-title">
            <span>📜 乙区 → 筆頭所有者の memo</span>
            <span class="toki-ai-badge toki-ai-badge-success">該当事項なし</span>
          </div>
          <div style="color:var(--text-muted);font-size:12px;font-style:italic;">設定中の権利はありません（memo転記なし）</div>
        </div>
      `;
    }

    const primaryDecision = state.decisions.owners[0];
    const primaryExisting = primaryDecision && primaryDecision.matchType === 'update' ? state.existingLandowners.find(l => l.id === primaryDecision.existingId) : null;
    const dbMemo = primaryExisting?.memo || '';

    const targetText = primaryDecision
      ? (primaryDecision.action === 'skip' ? `<strong style="color:var(--red);">⚠ 筆頭所有者がスキップのため、乙区も保存されません</strong>`
        : primaryDecision.matchType === 'update' ? `<strong>更新対象</strong>: 既存 ${escapeHtml(primaryExisting?.name || '')}`
        : `<strong>新規作成される筆頭所有者</strong>: ${escapeHtml(state.parsed.kouku?.owners?.[0]?.name || '')}`)
      : '<strong style="color:var(--red);">⚠ 所有者情報なし・乙区保存不可</strong>';

    return `
      <div class="toki-ai-section">
        <div class="toki-ai-section-title">
          <span>📜 乙区 → 筆頭所有者の memo</span>
          <span class="toki-ai-badge toki-ai-badge-warning">${rights.length}件の設定中権利</span>
        </div>
        <div class="toki-ai-otsuku-target">${targetText}</div>
        <div class="toki-ai-preview-grid">
          <div class="toki-ai-field-label">memo値</div>
          <div class="toki-ai-field-db ${dbMemo ? '' : 'empty'}" style="white-space:pre-wrap">${dbMemo ? escapeHtml(dbMemo) : '(空)'}</div>
          <div class="toki-ai-field-ai" style="white-space:pre-wrap">${escapeHtml(aiText)}</div>
          <div class="toki-ai-radio-group" style="flex-direction:column;align-items:flex-start;">
            <label><input type="radio" name="otsuku_action" value="skip" ${state.decisions.otsuku === 'skip' ? 'checked' : ''}>スキップ</label>
            <label><input type="radio" name="otsuku_action" value="overwrite" ${state.decisions.otsuku === 'overwrite' ? 'checked' : ''}>上書き</label>
            <label><input type="radio" name="otsuku_action" value="append" ${state.decisions.otsuku === 'append' ? 'checked' : ''}>追記</label>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // プレビュー内のラジオ変更を state に反映
  // ============================================================================
  function bindPreviewEvents(overlay) {
    overlay.querySelectorAll('input[type="radio"]').forEach(r => {
      r.addEventListener('change', () => {
        const name = r.name;
        const val = r.value;
        if (name.startsWith('hyo_')) {
          state.decisions.hyodaibu[name.replace('hyo_', '')] = val;
        } else if (name.startsWith('own_')) {
          const idx = parseInt(name.replace('own_', ''), 10);
          state.decisions.owners[idx].action = val;
          // スキップなら見た目変更
          const card = overlay.querySelector(`[data-owner-idx="${idx}"]`);
          if (card) card.classList.toggle('skip', val === 'skip');
        } else if (name === 'otsuku_action') {
          state.decisions.otsuku = val;
        }
      });
    });
  }

  // ============================================================================
  // DB反映処理（一括コミット）
  // ============================================================================
  async function commitChanges(overlay) {
    if (!confirm('採用内容でDBに反映します。よろしいですか？\n\n（履歴は landowner_imports / land_info_imports に記録され、後でロールバック可能です）')) return;

    const commitBtn = overlay.querySelector('#taiCommitBtn');
    commitBtn.disabled = true;
    commitBtn.textContent = '反映中...';

    const errors = [];
    let totalActions = 0;

    try {
      // ===== 1. 表題部（land_info）UPDATE =====
      const hyo = state.parsed.hyodaibu || {};
      const li = state.existingLandInfo;
      const decisions = state.decisions.hyodaibu;
      const updates = {};
      const aiExtractedForHistory = {
        location: hyo.shozai || null,
        chiban:   hyo.chiban || null,
        chimoku:  hyo.chimoku || null,
        area_sqm: (hyo.chiseki_sqm !== null && hyo.chiseki_sqm !== undefined) ? hyo.chiseki_sqm : null
      };
      const prevValues = li ? {
        location: li.location || null,
        chiban:   li.chiban || null,
        chimoku:  li.chimoku || null,
        area_sqm: li.area_sqm !== null && li.area_sqm !== undefined ? li.area_sqm : null
      } : { location: null, chiban: null, chimoku: null, area_sqm: null };

      let liChanged = false;
      if (decisions.location === 'ai' && hyo.shozai) { updates.location = hyo.shozai; liChanged = true; }
      if (decisions.chiban === 'ai' && hyo.chiban) { updates.chiban = hyo.chiban; liChanged = true; }
      if (decisions.chimoku === 'ai' && hyo.chimoku) { updates.chimoku = hyo.chimoku; liChanged = true; }
      if (decisions.area_sqm === 'ai' && hyo.chiseki_sqm !== null && hyo.chiseki_sqm !== undefined) { updates.area_sqm = hyo.chiseki_sqm; liChanged = true; }

      let liResultId = li?.id || null;
      if (liChanged) {
        if (li) {
          const { error } = await db.from('land_info').update(updates).eq('id', li.id);
          if (error) errors.push('land_info UPDATE: ' + error.message);
          else totalActions++;
        } else {
          // land_info レコードがない場合は新規作成
          const { data, error } = await db.from('land_info').insert({ case_id: state.caseId, ...updates }).select('id').single();
          if (error) errors.push('land_info INSERT: ' + error.message);
          else { liResultId = data.id; totalActions++; }
        }
        // 履歴記録
        await db.from('land_info_imports').insert({
          case_id: state.caseId,
          case_document_id: state.documentId,
          land_info_id: liResultId,
          ai_raw_json: hyo,
          ai_extracted_location: aiExtractedForHistory.location,
          ai_extracted_chiban:   aiExtractedForHistory.chiban,
          ai_extracted_chimoku:  aiExtractedForHistory.chimoku,
          ai_extracted_area_sqm: aiExtractedForHistory.area_sqm,
          ai_confidence: hyo.confidence || null,
          action: li ? 'update' : 'insert',
          prev_location: prevValues.location,
          prev_chiban:   prevValues.chiban,
          prev_chimoku:  prevValues.chimoku,
          prev_area_sqm: prevValues.area_sqm,
        });
      }

      // ===== 2. 甲区（landowner_info）INSERT/UPDATE =====
      const owners = state.parsed.kouku?.owners || [];
      const ownerIds = [];  // 各所有者のlandowner_id（乙区の筆頭判定用）

      for (let idx = 0; idx < owners.length; idx++) {
        const o = owners[idx];
        const dec = state.decisions.owners[idx];
        if (dec.action === 'skip') {
          ownerIds.push(null);
          // スキップも履歴に記録
          await db.from('landowner_imports').insert({
            case_id: state.caseId,
            case_document_id: state.documentId,
            landowner_id: dec.existingId || null,
            ai_raw_json: o,
            ai_extracted_name: o.name || null,
            ai_extracted_address: o.address || null,
            ai_extracted_memo: null,
            ai_is_primary_owner: idx === 0,
            ai_owner_index: idx + 1,
            ai_confidence: o.confidence || null,
            action: 'skip',
          });
          continue;
        }

        const payload = { case_id: state.caseId, name: formatOwnerNameWithSpaces(o.name) || null, address: o.address || null };
        let landownerId = null;
        let prevName = null, prevAddress = null;

        if (dec.action === 'insert') {
          const { data, error } = await db.from('landowner_info').insert(payload).select('id').single();
          if (error) { errors.push(`所有者${idx + 1} INSERT: ` + error.message); ownerIds.push(null); continue; }
          landownerId = data.id;
          totalActions++;
        } else if (dec.action === 'update') {
          const existing = state.existingLandowners.find(l => l.id === dec.existingId);
          prevName = existing?.name || null;
          prevAddress = existing?.address || null;
          const { error } = await db.from('landowner_info').update(payload).eq('id', dec.existingId);
          if (error) { errors.push(`所有者${idx + 1} UPDATE: ` + error.message); ownerIds.push(null); continue; }
          landownerId = dec.existingId;
          totalActions++;
        }
        ownerIds.push(landownerId);

        // 履歴記録
        await db.from('landowner_imports').insert({
          case_id: state.caseId,
          case_document_id: state.documentId,
          landowner_id: landownerId,
          ai_raw_json: o,
          ai_extracted_name: o.name || null,
          ai_extracted_address: o.address || null,
          ai_extracted_memo: null,
          ai_is_primary_owner: idx === 0,
          ai_owner_index: idx + 1,
          ai_confidence: o.confidence || null,
          action: dec.action,
          prev_name: prevName,
          prev_address: prevAddress,
        });
      }

      // ===== 3. 乙区（筆頭所有者の memo に転記） =====
      const ots = state.parsed.otsuku || { empty: true };
      if (state.decisions.otsuku !== 'skip' && !ots.empty && ots.rights?.length > 0 && ownerIds[0]) {
        const aiMemoText = ots.rights.map(r => `【${r.type || '権利'}】${r.details || ''}`).join('\n');
        const primaryOwner = state.existingLandowners.find(l => l.id === ownerIds[0]);
        const prevMemo = primaryOwner?.memo || null;
        let newMemo;
        if (state.decisions.otsuku === 'overwrite') {
          newMemo = aiMemoText;
        } else if (state.decisions.otsuku === 'append') {
          newMemo = prevMemo ? `${prevMemo}\n\n--- AI転記（乙区）---\n${aiMemoText}` : aiMemoText;
        }
        const { error } = await db.from('landowner_info').update({ memo: newMemo }).eq('id', ownerIds[0]);
        if (error) errors.push('乙区 memo 更新: ' + error.message);
        else totalActions++;

        // 履歴：筆頭所有者の memo 転記分（owner_index=1 の更新として記録）
        await db.from('landowner_imports').insert({
          case_id: state.caseId,
          case_document_id: state.documentId,
          landowner_id: ownerIds[0],
          ai_raw_json: ots,
          ai_extracted_name: null,
          ai_extracted_address: null,
          ai_extracted_memo: aiMemoText,
          ai_is_primary_owner: true,
          ai_owner_index: 1,
          ai_confidence: ots.rights?.[0]?.confidence || null,
          action: 'update',
          prev_memo: prevMemo,
        });
      }

      // ===== 完了処理 =====
      if (errors.length > 0) {
        showToast(`一部エラーあり（${totalActions}件成功・${errors.length}件失敗）：${errors[0]}`, 'error');
        console.error('AI転記エラー詳細:', errors);
      } else {
        showToast(`✅ AI転記完了：${totalActions}件のDB操作`, 'success');
      }
      // モーダル閉じる + 関連UIの再読込
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 250);
      // AI転記で更新される 地権者情報タブ・土地情報タブ・書類タブ・案件一覧 を全て再描画
      if (typeof loadLandownerDetail === 'function' && state.caseId) loadLandownerDetail(state.caseId);
      if (typeof loadLandDetail === 'function' && state.caseId) loadLandDetail(state.caseId);
      if (typeof loadDocuments === 'function' && state.caseId) loadDocuments(state.caseId);
      if (typeof loadCases === 'function') {
        // loadCases() で全件再取得・全件描画した後、filterCases() でフィルタ状態（NGブラインド・検索・電力会社タブ等）を再適用
        Promise.resolve(loadCases()).then(() => {
          if (typeof filterCases === 'function') filterCases();
        });
      }
    } catch (e) {
      console.error(e);
      showToast('反映処理失敗: ' + (e.message || e), 'error');
      commitBtn.disabled = false;
      commitBtn.textContent = '✅ この内容で登録';
    }
  }

  // ============================================================================
  // 履歴一覧モーダル
  // ============================================================================
  async function openTokiAiHistoryModal(caseId) {
    if (!caseId) { showToast('案件が選択されていません', 'error'); return; }
    try {
      const { data: ownerImports } = await db.from('landowner_imports')
        .select('*').eq('case_id', caseId).order('decided_at', { ascending: false });
      const { data: landImports } = await db.from('land_info_imports')
        .select('*').eq('case_id', caseId).order('decided_at', { ascending: false });

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal toki-ai-modal">
          <div class="modal-header">
            <div>
              <div class="modal-title">📜 AI転記履歴</div>
              <div class="modal-subtitle">この案件のAI転記操作一覧（個別ロールバック可能）</div>
            </div>
            <button class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('open');setTimeout(()=>this.closest('.modal-overlay').remove(),250)">✕</button>
          </div>
          <div class="modal-body">
            ${renderHistoryList('landowner_imports', ownerImports || [])}
            ${renderHistoryList('land_info_imports', landImports || [])}
            ${(!ownerImports?.length && !landImports?.length) ? '<div style="color:var(--text-muted);font-size:13px;padding:24px 0;text-align:center">📭 履歴がありません</div>' : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').classList.remove('open');setTimeout(()=>this.closest('.modal-overlay').remove(),250)">閉じる</button>
          </div>
        </div>
      `;
      openModalEl(overlay);
      bindHistoryEvents(overlay, caseId);
    } catch (e) {
      showToast('履歴取得失敗: ' + (e.message || e), 'error');
      console.error(e);
    }
  }

  function renderHistoryList(tableName, rows) {
    if (!rows.length) return '';
    const isLandowner = tableName === 'landowner_imports';
    const title = isLandowner ? '👥 地権者情報の転記履歴' : '📐 土地情報の転記履歴';
    return `
      <div class="toki-ai-section">
        <div class="toki-ai-section-title"><span>${title}</span><span class="toki-ai-badge toki-ai-badge-info">${rows.length}件</span></div>
        ${rows.map(r => renderHistoryItem(tableName, r)).join('')}
      </div>
    `;
  }

  function renderHistoryItem(tableName, r) {
    const rolledBack = r.action === 'rollback';
    const cls = `toki-ai-history-action ${r.action}`;
    let detail = '';
    if (tableName === 'landowner_imports') {
      detail = `${escapeHtml(r.ai_extracted_name || '(memo)')} ${r.ai_is_primary_owner ? '[筆頭]' : ''} ${escapeHtml((r.ai_extracted_address || '').substring(0, 40))}${(r.ai_extracted_address || '').length > 40 ? '...' : ''}`;
      if (r.ai_extracted_memo) detail += ` ／ memo: ${escapeHtml((r.ai_extracted_memo || '').substring(0, 40))}...`;
    } else {
      detail = `所在: ${escapeHtml(r.ai_extracted_location || '')} 地番: ${escapeHtml(r.ai_extracted_chiban || '')} 地目: ${escapeHtml(r.ai_extracted_chimoku || '')} 地積: ${r.ai_extracted_area_sqm || ''}`;
    }
    const canRollback = !rolledBack && (r.action === 'insert' || r.action === 'update');
    return `
      <div class="toki-ai-history-item ${rolledBack ? 'rolled-back' : ''}">
        <div class="toki-ai-history-date">${formatDateJp(r.decided_at)}</div>
        <div class="${cls}">${r.action.toUpperCase()}</div>
        <div class="toki-ai-history-detail">${detail}</div>
        <div>
          ${canRollback ? `<button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;color:#ef4444;border-color:#ef4444;" data-rollback-table="${tableName}" data-rollback-id="${r.id}">↺ 取消</button>` : ''}
        </div>
      </div>
    `;
  }

  function bindHistoryEvents(overlay, caseId) {
    overlay.querySelectorAll('[data-rollback-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('このAI転記を取り消します。\n\nDBの値は転記前の状態に復元され、履歴には rollback として記録されます。\nよろしいですか？')) return;
        const tableName = btn.dataset.rollbackTable;
        const importId = btn.dataset.rollbackId;
        btn.disabled = true;
        btn.textContent = '取消中...';
        try {
          await rollbackImport(tableName, importId);
          showToast('ロールバック完了', 'success');
          // モーダル再読込
          overlay.classList.remove('open');
          setTimeout(() => overlay.remove(), 250);
          openTokiAiHistoryModal(caseId);
          if (typeof loadDocuments === 'function') loadDocuments(caseId);
        } catch (e) {
          showToast('ロールバック失敗: ' + (e.message || e), 'error');
          btn.disabled = false;
          btn.textContent = '↺ 取消';
        }
      });
    });
  }

  // ============================================================================
  // ロールバック実行
  // ============================================================================
  async function rollbackImport(tableName, importId) {
    const { data: imp, error: e1 } = await db.from(tableName).select('*').eq('id', importId).single();
    if (e1 || !imp) throw new Error('履歴取得失敗: ' + (e1?.message || 'not found'));

    if (tableName === 'landowner_imports') {
      if (imp.action === 'insert' && imp.landowner_id) {
        // INSERTの取消 = レコード削除
        const { error } = await db.from('landowner_info').delete().eq('id', imp.landowner_id);
        if (error) throw new Error('landowner_info DELETE: ' + error.message);
      } else if (imp.action === 'update' && imp.landowner_id) {
        // UPDATEの取消 = prev_* で復元
        const restore = {};
        if (imp.prev_name !== undefined) restore.name = imp.prev_name;
        if (imp.prev_address !== undefined) restore.address = imp.prev_address;
        if (imp.prev_memo !== undefined) restore.memo = imp.prev_memo;
        if (Object.keys(restore).length > 0) {
          const { error } = await db.from('landowner_info').update(restore).eq('id', imp.landowner_id);
          if (error) throw new Error('landowner_info 復元: ' + error.message);
        }
      }
    } else if (tableName === 'land_info_imports') {
      if (imp.action === 'insert' && imp.land_info_id) {
        const { error } = await db.from('land_info').delete().eq('id', imp.land_info_id);
        if (error) throw new Error('land_info DELETE: ' + error.message);
      } else if (imp.action === 'update' && imp.land_info_id) {
        const restore = {};
        if (imp.prev_location !== undefined) restore.location = imp.prev_location;
        if (imp.prev_chiban !== undefined) restore.chiban = imp.prev_chiban;
        if (imp.prev_chimoku !== undefined) restore.chimoku = imp.prev_chimoku;
        if (imp.prev_area_sqm !== undefined) restore.area_sqm = imp.prev_area_sqm;
        if (Object.keys(restore).length > 0) {
          const { error } = await db.from('land_info').update(restore).eq('id', imp.land_info_id);
          if (error) throw new Error('land_info 復元: ' + error.message);
        }
      }
    }

    // 元レコードの action を 'rollback' に更新（取消済みフラグ）
    await db.from(tableName).update({ action: 'rollback' }).eq('id', importId);
  }

  // ============================================================================
  // グローバル公開
  // ============================================================================
  window.openTokiAiModal = openTokiAiModal;
  window.openTokiAiHistoryModal = openTokiAiHistoryModal;
})();
