export type Env = {
  GAME_ROOMS: DurableObjectNamespace;
};

// クライアントから受信するメッセージ
type ClientMsg =
  | {
      type: "state";
      id: string;
      x: number;
      y: number;
      hp: number;
      zone: number;
      aimOffset: number;  // 照準オフセット（通常弾の方向計算用）
      shield?: boolean;
    }
  | {
      type: "fire";
      bulletType: "grenade" | "beam" | "shotgun" | "missile";
      x: number;
      y: number;
      angle: number;
      bulletId: string;
      targetId?: string;  // ミサイルのターゲット
    }
  | { type: "damage"; amount: number };

// サーバーから送信するメッセージ
type ServerMsg =
  | { type: "hello"; playerId: string; zone: number }
  | { type: "players"; players: Record<string, PlayerState> }
  | {
      type: "fire";
      fromId: string;
      bulletType: "grenade" | "beam" | "shotgun" | "missile";
      x: number;
      y: number;
      angle: number;
      bulletId: string;
      targetId?: string;
    }
  | { type: "damage"; playerId: string; amount: number }
  | { type: "error"; message: string };

type PlayerState = {
  id: string;
  zone: number;
  x: number;
  y: number;
  hp: number;
  aimOffset: number;
  shield: boolean;
};

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private players = new Map<WebSocket, PlayerState>();
  private usedZones = new Set<number>();
  private readonly MAX_PLAYERS = 3;
  private broadcastHandle: number | null = null;
  private readonly BROADCAST_MS = 33; // ~30Hz

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    if (this.players.size >= this.MAX_PLAYERS) {
      return new Response("Room is full", { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);

    // 空いているzoneを割り当て
    let zone = 0;
    for (let i = 0; i < 3; i++) {
      if (!this.usedZones.has(i)) {
        zone = i;
        break;
      }
    }
    this.usedZones.add(zone);

    const playerId = crypto.randomUUID();
    const initialState: PlayerState = {
      id: playerId,
      zone,
      x: 0,
      y: 0,
      hp: 300,
      aimOffset: 0,
      shield: false,
    };
    this.players.set(server, initialState);

    server.send(JSON.stringify({ type: "hello", playerId, zone } satisfies ServerMsg));

    this.ensureBroadcasting();

    return new Response(null, { status: 101, webSocket: client });
  }

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

    if (msg.type === "state") {
      p.x = msg.x;
      p.y = msg.y;
      p.hp = msg.hp;
      p.aimOffset = msg.aimOffset;
      p.shield = msg.shield ?? false;
    } else if (msg.type === "fire") {
      // 特殊弾の発射情報を全プレイヤーに中継
      const fireMsg: ServerMsg = {
        type: "fire",
        fromId: p.id,
        bulletType: msg.bulletType,
        x: msg.x,
        y: msg.y,
        angle: msg.angle,
        bulletId: msg.bulletId,
        targetId: msg.targetId,
      };
      for (const ws2 of this.players.keys()) {
        if (ws2 === ws) continue; // 送信者には送らない
        try { ws2.send(JSON.stringify(fireMsg)); } catch { /* ignore */ }
      }
    } else if (msg.type === "damage") {
      // ダメージ情報を全プレイヤーに中継
      const damageMsg: ServerMsg = { type: "damage", playerId: p.id, amount: msg.amount };
      for (const ws2 of this.players.keys()) {
        try { ws2.send(JSON.stringify(damageMsg)); } catch { /* ignore */ }
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const p = this.players.get(ws);
    if (p) {
      this.usedZones.delete(p.zone);
    }
    this.players.delete(ws);
    this.maybeStopBroadcasting();
  }

  async webSocketError(ws: WebSocket) {
    const p = this.players.get(ws);
    if (p) {
      this.usedZones.delete(p.zone);
    }
    this.players.delete(ws);
    this.maybeStopBroadcasting();
  }

  private ensureBroadcasting() {
    if (this.broadcastHandle !== null) return;
    this.broadcastHandle = setInterval(() => this.broadcast(), this.BROADCAST_MS) as unknown as number;
  }

  private maybeStopBroadcasting() {
    if (this.players.size > 0) return;
    if (this.broadcastHandle !== null) {
      clearInterval(this.broadcastHandle as unknown as number);
      this.broadcastHandle = null;
    }
  }

  private broadcast() {
    const playersObj: Record<string, PlayerState> = {};
    for (const p of this.players.values()) {
      playersObj[p.id] = {
        id: p.id,
        x: p.x,
        y: p.y,
        hp: p.hp,
        zone: p.zone,
        aimOffset: p.aimOffset,
        shield: p.shield,
      };
    }

    const payload: ServerMsg = { type: "players", players: playersObj };
    const json = JSON.stringify(payload);

    for (const ws of this.players.keys()) {
      try { ws.send(json); } catch { /* ignore */ }
    }
  }
}
