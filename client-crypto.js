// ============================================================================
// client-crypto.js — 方式F（運用者ブラインド）E2E暗号モジュール
//   クライアント入力(地権者情報等)を「クライアントのブラウザ内でのみ」暗号化/復号する。
//   鍵はサーバに送らない。共有DBには暗号文だけが届く。運用者(service_role)は復号できない。
//
//   鍵構造(エンベロープ暗号):
//     DEK  = データ暗号鍵(AES-GCM 256)。実データ(ノート)を暗号化する鍵。ランダム生成。
//     KEK  = 鍵暗号鍵。パスワード(または復旧コード)から PBKDF2 で導出。DEKをラップ(暗号化)する。
//     サーバに保存するのは「KEKでラップされたDEK(=暗号文)」＋salt のみ。平文のDEK/KEK/パスワードは保存しない。
//   → パスワードを知る本人だけがDEKを復元でき、DEKでノートを復号できる。運用者は鍵が無いので不可。
// ============================================================================
window.ClientCrypto = (function(){
  var enc=new TextEncoder(), dec=new TextDecoder();
  var PBKDF2_ITER=250000;

  function b64(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
  function unb64(str){var s=atob(str),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
  function randBytes(n){return crypto.getRandomValues(new Uint8Array(n));}
  function newSalt(){return b64(randBytes(16));}

  // パスワード/復旧コード → KEK(AES-GCM鍵)。saltは平文で保存可(非機密)。
  async function deriveKEK(secret, saltB64){
    var base=await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2', salt:unb64(saltB64), iterations:PBKDF2_ITER, hash:'SHA-256'},
      base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }
  async function genDEK(){ return crypto.subtle.generateKey({name:'AES-GCM',length:256}, true, ['encrypt','decrypt']); }

  // DEKをKEKで包む/開く（rawをAES-GCMで暗号化する方式。wrapKey/unwrapKeyの実装差を避け明示的に行う）
  async function wrapDEK(dek, kek){
    var raw=await crypto.subtle.exportKey('raw', dek);
    var iv=randBytes(12);
    var wrapped=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv}, kek, raw);
    return {iv:b64(iv), data:b64(wrapped)};
  }
  async function unwrapDEK(wrapObj, kek){
    var raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(wrapObj.iv)}, kek, unb64(wrapObj.data)); // 誤鍵なら例外
    // extractable=true: パスワード変更(再ラップ)のためにexportKey可能にする。DEKはブラウザ内メモリのみ・サーバには出さない。
    return crypto.subtle.importKey('raw', raw, {name:'AES-GCM',length:256}, true, ['encrypt','decrypt']);
  }

  // ノート(平文文字列/JSON) の暗号化・復号（DEK使用）
  async function encryptNote(dek, plaintext){
    var iv=randBytes(12);
    var ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv}, dek, enc.encode(plaintext));
    return {iv:b64(iv), ciphertext:b64(ct)};
  }
  async function decryptNote(dek, ciphertextB64, ivB64){
    var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(ivB64)}, dek, unb64(ciphertextB64));
    return dec.decode(pt);
  }

  // 復旧コード（人が控える用・base32風・25文字）
  function genRecoveryCode(){
    var A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes=randBytes(20), s='';
    for(var i=0;i<bytes.length;i++) s+=A[bytes[i]%32];
    return s.replace(/(.{5})/g,'$1-').replace(/-$/,'');
  }

  // 初回セットアップ: DEK生成→パスワード鍵と復旧コード鍵の両方で包む。
  //   戻り: {record: {kdf_salt, rec_salt, wrapped_dek_pw, wrapped_dek_recovery}, dek, recoveryCode}
  //   record を client_crypto に保存。recoveryCode は本人に1回だけ表示。dek はメモリ保持。
  async function setup(password){
    var kdf_salt=newSalt(), rec_salt=newSalt();
    var dek=await genDEK();
    var recoveryCode=genRecoveryCode();
    var kekPw=await deriveKEK(password, kdf_salt);
    var kekRec=await deriveKEK(recoveryCode, rec_salt);
    var wrapped_dek_pw=await wrapDEK(dek, kekPw);
    var wrapped_dek_recovery=await wrapDEK(dek, kekRec);
    return {record:{kdf_salt:kdf_salt, rec_salt:rec_salt, wrapped_dek_pw:wrapped_dek_pw, wrapped_dek_recovery:wrapped_dek_recovery}, dek:dek, recoveryCode:recoveryCode};
  }
  // ログイン解錠: 保存recordとパスワードからDEKを復元（誤パスワードは例外）
  async function unlockWithPassword(record, password){
    var kek=await deriveKEK(password, record.kdf_salt);
    return unwrapDEK(record.wrapped_dek_pw, kek);
  }
  // 復旧: 復旧コードからDEKを復元
  async function unlockWithRecovery(record, recoveryCode){
    var kek=await deriveKEK(recoveryCode, record.rec_salt);
    return unwrapDEK(record.wrapped_dek_recovery, kek);
  }
  // パスワード変更/再設定: 既存DEKを新パスワードで包み直す（復旧コードは維持）
  async function rewrapPassword(dek, newPassword){
    var kdf_salt=newSalt();
    var kek=await deriveKEK(newPassword, kdf_salt);
    var wrapped_dek_pw=await wrapDEK(dek, kek);
    return {kdf_salt:kdf_salt, wrapped_dek_pw:wrapped_dek_pw};
  }

  return {
    setup:setup, unlockWithPassword:unlockWithPassword, unlockWithRecovery:unlockWithRecovery,
    rewrapPassword:rewrapPassword, encryptNote:encryptNote, decryptNote:decryptNote,
    genRecoveryCode:genRecoveryCode, _b64:b64, _unb64:unb64, PBKDF2_ITER:PBKDF2_ITER
  };
})();
