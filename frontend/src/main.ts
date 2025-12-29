const canvas = document.createElement("canvas");
// スマホ向け：正方形キャンバス + 武器エリア
const SIZE = Math.min(window.innerWidth, window.innerHeight);
const WEAPON_AREA_HEIGHT = SIZE * 0.15;
const GAME_AREA_HEIGHT = SIZE;
canvas.width = SIZE;
canvas.height = SIZE + WEAPON_AREA_HEIGHT;
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

// 武器システム
type WeaponId = "grenade" | "beam" | "shotgun" | "missile" | "shield";
type WeaponMark = "hexagon" | "diamond" | "triangle" | "star" | "circle";

type Weapon = {
  id: WeaponId;
  name: string;
  mark: WeaponMark;
  damage: number;
  cooldown: number;
  color: string;
  lastUsedAt: number;
};

const WEAPONS: Weapon[] = [
  { id: "grenade", name: "グレネード", mark: "hexagon", damage: 40, cooldown: 5000, color: "#ff6600", lastUsedAt: -Infinity },
  { id: "beam", name: "ビーム", mark: "diamond", damage: 60, cooldown: 8000, color: "#00ffff", lastUsedAt: -Infinity },
  { id: "shotgun", name: "ショットガン", mark: "triangle", damage: 8, cooldown: 3000, color: "#ffff00", lastUsedAt: -Infinity },
  { id: "missile", name: "ミサイル", mark: "star", damage: 35, cooldown: 6000, color: "#ff00ff", lastUsedAt: -Infinity },
  { id: "shield", name: "シールド", mark: "circle", damage: 0, cooldown: 10000, color: "#00ff00", lastUsedAt: -Infinity },
];

// 武器ボタンのサイズ計算
const BUTTON_COUNT = 5;
const BUTTON_GAP = SIZE * 0.02;
const BUTTON_SIZE = (SIZE - BUTTON_GAP * (BUTTON_COUNT + 1)) / BUTTON_COUNT;
const BUTTON_Y = GAME_AREA_HEIGHT + (WEAPON_AREA_HEIGHT - BUTTON_SIZE) / 2;

// 特殊弾の型
type SpecialBullet = {
  type: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  createdAt: number;
  targetId?: string;
  explosionTime?: number;
};

let mySpecialBullets: SpecialBullet[] = [];
let shieldActiveUntil = 0;

// ビームエフェクト
type BeamEffect = {
  startX: number;
  startY: number;
  angle: number;
  endTime: number;
};
let beamEffects: BeamEffect[] = [];

// 爆発エフェクト
type ExplosionEffect = {
  x: number;
  y: number;
  radius: number;
  startTime: number;
  duration: number;
};
let explosionEffects: ExplosionEffect[] = [];

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
      // シールド中はダメージ無効
      if (performance.now() < shieldActiveUntil) {
        return;
      }
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

// 武器スワイプ用
let weaponTouchId: number | null = null;
let weaponTouchStartX = 0;
let weaponTouchStartY = 0;
let weaponTouchCurrentX = 0;
let weaponTouchCurrentY = 0;
let activeWeaponIndex: number | null = null;

// タッチ領域の判定
function getTouchZone(y: number): "aim" | "move" | "weapon" {
  if (y > GAME_AREA_HEIGHT) return "weapon";
  if (y > GAME_AREA_HEIGHT / 2) return "move";
  return "aim";
}

// どの武器ボタンがタッチされたか
function getWeaponIndexAtPos(x: number, y: number): number | null {
  if (y < GAME_AREA_HEIGHT || y > GAME_AREA_HEIGHT + WEAPON_AREA_HEIGHT) return null;
  for (let i = 0; i < BUTTON_COUNT; i++) {
    const bx = BUTTON_GAP + i * (BUTTON_SIZE + BUTTON_GAP);
    if (x >= bx && x <= bx + BUTTON_SIZE) {
      return i;
    }
  }
  return null;
}

