// キャンバスとサイズ
export const SIZE = Math.min(window.innerWidth, window.innerHeight);
export const WEAPON_AREA_HEIGHT = SIZE * 0.15;
export const GAME_AREA_HEIGHT = SIZE;

// ゲーム定数
export const CENTER_X = SIZE / 2;
export const CENTER_Y = SIZE / 2;
export const ARENA_RADIUS = SIZE * 0.45;
export const PLAYER_RADIUS = SIZE * 0.04;
export const SPEED = SIZE * 0.8;
export const BULLET_SPEED = SIZE * 2.1;
export const SHOT_COOLDOWN_MS = 80;
export const FORK_ANGLE = 0.35;
export const MAX_HP = 300;

// 武器ボタン
export const BUTTON_COUNT = 5;
export const BUTTON_GAP = SIZE * 0.02;
export const BUTTON_SIZE = (SIZE - BUTTON_GAP * (BUTTON_COUNT + 1)) / BUTTON_COUNT;
export const BUTTON_Y = GAME_AREA_HEIGHT + (WEAPON_AREA_HEIGHT - BUTTON_SIZE) / 2;

// 特殊弾のパラメータ
export const GRENADE_DURATION = 800;
export const GRENADE_INITIAL_SPEED = SIZE * 1.0;
export const BEAM_WARNING_DURATION = 750;
export const SHOTGUN_PARENT_SPEED = SIZE * 0.15;
export const SHOTGUN_CHILD_SPEED = SIZE * 0.6;
export const SHOTGUN_CHILD_INTERVAL = 700;
export const SHOTGUN_DURATION = 8000;
export const MISSILE_SPEED = SIZE * 0.7;
export const MISSILE_HOMING_DURATION = 1000;

// 領域の色
export const ZONE_COLORS = ["rgba(0, 229, 255, 0.15)", "rgba(255, 90, 90, 0.15)", "rgba(90, 255, 90, 0.15)"];
export const PLAYER_COLORS = ["#00e5ff", "#ff5a5a", "#5aff5a"];

// 照準感度
export const AIM_SENSITIVITY = 0.003;

// バックエンドURL
export const BACKEND_BASE = (import.meta as any).env?.VITE_BACKEND_BASE ?? "";
