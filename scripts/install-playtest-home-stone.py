#!/usr/bin/env python3
"""Install a consumable home stone for the local native-client playtest."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
STONE_ID = 1001
STONE_NAME = "回城石"
SOURCE_ID = 38  # The existing home scroll: StdMode=3, Shape=3, icon=402.


def mysql(executable: Path, option_file: Path, query: str) -> list[str]:
    result = subprocess.run(
        [str(executable), f"--defaults-extra-file={option_file}",
         "--default-character-set=utf8mb4", "--database=mir2_data",
         "--batch", "--skip-column-names", f"--execute={query}"],
        check=True, capture_output=True, text=True, encoding="utf-8",
    )
    return result.stdout.splitlines()


def install(executable: Path, option_file: Path) -> str:
    if not option_file.is_file():
        raise FileNotFoundError(option_file)
    name_hex = STONE_NAME.encode("utf-8").hex().upper()
    existing = mysql(
        executable, option_file,
        f"SELECT Id, HEX(Name), StdMode, Shape, ImgIndex FROM stditems "
        f"WHERE Id={STONE_ID} OR Name=CONVERT(0x{name_hex} USING utf8mb4)",
    )
    if existing:
        if existing != [f"{STONE_ID}\t{name_hex}\t3\t3\t402"]:
            raise RuntimeError(f"Item id {STONE_ID} or name {STONE_NAME} is already in use")
        return "Home stone already installed."

    source = mysql(executable, option_file,
                   f"SELECT StdMode, Shape, ImgIndex FROM stditems WHERE Id={SOURCE_ID}")
    if source != ["3\t3\t402"]:
        raise RuntimeError("The home scroll template differs from the verified item")
    columns = [line.split("\t", 1)[0] for line in mysql(
        executable, option_file, "SHOW COLUMNS FROM stditems")]
    if "Id" not in columns or "Name" not in columns:
        raise RuntimeError("stditems schema has no Id or Name column")
    quoted = ", ".join(f"`{column}`" for column in columns)
    selected = ", ".join(
        str(STONE_ID) if column == "Id" else
        f"CONVERT(0x{name_hex} USING utf8mb4)" if column == "Name" else
        f"`{column}`" for column in columns
    )
    mysql(executable, option_file,
          f"INSERT INTO stditems ({quoted}) SELECT {selected} FROM stditems "
          f"WHERE Id={SOURCE_ID} AND NOT EXISTS "
          f"(SELECT 1 FROM (SELECT Id, Name FROM stditems) AS current_items "
          f"WHERE Id={STONE_ID} OR Name=CONVERT(0x{name_hex} USING utf8mb4))")
    installed = mysql(executable, option_file,
                      f"SELECT Id, HEX(Name), StdMode, Shape, ImgIndex FROM stditems WHERE Id={STONE_ID}")
    if installed != [f"{STONE_ID}\t{name_hex}\t3\t3\t402"]:
        raise RuntimeError("Home stone could not be verified after insertion")
    return "Installed consumable home stone as item 1001."


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mysql-exe", type=Path, default=shutil.which("mysql"))
    parser.add_argument("--option-file", type=Path,
                        default=ROOT / ".runtime/mysql-client.ini")
    args = parser.parse_args()
    if args.mysql_exe is None:
        parser.error("mysql is not on PATH; pass --mysql-exe")
    print(install(Path(args.mysql_exe), args.option_file.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