// 武器が使用可能か
function isWeaponReady(weapon: Weapon): boolean {
  return performance.now() - weapon.lastUsedAt >= weapon.cooldown;
}

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
    const zone = getTouchZone(pos.y);

    if (zone === "weapon" && weaponTouchId === null) {
      // 武器エリア
      const weaponIndex = getWeaponIndexAtPos(pos.x, pos.y);
      if (weaponIndex !== null && isWeaponReady(WEAPONS[weaponIndex])) {
        weaponTouchId = touch.identifier;
        weaponTouchStartX = pos.x;
        weaponTouchStartY = pos.y;
        weaponTouchCurrentX = pos.x;
        weaponTouchCurrentY = pos.y;
        activeWeaponIndex = weaponIndex;
      }
    } else if (zone === "move" && moveTouchId === null) {
      // 下半分：移動（まだ移動タッチがない場合）
      moveTouchId = touch.identifier;
      moveStartX = pos.x;
      moveStartY = pos.y;
      moveCurrentX = pos.x;
      moveCurrentY = pos.y;
      isMoving = true;
    } else if (zone === "aim" && aimTouchId === null) {
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

    if (touch.identifier === weaponTouchId) {
      // 武器スワイプの更新
      weaponTouchCurrentX = pos.x;
      weaponTouchCurrentY = pos.y;
    }

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

    if (touch.identifier === weaponTouchId) {
      // 武器発射
      const dx = weaponTouchCurrentX - weaponTouchStartX;
      const dy = weaponTouchCurrentY - weaponTouchStartY;
      const swipeDist = Math.hypot(dx, dy);

      if (activeWeaponIndex !== null) {
        const weapon = WEAPONS[activeWeaponIndex];
        if (weapon.id === "shield") {
          // シールドはスワイプ不要
          fireWeapon(weapon, 0);
        } else if (swipeDist > 30) {
          // 十分なスワイプ距離がある場合のみ発射
          const screenAngle = Math.atan2(dy, dx);
          fireWeapon(weapon, screenAngle);
        }
      }

      weaponTouchId = null;
      activeWeaponIndex = null;
    }

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

    if (touch.identifier === weaponTouchId) {
      weaponTouchId = null;
      activeWeaponIndex = null;
    }

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

// 画面角度をワールド角度に変換
function transformAngleToWorld(screenAngle: number): number {
  return screenAngle - getViewRotation();
}

// 点と線分の距離
function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let t = lenSq !== 0 ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  const nearestX = x1 + t * C;
  const nearestY = y1 + t * D;
  return Math.hypot(px - nearestX, py - nearestY);
}

// 武器発射
function fireWeapon(weapon: Weapon, screenAngle: number) {
  weapon.lastUsedAt = performance.now();
  const worldAngle = transformAngleToWorld(screenAngle);

  switch (weapon.id) {
    case "grenade":
      fireGrenade(worldAngle);
      break;
    case "beam":
      fireBeam(worldAngle);
      break;
    case "shotgun":
      fireShotgun(worldAngle);
      break;
    case "missile":
      fireMissile(worldAngle);
      break;
    case "shield":
      activateShield();
      break;
  }
}

// グレネード発射
function fireGrenade(angle: number) {
  const speed = SIZE * 0.5; // 飛距離短め
  mySpecialBullets.push({
    type: "grenade",
    x: myX,
    y: myY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    createdAt: performance.now(),
    explosionTime: performance.now() + 800,
  });
}

// ビーム発射
function fireBeam(angle: number) {
  const startX = myX;
  const startY = myY;
  const endX = startX + Math.cos(angle) * ARENA_RADIUS * 2;
  const endY = startY + Math.sin(angle) * ARENA_RADIUS * 2;

  // レーザー線上の当たり判定
  for (const [id, p] of Object.entries(otherPlayers)) {
    if (p.hp <= 0) continue;
    if (pointToLineDistance(p.x, p.y, startX, startY, endX, endY) < PLAYER_RADIUS * 1.5) {
      // 60ダメージ
      for (let i = 0; i < 60; i++) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "hit", targetId: id }));
        }
      }
    }
  }

  // ビームエフェクト追加
  beamEffects.push({
    startX,
    startY,
    angle,
    endTime: performance.now() + 300,
  });
}

