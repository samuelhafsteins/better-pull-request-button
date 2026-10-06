(() => {
  "use strict";

  const { DEFAULT_SETTINGS, normalizeSettings } = BetterPullRequestButton;
  const form = document.querySelector("#settings-form");
  const fieldset = document.querySelector("#settings");
  const enabledInput = document.querySelector("#enabled");
  const filterInput = document.querySelector("#filter");
  const status = document.querySelector("#status");
  const actionsList = document.querySelector("#actions");
  const addButton = document.querySelector("#add-action");
  const dirty = new Set();

  function markDirty(key) {
    dirty.add(key);
    showStatus("Unsaved changes");
  }

  function applySettings(settings, keys = ["enabled", "filter", "actions"]) {
    for (const key of keys) {
      if (dirty.has(key)) continue;
      if (key === "enabled") enabledInput.checked = settings.enabled;
      if (key === "filter") filterInput.value = settings.filter;
      if (key === "actions") {
        actionsList.replaceChildren();
        settings.actions.forEach(addAction);
      }
    }
  }

  function addAction(action = { label: "", filter: "" }) {
    const row = document.createElement("details");
    row.className = "action";
    const summary = document.createElement("summary");
    summary.textContent = action.label || "New filter";
    const fields = document.createElement("div");
    fields.className = "action-fields";
    row.append(summary, fields);
    for (const [key, text] of [["label", "Name"], ["filter", "Filter"]]) {
      const label = document.createElement("label");
      label.textContent = text;
      const input = document.createElement(key === "filter" ? "textarea" : "input");
      if (key === "label") input.type = "text";
      else input.rows = 2;
      input.dataset.field = key;
      input.value = action[key];
      input.required = true;
      input.spellcheck = false;
      if (key === "label") {
        input.addEventListener("input", () => {
          summary.textContent = input.value.trim() || "New filter";
        });
      }
      label.append(input);
      fields.append(label);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Remove filter";
    remove.addEventListener("click", () => {
      row.remove();
      markDirty("actions");
      addButton.focus();
    });
    fields.append(remove);
    actionsList.append(row);
    return row;
  }

  addButton.addEventListener("click", () => {
    const row = addAction();
    row.open = true;
    row.querySelector("input").focus();
    markDirty("actions");
  });

  function showStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  chrome.storage.sync.get(DEFAULT_SETTINGS, (saved) => {
    if (chrome.runtime.lastError) {
      showStatus(`Could not load settings: ${chrome.runtime.lastError.message}`, true);
      return;
    }
    const settings = normalizeSettings(saved);
    applySettings(settings);
    fieldset.disabled = false;
    showStatus("");
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const saved = Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue]));
    applySettings(normalizeSettings(saved), Object.keys(changes));
  });

  form.addEventListener("input", (event) => {
    markDirty(event.target.closest(".action") ? "actions" : event.target.id);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const actions = [...actionsList.children].map((row) => ({
      label: row.querySelector('[data-field="label"]').value.trim(),
      filter: row.querySelector('[data-field="filter"]').value.trim(),
    }));
    if (actions.some((action) => !action.label || !action.filter)) {
      showStatus("Enter a name and filter for each dropdown action, or remove the empty action.", true);
      return;
    }
    const settings = normalizeSettings({
      enabled: enabledInput.checked,
      filter: filterInput.value,
      actions,
    });
    fieldset.disabled = true;
    // Save only edited sections so changing the default does not overwrite
    // actions added from another GitHub tab while these settings are open.
    const updates = Object.fromEntries(Object.entries(settings).filter(([key]) => dirty.has(key)));
    chrome.storage.sync.set(updates, () => {
      fieldset.disabled = false;
      if (chrome.runtime.lastError) {
        showStatus(`Could not save settings: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      dirty.clear();
      filterInput.value = settings.filter;
      showStatus("Saved. Your filter is ready on GitHub.");
    });
  });
})();
