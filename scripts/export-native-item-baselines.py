"""Export classic equipment base attributes for the verified windowed client tip."""

import argparse
import json
from pathlib import Path
import subprocess


FIELDS = ("ac", "mac", "dc", "mc", "sc")
LABELS = {"防御": "ac", "魔御": "mac", "攻击": "dc", "魔法": "mc", "道术": "sc"}
MODES = (5, 6, 10, 11, 15, 16, 19, 20, 21, 22, 23, 24, 26, 52, 54)


def export(mysql_exe: Path, option_file: Path, output: Path) -> int:
    columns = ["Name", "StdMode"]
    for field in FIELDS:
        columns.extend((field.capitalize(), field.capitalize() + "Max"))
    query = ("SELECT " + ",".join(columns) + " FROM stditems WHERE StdMode IN ("
             + ",".join(map(str, MODES)) + ")")
    result = subprocess.run(
        [str(mysql_exe), f"--defaults-extra-file={option_file}",
         "--default-character-set=utf8mb4", "--batch", "--raw", "--skip-column-names",
         "-D", "mir2_data", "--execute", query],
        check=True, capture_output=True,
    )
    items: dict[str, dict[str, list[int]]] = {}
    for line in result.stdout.decode("utf-8").splitlines():
        fields = line.split("\t")
        if len(fields) != len(columns) or not fields[0]:
            raise ValueError(f"Invalid stditems row: {line!r}")
        name_key = fields[0].encode("gbk").hex()
        stats = items.setdefault(name_key, {})
        for index, field in enumerate(FIELDS):
            minimum, maximum = (int(value) for value in fields[2 + index * 2:4 + index * 2])
            previous = stats.get(field, [0, 0])
            stats[field] = [max(previous[0], minimum), max(previous[1], maximum)]
    if not items:
        raise ValueError("No wearable stditems were found")
    labels = {label.encode("gbk").hex(): field for label, field in LABELS.items()}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"items": items, "labels": labels}, separators=(",", ":")),
                      encoding="utf-8")
    return len(items)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mysql-exe", type=Path, required=True)
    parser.add_argument("--option-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(f"Exported {export(args.mysql_exe, args.option_file, args.output)} equipment baselines.")


if __name__ == "__main__":
    main()
