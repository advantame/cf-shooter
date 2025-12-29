const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
document.body.style.margin = "0";
document.body.style.background = "#000";
document.body.style.display = "flex";
document.body.style.justifyContent = "center";
document.body.style.alignItems = "center";
document.body.style.height = "100vh";
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

// バックエンドURL（環境変数から、なければ同一オリジン）
const BACKEND_BASE = (import.meta as any).env?.VITE_BACKEND_BASE ?? "";

const params = new URLSearchParams(location.search);
const room = params.get("room") ?? "lobby";

let myId: string | null = null;
let lastState: any = null;
let connectionStatus = "接続中...";

const wsUrl = new URL("/connect", BACKEND_BASE || location.origin);
wsUrl.searchParams.set("room", room);

// http(s) -> ws(s)
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

let ws: WebSocket;

function connect() {
  ws = new WebSocket(wsUrl.toString());

  ws.onopen = () => {
    connectionStatus = "接続完了";
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "hello") myId = msg.playerId;
    if (msg.type === "state") lastState = msg;
  };

  ws.onclose = () => {
    connectionStatus = "切断（再接続中...）";
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    connectionStatus = "エラー";
  };
}

connect();

const input = { up: false, down: false, left: false, right: false, shoot: false, aimX: 400, aimY: 300 };
let seq = 0;

window.addEventListener("keydown", (e) => {
  if (e.key === "w" || e.key === "ArrowUp") input.up = true;
  if (e.key === "s" || e.key === "ArrowDown") input.down = true;
  if (e.key === "a" || e.key === "ArrowLeft") input.left = true;
  if (e.key === "d" || e.key === "ArrowRight") input.right = true;
  if (e.key === " ") input.shoot = true;
});

window.addEventListener("keyup", (e) => {
  if (e.key === "w" || e.key === "ArrowUp") input.up = false;
  if (e.key === "s" || e.key === "ArrowDown") input.down = false;
  if (e.key === "a" || e.key === "ArrowLeft") input.left = false;
  if (e.key === "d" || e.key === "ArrowRight") input.right = false;
  if (e.key === " ") input.shoot = false;
});

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  input.aimX = (e.clientX - r.left) * (canvas.width / r.width);
  input.aimY = (e.clientY - r.top) * (canvas.height / r.height);
});

canvas.addEventListener("mousedown", () => input.shoot = true);
canvas.addEventListener("mouseup", () => input.shoot = false);

// タッチ対応
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  input.shoot = true;
  const touch = e.touches[0];
  const r = canvas.getBoundingClientRect();
  input.aimX = (touch.clientX - r.left) * (canvas.width / r.width);
  input.aimY = (touch.clientY - r.top) * (canvas.height / r.height);
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const r = canvas.getBoundingClientRect();
  input.aimX = (touch.clientX - r.left) * (canvas.width / r.width);
  input.aimY = (touch.clientY - r.top) * (canvas.height / r.height);
});

canvas.addEventListener("touchend", () => input.shoot = false);

// 入力送信（30Hz程度）
setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "input", seq: seq++, ...input }));
}, 33);

function draw() {
  requestAnimationFrame(draw);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ルーム表示
  ctx.fillStyle = "#ddd";
  ctx.font = "14px sans-serif";
  ctx.fillText(`room=${room}  ${connectionStatus}  myId=${myId?.slice(0, 8) ?? "..."}`, 10, 20);
  ctx.fillText("操作: WASD/矢印キーで移動、スペース/クリックで射撃", 10, 40);

  if (!lastState) return;

  // 弾
  ctx.fillStyle = "#f5d000";
  for (const b of lastState.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // プレイヤー
  const colors = ["#00e5ff", "#ff5a5a", "#5aff5a", "#ff5aff"];
  let colorIndex = 0;
  for (const [id, p] of Object.entries<any>(lastState.players)) {
    const isMe = id === myId;
    ctx.fillStyle = isMe ? "#00e5ff" : colors[colorIndex++ % colors.length];

    // 死亡時は半透明
    if (p.hp <= 0) ctx.globalAlpha = 0.3;

    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    // ID・HP表示
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    const label = isMe ? `YOU (HP:${p.hp})` : `${id.slice(0, 4)} HP:${p.hp}`;
    ctx.fillText(label, p.x - 30, p.y - 22);
  }

  // プレイヤー数表示
  const playerCount = Object.keys(lastState.players).length;
  ctx.fillStyle = "#aaa";
  ctx.fillText(`プレイヤー: ${playerCount}/3`, canvas.width - 100, 20);
}

draw();
