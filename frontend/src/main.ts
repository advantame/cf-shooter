const canvas = document.createElement("canvas");
// スマホ向け：正方形キャンバス
const SIZE = Math.min(window.innerWidth, window.innerHeight);
canvas.width = SIZE;
canvas.height = SIZE;
document.body.style.margin = "0";
document.body.style.background = "#000";
document.body.style.display = "flex";
document.body.style.justifyContent = "center";
document.body.style.alignItems = "center";
document.body.style.height = "100vh";
document.body.style.overflow = "hidden";
document.body.style.touchAction = "none";
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

// ゲーム定数
const CENTER_X = SIZE / 2;
const CENTER_Y = SIZE / 2;
const ARENA_RADIUS = SIZE * 0.45;
const PLAYER_RADIUS = SIZE * 0.04;
const SPEED = SIZE * 0.4; // px/sec
const BULLET_SPEED = SIZE * 0.7;
const SHOT_COOLDOWN_MS = 120; // 常時連射用に短く
const FORK_ANGLE = 0.15; // 二股の角度（ラジアン）
const MAX_HP = 20;

// 領域の色
const ZONE_COLORS = ["rgba(0, 229, 255, 0.15)", "rgba(255, 90, 90, 0.15)", "rgba(90, 255, 90, 0.15)"];
const PLAYER_COLORS = ["#00e5ff", "#ff5a5a", "#5aff5a"];

// バックエンドURL
const BACKEND_BASE = (import.meta as any).env?.VITE_BACKEND_BASE ?? "";
const params = new URLSearchParams(location.search);
const room = params.get("room") ?? "lobby";

// 自分の状態
let myId: string | null = null;
let myZone = 0; // 0, 1, 2 のいずれか（サーバーから割り当て）
let myX = CENTER_X;
let myY = CENTER_Y;
let myHp = MAX_HP;
let myBullets: { x: number; y: number; vx: number; vy: number }[] = [];
let lastShotAt = 0;

// 他プレイヤーの状態
let otherPlayers: Record<string, { x: number; y: number; hp: number; zone: number; bullets: { x: number; y: number }[] }> = {};

let connectionStatus = "接続中...";

const wsUrl = new URL("/connect", BACKEND_BASE || location.origin);
wsUrl.searchParams.set("room", room);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

let ws: WebSocket;

function connect() {
  ws = new WebSocket(wsUrl.toString());

  ws.onopen = () => {
    connectionStatus = "接続完了";
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "hello") {
      myId = msg.playerId;
      myZone = msg.zone;
      // 初期位置を自分の領域の中央に
      const angle = getZoneCenterAngle(myZone);
      const dist = ARENA_RADIUS * 0.6;
      myX = CENTER_X + Math.cos(angle) * dist;
      myY = CENTER_Y + Math.sin(angle) * dist;
      myHp = MAX_HP;
      myBullets = [];
    }
    if (msg.type === "players") {
      otherPlayers = {};
      for (const [id, p] of Object.entries<any>(msg.players)) {
        if (id !== myId) {
          otherPlayers[id] = p;
        }
      }
    }
    if (msg.type === "hit" && msg.targetId === myId) {
      myHp = Math.max(0, myHp - 1);
    }
  };

  ws.onclose = () => {
    connectionStatus = "切断（再接続中...）";
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    connectionStatus = "エラー";
  };
}

connect();

// 領域の中心角度を取得（ラジアン）
function getZoneCenterAngle(zone: number): number {
  // zone 0: 上, zone 1: 右下, zone 2: 左下
  return (-Math.PI / 2) + (zone * Math.PI * 2 / 3);
}

// 領域の開始・終了角度
function getZoneAngles(zone: number): { start: number; end: number } {
  const center = getZoneCenterAngle(zone);
  return {
    start: center - Math.PI / 3,
    end: center + Math.PI / 3,
  };
}

// 角度を正規化（-PI ~ PI）
function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// 点が領域内にあるか判定
function isInZone(x: number, y: number, zone: number): boolean {
  const dx = x - CENTER_X;
  const dy = y - CENTER_Y;
  const dist = Math.hypot(dx, dy);
  if (dist > ARENA_RADIUS) return false;

  const angle = Math.atan2(dy, dx);
  const { start, end } = getZoneAngles(zone);

  // 角度が範囲内か
  const normAngle = normalizeAngle(angle);
  const normStart = normalizeAngle(start);
  const normEnd = normalizeAngle(end);

  if (normStart < normEnd) {
    return normAngle >= normStart && normAngle <= normEnd;
  } else {
    // 範囲が-PI/PIをまたぐ場合
    return normAngle >= normStart || normAngle <= normEnd;
  }
}

