(() => {
  "use strict";

  const { DEFAULT_SETTINGS, normalizeSettings, getFilteredUrl } = BetterPullRequestButton;
  let closeActive = null;

  function create(link) {
    const host = document.createElement("span");
    host.dataset.bprDropdown = "";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { display: inline-flex; vertical-align: middle; align-self: center; flex-shrink: 0; }
      * { box-sizing: border-box; }
      button, input { font: inherit; }
      button { cursor: pointer; }
      .trigger { display: grid; place-items: center; width: 16px; height: 28px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--fgColor-default, #1f2328); }
      .trigger:hover, .item:hover, .item:focus-visible { background: var(--bgColor-muted, #f6f8fa); }
      :focus-visible { outline: 2px solid #0969da; outline-offset: -2px; }
      .panel { position: fixed; inset: auto; margin: 0; padding: 6px; width: 310px; max-width: calc(100vw - 16px); overflow: auto; z-index: 2147483647; border: 1px solid var(--borderColor-default, #d1d9e0); border-radius: 8px; box-shadow: 0 8px 24px #0003; background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1f2328); font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-align: start; }
      [hidden] { display: none !important; }
      .item { display: block; width: 100%; border: 0; border-radius: 4px; padding: 8px 10px; background: transparent; color: inherit; text-align: start; text-decoration: none; overflow-wrap: anywhere; }
      .query { display: block; margin-top: 2px; font-size: 11px; color: var(--fgColor-muted, #59636e); overflow-wrap: anywhere; }
      .separator { margin: 5px 0; border: 0; border-top: 1px solid var(--borderColor-default, #d1d9e0); }
      form { padding: 8px; }
      label { display: block; font-weight: 600; margin-bottom: 12px; }
      input { display: block; width: 100%; padding: 7px; margin-top: 4px; border: 1px solid var(--borderColor-default, #d1d9e0); border-radius: 5px; background: var(--bgColor-default, #fff); color: inherit; }
      .buttons { display: flex; gap: 8px; }
      .buttons button { border: 1px solid var(--borderColor-default, #d1d9e0); border-radius: 5px; padding: 6px 10px; background: var(--bgColor-muted, #f6f8fa); color: inherit; }
      .buttons button[type=submit] { background: #1f883d; color: #fff; }
      button:disabled { opacity: 0.6; cursor: wait; }
      .error { color: var(--fgColor-danger, #cf222e); margin: 8px 0 0; }
    `;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "trigger";
    const caret = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    caret.setAttribute("width", "12");
    caret.setAttribute("height", "12");
    caret.setAttribute("viewBox", "0 0 12 12");
    caret.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M3 4.5 6 7.5 9 4.5");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    caret.append(path);
    trigger.append(caret);
    trigger.title = "Pull request filters";
    trigger.setAttribute("aria-label", "Pull request filters");
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "filters");
    const panel = document.createElement("div");
    panel.id = "filters";
    panel.className = "panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Pull request filters");
    const supportsPopover = typeof panel.showPopover === "function";
    if (supportsPopover) panel.setAttribute("popover", "manual");
    root.append(style, trigger, panel);

    let original;
    let settings = DEFAULT_SETTINGS;
    let signature;
    let opened = false;
    let editing = false;
    let listeners;
    let parent;

    function position() {
      const bounds = trigger.getBoundingClientRect();
      const below = window.innerHeight - bounds.bottom - 12;
      const above = bounds.top - 12;
      const useBelow = below >= Math.min(panel.scrollHeight, 260) || below >= above;
      panel.style.maxHeight = `${Math.max(80, useBelow ? below : above)}px`;
      panel.style.left = `${Math.max(8, Math.min(bounds.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, useBelow ? bounds.bottom + 4 : bounds.top - panel.offsetHeight - 4)}px`;
    }

    function close(restoreFocus = false) {
      if (!opened) return;
      opened = false;
      listeners.abort();
      if (supportsPopover) panel.hidePopover();
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (closeActive === close) closeActive = null;
      if (restoreFocus) trigger.focus();
    }

    function addLink(label, query) {
      const anchor = document.createElement("a");
      anchor.className = "item";
      anchor.setAttribute("role", "menuitem");
      anchor.href = getFilteredUrl(original, document.baseURI, { filter: query }) || new URL(original, document.baseURI).href;
      const title = document.createElement("span");
      title.textContent = label;
      const detail = document.createElement("span");
      detail.className = "query";
      detail.textContent = query || "GitHub’s default view";
      anchor.append(title, detail);
      anchor.addEventListener("click", () => close());
      panel.append(anchor);
    }

    function renderMenu() {
      editing = false;
      panel.replaceChildren();
      panel.setAttribute("role", "menu");
      addLink("Default", settings.filter);
      for (const action of settings.actions) addLink(action.label, action.filter);
      const separator = document.createElement("hr");
      separator.className = "separator";
      separator.setAttribute("role", "separator");
      const add = document.createElement("button");
      add.type = "button";
      add.className = "item";
      add.textContent = "+ Add filter…";
      add.setAttribute("role", "menuitem");
      add.addEventListener("click", renderForm);
      panel.append(separator, add);
      if (opened) position();
    }

    function renderForm() {
      editing = true;
      panel.replaceChildren();
      panel.setAttribute("role", "dialog");
      const form = document.createElement("form");
      function field(text, name, placeholder) {
        const label = document.createElement("label");
        label.textContent = text;
        const input = document.createElement("input");
        input.name = name;
        input.required = true;
        input.placeholder = placeholder;
        input.autocomplete = "off";
        input.spellcheck = false;
        label.append(input);
        form.append(label);
        return input;
      }
      const name = field("Name", "label", "Waiting on me");
      const query = field("Filter", "filter", "is:pr is:open review-requested:@me");
      const buttons = document.createElement("div");
      buttons.className = "buttons";
      const save = document.createElement("button");
      save.type = "submit";
      save.textContent = "Add filter";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => { renderMenu(); panel.querySelector("button").focus(); });
      buttons.append(save, cancel);
      const status = document.createElement("p");
      status.className = "error";
      status.setAttribute("role", "status");
      form.append(buttons, status);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const action = { label: name.value.trim(), filter: query.value.trim() };
        if (!action.label || !action.filter) {
          status.textContent = "Enter a name and a filter.";
          return;
        }
        save.disabled = true;
        function failed() {
          if (!chrome.runtime.lastError) return false;
          status.textContent = chrome.runtime.lastError.message;
          save.disabled = false;
          return true;
        }
        chrome.storage.sync.get(DEFAULT_SETTINGS, (saved) => {
          if (failed()) return;
          const actions = [...normalizeSettings(saved).actions, action];
          chrome.storage.sync.set({ actions }, () => {
            if (failed()) return;
            settings = { ...settings, actions };
            renderMenu();
            if (opened) panel.querySelectorAll("a")[actions.length].focus();
          });
        });
      });
      panel.append(form);
      position();
      name.focus();
    }

    function open() {
      closeActive?.();
      closeActive = close;
      renderMenu();
      opened = true;
      panel.hidden = false;
      if (supportsPopover) panel.showPopover();
      trigger.setAttribute("aria-expanded", "true");
      position();
      listeners = new AbortController();
      const options = { capture: true, signal: listeners.signal };
      document.addEventListener("pointerdown", (event) => {
        if (!event.composedPath().includes(host)) close();
      }, options);
      document.addEventListener("focusin", (event) => {
        if (!event.composedPath().includes(host)) close();
      }, options);
      window.addEventListener("resize", position, { signal: listeners.signal });
      document.addEventListener("scroll", position, options);
      panel.querySelector("a").focus();
    }

    trigger.addEventListener("click", () => opened ? close(true) : open());
    root.addEventListener("click", (event) => event.stopPropagation());
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && opened) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && !editing) {
        event.preventDefault();
        event.stopPropagation();
        if (!opened) { open(); return; }
        const items = [...panel.querySelectorAll('[role="menuitem"]')];
        const current = items.indexOf(root.activeElement);
        const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[index].focus();
      }
    });

    function attach() {
      const nextParent = link.parentElement?.matches("li") ? link.parentElement : null;
      if (parent !== nextParent) {
        parent?.removeAttribute("data-bpr-split");
        parent = nextParent;
        parent?.setAttribute("data-bpr-split", "");
      }
      if (link.nextSibling !== host) link.after(host);
    }

    return {
      attach,
      update(href, saved) {
        original = href;
        settings = saved;
        const nextSignature = JSON.stringify([original, settings.filter, settings.actions]);
        if (nextSignature !== signature && !editing) renderMenu();
        signature = nextSignature;
        attach();
      },
      remove() {
        close();
        host.remove();
        parent?.removeAttribute("data-bpr-split");
      },
    };
  }

  globalThis.BetterPullRequestDropdown = Object.freeze({ create });
})();
