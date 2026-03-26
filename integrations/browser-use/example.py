"""
DBAR + browser-use integration example.

Demonstrates how to run a browser-use agent with DBAR deterministic capture,
then replay the capsule to verify determinism.

Prerequisites:
  pip install browser-use langchain-openai
  cd integrations/browser-use && npm install

Usage:
  python example.py
"""

import asyncio
import os
import subprocess
import time
from pathlib import Path

# browser-use imports (install via: pip install browser-use)
from browser_use import Agent, Browser, BrowserConfig
from langchain_openai import ChatOpenAI

# Directory where capsules are written
CAPSULES_DIR = Path(__file__).parent / "capsules"
STEP_SIGNAL = Path(__file__).parent / ".dbar-step"
FINISH_SIGNAL = Path(__file__).parent / ".dbar-finish"


def signal_step(label: str) -> None:
    """Write a step signal file for the DBAR capture process."""
    STEP_SIGNAL.write_text(label)
    # Allow the capture process time to detect and consume the signal.
    time.sleep(0.5)


def signal_finish() -> None:
    """Write a finish signal file for the DBAR capture process."""
    FINISH_SIGNAL.write_text("done")


async def main() -> None:
    # -------------------------------------------------------------------------
    # Step 1: Launch browser-use with remote debugging enabled
    # -------------------------------------------------------------------------
    CDP_PORT = 9222

    browser = Browser(
        config=BrowserConfig(
            chrome_instance_path=f"http://localhost:{CDP_PORT}",
            # Or let browser-use launch Chrome with remote debugging:
            # extra_chromium_args=[f"--remote-debugging-port={CDP_PORT}"],
        )
    )

    # -------------------------------------------------------------------------
    # Step 2: Start the DBAR capture process in the background
    # -------------------------------------------------------------------------
    print("[example] Starting DBAR capture process...")
    capture_process = subprocess.Popen(
        [
            "node",
            "--loader",
            "ts-node/esm",
            str(Path(__file__).parent / "capture.ts"),
            f"http://localhost:{CDP_PORT}",
            str(CAPSULES_DIR),
        ],
        cwd=str(Path(__file__).parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Give the capture process time to connect.
    time.sleep(2)

    # -------------------------------------------------------------------------
    # Step 3: Run the browser-use agent
    # -------------------------------------------------------------------------
    print("[example] Running browser-use agent...")
    llm = ChatOpenAI(model="gpt-4o")

    agent = Agent(
        task="Go to news.ycombinator.com and find the top story title",
        llm=llm,
        browser=browser,
    )

    # Run the agent. Signal DBAR at key points.
    signal_step("before-agent-run")
    result = await agent.run()
    signal_step("after-agent-run")

    print(f"[example] Agent result: {result}")

    # -------------------------------------------------------------------------
    # Step 4: Signal DBAR to finish and produce the capsule
    # -------------------------------------------------------------------------
    print("[example] Signaling DBAR to finish...")
    signal_finish()

    # Wait for the capture process to complete.
    capture_process.wait(timeout=30)

    if capture_process.stdout:
        output = capture_process.stdout.read().decode()
        print(f"[example] Capture output:\n{output}")

    # -------------------------------------------------------------------------
    # Step 5: Find the capsule and replay it
    # -------------------------------------------------------------------------
    capsules = sorted(CAPSULES_DIR.glob("capsule-*.json"))
    if not capsules:
        print("[example] No capsule found. Capture may have failed.")
        return

    latest_capsule = capsules[-1]
    print(f"[example] Replaying capsule: {latest_capsule}")

    replay_result = subprocess.run(
        [
            "node",
            "--loader",
            "ts-node/esm",
            str(Path(__file__).parent / "replay.ts"),
            str(latest_capsule),
        ],
        cwd=str(Path(__file__).parent),
        capture_output=True,
        text=True,
    )

    print(f"[example] Replay stdout (JSON):\n{replay_result.stdout}")
    print(f"[example] Replay stderr:\n{replay_result.stderr}")
    print(f"[example] Replay exit code: {replay_result.returncode}")

    await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
