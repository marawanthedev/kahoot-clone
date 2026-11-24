import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, randomInt } from "node:crypto";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";
import { questions as ALL_QUESTIONS, settings as BASE_SETTINGS } from "./questions.mjs";

// Env overrides exist so the game can be tested quickly: READ_SECONDS, ANSWER_SECONDS, QUESTIONS
const questions = ALL_QUESTIONS.slice(0, Number(process.env.QUESTIONS ?? ALL_QUESTIONS.length));
const settings = { ...BASE_SETTINGS, readSeconds: Number(process.env.READ_SECONDS ?? BASE_SETTINGS.readSeconds), answerSeconds: Number(process.env.ANSWER_SECONDS ?? BASE_SETTINGS.answerSeconds) };

const here = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const HOST_KEY = process.env.HOST_KEY ?? randomBytes(6).toString("hex");
const PIN = process.env.PIN ?? String(randomInt(100000, 999999));
const lanIp = () => Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? "localhost";
const BASE = (process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://${lanIp()}:${PORT}`).replace(/\/$/, "");
const HOSTED = !!(process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL);
const JOIN_URL = `${BASE}/?pin=${PIN}`;

const READ_MS = settings.readSeconds * 1000;
const ANSWER_MS = settings.answerSeconds * 1000;

// ---------------------------------------------------------------- game state
const game = { phase: "lobby", qIndex: -1, openedAt: 0, endsAt: 0, timer: null, players: new Map(), host: new Set() };

const ranking = () =>
  [...game.players.values()].sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.name.localeCompare(b.name)).map((p, i) => ({ p, rank: i + 1 }));
const connected = () => [...game.players.values()].filter((p) => p.ws && p.ws.readyState === 1);
const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
const q = () => questions[game.qIndex];

function counts() {
  const c = [0, 0, 0, 0];
  for (const p of game.players.values()) if (p.answer && p.answer.qIndex === game.qIndex) c[p.answer.choice]++;
  return c;
}
const answeredCount = () => [...game.players.values()].filter((p) => p.answer?.qIndex === game.qIndex).length;

function publicQuestion(withOptions) {
  return { index: game.qIndex, total: questions.length, text: q().q, options: withOptions ? q().options : null };
}

function hostState() {
  const base = { type: "state", phase: game.phase, pin: PIN, joinUrl: JOIN_URL, settings: { title: settings.title, answerSeconds: settings.answerSeconds, prizes: settings.prizes }, serverTime: Date.now(), players: [...game.players.values()].map((p) => ({ id: p.id, name: p.name, connected: !!p.ws && p.ws.readyState === 1, score: p.score })), playerCount: game.players.size };
  if (game.phase === "ready" || game.phase === "question" || game.phase === "reveal") base.question = publicQuestion(game.phase !== "ready");
  if (game.phase === "ready" || game.phase === "question") base.endsAt = game.endsAt;
  if (game.phase === "question") Object.assign(base, { answered: answeredCount(), expected: connected().length });
  if (game.phase === "reveal") Object.assign(base, { correct: q().answer, counts: counts(), answered: answeredCount() });
  if (game.phase === "leaderboard" || game.phase === "final") {
    const r = ranking();
    base.board = r.slice(0, game.phase === "final" ? 10 : 5).map(({ p, rank }) => ({ name: p.name, score: p.score, rank, prevRank: p.prevRank ?? rank, gained: p.gained ?? 0 }));
    base.isLast = game.qIndex >= questions.length - 1;
    base.questionNumber = game.qIndex + 1;
    base.questionTotal = questions.length;
  }
  if (game.phase === "final") base.podium = r3();
  return base;
}
function r3() {
  return ranking().slice(0, 3).map(({ p, rank }) => ({ name: p.name, score: p.score, rank, prize: settings.prizes[rank - 1] ?? 0 }));
}

function playerState(p) {
  const base = { type: "state", phase: game.phase, name: p.name, score: p.score, serverTime: Date.now() };
  if (game.phase === "ready" || game.phase === "question") {
    base.endsAt = game.endsAt;
    base.limit = ANSWER_MS;
    base.question = publicQuestion(game.phase === "question");
    base.answered = p.answer?.qIndex === game.qIndex ? p.answer.choice : null;
  }
  if (game.phase === "reveal" || game.phase === "leaderboard") base.result = p.last ?? null;
  if (game.phase === "reveal") base.correct = q().answer;
  if (game.phase === "leaderboard" || game.phase === "final") {
    const me = ranking().find((r) => r.p === p);
    base.rank = me?.rank ?? null;
    base.of = game.players.size;
    base.prize = game.phase === "final" ? settings.prizes[(me?.rank ?? 99) - 1] ?? 0 : 0;
  }
  return base;
}

function broadcast() {
  game.host.forEach((ws) => send(ws, hostState()));
  game.players.forEach((p) => send(p.ws, playerState(p)));
}

const clear = () => { clearTimeout(game.timer); game.timer = null; };

