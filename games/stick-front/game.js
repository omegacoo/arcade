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
    f.vy += GRAVITY * dt;
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
    if (landed) { f.vy = 0; f.onGround = true; f.jumps = 0; }
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
      cooldown: 0, walk: 0, aim: 0, recoil: 0, flash: 0, onGround: true
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
    scoreEl.textContent = 0;
  }

  function newEnemy() {
    var side = Math.random() < 0.5 ? -1 : 1;
    // Some attackers head for a rooftop or tower deck and fight from up there.
    var post = Math.random() < 0.45 ? POSTS[Math.floor(Math.random() * POSTS.length)] : null;
    return {
      x: side < 0 ? -30 : W + 30, y: GY, vx: 0, vy: 0, hp: HP, onGround: true, jumps: 0,
      post: post, tx: post ? rand(post.x + 14, post.x + post.w - 14) : 0,
      walk: Math.random() * 6, aim: 0, range: rand(220, 380), rangeTimer: rand(2, 4),
      burst: 0, burstTimer: rand(0.8, 1.8), shotTimer: 0, flash: 0, dead: 0, fall: 0,
      speed: rand(60, 95), hit: 0
    };
  }

  // ---------- firing ----------
  function shoot(owner, x, y, angle, spread) {
    var a = angle + (Math.random() - 0.5) * 2 * spread;
    bullets.push({
      x: x, y: y, vx: Math.cos(a) * (owner === "player" ? RIFLE.speed : RIFLE.speed * 0.6),
      vy: Math.sin(a) * (owner === "player" ? RIFLE.speed : RIFLE.speed * 0.6),
      owner: owner, life: 1.4
    });
    for (var i = 0; i < 3; i++) {
      particles.push({
        x: x, y: y, vx: Math.cos(a) * rand(60, 200) + rand(-40, 40), vy: Math.sin(a) * rand(60, 200) + rand(-40, 40),
        life: 0.08, max: 0.08, color: "#ffd84a", len: 4
      });
    }
  }

  function gunOrigin(f) { return { x: f.x, y: f.y - 42 }; }

  function playerFire() {
    var o = gunOrigin(player);
    var mx = o.x + Math.cos(player.aim) * RIFLE.muzzle;
    var my = o.y + Math.sin(player.aim) * RIFLE.muzzle;
    shoot("player", mx, my, player.aim, 0.015 + bloom * 0.05);
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
    var hy = f.y - 58;
    var dx = px - f.x, dy = py - hy;
    if (dx * dx + dy * dy <= 8 * 8) return 2;
    if (Math.abs(px - f.x) <= 9 && py >= f.y - 50 && py <= f.y) return 1;
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
    var topSpeed = 190;
    p.vx += (move * topSpeed - p.vx) * Math.min(1, dt * 12);
    p.x = clamp(p.x + p.vx * dt, 12, W - 12);
    stepBody(p, dt, keys.s || keys.arrowdown);
    if (p.onGround) p.walk += Math.abs(p.vx) * dt * 0.06;

    // aiming
    var o = gunOrigin(p);
    p.aim = Math.atan2(mouse.y - o.y, mouse.x + camX - o.x);

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
      enemies.push(newEnemy());
      spawnTimer = interval * rand(0.7, 1.3);
    } else if (spawnTimer <= 0) {
      spawnTimer = 0.3;
    }

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
              break;
            }
          }
        } else if (state === "playing" && hitFigure(p, b.x, b.y)) {
          p.hp -= RIFLE.dmg * (hitFigure(p, b.x, b.y) === 2 ? RIFLE.headMult : 1);
          hurtFlash = 0.35;
          shake = Math.max(shake, 5);
          sparks(b.x, b.y, "#ff4d5e", 6);
          b.life = 0;
          if (p.hp <= 0) { p.hp = 0; gameOver(); return; }
        }
        if (b.life <= 0) break;
      }
    });
    if (state !== "playing") return;
    bullets = bullets.filter(function (b) { return b.life > 0 && Math.abs(b.x - p.x) < 1400; });

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

  function killEnemy(e, headshot) {
    e.dead = 0.001;
    kills++;
    score += headshot ? 150 : 100;
    scoreEl.textContent = score;
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

    if (e.post) {
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
      if (e.rangeTimer <= 0) { e.range = rand(220, 380); e.rangeTimer = rand(2, 4); }
      if (dist > e.range + 30) want = dir;
      else if (dist < e.range - 40) want = -dir;
    }
    e.vx += (want * e.speed - e.vx) * Math.min(1, dt * 8);
    e.x = clamp(e.x + e.vx * dt, -60, W + 60);
    stepBody(e, dt, false);
    e.walk += Math.abs(e.vx) * dt * 0.06;

    // aim at the player's chest
    var o = gunOrigin(e);
    e.aim = Math.atan2((player.y - 30) - o.y, player.x - o.x);

    // only shoot once on screen
    var onScreen = Math.abs(e.x - (camX + W / 2)) < W / 2 - 10;
    if (!onScreen) return;
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
      e.burst = 1 + Math.floor(Math.random() * 3);
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
    g.addColorStop(0, "#0b1030");
    g.addColorStop(1, "#27234a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // moon
    ctx.strokeStyle = "#8c94c8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(640 - camX * 0.02 % 900, 70, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // far hills (parallax 0.2)
    ctx.strokeStyle = "#2d3566";
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
    STRUCTS.forEach(function (s) {
      var x = s.x, w = s.w, t = s.top, h = GY - t;
      ctx.strokeStyle = "#5967a3";
      ctx.fillStyle = "#141836";
      if (s.type === "deck") {
        ctx.beginPath();
        for (var d = 0; d <= w; d += 26) line(x + d, t, x + Math.min(d + 13, w), t + 12);
        line(x, t + 12, x + w, t + 12);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        line(x - 4, t, x + w + 4, t);
        ctx.stroke();
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

    var alive = !f.dead;
    if (!alive) {
      // topple backwards from the feet and fade out
      ctx.globalAlpha = clamp(1 - (f.dead - 0.8) / 0.8, 0, 1);
      var tip = (Math.cos(f.aim) >= 0 ? -1 : 1);
      ctx.translate(x, y);
      ctx.rotate(tip * f.fall * (Math.PI / 2) * 0.95);
      ctx.translate(-x, -y);
    }

    var aim = f.aim;
    var facing = Math.cos(aim) >= 0 ? 1 : -1;
    var air = f.onGround === false;
    var hipY = y - 22, shY = y - 44;

    // legs
    ctx.beginPath();
    if (!alive) {
      line(x, hipY, x - 6, y); line(x, hipY, x + 7, y);
    } else if (air) {
      line(x, hipY, x - 9, y - 6); line(x, hipY, x + 8, y - 2);
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
    var hy = y - 53;
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
    var r = 11 + bloom * 14 + (player && player.reloading > 0 ? 4 : 0);
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
    drawBackground();
    enemies.forEach(function (e) { if (e.dead) drawFigure(e, "#ff4d5e", false); });
    enemies.forEach(function (e) { if (!e.dead) drawFigure(e, "#ff4d5e", false); });
    drawFigure(player, "#39ff88", true);
    drawBullets();
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
    if (state !== "paused") drawReticle();
  }

  // ---------- loop ----------
  function frame(ts) {
    var dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
    lastTs = ts;
    if (state === "playing") update(dt);
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
    var handled = ["a", "d", "w", " ", "arrowleft", "arrowright", "arrowup", "arrowdown", "s", "r", "p"];
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
