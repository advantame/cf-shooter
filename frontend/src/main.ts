import {
  SIZE,
  WEAPON_AREA_HEIGHT,
  SPEED,
  BULLET_SPEED,
  SHOT_COOLDOWN_MS,
  FORK_ANGLE,
  ARENA_RADIUS,
  CENTER_X,
  CENTER_Y,
} from "./constants";
import * as state from "./state";
import { clampToZone, transformSwipeToWorld, getZoneCenterAngle } from "./utils";
import { connect, sendState } from "./network";
import { setupInput, isMoving, moveCurrentX, moveCurrentY, getMoveStart } from "./input";
import {
  updateMySpecialBullets,
  updateEnemySpecialBullets,
  updateEnemyBeamWarnings,
  updateEnemyNormalBullets,
  checkEnemyBulletCollisions,
  executeBeamFire,
} from "./bullets";
import { draw } from "./render";

// キャンバス作成
const canvas = document.createElement("canvas");
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

// 初期化
setupInput(canvas);
connect();

// ゲームループ
let lastTime = performance.now();

function gameLoop() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (state.myId && state.myHp > 0) {
    // 移動処理
    if (isMoving) {
      const moveStart = getMoveStart();
      const screenDx = moveCurrentX - moveStart.x;
      const screenDy = moveCurrentY - moveStart.y;
      const dist = Math.hypot(screenDx, screenDy);

      if (dist > 10) {
        const world = transformSwipeToWorld(screenDx, screenDy);
        const worldDist = Math.hypot(world.dx, world.dy);
        const vx = (world.dx / worldDist) * SPEED;
        const vy = (world.dy / worldDist) * SPEED;

        let newX = state.myX + vx * dt;
        let newY = state.myY + vy * dt;

        const clamped = clampToZone(newX, newY, state.myZone);
        state.setMyX(clamped.x);
        state.setMyY(clamped.y);
      }
    }

    // 常時連射
    if (now - state.lastShotAt >= SHOT_COOLDOWN_MS) {
      state.setLastShotAt(now);

      const shootAngle = getZoneCenterAngle(state.myZone) + Math.PI + state.aimOffset;

      for (const offset of [-FORK_ANGLE, FORK_ANGLE]) {
        const angle = shootAngle + offset;
        const bvx = Math.cos(angle) * BULLET_SPEED;
        const bvy = Math.sin(angle) * BULLET_SPEED;
        state.myBullets.push({ x: state.myX, y: state.myY, vx: bvx, vy: bvy });
      }
    }
  }

  // 自分の弾の更新
  for (const b of state.myBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // 画面外の弾を除去
  state.setMyBullets(state.myBullets.filter(b => {
    const dx = b.x - CENTER_X;
    const dy = b.y - CENTER_Y;
    return Math.hypot(dx, dy) <= ARENA_RADIUS + 50;
  }));

  // 他プレイヤーの通常弾を更新
  updateEnemyNormalBullets(dt, now);

  // 敵の通常弾 vs 自機の被弾判定
  checkEnemyBulletCollisions(now);

  // 特殊弾の更新
  updateMySpecialBullets(dt);
  updateEnemySpecialBullets(dt, now);

  // ビーム警告の更新
  for (const warning of state.beamWarnings) {
    if (!warning.fired && now >= warning.fireAt) {
      executeBeamFire(warning);
      warning.fired = true;
    }
  }
  state.setBeamWarnings(state.beamWarnings.filter(w => !w.fired));

  // 敵のビーム警告の更新
  updateEnemyBeamWarnings(now);

  // エフェクトの更新
  state.setBeamEffects(state.beamEffects.filter(e => now < e.endTime));
  state.setExplosionEffects(state.explosionEffects.filter(e => now < e.startTime + e.duration));
  for (const [id, effects] of state.enemyBeamEffects) {
    state.enemyBeamEffects.set(id, effects.filter(e => now < e.endTime));
  }

  // 自分の状態をサーバーに送信
  sendState();

  requestAnimationFrame(gameLoop);
}

function drawLoop() {
  requestAnimationFrame(drawLoop);
  draw(ctx);
}

// 開始
gameLoop();
drawLoop();
