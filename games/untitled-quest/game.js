(function () {
  "use strict";

  var GAME_ID = "untitled-quest";
  var SAVE_KEY = "arcade:untitled-quest:save";
  var W = 256, H = 224;
  var VILLAIN = "MALGRIM";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  var scoreEl = document.getElementById("score");
  var scoresEl = document.getElementById("scores");
  Scores.render(GAME_ID, scoresEl);

  /* ---------------------------------------------------------------- story */

  var CRAWL = [
    "IN THE AGE OF LIGHT,",
    "THE REALM OF ELDERMERE",
    "KNEW PEACE.",
    "",
    "THEN CAME MALGRIM,",
    "LORD OF SHADOW,",
    "CAST OUT BY THE KINGS OF MEN.",
    "",
    "FOR A HUNDRED YEARS HE SLEPT",
    "BENEATH THE BLACK MOUNTAIN,",
    "DREAMING OF A THRONE",
    "THAT WAS HIS BY RIGHT.",
    "",
    "NOW THE KINGDOM SENDS",
    "ITS FOUR GREATEST CHAMPIONS",
    "TO FINISH WHAT THEY STARTED.",
    "",
    "THEY HAVE COME TO SLAY",
    "A MONSTER.",
    "",
    "THEY HAVE NOT YET",
    "MET HIM."
  ];

  var SCENE_LINES = [
    { who: "KNIGHT", col: "#b8c8ff", text: "MALGRIM! YOUR REIGN OF TERROR ENDS HERE!" },
    { who: "THIEF", col: "#80f0a0", text: "HE'S ALONE. NO ARMY, NO GUARDS. TOO EASY." },
    { who: "W.MAGE", col: "#ffffff", text: "THE LIGHT GUIDES US. WE CANNOT FAIL." },
    { who: "B.MAGE", col: "#ffa060", text: "HEH. LET'S SEE WHAT THE DARK LORD CAN DO." },
    { who: VILLAIN, col: "#ff5060", text: "YOU FOUR CAME ALL THIS WAY... JUST TO DIE?" },
    { who: VILLAIN, col: "#ff5060", text: "VERY WELL, CHAMPIONS OF LIGHT. COME AND TRY!" }
  ];

  /* ---------------------------------------------------------------- font */

  var FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011",
    D: "110101101101110", E: "111100110100111", F: "111100110100100",
    G: "011100101101011", H: "101101111101101", I: "111010010010111",
    J: "001001001101010", K: "101101110101101", L: "100100100100111",
    M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101",
    S: "011100010001110", T: "111010010010010", U: "101101101101111",
    V: "101101101101010", W: "101101111111101", X: "101101010101101",
    Y: "101101010010010", Z: "111001010100111",
    "0": "111101101101111", "1": "010110010010111", "2": "110001010100111",
    "3": "110001010001110", "4": "101101111001001", "5": "111100110001110",
    "6": "011100111101111", "7": "111001010010010", "8": "111101111101111",
    "9": "111101111001110",
    ".": "000000000000010", ",": "000000000010100", "!": "010010010000010",
    "?": "110001010000010", "'": "010010000000000", "-": "000000111000000",
    ":": "000010000010000", "/": "001001010100100", "%": "101001010100101",
    "+": "000010111010000", "_": "000000000000111"
  };

  function text(str, x, y, color, scale) {
    scale = scale || 1;
    ctx.fillStyle = color || "#fff";
    str = String(str).toUpperCase();
    var cx = x;
    for (var i = 0; i < str.length; i++) {
      var g = FONT[str.charAt(i)];
      if (g) {
        for (var p = 0; p < 15; p++) {
          if (g.charAt(p) === "1") {
            ctx.fillRect(cx + (p % 3) * scale, y + ((p / 3) | 0) * scale, scale, scale);
          }
        }
      }
      cx += 4 * scale;
    }
  }

  function textW(str, scale) { return String(str).length * 4 * scale - scale; }

  function ctext(str, y, color, scale) {
    scale = scale || 2;
    text(str, ((W - textW(str, scale)) / 2) | 0, y, color, scale);
  }

  function shadowText(str, x, y, color, scale) {
    text(str, x + scale, y + scale, "#000", scale);
    text(str, x, y, color, scale);
  }

  function wrap(str, n) {
    var words = str.split(" "), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (cur && (cur + " " + w).length > n) { lines.push(cur); cur = w; }
      else { cur = cur ? cur + " " + w : w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* ------------------------------------------------------------- drawing */

  function cv(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  function mkSprite(w, h, rects) {
    var c = cv(w, h), g = c.getContext("2d");
    rects.forEach(function (r) { g.fillStyle = r[4]; g.fillRect(r[0], r[1], r[2], r[3]); });
    var f = cv(w, h), fg = f.getContext("2d");
    fg.drawImage(c, 0, 0);
    fg.globalCompositeOperation = "source-in";
    fg.fillStyle = "#fff";
    fg.fillRect(0, 0, w, h);
    return { img: c, flash: f, w: w, h: h };
  }

  function drawSpr(s, x, y, scale, flash, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(flash ? s.flash : s.img, Math.round(x), Math.round(y), s.w * scale, s.h * scale);
    ctx.globalAlpha = 1;
  }

  var SPR = {};

  SPR.knight = mkSprite(16, 24, [
    [7, 0, 2, 2, "#d03030"],
    [4, 4, 1, 3, "#8088a0"], [11, 4, 1, 3, "#8088a0"],
    [5, 2, 6, 6, "#b8c0d0"], [5, 5, 4, 1, "#202030"],
    [4, 8, 8, 8, "#8890a8"], [6, 9, 4, 4, "#b8c0d0"],
    [4, 15, 8, 1, "#604020"],
    [5, 16, 3, 6, "#606880"], [8, 16, 3, 6, "#606880"],
    [4, 22, 4, 2, "#403028"], [8, 22, 4, 2, "#403028"],
    [2, 9, 3, 5, "#8890a8"],
    [0, 3, 2, 11, "#e8e8f0"], [0, 13, 4, 1, "#e0b030"],
    [11, 9, 4, 8, "#3050c0"], [11, 9, 4, 1, "#c0c8e0"], [12, 11, 2, 2, "#e0b030"]
  ]);

  SPR.thief = mkSprite(16, 24, [
    [10, 8, 3, 8, "#176038"],
    [5, 2, 6, 6, "#1f7a4a"], [5, 5, 3, 2, "#f0c090"], [5, 5, 1, 1, "#000"],
    [5, 7, 6, 2, "#c04040"],
    [4, 9, 8, 7, "#2f8f5f"], [4, 14, 8, 1, "#704020"],
    [2, 10, 3, 4, "#2f8f5f"], [2, 11, 1, 1, "#f0c090"], [0, 11, 3, 1, "#e8e8f0"],
    [12, 10, 2, 4, "#2f8f5f"],
    [5, 16, 3, 6, "#3a4a40"], [8, 16, 3, 6, "#3a4a40"],
    [4, 22, 4, 2, "#2a2018"], [8, 22, 4, 2, "#2a2018"]
  ]);

  SPR.wmage = mkSprite(16, 24, [
    [3, 8, 10, 14, "#f0f0f0"], [3, 20, 10, 2, "#c8c8d8"], [3, 21, 10, 1, "#d03030"],
    [4, 1, 8, 8, "#f0f0f0"], [5, 3, 3, 4, "#f0c090"], [5, 4, 1, 1, "#000"],
    [4, 8, 8, 1, "#d03030"],
    [7, 12, 2, 5, "#d03030"], [6, 13, 4, 2, "#d03030"],
    [2, 10, 2, 5, "#e0e0f0"],
    [13, 3, 1, 19, "#805020"], [12, 0, 3, 3, "#ffe060"],
    [5, 22, 3, 2, "#403028"], [8, 22, 3, 2, "#403028"]
  ]);

  SPR.bmage = mkSprite(16, 24, [
    [3, 9, 10, 13, "#3a48b0"], [3, 21, 10, 1, "#232c80"],
    [7, 0, 3, 2, "#1c2058"], [5, 2, 6, 2, "#1c2058"], [3, 4, 10, 2, "#1c2058"],
    [5, 6, 6, 4, "#101018"], [5, 7, 1, 1, "#ffe040"], [7, 7, 1, 1, "#ffe040"],
    [4, 10, 8, 1, "#6070d0"],
    [2, 11, 2, 5, "#2c3890"],
    [13, 4, 1, 18, "#805020"], [12, 2, 3, 3, "#ff6030"],
    [5, 22, 3, 2, "#201810"], [8, 22, 3, 2, "#201810"]
  ]);

  SPR.lord = mkSprite(24, 32, [
    [2, 10, 20, 19, "#701020"], [2, 26, 20, 3, "#4a0a16"],
    [8, 22, 3, 8, "#1c1c28"], [13, 22, 3, 8, "#1c1c28"],
    [7, 29, 5, 3, "#101018"], [12, 29, 5, 3, "#101018"],
    [7, 11, 10, 11, "#2c2c3e"], [7, 11, 10, 2, "#5a5a74"], [11, 15, 2, 3, "#c02040"],
    [7, 21, 10, 1, "#802030"],
    [4, 13, 3, 8, "#2c2c3e"], [17, 13, 3, 8, "#2c2c3e"],
    [4, 21, 3, 2, "#5a5a74"], [17, 21, 3, 2, "#5a5a74"],
    [3, 10, 5, 4, "#3a3a52"], [16, 10, 5, 4, "#3a3a52"],
    [3, 8, 1, 2, "#7a7a96"], [6, 8, 1, 2, "#7a7a96"], [17, 8, 1, 2, "#7a7a96"], [20, 8, 1, 2, "#7a7a96"],
    [5, 0, 2, 6, "#d8d0b0"], [17, 0, 2, 6, "#d8d0b0"],
    [7, 2, 10, 9, "#402050"], [9, 5, 7, 4, "#0a000c"],
    [10, 6, 2, 1, "#ff3030"], [14, 6, 2, 1, "#ff3030"],
    [21, 6, 1, 24, "#806040"], [19, 3, 5, 4, "#c040ff"], [20, 4, 3, 2, "#f0b0ff"]
  ]);

  var BG_ROOM = (function () {
    var c = cv(W, H), g = c.getContext("2d");
    var wall = g.createLinearGradient(0, 0, 0, 110);
    wall.addColorStop(0, "#120a22");
    wall.addColorStop(1, "#2a1638");
    g.fillStyle = wall; g.fillRect(0, 0, W, 110);
    g.fillStyle = "#1c1228"; g.fillRect(0, 110, W, H - 110);
    for (var y = 110, row = 0; y < H; y += 18, row++) {
      g.fillStyle = "#2a1c3c"; g.fillRect(0, y, W, 1);
      for (var x = (row % 2) * 16; x < W; x += 32) g.fillRect(x, y, 1, 18);
    }
    [[6, 0], [234, 0]].forEach(function (p) {
      g.fillStyle = "#3a2a50"; g.fillRect(p[0], 0, 16, 110);
      g.fillStyle = "#54406e"; g.fillRect(p[0], 0, 3, 110);
      g.fillStyle = "#241838"; g.fillRect(p[0] + 13, 0, 3, 110);
      g.fillStyle = "#ffb040"; g.fillRect(p[0] + 6, 20, 4, 5);
      g.fillStyle = "#ffe080"; g.fillRect(p[0] + 7, 21, 2, 2);
    });
    [[52, 0], [190, 0]].forEach(function (p) {
      g.fillStyle = "#6a1020"; g.fillRect(p[0], 6, 14, 48);
      g.fillStyle = "#8a1830"; g.fillRect(p[0], 6, 14, 3);
      g.fillStyle = "#6a1020"; g.fillRect(p[0], 54, 4, 4); g.fillRect(p[0] + 10, 54, 4, 4);
      g.fillStyle = "#c8a030"; g.fillRect(p[0] + 5, 22, 4, 4);
    });
    return c;
  })();

  function shadow(x, y, w) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(Math.round(x + 3), Math.round(y), w - 6, 4);
    ctx.fillRect(Math.round(x), Math.round(y + 1), w, 2);
  }

  function win(x, y, w, h) {
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(x, y, w, h);
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#2a3cc8");
    g.addColorStop(1, "#101870");
    ctx.fillStyle = g;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + w - 1, y, 1, 1);
    ctx.fillRect(x, y + h - 1, 1, 1); ctx.fillRect(x + w - 1, y + h - 1, 1, 1);
  }

  function pointer(x, y) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, 2, 7);
    ctx.fillRect(x + 2, y + 1, 2, 5);
    ctx.fillRect(x + 4, y + 2, 2, 3);
    ctx.fillRect(x + 6, y + 3, 1, 1);
  }

  /* --------------------------------------------------------------- mouse */

  // Clickable regions are re-registered by each scene's draw() every frame.
  var hits = [];
  var mouse = { x: -1, y: -1 };

  function region(x, y, w, h, onHover, onClick) {
    hits.push({ x: x, y: y, w: w, h: h, hover: onHover, click: onClick });
  }

  function hitAt(px, py) {
    for (var i = hits.length - 1; i >= 0; i--) {
      var r = hits[i];
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return r;
    }
    return null;
  }

  function toCanvas(e) {
    var rc = canvas.getBoundingClientRect();
    return { x: (e.clientX - rc.left) * W / rc.width, y: (e.clientY - rc.top) * H / rc.height };
  }

  /* --------------------------------------------------------------- audio */

  var actx = null, master = null, noiseBuf = null, muted = false;
  var wantTrack = null, music = null;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function audioInit() {
    if (actx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      var w = wantTrack; wantTrack = null;
      if (w) setTrack(w);
    } catch (e) { actx = null; }
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.45;
  }

  function note(m, t, dur, vol, type, slideTo) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(mtof(m), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(mtof(slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function hiss(t, dur, vol, f0, f1) {
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf;
    f.type = "lowpass";
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function sfx(name) {
    if (!actx) return;
    var t = actx.currentTime;
    switch (name) {
      case "cursor": note(84, t, 0.05, 0.1, "square"); break;
      case "ok": note(76, t, 0.06, 0.14, "square"); note(88, t + 0.05, 0.08, 0.14, "square"); break;
      case "cancel": note(64, t, 0.09, 0.14, "square"); break;
      case "err": note(45, t, 0.18, 0.18, "sawtooth"); break;
      case "hit": hiss(t, 0.18, 0.5, 2400, 300); note(52, t, 0.15, 0.25, "triangle", 30); break;
      case "magic": note(60, t, 0.35, 0.14, "sawtooth", 96); note(67, t + 0.05, 0.3, 0.08, "square", 100); break;
      case "bolt": hiss(t, 0.3, 0.5, 6000, 200); note(96, t, 0.25, 0.14, "sawtooth", 40); break;
      case "nova": hiss(t, 0.9, 0.6, 1500, 80); note(72, t, 0.8, 0.18, "sawtooth", 24); note(60, t + 0.1, 0.7, 0.14, "square", 30); break;
      case "heal": [72, 76, 79, 84].forEach(function (n, i) { note(n, t + i * 0.07, 0.18, 0.13, "triangle"); }); break;
      case "die": note(62, t, 0.55, 0.18, "square", 28); hiss(t, 0.4, 0.3, 1200, 120); break;
      case "flash": hiss(t, 0.35, 0.5, 8000, 800); note(40, t, 0.4, 0.2, "sawtooth", 90); break;
      case "levelup": [72, 76, 79, 84, 88, 91, 96].forEach(function (n, i) { note(n, t + i * 0.06, 0.2, 0.12, "square"); }); break;
    }
  }

  function bar(a) { return a; }
  function bars() { return Array.prototype.concat.apply([], arguments); }
  function up(a, n) { return a.map(function (v) { return v ? v + n : 0; }); }
  function bassBar(r) { return [r, 0, r, 0, r + 12, 0, r, 0, r, 0, r, 0, r + 12, 0, r, 0]; }
  function pedal(r) { return [r, 0, 0, 0, 0, 0, 0, 0, r, 0, 0, 0, 0, 0, 0, 0]; }

  var TRACKS = {
    title: {
      bpm: 92, leadDur: 3.4, bassDur: 7, leadVol: 0.1, bassVol: 0.2,
      lead: up(bars(
        [62, 0, 0, 0, 65, 0, 0, 0, 69, 0, 0, 0, 74, 0, 0, 0],
        [58, 0, 0, 0, 62, 0, 0, 0, 65, 0, 0, 0, 70, 0, 0, 0],
        [65, 0, 0, 0, 69, 0, 0, 0, 72, 0, 0, 0, 77, 0, 0, 0],
        [64, 0, 0, 0, 69, 0, 0, 0, 73, 0, 0, 0, 76, 0, 0, 0]
      ), 12),
      bass: bars(pedal(38), pedal(34), pedal(29), pedal(33)),
      kick: [], snare: [], hat: []
    },
    tense: {
      bpm: 72, leadDur: 8, bassDur: 8, leadVol: 0.08, bassVol: 0.22,
      lead: bars(
        [69, 0, 0, 0, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0],
        [64, 0, 0, 0, 0, 0, 0, 0, 63, 0, 0, 0, 0, 0, 0, 0]
      ),
      bass: bars(pedal(33), pedal(34)),
      kick: [0, 3, 8, 11], snare: [], hat: []
    },
    battle: {
      bpm: 150, leadDur: 1.7, bassDur: 1.6, leadVol: 0.09, bassVol: 0.22,
      lead: bars(
        [69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 72, 0, 76, 0, 79, 0],
        [81, 0, 79, 0, 76, 0, 72, 0, 76, 0, 72, 0, 69, 0, 72, 0],
        [65, 0, 69, 0, 72, 0, 69, 0, 65, 0, 69, 0, 72, 0, 77, 0],
        [67, 0, 71, 0, 74, 0, 71, 0, 67, 0, 71, 0, 74, 0, 79, 71]
      ),
      bass: bars(bassBar(45), bassBar(45), bassBar(41), bassBar(43)),
      kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14]
    },
    victory: {
      seq: [[72, 0, 0.12], [72, 0.14, 0.12], [72, 0.28, 0.12], [72, 0.42, 0.45],
            [68, 0.9, 0.45], [70, 1.36, 0.45], [72, 1.82, 0.2], [70, 2.06, 0.12], [72, 2.2, 1.3],
            [60, 2.2, 1.3]]
    },
    defeat: {
      seq: [[64, 0, 0.35], [62, 0.4, 0.35], [60, 0.8, 0.35], [57, 1.2, 1.2], [45, 1.2, 1.2]]
    }
  };

  function stopMusic() {
    if (music) { clearInterval(music.id); music = null; }
  }

  function setTrack(name) {
    if (name === wantTrack && (music || !actx)) return;
    wantTrack = name;
    if (!actx) return;
    stopMusic();
    var t = TRACKS[name];
    if (!t) return;
    if (t.seq) {
      var now = actx.currentTime + 0.05;
      t.seq.forEach(function (n) { note(n[0], now + n[1], n[2], 0.14, "square"); });
      return;
    }
    music = { t: t, step: 0, next: actx.currentTime + 0.08, sd: 60 / t.bpm / 4, id: setInterval(pump, 40) };
  }

  function pump() {
    if (!music || !actx) return;
    var t = music.t, sd = music.sd;
    var len = t.lead.length;
    while (music.next < actx.currentTime + 0.3) {
      var s = music.step % len, s16 = s % 16, when = music.next;
      if (t.lead[s]) note(t.lead[s], when, t.leadDur * sd, t.leadVol, "square");
      if (t.bass[s]) note(t.bass[s], when, t.bassDur * sd, t.bassVol, "triangle");
      if (t.kick.indexOf(s16) >= 0) { note(50, when, 0.1, 0.3, "triangle", 28); }
      if (t.snare.indexOf(s16) >= 0) hiss(when, 0.1, 0.18, 6000, 800);
      if (t.hat.indexOf(s16) >= 0) hiss(when, 0.03, 0.06, 9000, 6000);
      music.next += sd;
      music.step++;
    }
  }

  /* ---------------------------------------------------------------- save */

  function newSave() { return { level: 1, exp: 0, wins: 0 }; }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && typeof s.level === "number") return s;
    } catch (e) {}
    return null;
  }

  function writeSave(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  var game = { save: newSave() };

  function statsFor(L) {
    return {
      hp: 150 + 22 * (L - 1), mp: 30 + 7 * (L - 1),
      atk: 22 + 3 * (L - 1), def: 8 + 2 * (L - 1), spd: 8 + (L - 1)
    };
  }

  /* -------------------------------------------------------------- scenes */

  var scenes = {};
  var cur = null;
  var fade = { state: "none", a: 0, next: null, args: null };

  function go(name, args) {
    if (fade.state !== "none") return;
    fade.state = "out";
    fade.next = name;
    fade.args = args;
  }

  var stars = [];
  for (var si = 0; si < 60; si++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * 6, s: Math.random() < 0.2 ? 2 : 1 });
  }

  function drawStars(t, maxY) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (s.y > maxY) continue;
      ctx.fillStyle = (Math.sin(t * 2 + s.p) > -0.3) ? "#fff" : "#556";
      ctx.fillRect(s.x | 0, s.y | 0, s.s, s.s);
    }
  }

  // Draws a vertical menu with hover and click support. Returns nothing.
  function menu(items, x, y, rowH, w, sel, onSel, onPick, scale) {
    scale = scale || 2;
    for (var i = 0; i < items.length; i++) {
      (function (i) {
        var it = items[i];
        var ry = y + i * rowH;
        if (i === sel) pointer(x, ry + ((5 * scale - 7) >> 1) + 1);
        text(it.label, x + 10, ry, it.dim ? "#8890b8" : "#fff", scale);
        if (it.right) text(it.right, x + w - 10 - textW(it.right, 1), ry + 3, it.dim ? "#8890b8" : "#ffe070", 1);
        region(x, ry - 1, w, rowH, function () { onSel(i); }, function () { onSel(i); onPick(i); });
      })(i);
    }
  }

  /* title */
  scenes.title = {
    enter: function () {
      this.sel = 0; this.t = 0;
      this.hasSave = !!loadSave();
      setTrack("title");
    },
    update: function (dt) { this.t += dt; },
    items: function () {
      var a = [{ label: "NEW GAME" }];
      if (this.hasSave) a.push({ label: "CONTINUE" });
      return a;
    },
    pick: function (i) {
      sfx("ok");
      if (i === 0) { game.save = newSave(); go("crawl"); }
      else { game.save = loadSave() || newSave(); go("end"); }
    },
    key: function (a) {
      var n = this.items().length;
      if (a === "up" || a === "down") { this.sel = (this.sel + 1) % n; if (n > 1) sfx("cursor"); }
      else if (a === "ok") this.pick(this.sel);
    },
    draw: function () {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#05030f"); g.addColorStop(0.6, "#1a0f33"); g.addColorStop(1, "#3a1448");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      drawStars(this.t, 140);
      ctx.fillStyle = "#e8e0c0";
      ctx.fillRect(218, 92, 8, 2); ctx.fillRect(214, 94, 6, 2); ctx.fillRect(212, 96, 4, 8);
      ctx.fillRect(214, 104, 6, 2); ctx.fillRect(218, 106, 8, 2);
      ctx.fillStyle = "#c8c0a0"; ctx.fillRect(216, 96, 2, 8);
      // castle
      ctx.fillStyle = "#08040f";
      ctx.fillRect(66, 150, 124, 74);
      ctx.fillRect(58, 128, 24, 96); ctx.fillRect(174, 128, 24, 96); ctx.fillRect(110, 118, 36, 106);
      for (var k = 0; k < 4; k++) {
        ctx.fillRect(58 + k * 6, 122, 4, 6); ctx.fillRect(174 + k * 6, 122, 4, 6);
      }
      ctx.fillRect(114, 106, 28, 12); ctx.fillRect(122, 96, 12, 10); ctx.fillRect(126, 84, 4, 12);
      ctx.fillStyle = "#ff3030"; ctx.fillRect(127, 84, 3, 2);
      var flick = Math.sin(this.t * 7) > 0 ? "#ffd040" : "#ff9020";
      ctx.fillStyle = flick;
      [[68, 140], [74, 160], [182, 140], [186, 160], [124, 130], [130, 150], [124, 170], [100, 164], [150, 164]].forEach(function (p) {
        ctx.fillRect(p[0], p[1], 3, 4);
      });
      ctx.fillStyle = "#08040f"; ctx.fillRect(0, 196, W, 28);

      var by = 24 + Math.round(Math.sin(this.t * 1.5) * 1);
      ctext("UNTITLED", by + 3, "#400018", 4);
      ctext("UNTITLED", by, "#f8d848", 4);
      ctext("QUEST", by + 27, "#400018", 4);
      ctext("QUEST", by + 24, "#ff5060", 4);

      var self = this;
      var items = this.items();
      win(84, 148, 88, 8 + items.length * 14);
      menu(items, 90, 154, 14, 76, this.sel, function (i) {
        if (self.sel !== i) { self.sel = i; sfx("cursor"); }
      }, function (i) { self.pick(i); });
      ctext("BEN'S ARCADE", 210, "#7a6a9a", 1);
    }
  };

  /* story crawl */
  scenes.crawl = {
    enter: function () { this.t = 0; this.y = H + 8; setTrack("title"); },
    update: function (dt) {
      this.t += dt;
      this.y -= 24 * dt;
      if (this.y + CRAWL.length * 14 < -10) go("cut");
    },
    key: function (a) { if (a === "ok" || a === "cancel") { sfx("ok"); go("cut"); } },
    click: function () { sfx("ok"); go("cut"); },
    draw: function () {
      ctx.fillStyle = "#04020a"; ctx.fillRect(0, 0, W, H);
      drawStars(this.t, H);
      for (var i = 0; i < CRAWL.length; i++) {
        var ly = this.y + i * 14;
        if (ly > -12 && ly < H) ctext(CRAWL[i], Math.round(ly), "#f8f0a0", 2);
      }
      var tg = ctx.createLinearGradient(0, 0, 0, 56);
      tg.addColorStop(0, "#04020a"); tg.addColorStop(1, "rgba(4,2,10,0)");
      ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 56);
      text("CLICK OR ENTER: SKIP", W - 4 - textW("CLICK OR ENTER: SKIP", 1), H - 8, "#6a6a8a", 1);
    }
  };

  /* hero data + formation */
  var HERO_DEFS = [
    { id: "knight", name: "KNIGHT", spr: "knight", hp: 60, atk: 20, def: 8, spd: 5, x: 148, y: 36 },
    { id: "thief", name: "THIEF", spr: "thief", hp: 40, atk: 13, def: 3, spd: 12, x: 148, y: 98 },
    { id: "wmage", name: "W.MAGE", spr: "wmage", hp: 35, atk: 5, def: 2, spd: 7, x: 204, y: 58 },
    { id: "bmage", name: "B.MAGE", spr: "bmage", hp: 30, atk: 6, def: 2, spd: 6, x: 204, y: 114 }
  ];
  var LORD_POS = { x: 36, y: 92 };

  function drawHeroesIdle(t, offsetFn) {
    var order = HERO_DEFS.slice().sort(function (a, b) { return a.y - b.y; });
    order.forEach(function (d) {
      var ox = offsetFn ? offsetFn(d) : 0;
      var bob = Math.floor(t * 2 + d.x / 20) % 2;
      shadow(d.x + ox, d.y + 45, 32);
      drawSpr(SPR[d.spr], d.x + ox, d.y + bob, 2);
    });
  }

  function dialogBox(who, col, str, chars) {
    win(4, 164, 248, 56);
    text(who, 14, 170, col, 2);
    var lines = wrap(str, 27), left = Math.floor(chars);
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].substr(0, Math.max(0, left));
      text(s, 14, 186 + i * 14, "#fff", 2);
      left -= lines[i].length + 1;
    }
  }

  /* cutscene */
  scenes.cut = {
    enter: function () {
      this.t = 0; this.i = 0; this.chars = 0; this.phase = "walk"; this.flashT = 0;
      setTrack("tense");
    },
    update: function (dt) {
      this.t += dt;
      if (this.phase === "walk") {
        if (this.t > 2.0) this.phase = "talk";
      } else if (this.phase === "talk") {
        this.chars += 36 * dt;
      } else if (this.phase === "flash") {
        this.flashT += dt;
        if (this.flashT > 0.9) { this.phase = "done"; go("battle"); }
      }
    },
    advance: function () {
      if (this.phase !== "talk") return;
      var len = SCENE_LINES[this.i].text.length;
      if (this.chars < len) { this.chars = len; return; }
      sfx("cursor");
      this.i++;
      this.chars = 0;
      if (this.i >= SCENE_LINES.length) {
        this.phase = "flash"; this.flashT = 0;
        sfx("flash"); stopMusic(); wantTrack = null;
      }
    },
    key: function (a) { if (a === "ok") this.advance(); },
    click: function () { this.advance(); },
    draw: function () {
      ctx.drawImage(BG_ROOM, 0, 0);
      var t = this.t;
      var prog = Math.min(1, t / 1.8);
      var ease = 1 - Math.pow(1 - prog, 3);
      shadow(LORD_POS.x, LORD_POS.y + 61, 48);
      drawSpr(SPR.lord, LORD_POS.x, LORD_POS.y, 2);
      drawHeroesIdle(t, function (d) {
        var delay = (d.y % 40) / 100;
        var p = Math.max(0, Math.min(1, (t - delay) / 1.6));
        return (1 - (1 - Math.pow(1 - p, 3))) * 130;
      });
      if (this.phase === "talk" && this.i < SCENE_LINES.length) {
        var l = SCENE_LINES[this.i];
        dialogBox(l.who, l.col, l.text, this.chars);
        if (this.chars >= l.text.length && Math.floor(t * 3) % 2) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(240, 210, 6, 2); ctx.fillRect(241, 212, 4, 2); ctx.fillRect(242, 214, 2, 2);
        }
      }
      if (this.phase === "flash") {
        if (Math.floor(this.flashT / 0.1) % 2 === 0) {
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
        }
      }
    }
  };

  /* ------------------------------------------------------------ battle */

  var SPELLS = [
    { id: "bolt", name: "DARK BOLT", mp: 4, all: false },
    { id: "drain", name: "DRAIN", mp: 6, all: false },
    { id: "nova", name: "SHADOW NOVA", mp: 14, all: true }
  ];

  var b = null;

  function rnd(n) { return Math.random() * n; }
  function physDmg(atk, def) { return Math.max(1, Math.round(atk * (0.8 + rnd(0.4))) - def); }
  function magDmg(base) { return Math.max(1, Math.round(base * (0.85 + rnd(0.3)))); }

  function liveHeroes() { return b.heroes.filter(function (h) { return !h.dead; }); }

  function mkBattle() {
    var L = game.save.level, st = statsFor(L);
    var sc = 1 + 0.25 * game.save.wins;
    return {
      t: 0, phase: "intro", timer: 1.0, rounds: 0,
      msg: "BATTLE START!",
      p: {
        name: VILLAIN, level: L, hp: st.hp, max: st.hp, mp: st.mp, maxmp: st.mp,
        atk: st.atk, def: st.def, spd: st.spd, flash: 0, shake: 0, lunge: 0, defending: false
      },
      heroes: HERO_DEFS.map(function (d) {
        return {
          id: d.id, name: d.name, spr: SPR[d.spr], x: d.x, y: d.y,
          hp: Math.round(d.hp * sc), max: Math.round(d.hp * sc),
          atk: Math.round(d.atk * sc), def: d.def, spd: d.spd,
          flash: 0, lunge: 0, fade: 1, dead: false
        };
      }),
      items: { potion: 3, ether: 1 },
      menu: 0, sub: 0, tgt: 0, pending: null, order: [], idx: 0,
      nums: [], fx: [], result: null, endSel: 0
    };
  }

  function say(s) { b.msg = s; }
  function num(x, y, txt, col) { b.nums.push({ x: x, y: y, txt: String(txt), col: col, t: 0 }); }
  function fx(kind, x, y, col, dur) { b.fx.push({ kind: kind, x: x, y: y, col: col, t: 0, dur: dur || 0.4 }); }
  function hc(h) { return { x: h.x + 16, y: h.y + 24 }; }
  var LC = { x: LORD_POS.x + 24, y: LORD_POS.y + 32 };

  function hurtHero(h, d) {
    h.hp -= d; h.flash = 0.25;
    var c = hc(h);
    num(c.x, h.y, d, "#fff");
    if (h.hp <= 0) { h.hp = 0; h.dead = true; sfx("die"); }
  }

  function hurtLord(d) {
    var p = b.p;
    if (p.defending) d = Math.max(1, Math.ceil(d / 2));
    p.hp -= d; p.flash = 0.25; p.shake = 0.25;
    num(LC.x, LORD_POS.y, d, "#ffb0b0");
    if (p.hp < 0) p.hp = 0;
  }

  function firstLive(i) {
    var l = liveHeroes();
    if (!l.length) return null;
    return l[Math.min(i, l.length - 1)];
  }

  function actPlayer() {
    var p = b.p, a = b.pending, t, d, l;
    if (!a) return;
    if (a.type === "defend") { say(VILLAIN + " BRACES!"); sfx("cursor"); return; }
    if (a.type === "attack") {
      t = firstLive(a.t);
      d = physDmg(p.atk, t.def);
      p.lunge = 0.3;
      say(VILLAIN + " SLASHES " + t.name + "!");
      fx("slash", hc(t).x, hc(t).y, "#fff", 0.25);
      sfx("hit"); hurtHero(t, d);
    } else if (a.type === "bolt") {
      t = firstLive(a.t); p.mp -= 4;
      d = magDmg(p.atk + 8);
      say(VILLAIN + " CASTS DARK BOLT!");
      fx("bolt", hc(t).x, hc(t).y, "#c040ff", 0.35);
      sfx("bolt"); hurtHero(t, d);
    } else if (a.type === "drain") {
      t = firstLive(a.t); p.mp -= 6;
      d = magDmg(p.atk - 2);
      say(VILLAIN + " DRAINS " + t.name + "!");
      fx("burst", hc(t).x, hc(t).y, "#40e060", 0.5);
      fx("burst", LC.x, LC.y - 20, "#40e060", 0.5);
      sfx("magic"); hurtHero(t, d);
      var got = Math.min(d, p.max - p.hp);
      p.hp += got;
      if (got > 0) num(LC.x, LORD_POS.y + 10, got, "#60f080");
    } else if (a.type === "nova") {
      p.mp -= 14;
      say(VILLAIN + " UNLEASHES NOVA!");
      fx("screen", 0, 0, "#8020c0", 0.7);
      sfx("nova");
      l = liveHeroes();
      l.forEach(function (h) {
        fx("burst", hc(h).x, hc(h).y, "#d060ff", 0.6);
        hurtHero(h, magDmg(p.atk));
      });
    } else if (a.type === "potion") {
      b.items.potion--;
      var g1 = Math.min(60, p.max - p.hp); p.hp += g1;
      say(VILLAIN + " DRINKS A POTION");
      num(LC.x, LORD_POS.y + 10, g1, "#60f080");
      fx("burst", LC.x, LC.y - 20, "#60f080", 0.5);
      sfx("heal");
    } else if (a.type === "ether") {
      b.items.ether--;
      var g2 = Math.min(20, p.maxmp - p.mp); p.mp += g2;
      say(VILLAIN + " DRINKS AN ETHER");
      num(LC.x, LORD_POS.y + 10, g2 + "MP", "#60c0ff");
      fx("burst", LC.x, LC.y - 20, "#60c0ff", 0.5);
      sfx("heal");
    }
  }

  function actHero(h) {
    var p = b.p, d, ally, i, best;
    h.lunge = 0.3;
    if (h.id === "knight") {
      d = physDmg(h.atk, p.def);
      say("KNIGHT SLASHES " + VILLAIN + "!");
      fx("slash", LC.x, LC.y - 10, "#fff", 0.25); sfx("hit"); hurtLord(d);
    } else if (h.id === "thief") {
      say("THIEF STABS TWICE!");
      var d1 = Math.max(1, physDmg(h.atk, p.def)), d2 = Math.max(1, physDmg(h.atk, p.def));
      fx("slash", LC.x - 6, LC.y - 14, "#fff", 0.25); sfx("hit");
      hurtLord(d1 + d2);
    } else if (h.id === "bmage") {
      if (Math.random() < 0.6) {
        d = magDmg(24);
        say("B.MAGE CASTS FIRE!");
        fx("burst", LC.x, LC.y - 10, "#ff7020", 0.5); sfx("magic"); hurtLord(d);
      } else {
        say("B.MAGE POKES " + VILLAIN + "!");
        sfx("hit"); hurtLord(Math.max(1, physDmg(h.atk, p.def)));
      }
    } else if (h.id === "wmage") {
      best = null;
      for (i = 0; i < b.heroes.length; i++) {
        ally = b.heroes[i];
        if (!ally.dead && ally.hp < ally.max * 0.5 && (!best || ally.hp / ally.max < best.hp / best.max)) best = ally;
      }
      if (best) {
        var amt = Math.min(25, best.max - best.hp);
        best.hp += amt;
        say("W.MAGE CURES " + best.name + "!");
        num(hc(best).x, best.y, amt, "#60f080");
        fx("burst", hc(best).x, hc(best).y, "#a0ffb0", 0.5); sfx("heal");
      } else {
        say("W.MAGE BONKS " + VILLAIN + "!");
        sfx("hit"); hurtLord(Math.max(1, physDmg(h.atk, p.def)));
      }
    }
  }

  function afterAct() {
    if (!liveHeroes().length) {
      b.phase = "won"; b.timer = 1.4;
      setTrack("victory");
      return true;
    }
    if (b.p.hp <= 0) {
      b.phase = "lost"; b.timer = 1.4;
      sfx("die");
      setTrack("defeat");
      return true;
    }
    return false;
  }

  function commit(action) {
    var p = b.p;
    b.pending = action;
    p.defending = action.type === "defend";
    var order = [{ who: "p", s: p.spd + rnd(4) }];
    liveHeroes().forEach(function (h) { order.push({ who: h, s: h.spd + rnd(4) }); });
    order.sort(function (x, y) { return y.s - x.s; });
    b.order = order; b.idx = 0;
    b.phase = "run"; b.timer = 0.3;
    sfx("ok");
  }

  function stepRun() {
    while (b.idx < b.order.length) {
      var a = b.order[b.idx++];
      if (a.who === "p") actPlayer();
      else if (!a.who.dead) actHero(a.who);
      else continue;
      b.timer = 1.0;
      afterAct();
      return;
    }
    b.rounds++;
    b.phase = "cmd"; b.menu = 0; b.msg = "YOUR MOVE!";
  }

  function finishWin() {
    var s = game.save, p = b.p;
    var reward = Math.round(150 * (1 + 0.25 * s.wins));
    var lines = ["GOT " + reward + " EXP"];
    s.exp += reward;
    var oldHp = p.max;
    while (s.level < 20 && s.exp >= 100 * s.level) {
      s.exp -= 100 * s.level;
      s.level++;
      lines.push("LEVEL UP! LV " + s.level);
    }
    if (s.level > p.level) {
      var ns = statsFor(s.level);
      lines.push("HP " + oldHp + " > " + ns.hp);
      sfx("levelup");
    }
    s.wins++;
    writeSave(s);
    var score = Math.max(100, 1000 + p.hp * 5 - b.rounds * 30 + (s.wins - 1) * 250);
    Scores.add(GAME_ID, score);
    Scores.render(GAME_ID, scoresEl);
    scoreEl.textContent = score;
    lines.push("SCORE " + score);
    b.result = lines;
    b.phase = "result";
  }

  function targetClick(h) {
    var l = liveHeroes();
    b.tgt = l.indexOf(h);
  }

  function pickCommand(i) {
    sfx("ok");
    if (i === 0) { b.phase = "target"; b.pending = { type: "attack" }; b.tgt = 0; }
    else if (i === 1) { b.phase = "magic"; b.sub = 0; }
    else if (i === 2) { b.phase = "item"; b.sub = 0; }
    else commit({ type: "defend" });
  }

  function pickSpell(i) {
    if (i === SPELLS.length) { sfx("cancel"); b.phase = "cmd"; return; }
    var sp = SPELLS[i];
    if (b.p.mp < sp.mp) { sfx("err"); say("NOT ENOUGH MP!"); return; }
    if (sp.all) commit({ type: sp.id });
    else { sfx("ok"); b.phase = "target"; b.pending = { type: sp.id }; b.tgt = 0; }
  }

  function pickItem(i) {
    if (i === 2) { sfx("cancel"); b.phase = "cmd"; return; }
    var id = i === 0 ? "potion" : "ether";
    if (b.items[id] <= 0) { sfx("err"); return; }
    commit({ type: id });
  }

  function confirmTarget() {
    var a = { type: b.pending.type, t: b.tgt };
    commit(a);
  }

  function cancelBack() {
    if (b.phase === "target") {
      sfx("cancel");
      var ty = b.pending && b.pending.type;
      b.phase = (ty === "bolt" || ty === "drain") ? "magic" : "cmd";
    } else if (b.phase === "magic" || b.phase === "item") {
      sfx("cancel"); b.phase = "cmd";
    }
  }

  scenes.battle = {
    enter: function () { b = mkBattle(); setTrack("battle"); },
    update: function (dt) {
      b.t += dt;
      var p = b.p;
      p.flash = Math.max(0, p.flash - dt); p.shake = Math.max(0, p.shake - dt); p.lunge = Math.max(0, p.lunge - dt);
      b.heroes.forEach(function (h) {
        h.flash = Math.max(0, h.flash - dt); h.lunge = Math.max(0, h.lunge - dt);
        if (h.dead) h.fade = Math.max(0, h.fade - dt / 0.6);
      });
      b.nums.forEach(function (n) { n.t += dt; });
      b.nums = b.nums.filter(function (n) { return n.t < 1.0; });
      b.fx.forEach(function (f) { f.t += dt; });
      b.fx = b.fx.filter(function (f) { return f.t < f.dur; });

      if (b.phase === "intro") {
        b.timer -= dt;
        if (b.timer <= 0) { b.phase = "cmd"; b.msg = "YOUR MOVE!"; }
      } else if (b.phase === "run") {
        b.timer -= dt;
        if (b.timer <= 0) stepRun();
      } else if (b.phase === "won") {
        b.timer -= dt;
        if (b.timer <= 0) { say(VILLAIN + " IS VICTORIOUS!"); finishWin(); }
      } else if (b.phase === "lost") {
        b.timer -= dt;
        if (b.timer <= 0) { b.phase = "lostmenu"; b.msg = VILLAIN + " HAS FALLEN..."; b.endSel = 0; }
      }
    },
    key: function (a) {
      var l;
      if (b.phase === "cmd") {
        if (a === "up") { b.menu = (b.menu + 3) % 4; sfx("cursor"); }
        else if (a === "down") { b.menu = (b.menu + 1) % 4; sfx("cursor"); }
        else if (a === "ok") pickCommand(b.menu);
      } else if (b.phase === "magic") {
        var nm = SPELLS.length + 1;
        if (a === "up") { b.sub = (b.sub + nm - 1) % nm; sfx("cursor"); }
        else if (a === "down") { b.sub = (b.sub + 1) % nm; sfx("cursor"); }
        else if (a === "ok") pickSpell(b.sub);
        else if (a === "cancel") cancelBack();
      } else if (b.phase === "item") {
        if (a === "up") { b.sub = (b.sub + 2) % 3; sfx("cursor"); }
        else if (a === "down") { b.sub = (b.sub + 1) % 3; sfx("cursor"); }
        else if (a === "ok") pickItem(b.sub);
        else if (a === "cancel") cancelBack();
      } else if (b.phase === "target") {
        l = liveHeroes();
        if (a === "up" || a === "left") { b.tgt = (b.tgt + l.length - 1) % l.length; sfx("cursor"); }
        else if (a === "down" || a === "right") { b.tgt = (b.tgt + 1) % l.length; sfx("cursor"); }
        else if (a === "ok") confirmTarget();
        else if (a === "cancel") cancelBack();
      } else if (b.phase === "result") {
        if (a === "ok") { sfx("ok"); go("end"); }
      } else if (b.phase === "lostmenu") {
        if (a === "up" || a === "down") { b.endSel = 1 - b.endSel; sfx("cursor"); }
        else if (a === "ok") this.pickLost(b.endSel);
      }
    },
    pickLost: function (i) {
      sfx("ok");
      if (i === 0) go("battle"); else go("title");
    },
    contextClick: function () {
      if (b.phase === "target" || b.phase === "magic" || b.phase === "item") cancelBack();
    },
    click: function () {
      if (b.phase === "result") { sfx("ok"); go("end"); }
    },
    draw: function () {
      ctx.drawImage(BG_ROOM, 0, 0);
      var p = b.p;

      // heroes, back to front
      var sorted = b.heroes.slice().sort(function (a, c) { return a.y - c.y; });
      sorted.forEach(function (h) {
        if (h.fade <= 0) return;
        var bob = Math.floor(b.t * 2 + h.x / 20) % 2;
        var lx = h.lunge > 0 ? -Math.round(Math.sin(Math.PI * h.lunge / 0.3) * 14) : 0;
        shadow(h.x, h.y + 45, 32);
        var blink = h.dead && Math.floor(b.t * 20) % 2 === 0;
        drawSpr(h.spr, h.x + lx, h.y + bob, 2, h.flash > 0 || blink, h.dead ? h.fade : 1);
        if (!h.dead) {
          ctx.fillStyle = "#000"; ctx.fillRect(h.x + 2, h.y + 50, 28, 4);
          var pr = h.hp / h.max;
          ctx.fillStyle = pr > 0.5 ? "#40d060" : pr > 0.25 ? "#e0c030" : "#e03030";
          ctx.fillRect(h.x + 3, h.y + 51, Math.max(1, Math.round(26 * pr)), 2);
        }
      });

      // lord
      var llx = p.lunge > 0 ? Math.round(Math.sin(Math.PI * p.lunge / 0.3) * 18) : 0;
      var shk = p.shake > 0 ? (Math.random() < 0.5 ? -2 : 2) : 0;
      var lbob = Math.floor(b.t * 2) % 2;
      shadow(LORD_POS.x, LORD_POS.y + 61, 48);
      if (p.hp > 0 || b.phase !== "lostmenu") {
        drawSpr(SPR.lord, LORD_POS.x + llx + shk, LORD_POS.y + lbob, 2, p.flash > 0 && Math.floor(b.t * 30) % 2 === 0, p.hp <= 0 ? 0.5 : 1);
      } else {
        drawSpr(SPR.lord, LORD_POS.x, LORD_POS.y + 8, 2, false, 0.35);
      }

      // effects
      b.fx.forEach(function (f) {
        var k = f.t / f.dur, i;
        if (f.kind === "burst") {
          ctx.fillStyle = f.col;
          for (i = 0; i < 10; i++) {
            var ang = i / 10 * Math.PI * 2 + k * 2, r = 4 + k * 26;
            ctx.fillRect(Math.round(f.x + Math.cos(ang) * r) - 1, Math.round(f.y + Math.sin(ang) * r) - 1, 3, 3);
          }
        } else if (f.kind === "slash") {
          ctx.fillStyle = f.col;
          for (i = 0; i < 20; i++) {
            if (i / 20 > k * 1.5) break;
            ctx.fillRect(f.x - 14 + i, f.y - 14 + i * 1.4, 3, 3);
          }
        } else if (f.kind === "bolt") {
          ctx.fillStyle = f.col;
          var zx = f.x;
          for (var yy = 0; yy < f.y; yy += 8) {
            zx = f.x + ((yy / 8) % 2 ? 6 : -6);
            ctx.fillRect(zx, yy, 4, 9);
          }
          ctx.fillStyle = "#fff"; ctx.fillRect(f.x - 3, f.y - 3, 8, 8);
        } else if (f.kind === "screen") {
          ctx.globalAlpha = 0.5 * (1 - k);
          ctx.fillStyle = f.col; ctx.fillRect(0, 0, W, 164);
          ctx.globalAlpha = 1;
        }
      });

      b.nums.forEach(function (n) {
        var ny = Math.round(n.y - Math.min(n.t, 0.3) * 40);
        var nx = Math.round(n.x - textW(n.txt, 2) / 2);
        text(n.txt, nx + 1, ny + 1, "#000", 2);
        text(n.txt, nx, ny, n.col, 2);
      });

      this.drawUI();
    },
    drawUI: function () {
      var p = b.p, self = this, i;

      // message window
      win(4, 2, 248, 20);
      var m = b.msg;
      if (b.phase === "target") {
        var th = firstLive(b.tgt);
        m = "TARGET: " + (th ? th.name : "");
      }
      text(m, 10, 7, "#fff", 2);

      // bottom-left window
      win(4, 164, 124, 56);
      var cmd = [{ label: "ATTACK" }, { label: "MAGIC" }, { label: "ITEM" }, { label: "DEFEND" }];

      if (b.phase === "cmd") {
        menu(cmd, 10, 170, 12, 112, b.menu, function (i) {
          if (b.menu !== i) { b.menu = i; sfx("cursor"); }
        }, pickCommand);
      } else if (b.phase === "magic") {
        var sp = SPELLS.map(function (s) { return { label: s.name, right: s.mp + "MP", dim: p.mp < s.mp }; });
        sp.push({ label: "BACK" });
        menu(sp, 10, 170, 12, 112, b.sub, function (i) {
          if (b.sub !== i) { b.sub = i; sfx("cursor"); }
        }, pickSpell);
      } else if (b.phase === "item") {
        var it = [
          { label: "POTION", right: "X" + b.items.potion, dim: b.items.potion <= 0 },
          { label: "ETHER", right: "X" + b.items.ether, dim: b.items.ether <= 0 },
          { label: "BACK" }
        ];
        menu(it, 10, 170, 12, 112, b.sub, function (i) {
          if (b.sub !== i) { b.sub = i; sfx("cursor"); }
        }, pickItem);
      } else if (b.phase === "target") {
        menu([{ label: "BACK" }], 10, 170, 12, 112, -1, function () {}, function () { cancelBack(); });
        text("CLICK A HERO", 14, 194, "#ffe070", 1);
        text("RIGHT CLICK: BACK", 14, 204, "#a0a8d8", 1);
        var live = liveHeroes();
        if (live.length) {
          var tg = firstLive(b.tgt);
          pointer(tg.x - 9, tg.y + 20);
          live.forEach(function (h) {
            region(h.x - 4, h.y, 40, 52, function () { if (firstLive(b.tgt) !== h) { targetClick(h); sfx("cursor"); } },
              function () { targetClick(h); confirmTarget(); });
          });
        }
      } else if (b.phase === "lostmenu") {
        menu([{ label: "RETRY" }, { label: "TITLE" }], 10, 176, 14, 112, b.endSel, function (i) {
          if (b.endSel !== i) { b.endSel = i; sfx("cursor"); }
        }, function (i) { self.pickLost(i); });
      }

      // bottom-right status
      win(132, 164, 120, 56);
      text(VILLAIN, 140, 170, "#ffe070", 2);
      text("LV" + p.level, 252 - 8 - textW("LV" + p.level, 1), 173, "#a0a8d8", 1);
      text("HP " + p.hp + "/" + p.max, 140, 184, p.hp < p.max * 0.25 ? "#ff6060" : "#fff", 2);
      text("MP " + p.mp + "/" + p.maxmp, 140, 198, "#fff", 2);

      // result overlay
      if (b.phase === "result") {
        var h = 20 + b.result.length * 14 + 16;
        win(48, 40, 160, h);
        ctext("VICTORY!", 48, "#ffe070", 2);
        for (i = 0; i < b.result.length; i++) ctext(b.result[i], 66 + i * 14, "#fff", 2);
        if (Math.floor(b.t * 2) % 2) ctext("CLICK OR ENTER", 40 + h - 12, "#a0a8d8", 1);
        region(0, 0, W, H, function () {}, function () { sfx("ok"); go("end"); });
      }
    }
  };

  /* end card */
  scenes.end = {
    enter: function () { this.t = 0; this.sel = 0; setTrack("title"); },
    update: function (dt) { this.t += dt; },
    pick: function (i) {
      sfx("ok");
      if (i === 0) go("battle"); else go("title");
    },
    key: function (a) {
      if (a === "up" || a === "down") { this.sel = 1 - this.sel; sfx("cursor"); }
      else if (a === "ok") this.pick(this.sel);
    },
    draw: function () {
      var self = this, s = game.save;
      ctx.fillStyle = "#04020a"; ctx.fillRect(0, 0, W, H);
      drawStars(this.t, H);
      ctext("CHAPTER ONE COMPLETE", 24, "#ffe070", 2);
      ctext("THE HEROES HAVE FALLEN.", 52, "#fff", 2);
      ctext("BUT THE WORLD IS WIDE,", 68, "#fff", 2);
      ctext("AND MORE CHAMPIONS", 84, "#fff", 2);
      ctext("WILL COME.", 100, "#fff", 2);
      ctext("THE OVERWORLD IS COMING SOON.", 126, "#ff8090", 1);
      ctext("LV " + s.level + "   BATTLES WON " + s.wins, 140, "#a0a8d8", 1);
      win(64, 158, 128, 44);
      menu([{ label: "FIGHT AGAIN" }, { label: "TITLE" }], 70, 166, 14, 116, this.sel, function (i) {
        if (self.sel !== i) { self.sel = i; sfx("cursor"); }
      }, function (i) { self.pick(i); });
    }
  };

  /* --------------------------------------------------------------- input */

  var KEYMAP = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    Enter: "ok", Space: "ok", KeyZ: "ok", Escape: "cancel", KeyX: "cancel", Backspace: "cancel"
  };

  window.addEventListener("keydown", function (e) {
    if (e.code === "KeyM") { audioInit(); setMuted(!muted); return; }
    var a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    audioInit();
    if (fade.state !== "none") return;
    if (e.repeat && (a === "ok" || a === "cancel")) return;
    if (cur.key) cur.key(a);
  });

  canvas.addEventListener("mousemove", function (e) {
    var m = toCanvas(e);
    mouse.x = m.x; mouse.y = m.y;
    var r = fade.state === "none" ? hitAt(m.x, m.y) : null;
    canvas.style.cursor = r || (cur && cur.click && !cur.noClick) ? "pointer" : "default";
    if (r && r.hover) r.hover();
  });

  canvas.addEventListener("mousedown", function (e) {
    e.preventDefault();
    audioInit();
    if (fade.state !== "none") return;
    var m = toCanvas(e);
    mouse.x = m.x; mouse.y = m.y;
    if (e.button === 2) {
      if (cur.contextClick) cur.contextClick();
      else if (cur.key) cur.key("cancel");
      return;
    }
    if (e.button !== 0) return;
    var r = hitAt(m.x, m.y);
    if (r) { if (r.click) r.click(); return; }
    if (cur.click) cur.click();
  });

  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  window.addEventListener("blur", function () { if (actx && actx.state === "running") actx.suspend(); });
  window.addEventListener("focus", function () { if (actx && actx.state === "suspended") actx.resume(); });
  canvas.addEventListener("mouseenter", function () { if (actx && actx.state === "suspended") actx.resume(); });

  /* ---------------------------------------------------------------- loop */

  var last = performance.now();

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (fade.state === "out") {
      fade.a += dt / 0.3;
      if (fade.a >= 1) {
        fade.a = 1;
        cur = scenes[fade.next];
        cur.enter(fade.args);
        fade.state = "in";
      }
    } else if (fade.state === "in") {
      fade.a -= dt / 0.3;
      if (fade.a <= 0) { fade.a = 0; fade.state = "none"; }
    }

    if (fade.state !== "out" && cur.update) cur.update(dt);

    hits.length = 0;
    cur.draw();

    if (fade.a > 0) {
      ctx.globalAlpha = fade.a;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }

  cur = scenes.title;
  cur.enter();
  requestAnimationFrame(frame);
})();
