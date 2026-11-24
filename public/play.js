(function () {
  var SHAPES = ["▲", "◆", "●", "■"];
  var stage = document.getElementById("stage");
  var params = new URLSearchParams(location.search);
  var pin = params.get("pin") || "";
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
  var ws, me = { id: store.get("quiz.id"), name: store.get("quiz.name") || "", pin: pin || store.get("quiz.pin") || "" };
  var offset = 0, viewKey = "", joined = false, wantJoin = false, errMsg = "";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  function view(html, cls) { stage.innerHTML = '<div class="view ' + (cls || "") + '">' + html + "</div>"; }

  function connect() {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    ws.onopen = function () { if (me.id && me.pin) sendJoin(); else showJoin(); };
    ws.onmessage = function (e) { var m = JSON.parse(e.data); handlers[m.type] && handlers[m.type](m); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }
  function sendJoin() { ws.send(JSON.stringify({ type: "join", name: me.name, pin: me.pin, playerId: me.id })); }

  var handlers = {
    joined: function (m) { joined = true; me.id = m.playerId; me.name = m.name; store.set("quiz.id", me.id); store.set("quiz.name", me.name); store.set("quiz.pin", me.pin); },
    error: function (m) {
      if (joined) return;
      if (me.id && /PIN/.test(m.message)) { me.id = null; store.del("quiz.id"); }
      errMsg = m.message; showJoin();
    },
    kicked: function () { joined = false; me.id = null; store.del("quiz.id"); errMsg = "You were removed from the game"; showJoin(); },
    state: onState,
  };

  function showJoin() {
    viewKey = "join";
    view('<h1>Mini Shop Quiz</h1><div class="card">' + (pin ? "" : '<input id="pin" inputmode="numeric" placeholder="Game PIN" value="' + esc(me.pin) + '">') + '<input id="nick" maxlength="16" autocomplete="off" placeholder="Nickname" value="' + esc(me.name) + '"><p class="err" id="err">' + esc(errMsg) + '</p><button class="btn" id="go" type="button">Join</button></div>');
    var go = function () {
      me.name = document.getElementById("nick").value; if (document.getElementById("pin")) me.pin = document.getElementById("pin").value.trim();
      errMsg = ""; me.id = null; sendJoin();
    };
    document.getElementById("go").onclick = go;
    document.getElementById("nick").onkeydown = function (e) { if (e.key === "Enter") go(); };
  }

  // ---------------------------------------------------------------- state
  function onState(s) {
    offset = s.serverTime - Date.now();
    var k = s.phase + ":" + (s.question ? s.question.index : "") + ":" + (s.answered != null ? "a" : "");
    if (k === viewKey) return; viewKey = k;
    var fn = { lobby: lobby, ready: ready, question: question, reveal: reveal, leaderboard: board, final: final }[s.phase];
    fn(s);
  }
  function lobby(s) { view("<h1>You're in!</h1><p>See your name on the big screen.</p><h1 style=\"margin-top:3vh\">" + esc(s.name) + "</h1>"); }
  function ready(s) { buzz(60); view('<p>Question ' + (s.question.index + 1) + ' of ' + s.question.total + '</p><h1>Get ready…</h1><p class="pq">' + esc(s.question.text) + "</p>"); }
  function question(s) {
    if (s.answered != null) return locked(s);
    var total = Math.max(0, s.endsAt - (Date.now() + offset));
    view('<div class="tbar"><i id="bar"></i></div><p class="pq">' + esc(s.question.text) + '</p><div class="pgrid">' + s.question.options.map(function (o, i) { return '<button class="pbtn o' + i + '" data-i="' + i + '"><span class="shape">' + SHAPES[i] + "</span>" + esc(o) + "</button>"; }).join("") + "</div>");
    var bar = document.getElementById("bar"); bar.style.transition = "none"; bar.style.transform = "scaleX(" + total / s.limit + ")";
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.transition = "transform " + total + "ms linear"; bar.style.transform = "scaleX(0)"; }); });
    stage.onclick = function (e) {
      var b = e.target.closest(".pbtn"); if (!b) return;
      buzz(40); ws.send(JSON.stringify({ type: "answer", choice: Number(b.dataset.i) }));
      stage.onclick = null; viewKey = "locked"; locked({ answered: Number(b.dataset.i) });
    };
  }
  function locked(s) { stage.onclick = null; view('<h1>Locked in!</h1><div class="pbtn o' + s.answered + '" style="width:40vw;max-width:220px;height:40vw;max-height:220px;margin:2vh auto"><span class="shape">' + SHAPES[s.answered] + '</span></div><p>Waiting for the others…</p>'); viewKey = "question:" + (s.question ? s.question.index : "") + ":a"; }
  function reveal(s) {
    stage.onclick = null; var r = s.result;
    if (!r || !r.answered) { buzz(100); return view('<div class="result none"><h1>Time\'s up</h1><p style="color:#fff">You did not answer in time</p></div>'); }
    if (r.correct) { buzz([60, 40, 60]); view('<div class="result good"><h1>Correct!</h1><div class="points">+' + fmt(r.points) + '</div>' + (r.streak > 1 ? '<p style="color:#fff">🔥 ' + r.streak + ' in a row</p>' : "") + '<p style="color:#fff">' + fmt(s.score) + " points</p></div>"); }
    else { buzz(250); view('<div class="result bad"><h1>Not quite</h1><div class="points">+0</div><p style="color:#fff">' + fmt(s.score) + " points</p></div>"); }
  }
  function board(s) { view('<p>You are</p><div class="rank">#' + s.rank + '</div><p>of ' + s.of + '</p><h1 style="margin-top:2vh">' + fmt(s.score) + " pts</h1>" + (s.rank === 1 ? "<p>🥇 You lead!</p>" : "")); }
  function final(s) {
    var medal = { 1: "🥇", 2: "🥈", 3: "🥉" }[s.rank] || "";
    view("<p>Final result</p><div class=\"rank\">" + medal + " #" + s.rank + "</div><p>of " + s.of + "</p><h1 style=\"margin-top:2vh\">" + fmt(s.score) + " pts</h1>" + (s.prize ? '<div class="prize">You won ' + s.prize + " mentoring session" + (s.prize > 1 ? "s" : "") + "!</div><p>Find Marwan to claim it</p>" : "<p>Thanks for playing!</p>"));
    if (s.prize) { buzz([100, 50, 100, 50, 300]); confetti(document.getElementById("confetti"), 8000); }
  }

  connect();
})();
