const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const filter = require("../extension/filter.js");

const source = readFileSync(require.resolve("../extension/content.js"), "utf8");

function createPage(saved = {}) {
  class Link {
    constructor(href, text = "Pull requests") { this.href = href; this.innerText = text; this.isConnected = true; }
    getAttribute() { return this.href; }
    setAttribute(name, value) { this.href = value; }
    matches(selector) { return selector === "a" || this.href !== null; }
    closest(selector) { return selector === "a[href]" ? this : null; }
    querySelectorAll() { return []; }
  }

  const links = [new Link("/octocat/hello-world/pulls"), new Link("/pulls?q=is%3Apr+is%3Aclosed")];
  const events = {};
  const dropdowns = new Map();
  let createdDropdowns = 0;
  let onMutation;
  let onStorageChange;
  const context = {
    BetterPullRequestButton: filter,
    BetterPullRequestDropdown: {
      create: (link) => {
        createdDropdowns++;
        const dropdown = {
          attach() {},
          update(original, settings) { this.original = original; this.settings = settings; },
          remove() { dropdowns.delete(link); },
        };
        dropdowns.set(link, dropdown);
        return dropdown;
      },
    },
    console,
    document: {
      baseURI: "https://github.com/octocat/hello-world",
      querySelectorAll: () => links,
      addEventListener: (name, callback) => { events[name] = callback; },
    },
    MutationObserver: class {
      constructor(callback) { onMutation = callback; }
      observe() {}
    },
    chrome: {
      runtime: {},
      storage: {
        sync: { get: (defaults, callback) => callback({ ...defaults, ...saved }) },
        onChanged: { addListener: (callback) => { onStorageChange = callback; } },
      },
    },
  };
  vm.runInNewContext(source, context);
  return { links, Link, events, dropdowns, get createdDropdowns() { return createdDropdowns; }, mutate: (records) => onMutation(records), change: (changes, area = "sync") => onStorageChange(changes, area) };
}

test("applies stored settings and preserves explicit query links", () => {
  const page = createPage({ filter: "is:pr review-requested:@me" });
  assert.equal(new URL(page.links[0].href).searchParams.get("q"), "is:pr review-requested:@me");
  assert.equal(page.links[1].href, "/pulls?q=is%3Apr+is%3Aclosed");
});

test("changes filters on existing links and restores original hrefs when disabled", () => {
  const page = createPage();
  page.change({ filter: { newValue: "author:@me" } });
  assert.equal(new URL(page.links[0].href).searchParams.get("q"), "author:@me");
  page.change({ enabled: { newValue: false } });
  assert.equal(page.links[0].href, "/octocat/hello-world/pulls");
  page.change({ enabled: { newValue: true } });
  assert.equal(new URL(page.links[0].href).searchParams.get("q"), "author:@me");
  page.change({ filter: { newValue: "" } });
  assert.equal(page.links[0].href, "/octocat/hello-world/pulls");
});

test("handles dynamic additions and GitHub reusing an existing anchor", () => {
  const page = createPage();
  const link = new page.Link("/another/repo/pulls");
  page.mutate([{ type: "childList", addedNodes: [link] }]);
  assert.equal(new URL(link.href).searchParams.get("q"), "is:pr is:open");

  page.links[0].href = "/different/repo/pulls";
  page.mutate([{ type: "attributes", target: page.links[0] }]);
  assert.equal(new URL(page.links[0].href).pathname, "/different/repo/pulls");
  page.change({ enabled: { newValue: false } });
  assert.equal(page.links[0].href, "/different/repo/pulls");
});

test("does not restore stale hrefs when GitHub changes or removes the destination", () => {
  const page = createPage();
  page.links[0].href = "/octocat/hello-world/issues";
  page.mutate([{ type: "attributes", target: page.links[0] }]);
  assert.equal(page.links[0].href, "/octocat/hello-world/issues");
  page.links[0].href = null;
  page.mutate([{ type: "attributes", target: page.links[0] }]);
  assert.equal(page.links[0].href, null);
});

