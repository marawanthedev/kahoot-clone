// Fill the lobby with fake players to rehearse: npm run bots -- 12   (needs the server running)
import WebSocket from "ws";
import { questions } from "./questions.mjs";

const count = Number(process.argv[2] ?? 10);
const url = process.env.QUIZ_URL ?? "ws://localhost:3000/ws";
const pin = process.env.PIN ?? process.argv[3];
if (!pin) { console.error("Usage: PIN=123456 npm run bots -- 12   (the PIN is printed when the server starts)"); process.exit(1); }

const names = ["Aisha", "Ben", "Chen", "Dina", "Eli", "Farah", "Gus", "Hana", "Ivan", "Jia", "Kai", "Lena", "Mo", "Nora", "Omar", "Priya", "Quinn", "Rui", "Sara", "Tariq"];

for (let i = 0; i < count; i++) {
  const skill = 0.3 + Math.random() * 0.65;   // chance to answer correctly
  const speed = 800 + Math.random() * 14000;  // typical reaction time in ms
  const ws = new WebSocket(url);
  ws.on("open", () => ws.send(JSON.stringify({ type: "join", name: `${names[i % names.length]}${i >= names.length ? i : ""}`, pin })));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.type === "error") console.log("bot error:", m.message);
    if (m.type === "state" && m.phase === "question" && m.answered == null) {
      const right = questions[m.question.index].answer;
      const choice = Math.random() < skill ? right : (right + 1 + Math.floor(Math.random() * 3)) % 4;
      setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "answer", choice })), speed * (0.4 + Math.random() * 0.8));
    }
  });
}
console.log(`${count} bots joining…`);
