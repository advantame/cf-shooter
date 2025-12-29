export type Env = {
  GAME_ROOMS: DurableObjectNamespace;
};

type ClientMsg =
  | { type: "input"; seq: number; up: boolean; down: boolean; left: boolean; right: boolean; shoot: boolean; aimX: number; aimY: number }
  | { type: "ping"; t: number };

type ServerMsg =
  | { type: "hello"; playerId: string }
  | { type: "state"; t: number; players: Record<string, { x: number; y: number; hp: number }>; bullets: { x: number; y: number }[] }
  | { type: "error"; message: string };

type Player = {
  id: string;
  x: number;
  y: number;
  hp: number;
  lastInput?: ClientMsg & { type: "input" };
  lastShotAt: number;
};

type Bullet = { x: number; y: number; vx: number; vy: number; owner: string };

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private players = new Map<WebSocket, Player>();
  private bullets: Bullet[] = [];
  private tickHandle: number | null = null;

  // ゲーム定数
  private readonly TICK_MS = 50; // 20Hz
  private readonly SPEED = 180;  // px/sec
  private readonly BULLET_SPEED = 420;
  private readonly SHOT_COOLDOWN_MS = 180;
  private readonly MAP_W = 800;
  private readonly MAP_H = 600;
  private readonly MAX_PLAYERS = 3;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgradeのみ受ける
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    // 3人制限
    if (this.players.size >= this.MAX_PLAYERS) {
      return new Response("Room is full", { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);

    // 接続時にプレイヤー作成
    const playerId = crypto.randomUUID();
    const p: Player = {
      id: playerId,
      x: 80 + Math.random() * 640,
      y: 80 + Math.random() * 440,
      hp: 5,
      lastShotAt: 0,
    };
    this.players.set(server, p);

    server.send(JSON.stringify({ type: "hello", playerId } satisfies ServerMsg));

    this.ensureTicking();

    return new Response(null, { status: 101, webSocket: client });
  }

  // WebSocketイベント（Durable ObjectsのWebSocket API）
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let msg: ClientMsg;
    try {
      msg = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" } satisfies ServerMsg));
      return;
    }

    const p = this.players.get(ws);
    if (!p) return;

    if (msg.type === "input") {
      // 入力は最後のものだけ保持（最小構成）
      p.lastInput = msg;
    } else if (msg.type === "ping") {
      // 必要ならpong実装（今回は省略）
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.players.delete(ws);
    this.maybeStopTicking();
  }

  async webSocketError(ws: WebSocket) {
    this.players.delete(ws);
    this.maybeStopTicking();
  }

  private ensureTicking() {
    if (this.tickHandle !== null) return;
    this.tickHandle = setInterval(() => this.tick(), this.TICK_MS) as unknown as number;
  }

  private maybeStopTicking() {
    if (this.players.size > 0) return;
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle as unknown as number);
      this.tickHandle = null;
    }
    this.bullets = [];
  }

  private tick() {
    const now = Date.now();
    const dt = this.TICK_MS / 1000;

    // 入力反映（サーバ権威）
    for (const p of this.players.values()) {
      const input = p.lastInput;
      if (!input || p.hp <= 0) continue;

      let vx = 0, vy = 0;
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;
      const len = Math.hypot(vx, vy) || 1;
      vx = (vx / len) * this.SPEED;
      vy = (vy / len) * this.SPEED;

      p.x = clamp(p.x + vx * dt, 0, this.MAP_W);
      p.y = clamp(p.y + vy * dt, 0, this.MAP_H);

      // 射撃
      if (input.shoot && now - p.lastShotAt >= this.SHOT_COOLDOWN_MS) {
        p.lastShotAt = now;
        const ax = input.aimX - p.x;
        const ay = input.aimY - p.y;
        const al = Math.hypot(ax, ay) || 1;
        const bvx = (ax / al) * this.BULLET_SPEED;
        const bvy = (ay / al) * this.BULLET_SPEED;
        this.bullets.push({ x: p.x, y: p.y, vx: bvx, vy: bvy, owner: p.id });
      }
    }

    // 弾の更新
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    // 画面外弾を除去
    this.bullets = this.bullets.filter(b => b.x >= -20 && b.x <= this.MAP_W + 20 && b.y >= -20 && b.y <= this.MAP_H + 20);

    // 当たり判定（最小：円ヒット）
    for (const b of this.bullets) {
      for (const p of this.players.values()) {
        if (p.hp <= 0) continue;
        if (p.id === b.owner) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (dx * dx + dy * dy <= 18 * 18) {
          p.hp -= 1;
          // ヒットした弾を遠くへ飛ばして実質無効化（簡易）
          b.x = 1e9;
          b.y = 1e9;
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.x < 1e8);

    // スナップショット配信
    const playersObj: Record<string, { x: number; y: number; hp: number }> = {};
    for (const p of this.players.values()) playersObj[p.id] = { x: p.x, y: p.y, hp: p.hp };

    const payload: ServerMsg = {
      type: "state",
      t: now,
      players: playersObj,
      bullets: this.bullets.map(b => ({ x: b.x, y: b.y })),
    };

    const json = JSON.stringify(payload);
    for (const ws of this.players.keys()) {
      try { ws.send(json); } catch { /* ignore */ }
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
