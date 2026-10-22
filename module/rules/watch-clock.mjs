// Gameplay timers use the same *authoritative* Foundry world-time seconds as the Banana Watch.
// Do not substitute Date.now(): that would keep effects running while a table is paused/offline,
// and would ignore the GM advancing the watch from its crown or a calendar module.
export function watchSeconds() {
  const seconds = Number(globalThis.game?.time?.worldTime ?? 0);
  return Number.isFinite(seconds) ? seconds : 0;
}

export function watchDeadline(minutes, from = watchSeconds()) {
  const n = Number(minutes);
  return Number(from) + Math.max(1, Number.isFinite(n) && n > 0 ? n : 1) * 60;
}

export function watchMinutesRemaining(deadline, now = watchSeconds()) {
  if (deadline === undefined || deadline === null || deadline === '') return null;
  const end = Number(deadline);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - Number(now)) / 60));
}

// Upgrade an old wall-clock timestamp once. This preserves its *remaining* duration
// at migration, after which only world time changes it. An already-expired legacy
// condition is due immediately; its earlier elapsed game time cannot be recovered.
export function legacyDeadlineToWatch(legacyEpochMs, nowWorld = watchSeconds(), nowRealMs = Date.now()) {
  const legacy = Number(legacyEpochMs);
  if (!Number.isFinite(legacy) || legacy < 1e11) return null;
  return Number(nowWorld) + Math.max(0, (legacy - Number(nowRealMs)) / 1000);
}
