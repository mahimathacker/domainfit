"""Resumable orchestration for the DomainFit Nugen workflow."""

from __future__ import annotations

import argparse
import importlib

from scripts.nugen.state import StateStore

STAGES = [
    ("verify", "scripts.nugen.00_verify_account"),
    ("prepare", "scripts.nugen.01_prepare_dataset"),
    ("upload", "scripts.nugen.02_upload_documents"),
    ("benchmark", "scripts.nugen.03_generate_benchmark"),
    ("review", "scripts.nugen.04_review_benchmark"),
    ("benchmark-upload", "scripts.nugen.05_upload_benchmark"),
    ("alignment", "scripts.nugen.06_create_alignment"),
    ("monitor", "scripts.nugen.07_monitor_alignment"),
    ("deployment", "scripts.nugen.08_deploy_model"),
    ("inference", "scripts.nugen.09_test_inference"),
]
ALIASES = {"documents": "upload", "alignment": "monitor"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--through", choices=[name for name, _ in STAGES] + list(ALIASES))
    parser.add_argument("--confirm-align", action="store_true")
    parser.add_argument("--confirm-deploy", action="store_true")
    args = parser.parse_args()
    target = ALIASES.get(args.through, args.through) if args.through else STAGES[-1][0]
    state = StateStore().load()
    for name, module_name in STAGES:
        completed = name in state.completed_steps
        if name == "alignment":
            completed = "alignment-created" in state.completed_steps
        elif name == "monitor":
            completed = "alignment-ready" in state.completed_steps
        if completed:
            print(f"Skipping completed step: {name}")
        else:
            if name == "alignment" and not args.confirm_align:
                raise SystemExit("Use --confirm-align before the alignment stage")
            if name == "deployment" and not args.confirm_deploy:
                raise SystemExit("Use --confirm-deploy before the deployment stage")
            module = importlib.import_module(module_name)
            if name in {"alignment", "deployment"}:
                import sys

                previous = sys.argv
                sys.argv = [module_name, "--confirm"]
                try:
                    module.main()
                finally:
                    sys.argv = previous
            else:
                module.main()
            state = StateStore().load()
        if name == target:
            break


if __name__ == "__main__":
    main()

