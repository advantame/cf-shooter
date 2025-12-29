import {
  BACKEND_BASE,
  ARENA_RADIUS,
  CENTER_X,
  CENTER_Y,
  MAX_HP,
  GRENADE_INITIAL_SPEED,
  BEAM_WARNING_DURATION,
  SHOTGUN_PARENT_SPEED,
  MISSILE_SPEED,
} from "./constants";
import * as state from "./state";
import { getZoneCenterAngle } from "./utils";

const params = new URLSearchParams(location.search);
export const room = params.get("room") ?? "lobby";

const wsUrl = new URL("/connect", BACKEND_BASE || location.origin);
wsUrl.searchParams.set("room", room);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

let ws: WebSocket;

export function getWs(): WebSocket {
  return ws;
}

export function connect() {
  ws = new WebSocket(wsUrl.toString());

  ws.onopen = () => {
    state.setConnectionStatus("接続完了");
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === "hello") {
      state.setMyId(msg.playerId);
      state.setMyZone(msg.zone);
      // zone 2が割り当てられた場合は3人モード
      if (msg.zone >= 2) {
        state.setPlayerCount(3);
      }
      const angle = getZoneCenterAngle(msg.zone);
      const dist = ARENA_RADIUS * 0.6;
      state.setMyX(CENTER_X + Math.cos(angle) * dist);
      state.setMyY(CENTER_Y + Math.sin(angle) * dist);
      state.setMyHp(MAX_HP);
      state.resetState();
    }

    if (msg.type === "players") {
      const now = performance.now();
      const currentIds = new Set<string>();

      for (const [id, p] of Object.entries<any>(msg.players)) {
        if (id !== state.myId) {
          currentIds.add(id);
          state.otherPlayers[id] = {
            x: p.x,
            y: p.y,
            hp: p.hp,
            zone: p.zone,
            aimOffset: p.aimOffset ?? 0,
            shield: p.shield ?? false,
          };
          if (!state.allPlayerBullets.has(id)) {
            state.allPlayerBullets.set(id, []);
            state.lastBulletShotTime.set(id, now);
          }
          if (!state.enemySpecialBullets.has(id)) {
            state.enemySpecialBullets.set(id, []);
            state.enemyBeamWarnings.set(id, []);
            state.enemyBeamEffects.set(id, []);
          }
        }
      }

      for (const id of Object.keys(state.otherPlayers)) {
        if (!currentIds.has(id)) {
          delete state.otherPlayers[id];
          state.allPlayerBullets.delete(id);
          state.lastBulletShotTime.delete(id);
          state.enemySpecialBullets.delete(id);
          state.enemyBeamWarnings.delete(id);
          state.enemyBeamEffects.delete(id);
        }
      }

      // プレイヤー数を更新（2人 or 3人で領域分割が変わる）
      const totalPlayers = Object.keys(msg.players).length;
      state.setPlayerCount(totalPlayers >= 3 ? 3 : 2);
    }

    if (msg.type === "fire") {
      const { fromId, bulletType, x, y, angle, bulletId, targetId } = msg;
      if (state.processedBulletIds.has(bulletId)) return;
      state.processedBulletIds.add(bulletId);
      if (state.processedBulletIds.size > 1000) {
        const arr = Array.from(state.processedBulletIds);
        for (let i = 0; i < 500; i++) {
          state.processedBulletIds.delete(arr[i]);
        }
      }

      const now = performance.now();
      switch (bulletType) {
        case "grenade": {
          const vx = Math.cos(angle) * GRENADE_INITIAL_SPEED;
          const vy = Math.sin(angle) * GRENADE_INITIAL_SPEED;
          const bullets = state.enemySpecialBullets.get(fromId) ?? [];
          bullets.push({
            type: "grenade",
            x, y, vx, vy,
            initialVx: vx,
            initialVy: vy,
            createdAt: now,
          });
          state.enemySpecialBullets.set(fromId, bullets);
          break;
        }
        case "beam": {
          const warnings = state.enemyBeamWarnings.get(fromId) ?? [];
          warnings.push({
            startX: x,
            startY: y,
            angle,
            createdAt: now,
            fireAt: now + BEAM_WARNING_DURATION,
            fired: false,
          });
          state.enemyBeamWarnings.set(fromId, warnings);
          break;
        }
        case "shotgun": {
          const bullets = state.enemySpecialBullets.get(fromId) ?? [];
          bullets.push({
            type: "shotgun",
            x, y,
            vx: Math.cos(angle) * SHOTGUN_PARENT_SPEED,
            vy: Math.sin(angle) * SHOTGUN_PARENT_SPEED,
            createdAt: now,
            lastChildShotAt: now,
          });
          state.enemySpecialBullets.set(fromId, bullets);
          break;
        }
        case "missile": {
          const bullets = state.enemySpecialBullets.get(fromId) ?? [];
          bullets.push({
            type: "missile",
            x, y,
            vx: Math.cos(angle) * MISSILE_SPEED,
            vy: Math.sin(angle) * MISSILE_SPEED,
            createdAt: now,
            targetId: targetId,
          });
          state.enemySpecialBullets.set(fromId, bullets);
          break;
        }
      }
    }

    if (msg.type === "damage" && msg.playerId !== state.myId) {
      const player = state.otherPlayers[msg.playerId];
      if (player) {
        player.hp = Math.max(0, player.hp - msg.amount);
      }
    }
  };

  ws.onclose = () => {
    state.setConnectionStatus("切断（再接続中...）");
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    state.setConnectionStatus("エラー");
  };
}

export function sendState() {
  if (ws.readyState === WebSocket.OPEN && state.myId) {
    ws.send(JSON.stringify({
      type: "state",
      id: state.myId,
      x: state.myX,
      y: state.myY,
      hp: state.myHp,
      zone: state.myZone,
      aimOffset: state.aimOffset,
      shield: performance.now() < state.shieldActiveUntil,
    }));
  }
}

export function sendDamage(amount: number) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "damage", amount }));
  }
}
