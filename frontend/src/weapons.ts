import {
  GRENADE_INITIAL_SPEED,
  BEAM_WARNING_DURATION,
  SHOTGUN_PARENT_SPEED,
  MISSILE_SPEED,
} from "./constants";
import type { Weapon } from "./types";
import * as state from "./state";
import { getWs } from "./network";

// 武器定義
export const WEAPONS: Weapon[] = [
  { id: "grenade", name: "グレネード", mark: "hexagon", damage: 40, cooldown: 5000, color: "#ff6600", lastUsedAt: -Infinity },
  { id: "beam", name: "ビーム", mark: "diamond", damage: 60, cooldown: 8000, color: "#00ffff", lastUsedAt: -Infinity },
  { id: "shotgun", name: "ショットガン", mark: "triangle", damage: 8, cooldown: 8000, color: "#ffff00", lastUsedAt: -Infinity },
  { id: "missile", name: "ミサイル", mark: "star", damage: 35, cooldown: 6000, color: "#ff00ff", lastUsedAt: -Infinity },
  { id: "shield", name: "シールド", mark: "circle", damage: 0, cooldown: 10000, color: "#00ff00", lastUsedAt: -Infinity },
];

// 武器が使用可能か
export function isWeaponReady(weapon: Weapon): boolean {
  return performance.now() - weapon.lastUsedAt >= weapon.cooldown;
}

// FireMsg送信用のユニークID生成
function generateBulletId(): string {
  return `${state.myId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 画面角度をワールド角度に変換
function getViewRotation(): number {
  const myZoneCenter = getZoneCenterAngle(state.myZone);
  return Math.PI / 2 - myZoneCenter;
}

function transformAngleToWorld(screenAngle: number): number {
  return screenAngle - getViewRotation();
}

// 領域の中心角度
export function getZoneCenterAngle(zone: number): number {
  return (-Math.PI / 2) + (zone * Math.PI * 2 / 3);
}

// 武器発射
export function fireWeapon(weapon: Weapon, screenAngle: number) {
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

function fireGrenade(angle: number) {
  const vx = Math.cos(angle) * GRENADE_INITIAL_SPEED;
  const vy = Math.sin(angle) * GRENADE_INITIAL_SPEED;
  state.mySpecialBullets.push({
    type: "grenade",
    x: state.myX,
    y: state.myY,
    vx: vx,
    vy: vy,
    initialVx: vx,
    initialVy: vy,
    createdAt: performance.now(),
  });
  const ws = getWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "fire",
      bulletType: "grenade",
      x: state.myX,
      y: state.myY,
      angle: angle,
      bulletId: generateBulletId(),
    }));
  }
}

function fireBeam(angle: number) {
  const now = performance.now();
  state.beamWarnings.push({
    startX: state.myX,
    startY: state.myY,
    angle: angle,
    createdAt: now,
    fireAt: now + BEAM_WARNING_DURATION,
    fired: false,
  });
  const ws = getWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "fire",
      bulletType: "beam",
      x: state.myX,
      y: state.myY,
      angle: angle,
      bulletId: generateBulletId(),
    }));
  }
}

function fireShotgun(centerAngle: number) {
  const now = performance.now();
  state.mySpecialBullets.push({
    type: "shotgun",
    x: state.myX,
    y: state.myY,
    vx: Math.cos(centerAngle) * SHOTGUN_PARENT_SPEED,
    vy: Math.sin(centerAngle) * SHOTGUN_PARENT_SPEED,
    createdAt: now,
    lastChildShotAt: now,
  });
  const ws = getWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "fire",
      bulletType: "shotgun",
      x: state.myX,
      y: state.myY,
      angle: centerAngle,
      bulletId: generateBulletId(),
    }));
  }
}

function fireMissile(initialAngle: number) {
  let nearestId: string | null = null;
  let nearestDist = Infinity;

  for (const [id, p] of Object.entries(state.otherPlayers)) {
    if (p.hp <= 0) continue;
    const dist = Math.hypot(p.x - state.myX, p.y - state.myY);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = id;
    }
  }

  state.mySpecialBullets.push({
    type: "missile",
    x: state.myX,
    y: state.myY,
    vx: Math.cos(initialAngle) * MISSILE_SPEED,
    vy: Math.sin(initialAngle) * MISSILE_SPEED,
    createdAt: performance.now(),
    targetId: nearestId ?? undefined,
  });
  const ws = getWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "fire",
      bulletType: "missile",
      x: state.myX,
      y: state.myY,
      angle: initialAngle,
      bulletId: generateBulletId(),
      targetId: nearestId ?? undefined,
    }));
  }
}

function activateShield() {
  state.setShieldActiveUntil(performance.now() + 1500);
}