test("handles an extension-triggered mutation without rewriting again", () => {
  const page = createPage();
  const href = page.links[0].href;
  page.links[0].setAttribute = () => assert.fail("Unexpected repeated write");
  page.mutate([{ type: "attributes", target: page.links[0] }]);
  assert.equal(page.links[0].href, href);
});

test("covers clicks, new tabs, and context menus before mutation processing", () => {
  const page = createPage();
  for (const eventName of ["click", "auxclick", "contextmenu"]) {
    const link = new page.Link("/pulls");
    page.events[eventName]({ target: link });
    assert.equal(new URL(link.href).searchParams.get("q"), "is:pr is:open");
  }
});

test("ignores unrelated storage changes and restores defaults after storage removal", () => {
  const page = createPage({ filter: "author:@me" });
  page.change({ filter: { newValue: "is:closed" } }, "local");
  assert.equal(new URL(page.links[0].href).searchParams.get("q"), "author:@me");
  page.change({ filter: {} });
  assert.equal(new URL(page.links[0].href).searchParams.get("q"), filter.DEFAULT_SETTINGS.filter);
});

test("creates one dropdown per eligible link and updates saved actions live", () => {
  const page = createPage();
  assert.equal(page.dropdowns.size, 1);
  assert.equal(page.createdDropdowns, 1);
  page.mutate([{ type: "attributes", target: page.links[0] }]);
  assert.equal(page.createdDropdowns, 1);
  const actions = [{ label: "Reviews", filter: "review-requested:@me" }];
  page.change({ actions: { newValue: actions } });
  assert.deepEqual(page.dropdowns.get(page.links[0]).settings.actions, actions);
  assert.equal(page.dropdowns.get(page.links[0]).original, "/octocat/hello-world/pulls");
  assert.equal(new URL(page.links[0].href).searchParams.get("q"), "is:pr is:open");
});

test("only adds dropdowns to labeled Pull requests links, including updated labels", () => {
  const page = createPage();
  for (const text of ["", "Inbox", "Issues"]) {
    const link = new page.Link("/pulls", text);
    page.mutate([{ type: "childList", addedNodes: [link] }]);
    assert.equal(page.dropdowns.has(link), false);
    assert.equal(new URL(link.href).searchParams.get("q"), "is:pr is:open");
  }
  const link = page.links[0];
  link.innerText = "";
  page.mutate([{ type: "childList", target: link, addedNodes: [] }]);
  assert.equal(page.dropdowns.has(link), false);
  link.innerText = "Pull requests\n12";
  page.mutate([{ type: "childList", target: link, addedNodes: [] }]);
  assert.equal(page.dropdowns.has(link), true);
});

test("keeps dropdown actions with a blank default and removes dropdowns when disabled", () => {
  const page = createPage({ filter: "" });
  assert.equal(page.links[0].href, "/octocat/hello-world/pulls");
  assert.equal(page.dropdowns.size, 1);
  page.change({ enabled: { newValue: false } });
  assert.equal(page.dropdowns.size, 0);
  page.change({ enabled: { newValue: true } });
  assert.equal(page.dropdowns.size, 1);
});

test("cleans up dropdowns after navigation removes or repurposes links", () => {
  const page = createPage();
  page.links[0].href = "/octocat/hello-world/issues";
  page.mutate([{ type: "attributes", target: page.links[0] }]);
  assert.equal(page.dropdowns.size, 0);
  page.links[0].href = "/pulls";
  page.mutate([{ type: "attributes", target: page.links[0] }]);
  assert.equal(page.dropdowns.size, 1);
  page.links[0].isConnected = false;
  page.mutate([{ type: "childList", addedNodes: [] }]);
  assert.equal(page.dropdowns.size, 0);
});