// 領域内に制限
function clampToZone(x: number, y: number, zone: number): { x: number; y: number } {
  let dx = x - CENTER_X;
  let dy = y - CENTER_Y;
  let dist = Math.hypot(dx, dy);
  let angle = Math.atan2(dy, dx);

  // 距離を制限
  const minDist = PLAYER_RADIUS * 2;
  const maxDist = ARENA_RADIUS - PLAYER_RADIUS;
  dist = Math.max(minDist, Math.min(maxDist, dist));

  // 角度を制限
  const { start, end } = getZoneAngles(zone);
  const margin = 0.05; // 少し余裕
  const clampedStart = start + margin;
  const clampedEnd = end - margin;

  const normAngle = normalizeAngle(angle);
  const normStart = normalizeAngle(clampedStart);
  const normEnd = normalizeAngle(clampedEnd);

  let clampedAngle = normAngle;
  if (normStart < normEnd) {
    clampedAngle = Math.max(normStart, Math.min(normEnd, normAngle));
  } else {
    // 範囲が-PI/PIをまたぐ場合
    if (normAngle < normEnd) {
      clampedAngle = normAngle;
    } else if (normAngle > normStart) {
      clampedAngle = normAngle;
    } else {
      // 範囲外：近い方に寄せる
      const distToStart = Math.abs(normalizeAngle(normAngle - normStart));
      const distToEnd = Math.abs(normalizeAngle(normAngle - normEnd));
      clampedAngle = distToStart < distToEnd ? normStart : normEnd;
    }
  }

  return {
    x: CENTER_X + Math.cos(clampedAngle) * dist,
    y: CENTER_Y + Math.sin(clampedAngle) * dist,
  };
}

// スワイプ操作
let touchStartX = 0;
let touchStartY = 0;
let touchCurrentX = 0;
let touchCurrentY = 0;
let isTouching = false;

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const r = canvas.getBoundingClientRect();
  touchStartX = (touch.clientX - r.left) * (canvas.width / r.width);
  touchStartY = (touch.clientY - r.top) * (canvas.height / r.height);
  touchCurrentX = touchStartX;
  touchCurrentY = touchStartY;
  isTouching = true;
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!isTouching) return;
  const touch = e.touches[0];
  const r = canvas.getBoundingClientRect();
  touchCurrentX = (touch.clientX - r.left) * (canvas.width / r.width);
  touchCurrentY = (touch.clientY - r.top) * (canvas.height / r.height);
});

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  isTouching = false;
});

// PC用マウス操作（デバッグ用）
let mouseX = CENTER_X;
let mouseY = CENTER_Y;
let isMouseDown = false;

canvas.addEventListener("mousedown", (e) => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX - r.left) * (canvas.width / r.width);
  mouseY = (e.clientY - r.top) * (canvas.height / r.height);
  touchStartX = mouseX;
  touchStartY = mouseY;
  touchCurrentX = mouseX;
  touchCurrentY = mouseY;
  isMouseDown = true;
  isTouching = true;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isMouseDown) return;
  const r = canvas.getBoundingClientRect();
  touchCurrentX = (e.clientX - r.left) * (canvas.width / r.width);
  touchCurrentY = (e.clientY - r.top) * (canvas.height / r.height);
});

canvas.addEventListener("mouseup", () => {
  isMouseDown = false;
  isTouching = false;
});

// ゲームループ
let lastTime = performance.now();

