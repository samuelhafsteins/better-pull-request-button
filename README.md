# Better Pull Request Button

A small browser extension that applies your preferred search filter when you click **Pull requests** on GitHub.

Set your filter once—for example, `is:pr is:open -is:draft` and repository Pull requests tabs and the global Pull requests link will use it automatically.

## Install

### Chrome, Chromium, Edge, or Brave

1. Clone this repository or download and extract its ZIP.
2. Open your browser’s extensions page (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode** and choose **Load unpacked**.
4. Select the **`extension`** folder in this repository.

### Firefox (temporary development install)

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `extension/manifest.json`.

Firefox removes temporary add-ons when it closes. Permanent Firefox installation requires a signed add-on; this project is not currently published to an extension store.

## Use

1. Click the extension’s toolbar icon (you may need to pin it first).
2. Enter your default filter and click **Save filters**.
3. Open or refresh GitHub after installing, then click **Pull requests**.

Clicking **Pull requests** uses your default filter. The **▾** button beside it opens a menu with your default action and any extra named filters you have saved.

- Choose **+ Add filter…** in the dropdown to save another action directly on GitHub (for example, “Waiting on me”).
- Use **Dropdown filters** in the extension popup to add, edit, or remove actions, then click **Save filters**.
- Extra actions use the same repository or global Pull requests destination as the main link. They support opening in a new tab and do not change your default.

Examples:

| Show | Filter |
| --- | --- |
| Open pull requests (default) | `is:pr is:open` |
| Open, non-draft pull requests | `is:pr is:open -is:draft` |
| Reviews requested from you | `is:pr is:open review-requested:@me` |
| Your open pull requests | `is:pr is:open author:@me` |
| Recently updated pull requests | `is:pr is:open sort:updated-desc` |

Settings changes apply to links and dropdowns in already-open GitHub tabs. Clear the default filter to use GitHub’s normal main link while keeping your dropdown actions. Disable the checkbox to restore normal links and hide the dropdowns.

The extension updates links to `github.com/pulls` and `github.com/<owner>/<repo>/pulls`. Links with an existing `q` search parameter keep their explicit filter, and individual pull requests are untouched. It supports GitHub’s dynamic navigation, keyboard activation, and opening links in new tabs. It changes link destinations, so visiting a URL directly does not trigger a redirect. GitHub Enterprise domains are not currently supported.

## Privacy

No analytics, external services, or GitHub tokens. The extension only runs on `github.com` and uses the browser’s `storage` permission to save your default filter, named dropdown filters, and enabled state. Settings use browser sync storage and may sync through your browser account if enabled.

## Development

Plain JavaScript and Manifest V3. No build step or dependencies.

```sh
npm test
npm run check
```

With Node.js 22+ and Chromium installed, run `npm run test:browser` for browser checks, including a regression check that the arrow leaves GitHub’s tab dimensions unchanged. Set `CHROMIUM` to your browser executable if needed. `LIVE_GITHUB=1 npm run test:browser` also compares the real GitHub navigation with the extension enabled and disabled at multiple window widths.

Load `extension/` in your browser, then reload the extension and GitHub tabs after code changes.

## License

[MIT](LICENSE)

The pull request icon is GitHub’s [`git-pull-request` Octicon](https://github.com/primer/octicons), used under its [MIT license](extension/icons/LICENSE).
