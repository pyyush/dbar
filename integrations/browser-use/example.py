"""
DBAR + browser-use snapshot capture example.

Runs a browser-use agent with DBAR capturing page state snapshots at each
step boundary via the on_step_end lifecycle hook.

Prerequisites:
  python3.11 -m venv .venv && source .venv/bin/activate
  # Install browser-use and your LLM provider only after your own dependency
  # audit passes. DBAR 1.0.0 does not ship browser-use as an optional extra.
  cd integrations/browser-use && npm install

Environment:
  OPENAI_API_KEY must be set (or swap ChatOpenAI for ChatAnthropic + ANTHROPIC_API_KEY)

Usage:
  python example.py
"""

import asyncio
import json
import subprocess
import time
from pathlib import Path

from browser_use import Agent, Browser
from langchain_openai import ChatOpenAI

# Compatibility reference: browser-use owns the Browser/Agent lifecycle and
# exposes a CDP URL that the DBAR sidecar observes. DBAR intentionally does not
# pin or install browser-use for 1.0.0 because current upstream pins do not
# audit clean.

SIGNAL_DIR = Path(__file__).parent
SNAPSHOTS_DIR = SIGNAL_DIR / "dbar-snapshots"


async def on_step_end(agent) -> None:
    """Signal DBAR sidecar to capture state at this step boundary."""
    step_num = len(getattr(agent.history, "history", []))
    target_id = getattr(agent.browser_session, "agent_focus_target_id", None)
    payload = {
        "label": f"step-{step_num}",
        "targetId": target_id,
    }
    (SIGNAL_DIR / ".dbar-step").write_text(json.dumps(payload))
    # Allow the capture sidecar time to detect and process the signal.
    await asyncio.sleep(0.5)


async def main() -> None:
    # Start the browser up front so we can hand its real CDP URL to the DBAR sidecar.
    browser = Browser(headless=False)
    await browser.start()

    cdp_url = getattr(browser, "cdp_url", None)
    if not cdp_url:
        raise RuntimeError("browser-use did not expose a CDP URL after browser.start()")

    print(f"[example] Browser started at {cdp_url}")

    agent = Agent(
        task="Go to books.toscrape.com and find the price of the first Travel book",
        llm=ChatOpenAI(model="gpt-4o"),
        browser=browser,
    )

    print("[example] Starting DBAR capture sidecar...")
    dbar_proc = subprocess.Popen(
        [
            "npx",
            "tsx",
            str(SIGNAL_DIR / "capture.ts"),
            cdp_url,
            str(SNAPSHOTS_DIR),
        ],
        cwd=str(SIGNAL_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Give the sidecar time to connect via CDP.
    time.sleep(3)

    try:
        print("[example] Running agent...")
        result = await agent.run(
            max_steps=20,
            on_step_end=on_step_end,
        )
        print(f"[example] Agent result: {result}")
    finally:
        # Signal DBAR to finish and write manifest even if the run errors.
        (SIGNAL_DIR / ".dbar-finish").touch()

        try:
            dbar_proc.wait(timeout=15)
        finally:
            if dbar_proc.stdout:
                output = dbar_proc.stdout.read().decode()
                print(f"[example] DBAR output:\n{output}")

        await agent.close()

    print(f"[example] Done. Check {SNAPSHOTS_DIR}/ for captured snapshots.")


if __name__ == "__main__":
    asyncio.run(main())
