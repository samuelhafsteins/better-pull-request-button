const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DEFAULT_SETTINGS, normalizeSettings, getPullRequestsUrl, getFilteredUrl } = require("../extension/filter.js");

const base = "https://github.com/octocat/hello-world";
const settings = { enabled: true, filter: 'is:pr is:open label:"needs review" -is:draft' };

test("filters repository and global PR navigation, including relative URLs", () => {
  for (const href of ["/pulls", "/pulls/", "/octocat/hello-world/pulls", "hello-world/pulls", "https://github.com/octocat/hello-world/pulls/"]) {
    const result = new URL(getFilteredUrl(href, base, settings));
    assert.equal(result.searchParams.get("q"), settings.filter);
  }
});

test("preserves other query parameters and fragments", () => {
  const result = new URL(getFilteredUrl("/pulls?foo=bar#top", base, settings));
  assert.equal(result.searchParams.get("foo"), "bar");
  assert.equal(result.hash, "#top");
  assert.equal(result.searchParams.get("q"), settings.filter);
});

test("leaves explicit searches, other destinations, and unsafe URLs alone", () => {
  for (const href of [
    "/pulls?q=is%3Apr+is%3Aclosed", "/pulls?q=", "/octocat/hello-world/pulls?q=author%3A%40me",
    "/octocat/hello-world/pull/42", "/octocat/hello-world/issues", "/pulls/review-requested",
    "https://example.com/pulls", "https://github.com.evil.test/pulls", "http://github.com/pulls",
    "javascript:alert(1)", "https://[", "/octocat/hello-world/pulls/files",
  ]) {
    assert.equal(getFilteredUrl(href, base, settings), null, href);
  }
});

test("does not turn in-page anchors or query-only links into filtered navigation", () => {
  for (const href of ["", "  ", "#top", " #top", "?page=2"]) {
    assert.equal(getFilteredUrl(href, `${base}/pulls`, settings), null);
  }
});

test("disabled or blank filters leave links alone", () => {
  assert.equal(getFilteredUrl("/pulls", base, { ...settings, enabled: false }), null);
  assert.equal(getFilteredUrl("/pulls", base, { filter: "  " }), null);
});

test("normalizes missing settings and trims filters", () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ filter: "  author:@me  ", enabled: false }), { filter: "author:@me", enabled: false, actions: [] });
  assert.deepEqual(normalizeSettings({ filter: 42 }), DEFAULT_SETTINGS);
});

test("migrates old settings and normalizes named dropdown filters", () => {
  assert.deepEqual(normalizeSettings({ filter: "author:@me" }).actions, []);
  assert.deepEqual(normalizeSettings({ actions: [
    { label: "  Waiting on me  ", filter: " review-requested:@me " },
    { label: "", filter: "is:open" }, { label: "Blank", filter: " " },
    { label: "Broken", filter: 42 }, null,
  ] }).actions, [{ label: "Waiting on me", filter: "review-requested:@me" }]);
  assert.deepEqual(normalizeSettings({ actions: "invalid" }).actions, []);
});

test("recognizes dropdown destinations independently of the default filter", () => {
  assert.equal(getPullRequestsUrl("/octocat/hello-world/pulls", base).pathname, "/octocat/hello-world/pulls");
  assert.equal(getPullRequestsUrl("/pulls?q=is:closed", base), null);
  const action = getFilteredUrl("/octocat/hello-world/pulls", base, { filter: "review-requested:@me" });
  assert.equal(new URL(action).pathname, "/octocat/hello-world/pulls");
  assert.equal(new URL(action).searchParams.get("q"), "review-requested:@me");
});

test("does not repeatedly append filters", () => {
  const result = getFilteredUrl("/pulls", base, settings);
  assert.equal(getFilteredUrl(result, base, settings), null);
});
