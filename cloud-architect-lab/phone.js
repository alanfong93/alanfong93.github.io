import { nodeInfrastructure } from './engine.js';

// Phone policy is independent of orientation so portrait cannot escape its gate.
// Coarse-pointer tablets with a short screen side >600px retain the normal UI.
export function phoneLayout({ coarse, width, height, screenWidth = width, screenHeight = height }) {
  const shortSide = Math.min(screenWidth || width, screenHeight || height);
  const phone = !!coarse && shortSide > 0 && shortSide <= 600;
  return { phone, blocked: phone && height >= width };
}

export function beginTap(event) {
  return { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, cancelled: false };
}
export function moveTap(gesture, event, threshold = 10) {
  if (gesture && gesture.pointerId === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > threshold) gesture.moved = true;
}
export function isTap(gesture) { return !!gesture && !gesture.moved && !gesture.cancelled; }

// Live edits clear last-tick measurements; current maintenance/reboot eligibility
// must still be derived from frozen targets and runtime state, not stale DOM.
export function serviceHealth(run, node, scenario) {
  if (run) {
    const s = nodeInfrastructure(run, node.id);
    return { state: s.state, down: s.down, maintenanceRemaining: s.maintenanceRemaining ?? 0, rebootRemaining: s.rebootRemaining ?? 0,
      ...(s.zoneRemaining > 0 ? { zone: s.zone, zoneRemaining: s.zoneRemaining } : {}),
      ...(s.startupRemaining > 0 ? { startupRemaining: s.startupRemaining } : {}) };
  }
  return { state: 'healthy', down: false, maintenanceRemaining: 0, rebootRemaining: 0 };
}
