from __future__ import annotations

import argparse
import sys

from src.explainability.builder import register_build_parser


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m src.cli")
    subparsers = parser.add_subparsers(dest="command")

    explainability = subparsers.add_parser("explainability", help="Explainability artifact tools")
    explainability_subparsers = explainability.add_subparsers(dest="explainability_command")

    build = explainability_subparsers.add_parser("build", help="Build cached explainability artifacts")
    register_build_parser(build)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    fn = getattr(args, "func", None)
    if fn is None:
        parser.print_help()
        return 2
    return int(fn(args))


if __name__ == "__main__":
    sys.exit(main())
