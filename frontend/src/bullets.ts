import {
  ARENA_RADIUS,
  CENTER_X,
  CENTER_Y,
  PLAYER_RADIUS,
  BULLET_SPEED,
  SHOT_COOLDOWN_MS,
  FORK_ANGLE,
  GRENADE_DURATION,
  SHOTGUN_CHILD_SPEED,
  SHOTGUN_CHILD_INTERVAL,
  SHOTGUN_DURATION,
  MISSILE_HOMING_DURATION,
} from "./constants";
import type { SpecialBullet } from "./types";
import * as state from "./state";
import { setMySpecialBullets } from "./state";
import { getZoneCenterAngle, normalizeAngle, pointToLineDistance } from "./utils";
import { sendDamage } from "./network";

// 自分の特殊弾の更新
export function updateMySpecialBullets(dt: number) {
  const now = performance.now();
  const newChildBullets: SpecialBullet[] = [];

  const remaining = state.mySpecialBullets.filter(bullet => {
    switch (bullet.type) {
      case "grenade": {
        const elapsed = now - bullet.createdAt;
        const ratio = Math.max(0, 1 - elapsed / GRENADE_DURATION);
        bullet.vx = (bullet.initialVx ?? 0) * ratio;
        bullet.vy = (bullet.initialVy ?? 0) * ratio;
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        if (ratio <= 0) {
          explodeGrenade(bullet);
          return false;
        }
        return true;
      }

      case "shotgun": {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        if (now - bullet.createdAt > SHOTGUN_DURATION) return false;
        const shotgunDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
        if (shotgunDist > ARENA_RADIUS + 50) return false;
        if (now - (bullet.lastChildShotAt ?? bullet.createdAt) >= SHOTGUN_CHILD_INTERVAL) {
          bullet.lastChildShotAt = now;
          const parentAngle = Math.atan2(bullet.vy, bullet.vx);
          const perpAngles = [parentAngle + Math.PI / 2, parentAngle - Math.PI / 2];
          for (const angle of perpAngles) {
            newChildBullets.push({
              type: "shotgun_child",
              x: bullet.x,
              y: bullet.y,
              vx: Math.cos(angle) * SHOTGUN_CHILD_SPEED,
              vy: Math.sin(angle) * SHOTGUN_CHILD_SPEED,
              createdAt: now,
            });
          }
        }
        return true;
      }

      case "shotgun_child": {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        const childDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
        if (childDist > ARENA_RADIUS + 50) return false;
        return true;
      }

      case "missile": {
        if (now - bullet.createdAt > 3000) return false;
        const missileElapsed = now - bullet.createdAt;
        if (missileElapsed < MISSILE_HOMING_DURATION &&
            bullet.targetId && state.otherPlayers[bullet.targetId] && state.otherPlayers[bullet.targetId].hp > 0) {
          const target = state.otherPlayers[bullet.targetId];
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
        // 見た目上の着弾判定
        for (const [, p] of Object.entries(state.otherPlayers)) {
          if (p.hp <= 0) continue;
          const dx = p.x - bullet.x;
          const dy = p.y - bullet.y;
          if (dx * dx + dy * dy <= (PLAYER_RADIUS * 1.5) ** 2) {
            state.explosionEffects.push({
              x: bullet.x,
              y: bullet.y,
              radius: PLAYER_RADIUS * 2,
              startTime: now,
              duration: 300,
            });
            return false;
          }
        }
        const missileDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
        if (missileDist > ARENA_RADIUS + 50) return false;
        return true;
      }

      default:
        return false;
    }
  });

  remaining.push(...newChildBullets);
  setMySpecialBullets(remaining);
}

function explodeGrenade(bullet: SpecialBullet) {
  const explosionRadius = PLAYER_RADIUS * 8;
  const now = performance.now();
  state.explosionEffects.push({
    x: bullet.x,
    y: bullet.y,
    radius: explosionRadius,
    startTime: now,
    duration: 400,
  });
}

// 敵の特殊弾の更新と被弾判定
export function updateEnemySpecialBullets(dt: number, now: number) {
  const isShielded = now < state.shieldActiveUntil;

  for (const [, bullets] of state.enemySpecialBullets) {
    const newChildBullets: SpecialBullet[] = [];

    const remainingBullets = bullets.filter(bullet => {
      switch (bullet.type) {
        case "grenade": {
          const elapsed = now - bullet.createdAt;
          const ratio = Math.max(0, 1 - elapsed / GRENADE_DURATION);
          bullet.vx = (bullet.initialVx ?? 0) * ratio;
          bullet.vy = (bullet.initialVy ?? 0) * ratio;
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          if (ratio <= 0) {
            const explosionRadius = PLAYER_RADIUS * 8;
            state.explosionEffects.push({
              x: bullet.x,
              y: bullet.y,
              radius: explosionRadius,
              startTime: now,
              duration: 400,
            });
            if (state.myId && state.myHp > 0 && !isShielded) {
              const dist = Math.hypot(state.myX - bullet.x, state.myY - bullet.y);
              if (dist <= explosionRadius) {
                state.setMyHp(Math.max(0, state.myHp - 40));
                sendDamage(40);
              }
            }
            return false;
          }
          return true;
        }

        case "shotgun": {
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          if (now - bullet.createdAt > SHOTGUN_DURATION) return false;
          const shotgunDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
          if (shotgunDist > ARENA_RADIUS + 50) return false;
          if (now - (bullet.lastChildShotAt ?? bullet.createdAt) >= SHOTGUN_CHILD_INTERVAL) {
            bullet.lastChildShotAt = now;
            const parentAngle = Math.atan2(bullet.vy, bullet.vx);
            const perpAngles = [parentAngle + Math.PI / 2, parentAngle - Math.PI / 2];
            for (const angle of perpAngles) {
              newChildBullets.push({
                type: "shotgun_child",
                x: bullet.x,
                y: bullet.y,
                vx: Math.cos(angle) * SHOTGUN_CHILD_SPEED,
                vy: Math.sin(angle) * SHOTGUN_CHILD_SPEED,
                createdAt: now,
              });
            }
          }
          return true;
        }

        case "shotgun_child": {
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          const childDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
          if (childDist > ARENA_RADIUS + 50) return false;
          if (state.myId && state.myHp > 0 && !isShielded) {
            const dx = state.myX - bullet.x;
            const dy = state.myY - bullet.y;
            if (dx * dx + dy * dy <= (PLAYER_RADIUS * 1.2) ** 2) {
              state.setMyHp(Math.max(0, state.myHp - 8));
              sendDamage(8);
              return false;
            }
          }
          return true;
        }

        case "missile": {
          if (now - bullet.createdAt > 3000) return false;
          const missileElapsed = now - bullet.createdAt;
          if (missileElapsed < MISSILE_HOMING_DURATION) {
            let targetX: number | undefined;
            let targetY: number | undefined;
            if (bullet.targetId === state.myId && state.myHp > 0) {
              targetX = state.myX;
              targetY = state.myY;
            } else if (bullet.targetId && state.otherPlayers[bullet.targetId] && state.otherPlayers[bullet.targetId].hp > 0) {
              const target = state.otherPlayers[bullet.targetId];
              targetX = target.x;
              targetY = target.y;
            }
            if (targetX !== undefined && targetY !== undefined) {
              const toTarget = Math.atan2(targetY - bullet.y, targetX - bullet.x);
              const currentAngle = Math.atan2(bullet.vy, bullet.vx);
              let angleDiff = normalizeAngle(toTarget - currentAngle);
              const turnRate = 3.0 * dt;
              angleDiff = Math.max(-turnRate, Math.min(turnRate, angleDiff));
              const newAngle = currentAngle + angleDiff;
              const speed = Math.hypot(bullet.vx, bullet.vy);
              bullet.vx = Math.cos(newAngle) * speed;
              bullet.vy = Math.sin(newAngle) * speed;
            }
          }
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          if (state.myId && state.myHp > 0 && !isShielded) {
            const dx = state.myX - bullet.x;
            const dy = state.myY - bullet.y;
            if (dx * dx + dy * dy <= (PLAYER_RADIUS * 1.5) ** 2) {
              state.setMyHp(Math.max(0, state.myHp - 35));
              sendDamage(35);
              state.explosionEffects.push({
                x: bullet.x,
                y: bullet.y,
                radius: PLAYER_RADIUS * 2,
                startTime: now,
                duration: 300,
              });
              return false;
            }
          }
          const missileDist = Math.hypot(bullet.x - CENTER_X, bullet.y - CENTER_Y);
          if (missileDist > ARENA_RADIUS + 50) return false;
          return true;
        }

        default:
          return false;
      }
    });

    remainingBullets.push(...newChildBullets);
    bullets.length = 0;
    bullets.push(...remainingBullets);
  }
}

// 敵のビーム警告の更新と被弾判定
export function updateEnemyBeamWarnings(now: number) {
  const isShielded = now < state.shieldActiveUntil;

  for (const [fromId, warnings] of state.enemyBeamWarnings) {
    for (const warning of warnings) {
      if (!warning.fired && now >= warning.fireAt) {
        warning.fired = true;
        const effects = state.enemyBeamEffects.get(fromId) ?? [];
        effects.push({
          startX: warning.startX,
          startY: warning.startY,
          angle: warning.angle,
          endTime: now + 300,
        });
        state.enemyBeamEffects.set(fromId, effects);
        if (state.myId && state.myHp > 0 && !isShielded) {
          const endX = warning.startX + Math.cos(warning.angle) * ARENA_RADIUS * 2;
          const endY = warning.startY + Math.sin(warning.angle) * ARENA_RADIUS * 2;
          if (pointToLineDistance(state.myX, state.myY, warning.startX, warning.startY, endX, endY) < PLAYER_RADIUS * 1.5) {
            state.setMyHp(Math.max(0, state.myHp - 60));
            sendDamage(60);
          }
        }
      }
    }
    state.enemyBeamWarnings.set(fromId, warnings.filter(w => !w.fired));
  }
}

// 他プレイヤーの通常弾をローカルで生成・更新
export function updateEnemyNormalBullets(dt: number, now: number) {
  for (const [id, p] of Object.entries(state.otherPlayers)) {
    if (p.hp <= 0) continue;

    let bullets = state.allPlayerBullets.get(id) ?? [];
    let lastShot = state.lastBulletShotTime.get(id) ?? now;

    if (now - lastShot >= SHOT_COOLDOWN_MS) {
      state.lastBulletShotTime.set(id, now);
      const shootAngle = getZoneCenterAngle(p.zone) + Math.PI + p.aimOffset;
      for (const offset of [-FORK_ANGLE, FORK_ANGLE]) {
        const angle = shootAngle + offset;
        const bvx = Math.cos(angle) * BULLET_SPEED;
        const bvy = Math.sin(angle) * BULLET_SPEED;
        bullets.push({ x: p.x, y: p.y, vx: bvx, vy: bvy });
      }
    }

    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    bullets = bullets.filter(b => {
      const dx = b.x - CENTER_X;
      const dy = b.y - CENTER_Y;
      return Math.hypot(dx, dy) <= ARENA_RADIUS + 50;
    });

    state.allPlayerBullets.set(id, bullets);
  }
}

// 敵の通常弾 vs 自機の被弾判定
export function checkEnemyBulletCollisions(now: number) {
  if (!state.myId || state.myHp <= 0 || now < state.shieldActiveUntil) return;

  for (const [id, bullets] of state.allPlayerBullets) {
    for (const b of bullets) {
      const dx = state.myX - b.x;
      const dy = state.myY - b.y;
      const hitRadius = PLAYER_RADIUS * 1.2;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        state.setMyHp(Math.max(0, state.myHp - 1));
        sendDamage(1);
        b.x = 1e9;
        b.y = 1e9;
      }
    }
    state.allPlayerBullets.set(id, bullets.filter(b => b.x < 1e8));
  }
}

// ビーム発射処理
export function executeBeamFire(warning: typeof state.beamWarnings[0]) {
  state.beamEffects.push({
    startX: warning.startX,
    startY: warning.startY,
    angle: warning.angle,
    endTime: performance.now() + 300,
  });
}
