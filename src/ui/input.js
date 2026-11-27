// Map gestures: drag to pan, wheel to zoom, two-finger pinch to zoom and pan,
// arrow keys or W, A and S to pan (D opens diplomacy), + and - to zoom. Works the same with mouse,
// pen and touch through pointer events, and nothing depends on hovering.
// A press that barely moves is a tap (onTap); a right-click is onContext;
// mouse movement without a button held is onHover (an extra, never needed).

import { pan, zoomAt } from '../render/camera.js';

const KEY_PAN = { ArrowLeft: [1, 0], a: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], w: [0, 1], ArrowDown: [0, -1], s: [0, -1] };

export function attachMapInput(view, { keyTarget, onTap, onHover, onContext, keyPan = () => true } = {}) {
  const el = view.canvas;
  const pointers = new Map();
  let pinch = null;
  let press = null; // where the current single press started, to tell taps from drags
  const TAP_SLOP = 8;
  const MIN_PINCH = 24;
  el.style.touchAction = 'none';

  const local = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  el.addEventListener('pointerdown', (e) => {
    // Keep receiving moves if the finger or mouse leaves the canvas. Capture can
    // be refused (for example for a pointer the browser no longer tracks); the
    // gesture still works without it.
    try { el.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    pointers.set(e.pointerId, local(e));
    press = pointers.size === 1 && e.button === 0 ? { ...local(e), id: e.pointerId, moved: false, type: e.pointerType } : null;
    if (pointers.size === 2) {
      // A second finger makes this a pinch: the first finger's press can no longer be a tap
      // (lifting after a pinch must never send a unit anywhere).
      press = null;
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.max(MIN_PINCH, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && onHover) onHover(local(e).x, local(e).y);
      return;
    }
    if (press && press.id === e.pointerId && !press.moved) {
      const p = local(e);
      if (Math.hypot(p.x - press.x, p.y - press.y) < TAP_SLOP) return;
      press.moved = true;
    }
    const prev = pointers.get(e.pointerId);
    const now = local(e);
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) {
      view.setCamera(pan(view.camera, now.x - prev.x, now.y - prev.y));
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      // Fingers almost touching would make the zoom jump: measure from at least MIN_PINCH apart.
      const dist = Math.max(MIN_PINCH, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let cam = zoomAt(view.camera, dist / pinch.dist, mid.x, mid.y);
      cam = pan(cam, mid.x - pinch.mid.x, mid.y - pinch.mid.y);
      view.setCamera(cam);
      pinch = { dist, mid };
    }
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  el.addEventListener('pointerup', (e) => {
    const wasTap = press && press.id === e.pointerId && !press.moved && pointers.size === 1;
    const type = press?.type;
    end(e);
    press = null;
    if (wasTap && onTap) onTap(local(e).x, local(e).y, type);
  });
  el.addEventListener('pointercancel', (e) => { end(e); press = null; });
  el.addEventListener('contextmenu', (e) => {
    if (!onContext) return;
    e.preventDefault();
    onContext(local(e).x, local(e).y);
  });
  el.addEventListener('pointerleave', () => onHover?.(null, null));

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    view.setCamera(zoomAt(view.camera, Math.exp(-e.deltaY * 0.0015), p.x, p.y));
  }, { passive: false });

  (keyTarget ?? el.ownerDocument).addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    const step = 60;
    const k = KEY_PAN[e.key] ?? KEY_PAN[e.key.toLowerCase?.()];
    if (k && keyPan(e)) {
      view.setCamera(pan(view.camera, k[0] * step, k[1] * step));
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      const { w, h } = view.viewport();
      view.setCamera(zoomAt(view.camera, e.key === '-' ? 1 / 1.2 : 1.2, w / 2, h / 2));
      e.preventDefault();
    }
  });
}
