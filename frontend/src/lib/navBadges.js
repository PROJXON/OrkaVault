// Sidebar nav badges (pending approvals / pending registrations) poll on a
// timer; pages that change those counts call this so the badge updates
// immediately instead of waiting for the next poll or navigation.
export const NAV_BADGES_REFRESH_EVENT = "orkavault:badges-refresh";

export function refreshNavBadges() {
  window.dispatchEvent(new Event(NAV_BADGES_REFRESH_EVENT));
}
