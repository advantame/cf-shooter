import { ARENA_RADIUS, CENTER_X, CENTER_Y, PLAYER_RADIUS } from "./constants";
import * as state from "./state";

// 領域の中心角度を取得（ラジアン）
export function getZoneCenterAngle(zone: number): number {
  return (-Math.PI / 2) + (zone * Math.PI * 2 / 3);
}

// 領域の開始・終了角度
export function getZoneAngles(zone: number): { start: number; end: number } {
  const center = getZoneCenterAngle(zone);
  return {
    start: center - Math.PI / 3,
    end: center + Math.PI / 3,
  };
}

// 角度を正規化（-PI ~ PI）
export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// 自分のzoneが下に来るための回転角度
export function getViewRotation(): number {
  const myZoneCenter = getZoneCenterAngle(state.myZone);
  return Math.PI / 2 - myZoneCenter;
}

// 領域内に制限
export function clampToZone(x: number, y: number, zone: number): { x: number; y: number } {
  let dx = x - CENTER_X;
  let dy = y - CENTER_Y;
  let dist = Math.hypot(dx, dy);
  let angle = Math.atan2(dy, dx);

  const minDist = PLAYER_RADIUS * 2;
  const maxDist = ARENA_RADIUS - PLAYER_RADIUS;
  dist = Math.max(minDist, Math.min(maxDist, dist));

  const { start, end } = getZoneAngles(zone);
  const margin = 0.05;
  const clampedStart = start + margin;
  const clampedEnd = end - margin;

  const normAngle = normalizeAngle(angle);
  const normStart = normalizeAngle(clampedStart);
  const normEnd = normalizeAngle(clampedEnd);

  let clampedAngle = normAngle;
  if (normStart < normEnd) {
    clampedAngle = Math.max(normStart, Math.min(normEnd, normAngle));
  } else {
    if (normAngle < normEnd) {
      clampedAngle = normAngle;
    } else if (normAngle > normStart) {
      clampedAngle = normAngle;
    } else {
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

// スワイプ方向を回転座標系からワールド座標系に変換
export function transformSwipeToWorld(dx: number, dy: number): { dx: number; dy: number } {
  const rotation = -getViewRotation();
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    dx: dx * cos - dy * sin,
    dy: dx * sin + dy * cos,
  };
}

// 点と線分の距離
export function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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
