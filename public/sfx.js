// Tiny synthesized sound effects (no audio files). Press M on the host screen to mute.
window.sfx = (function () {
  var ctx = null, muted = false;
  function ac() { if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); } if (ctx && ctx.state === "suspended") ctx.resume(); return ctx; }
  function tone(freq, start, dur, type, vol) {
    var c = ac(); if (!c || muted) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + (start || 0);
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    unlock: function () { ac(); },
    toggle: function () { muted = !muted; return muted; },
    isMuted: function () { return muted; },
    join: function () { tone(660, 0, 0.12, "triangle", 0.1); tone(880, 0.08, 0.14, "triangle", 0.1); },
    whoosh: function () { tone(220, 0, 0.25, "sawtooth", 0.06); tone(330, 0.1, 0.25, "sawtooth", 0.05); },
    start: function () { [392, 523, 659, 784].forEach(function (f, i) { tone(f, i * 0.09, 0.2, "square", 0.07); }); },
    tick: function (urgent) { tone(urgent ? 1100 : 800, 0, 0.07, "square", urgent ? 0.1 : 0.06); },
    timeUp: function () { tone(180, 0, 0.5, "sawtooth", 0.12); },
    correct: function () { tone(660, 0, 0.15, "triangle", 0.12); tone(990, 0.12, 0.25, "triangle", 0.12); },
    wrong: function () { tone(200, 0, 0.3, "sawtooth", 0.1); },
    drum: function () { tone(90, 0, 0.3, "sine", 0.25); },
    fanfare: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone(f, i * 0.14, 0.3, "square", 0.08); tone(f / 2, i * 0.14, 0.3, "triangle", 0.1); }); },
  };
})();
