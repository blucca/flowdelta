#!/usr/bin/env python3
"""Render the checked-in service sample to A4 PDF with Playwright/Chromium.

Requires existing Python playwright and Chromium; installs nothing. From workspace:
  LD_LIBRARY_PATH="$PWD/temp/browser-libs/usr/lib" FONTCONFIG_FILE="$PWD/temp/fonts.conf" \
    temp/work-env/bin/python products/flowdelta/scripts/build_service_sample.py \
    --browser temp/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell

Without --browser, Playwright uses its configured Chromium installation.
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", type=Path)
    parser.add_argument("--output", type=Path, default=root / "examples/service-sample.pdf")
    args = parser.parse_args()
    options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if args.browser:
        options["executable_path"] = str(args.browser.resolve())
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**options)
        page = browser.new_page(viewport={"width": 1100, "height": 1200})
        page.goto((root / "examples/service-sample.html").as_uri())
        page.evaluate("document.fonts.ready")
        assert page.locator(".sheet").count() == 4
        assert page.locator(".status").all_text_contents() == ["Not run"] * 8
        text_width = page.locator("h1").evaluate("el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; }")
        assert text_width > 100, "Text did not render; check Chromium's font configuration"
        page.pdf(path=str(args.output.resolve()), print_background=True, prefer_css_page_size=True)
        browser.close()
    print(args.output)


if __name__ == "__main__":
    main()
