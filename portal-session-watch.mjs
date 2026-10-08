// Revalidate the exact profile throughout a page's lifetime, not just at login.
export function watchPortalSession({ subscribe, subscribeAuth, subscribeConnection, userId, initial, normalize, invalidate }) {
  let stopped = false;
  const stop = reason => { if (!stopped) { stopped = true; invalidate(reason); } };
  const offProfile = subscribe(raw => {
    const next = normalize(raw);
    if (!next || JSON.stringify(next) !== JSON.stringify(initial)) stop('changed');
  }, () => stop('read-failed'));
  const offAuth = subscribeAuth(user => { if (user?.uid !== userId) stop('signed-out'); });
  // Fail closed when the server can no longer confirm permission, including offline tabs.
  const offConnection = subscribeConnection(connected => { if (!connected) stop('disconnected'); });
  return () => { stopped = true; offProfile(); offAuth(); offConnection(); };
}