// ショットガン発射
function fireShotgun(centerAngle: number) {
  const pelletCount = 7;
  const spreadAngle = 0.6;
  const speed = SIZE * 2.5;

  for (let i = 0; i < pelletCount; i++) {
    const offset = (i - (pelletCount - 1) / 2) * (spreadAngle / (pelletCount - 1));
    const angle = centerAngle + offset;

    mySpecialBullets.push({
      type: "shotgun",
      x: myX,
      y: myY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      createdAt: performance.now(),
    });
  }
}

// ミサイル発射
function fireMissile(initialAngle: number) {
  // 最も近い敵を探す
  let nearestId: string | null = null;
  let nearestDist = Infinity;

  for (const [id, p] of Object.entries(otherPlayers)) {
    if (p.hp <= 0) continue;
    const dist = Math.hypot(p.x - myX, p.y - myY);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = id;
    }
  }

  const speed = SIZE * 1.5;
  mySpecialBullets.push({
    type: "missile",
    x: myX,
    y: myY,
    vx: Math.cos(initialAngle) * speed,
    vy: Math.sin(initialAngle) * speed,
    createdAt: performance.now(),
    targetId: nearestId ?? undefined,
  });
}

// シールド発動
function activateShield() {
  shieldActiveUntil = performance.now() + 3000;
}

// 特殊弾の更新
function updateSpecialBullets(dt: number) {
  const now = performance.now();

  mySpecialBullets = mySpecialBullets.filter(bullet => {
    switch (bullet.type) {
      case "grenade":
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        // 爆発判定
        if (now >= bullet.explosionTime!) {
          explodeGrenade(bullet);
          return false;
        }
        return true;

      case "shotgun":
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        // 射程制限（アリーナ外で消滅）
        const shotgunDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
        if (shotgunDist > ARENA_RADIUS + 50) return false;
        // 当たり判定
        for (const [id, p] of Object.entries(otherPlayers)) {
          if (p.hp <= 0) continue;
          const dx = p.x - bullet.x;
          const dy = p.y - bullet.y;
          if (dx * dx + dy * dy <= (PLAYER_RADIUS * 1.2) ** 2) {
            // 8ダメージ
            for (let i = 0; i < 8; i++) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "hit", targetId: id }));
              }
            }
            return false;
          }
        }
        return true;

      case "missile":
        // 3秒経過で消滅
        if (now - bullet.createdAt > 3000) return false;
        // ターゲット追尾
        if (bullet.targetId && otherPlayers[bullet.targetId] && otherPlayers[bullet.targetId].hp > 0) {
          const target = otherPlayers[bullet.targetId];
          const toTarget = Math.atan2(target.y - bullet.y, target.x - bullet.x);
          const currentAngle = Math.atan2(bullet.vy, bullet.vx);
          let angleDiff = normalizeAngle(toTarget - currentAngle);
          const turnRate = 3.0 * dt;
          angleDiff = Math.max(-turnRate, Math.min(turnRate, angleDiff));
          const newAngle = currentAngle + angleDiff;
          const speed = Math.hypot(bullet.vx, bullet.vy);
          bullet.vx = Math.cos(newAngle) * speed;
          bullet.vy = Math.sin(newAngle) * speed;
        }
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        // 当たり判定
        for (const [id, p] of Object.entries(otherPlayers)) {
          if (p.hp <= 0) continue;
          const dx = p.x - bullet.x;
          const dy = p.y - bullet.y;
          if (dx * dx + dy * dy <= (PLAYER_RADIUS * 1.5) ** 2) {
            // 35ダメージ
            for (let i = 0; i < 35; i++) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "hit", targetId: id }));
              }
            }
            // 爆発エフェクト
            explosionEffects.push({
              x: bullet.x,
              y: bullet.y,
              radius: PLAYER_RADIUS * 2,
              startTime: now,
              duration: 300,
            });
            return false;
          }
        }
        // アリーナ外で消滅
        const missileDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
        if (missileDist > ARENA_RADIUS + 50) return false;
        return true;

      default:
        return false;
    }
  });
}

