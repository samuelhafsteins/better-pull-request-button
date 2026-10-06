(() => {
  "use strict";

  const { DEFAULT_SETTINGS, normalizeSettings, getPullRequestsUrl, getFilteredUrl } = BetterPullRequestButton;
  const rewrittenLinks = new WeakMap();
  const dropdowns = new Map();
  let settings = DEFAULT_SETTINGS;

  function removeDropdown(link) {
    dropdowns.get(link)?.remove();
    dropdowns.delete(link);
  }

  function updateDropdown(link, original) {
    if (!settings.enabled || !getPullRequestsUrl(original, document.baseURI)
      || !/^Pull requests(?:\s|$)/i.test(link.innerText.trim())) {
      removeDropdown(link);
      return;
    }
    if (!dropdowns.has(link)) {
      dropdowns.set(link, BetterPullRequestDropdown.create(link));
    }
    dropdowns.get(link).update(original, settings);
  }

  function updateLink(link) {
    const href = link.getAttribute("href");
    if (href === null) {
      rewrittenLinks.delete(link);
      removeDropdown(link);
      return;
    }

    const previous = rewrittenLinks.get(link);
    // GitHub may reuse an element with a new destination during navigation.
    const original = previous && href === previous.rewritten ? previous.original : href;
    const rewritten = getFilteredUrl(original, document.baseURI, settings);

    if (rewritten) {
      rewrittenLinks.set(link, { original, rewritten });
      if (href !== rewritten) link.setAttribute("href", rewritten);
    } else {
      rewrittenLinks.delete(link);
      if (href !== original) link.setAttribute("href", original);
    }
    updateDropdown(link, original);
  }

  function updateTree(root) {
    if (root.matches?.("a[href]")) updateLink(root);
    root.querySelectorAll?.("a[href]").forEach(updateLink);
  }

  // GitHub replaces navigation elements without a full page reload.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.target.matches("a")) updateLink(mutation.target);
      } else {
        mutation.addedNodes.forEach(updateTree);
        const link = mutation.target?.closest?.("a[href]");
        if (link) updateLink(link);
      }
    }
    for (const [link, dropdown] of dropdowns) {
      if (!link.isConnected) removeDropdown(link);
      else dropdown.attach();
    }
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });

  // Also cover links inserted immediately before an interaction. Rewriting the
  // href preserves normal clicks, keyboard navigation, and opening in new tabs.
  for (const eventName of ["click", "auxclick", "contextmenu"]) {
    document.addEventListener(eventName, (event) => {
      const link = event.target.closest?.("a[href]");
      if (link) updateLink(link);
    }, true);
  }

  chrome.storage.sync.get(DEFAULT_SETTINGS, (saved) => {
    if (chrome.runtime.lastError) {
      console.warn("Better Pull Request Button:", chrome.runtime.lastError.message);
    } else {
      settings = normalizeSettings(saved);
    }
    updateTree(document);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes.enabled && !changes.filter && !changes.actions) return;
    settings = normalizeSettings({
      enabled: changes.enabled ? changes.enabled.newValue : settings.enabled,
      filter: changes.filter ? changes.filter.newValue : settings.filter,
      actions: changes.actions ? changes.actions.newValue : settings.actions,
    });
    updateTree(document);
  });
})();
