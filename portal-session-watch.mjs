// Revalidate the exact profile throughout a page's lifetime, not just at login.
export function watchPortalSession({ subscribe, subscribeAuth, subscribeConnection, userId, initial, normalize, invalidate, suspend, reconnect }) {
  let stopped = false;
  let suspended = false;
  let connectionState;
  const stop = reason => { if (!stopped) { stopped = true; invalidate(reason); } };
  const offProfile = subscribe(raw => {
    const next = normalize(raw);
    if (!next || JSON.stringify(next) !== JSON.stringify(initial)) stop('changed');
  }, () => stop('read-failed'));
  const offAuth = subscribeAuth(user => { if (user?.uid !== userId) stop('signed-out'); });
  // Transport loss is not revocation. Keep Firebase authentication, but do not
  // expose cached content or allow actions until a fresh page confirms access.
  const offConnection = subscribeConnection(connected => {
    if (stopped) return;
    if (connected === connectionState) return;
    connectionState = connected;
    if (!connected) { suspended = true; suspend(); }
    else if (connected && suspended) reconnect();
  });
  return () => { stopped = true; offProfile(); offAuth(); offConnection(); };
}
