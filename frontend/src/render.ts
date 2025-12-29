import {
  SIZE,
  GAME_AREA_HEIGHT,
  WEAPON_AREA_HEIGHT,
  CENTER_X,
  CENTER_Y,
  ARENA_RADIUS,
  PLAYER_RADIUS,
  MAX_HP,
  BUTTON_COUNT,
  BUTTON_GAP,
  BUTTON_SIZE,
  BUTTON_Y,
  ZONE_COLORS,
  PLAYER_COLORS,
} from "./constants";
import type { WeaponMark } from "./types";
import * as state from "./state";
import { getViewRotation, getZoneAngles } from "./utils";
import { WEAPONS, isWeaponReady } from "./weapons";
import { room } from "./network";
import {
  isMoving,
  isAiming,
  moveCurrentX,
  moveCurrentY,
  getMoveStart,
  activeWeaponIndex,
  weaponTouchCurrentX,
  weaponTouchCurrentY,
  getWeaponTouchStart,
} from "./input";

export function draw(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const now = performance.now();

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
    ctx.fillStyle = zone === state.myZone ? ZONE_COLORS[zone].replace("0.15", "0.25") : ZONE_COLORS[zone];
    ctx.beginPath();
    ctx.moveTo(CENTER_X, CENTER_Y);
    ctx.arc(CENTER_X, CENTER_Y, ARENA_RADIUS, start, end);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CENTER_X, CENTER_Y);
    ctx.lineTo(CENTER_X + Math.cos(start) * ARENA_RADIUS, CENTER_Y + Math.sin(start) * ARENA_RADIUS);
    ctx.stroke();
  }

  // 他プレイヤーの通常弾
  for (const [id, bullets] of state.allPlayerBullets) {
    const player = state.otherPlayers[id];
    if (!player) continue;
    ctx.fillStyle = PLAYER_COLORS[player.zone] || "#ff6600";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, SIZE * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 他プレイヤーの特殊弾
  for (const [, bullets] of state.enemySpecialBullets) {
    for (const b of bullets) {
      const weapon = WEAPONS.find(w => w.id === b.type || (b.type === "shotgun_child" && w.id === "shotgun"));
      if (!weapon) continue;
      ctx.fillStyle = weapon.color;
      const bulletSize = b.type === "grenade" ? SIZE * 0.025 :
                         b.type === "missile" ? SIZE * 0.02 :
                         b.type === "shotgun" ? SIZE * 0.02 :
                         b.type === "shotgun_child" ? SIZE * 0.012 :
                         SIZE * 0.015;
      ctx.beginPath();
      ctx.arc(b.x, b.y, bulletSize, 0, Math.PI * 2);
      ctx.fill();
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
  }

  // 他プレイヤーのビーム警告
  for (const [, warnings] of state.enemyBeamWarnings) {
    for (const warning of warnings) {
      const blinkPhase = Math.sin(now / 50) * 0.5 + 0.5;
      const alpha = 0.3 + blinkPhase * 0.5;
      ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
      ctx.lineWidth = SIZE * 0.01;
      ctx.setLineDash([SIZE * 0.02, SIZE * 0.015]);
      ctx.beginPath();
      ctx.moveTo(warning.startX, warning.startY);
      ctx.lineTo(
        warning.startX + Math.cos(warning.angle) * ARENA_RADIUS * 2,
        warning.startY + Math.sin(warning.angle) * ARENA_RADIUS * 2
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 他プレイヤーのビームエフェクト
  for (const [, effects] of state.enemyBeamEffects) {
    for (const beam of effects) {
      const alpha = Math.min(1, (beam.endTime - now) / 300);
      if (alpha <= 0) continue;
      ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
      ctx.lineWidth = SIZE * 0.12;
      ctx.beginPath();
      ctx.moveTo(beam.startX, beam.startY);
      ctx.lineTo(
        beam.startX + Math.cos(beam.angle) * ARENA_RADIUS * 2,
        beam.startY + Math.sin(beam.angle) * ARENA_RADIUS * 2
      );
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = SIZE * 0.03;
      ctx.beginPath();
      ctx.moveTo(beam.startX, beam.startY);
      ctx.lineTo(
        beam.startX + Math.cos(beam.angle) * ARENA_RADIUS * 2,
        beam.startY + Math.sin(beam.angle) * ARENA_RADIUS * 2
      );
      ctx.stroke();
    }
  }

  // 自分の弾
  ctx.fillStyle = PLAYER_COLORS[state.myZone];
  for (const b of state.myBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, SIZE * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }

  // 自分の特殊弾
  for (const b of state.mySpecialBullets) {
    const weapon = WEAPONS.find(w => w.id === b.type || (b.type === "shotgun_child" && w.id === "shotgun"));
    const bulletColor = weapon?.color ?? "#ffff00";
    ctx.fillStyle = bulletColor;
    const bulletSize = b.type === "grenade" ? SIZE * 0.025 :
                       b.type === "missile" ? SIZE * 0.02 :
                       b.type === "shotgun" ? SIZE * 0.02 :
                       b.type === "shotgun_child" ? SIZE * 0.012 :
                       SIZE * 0.015;
    ctx.beginPath();
    ctx.arc(b.x, b.y, bulletSize, 0, Math.PI * 2);
    ctx.fill();
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

  // 自分のビーム警告
  for (const warning of state.beamWarnings) {
    const blinkPhase = Math.sin(now / 50) * 0.5 + 0.5;
    const alpha = 0.3 + blinkPhase * 0.5;
    ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
    ctx.lineWidth = SIZE * 0.01;
    ctx.setLineDash([SIZE * 0.02, SIZE * 0.015]);
    ctx.beginPath();
    ctx.moveTo(warning.startX, warning.startY);
    ctx.lineTo(
      warning.startX + Math.cos(warning.angle) * ARENA_RADIUS * 2,
      warning.startY + Math.sin(warning.angle) * ARENA_RADIUS * 2
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 自分のビームエフェクト
  for (const beam of state.beamEffects) {
    const alpha = (beam.endTime - now) / 300;
    ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
    ctx.lineWidth = SIZE * 0.12;
    ctx.beginPath();
    ctx.moveTo(beam.startX, beam.startY);
    ctx.lineTo(
      beam.startX + Math.cos(beam.angle) * ARENA_RADIUS * 2,
      beam.startY + Math.sin(beam.angle) * ARENA_RADIUS * 2
    );
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = SIZE * 0.03;
    ctx.beginPath();
    ctx.moveTo(beam.startX, beam.startY);
    ctx.lineTo(
      beam.startX + Math.cos(beam.angle) * ARENA_RADIUS * 2,
      beam.startY + Math.sin(beam.angle) * ARENA_RADIUS * 2
    );
    ctx.stroke();
  }

  // 爆発エフェクト
  for (const exp of state.explosionEffects) {
    const elapsed = now - exp.startTime;
    const progress = elapsed / exp.duration;
    const currentRadius = exp.radius * (0.5 + progress * 0.5);
    const alpha = 1 - progress;
    ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
    ctx.lineWidth = SIZE * 0.01;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, currentRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 200, 50, ${alpha * 0.5})`;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, currentRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 他プレイヤー
  for (const p of Object.values(state.otherPlayers)) {
    ctx.fillStyle = PLAYER_COLORS[p.zone] || "#ff5a5a";
    if (p.hp <= 0) ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    if (p.shield) {
      const shieldAlpha = 0.3 + 0.2 * Math.sin(now / 100);
      ctx.strokeStyle = `rgba(0, 255, 0, ${shieldAlpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS * 1.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(0, 255, 0, ${shieldAlpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(p.x, p.y - PLAYER_RADIUS - 10);
    ctx.rotate(-getViewRotation());
    drawHpBarAt(ctx, 0, 0, p.hp);
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  // 自分
  if (state.myId) {
    ctx.fillStyle = PLAYER_COLORS[state.myZone];
    if (state.myHp <= 0) ctx.globalAlpha = 0.3;

    ctx.beginPath();
    ctx.arc(state.myX, state.myY, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.myX, state.myY, PLAYER_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();

    if (now < state.shieldActiveUntil) {
      const shieldAlpha = 0.3 + 0.2 * Math.sin(now / 100);
      ctx.strokeStyle = `rgba(0, 255, 0, ${shieldAlpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(state.myX, state.myY, PLAYER_RADIUS * 1.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(0, 255, 0, ${shieldAlpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(state.myX, state.myY, PLAYER_RADIUS * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(state.myX, state.myY - PLAYER_RADIUS - 10);
    ctx.rotate(-getViewRotation());
    drawHpBarAt(ctx, 0, 0, state.myHp);
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // 画面中央の分割線
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, SIZE / 2);
  ctx.lineTo(SIZE, SIZE / 2);
  ctx.stroke();

  // 移動インジケーター
  if (isMoving) {
    const moveStart = getMoveStart();
    ctx.strokeStyle = "rgba(100, 200, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(moveStart.x, moveStart.y);
    ctx.lineTo(moveCurrentX, moveCurrentY);
    ctx.stroke();

    ctx.fillStyle = "rgba(100, 200, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(moveStart.x, moveStart.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // 照準インジケーター
  ctx.save();
  ctx.translate(CENTER_X, SIZE * 0.15);
  const arrowLen = SIZE * 0.08;
  const arrowAngle = -Math.PI / 2 + state.aimOffset;
  const aimAlpha = isAiming ? 1.0 : 0.6;
  ctx.strokeStyle = `rgba(255, 200, 100, ${aimAlpha})`;
  ctx.lineWidth = isAiming ? 4 : 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(arrowAngle) * arrowLen, Math.sin(arrowAngle) * arrowLen);
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 200, 100, ${aimAlpha})`;
  ctx.beginPath();
  ctx.arc(Math.cos(arrowAngle) * arrowLen, Math.sin(arrowAngle) * arrowLen, isAiming ? 7 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // UI
  ctx.fillStyle = "#ddd";
  ctx.font = `${SIZE * 0.03}px sans-serif`;
  ctx.fillText(`room=${room}  ${state.connectionStatus}`, SIZE * 0.02, SIZE * 0.05);

  const playerCount = Object.keys(state.otherPlayers).length + (state.myId ? 1 : 0);
  ctx.fillText(`Players: ${playerCount}/3`, SIZE * 0.02, SIZE * 0.09);

  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = `${SIZE * 0.025}px sans-serif`;
  ctx.fillText("↑照準", SIZE * 0.02, SIZE * 0.48);
  ctx.fillText("↓移動", SIZE * 0.02, SIZE * 0.54);

  // 武器エリア
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, GAME_AREA_HEIGHT, SIZE, WEAPON_AREA_HEIGHT);

  drawWeaponButtons(ctx);

  // 武器スワイプインジケーター
  if (activeWeaponIndex !== null) {
    const weaponStart = getWeaponTouchStart();
    const dx = weaponTouchCurrentX - weaponStart.x;
    const dy = weaponTouchCurrentY - weaponStart.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 10) {
      const weapon = WEAPONS[activeWeaponIndex];
      ctx.strokeStyle = weapon.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(weaponStart.x, weaponStart.y);
      ctx.lineTo(weaponTouchCurrentX, weaponTouchCurrentY);
      ctx.stroke();
      ctx.setLineDash([]);

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

function drawWeaponButtons(ctx: CanvasRenderingContext2D) {
  const now = performance.now();

  for (let i = 0; i < BUTTON_COUNT; i++) {
    const weapon = WEAPONS[i];
    const x = BUTTON_GAP + i * (BUTTON_SIZE + BUTTON_GAP);
    const y = BUTTON_Y;
    const isReady = isWeaponReady(weapon);
    const isActive = activeWeaponIndex === i;

    ctx.fillStyle = isActive ? "#444" : isReady ? "#333" : "#222";
    ctx.beginPath();
    ctx.roundRect(x, y, BUTTON_SIZE, BUTTON_SIZE, 8);
    ctx.fill();

    ctx.strokeStyle = isActive ? weapon.color : isReady ? "#555" : "#333";
    ctx.lineWidth = isActive ? 3 : 2;
    ctx.beginPath();
    ctx.roundRect(x, y, BUTTON_SIZE, BUTTON_SIZE, 8);
    ctx.stroke();

    const cx = x + BUTTON_SIZE / 2;
    const cy = y + BUTTON_SIZE / 2;
    const markSize = BUTTON_SIZE * 0.28;
    ctx.strokeStyle = isReady ? weapon.color : "#555";
    ctx.fillStyle = isReady ? weapon.color : "#555";
    ctx.lineWidth = 2.5;

    drawWeaponMark(ctx, cx, cy, markSize, weapon.mark);

    if (!isReady) {
      const elapsed = now - weapon.lastUsedAt;
      const remaining = weapon.cooldown - elapsed;
      const ratio = Math.max(0, remaining / weapon.cooldown);

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, BUTTON_SIZE / 2 - 4, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = `bold ${BUTTON_SIZE * 0.3}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.ceil(remaining / 1000).toString(), cx, cy);
    }
  }
}

function drawWeaponMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, mark: WeaponMark) {
  ctx.beginPath();

  switch (mark) {
    case "hexagon":
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
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size, cy);
      ctx.closePath();
      ctx.stroke();
      break;

    case "triangle":
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size * 0.866, cy + size * 0.5);
      ctx.lineTo(cx - size * 0.866, cy + size * 0.5);
      ctx.closePath();
      ctx.stroke();
      break;

    case "star":
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
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
}

function drawHpBarAt(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number) {
  const barWidth = PLAYER_RADIUS * 2.5;
  const barHeight = SIZE * 0.015;
  const ratio = hp / MAX_HP;

  ctx.fillStyle = "#333";
  ctx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth, barHeight);

  ctx.fillStyle = ratio > 0.5 ? "#5f5" : ratio > 0.25 ? "#ff5" : "#f55";
  ctx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth * ratio, barHeight);
}
