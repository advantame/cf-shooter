import { GameRoom, Env } from "./game-room";

export { GameRoom }; // Durable Objectクラスをexport（wranglerが参照）

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORSヘッダー
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // プリフライトリクエスト
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/connect") {
      // room名（URLで共有するだけの最小）
      const room = url.searchParams.get("room") ?? "lobby";

      // room名→Durable Objectの一意IDへ
      const id = env.GAME_ROOMS.idFromName(room);
      const stub = env.GAME_ROOMS.get(id);

      // DOへそのまま転送（Upgrade: websocket を含む）
      return stub.fetch(request);
    }

    return new Response("OK", { headers: corsHeaders });
  },
};
