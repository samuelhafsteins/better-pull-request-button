# Better Pull Request Button

A small browser extension that applies your preferred search filter when you click **Pull requests** on GitHub.

Set your filter once—for example, `is:pr is:open -is:draft`—and repository Pull requests tabs and the global Pull requests link will use it automatically.

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
2. Enter your default filter and click **Save filter**.
3. Open or refresh GitHub after installing, then click **Pull requests**.

Examples:

| Show | Filter |
| --- | --- |
| Open pull requests (default) | `is:pr is:open` |
| Open, non-draft pull requests | `is:pr is:open -is:draft` |
| Reviews requested from you | `is:pr is:open review-requested:@me` |
| Your open pull requests | `is:pr is:open author:@me` |
| Recently updated pull requests | `is:pr is:open sort:updated-desc` |

Settings changes apply to links in already-open GitHub tabs. Disable the checkbox or clear the filter to use GitHub’s normal links again.

The extension updates links to `github.com/pulls` and `github.com/<owner>/<repo>/pulls`. Links with an existing `q` search parameter keep their explicit filter, and individual pull requests are untouched. It supports GitHub’s dynamic navigation, keyboard activation, and opening links in new tabs. It changes link destinations, so visiting a URL directly does not trigger a redirect. GitHub Enterprise domains are not currently supported.

## Privacy

No analytics, external services, or GitHub tokens. The extension only runs on `github.com` and uses the browser’s `storage` permission to save your filter and enabled state. Settings use browser sync storage and may sync through your browser account if enabled.

## Development

Plain JavaScript and Manifest V3. No build step or dependencies.

```sh
npm test
npm run check
```

Load `extension/` in your browser, then reload the extension and GitHub tabs after code changes.

## License

[MIT](LICENSE)
