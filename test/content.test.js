const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const filter = require("../extension/filter.js");

const source = readFileSync(require.resolve("../extension/content.js"), "utf8");

function createPage(saved = {}) {
  class Link {
    constructor(href) { this.href = href; }
    getAttribute() { return this.href; }
    setAttribute(name, value) { this.href = value; }
    matches(selector) { return selector === "a" || this.href !== null; }
    closest() { return this; }
    querySelectorAll() { return []; }
  }

  const links = [new Link("/octocat/hello-world/pulls"), new Link("/pulls?q=is%3Apr+is%3Aclosed")];
  const events = {};
  let onMutation;
  let onStorageChange;
  const context = {
    BetterPullRequestButton: filter,
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
  return { links, Link, events, mutate: (records) => onMutation(records), change: (changes, area = "sync") => onStorageChange(changes, area) };
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
