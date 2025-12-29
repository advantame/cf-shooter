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
const SPEED = SIZE * 0.8; // px/sec (2倍)
const BULLET_SPEED = SIZE * 2.1; // (3倍)
const SHOT_COOLDOWN_MS = 80; // (1.5倍速 = 120/1.5)
const FORK_ANGLE = 0.35; // 二股の角度（広めに）
const MAX_HP = 200; // (10倍)

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

// 他プレイヤーの状態（ヒット判定用）
let otherPlayers: Record<string, { x: number; y: number; hp: number; zone: number; bullets: { x: number; y: number }[] }> = {};

// 他プレイヤーの描画用状態（補間用）
type DisplayPlayer = {
  x: number; y: number;
  hp: number; zone: number;
  bullets: { x: number; y: number }[];
};
let otherPlayersDisplay: Record<string, DisplayPlayer> = {};
const LERP_SPEED = 18; // 補間速度（高いほど速く追従）

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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

// 自分のzoneが下に来るための回転角度
function getViewRotation(): number {
  // 自分のzoneの中心を下（PI/2）に持ってくる
  const myZoneCenter = getZoneCenterAngle(myZone);
  return Math.PI / 2 - myZoneCenter;
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

// スワイプ操作（上下分割・マルチタッチ対応）
let moveStartX = 0;
let moveStartY = 0;
let moveCurrentX = 0;
let moveCurrentY = 0;
let isMoving = false;
let moveTouchId: number | null = null; // 移動用タッチのID

let aimStartX = 0;
let aimCurrentX = 0;
let isAiming = false;
let aimTouchId: number | null = null; // 照準用タッチのID
let aimOffset = 0; // 照準のオフセット角度
const AIM_SENSITIVITY = 0.003; // 照準感度

function getTouchPos(touch: Touch, r: DOMRect): { x: number; y: number } {
  return {
    x: (touch.clientX - r.left) * (canvas.width / r.width),
    y: (touch.clientY - r.top) * (canvas.height / r.height),
  };
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();

  // 新しく追加されたタッチを処理
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const pos = getTouchPos(touch, r);

    if (pos.y > SIZE / 2 && moveTouchId === null) {
      // 下半分：移動（まだ移動タッチがない場合）
      moveTouchId = touch.identifier;
      moveStartX = pos.x;
      moveStartY = pos.y;
      moveCurrentX = pos.x;
      moveCurrentY = pos.y;
      isMoving = true;
    } else if (pos.y <= SIZE / 2 && aimTouchId === null) {
      // 上半分：照準（まだ照準タッチがない場合）
      aimTouchId = touch.identifier;
      aimStartX = pos.x;
      aimCurrentX = pos.x;
      isAiming = true;
    }
  }
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();

  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const pos = getTouchPos(touch, r);

    if (touch.identifier === moveTouchId) {
      // 移動タッチの更新
      moveCurrentX = pos.x;
      moveCurrentY = pos.y;
    }

    if (touch.identifier === aimTouchId) {
      // 照準タッチの更新
      aimCurrentX = pos.x;
      aimOffset += (aimCurrentX - aimStartX) * AIM_SENSITIVITY;
      aimOffset = Math.max(-0.8, Math.min(0.8, aimOffset));
      aimStartX = aimCurrentX;
    }
  }
});

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();

  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];

    if (touch.identifier === moveTouchId) {
      moveTouchId = null;
      isMoving = false;
    }

    if (touch.identifier === aimTouchId) {
      aimTouchId = null;
      isAiming = false;
    }
  }
});

canvas.addEventListener("touchcancel", (e) => {
  e.preventDefault();

  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];

    if (touch.identifier === moveTouchId) {
      moveTouchId = null;
      isMoving = false;
    }

    if (touch.identifier === aimTouchId) {
      aimTouchId = null;
      isAiming = false;
    }
  }
});

// PC用マウス操作（デバッグ用）
let isMouseDown = false;
let mouseIsMove = false;

