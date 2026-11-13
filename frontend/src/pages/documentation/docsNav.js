// Documentation section (Phase 4d): the policy pages, in sidebar order.
// Shared by Sidebar.jsx, DocsHome.jsx and PoliciesIndex.jsx so the three
// lists can't drift. `page` matches lib/contentRegistry.js LEGAL_PAGES.
export const DOC_POLICIES = [
  { page: "terms", key: "TERMS", label: "Terms of Use" },
  { page: "privacy", key: "PRIVACY", label: "Privacy notice" },
  { page: "cookies", key: "COOKIES", label: "Cookie & storage notice" },
  { page: "notice", key: "NOTICE", label: "System Use Notice" },
];