function startQuestion() {
  clear();
  game.qIndex++;
  game.players.forEach((p) => { p.last = null; });
  game.phase = "ready";
  game.endsAt = Date.now() + READ_MS;
  broadcast();
  game.timer = setTimeout(openAnswers, READ_MS);
}
function openAnswers() {
  clear();
  game.phase = "question";
  game.openedAt = Date.now();
  game.endsAt = game.openedAt + ANSWER_MS;
  broadcast();
  game.timer = setTimeout(reveal, ANSWER_MS);
}
function reveal() {
  if (game.phase !== "question") return;
  clear();
  const before = new Map(ranking().map(({ p, rank }) => [p.id, rank]));
  for (const p of game.players.values()) {
    const a = p.answer?.qIndex === game.qIndex ? p.answer : null;
    const correct = !!a && a.choice === q().answer;
    const points = correct ? Math.round(settings.maxPoints * (1 - a.ms / ANSWER_MS / 2)) : 0;
    p.score += points;
    if (correct) p.totalTime += a.ms;
    p.streak = correct ? p.streak + 1 : 0;
    p.gained = points;
    p.prevRank = before.get(p.id);
    p.last = { answered: !!a, correct, points, streak: p.streak };
  }
  game.phase = "reveal";
  broadcast();
}
function leaderboard() {
  clear();
  game.phase = "leaderboard";
  broadcast();
}
function finish() {
  clear();
  game.phase = "final";
  broadcast();
}
function next() {
  if (game.phase === "lobby") return game.players.size && startQuestion();
  if (game.phase === "question") return reveal();
  if (game.phase === "reveal") return leaderboard();
  if (game.phase === "leaderboard") return game.qIndex >= questions.length - 1 ? finish() : startQuestion();
}
function reset() {
  clear();
  game.phase = "lobby";
  game.qIndex = -1;
  game.players.forEach((p) => Object.assign(p, { score: 0, totalTime: 0, streak: 0, answer: null, last: null, gained: 0, prevRank: undefined }));
  broadcast();
}

// ---------------------------------------------------------------- http
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/qr.svg") {
      const svg = await QRCode.toString(url.searchParams.get("text") === "join" || !url.searchParams.get("text") ? JOIN_URL : url.searchParams.get("text"), { type: "svg", margin: 1, color: { dark: "#0f1226", light: "#ffffff" } });
      res.writeHead(200, { "content-type": TYPES[".svg"], "cache-control": "no-store" });
      return res.end(svg);
    }
    const route = url.pathname === "/" ? "/play.html" : url.pathname === "/host" ? "/host.html" : url.pathname;
    const file = join(here, "public", normalize(route).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(join(here, "public"))) throw new Error("bad path");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 2048 });
const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().replace(/\s+/g, " ").slice(0, 16);

wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => { ws.alive = true; });
  let role = null, player = null;

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === "host") {
      if (m.key !== HOST_KEY) return send(ws, { type: "error", message: "Wrong host key" });
      role = "host"; game.host.add(ws);
      return send(ws, hostState());
    }
    if (role === "host") {
      if (m.type === "next") next();
      else if (m.type === "reset") reset();
      else if (m.type === "kick") {
        const p = game.players.get(m.playerId);
        if (p) { send(p.ws, { type: "kicked" }); p.ws?.close(); game.players.delete(p.id); broadcast(); }
      }
      return;
    }
    if (m.type === "join") {
      if (String(m.pin) !== PIN) return send(ws, { type: "error", message: "Wrong game PIN" });
      const existing = m.playerId && game.players.get(m.playerId);
      if (existing) {
        existing.ws = ws; player = existing; role = "player";
        send(ws, { type: "joined", playerId: existing.id, name: existing.name });
        send(ws, playerState(existing)); broadcast(); return;
      }
      const name = cleanName(m.name);
      if (!name) return send(ws, { type: "error", message: "Enter a nickname" });
      if ([...game.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) return send(ws, { type: "error", message: "That nickname is taken" });
      player = { id: randomBytes(8).toString("hex"), name, score: 0, totalTime: 0, streak: 0, answer: null, last: null, gained: 0, ws };
      role = "player";
      game.players.set(player.id, player);
      send(ws, { type: "joined", playerId: player.id, name });
      return broadcast();
    }
    if (role === "player" && m.type === "answer") {
      const now = Date.now();
      const choice = Number(m.choice);
      if (game.phase !== "question" || now > game.endsAt + 250 || !Number.isInteger(choice) || choice < 0 || choice > 3) return;
      if (player.answer?.qIndex === game.qIndex) return;
      player.answer = { qIndex: game.qIndex, choice, ms: Math.min(Math.max(now - game.openedAt, 0), ANSWER_MS) };
      send(ws, playerState(player));
      game.host.forEach((h) => send(h, hostState()));
      if (answeredCount() >= connected().length) reveal();
    }
  });

  ws.on("close", () => {
    game.host.delete(ws);
    if (player && player.ws === ws) { player.ws = null; broadcast(); }
  });
});

setInterval(() => wss.clients.forEach((ws) => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 25000);

server.listen(PORT, () => {
  console.log(`\n  ${settings.title}\n`);
  console.log(`  Host screen (open this on the projector):\n    ${HOSTED ? BASE : `http://localhost:${PORT}`}/host?key=${HOST_KEY}\n`);
  console.log(`  Players join at: ${BASE}\n  Game PIN: ${PIN}\n  ${questions.length} questions, ${settings.answerSeconds}s each\n`);
});
