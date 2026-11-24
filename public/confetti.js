window.confetti = function (canvas, ms) {
  var ctx = canvas.getContext("2d"), w = (canvas.width = innerWidth), h = (canvas.height = innerHeight);
  var colors = ["#e21b3c", "#1368ce", "#ffc00a", "#26890c", "#a855f7", "#ffffff"];
  var bits = Array.from({ length: 220 }, function () { return { x: Math.random() * w, y: -20 - Math.random() * h, r: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0], vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, rot: Math.random() * 6, vr: -0.2 + Math.random() * 0.4 }; });
  var end = performance.now() + (ms || 6000);
  (function frame(now) {
    ctx.clearRect(0, 0, w, h);
    bits.forEach(function (b) { b.x += b.vx; b.y += b.vy; b.rot += b.vr; if (b.y > h + 20 && now < end - 1500) { b.y = -20; b.x = Math.random() * w; } ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.fillStyle = b.c; ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); ctx.restore(); });
    if (now < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
  })(performance.now());
};
