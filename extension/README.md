# Termsinator browser extension

Manifest V3 extension for Chromium-compatible browsers.

## Install from source

1. Download the site ZIP or this repository.
2. Unzip it.
3. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
4. Select the directory containing `manifest.json`.

Click-only lookup is the default. Opening the popup sends only the active tab's hostname. Automatic mode must be enabled explicitly; it requests site access, checks hostnames after navigation, and displays a small dismissible overlay only when a published analysis exists. Paths, query strings, titles, and page contents are never sent.
