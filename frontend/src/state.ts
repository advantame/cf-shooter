import { CENTER_X, CENTER_Y, MAX_HP } from "./constants";
import type { Bullet, SpecialBullet, BeamEffect, BeamWarning, ExplosionEffect, OtherPlayer } from "./types";

// 自分の状態
export let myId: string | null = null;
export let myZone = 0;
export let myX = CENTER_X;
export let myY = CENTER_Y;
export let myHp = MAX_HP;
export let myBullets: Bullet[] = [];
export let lastShotAt = 0;
export let aimOffset = 0;
export let shieldActiveUntil = 0;

// 特殊弾とエフェクト
export let mySpecialBullets: SpecialBullet[] = [];
export let beamEffects: BeamEffect[] = [];
export let beamWarnings: BeamWarning[] = [];
export let explosionEffects: ExplosionEffect[] = [];

// 他プレイヤー
export let otherPlayers: Record<string, OtherPlayer> = {};

// 全プレイヤーの通常弾（ローカルで計算）
export let allPlayerBullets: Map<string, Bullet[]> = new Map();
export let lastBulletShotTime: Map<string, number> = new Map();

// 敵の特殊弾
export let enemySpecialBullets: Map<string, SpecialBullet[]> = new Map();
export let enemyBeamWarnings: Map<string, BeamWarning[]> = new Map();
export let enemyBeamEffects: Map<string, BeamEffect[]> = new Map();
export let processedBulletIds: Set<string> = new Set();

// 接続状態
export let connectionStatus = "接続中...";

// プレイヤー数（2人 or 3人で領域分割が変わる）
export let playerCount = 2;

// Setter関数
export function setMyId(id: string | null) { myId = id; }
export function setMyZone(zone: number) { myZone = zone; }
export function setMyX(x: number) { myX = x; }
export function setMyY(y: number) { myY = y; }
export function setMyHp(hp: number) { myHp = hp; }
export function setMyBullets(bullets: Bullet[]) { myBullets = bullets; }
export function setLastShotAt(time: number) { lastShotAt = time; }
export function setAimOffset(offset: number) { aimOffset = offset; }
export function setShieldActiveUntil(time: number) { shieldActiveUntil = time; }
export function setMySpecialBullets(bullets: SpecialBullet[]) { mySpecialBullets = bullets; }
export function setBeamEffects(effects: BeamEffect[]) { beamEffects = effects; }
export function setBeamWarnings(warnings: BeamWarning[]) { beamWarnings = warnings; }
export function setExplosionEffects(effects: ExplosionEffect[]) { explosionEffects = effects; }
export function setOtherPlayers(players: Record<string, OtherPlayer>) { otherPlayers = players; }
export function setConnectionStatus(status: string) { connectionStatus = status; }
export function setPlayerCount(count: number) { playerCount = count; }

// リセット関数
export function resetState() {
  myBullets = [];
  allPlayerBullets.clear();
  lastBulletShotTime.clear();
  enemySpecialBullets.clear();
  enemyBeamWarnings.clear();
  enemyBeamEffects.clear();
  processedBulletIds.clear();
}
