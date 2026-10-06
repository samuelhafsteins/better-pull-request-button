(() => {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    filter: "is:pr is:open",
  });

  function normalizeSettings(settings = {}) {
    return {
      enabled: settings.enabled !== false,
      filter: typeof settings.filter === "string"
        ? settings.filter.trim()
        : DEFAULT_SETTINGS.filter,
    };
  }

  function getFilteredUrl(href, baseUrl, settings) {
    const { enabled, filter } = normalizeSettings(settings);
    if (!enabled || !filter) return null;
    if (typeof href !== "string" || !href.trim() || /^[?#]/.test(href.trim())) return null;

    let url;
    try {
      url = new URL(href, baseUrl);
    } catch {
      return null;
    }

    if (url.origin !== "https://github.com") return null;
    if (!/^\/(?:pulls|[^/]+\/[^/]+\/pulls)\/?$/.test(url.pathname)) return null;

    // Search links and GitHub's explicit filter choices keep their own query.
    if (url.searchParams.has("q")) return null;

    url.searchParams.set("q", filter);
    return url.href;
  }

  const api = Object.freeze({ DEFAULT_SETTINGS, normalizeSettings, getFilteredUrl });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.BetterPullRequestButton = api;
  }
})();
