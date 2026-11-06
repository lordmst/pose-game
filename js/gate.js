// 접속 비밀번호: 게임 화면 위를 덮는 잠금 화면. 기기마다 한 번 맞히면 그 기기에서는 다시 묻지 않음
// 비밀번호는 그대로 적지 않고 바꾼 값(SHA-256)만 둠. 바꾸려면 아래 HASH를 새 값으로:
//   새 값 = SHA-256("posegame|" + 새 비밀번호)  (예: 터미널에서 printf '%s' 'posegame|새비번' | sha256sum)
// 화면에서 막는 것이라 파일을 직접 여는 사람까지 막지는 못함 (가족용 잠금)
(function () {
  var HASH = "a8e2ccbbe5d282b4ef75869596bbfa1e65b6c5ef2560c7e735724e80499689ce", KEY = "posegame.gate";
  try { if (localStorage.getItem(KEY) === HASH) return; } catch (e) {}
  var css = document.createElement("style");
  css.textContent =
    "#gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#ffcf5a,#f7a233 55%,#ef7d2d);font-family:Jua,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;padding:16px}" +
    "#gate .box{background:#fff;border-radius:28px;padding:32px 28px;width:min(420px,100%);text-align:center;box-shadow:0 12px 0 rgba(0,0,0,.18),0 20px 40px rgba(0,0,0,.25)}" +
    "#gate h1{font-size:34px;margin:0 0 6px;color:#3a2a1e}#gate p{margin:0 0 18px;font-size:18px;color:#6b5a4a}" +
    "#gate .row{display:flex;gap:8px}#gate input{flex:1;min-width:0;font-size:24px;padding:12px 14px;border:4px solid #3a2a1e;border-radius:16px;font-family:inherit;letter-spacing:.08em}" +
    "#gate .eye{border:4px solid #3a2a1e;border-radius:16px;background:#fff8e6;font-size:16px;padding:0 12px;font-family:inherit}" +
    "#gate .go{margin-top:14px;width:100%;font-size:24px;padding:14px;border:4px solid #3a2a1e;border-radius:18px;background:#2fb65a;color:#fff;font-family:inherit;box-shadow:0 6px 0 #1d7a3b}" +
    "#gate .msg{min-height:26px;margin-top:12px;font-size:18px;color:#d02020}" +
    "#gate .box.shake{animation:gshake .35s}@keyframes gshake{25%{transform:translateX(-10px)}50%{transform:translateX(10px)}75%{transform:translateX(-6px)}}";
  document.head.appendChild(css);
  var g = document.createElement("div"); g.id = "gate";
  g.innerHTML = '<form class="box" autocomplete="off"><h1>몸으로 놀기</h1><p>비밀번호를 넣어 주세요</p>' +
    '<div class="row"><input id="gatePw" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="비밀번호"><button type="button" class="eye">보기</button></div>' +
    '<button type="submit" class="go">들어가기</button><div class="msg" role="alert"></div></form>';
  function mount() { document.body.appendChild(g); var i = g.querySelector("input"); setTimeout(function () { i.focus(); }, 50); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  var form = g.querySelector("form"), inp = g.querySelector("input"), msg = g.querySelector(".msg"), eye = g.querySelector(".eye");
  eye.onclick = function () { var on = inp.type === "password"; inp.type = on ? "text" : "password"; eye.textContent = on ? "가리기" : "보기"; inp.focus(); };
  // 게임의 키 입력이 잠금 화면 입력을 가로채지 않게
  g.addEventListener("keydown", function (e) { e.stopPropagation(); });
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  form.onsubmit = function (e) {
    e.preventDefault();
    if (!window.crypto || !crypto.subtle) { msg.textContent = "이 주소에서는 비밀번호를 확인할 수 없어요 (https로 열어 주세요)"; return; }
    crypto.subtle.digest("SHA-256", new TextEncoder().encode("posegame|" + inp.value)).then(function (b) {
      if (hex(b) === HASH) { try { localStorage.setItem(KEY, HASH); } catch (e2) {} g.remove(); css.remove(); return; }
      msg.textContent = "비밀번호가 달라요"; inp.value = ""; inp.focus();
      var box = g.querySelector(".box"); box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
    });
  };
})();
