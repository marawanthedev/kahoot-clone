(function () {
  var SHAPES = ["▲", "◆", "●", "■"];
  var stage = document.getElementById("stage"), nextBtn = document.getElementById("next"), hint = document.getElementById("hint");
  var key = new URLSearchParams(location.search).get("key") || (function () { try { return localStorage.getItem("hostKey"); } catch (e) { return null; } })();
  if (key) try { localStorage.setItem("hostKey", key); } catch (e) {}
  var connected = false, ws, st = null, offset = 0, viewKey = "", lastBoard = "", timers = [];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function now() { return Date.now() + offset; }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  function connect() {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    ws.onopen = function () { ws.send(JSON.stringify({ type: "host", key: key })); };
    ws.onmessage = function (e) {
      var m = JSON.parse(e.data);
      if (m.type === "state") { connected = true; onState(m); }
      else if (m.type === "error") {
        connected = false; try { localStorage.removeItem("hostKey"); } catch (err) {}
        stage.innerHTML = '<div class="view"><h1>Host screen not connected</h1><p class="error">' + esc(m.message) + '</p><p>The key changes every time the server starts.<br>Copy the <b>Host screen</b> link from the terminal where you ran <b>npm start</b> and open it here.</p></div>';
        hint.textContent = "Not connected to the quiz server";
      }
    };
    ws.onclose = function () { if (connected) { hint.textContent = "Connection lost. Reconnecting…"; } connected = false; setTimeout(connect, 1000); };
  }
  function act(type, extra) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(Object.assign({ type: type }, extra || {}))); }

  // ------------------------------------------------------------ routing
  function onState(s) {
    offset = s.serverTime - Date.now();
    var prev = st; st = s;
    var k = s.phase + ":" + (s.question ? s.question.index : "");
    var fresh = k !== viewKey; viewKey = k;
    updateControls();
    if (s.phase === "lobby") return fresh ? renderLobby(prev) : updateLobby(prev);
    if (!fresh) return s.phase === "question" ? updateAnswered() : undefined;
    clearTimers();
    ({ ready: renderReady, question: renderQuestion, reveal: renderReveal, leaderboard: renderBoard, final: renderFinal })[s.phase](s);
  }
  function updateControls() {
    var p = st.phase;
    nextBtn.textContent = { lobby: "Start ▶", ready: "…", question: "Skip ▶", reveal: "Scores ▶", leaderboard: st.isLast ? "Podium 🏆" : "Next question ▶", final: "Play again ↺" }[p];
    nextBtn.disabled = (p === "lobby" && !st.playerCount) || p === "ready";
    hint.textContent = p === "lobby" ? (st.playerCount ? "Space = start · click a name to remove it" : "Start unlocks when the first player joins") : "Space = continue · M = mute";
    document.getElementById("reset").classList.toggle("hidden", p === "lobby");
  }

  // ------------------------------------------------------------ lobby
  function renderLobby(prev) {
    clearTimers(); lastBoard = "";
    stage.innerHTML = '<div class="view"><div class="lobby"><div class="joinbox"><img alt="QR code to join" src="/qr.svg?text=join&t=' + Date.now() + '"><div class="url">' + esc(st.joinUrl.replace(/\?pin=.*/, "").replace(/^https?:\/\//, "")) + '</div><div class="pin"><small>GAME PIN</small>' + esc(st.pin) + '</div></div>' +
      '<div class="lobby-right"><h1>' + esc(st.settings.title) + '</h1><div class="count" id="lcount"></div><div class="chips" id="chips"></div></div></div></div>';
    updateLobby(null);
  }
  function updateLobby(prev) {
    var chips = document.getElementById("chips"); if (!chips) return;
    var known = {}; Array.prototype.forEach.call(chips.children, function (c) { known[c.dataset.id] = c; });
    st.players.forEach(function (p) {
      var el = known[p.id];
      if (!el) { el = document.createElement("div"); el.className = "chip"; el.dataset.id = p.id; el.onclick = function () { act("kick", { playerId: p.id }); }; chips.appendChild(el); if (prev) sfx.join(); }
      el.textContent = p.name; el.classList.toggle("off", !p.connected); delete known[p.id];
    });
    Object.keys(known).forEach(function (id) { known[id].remove(); });
    document.getElementById("lcount").textContent = st.playerCount ? st.playerCount + (st.playerCount === 1 ? " player is" : " players are") + " in. Waiting for the host…" : "Scan the QR code with your phone to join";
  }

  // ------------------------------------------------------------ question flow
  var raf = 0;
  function countdown(onTick) {
    cancelAnimationFrame(raf); var lastSec = -1;
    (function loop() {
      var left = Math.max(0, st.endsAt - now()), sec = Math.ceil(left / 1000);
      if (sec !== lastSec) { lastSec = sec; onTick(sec, left); }
      onTick.frame && onTick.frame(left);
      if (left > 0 && (st.phase === "ready" || st.phase === "question")) raf = requestAnimationFrame(loop);
    })();
  }
  function renderReady(s) {
    sfx.whoosh();
    stage.innerHTML = '<div class="view"><div class="qmeta">Question ' + (s.question.index + 1) + ' of ' + s.question.total + '</div><p class="qtext">' + esc(s.question.text) + '</p><div class="big-count" id="bc"></div></div>';
    countdown(function (sec) { var el = document.getElementById("bc"); if (el) el.textContent = sec; });
  }
  function renderQuestion(s) {
    sfx.start();
    var total = s.settings.answerSeconds, C = 2 * Math.PI * 44;
    stage.innerHTML = '<div class="view qview"><div class="topbar"><div class="answered"><b id="ans">0</b>answers</div><p class="qtext">' + esc(s.question.text) + '</p><div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" id="fg" cx="50" cy="50" r="44" stroke-dasharray="' + C + '"/></svg><b id="secs">' + total + '</b></div></div>' +
      '<div class="opts">' + s.question.options.map(function (o, i) { return '<div class="opt o' + i + '" style="animation-delay:' + i * 90 + 'ms"><span class="shape">' + SHAPES[i] + '</span><span>' + esc(o) + '</span></div>'; }).join("") + '</div></div>';
    updateAnswered();
    var tick = function (sec) { var e = document.getElementById("secs"); if (!e) return; e.textContent = sec; var urgent = sec <= 5 && sec > 0; document.getElementById("ring").classList.toggle("urgent", urgent); if (urgent) sfx.tick(sec <= 3); };
    tick.frame = function (left) { var fg = document.getElementById("fg"); if (fg) fg.style.strokeDashoffset = C * (1 - left / (total * 1000)); };
    countdown(tick);
  }
  function updateAnswered() { var a = document.getElementById("ans"); if (a) a.textContent = st.answered + (st.expected ? "/" + st.expected : ""); }
  function renderReveal(s) {
    cancelAnimationFrame(raf); sfx.timeUp();
    var max = Math.max.apply(null, s.counts.concat([1]));
    stage.innerHTML = '<div class="view qview reveal"><div class="topbar"><div class="answered"><b>' + s.answered + '</b>answered</div><p class="qtext">' + esc(s.question.text) + '</p><div style="width:14vh"></div></div>' +
      '<div class="opts">' + s.question.options.map(function (o, i) { return '<div class="opt o' + i + ' ' + (i === s.correct ? "right" : "wrong") + '"><span class="shape">' + SHAPES[i] + '</span><span>' + esc(o) + '</span><span class="n">' + s.counts[i] + '</span></div>'; }).join("") + '</div></div>';
    later(sfx.correct, 250);
  }

  // ------------------------------------------------------------ leaderboard
  function renderBoard(s) {
    cancelAnimationFrame(raf); lastBoard = JSON.stringify(s.board);
    var H = 11, rows = s.board;
    stage.innerHTML = '<div class="view"><div class="qmeta">After question ' + s.questionNumber + ' of ' + s.questionTotal + '</div><h1>Leaderboard</h1><div class="lb" id="lb" style="height:' + rows.length * H + 'vh"></div></div>';
    var lb = document.getElementById("lb");
    rows.forEach(function (r) {
      var el = document.createElement("div"); el.className = "lbrow" + (r.rank === 1 ? " first" : "");
      el.innerHTML = '<span class="rk">' + r.rank + '</span><span class="nm">' + esc(r.name) + '</span><span class="gain">' + (r.gained ? "+" + fmt(r.gained) : "") + '</span><span class="sc">' + fmt(r.score) + '</span>';
      el.style.transition = "none"; el.style.transform = "translateY(" + (Math.min(r.prevRank, rows.length + 1) - 1) * H + "vh)";
      lb.appendChild(el);
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transition = ""; el.style.transform = "translateY(" + (r.rank - 1) * H + "vh)"; }); });
    });
    later(sfx.drum, 200);
  }

  // ------------------------------------------------------------ podium
  function renderFinal(s) {
    cancelAnimationFrame(raf); lastBoard = "";
    var by = {}; s.podium.forEach(function (p) { by[p.rank] = p; });
    function col(rank) {
      var p = by[rank]; if (!p) return '<div class="pcol"></div>';
      return '<div class="pcol p' + rank + '" id="p' + rank + '"><div class="pname">' + esc(p.name) + '</div>' + (p.prize ? '<div class="pprize">' + p.prize + ' mentoring session' + (p.prize > 1 ? "s" : "") + '</div>' : "") + '<div class="pscore">' + fmt(p.score) + ' pts</div><div class="pbar">' + rank + '</div></div>';
    }
    var others = s.board.filter(function (b) { return b.rank > 3; });
    stage.innerHTML = '<div class="view"><h1>🏆 Final results</h1><div class="podium">' + col(2) + col(1) + col(3) + '</div></div>' +
      (others.length ? '<div class="others">' + others.map(function (b) { return "<div>" + b.rank + ". " + esc(b.name) + " · " + fmt(b.score) + "</div>"; }).join("") + "</div>" : "");
    var reveal = function (rank, ms, snd) { later(function () { var e = document.getElementById("p" + rank); if (e) { e.classList.add("show"); snd(); } }, ms); };
    reveal(3, 800, sfx.drum); reveal(2, 2800, sfx.drum);
    later(function () { var e = document.getElementById("p1"); if (e) e.classList.add("show"); sfx.fanfare(); confetti(document.getElementById("confetti"), 9000); }, 5200);
  }

  // ------------------------------------------------------------ controls
  nextBtn.onclick = function () { sfx.unlock(); st && (st.phase === "final" ? act("reset") : act("next")); };
  document.getElementById("reset").onclick = function () { if (confirm("Reset the game and go back to the lobby? Scores are cleared.")) act("reset"); };
  document.getElementById("mute").onclick = function () { var m = sfx.toggle(); this.textContent = (m ? "🔇" : "🔊") + " M"; };
  addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!nextBtn.disabled) nextBtn.click(); }
    else if (e.key.toLowerCase() === "m") document.getElementById("mute").click();
  });
  if (!key) stage.innerHTML = '<div class="view"><h1>Host screen</h1><p class="error">Missing host key. Open the URL printed in the terminal.</p></div>'; else connect();
})();
