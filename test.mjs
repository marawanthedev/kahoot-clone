// End-to-end test: plays a full 3-question game with scripted players. Run: npm test
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { questions } from "./questions.mjs";

const PORT = 3917, PIN = "123456", KEY = "testkey", ANSWER = 3;
const server = spawn("node", ["server.mjs"], { env: { ...process.env, PORT, PIN, HOST_KEY: KEY, READ_SECONDS: "0.2", ANSWER_SECONDS: String(ANSWER), QUESTIONS: "3" }, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, fn) => { try { fn(); console.log("  ok   " + name); } catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message.split("\n")[0]); } };

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, last: null, msgs: [], send: (m) => ws.send(JSON.stringify(m)), open: new Promise((r) => ws.on("open", r)) };
  ws.on("message", (raw) => { const m = JSON.parse(raw); c.msgs.push(m); if (m.type === "state") c.last = m; });
  return c;
}
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error("timeout waiting for condition"); };

try {
  await waitFor(async () => true); await sleep(900);
  console.log("Joining");
  const host = client(); await host.open; host.send({ type: "host", key: KEY });
  const bad = client(); await bad.open; bad.send({ type: "host", key: "nope" });
  const wrongPin = client(); await wrongPin.open; wrongPin.send({ type: "join", name: "X", pin: "000000" });
  const players = {};
  for (const n of ["Ace", "Bea", "Cy", "Dee"]) { const c = client(); await c.open; c.send({ type: "join", name: n, pin: PIN }); players[n] = c; }
  const dup = client(); await dup.open; dup.send({ type: "join", name: "ace", pin: PIN });
  await waitFor(() => host.last?.playerCount === 4 && dup.msgs.length && wrongPin.msgs.length && bad.msgs.length);
  check("wrong host key is rejected", () => assert.match(bad.msgs.at(-1).message, /host key/));
  check("wrong PIN is rejected", () => assert.match(wrongPin.msgs.at(-1).message, /PIN/));
  check("duplicate nickname (any case) is rejected", () => assert.match(dup.msgs.at(-1).message, /taken/));
  check("4 players are in the lobby", () => assert.equal(host.last.playerCount, 4));
  check("players never receive the correct answer before the reveal", () => assert.equal(JSON.stringify(players.Ace.msgs).includes('"correct"'), false));

  // scripted behaviour: [who, delay ms, right/wrong/none per question]
  const plan = { Ace: { delay: 60, right: [1, 1, 1] }, Bea: { delay: 1500, right: [1, 1, 1] }, Cy: { delay: 200, right: [1, 0, 0] }, Dee: { delay: 0, right: [0, 0, 0], silent: true } };
  const answered = new Set();
  for (const [name, c] of Object.entries(players)) {
    c.ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.type !== "state" || m.phase !== "question" || m.answered != null) return;
      const key = name + m.question.index; if (answered.has(key) || plan[name].silent) return; answered.add(key);
      const right = questions[m.question.index].answer, wrong = (right + 1) % 4;
      setTimeout(() => c.send({ type: "answer", choice: plan[name].right[m.question.index] ? right : wrong }), plan[name].delay);
      if (name === "Ace") setTimeout(() => c.send({ type: "answer", choice: wrong }), plan[name].delay + 100); // second answer must be ignored
    });
  }

  console.log("Playing");
  host.send({ type: "next" });
  for (let q = 0; q < 3; q++) {
    await waitFor(() => host.last.phase === "reveal" && host.last.question.index === q, 9000);
    if (q === 0) {
      check("reveal shows the correct option and answer counts", () => { assert.equal(host.last.correct, questions[0].answer); assert.equal(host.last.counts.reduce((a, b) => a + b), 3); });
      const late = players.Dee; late.send({ type: "answer", choice: 0 }); await sleep(150);
      check("answers after the reveal are ignored", () => assert.equal(host.last.counts.reduce((a, b) => a + b), 3));
    }
    host.send({ type: "next" });
    await waitFor(() => host.last.phase === "leaderboard");
    if (q === 0) {
      const b = host.last.board;
      check("after Q1 Ace leads, then Cy/Bea by speed, Dee has 0", () => { assert.equal(b[0].name, "Ace"); assert.equal(b.at(-1).name, "Dee"); assert.equal(b.at(-1).score, 0); });
      check("fast answer scores near 1000", () => assert.ok(b[0].score >= 970 && b[0].score <= 1000, "Ace scored " + b[0].score));
      check("a slow answer scores less than a fast one, but at least 500", () => { const bea = b.find((x) => x.name === "Bea").score; assert.ok(bea < b[0].score && bea >= 500, "Bea scored " + bea); });
      check("a wrong or missing answer scores 0 and only correct answers score", () => assert.equal(b.filter((x) => x.score === 0).length, 1));
    }
    host.send({ type: "next" });
  }
  await waitFor(() => host.last.phase === "final");
  const pod = host.last.podium;
  check("podium is Ace, Bea, Cy", () => assert.deepEqual(pod.map((p) => p.name), ["Ace", "Bea", "Cy"]));
  check("prizes are 3, 2 and 1 sessions", () => assert.deepEqual(pod.map((p) => p.prize), [3, 2, 1]));
  check("scores are in descending order", () => assert.ok(pod[0].score > pod[1].score && pod[1].score > pod[2].score));
  await waitFor(() => players.Ace.last?.phase === "final");
  check("winner's phone says prize 3", () => assert.equal(players.Ace.last.prize, 3));
  check("last place gets no prize", () => assert.equal(players.Dee.last.prize, 0));

  console.log("Reconnect and kick");
  const id = players.Cy.msgs.find((m) => m.type === "joined").playerId;
  const back = client(); await back.open; back.send({ type: "join", name: "ignored", pin: PIN, playerId: id });
  await waitFor(() => back.last?.phase === "final");
  check("reconnecting with the saved id restores the same player and score", () => assert.equal(back.last.name, "Cy"));
  host.send({ type: "kick", playerId: id }); await waitFor(() => host.last.playerCount === 3);
  check("host can kick a player", () => assert.equal(host.last.playerCount, 3));
  host.send({ type: "reset" }); await waitFor(() => host.last.phase === "lobby");
  check("reset returns to the lobby with scores cleared", () => assert.ok(host.last.players.every((p) => p.score === 0)));
} catch (e) { failed++; console.log("  ERROR " + e.message); }
server.kill();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
