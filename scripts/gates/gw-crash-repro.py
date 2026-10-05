"""D5 reproduction: does building a bot agent in a worker thread freeze the asyncio loop of the SAME process?

Mirrors the gateway at 2026-10-05 08:01:11 (POST /p/pc-59bd3c1d/v1/runs): same interpreter (Hermes tools Python 3.14.7),
same HERMES_HOME + per-profile context override, same build path (gateway.run runtime resolution -> AIAgent(...)
-> agent._build_system_prompt), run via loop.run_in_executor like api_server_runs._submit_api_worker.
NO LLM call, NO tool execution, NO session DB. A probe on the loop measures stalls every 50 ms; if the loop is
stalled > STALL_DUMP_S, faulthandler (C thread, works while the GIL is held) dumps every thread's stack to a file.

  <tools python> scripts/gates/gw-crash-repro.py <out-dir> [profile]
"""
import asyncio
import faulthandler
import json
import os
import sys
import threading
import time
from pathlib import Path

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PROFILE = sys.argv[2] if len(sys.argv) > 2 else "pc-59bd3c1d"
HOME = Path(os.environ["HERMES_HOME"])
STALL_DUMP_S = 2.0
steps = []                      # (t, thread, label)
T0 = time.monotonic()


def mark(label):
    steps.append((round(time.monotonic() - T0, 3), threading.current_thread().name, label))


def build():
    from hermes_constants import set_hermes_home_override, reset_hermes_home_override
    tok = set_hermes_home_override(HOME / "profiles" / PROFILE)
    try:
        mark("import gateway.run")
        from gateway.run import (_resolve_runtime_agent_kwargs, _resolve_gateway_model, _load_gateway_config,
                                 _current_max_iterations)
        from hermes_cli.tools_config import _get_platform_tools
        mark("import run_agent")
        from run_agent import AIAgent
        mark("resolve runtime")
        rk = _resolve_runtime_agent_kwargs()
        model = rk.pop("model", None) or _resolve_gateway_model()
        rk.pop("_fallback_notice", None)
        toolsets = sorted(_get_platform_tools(_load_gateway_config(), "api_server"))
        mark("AIAgent(...)")
        agent = AIAgent(model=model, **rk, max_iterations=_current_max_iterations(), quiet_mode=True,
                        verbose_logging=False, enabled_toolsets=toolsets, session_id=f"diag-gwcrash-{int(time.time())}",
                        platform="api_server", session_db=None)
        mark("_build_system_prompt")
        prompt = agent._build_system_prompt(None)
        mark(f"done prompt_chars={len(prompt)}")
        return len(prompt)
    finally:
        reset_hermes_home_override(tok)


async def main():
    loop = asyncio.get_running_loop()
    dump = open(OUT / "stall-stacks.txt", "w", encoding="utf-8")
    stalls, last = [], time.monotonic()
    done = asyncio.Event()

    async def probe():
        nonlocal last
        while not done.is_set():
            faulthandler.dump_traceback_later(STALL_DUMP_S, repeat=True, file=dump)  # re-armed while the loop runs
            await asyncio.sleep(0.05)
            now = time.monotonic()
            gap = now - last - 0.05
            if gap > 0.5:
                stalls.append((round(last - T0, 3), round(gap, 3)))
            last = now
        faulthandler.cancel_dump_traceback_later()

    p = asyncio.create_task(probe())
    await asyncio.sleep(0.5)
    mark("submit to executor")
    try:
        n = await asyncio.wait_for(loop.run_in_executor(None, build), timeout=240)
        result = {"ok": True, "prompt_chars": n}
    except Exception as e:  # noqa: BLE001
        result = {"ok": False, "error": f"{type(e).__name__}: {e}"[:400]}
    done.set(); await p
    dump.close()
    report = {"python": sys.version.split()[0], "profile": PROFILE, "result": result,
              "steps": steps, "loop_stalls_over_0_5s": stalls,
              "max_stall_s": max([g for _, g in stalls], default=0.0),
              "total_stall_s": round(sum(g for _, g in stalls), 3),
              "stack_dump_bytes": (OUT / "stall-stacks.txt").stat().st_size}
    (OUT / "repro.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("python", "result", "max_stall_s", "total_stall_s", "stack_dump_bytes")}))
    print("REPRO_DONE")

asyncio.run(main())
os._exit(0)   # do not wait on non-daemon threads (MCP etc.) the agent may have started
