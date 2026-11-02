(function () {
  var GAME_ID = "stick-front";
  // World units; the canvas is drawn at SCALE so everything looks a bit smaller and more map fits.
  var W = 1000, H = 700;
  var GY = 640; // ground line (y of feet)
  var GRAVITY = 1800;
  var HP = 3;         // player and enemies share the same health and damage model

  // The base: one fixed screen. Rooftops and tower decks are one-way surfaces you can
  // jump up through and land on (S drops through). `top` is the y of the standing surface.
  var STRUCTS = [
    { type: "tower",   x: 30,  w: 56,  top: 450 },
    { type: "wall",    x: 100, w: 100, top: 565 },
    { type: "bunker",  x: 215, w: 120, top: 520 },
    { type: "deck",    x: 350, w: 130, top: 390, high: true },
    { type: "deck",    x: 520, w: 130, top: 390, high: true },
    { type: "deck",    x: 435, w: 130, top: 270, high: true },
    { type: "command", x: 665, w: 120, top: 510 },
    { type: "wall",    x: 800, w: 90,  top: 565 },
    { type: "tower",   x: 914, w: 56,  top: 450 }
  ];
  // Ground units can only reach the lower structures; the high decks are for the player.
  var POSTS = STRUCTS.filter(function (s) { return !s.high; });

  // One rifle for everybody (first pass).
  var RIFLE = {
    rpm: 600,          // rounds per minute
    mag: 30,
    reload: 1.5,       // seconds
    speed: 1600,       // px/s
    dmg: 1,
    headMult: 3,
    muzzle: 28
  };

  // Enemy archetypes. `sc` scales the figure (and its hitboxes) around the feet.
  var TYPES = {
    grunt:     { hp: 3, color: "#ff4d5e", score: 100, sc: 1 },
    runner:    { hp: 2, color: "#ff9a3d", score: 125, sc: 1 },
    heavy:     { hp: 6, color: "#e0405e", score: 300, sc: 1.3 },
    grenadier: { hp: 3, color: "#c27bff", score: 150, sc: 1 },
    sniper:    { hp: 2, color: "#ff4dd2", score: 250, sc: 1 }
  };
  var PHASE_LEN = 50;   // seconds of play per step of the day -> dusk -> night progression
  var SLOW_T = 0.45;    // real seconds of slow motion after a headshot kill
  var SLOW_SCALE = 0.3;
  var COMBO_WINDOW = 8; // seconds without a kill before the streak lapses
  var BOMBER_HP = 5;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var SCALE = canvas.width / W;
  var scoreEl = document.getElementById("score");
  var scoresEl = document.getElementById("scores");

  var keys = {};
  var mouse = { x: W * 0.75, y: GY - 50, down: false };
  var state = "ready"; // ready | playing | paused | over
  var player, enemies, bullets, particles, camX, time, score, kills;
  var spawnTimer, shake, hurtFlash, lastTs, bloom;
  var grenades, bombers, rings, floaters, hitMark, slowmo, kcam;
  var streak, comboTimer, bomberTimer;

  Scores.render(GAME_ID, scoresEl);

  // ---------- helpers ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // Gravity + landing on the ground or a structure top. Shared by the player and enemies.
  function stepBody(f, dt, drop) {
    var prevY = f.y;
    if (f.chute) f.vy = 75; // parachuting: constant slow descent
    else f.vy += GRAVITY * dt;
    f.y += f.vy * dt;
    var landed = false;
    if (f.y >= GY) { f.y = GY; landed = true; }
    else if (f.vy >= 0 && !drop) {
      for (var i = 0; i < STRUCTS.length; i++) {
        var s = STRUCTS[i];
        if (f.x >= s.x - 4 && f.x <= s.x + s.w + 4 && prevY <= s.top && f.y >= s.top) {
          f.y = s.top; landed = true; break;
        }
      }
    }
    if (landed) { f.vy = 0; f.onGround = true; f.jumps = 0; f.chute = false; }
    else f.onGround = false;
  }

  function tryJump() {
    var p = player;
    if (p.onGround) { p.vy = -620; p.onGround = false; p.jumps = 1; }
    else {
      if (p.jumps === 0) p.jumps = 1; // walked off a ledge: the air jump is still the second one
      if (p.jumps < 2) {
        p.vy = -620; p.jumps = 2;
        sparks(p.x, p.y, "#2de2ff", 6);
      }
    }
  }

  // ---------- setup ----------
  function reset() {
    player = {
      x: W / 2, y: GY, vx: 0, vy: 0, hp: HP, jumps: 0, ammo: RIFLE.mag, reloading: 0,
      cooldown: 0, walk: 0, aim: 0, recoil: 0, flash: 0, onGround: true, kneel: 0, spread: 0.03
    };
    enemies = [];
    bullets = [];
    particles = [];
    camX = 0; // the screen never scrolls
    time = 0;
    score = 0;
    kills = 0;
    spawnTimer = 1.2;
    shake = 0;
    hurtFlash = 0;
    bloom = 0;
    grenades = [];
    bombers = [];
    rings = [];
    floaters = [];
    hitMark = null;
    slowmo = 0;
    kcam = { x: W / 2, y: GY - 60 };
    streak = 0;
    comboTimer = 0;
    bomberTimer = 35;
    scoreEl.textContent = 0;
  }

  function comboMult() { return Math.min(6, 1 + Math.floor(streak / 3)); }

  function floater(x, y, text, color, big) {
    floaters.push({ x: x, y: y, text: text, color: color, life: 1.1, max: 1.1, big: !!big });
  }

  // Returns true if the hit killed the player.
  function hurtPlayer(n) {
    player.hp -= n;
    hurtFlash = 0.35;
    shake = Math.max(shake, 5);
    streak = 0;
    if (player.hp <= 0) { player.hp = 0; gameOver(); return true; }
    return false;
  }

  function explode(x, y, r) {
    rings.push({ x: x, y: y, r: r, life: 0.4, max: 0.4 });
    sparks(x, y, "#ffb347", 18);
    sparks(x, y, "#ff4d5e", 8);
    shake = Math.max(shake, 7);
    var dx = player.x - x, dy = (player.y - 26) - y;
    if (dx * dx + dy * dy < r * r) hurtPlayer(1);
  }

  // ---------- day / dusk / night ----------
  function phase() { return clamp(time / PHASE_LEN, 0, 2); } // 0 day, 1 dusk, 2 night
  function nightAmt() { return clamp(phase() - 0.8, 0, 1); }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  // Blend through three keyframes (day, dusk, night) by the current phase.
  function sky3(day, dusk, night) {
    var p = phase(), a, b, t;
    if (p < 1) { a = day; b = dusk; t = p; } else { a = dusk; b = night; t = p - 1; }
    var ca = hexRgb(a), cb = hexRgb(b);
    return "rgb(" + Math.round(ca[0] + (cb[0] - ca[0]) * t) + "," + Math.round(ca[1] + (cb[1] - ca[1]) * t) + "," +
      Math.round(ca[2] + (cb[2] - ca[2]) * t) + ")";
  }

  var HIGH = STRUCTS.filter(function (s) { return s.high; });

  // Where a sniper can drop in and land on a high deck without catching a higher deck first.
  function sniperSpot() {
    var d = HIGH[Math.floor(Math.random() * HIGH.length)];
    var x0 = d.x + 14, x1 = d.x + d.w - 14;
    HIGH.forEach(function (o) {
      if (o.top >= d.top) return;
      if (o.x <= d.x + d.w / 2) x0 = Math.max(x0, o.x + o.w + 6);
      else x1 = Math.min(x1, o.x - 6);
    });
    return { post: d, x: rand(x0, Math.max(x0, x1)) };
  }

  function countType(t) {
    return enemies.filter(function (e) { return !e.dead && e.type === t; }).length;
  }

  function pickType() {
    var w = { grunt: 10 };
    if (time > 12) w.runner = 3 + Math.min(4, time / 30);
    if (time > 25 && countType("grenadier") < 2) w.grenadier = 3;
    if (time > 35 && countType("sniper") < 2) w.sniper = 2.5;
    if (time > 45 && countType("heavy") < 2) w.heavy = 2.5;
    var total = 0, k;
    for (k in w) total += w[k];
    var r = Math.random() * total;
    for (k in w) { r -= w[k]; if (r <= 0) return k; }
    return "grunt";
  }

  function newEnemy(type) {
    var T = TYPES[type];
    var side = Math.random() < 0.5 ? -1 : 1;
    var post = null, para = false, sx = 0;
    if (type === "grunt" || type === "grenadier") {
      // Some attackers head for a rooftop or tower deck and fight from up there.
      post = Math.random() < (type === "grunt" ? 0.45 : 0.3) ? POSTS[Math.floor(Math.random() * POSTS.length)] : null;
      // Some drop in by parachute instead of walking in from the edges.
      para = Math.random() < 0.3;
      if (para) post = null;
    } else if (type === "sniper") {
      var spot = sniperSpot();
      post = spot.post; para = true; sx = spot.x;
    }
    var speed = rand(60, 95);
    if (type === "runner") speed = rand(170, 215);
    else if (type === "heavy") speed = rand(34, 48);
    var tx = post ? (type === "sniper" ? sx : rand(post.x + 14, post.x + post.w - 14)) : 0;
    return {
      type: type, sc: T.sc, color: T.color, maxhp: T.hp,
      x: type === "sniper" ? sx : para ? rand(80, W - 80) : side < 0 ? -30 : W + 30, y: para ? -50 : GY, vx: 0, vy: 0, hp: T.hp,
      onGround: !para, chute: para, jumps: 0,
      post: post, tx: tx,
      walk: Math.random() * 6, aim: 0,
      range: type === "runner" ? 35 : type === "grenadier" ? rand(300, 420) : rand(220, 380),
      rangeTimer: type === "runner" ? 1e9 : rand(2, 4),
      burst: 0, burstTimer: rand(0.8, 1.8), shotTimer: 0, flash: 0, dead: 0, fall: 0,
      speed: speed, hit: 0,
      nadeTimer: rand(1.2, 2.2),            // grenadier: time to next throw
      charge: 0, locked: false, snipeTimer: rand(1.5, 3) // sniper: laser charge / lock / wait
    };
  }

  // ---------- firing ----------
  function shoot(owner, x, y, angle, spread, opts) {
    var a = angle + (Math.random() - 0.5) * 2 * spread;
    var sp = (opts && opts.speed) || (owner === "player" ? RIFLE.speed : RIFLE.speed * 0.6);
    bullets.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      owner: owner, life: 1.4, dmg: (opts && opts.dmg) || 1, heavy: !!(opts && opts.dmg)
    });
    for (var i = 0; i < 3; i++) {
      particles.push({
        x: x, y: y, vx: Math.cos(a) * rand(60, 200) + rand(-40, 40), vy: Math.sin(a) * rand(60, 200) + rand(-40, 40),
        life: 0.08, max: 0.08, color: "#ffd84a", len: 4
      });
    }
  }

  function gunOrigin(f) { return { x: f.x, y: f.y - 42 * (f.sc || 1) + (f.kneel || 0) * 18 }; }

  function playerFire() {
    var o = gunOrigin(player);
    var mx = o.x + Math.cos(player.aim) * RIFLE.muzzle;
    var my = o.y + Math.sin(player.aim) * RIFLE.muzzle;
    shoot("player", mx, my, player.aim, player.spread);
    player.ammo--;
    player.cooldown = 60 / RIFLE.rpm;
    player.recoil = 1;
    player.flash = 0.05;
    bloom = Math.min(1, bloom + 0.12);
    shake = Math.max(shake, 1.5);
    // shell casing
    particles.push({
      x: o.x, y: o.y, vx: -Math.cos(player.aim) * rand(20, 60) + rand(-20, 20), vy: rand(-140, -60),
      life: 0.5, max: 0.5, color: "#c9b36b", len: 3, grav: true
    });
  }

  function startReload() {
    if (player.reloading > 0 || player.ammo === RIFLE.mag) return;
    player.reloading = RIFLE.reload;
  }

  // ---------- hit tests ----------
  function hitFigure(f, px, py) {
    // returns 0 (miss), 1 (body), 2 (head)
    var sc = f.sc || 1, kn = (f.kneel || 0) * 18;
    var hy = f.y - 58 * sc + kn;
    var dx = px - f.x, dy = py - hy;
    if (dx * dx + dy * dy <= 64 * sc * sc) return 2;
    if (Math.abs(px - f.x) <= 9 * sc && py >= f.y - 50 * sc + kn && py <= f.y) return 1;
    return 0;
  }

  function sparks(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2), s = rand(40, 180);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.35, max: 0.35, color: color, len: 3, grav: true });
    }
  }

  // ---------- update ----------
  function update(dt) {
    time += dt;
    var p = player;

    // movement
    var move = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    var wantKneel = (keys.shift && p.onGround) ? 1 : 0;
    p.kneel += (wantKneel - p.kneel) * Math.min(1, dt * 16);
    var topSpeed = wantKneel ? 70 : 190;
    p.vx += (move * topSpeed - p.vx) * Math.min(1, dt * 12);
    p.x = clamp(p.x + p.vx * dt, 12, W - 12);
    stepBody(p, dt, keys.s || keys.arrowdown);
    if (p.onGround) p.walk += Math.abs(p.vx) * dt * 0.06;

    // aiming
    var o = gunOrigin(p);
    p.aim = Math.atan2(mouse.y - o.y, mouse.x + camX - o.x);

    // accuracy: only a stationary kneeling shot is spot on; everything else wanders a little
    var moving = Math.abs(p.vx) > 12 || !p.onGround;
    var steady = p.kneel > 0.9 && !moving;
    var target = steady ? 0
      : (p.kneel > 0.5 ? 0.018 : 0.03) + (moving ? (p.onGround ? 0.035 : 0.07) : 0) + bloom * 0.05;
    p.spread += (target - p.spread) * Math.min(1, dt * (target < p.spread ? 14 : 30));
    if (steady && p.spread < 0.002) p.spread = 0;

    // weapon
    p.cooldown -= dt;
    p.recoil = Math.max(0, p.recoil - dt * 12);
    p.flash -= dt;
    bloom = Math.max(0, bloom - dt * 0.9);
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) { p.ammo = RIFLE.mag; p.reloading = 0; }
    } else if (mouse.down && p.cooldown <= 0) {
      if (p.ammo > 0) playerFire();
      else startReload();
    }
    if (p.ammo === 0) startReload();

    // spawning: ramps up over time
    spawnTimer -= dt;
    var maxAlive = Math.min(3 + Math.floor(time / 20), 10);
    var interval = Math.max(0.6, 2.4 - time * 0.02);
    var alive = enemies.filter(function (e) { return !e.dead; }).length;
    if (spawnTimer <= 0 && alive < maxAlive) {
      enemies.push(newEnemy(pickType()));
      spawnTimer = interval * rand(0.7, 1.3);
    } else if (spawnTimer <= 0) {
      spawnTimer = 0.3;
    }

    // bombers fly over now and then
    bomberTimer -= dt;
    if (bomberTimer <= 0 && time > 30) {
      var bd = Math.random() < 0.5 ? 1 : -1;
      bombers.push({ x: bd > 0 ? -60 : W + 60, y: rand(70, 120), dir: bd, speed: rand(150, 200), hp: BOMBER_HP, hit: 0, drop: rand(0.4, 0.9), dead: 0, ph: rand(0, 6) });
      bomberTimer = rand(28, 42);
    }
    bombers.forEach(function (b) {
      b.hit = Math.max(0, b.hit - dt);
      b.x += b.dir * b.speed * dt;
      b.y += Math.sin(time * 2 + b.ph) * 18 * dt;
      b.drop -= dt;
      if (b.drop <= 0 && b.x > 20 && b.x < W - 20 && Math.abs(b.x + b.dir * 90 - p.x) < 150) {
        grenades.push({ kind: "bomb", x: b.x, y: b.y + 12, vx: b.dir * b.speed * 0.8, vy: 40, fuse: 5, r: 80 });
        b.drop = rand(0.8, 1.3);
      }
      if ((b.dir > 0 && b.x > W + 90) || (b.dir < 0 && b.x < -90)) b.dead = 1;
    });
    bombers = bombers.filter(function (b) { return !b.dead; });

    // grenades and bombs
    grenades.forEach(function (g) {
      var prevY = g.y;
      g.vy += (g.kind === "bomb" ? 1100 : 900) * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.fuse -= dt;
      var hitSurface = g.y >= GY;
      if (hitSurface) g.y = GY;
      else if (g.vy > 0) {
        for (var i = 0; i < STRUCTS.length; i++) {
          var s = STRUCTS[i];
          if (g.x >= s.x - 4 && g.x <= s.x + s.w + 4 && prevY <= s.top && g.y >= s.top) { g.y = s.top; hitSurface = true; break; }
        }
      }
      if (hitSurface) {
        if (g.kind === "bomb") g.fuse = 0;
        else { g.vy *= -0.4; g.vx *= 0.6; if (Math.abs(g.vy) < 40) g.vy = 0; }
      }
      if (g.fuse <= 0) { g.done = true; explode(g.x, g.y, g.r); }
    });
    grenades = grenades.filter(function (g) { return !g.done; });
    if (state !== "playing") return;

    // enemies
    enemies.forEach(function (e) { updateEnemy(e, dt); });
    enemies = enemies.filter(function (e) { return e.dead < 1.6; });

    // bullets (swept in small steps so fast shots can't tunnel)
    bullets.forEach(function (b) {
      b.life -= dt;
      var dist = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
      var steps = Math.max(1, Math.ceil(dist / 5));
      for (var s = 0; s < steps && b.life > 0; s++) {
        b.x += b.vx * dt / steps;
        b.y += b.vy * dt / steps;
        if (b.y >= GY) {
          b.life = 0;
          for (var i = 0; i < 4; i++) {
            particles.push({ x: b.x, y: GY, vx: rand(-60, 60), vy: rand(-120, -30), life: 0.35, max: 0.35, color: "#8a7a5a", len: 2, grav: true });
          }
          break;
        }
        if (b.owner === "player") {
          for (var j = 0; j < enemies.length; j++) {
            var e = enemies[j];
            if (e.dead) continue;
            var part = hitFigure(e, b.x, b.y);
            if (part) {
              e.hp -= RIFLE.dmg * (part === 2 ? RIFLE.headMult : 1);
              e.hit = 0.1;
              sparks(b.x, b.y, "#ff4d5e", part === 2 ? 10 : 5);
              b.life = 0;
              if (e.hp <= 0) killEnemy(e, part === 2);
              hitMark = { life: 0.18, max: 0.18, head: part === 2, kill: e.hp <= 0 };
              break;
            }
          }
          if (b.life > 0) {
            for (var k = 0; k < bombers.length; k++) {
              var bm = bombers[k];
              if (Math.abs(b.x - bm.x) < 30 && Math.abs(b.y - bm.y) < 14) {
                bm.hp--; bm.hit = 0.1; b.life = 0;
                sparks(b.x, b.y, "#ffb347", 5);
                hitMark = { life: 0.18, max: 0.18, head: false, kill: bm.hp <= 0 };
                if (bm.hp <= 0) killBomber(bm);
                break;
              }
            }
          }
        } else if (state === "playing") {
          var hp2 = hitFigure(p, b.x, b.y);
          if (hp2) {
            var dmg = b.heavy ? b.dmg : b.dmg * (hp2 === 2 ? RIFLE.headMult : 1);
            sparks(b.x, b.y, "#ff4d5e", 6);
            b.life = 0;
            if (hurtPlayer(dmg)) return;
          }
        }
        if (b.life <= 0) break;
      }
    });
    if (state !== "playing") return;
    bullets = bullets.filter(function (b) { return b.life > 0 && Math.abs(b.x - p.x) < 1400; });
    bombers = bombers.filter(function (b) { return b.hp > 0; });

    // combo lapses if you stop killing; decorations tick down
    if (streak > 0) { comboTimer -= dt; if (comboTimer <= 0) streak = 0; }
    if (hitMark && (hitMark.life -= dt) <= 0) hitMark = null;
    floaters.forEach(function (f) { f.life -= dt; f.y -= 40 * dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });
    rings.forEach(function (r) { r.life -= dt; });
    rings = rings.filter(function (r) { return r.life > 0; });

    // particles
    particles.forEach(function (pt) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.grav) { pt.vy += 700 * dt; if (pt.y > GY) { pt.y = GY; pt.vy = 0; pt.vx *= 0.5; } }
    });
    particles = particles.filter(function (pt) { return pt.life > 0; });

    shake = Math.max(0, shake - dt * 20);
    hurtFlash = Math.max(0, hurtFlash - dt);
  }

  function addScore(base, mult) {
    var pts = Math.round(base * mult);
    score += pts;
    scoreEl.textContent = score;
    return pts;
  }

  function killEnemy(e, headshot) {
    e.dead = 0.001;
    e.chute = false;
    e.locked = false;
    kills++;
    streak += headshot ? 2 : 1;
    comboTimer = COMBO_WINDOW;
    var mult = comboMult();
    var pts = addScore(TYPES[e.type].score * (headshot ? 1.5 : 1), mult);
    floater(e.x, e.y - 70 * e.sc, (headshot ? "HEADSHOT +" : "+") + pts + (mult > 1 ? " x" + mult : ""), headshot ? "#ffd84a" : "#ffffff", headshot);
    if (headshot) {
      slowmo = SLOW_T;
      kcam = { x: e.x - camX, y: e.y - 50 * e.sc };
    }
  }

  function killBomber(b) {
    b.dead = 1;
    kills++;
    streak += 2;
    comboTimer = COMBO_WINDOW;
    var mult = comboMult();
    var pts = addScore(500, mult);
    floater(b.x, b.y - 20, "BOMBER DOWN +" + pts + (mult > 1 ? " x" + mult : ""), "#ffb347", true);
    rings.push({ x: b.x, y: b.y, r: 60, life: 0.5, max: 0.5 });
    sparks(b.x, b.y, "#ffb347", 24);
    sparks(b.x, b.y, "#ff4d5e", 12);
    shake = Math.max(shake, 6);
  }

  function updateEnemy(e, dt) {
    if (e.dead) {
      e.dead += dt;
      e.fall = Math.min(1, e.dead / 0.35);
      e.vx = 0;
      stepBody(e, dt, false);
      return;
    }
    e.hit = Math.max(0, e.hit - dt);
    e.flash -= dt;
    var dx = player.x - e.x;
    var dist = Math.abs(dx);
    var dir = dx >= 0 ? 1 : -1;
    var want = 0;

    if (e.chute) {
      // drift toward the player's side of the base while descending (snipers drop straight onto their deck)
      want = dist > 60 && e.type !== "sniper" ? dir * 0.5 : 0;
    } else if (e.post) {
      // climb to the assigned rooftop and hold it
      var s = e.post;
      var onTop = e.onGround && Math.abs(e.y - s.top) < 1;
      if (!onTop) {
        var d = e.tx - e.x;
        if (Math.abs(d) > 4) want = d > 0 ? 1 : -1;
        if (Math.abs(d) < 30 && e.y > s.top + 1) {
          if (e.onGround) { e.vy = -620; e.onGround = false; e.jumps = 1; }
          else if (e.jumps === 1 && e.vy > -100 && e.y > s.top + 30) { e.vy = -620; e.jumps = 2; }
        }
      }
    } else {
      // keep a preferred range, wander it now and then
      e.rangeTimer -= dt;
      if (e.rangeTimer <= 0) { e.range = e.type === "grenadier" ? rand(300, 420) : rand(220, 380); e.rangeTimer = rand(2, 4); }
      if (dist > e.range + 30) want = dir;
      else if (dist < e.range - 40) want = -dir;
    }
    e.vx += (want * e.speed - e.vx) * Math.min(1, dt * 8);
    e.x = clamp(e.x + e.vx * dt, -60, W + 60);
    stepBody(e, dt, false);
    e.walk += Math.abs(e.vx) * dt * 0.06;

    // runners are suicide rushers
    if (e.type === "runner" && Math.abs(player.x - e.x) < 20 && Math.abs(player.y - e.y) < 40) {
      e.dead = 0.001;
      explode(e.x, e.y - 20, 36);
      return;
    }

    // aim at the player's chest
    var o = gunOrigin(e);
    if (!e.locked) e.aim = Math.atan2((player.y - 30 + player.kneel * 10) - o.y, player.x - o.x);

    // only shoot once on screen
    var onScreen = Math.abs(e.x - (camX + W / 2)) < W / 2 - 10 && e.y > 20;
    if (!onScreen) return;

    if (e.type === "grenadier") {
      e.nadeTimer -= dt;
      if (e.nadeTimer <= 0 && !e.chute) {
        // lob an arc that lands near the player's feet
        var T = clamp(Math.abs(player.x - e.x) / 330, 0.6, 1.3), g = 900;
        var tx = player.x + player.vx * T * 0.3, ty = player.y - 4;
        grenades.push({
          kind: "nade", x: o.x, y: o.y - 6, r: 70, fuse: T + 0.55,
          vx: (tx - o.x) / T, vy: ((ty - o.y) - 0.5 * g * T * T) / T
        });
        e.nadeTimer = rand(2.4, 3.8);
        e.flash = 0.05;
      }
      return;
    }
    if (e.type === "sniper") {
      if (e.chute || !e.onGround) return;
      if (e.charge > 0) {
        e.charge -= dt;
        if (e.charge < 0.45 && !e.locked) e.locked = true; // aim freezes: time to move
        if (e.charge <= 0) {
          e.locked = false;
          shoot("enemy", o.x + Math.cos(e.aim) * RIFLE.muzzle, o.y + Math.sin(e.aim) * RIFLE.muzzle, e.aim, 0, { speed: 2400, dmg: 2 });
          e.flash = 0.08;
          e.snipeTimer = rand(2.8, 4.2);
        }
      } else {
        e.snipeTimer -= dt;
        if (e.snipeTimer <= 0) e.charge = 1.5;
      }
      return;
    }

    e.burstTimer -= dt;
    if (e.burst > 0) {
      e.shotTimer -= dt;
      if (e.shotTimer <= 0) {
        var spread = clamp(0.07 - time * 0.0003, 0.035, 0.07) + dist * 0.00008;
        shoot("enemy", o.x + Math.cos(e.aim) * RIFLE.muzzle, o.y + Math.sin(e.aim) * RIFLE.muzzle, e.aim, spread);
        e.flash = 0.05;
        e.burst--;
        e.shotTimer = 60 / RIFLE.rpm;
      }
    } else if (e.burstTimer <= 0) {
      e.burst = (e.type === "heavy" ? 3 : 1) + Math.floor(Math.random() * 3);
      e.shotTimer = 0.25; // brief wind-up so the player can react
      e.burstTimer = rand(1.1, 2.3);
    }
  }

  function gameOver() {
    state = "over";
    mouse.down = false;
    Scores.add(GAME_ID, score);
    Scores.render(GAME_ID, scoresEl);
  }

  // ---------- drawing ----------
  var LINE = "#cfd8ff";

  function line(x1, y1, x2, y2) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }

  function drawBackground() {
    // sky
    var g = ctx.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, sky3("#3d78c4", "#3b2a6b", "#0b1030"));
    g.addColorStop(1, sky3("#a8d8f0", "#e0794a", "#27234a"));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars come out at night
    var na = nightAmt();
    if (na > 0.1) {
      ctx.fillStyle = "#cfd8ff";
      for (var si = 0; si < 40; si++) {
        ctx.globalAlpha = na * (0.3 + hash(si + 9) * 0.5);
        ctx.fillRect(hash(si) * W, hash(si + 50) * (GY - 200), 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // sun sinks at dusk, the moon rises after
    var ph = phase();
    ctx.strokeStyle = sky3("#fff2b0", "#ffb070", "#8c94c8");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(640, 70 + 120 * clamp(1 - Math.abs(ph - 1) * 2, 0, 1), 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // far hills (parallax 0.2)
    ctx.strokeStyle = sky3("#4f86b8", "#7a4a7a", "#2d3566");
    ctx.lineWidth = 2;
    ctx.beginPath();
    var fx = camX * 0.2;
    for (var x = -10; x <= W + 10; x += 10) {
      var wx = x + fx;
      var y = GY - 70 - Math.sin(wx * 0.011) * 22 - Math.sin(wx * 0.027 + 2) * 12;
      if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // perimeter fence (parallax 0.75)
    ctx.strokeStyle = "#4a5688";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var f2 = camX * 0.75, post = 60;
    var p0 = Math.floor(f2 / post) - 1;
    for (var k = p0; k <= p0 + W / post + 3; k++) {
      var px = k * post - f2;
      line(px, GY - 8, px, GY - 40);
      line(px, GY - 40, px + post, GY - 36);
      line(px, GY - 8, px + post, GY - 36);
      line(px, GY - 36, px + post, GY - 8);
    }
    ctx.stroke();

    drawBase();

    // ground
    ctx.strokeStyle = "#6a77b0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    line(0, GY, W, GY);
    ctx.stroke();
    ctx.strokeStyle = "#3a4373";
    ctx.lineWidth = 1;
    ctx.beginPath();
    var gp = Math.floor(camX / 40) - 1;
    for (var q = gp; q < gp + W / 40 + 3; q++) {
      var gx = q * 40 - camX + hash(q + 3) * 20;
      line(gx, GY + 12 + hash(q) * 40, gx + 14, GY + 12 + hash(q) * 40);
    }
    ctx.stroke();

    // props in the yard between the buildings
    drawProp(1, 380, GY);
    drawProp(2, 560, GY);
  }

  function drawBase() {
    ctx.lineWidth = 2;
    // central radar/comms tower that the high catwalks hang off
    ctx.strokeStyle = "#5967a3";
    ctx.beginPath();
    line(482, 270, 478, GY); line(518, 270, 522, GY);
    for (var my = 270; my < GY; my += 40) {
      var my2 = Math.min(my + 40, GY);
      line(482, my, 518, my);
      if ((my - 270) / 40 % 2 === 0) line(482, my, 518, my2); else line(518, my, 482, my2);
    }
    // antenna mast and radar dish above the top catwalk
    line(500, 270, 500, 215); line(492, 232, 508, 232);
    line(560, 270, 560, 262); // beacon stub
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(468, 252, 14, Math.PI * 0.9, Math.PI * 1.9);
    line(468, 252, 468, 270);
    ctx.stroke();
    ctx.strokeStyle = "#ff4d5e";
    ctx.beginPath();
    ctx.arc(500, 212, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#5967a3";
    STRUCTS.forEach(function (s) {
      var x = s.x, w = s.w, t = s.top, h = GY - t;
      ctx.strokeStyle = "#5967a3";
      ctx.fillStyle = "#141836";
      if (s.type === "deck") {
        // catwalk off the central radar tower: truss underside, outer support leg, railing
        var topDeck = t < 300;
        var west = x < 500;
        var outer = west ? x + 6 : x + w - 6;
        var inner = west ? x + w : x;
        ctx.beginPath();
        for (var d = 0; d <= w; d += 26) line(x + d, t, x + Math.min(d + 13, w), t + 12);
        line(x, t + 12, x + w, t + 12);
        if (topDeck) {
          line(x + 8, t + 12, 490, t + 70); line(x + w - 8, t + 12, 510, t + 70);
        } else {
          line(outer, t + 12, outer, GY);
          line(outer - 5, GY, outer, GY - 40); line(outer + 5, GY, outer, GY - 40);
          for (var by = t + 50; by < GY - 40; by += 60) {
            line(outer, by, west ? outer + 22 : outer - 22, by - 38);
          }
          line(outer, t + 52, west ? x + 40 : x + w - 40, t + 12);
        }
        // railing
        line(x, t, x, t - 20); line(x + w, t, x + w, t - 20);
        line(x, t - 20, x + w, t - 20);
        line(x, t - 10, x + w, t - 10);
        if (topDeck) line(x + w / 2, t, x + w / 2, t - 20);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        line(x - 4, t, x + w + 4, t);
        ctx.stroke();
        ctx.lineWidth = 2;
        if (!topDeck) {
          // stairs/ladder hint where the catwalk meets the tower
          ctx.beginPath();
          for (var r = 0; r < 4; r++) line(inner - (west ? 14 : -14), t + 18 + r * 16, inner, t + 18 + r * 16);
          ctx.stroke();
        }
      } else if (s.type === "tower") {
        var y0 = t + 8;
        var lx = function (y) { return x + 2 - 8 * (y - y0) / (GY - y0); };
        var rx = function (y) { return x + w - 2 + 8 * (y - y0) / (GY - y0); };
        ctx.beginPath();
        line(x + 2, y0, lx(GY), GY); line(x + w - 2, y0, rx(GY), GY);
        for (var k = 0; k <= 4; k++) {
          var ya = y0 + (GY - y0) * k / 4, yb = y0 + (GY - y0) * (k + 1) / 4;
          line(lx(ya), ya, rx(ya), ya);
          if (k < 4) { line(lx(ya), ya, rx(yb), yb); line(rx(ya), ya, lx(yb), yb); }
        }
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        line(x - 8, t, x + w + 8, t);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); // railing and mast
        line(x - 8, t, x - 8, t - 20); line(x + w + 8, t, x + w + 8, t - 20);
        line(x - 8, t - 20, x + w + 8, t - 20);
        line(x + w / 2, t - 20, x + w / 2, t - 46);
        line(x + w / 2 - 8, t - 38, x + w / 2 + 8, t - 38);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(x, t, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        line(x - 4, t, x + w + 4, t);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (s.type === "wall") {
          for (var r = 1; r * 15 < h; r++) {
            line(x, t + r * 15, x + w, t + r * 15);
            for (var c = (r % 2) * 16; c < w; c += 32) line(x + c, t + (r - 1) * 15, x + c, t + r * 15);
          }
        } else if (s.type === "bunker") {
          line(x, t + 7, x + w, t + 7);
          ctx.rect(x + 14, t + 16, 24, 8); ctx.rect(x + w - 38, t + 16, 24, 8);
          ctx.rect(x + w / 2 - 12, GY - 38, 24, 38);
          line(x + w / 2, GY - 38, x + w / 2, GY);
        } else { // command post
          line(x, t + 7, x + w, t + 7);
          for (var i = 0; i < 3; i++) ctx.rect(x + 12 + i * 36, t + 18, 22, 16);
          ctx.rect(x + w / 2 - 12, GY - 36, 24, 36);
          line(x + w - 20, t, x + w - 20, t - 34); line(x + w - 28, t - 24, x + w - 12, t - 24);
          line(x + w - 28, t - 34, x + w - 12, t - 34);
        }
        ctx.stroke();
      }
    });
  }

  function drawProp(type, x, y) {
    ctx.strokeStyle = "#7d8ac4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (type === 0) { // sandbag wall
      for (var row = 0; row < 3; row++) {
        for (var i = 0; i < 4 - row; i++) {
          var bx = x + i * 26 + row * 13;
          ctx.moveTo(bx, y - row * 11);
          ctx.quadraticCurveTo(bx + 1, y - row * 11 - 12, bx + 12, y - row * 11 - 11);
          ctx.quadraticCurveTo(bx + 24, y - row * 11 - 12, bx + 25, y - row * 11);
        }
      }
    } else if (type === 1) { // crates
      ctx.rect(x, y - 24, 24, 24); line(x, y - 24, x + 24, y); line(x + 24, y - 24, x, y);
      ctx.rect(x + 26, y - 18, 18, 18);
      ctx.rect(x + 8, y - 46, 22, 22);
    } else { // barrels
      ctx.rect(x, y - 26, 16, 26); line(x, y - 18, x + 16, y - 18); line(x, y - 8, x + 16, y - 8);
      ctx.rect(x + 22, y - 26, 16, 26); line(x + 22, y - 18, x + 38, y - 18); line(x + 22, y - 8, x + 38, y - 8);
    }
    ctx.stroke();
  }

  function drawFigure(f, color, isPlayer) {
    var x = f.x - camX, y = f.y;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = (f.hit > 0) ? "#ffffff" : color;
    ctx.fillStyle = ctx.strokeStyle;
    var sc = f.sc || 1, kn = f.kneel || 0;
    if (sc !== 1) {
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.translate(-x, -y);
    }

    var alive = !f.dead;
    if (!alive) {
      // topple backwards from the feet and fade out
      ctx.globalAlpha = clamp(1 - (f.dead - 0.8) / 0.8, 0, 1);
      var tip = (Math.cos(f.aim) >= 0 ? -1 : 1);
      ctx.translate(x, y);
      ctx.rotate(tip * f.fall * (Math.PI / 2) * 0.95);
      ctx.translate(-x, -y);
    }

    if (f.chute && alive) {
      // canopy with rigging down to the shoulders
      var cy = y - 100;
      ctx.beginPath();
      ctx.arc(x, cy, 26, Math.PI, 0);
      line(x - 26, cy, x + 26, cy);
      line(x - 9, cy - 24, x - 9, cy);
      line(x + 9, cy - 24, x + 9, cy);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      line(x - 26, cy, x, y - 44); line(x + 26, cy, x, y - 44);
      line(x - 9, cy, x, y - 44); line(x + 9, cy, x, y - 44);
      ctx.stroke();
      ctx.lineWidth = 3;
    }

    var aim = f.aim;
    var facing = Math.cos(aim) >= 0 ? 1 : -1;
    var air = f.onGround === false;
    var hipY = y - 22 + kn * 6, shY = y - 44 + kn * 18;

    // legs
    ctx.beginPath();
    if (!alive) {
      line(x, hipY, x - 6, y); line(x, hipY, x + 7, y);
    } else if (air) {
      line(x, hipY, x - 9, y - 6); line(x, hipY, x + 8, y - 2);
    } else if (kn > 0.3) {
      // one knee up, one knee down
      line(x, hipY, x + 11 * facing, y - 12); line(x + 11 * facing, y - 12, x + 12 * facing, y);
      line(x, hipY, x - 9 * facing, y - 3); line(x - 9 * facing, y - 3, x - 2 * facing, y);
    } else {
      var s = Math.sin(f.walk), moving = Math.abs(f.vx || 0) > 8;
      var sw = moving ? 10 : 5;
      var l1 = moving ? s * sw : -5, l2 = moving ? -s * sw : 5;
      var lift1 = moving ? Math.max(0, Math.cos(f.walk)) * 4 : 0;
      var lift2 = moving ? Math.max(0, -Math.cos(f.walk)) * 4 : 0;
      line(x, hipY, x + l1, y - lift1);
      line(x, hipY, x + l2, y - lift2);
    }
    ctx.stroke();

    // torso
    ctx.beginPath();
    line(x, hipY, x, shY);
    ctx.stroke();

    // head + helmet
    var hy = y - 53 + kn * 18;
    ctx.beginPath();
    ctx.arc(x, hy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, hy - 1, 8.5, Math.PI, 0);
    ctx.lineTo(x + 8.5 * facing + (facing > 0 ? 3 : -3), hy - 1);
    ctx.stroke();
    // rifle + arms (held pointing along aim)
    var kick = f.recoil ? f.recoil * 3 : 0;
    var ox = x - Math.cos(aim) * kick, oy = shY + 2 - Math.sin(aim) * kick;
    var ca = Math.cos(aim), sa = Math.sin(aim);
    var tail = { x: ox - ca * 9, y: oy - sa * 9 };
    var tip2 = { x: ox + ca * RIFLE.muzzle, y: oy + sa * RIFLE.muzzle };
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    line(tail.x, tail.y, tip2.x, tip2.y);
    ctx.stroke();
    // magazine
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    line(ox + ca * 8, oy + sa * 8, ox + ca * 8 - sa * facing * 7, oy + sa * 8 + ca * facing * 7);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    var frontHand = { x: ox + ca * 22, y: oy + sa * 22 };
    var backHand = { x: ox + ca * 11, y: oy + sa * 11 + 1 };
    // two-bone arms: elbows bend downward so the arms follow the rifle as it swings
    function arm(hand) {
      var sx = x, sy = shY + 1, seg = 14;
      var dx = hand.x - sx, dy = hand.y - sy;
      var d = Math.min(Math.sqrt(dx * dx + dy * dy), seg * 2 - 0.01) || 0.01;
      var h = Math.sqrt(seg * seg - (d / 2) * (d / 2));
      var nx = -dy / d, ny = dx / d;
      if (ny < 0) { nx = -nx; ny = -ny; }
      var ex = sx + dx / 2 + nx * h, ey = sy + dy / 2 + ny * h;
      line(sx, sy, ex, ey);
      line(ex, ey, hand.x, hand.y);
    }
    arm(frontHand);
    arm(backHand);
    ctx.stroke();

    // muzzle flash
    if (f.flash > 0) {
      ctx.strokeStyle = "#ffd84a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i = -1; i <= 1; i++) {
        var fa = aim + i * 0.35;
        line(tip2.x, tip2.y, tip2.x + Math.cos(fa) * 12, tip2.y + Math.sin(fa) * 12);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBomber(b) {
    var x = b.x - camX, y = b.y, d = b.dir;
    ctx.save();
    ctx.strokeStyle = b.hit > 0 ? "#ffffff" : "#ff7a5c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    line(x - d * 22, y - 2, x - d * 54, y - 8);          // tail boom
    line(x - d * 54, y - 8, x - d * 54, y - 20);         // tail fin
    line(x, y - 11, x, y - 18);                          // rotor mast
    var L = 42 * Math.cos(time * 38);
    line(x - L, y - 18, x + L, y - 18);                  // spinning rotor
    line(x - 14, y + 17, x + 14, y + 17);                // skids
    line(x - 8, y + 10, x - 9, y + 17); line(x + 8, y + 10, x + 9, y + 17);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + d * 9, y - 1, 6, 0, Math.PI * 2);        // cockpit
    ctx.stroke();
    ctx.restore();
  }

  function drawGrenades() {
    grenades.forEach(function (g) {
      var x = g.x - camX;
      if (g.kind === "bomb") {
        ctx.strokeStyle = "#ff7a5c";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, g.y, 4, 8, Math.atan2(g.vx, g.vy) * -1, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        var blink = g.fuse < 0.6 && Math.floor(g.fuse * 14) % 2 === 0;
        ctx.strokeStyle = blink ? "#ff4d5e" : "#c27bff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, g.y - 4, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    rings.forEach(function (r) {
      var t = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = "#ffb347";
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x - camX, r.y, r.r * (0.3 + 0.7 * t), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  // Sniper laser: thin while tracking, bright once locked.
  function drawLasers() {
    enemies.forEach(function (e) {
      if (e.dead || e.type !== "sniper" || e.charge <= 0) return;
      var o = gunOrigin(e);
      var ca = Math.cos(e.aim), sa = Math.sin(e.aim);
      ctx.strokeStyle = e.locked ? "#ff2040" : "rgba(255,77,210,0.55)";
      ctx.lineWidth = e.locked ? 2.5 : 1;
      ctx.beginPath();
      line(o.x - camX + ca * RIFLE.muzzle, o.y + sa * RIFLE.muzzle, o.x - camX + ca * 1500, o.y + sa * 1500);
      ctx.stroke();
    });
  }

  function drawEnemyBars() {
    enemies.forEach(function (e) {
      if (e.dead || e.maxhp <= HP) return;
      var x = e.x - camX - 16, y = e.y - 58 * e.sc - 16;
      ctx.fillStyle = "rgba(5,6,20,0.8)";
      ctx.fillRect(x, y, 32, 5);
      ctx.fillStyle = e.color;
      ctx.fillRect(x + 1, y + 1, 30 * clamp(e.hp / e.maxhp, 0, 1), 3);
    });
  }

  function drawFloaters() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    floaters.forEach(function (f) {
      ctx.globalAlpha = clamp(f.life / f.max * 1.6, 0, 1);
      ctx.font = "bold " + (f.big ? 20 : 15) + "px 'Courier New', monospace";
      ctx.fillStyle = "rgba(5,6,20,0.8)";
      ctx.fillText(f.text, f.x - camX + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x - camX, f.y);
    });
    ctx.globalAlpha = 1;
  }

  // At night, muzzle flashes and blasts throw light on the scene.
  function drawLights() {
    var n = nightAmt();
    function glow(x, y, r, a, rgb) {
      var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(" + rgb + "," + a + ")");
      gr.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (n <= 0.05) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var figs = enemies.concat([player]);
    figs.forEach(function (f) {
      if (f.dead || !(f.flash > 0)) return;
      var o = gunOrigin(f), sc = f.sc || 1;
      glow(o.x - camX + Math.cos(f.aim) * RIFLE.muzzle * sc, o.y + Math.sin(f.aim) * RIFLE.muzzle * sc, 130, 0.55 * n, "255,216,74");
    });
    rings.forEach(function (r) {
      glow(r.x - camX, r.y, r.r * 2.4, 0.5 * (r.life / r.max) * n, "255,140,60");
    });
    ctx.restore();
  }

  function drawHitMark() {
    if (!hitMark) return;
    var t = hitMark.life / hitMark.max;
    var r0 = 7 + (1 - t) * 4, r1 = r0 + (hitMark.kill ? 10 : 6);
    ctx.save();
    ctx.globalAlpha = clamp(t * 1.5, 0, 1);
    ctx.strokeStyle = hitMark.kill ? "#ff4d5e" : hitMark.head ? "#ffd84a" : "#ffffff";
    ctx.lineWidth = hitMark.kill ? 3 : 2;
    ctx.beginPath();
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (d) {
      line(mouse.x + d[0] * r0, mouse.y + d[1] * r0, mouse.x + d[0] * r1, mouse.y + d[1] * r1);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawBullets() {
    ctx.lineWidth = 2;
    bullets.forEach(function (b) {
      var len = 14, sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      ctx.strokeStyle = b.owner === "player" ? "#ffe066" : "#ff7a5c";
      ctx.beginPath();
      line(b.x - camX, b.y, b.x - camX - b.vx / sp * len, b.y - b.vy / sp * len);
      ctx.stroke();
    });
    particles.forEach(function (pt) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      line(pt.x - camX, pt.y, pt.x - camX + pt.vx * 0.02 + 1, pt.y + pt.vy * 0.02);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function overEnemy() {
    var wx = mouse.x + camX;
    for (var i = 0; i < enemies.length; i++) {
      if (!enemies[i].dead && hitFigure(enemies[i], wx, mouse.y)) return true;
    }
    return false;
  }

  function drawReticle() {
    var r = 8 + (player ? player.spread : 0.03) * 260 + (player && player.reloading > 0 ? 4 : 0);
    var hot = overEnemy();
    ctx.save();
    ctx.strokeStyle = hot ? "#ff4d5e" : "#39ff88";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    line(mouse.x - r - 7, mouse.y, mouse.x - r + 5, mouse.y);
    line(mouse.x + r + 7, mouse.y, mouse.x + r - 5, mouse.y);
    line(mouse.x, mouse.y - r - 7, mouse.x, mouse.y - r + 5);
    line(mouse.x, mouse.y + r + 7, mouse.x, mouse.y + r - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (player && player.reloading > 0) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, r + 12, -Math.PI / 2, -Math.PI / 2 + (1 - player.reloading / RIFLE.reload) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud() {
    ctx.font = "bold 17px 'Courier New', monospace";
    ctx.textBaseline = "top";
    // health
    ctx.strokeStyle = "#cfd8ff";
    ctx.lineWidth = 2;
    for (var h = 0; h < HP; h++) {
      ctx.strokeRect(14 + h * 54, 14, 48, 14);
      if (h < player.hp) {
        ctx.fillStyle = player.hp > 1 ? "#39ff88" : "#ff4d5e";
        ctx.fillRect(16 + h * 54, 16, 44, 10);
      }
    }
    ctx.fillStyle = "#cfd8ff";
    ctx.textAlign = "left";
    ctx.fillText("HP", 14 + HP * 54 + 4, 14);
    // ammo
    ctx.fillText(player.reloading > 0 ? "RELOADING" : "AMMO " + player.ammo + "/" + RIFLE.mag, 14, 36);
    // kills
    ctx.textAlign = "right";
    ctx.fillText("KILLS " + kills, W - 14, 14);
    // stance
    ctx.textAlign = "left";
    if (player.kneel > 0.9 && player.spread === 0) { ctx.fillStyle = "#39ff88"; ctx.fillText("STEADY", 14, 58); }
    else if (player.kneel > 0.5) { ctx.fillStyle = "#cfd8ff"; ctx.fillText("KNEELING", 14, 58); }
    // combo multiplier
    if (streak > 0) {
      var m = comboMult();
      ctx.textAlign = "center";
      ctx.fillStyle = m > 1 ? "#ffd84a" : "#cfd8ff";
      ctx.font = "bold " + (17 + m * 2) + "px 'Courier New', monospace";
      ctx.fillText("COMBO x" + m + "  (" + streak + ")", W / 2, 14);
      ctx.fillStyle = "rgba(207,216,255,0.25)";
      ctx.fillRect(W / 2 - 60, 14 + 17 + m * 2 + 4, 120, 4);
      ctx.fillStyle = m > 1 ? "#ffd84a" : "#cfd8ff";
      ctx.fillRect(W / 2 - 60, 14 + 17 + m * 2 + 4, 120 * clamp(comboTimer / COMBO_WINDOW, 0, 1), 4);
    }
  }

  function drawCenterText(lines) {
    ctx.fillStyle = "rgba(5,6,20,0.7)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach(function (l, i) {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, W / 2, H / 2 - 50 + i * 36);
    });
  }

  function draw() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    if (slowmo > 0) {
      // killcam punch-in on the headshot
      var z = 1 + 0.12 * clamp(slowmo / SLOW_T, 0, 1);
      ctx.translate(kcam.x, kcam.y);
      ctx.scale(z, z);
      ctx.translate(-kcam.x, -kcam.y);
    }
    drawBackground();
    enemies.forEach(function (e) { if (e.dead) drawFigure(e, e.color, false); });
    enemies.forEach(function (e) { if (!e.dead) drawFigure(e, e.color, false); });
    drawFigure(player, "#39ff88", true);
    bombers.forEach(drawBomber);
    drawLasers();
    drawEnemyBars();
    drawGrenades();
    drawBullets();
    drawLights();
    drawFloaters();
    ctx.restore();

    if (hurtFlash > 0) {
      ctx.fillStyle = "rgba(255,40,60," + (hurtFlash * 0.7) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    drawHud();

    if (state === "ready") {
      drawCenterText([
        { text: "STICK FRONT", font: "bold 44px 'Courier New', monospace", color: "#39ff88" },
        { text: "Hold the base. Aim with the mouse.", font: "18px 'Courier New', monospace", color: "#cfd8ff" },
        { text: "Click to start", font: "bold 20px 'Courier New', monospace", color: "#ffd84a" }
      ]);
    } else if (state === "paused") {
      drawCenterText([
        { text: "PAUSED", font: "bold 40px 'Courier New', monospace", color: "#2de2ff" },
        { text: "Click or press P to resume", font: "18px 'Courier New', monospace", color: "#cfd8ff" }
      ]);
    } else if (state === "over") {
      drawCenterText([
        { text: "OVERRUN", font: "bold 44px 'Courier New', monospace", color: "#ff4d5e" },
        { text: "Score " + score + "   Kills " + kills, font: "20px 'Courier New', monospace", color: "#cfd8ff" },
        { text: "Click to redeploy", font: "bold 20px 'Courier New', monospace", color: "#ffd84a" }
      ]);
    }
    if (state !== "paused") { drawReticle(); drawHitMark(); }
  }

  // ---------- loop ----------
  function frame(ts) {
    var dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
    lastTs = ts;
    if (state === "playing") {
      if (slowmo > 0) { slowmo -= dt; dt *= SLOW_SCALE; }
      update(dt);
    }
    else if (state === "over") {
      // let the battlefield keep moving behind the game-over card
      enemies.forEach(function (e) { if (e.dead) updateEnemy(e, dt); });
      particles.forEach(function (pt) { pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; });
      particles = particles.filter(function (pt) { return pt.life > 0; });
      hurtFlash = Math.max(0, hurtFlash - dt);
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function toCanvas(e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (W / r.width);
    mouse.y = (e.clientY - r.top) * (H / r.height);
  }

  function begin() {
    reset();
    state = "playing";
  }

  canvas.addEventListener("mousemove", toCanvas);
  canvas.addEventListener("mousedown", function (e) {
    toCanvas(e);
    if (e.button !== 0) return;
    e.preventDefault();
    if (state === "ready" || state === "over") { begin(); return; }
    if (state === "paused") { state = "playing"; return; }
    mouse.down = true;
  });
  window.addEventListener("mouseup", function (e) { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  window.addEventListener("blur", function () {
    mouse.down = false;
    keys = {};
    if (state === "playing") state = "paused";
  });

  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    var handled = ["a", "d", "w", " ", "arrowleft", "arrowright", "arrowup", "arrowdown", "s", "r", "p", "shift"];
    if (handled.indexOf(k) < 0) return;
    if (k === " " || k.indexOf("arrow") === 0) e.preventDefault();
    keys[k] = true;
    if (e.repeat) return;
    if ((k === "w" || k === " " || k === "arrowup") && state === "playing") tryJump();
    if (k === "r" && state === "playing") startReload();
    if (k === "p") {
      if (state === "playing") { state = "paused"; mouse.down = false; }
      else if (state === "paused") state = "playing";
    }
  });
  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });

  reset();
  requestAnimationFrame(frame);
})();