// グレネード爆発
function explodeGrenade(bullet: SpecialBullet) {
  const explosionRadius = PLAYER_RADIUS * 8; // 広範囲
  const now = performance.now();

  // 範囲内の全プレイヤーにダメージ
  for (const [id, p] of Object.entries(otherPlayers)) {
    if (p.hp <= 0) continue;
    const dist = Math.hypot(p.x - bullet.x, p.y - bullet.y);
    if (dist <= explosionRadius) {
      // 40ダメージ
      for (let i = 0; i < 40; i++) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "hit", targetId: id }));
        }
      }
    }
  }

  // 爆発エフェクト追加
  explosionEffects.push({
    x: bullet.x,
    y: bullet.y,
    radius: explosionRadius,
    startTime: now,
    duration: 400,
  });
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

  // 特殊弾の更新
  updateSpecialBullets(dt);

  // エフェクトの更新
  beamEffects = beamEffects.filter(e => now < e.endTime);
  explosionEffects = explosionEffects.filter(e => now < e.startTime + e.duration);

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

  // 特殊弾の描画
  for (const b of mySpecialBullets) {
    const weapon = WEAPONS.find(w => w.id === b.type);
    if (!weapon) continue;
    ctx.fillStyle = weapon.color;
    const bulletSize = b.type === "grenade" ? SIZE * 0.025 : b.type === "missile" ? SIZE * 0.02 : SIZE * 0.015;
    ctx.beginPath();
    ctx.arc(b.x, b.y, bulletSize, 0, Math.PI * 2);
    ctx.fill();
    // ミサイルには方向を示す三角形を追加
    if (b.type === "missile") {
      const angle = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(bulletSize * 1.5, 0);
      ctx.lineTo(-bulletSize * 0.5, -bulletSize * 0.8);
      ctx.lineTo(-bulletSize * 0.5, bulletSize * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ビームエフェクトの描画
  const now = performance.now();
  for (const beam of beamEffects) {
    const alpha = (beam.endTime - now) / 300;
    ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
    ctx.lineWidth = SIZE * 0.02;
    ctx.beginPath();
    ctx.moveTo(beam.startX, beam.startY);
    ctx.lineTo(
      beam.startX + Math.cos(beam.angle) * ARENA_RADIUS * 2,
      beam.startY + Math.sin(beam.angle) * ARENA_RADIUS * 2
    );
    ctx.stroke();
    // 中心の細い線
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = SIZE * 0.005;
    ctx.beginPath();
    ctx.moveTo(beam.startX, beam.startY);
    ctx.lineTo(
      beam.startX + Math.cos(beam.angle) * ARENA_RADIUS * 2,
      beam.startY + Math.sin(beam.angle) * ARENA_RADIUS * 2
    );
    ctx.stroke();
  }

  // 爆発エフェクトの描画
  for (const exp of explosionEffects) {
    const elapsed = now - exp.startTime;
    const progress = elapsed / exp.duration;
    const currentRadius = exp.radius * (0.5 + progress * 0.5);
    const alpha = 1 - progress;

    // 外側のリング
    ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
    ctx.lineWidth = SIZE * 0.01;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, currentRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の塗りつぶし
    ctx.fillStyle = `rgba(255, 200, 50, ${alpha * 0.5})`;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, currentRadius * 0.7, 0, Math.PI * 2);
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

    // シールドエフェクト
    if (now < shieldActiveUntil) {
      const shieldAlpha = 0.3 + 0.2 * Math.sin(now / 100);
      ctx.strokeStyle = `rgba(0, 255, 0, ${shieldAlpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(myX, myY, PLAYER_RADIUS * 1.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(0, 255, 0, ${shieldAlpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(myX, myY, PLAYER_RADIUS * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

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

  // 武器エリアの背景
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, GAME_AREA_HEIGHT, SIZE, WEAPON_AREA_HEIGHT);

  // 武器ボタンの描画
  drawWeaponButtons();

  // 武器スワイプインジケーター
  if (weaponTouchId !== null && activeWeaponIndex !== null) {
    const dx = weaponTouchCurrentX - weaponTouchStartX;
    const dy = weaponTouchCurrentY - weaponTouchStartY;
    const dist = Math.hypot(dx, dy);

    if (dist > 10) {
      const weapon = WEAPONS[activeWeaponIndex];
      ctx.strokeStyle = weapon.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(weaponTouchStartX, weaponTouchStartY);
      ctx.lineTo(weaponTouchCurrentX, weaponTouchCurrentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 矢印の先端
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(weaponTouchCurrentX, weaponTouchCurrentY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-12, 8);
      ctx.closePath();
      ctx.fillStyle = weapon.color;
      ctx.fill();
      ctx.restore();
    }
  }
}

// 武器ボタン描画
function drawWeaponButtons() {
  const now = performance.now();

  for (let i = 0; i < BUTTON_COUNT; i++) {
    const weapon = WEAPONS[i];
    const x = BUTTON_GAP + i * (BUTTON_SIZE + BUTTON_GAP);
    const y = BUTTON_Y;
    const isReady = isWeaponReady(weapon);
    const isActive = activeWeaponIndex === i;

    // ボタン背景
    ctx.fillStyle = isActive ? "#444" : isReady ? "#333" : "#222";
    ctx.beginPath();
    ctx.roundRect(x, y, BUTTON_SIZE, BUTTON_SIZE, 8);
    ctx.fill();

    // 枠線
    ctx.strokeStyle = isActive ? weapon.color : isReady ? "#555" : "#333";
    ctx.lineWidth = isActive ? 3 : 2;
    ctx.beginPath();
    ctx.roundRect(x, y, BUTTON_SIZE, BUTTON_SIZE, 8);
    ctx.stroke();

    // 幾何学マーク
    const cx = x + BUTTON_SIZE / 2;
    const cy = y + BUTTON_SIZE / 2;
    const markSize = BUTTON_SIZE * 0.28;
    ctx.strokeStyle = isReady ? weapon.color : "#555";
    ctx.fillStyle = isReady ? weapon.color : "#555";
    ctx.lineWidth = 2.5;

    drawWeaponMark(cx, cy, markSize, weapon.mark);

    // クールタイム表示
    if (!isReady) {
      const elapsed = now - weapon.lastUsedAt;
      const remaining = weapon.cooldown - elapsed;
      const ratio = Math.max(0, remaining / weapon.cooldown);

      // 暗いオーバーレイ（パイチャート式）
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, BUTTON_SIZE / 2 - 4, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      // 残り秒数
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${BUTTON_SIZE * 0.3}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.ceil(remaining / 1000).toString(), cx, cy);
    }
  }
}

// 幾何学マーク描画
function drawWeaponMark(cx: number, cy: number, size: number, mark: WeaponMark) {
  ctx.beginPath();

  switch (mark) {
    case "hexagon":
      // 六角形
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
        const px = cx + Math.cos(angle) * size;
        const py = cy + Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;

    case "diamond":
      // 菱形
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size, cy);
      ctx.closePath();
      ctx.stroke();
      break;

    case "triangle":
      // 三角形（上向き）
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size * 0.866, cy + size * 0.5);
      ctx.lineTo(cx - size * 0.866, cy + size * 0.5);
      ctx.closePath();
      ctx.stroke();
      break;

    case "star":
      // 五芒星
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? size : size * 0.4;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;

    case "circle":
      // 二重円
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
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