canvas.addEventListener("mousedown", (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);
  const my = (e.clientY - r.top) * (canvas.height / r.height);

  if (my > SIZE / 2) {
    // 下半分：移動
    moveStartX = mx;
    moveStartY = my;
    moveCurrentX = mx;
    moveCurrentY = my;
    isMoving = true;
    mouseIsMove = true;
  } else {
    // 上半分：照準
    aimStartX = mx;
    aimCurrentX = mx;
    isAiming = true;
    mouseIsMove = false;
  }
  isMouseDown = true;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isMouseDown) return;
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);

  if (mouseIsMove) {
    moveCurrentX = mx;
    moveCurrentY = (e.clientY - r.top) * (canvas.height / r.height);
  } else {
    aimCurrentX = mx;
    aimOffset += (aimCurrentX - aimStartX) * AIM_SENSITIVITY;
    aimOffset = Math.max(-0.8, Math.min(0.8, aimOffset));
    aimStartX = aimCurrentX;
  }
});

canvas.addEventListener("mouseup", () => {
  isMouseDown = false;
  isMoving = false;
  isAiming = false;
});

// スワイプ方向を回転座標系からワールド座標系に変換
function transformSwipeToWorld(dx: number, dy: number): { dx: number; dy: number } {
  const rotation = -getViewRotation(); // 逆回転
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    dx: dx * cos - dy * sin,
    dy: dx * sin + dy * cos,
  };
}

// ゲームループ
let lastTime = performance.now();

