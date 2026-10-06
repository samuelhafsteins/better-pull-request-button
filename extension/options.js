(() => {
  "use strict";

  const { DEFAULT_SETTINGS, normalizeSettings } = BetterPullRequestButton;
  const form = document.querySelector("#settings-form");
  const fieldset = document.querySelector("#settings");
  const enabledInput = document.querySelector("#enabled");
  const filterInput = document.querySelector("#filter");
  const status = document.querySelector("#status");
  const saveButton = form.querySelector("button");

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
    enabledInput.checked = settings.enabled;
    filterInput.value = settings.filter;
    fieldset.disabled = false;
    showStatus("");
  });

  form.addEventListener("input", () => showStatus("Unsaved changes"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const settings = normalizeSettings({
      enabled: enabledInput.checked,
      filter: filterInput.value,
    });
    saveButton.disabled = true;
    chrome.storage.sync.set(settings, () => {
      saveButton.disabled = false;
      if (chrome.runtime.lastError) {
        showStatus(`Could not save settings: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      filterInput.value = settings.filter;
      showStatus("Saved. Your filter is ready on GitHub.");
    });
  });
})();