function gameLoop() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (myId && myHp > 0) {
    // スワイプで移動
    if (isTouching) {
      const dx = touchCurrentX - touchStartX;
      const dy = touchCurrentY - touchStartY;
      const dist = Math.hypot(dx, dy);

      if (dist > 10) { // デッドゾーン
        const vx = (dx / dist) * SPEED;
        const vy = (dy / dist) * SPEED;

        let newX = myX + vx * dt;
        let newY = myY + vy * dt;

        // 領域内に制限
        const clamped = clampToZone(newX, newY, myZone);
        myX = clamped.x;
        myY = clamped.y;
      }
    }

    // 常時連射（二股発射）
    if (now - lastShotAt >= SHOT_COOLDOWN_MS) {
      lastShotAt = now;

      // 中心に向かって発射
      const toCenterX = CENTER_X - myX;
      const toCenterY = CENTER_Y - myY;
      const baseAngle = Math.atan2(toCenterY, toCenterX);

      // 二股
      for (const offset of [-FORK_ANGLE, FORK_ANGLE]) {
        const angle = baseAngle + offset;
        const bvx = Math.cos(angle) * BULLET_SPEED;
        const bvy = Math.sin(angle) * BULLET_SPEED;
        myBullets.push({ x: myX, y: myY, vx: bvx, vy: bvy });
      }
    }
  }

  // 弾の更新
  for (const b of myBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // 画面外・アリーナ外の弾を除去
  myBullets = myBullets.filter(b => {
    const dx = b.x - CENTER_X;
    const dy = b.y - CENTER_Y;
    return Math.hypot(dx, dy) <= ARENA_RADIUS + 50;
  });

  // 当たり判定（自分の弾 vs 他プレイヤー）
  for (const b of myBullets) {
    for (const [id, p] of Object.entries(otherPlayers)) {
      if (p.hp <= 0) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const hitRadius = PLAYER_RADIUS * 1.2;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "hit", targetId: id }));
        }
        b.x = 1e9;
        b.y = 1e9;
      }
    }
  }
  myBullets = myBullets.filter(b => b.x < 1e8);

  // 自分の状態をサーバーに送信
  if (ws.readyState === WebSocket.OPEN && myId) {
    ws.send(JSON.stringify({
      type: "state",
      id: myId,
      x: myX,
      y: myY,
      hp: myHp,
      zone: myZone,
      bullets: myBullets,
    }));
  }

  requestAnimationFrame(gameLoop);
}

function draw() {
  requestAnimationFrame(draw);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // アリーナ円
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, ARENA_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // 3分割ピザ領域
  for (let zone = 0; zone < 3; zone++) {
    const { start, end } = getZoneAngles(zone);

    ctx.fillStyle = zone === myZone ? ZONE_COLORS[zone].replace("0.15", "0.25") : ZONE_COLORS[zone];
    ctx.beginPath();
    ctx.moveTo(CENTER_X, CENTER_Y);
    ctx.arc(CENTER_X, CENTER_Y, ARENA_RADIUS, start, end);
    ctx.closePath();
    ctx.fill();

    // 境界線
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CENTER_X, CENTER_Y);
    ctx.lineTo(CENTER_X + Math.cos(start) * ARENA_RADIUS, CENTER_Y + Math.sin(start) * ARENA_RADIUS);
    ctx.stroke();
  }

  // 他プレイヤーの弾
  for (const p of Object.values(otherPlayers)) {
    ctx.fillStyle = PLAYER_COLORS[p.zone] || "#ff6600";
    for (const b of p.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, SIZE * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 自分の弾
  ctx.fillStyle = PLAYER_COLORS[myZone];
  for (const b of myBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, SIZE * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }

  // 他プレイヤー
  for (const [id, p] of Object.entries(otherPlayers)) {
    ctx.fillStyle = PLAYER_COLORS[p.zone] || "#ff5a5a";

    if (p.hp <= 0) ctx.globalAlpha = 0.3;

    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // HPバー
    drawHpBar(p.x, p.y - PLAYER_RADIUS - 10, p.hp);

    ctx.globalAlpha = 1;
  }

  // 自分
  if (myId) {
    ctx.fillStyle = PLAYER_COLORS[myZone];
    if (myHp <= 0) ctx.globalAlpha = 0.3;

    ctx.beginPath();
    ctx.arc(myX, myY, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // 自分マーク
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(myX, myY, PLAYER_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();

    // HPバー
    drawHpBar(myX, myY - PLAYER_RADIUS - 10, myHp);

    ctx.globalAlpha = 1;
  }

  // スワイプインジケーター
  if (isTouching) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(touchStartX, touchStartY);
    ctx.lineTo(touchCurrentX, touchCurrentY);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(touchStartX, touchStartY, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // UI
  ctx.fillStyle = "#ddd";
  ctx.font = `${SIZE * 0.03}px sans-serif`;
  ctx.fillText(`room=${room}  ${connectionStatus}`, SIZE * 0.02, SIZE * 0.05);

  const playerCount = Object.keys(otherPlayers).length + (myId ? 1 : 0);
  ctx.fillText(`Players: ${playerCount}/3`, SIZE * 0.02, SIZE * 0.09);
}

function drawHpBar(x: number, y: number, hp: number) {
  const barWidth = PLAYER_RADIUS * 2.5;
  const barHeight = SIZE * 0.015;
  const ratio = hp / MAX_HP;

  // 背景
  ctx.fillStyle = "#333";
  ctx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth, barHeight);

  // HP
  ctx.fillStyle = ratio > 0.5 ? "#5f5" : ratio > 0.25 ? "#ff5" : "#f55";
  ctx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth * ratio, barHeight);
}

// 開始
gameLoop();
draw();