function gameLoop() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (myId && myHp > 0) {
    // 下半分スワイプで移動（画面座標をワールド座標に変換）
    if (isMoving) {
      const screenDx = moveCurrentX - moveStartX;
      const screenDy = moveCurrentY - moveStartY;
      const dist = Math.hypot(screenDx, screenDy);

      if (dist > 10) { // デッドゾーン
        // 画面上のスワイプ方向をワールド座標に変換
        const world = transformSwipeToWorld(screenDx, screenDy);
        const worldDist = Math.hypot(world.dx, world.dy);
        const vx = (world.dx / worldDist) * SPEED;
        const vy = (world.dy / worldDist) * SPEED;

        let newX = myX + vx * dt;
        let newY = myY + vy * dt;

        // 領域内に制限
        const clamped = clampToZone(newX, newY, myZone);
        myX = clamped.x;
        myY = clamped.y;
      }
    }

    // 常時連射（二股発射）- 照準オフセット付き
    if (now - lastShotAt >= SHOT_COOLDOWN_MS) {
      lastShotAt = now;

      // 自分のzoneの中心から中心へ向かう方向 + 照準オフセット
      const shootAngle = getZoneCenterAngle(myZone) + Math.PI + aimOffset;

      // 二股
      for (const offset of [-FORK_ANGLE, FORK_ANGLE]) {
        const angle = shootAngle + offset;
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

  // 他プレイヤーの表示位置を補間
  const lerpT = Math.min(1, LERP_SPEED * dt);
  for (const [id, target] of Object.entries(otherPlayers)) {
    if (!otherPlayersDisplay[id]) {
      // 新規プレイヤー：即座に位置を設定
      otherPlayersDisplay[id] = {
        x: target.x,
        y: target.y,
        hp: target.hp,
        zone: target.zone,
        bullets: target.bullets.map(b => ({ x: b.x, y: b.y })),
      };
    } else {
      // 既存プレイヤー：滑らかに補間
      const display = otherPlayersDisplay[id];
      display.x = lerp(display.x, target.x, lerpT);
      display.y = lerp(display.y, target.y, lerpT);
      display.hp = target.hp;
      display.zone = target.zone;

      // 弾の補間
      const newBullets: { x: number; y: number }[] = [];
      for (let i = 0; i < target.bullets.length; i++) {
        const tb = target.bullets[i];
        if (display.bullets[i]) {
          // 既存の弾：補間
          newBullets.push({
            x: lerp(display.bullets[i].x, tb.x, lerpT),
            y: lerp(display.bullets[i].y, tb.y, lerpT),
          });
        } else {
          // 新規の弾：即座に位置を設定
          newBullets.push({ x: tb.x, y: tb.y });
        }
      }
      display.bullets = newBullets;
    }
  }
  // 切断したプレイヤーを削除
  for (const id of Object.keys(otherPlayersDisplay)) {
    if (!otherPlayers[id]) {
      delete otherPlayersDisplay[id];
    }
  }

  requestAnimationFrame(gameLoop);
}

function draw() {
  requestAnimationFrame(draw);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 回転して描画（自分のzoneが下に来るように）
  ctx.save();
  ctx.translate(CENTER_X, CENTER_Y);
  ctx.rotate(getViewRotation());
  ctx.translate(-CENTER_X, -CENTER_Y);

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

  // 他プレイヤーの弾（補間された位置で描画）
  for (const p of Object.values(otherPlayersDisplay)) {
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

  // 他プレイヤー（補間された位置で描画）
  for (const p of Object.values(otherPlayersDisplay)) {
    ctx.fillStyle = PLAYER_COLORS[p.zone] || "#ff5a5a";

    if (p.hp <= 0) ctx.globalAlpha = 0.3;

    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // HPバー（回転を打ち消して水平に描画）
    ctx.save();
    ctx.translate(p.x, p.y - PLAYER_RADIUS - 10);
    ctx.rotate(-getViewRotation());
    drawHpBarAt(0, 0, p.hp);
    ctx.restore();

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

    // HPバー（回転を打ち消して水平に描画）
    ctx.save();
    ctx.translate(myX, myY - PLAYER_RADIUS - 10);
    ctx.rotate(-getViewRotation());
    drawHpBarAt(0, 0, myHp);
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  ctx.restore(); // 回転を元に戻す

  // 画面中央の分割線
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, SIZE / 2);
  ctx.lineTo(SIZE, SIZE / 2);
  ctx.stroke();

  // 移動インジケーター（下半分）
  if (isMoving) {
    ctx.strokeStyle = "rgba(100, 200, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(moveStartX, moveStartY);
    ctx.lineTo(moveCurrentX, moveCurrentY);
    ctx.stroke();

    ctx.fillStyle = "rgba(100, 200, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(moveStartX, moveStartY, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // 照準インジケーター（上半分）- 照準方向を表示
  ctx.save();
  ctx.translate(CENTER_X, SIZE * 0.15);
  // 照準の矢印（操作中は明るく）
  const arrowLen = SIZE * 0.08;
  const arrowAngle = -Math.PI / 2 + aimOffset; // 上向き基準
  const aimAlpha = isAiming ? 1.0 : 0.6;
  ctx.strokeStyle = `rgba(255, 200, 100, ${aimAlpha})`;
  ctx.lineWidth = isAiming ? 4 : 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(arrowAngle) * arrowLen, Math.sin(arrowAngle) * arrowLen);
  ctx.stroke();
  // 矢印の先端
  ctx.fillStyle = `rgba(255, 200, 100, ${aimAlpha})`;
  ctx.beginPath();
  ctx.arc(Math.cos(arrowAngle) * arrowLen, Math.sin(arrowAngle) * arrowLen, isAiming ? 7 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // UI（回転しない）
  ctx.fillStyle = "#ddd";
  ctx.font = `${SIZE * 0.03}px sans-serif`;
  ctx.fillText(`room=${room}  ${connectionStatus}`, SIZE * 0.02, SIZE * 0.05);

  const playerCount = Object.keys(otherPlayers).length + (myId ? 1 : 0);
  ctx.fillText(`Players: ${playerCount}/3`, SIZE * 0.02, SIZE * 0.09);

  // 操作説明
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = `${SIZE * 0.025}px sans-serif`;
  ctx.fillText("↑照準", SIZE * 0.02, SIZE * 0.48);
  ctx.fillText("↓移動", SIZE * 0.02, SIZE * 0.54);
}

function drawHpBarAt(x: number, y: number, hp: number) {
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
