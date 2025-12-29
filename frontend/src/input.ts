import { SIZE, GAME_AREA_HEIGHT, WEAPON_AREA_HEIGHT, BUTTON_SIZE, BUTTON_GAP, AIM_SENSITIVITY } from "./constants";
import * as state from "./state";
import { WEAPONS, isWeaponReady, fireWeapon } from "./weapons";

// 移動操作
let moveStartX = 0;
let moveStartY = 0;
export let moveCurrentX = 0;
export let moveCurrentY = 0;
export let isMoving = false;
let moveTouchId: number | null = null;

// 照準操作
let aimStartX = 0;
let aimCurrentX = 0;
export let isAiming = false;
let aimTouchId: number | null = null;

// 武器スワイプ
let weaponTouchId: number | null = null;
let weaponTouchStartX = 0;
let weaponTouchStartY = 0;
export let weaponTouchCurrentX = 0;
export let weaponTouchCurrentY = 0;
export let activeWeaponIndex: number | null = null;

// PC用マウス操作
let isMouseDown = false;
let mouseIsMove = false;

export function getMoveStart() {
  return { x: moveStartX, y: moveStartY };
}

export function getWeaponTouchStart() {
  return { x: weaponTouchStartX, y: weaponTouchStartY };
}

function getTouchZone(y: number): "aim" | "move" | "weapon" {
  if (y > GAME_AREA_HEIGHT) return "weapon";
  if (y > GAME_AREA_HEIGHT / 2) return "move";
  return "aim";
}

function getWeaponIndexAtPos(x: number, y: number): number | null {
  if (y < GAME_AREA_HEIGHT || y > GAME_AREA_HEIGHT + WEAPON_AREA_HEIGHT) return null;
  for (let i = 0; i < 5; i++) {
    const bx = BUTTON_GAP + i * (BUTTON_SIZE + BUTTON_GAP);
    if (x >= bx && x <= bx + BUTTON_SIZE) {
      return i;
    }
  }
  return null;
}

function getTouchPos(touch: Touch, r: DOMRect, canvas: HTMLCanvasElement): { x: number; y: number } {
  return {
    x: (touch.clientX - r.left) * (canvas.width / r.width),
    y: (touch.clientY - r.top) * (canvas.height / r.height),
  };
}

export function setupInput(canvas: HTMLCanvasElement) {
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const pos = getTouchPos(touch, r, canvas);
      const zone = getTouchZone(pos.y);

      if (zone === "weapon" && weaponTouchId === null) {
        const weaponIndex = getWeaponIndexAtPos(pos.x, pos.y);
        if (weaponIndex !== null && isWeaponReady(WEAPONS[weaponIndex])) {
          weaponTouchId = touch.identifier;
          weaponTouchStartX = pos.x;
          weaponTouchStartY = pos.y;
          weaponTouchCurrentX = pos.x;
          weaponTouchCurrentY = pos.y;
          activeWeaponIndex = weaponIndex;
        }
      } else if (zone === "move" && moveTouchId === null) {
        moveTouchId = touch.identifier;
        moveStartX = pos.x;
        moveStartY = pos.y;
        moveCurrentX = pos.x;
        moveCurrentY = pos.y;
        isMoving = true;
      } else if (zone === "aim" && aimTouchId === null) {
        aimTouchId = touch.identifier;
        aimStartX = pos.x;
        aimCurrentX = pos.x;
        isAiming = true;
      }
    }
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const pos = getTouchPos(touch, r, canvas);

      if (touch.identifier === weaponTouchId) {
        weaponTouchCurrentX = pos.x;
        weaponTouchCurrentY = pos.y;
      }

      if (touch.identifier === moveTouchId) {
        moveCurrentX = pos.x;
        moveCurrentY = pos.y;
      }

      if (touch.identifier === aimTouchId) {
        aimCurrentX = pos.x;
        let newAimOffset = state.aimOffset + (aimCurrentX - aimStartX) * AIM_SENSITIVITY;
        newAimOffset = Math.max(-0.8, Math.min(0.8, newAimOffset));
        state.setAimOffset(newAimOffset);
        aimStartX = aimCurrentX;
      }
    }
  });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === weaponTouchId) {
        const dx = weaponTouchCurrentX - weaponTouchStartX;
        const dy = weaponTouchCurrentY - weaponTouchStartY;
        const swipeDist = Math.hypot(dx, dy);

        if (activeWeaponIndex !== null) {
          const weapon = WEAPONS[activeWeaponIndex];
          if (weapon.id === "shield") {
            fireWeapon(weapon, 0);
          } else if (swipeDist > 30) {
            const screenAngle = Math.atan2(dy, dx);
            fireWeapon(weapon, screenAngle);
          }
        }

        weaponTouchId = null;
        activeWeaponIndex = null;
      }

      if (touch.identifier === moveTouchId) {
        moveTouchId = null;
        isMoving = false;
      }

      if (touch.identifier === aimTouchId) {
        aimTouchId = null;
        isAiming = false;
      }
    }
  });

  canvas.addEventListener("touchcancel", (e) => {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === weaponTouchId) {
        weaponTouchId = null;
        activeWeaponIndex = null;
      }

      if (touch.identifier === moveTouchId) {
        moveTouchId = null;
        isMoving = false;
      }

      if (touch.identifier === aimTouchId) {
        aimTouchId = null;
        isAiming = false;
      }
    }
  });

  // PC用マウス操作
  canvas.addEventListener("mousedown", (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    const my = (e.clientY - r.top) * (canvas.height / r.height);

    if (my > SIZE / 2) {
      moveStartX = mx;
      moveStartY = my;
      moveCurrentX = mx;
      moveCurrentY = my;
      isMoving = true;
      mouseIsMove = true;
    } else {
      aimStartX = mx;
      aimCurrentX = mx;
      isAiming = true;
      mouseIsMove = false;
    }
    isMouseDown = true;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isMouseDown) return;
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);

    if (mouseIsMove) {
      moveCurrentX = mx;
      moveCurrentY = (e.clientY - r.top) * (canvas.height / r.height);
    } else {
      aimCurrentX = mx;
      let newAimOffset = state.aimOffset + (aimCurrentX - aimStartX) * AIM_SENSITIVITY;
      newAimOffset = Math.max(-0.8, Math.min(0.8, newAimOffset));
      state.setAimOffset(newAimOffset);
      aimStartX = aimCurrentX;
    }
  });

  canvas.addEventListener("mouseup", () => {
    isMouseDown = false;
    isMoving = false;
    isAiming = false;
  });
}
