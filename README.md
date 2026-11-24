# Kahoot-style live quiz (Mini Shop workshop)

A live, Kahoot-style quiz for the end of the workshop. Players join from their phones, the big screen shows the questions,
a leaderboard and a podium. The top three win 3, 2 and 1 mentoring sessions.

## Run it

```bash
npm install        # first time only
npm start
```

The terminal prints two things:

- **Host screen**: open that `http://localhost:3000/host?key=...` URL on the projector browser (press F11 for fullscreen).
- **Players join at**: the address and PIN. The host screen already shows a QR code that opens it with the PIN filled in.

## Rehearse alone

```bash
PIN=<pin from the terminal> npm run bots -- 12    # 12 fake players with different skill and speed
```

Join once from your own phone as well, to feel the real thing.

## Host controls

| Key | Action |
|---|---|
| Space or Enter | start, skip the timer, next screen |
| M | mute sound |
| Click a name in the lobby | remove that player |
| Reset button | back to the lobby with scores cleared |

Flow per question: question text for 4 s, then the 4 options and a 20 s timer, then the reveal with answer counts,
then the leaderboard. If every connected player has answered, the reveal comes early.

## Scoring

- Wrong or no answer: **0**.
- Correct: **1000 x (1 - t / 40)**, where t is the response time in seconds. So 1000 for an instant answer and 500 at the buzzer.
- Time is measured **on the server**, from the moment the options appear, so a slow phone or a fake clock cannot cheat.
- Ties on points go to whoever spent less total time on their correct answers.
- Prizes (3, 2, 1 sessions) are set in `questions.mjs`.

## Edit the questions

Open `questions.mjs`. Each question has `q`, four `options` and `answer` (index 0 to 3). You can also change the
timings, the points and the prizes there.

## If phones cannot reach the laptop

Many venue wifi networks block devices from talking to each other ("client isolation"). Options:

1. Use your phone's hotspot for the laptop and let students join the same hotspot (small groups only), or
2. Run a tunnel and give the server its public address:
   ```bash
   cloudflared tunnel --url http://localhost:3000        # prints https://something.trycloudflare.com
   PUBLIC_URL=https://something.trycloudflare.com npm start
   ```
   The QR code and join link then use the public address, so students can use mobile data.

Test it with a few phones before the day.

## Tests

`npm test` plays a full game through real WebSockets with scripted players and checks scoring, ordering, prizes,
rejected cheating attempts, reconnecting, kicking and reset.

## Host it on Render (so nothing runs on your laptop)

1. Push this repo to GitHub, then Render > **New** > **Blueprint** and pick it. Render reads `render.yaml`.
2. Set `HOST_KEY` (any long random string) and `PIN` (6 digits) in the Render dashboard. Fixed values mean the host URL and the PIN do not change when the service restarts.
3. Open `https://<your-service>.onrender.com/host?key=<HOST_KEY>` on the projector. Players open `https://<your-service>.onrender.com`.
4. The free tier sleeps after 15 minutes. Open the host URL 5 minutes before you start so the first player does not hit a cold start.

The game state lives in memory, so run a single instance and do not redeploy during a session.
