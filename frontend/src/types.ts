// 武器システム
export type WeaponId = "grenade" | "beam" | "shotgun" | "shotgun_child" | "missile" | "shield";
export type WeaponMark = "hexagon" | "diamond" | "triangle" | "star" | "circle";

export type Weapon = {
  id: WeaponId;
  name: string;
  mark: WeaponMark;
  damage: number;
  cooldown: number;
  color: string;
  lastUsedAt: number;
};

// 特殊弾
export type SpecialBullet = {
  type: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  createdAt: number;
  targetId?: string;
  explosionTime?: number;
  initialVx?: number;
  initialVy?: number;
  lastChildShotAt?: number;
};

// 通常弾
export type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

// ビームエフェクト
export type BeamEffect = {
  startX: number;
  startY: number;
  angle: number;
  endTime: number;
};

// ビーム警告
export type BeamWarning = {
  startX: number;
  startY: number;
  angle: number;
  createdAt: number;
  fireAt: number;
  fired: boolean;
};

// 爆発エフェクト
export type ExplosionEffect = {
  x: number;
  y: number;
  radius: number;
  startTime: number;
  duration: number;
};

// 他プレイヤー
export type OtherPlayer = {
  x: number;
  y: number;
  hp: number;
  zone: number;
  aimOffset: number;
  shield: boolean;
};
