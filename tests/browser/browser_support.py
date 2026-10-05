"""Shared local-only browser regression environment and temporary artifacts."""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import subprocess
import threading

PRODUCT_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = Path(os.environ.get('FLOWDELTA_WORKSPACE', PRODUCT_ROOT.parents[1])).resolve()
TEMP = WORKSPACE / 'temp'
ARTIFACTS = TEMP / 'flowdelta-browser'


def artifact_dir(suite):
    path = ARTIFACTS / suite
    path.mkdir(parents=True, exist_ok=True)
    return path


def launch_browser(playwright):
    """Use an override, the existing workspace browser, or Playwright's install."""
    libraries = TEMP / 'browser-libs/usr/lib'
    fonts = TEMP / 'fonts.conf'
    if libraries.is_dir():
        os.environ.setdefault('LD_LIBRARY_PATH', str(libraries))
    if fonts.is_file():
        os.environ.setdefault('FONTCONFIG_FILE', str(fonts))
    installed = TEMP / 'browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
    executable = os.environ.get('FLOWDELTA_CHROMIUM')
    if not executable and installed.is_file():
        executable = str(installed)
    options = {'headless': True, 'args': ['--no-sandbox'], 'env': dict(os.environ)}
    if executable:
        options['executable_path'] = executable
    return playwright.chromium.launch(**options)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


@contextmanager
def serve_product():
    """An isolated random-port server, closed even when an assertion fails."""
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(PRODUCT_ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/'
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def download_markdown(page, directory, label):
    with page.expect_download() as download:
        page.locator('#download').click()
    path = directory / f'{label}.md'
    download.value.save_as(path)
    return path.read_text()


def pdf_text(page, directory, label):
    path = directory / f'{label}.pdf'
    page.pdf(path=str(path), format='A4', print_background=True)
    return subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True)
