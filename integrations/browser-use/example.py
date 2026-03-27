"""
DBAR + browser-use snapshot capture example.

Runs a browser-use agent with DBAR capturing page state snapshots at each
step boundary via the on_step_end lifecycle hook.

Prerequisites:
  pip install browser-use==0.12.5 langchain-openai
  cd integrations/browser-use && npm install

Environment:
  OPENAI_API_KEY must be set (or swap ChatOpenAI for ChatAnthropic + ANTHROPIC_API_KEY)

Usage:
  python example.py
"""

import asyncio
import subprocess
import time
from pathlib import Path

from browser_use import Agent, Browser
from langchain_openai import ChatOpenAI

# Pin: browser-use==0.12.5, cdp-use==1.4.5
# browser-use v0.12.5 dropped BrowserConfig — use Browser() kwargs directly.

SIGNAL_DIR = Path(__file__).parent
SNAPSHOTS_DIR = SIGNAL_DIR / "dbar-snapshots"
CDP_PORT = 9222


async def on_step_end(agent) -> None:
    """Signal DBAR sidecar to capture state at this step boundary."""
    step_num = getattr(agent.state, "step_count", 0)
    (SIGNAL_DIR / ".dbar-step").write_text(f"step-{step_num}")
    # Allow the capture sidecar time to detect and process the signal.
    await asyncio.sleep(0.5)


async def main() -> None:
    # Launch browser with remote debugging so DBAR can attach.
    browser = Browser(headless=False)

    agent = Agent(
        task="Go to books.toscrape.com and find the price of the first Travel book",
        llm=ChatOpenAI(model="gpt-4o"),  # requires OPENAI_API_KEY
        browser=browser,
    )

    # Start DBAR capture sidecar (connects to same Chrome via CDP).
    # In production, start this before the agent and wait for "Ready" output.
    print("[example] Starting DBAR capture sidecar...")
    dbar_proc = subprocess.Popen(
        [
            "npx",
            "tsx",
            str(SIGNAL_DIR / "capture.ts"),
            f"http://localhost:{CDP_PORT}",
            str(SNAPSHOTS_DIR),
        ],
        cwd=str(SIGNAL_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Give the sidecar time to connect via CDP.
    time.sleep(3)

    print("[example] Running agent...")
    result = await agent.run(
        max_steps=20,
        on_step_end=on_step_end,
    )

    # Signal DBAR to finish and write manifest.
    (SIGNAL_DIR / ".dbar-finish").touch()
    print(f"[example] Agent result: {result}")

    # Wait for sidecar to write snapshots.
    dbar_proc.wait(timeout=15)
    if dbar_proc.stdout:
        output = dbar_proc.stdout.read().decode()
        print(f"[example] DBAR output:\n{output}")

    await browser.close()
    print(f"[example] Done. Check {SNAPSHOTS_DIR}/ for captured snapshots.")


if __name__ == "__main__":
    asyncio.run(main())
