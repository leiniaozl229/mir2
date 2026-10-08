#!/usr/bin/env python3
"""Read-only evidence audit of the full SQL catalogue; never filters world data.

Only --output writes a report. Sources are tracked files, not the active database
or .runtime/server. A contract classification is not a historical release claim.
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SQL = "vendor/openmir2/sql/mir2_data.sql"
ENVIR = "vendor/mirserver-data/Mir200/Envir"
NATIVE_MAGIC = "vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs"
NATIVE_BOOK = "vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs"
NATIVE_USE = "vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs"
NATIVE_FIND = "vendor/openmir2/src/GameSrv/Word/WorldServer.cs"
CLASSES = ("classical_supported", "explicit_extension", "unclassified_evidence")


def read_text(path: Path) -> str:
    data = path.read_bytes()
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("gb18030")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Evidence:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.sources: dict[str, dict] = {}

    def add(self, path: Path, kind: str, scope: str, line: int | None = None) -> dict:
        path = path.resolve()
        try:
            name = path.relative_to(self.root).as_posix()
        except ValueError:
            name = path.as_posix()
        if not path.is_file():
            raise FileNotFoundError(path)
        if name not in self.sources:
            self.sources[name] = {"path": name, "sha256": digest(path), "kind": kind}
        result = {"path": name, "sha256": self.sources[name]["sha256"],
                  "kind": kind, "scope": scope}
        if line is not None:
            result["line"] = line
        return result


def sql_values(text: str) -> list:
    result, cursor = [], 0
    escapes = {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "0": "\0", "Z": "\x1a"}
    while cursor < len(text):
        while cursor < len(text) and text[cursor].isspace():
            cursor += 1
        if cursor >= len(text):
            raise ValueError("Empty SQL value")
        if text[cursor] == "'":
            cursor += 1
            value = []
            closed = False
            while cursor < len(text):
                ch = text[cursor]
                cursor += 1
                if ch == "\\":
                    if cursor >= len(text):
                        raise ValueError("Truncated SQL escape")
                    value.append(escapes.get(text[cursor], text[cursor]))
                    cursor += 1
                elif ch == "'":
                    if cursor < len(text) and text[cursor] == "'":
                        value.append("'")
                        cursor += 1
                    else:
                        closed = True
                        break
                else:
                    value.append(ch)
            if not closed:
                raise ValueError("Unclosed SQL string")
            result.append("".join(value))
        else:
            end = text.find(",", cursor)
            end = len(text) if end < 0 else end
            value = text[cursor:end].strip()
            if value == "NULL":
                result.append(None)
            elif re.fullmatch(r"-?\d+", value):
                result.append(int(value))
            else:
                raise ValueError("Unsupported unquoted SQL scalar")
            cursor = end
        while cursor < len(text) and text[cursor].isspace():
            cursor += 1
        if cursor < len(text):
            if text[cursor] != "," or cursor + 1 == len(text):
                raise ValueError("Invalid SQL delimiter")
            cursor += 1
    return result


def parse_sql(text: str, tables=("stditems", "magics", "monsters")) -> dict[str, list[dict]]:
    """Parse the fixed single-row INSERT format, obtaining order from its DDL.

    A malformed or duplicate primary row fails loudly instead of reducing scope.
    Quoted numeric strings/NULL are distinct from numeric/NULL SQL scalars.
    """
    result = {}
    lines = text.splitlines()
    for table in tables:
        ddl = re.search(r"CREATE TABLE `" + re.escape(table) + r"`\s*\((.*?)\)\s*ENGINE", text, re.S)
        if not ddl:
            raise ValueError(f"Missing DDL: {table}")
        columns = [c.casefold() for c in re.findall(r"^\s*`([^`]+)`", ddl[1], re.M)]
        rows, seen = [], set()
        pattern = re.compile(r"^INSERT INTO `" + re.escape(table) + r"` VALUES \((.*)\);\s*$")
        for number, line in enumerate(lines, 1):
            if not line.startswith(f"INSERT INTO `{table}`"):
                continue
            match = pattern.match(line)
            if not match:
                raise ValueError(f"Unsupported INSERT: {table}:{number}")
            values = sql_values(match[1])
            if len(values) != len(columns):
                raise ValueError(f"Column mismatch: {table}:{number}")
            row = dict(zip(columns, values))
            key = row[columns[0]]
            if key in seen:
                raise ValueError(f"Duplicate primary key: {table}:{key}")
            seen.add(key)
            row["sourceLine"] = number
            rows.append(row)
        result[table] = rows
    return result


def magic_constants(text: str, reference=False) -> list[dict]:
    result, extension_line, documentation = [], None, []
    for number, line in enumerate(text.splitlines(), 1):
        # Record only the public SKILL declarations; never copy other constants.
        if reference and "以下1.8版以后技能" in line:
            extension_line = number
        if not reference and line.strip().startswith("///"):
            value = re.sub(r"<[^>]+>", "", line.strip()[3:]).strip()
            if value:
                documentation.append((number, value))
            continue
        match = re.search(r"\b(SKILL_[A-Z0-9_]+)\s*=\s*(\d+)\s*;\s*(?://\s*(.*))?", line)
        if match:
            result.append({"symbol": match[1], "magicId": int(match[2]),
                           "comment": (match[3] or " ".join(v for _, v in documentation)).strip(), "line": number,
                           "commentLine": documentation[0][0] if documentation else number,
                           "extensionDeclarationLine": extension_line if reference else None})
        if line.strip():
            documentation = []
    return result


def classify_skill(row, inputs, rules, native, reference) -> dict:
    magic_id, name = row["magid"], row["magname"]
    target = inputs.get(str(magic_id))
    nc = [c for c in native if c["magicId"] == magic_id]
    rc = [c for c in reference if c["magicId"] == magic_id]
    normal = bool(target and target["name"] == name)
    # An extension is proved only by an explicit reference declaration AND an
    # exact Chinese name in that declaration or the same native symbol/ID.
    # Mere ID range, hero names, missing icons or job/shape values are no proof.
    proof = next((r for r in rc if r["extensionDeclarationLine"] is not None
                  and (r["comment"] == name or any(n["symbol"] == r["symbol"]
                       and n["comment"] == name for n in nc))), None)
    classification = "classical_supported" if normal else "explicit_extension" if proof else "unclassified_evidence"
    pinned = rules.get(name)
    fields = {"magicId": "magid", "effectType": "effecttype", "effect": "effect",
              "spell": "spell", "power": "power", "maxPower": "maxpower",
              "defSpell": "defspell", "defPower": "defpower", "defMaxPower": "defmaxpower",
              "job": "job", "delay": "delay", "description": "descr"}
    parameter_diff = [k for k, v in (pinned or {}).items() if k in fields and row[fields[k]] != v]
    for key, columns in (("needLevels", ("needl1", "needl2", "needl3")),
                         ("trainLevels", ("l1train", "l2train", "l3train"))):
        if pinned and key in pinned and [row[c] for c in columns] != pinned[key]:
            parameter_diff.append(key)
    return {"classification": classification,
            "contractStatus": "input_supported" if normal else "contract_outside_scope",
            "versionStatus": "unknown",
            "classificationScope": "project classical input contract" if normal else
                "explicit reference 1.8+ declaration joined to exact identity; installed/historical release unknown" if proof else
                "insufficient evidence; outside input is not a historical exclusion",
            "rulePinned": bool(pinned), "ruleParameterDifferences": parameter_diff,
            "nativeDeclarations": nc, "referenceDeclarations": rc,
            "extensionProof": proof,
            "identityMismatch": bool(rc and not normal and not proof),
            "inputNameMismatch": target["name"] if target and not normal else None}


def parse_script(text: str) -> list[dict]:
    """Extract potential executable entrances, ignoring speech and comments.

    We retain the section and IF/ELSE/ACT context, not claim player reachability.
    BUY/GIVE item tokens are exact; ADDSKILL is a native skill entrance.
    """
    result, section, mode, condition_line = [], None, None, None
    for number, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith((";", "//")):
            continue
        label = re.match(r"^\[([^\]]+)\]", line)
        if label:
            section, mode, condition_line = label[1], None, None
            continue
        if line.startswith("#"):
            mode = line.split()[0].upper()
            if mode in {"#IF", "#ELSEIF"}:
                condition_line = number
            continue
        fields = line.split()
        if section and section.casefold() == "goods" and len(fields) >= 2:
            if re.fullmatch(r"\d+", fields[1]):
                result.append({"kind": "shop_stock", "name": fields[0], "quantity": int(fields[1]),
                               "line": number, "section": section, "mode": "goods"})
        elif mode in {"#ACT", "#ELSEACT"} and len(fields) >= 2:
            action = fields[0].upper()
            if action in {"GIVE", "ADDSKILL", "H.GIVE", "H.ADDSKILL"}:
                result.append({"kind": "npc_skill" if action.endswith("ADDSKILL") else "npc_item",
                               "command": action, "recipient": "hero" if action.startswith("H.") else "player",
                               "name": fields[1], "quantity": fields[2] if len(fields) > 2 else None,
                               "line": number, "section": section, "mode": mode,
                               "conditionLine": condition_line, "conditionsEvaluated": False})
    return result


def parse_drops(text: str) -> list[dict]:
    rows = []
    for number, line in enumerate(text.splitlines(), 1):
        match = re.match(r"^\s*(\d+)\s*/\s*(\d+)\s+(\S+)(?:\s+(\d+))?", line)
        if match:
            rows.append({"kind": "monster_drop", "name": match[3], "line": number,
                         "numerator": int(match[1]), "denominator": int(match[2]),
                         "quantity": int(match[4]) if match[4] else None})
    return rows


def parse_spawns(text: str, active_maps: set[str]) -> list[dict]:
    rows = []
    for number, line in enumerate(text.splitlines(), 1):
        fields = line.split()
        if len(fields) < 7 or fields[0].startswith((";", "//")):
            continue
        if all(re.fullmatch(r"\d+", fields[i]) for i in (1, 2, 4, 5, 6)):
            rows.append({"mapId": fields[0], "x": int(fields[1]), "y": int(fields[2]),
                         "monster": fields[3], "line": number,
                         "count": int(fields[5]), "mapInProfile": fields[0].casefold() in active_maps})
    return rows


def parse_mounts(text: str, fixed_npc=False) -> list[dict]:
    rows = []
    for number, line in enumerate(text.splitlines(), 1):
        fields = line.split()
        if len(fields) < 5 or fields[0].startswith((";", "//")):
            continue
        map_index = 2 if fixed_npc else 1
        if not all(re.fullmatch(r"\d+", fields[i]) for i in (map_index + 1, map_index + 2)):
            continue
        rows.append({"script": fields[0], "mapId": fields[map_index],
                     "x": int(fields[map_index + 1]), "y": int(fields[map_index + 2]),
                     "npcName": fields[0] if fixed_npc else fields[4], "line": number})
    return rows


def generated_assignments(text: str) -> dict[str, str]:
    """Read literal prepare-runtime P0 copy assignments via AST, without running it."""
    destinations, result = defaultdict(list), {}
    for node in ast.walk(ast.parse(text)):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            # f-strings are intentionally unresolved; never mistake their
            # partial literal prefix for an actual filename.
            value = node.value
            if isinstance(value, ast.BinOp) and isinstance(value.op, ast.Div) and isinstance(value.right, ast.Constant):
                path = value.right.value
                if isinstance(path, str) and path.startswith("Mir200/Envir/Market_Def/"):
                    destinations[node.targets[0].id].append((node.lineno, path))
    for node in ast.walk(ast.parse(text)):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "write_text":
            if not isinstance(node.func.value, ast.Name) or node.func.value.id not in destinations or not node.args:
                continue
            arg = node.args[0]
            if not isinstance(arg, ast.Call) or not isinstance(arg.func, ast.Name) or arg.func.id != "read_text":
                continue
            strings = [n.value for n in ast.walk(arg) if isinstance(n, ast.Constant) and isinstance(n.value, str)]
            source = next((s for s in strings if s.startswith("content/classic-176/p0/")), None)
            bindings = [(n, p) for n, p in destinations[node.func.value.id] if n < node.lineno]
            if source and bindings:
                result[max(bindings)[1]] = source
    return result


def load_city(root):
    path = root / "scripts/city_services.py"
    spec = importlib.util.spec_from_file_location("classic_boundary_city_services", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect_entrances(root: Path, evidence: Evidence, profile, sql_monsters: set[str]) -> tuple[list[dict], dict]:
    envir = root / ENVIR
    active = {s.casefold() for s in profile["p0Baseline"]["maps"]}
    map_info = envir / "MapInfo.txt"
    evidence.add(map_info, "server_source", "tracked MapInfo, not active runtime configuration")
    declared_maps = {m.casefold() for m in re.findall(r"^\s*\[([^\s\]|]+)", read_text(map_info), re.M)}
    mon_gen = envir / "MonGen.txt"
    evidence.add(mon_gen, "server_source", "tracked spawn definitions; profile membership only")
    spawns = parse_spawns(read_text(mon_gen), active)
    by_monster = defaultdict(list)
    for spawn in spawns:
        spawn["monsterInSQL"] = spawn["monster"] in sql_monsters
        by_monster[spawn["monster"]].append(spawn)
    city = load_city(root)
    evidence.add(root / "scripts/city_services.py", "source_review", "execute pure merchant filter and quest-only transform")
    prep = root / "scripts/prepare-runtime.py"
    evidence.add(prep, "source_review", "parse generated P0 literal copy bindings; no runtime preparation")
    mounts, entrances, unresolved_mounts, scanned_scripts = [], [], [], set()
    scripts = {p.relative_to(envir).as_posix().casefold(): p
               for folder in ("Market_Def", "Npc_def") for p in (envir / folder).glob("**/*.txt")}
    for filename, fixed in (("MerChant.txt", False), ("Npcs.txt", True)):
        source = envir / filename
        evidence.add(source, "server_source", "tracked NPC mounts")
        for mount in parse_mounts(read_text(source), fixed):
            mount.update({"definitionPath": source.relative_to(root).as_posix(),
                          "mapInProfile": mount["mapId"].casefold() in active,
                          "mapInTrackedMapInfo": mount["mapId"].casefold() in declared_maps})
            relative = f"{'Npc_def' if fixed else 'Market_Def'}/{mount['script']}-{mount['mapId']}.txt"
            script = scripts.get(relative.casefold())
            line = " ".join([mount["script"], mount["mapId"], str(mount["x"]), str(mount["y"]), mount["npcName"]])
            kept = True if fixed else city.normalize_merchant(line) is not None
            quest = not fixed and (mount["script"], mount["mapId"]) in city.QUEST_ONLY_SHOPS
            mount["routeTransform"] = "quest_only" if quest else "retained" if kept else "retired"
            mounts.append(mount)
            if not script:
                unresolved_mounts.append(mount)
                continue
            source_text = read_text(script)
            scanned_scripts.add(script)
            script_proof = evidence.add(script, "server_source", "NPC potential execution sections, not live reachability")
            route_rows = parse_script(city.quest_only_script(source_text) if quest else source_text) if kept else []
            route_keys = {(e["kind"], e["name"], e["section"]) for e in route_rows}
            for entry in parse_script(source_text):
                entry.update({"path": script_proof["path"], "sha256": script_proof["sha256"],
                              "mount": mount, "scope": "tracked_source",
                              "classicRoutePotential": mount["mapInProfile"] and kept and
                                   (entry["kind"], entry["name"], entry["section"]) in route_keys,
                              "liveVerified": False})
                entrances.append(entry)
    # MapQuest event bindings and all remaining scripts are also audited. A
    # discovered unmounted QManage/QFunction/copy file is retained as unresolved
    # evidence; filename presence alone never claims an active event callback.
    quest_file = envir / "MapQuest.txt"
    evidence.add(quest_file, "server_source", "tracked quest event bindings, conditions not evaluated")
    quest_bindings = defaultdict(list)
    for number, line in enumerate(read_text(quest_file).splitlines(), 1):
        fields = line.split()
        if len(fields) >= 6 and not fields[0].startswith((";", "//")):
            quest_bindings[fields[-1].casefold()].append({"mapId": fields[0], "line": number,
                "path": quest_file.relative_to(root).as_posix(), "monster": fields[3],
                "mapInProfile": fields[0].casefold() in active})
    remaining = [p for p in scripts.values() if p not in scanned_scripts]
    remaining += list((envir / "MapQuest_def").glob("**/*.txt"))
    for script in sorted(remaining):
        proof = evidence.add(script, "server_source", "unmounted script or potential MapQuest action; no active callback inference")
        bindings = quest_bindings.get(script.stem.casefold(), []) if script.parent.name.casefold() == "mapquest_def" else []
        for entry in parse_script(read_text(script)):
            entry.update({"path": proof["path"], "sha256": proof["sha256"],
                          "scope": "tracked_map_quest" if bindings else "source_unresolved_mount",
                          "questBindings": bindings,
                          "classicRoutePotential": any(b["mapInProfile"] for b in bindings),
                          "liveVerified": False})
            entrances.append(entry)
    # Track all drop files even when no exact source spawn can be linked.
    overridden_drops = {"骷髅", "掷斧骷髅", "骷髅战士", "骷髅战将", "骷髅精灵", "鹿"}
    for script in sorted((envir / "MonItems").glob("*.txt")):
        proof = evidence.add(script, "server_source", "exact drop filename to source monster/spawn; no suffix guess")
        monster_spawns = by_monster.get(script.stem, [])
        for entry in parse_drops(read_text(script)):
            entry.update({"path": proof["path"], "sha256": proof["sha256"], "monster": script.stem,
                          "spawnReferences": monster_spawns, "scope": "tracked_source",
                          "routeTransform": "replaced_by_p0_drop" if script.stem in overridden_drops else "retained",
                          "classicRoutePotential": script.stem not in overridden_drops and
                              any(s["mapInProfile"] and s["monsterInSQL"] and s["count"] > 0 for s in monster_spawns),
                          "liveVerified": False})
            entrances.append(entry)
    generated = generated_assignments(read_text(prep))
    generated_mounts = parse_mounts("\n".join(re.findall(r'fixtures\["Merchant.txt"\]\s*\+=\s*"([^"\n]+)"', read_text(prep))).replace("\\n", "\n"))
    generated_mounts.extend(parse_mounts("\n".join(city.service_definitions(set(profile["p0Baseline"]["maps"])))))
    city_stock = root / "content/classic-176/p0/city-general-merchant.txt"
    for mount in generated_mounts:
        destination = f"Mir200/Envir/Market_Def/{mount['script']}-{mount['mapId']}.txt"
        source_name = generated.get(destination)
        if mount["script"] == city.SHOP_SCRIPT:
            source_name = city_stock.relative_to(root).as_posix()
        if not source_name:
            continue  # Travel-only/generated guides carry no supplied items/skills.
        script = root / source_name
        proof = evidence.add(script, "contract", "generated P0 NPC source with literal/pure generator mount")
        for entry in parse_script(read_text(script)):
            entry.update({"path": proof["path"], "sha256": proof["sha256"], "mount": mount,
                          "scope": "generated_classic_route", "destination": destination,
                          "classicRoutePotential": mount["mapId"].casefold() in active,
                          "liveVerified": False})
            entrances.append(entry)
    # All declared P0 text is retained in the scan, including sources not bound
    # by the literal merchant assignments; those are NOT claimed as mounted.
    bound = set(generated.values()) | {city_stock.relative_to(root).as_posix()}
    for script in sorted((root / "content/classic-176/p0").glob("*.txt")):
        name = script.relative_to(root).as_posix()
        if name in bound:
            continue
        proof = evidence.add(script, "contract", "P0 source text, mounting unresolved by this static audit")
        rows = parse_drops(read_text(script)) if script.stem.endswith("-drops") else parse_script(read_text(script))
        for entry in rows:
            drop_monsters = {"skeleton-drops": ["骷髅", "掷斧骷髅", "骷髅战士", "骷髅战将"],
                             "skeleton-spirit-drops": ["骷髅精灵"], "deer-drops": ["鹿"]}.get(script.stem, [])
            drop_spawns = [s for m in drop_monsters for s in by_monster.get(m, [])]
            entry.update({"path": proof["path"], "sha256": proof["sha256"],
                          "scope": "generated_classic_drop" if drop_monsters else "p0_source_unresolved_mount",
                          "monsters": drop_monsters, "spawnReferences": drop_spawns,
                          "classicRoutePotential": bool(drop_monsters) and
                              any(s["mapInProfile"] and s["monsterInSQL"] and s["count"] > 0 for s in drop_spawns),
                          "liveVerified": False})
            entrances.append(entry)
    return entrances, {"profileMaps": len(active), "trackedMapInfoMaps": len(declared_maps),
                       "sourceSpawns": len(spawns), "sourceMounts": len(mounts),
                       "unresolvedNpcMounts": unresolved_mounts,
                       "exactSpawnDropRule": "literal monster name == drop filename; aliases not inferred",
                       "generatedP0Bindings": generated,
                       "scope": "static potential; no active config, condition graph, access or live reward proof"}


def build_audit(root: Path = ROOT, reference_root: Path | None = None) -> dict:
    root = root.resolve()
    evidence = Evidence(root)
    evidence.add(Path(__file__), "source_review", "audit generator implementation; no database/network operations")
    def contract(name):
        path = root / f"content/classic-176/{name}.json"
        evidence.add(path, "contract", "current project contract; not historical release attestation")
        return json.loads(read_text(path))
    profile = contract("version-profile")
    national = contract("national-gameplay")
    inputs = contract("skill-input")["skills"]
    rules = contract("skill-rules")["skills"]
    catalogue = contract("resource-catalog")
    sql_path = root / SQL
    sql_evidence = evidence.add(sql_path, "server_source", "full tracked fixed SQL; no database connection")
    tables = parse_sql(read_text(sql_path))
    native_path = root / NATIVE_MAGIC
    native = magic_constants(read_text(native_path))
    evidence.add(native_path, "server_source", "actual current engine magic IDs and exact declaration comments")
    reference = []
    reference_path = None
    if reference_root:
        reference_path = reference_root / "Common/Grobal2.pas"
        reference = magic_constants(read_text(reference_path), reference=True)
        evidence.add(reference_path, "reference_source", "SKILL declarations, including explicit 1.8+ block; same-version executable unproven")
    evidence.add(root / NATIVE_BOOK, "server_source", "ReadBook exact item-name to FindMagic, job/level/already-trained checks; Shape is not era proof")
    evidence.add(root / NATIVE_USE, "server_source", "StdMode4 invokes original ReadBook; no audit learns or grants books")
    evidence.add(root / NATIVE_FIND, "server_source", "FindMagic uses OrdinalIgnoreCase same-name matching, no hero prefix alias", 1559)
    entrances, topology = collect_entrances(root, evidence, profile, {m["name"] for m in tables["monsters"]})
    catalogue_items = {i["id"]: i for i in catalogue["items"]}
    catalogue_skills = {s["idx"]: s for s in catalogue["skills"]}
    if {r["id"] for r in tables["stditems"]} != set(catalogue_items):
        raise ValueError("Tracked SQL/catalog item primary IDs diverge")
    if {r["idx"] for r in tables["magics"]} != set(catalogue_skills):
        raise ValueError("Tracked SQL/catalog skill primary IDs diverge")
    skill_names, skills, item_names, items = defaultdict(list), [], defaultdict(list), []
    for row in tables["magics"]:
        cat = catalogue_skills[row["idx"]]
        if (row["magid"], row["magname"], row["effect"]) != (cat["magicId"], cat["name"], cat["effect"]):
            raise ValueError(f"Tracked SQL/catalog skill identity diverges: {row['idx']}")
        classification = classify_skill(row, inputs, rules, native, reference)
        skill = {"idx": row["idx"], "magicId": row["magid"], "name": row["magname"],
                 "job": row["job"], "effect": row["effect"], **classification,
                 "sourceEvidence": [{**sql_evidence, "line": row["sourceLine"]}],
                 "iconAvailable": bool(cat.get("iconUrl")), "iconDoesNotProveVersion": True,
                 "entranceIds": [], "bookItemIds": []}
        if classification["classification"] == "classical_supported":
            skill["sourceEvidence"].append(evidence.add(root / "content/classic-176/skill-input.json", "contract",
                "exact magicId and name are declared project classical inputs"))
            skill["sourceEvidence"].append(evidence.add(native_path, "server_source", "current native ID declarations"))
            if reference_path and classification["referenceDeclarations"]:
                skill["sourceEvidence"].append(evidence.add(reference_path, "reference_source", "reference matching ID declaration, not release date proof",
                    classification["referenceDeclarations"][0]["line"]))
        if classification["extensionProof"] and reference_path:
            skill["sourceEvidence"].append(evidence.add(reference_path, "reference_source",
                "explicit 1.8+ declaration for exact identity; runtime/historical release unknown",
                classification["extensionProof"]["extensionDeclarationLine"]))
            skill["sourceEvidence"].append(evidence.add(native_path, "server_source", "matching native symbol/ID identity"))
        if classification["rulePinned"]:
            skill["sourceEvidence"].append(evidence.add(root / "content/classic-176/skill-rules.json", "contract", "pinned parameters separately checked against fixed SQL"))
        skills.append(skill)
        skill_names[skill["name"]].append(skill)
    for row in tables["stditems"]:
        cat = catalogue_items[row["id"]]
        if (row["name"], row["imgindex"]) != (cat["name"], cat["imgIndex"]):
            raise ValueError(f"Tracked SQL/catalog item identity diverges: {row['id']}")
        books = skill_names.get(row["name"], []) if row["stdmode"] == 4 else []
        baseline = row["name"] in profile["p0Baseline"]["items"]
        classes = {s["classification"] for s in books}
        classification = "classical_supported" if baseline or classes == {"classical_supported"} else \
                         "explicit_extension" if classes == {"explicit_extension"} else "unclassified_evidence"
        item = {"id": row["id"], "name": row["name"], "stdMode": row["stdmode"], "shape": row["shape"],
                "looks": row["imgindex"], "classification": classification, "versionStatus": "unknown",
                "contractStatus": "baseline_item" if baseline else "classical_skill_book" if classification == "classical_supported" else "contract_outside_scope",
                "classificationScope": "project P0 whitelist or exact StdMode4 classical input book" if classification == "classical_supported" else
                     "exact StdMode4 book for explicitly declared extension skill; historical version unknown" if classification == "explicit_extension" else
                     "insufficient item era evidence; name, shape, missing pixels and source availability are not era proof",
                "sourceEvidence": [{**sql_evidence, "line": row["sourceLine"]}],
                "bookSkillIndexes": [s["idx"] for s in books],
                "unresolvedBookName": row["stdmode"] == 4 and not books,
                "iconAvailable": bool(cat.get("iconUrl")), "iconDoesNotProveVersion": True,
                "entranceIds": []}
        if baseline:
            item["sourceEvidence"].append(evidence.add(root / "content/classic-176/version-profile.json", "contract", "exact-name P0 item whitelist; historical release still unknown"))
        if books:
            item["sourceEvidence"].append(evidence.add(root / NATIVE_USE, "server_source", "StdMode4 actual book dispatch", 676))
            item["sourceEvidence"].append(evidence.add(root / NATIVE_BOOK, "server_source", "ReadBook exact-name FindMagic dispatch, not item shape", 2170))
            item["sourceEvidence"].append(evidence.add(root / NATIVE_FIND, "server_source", "FindMagic same-name OrdinalIgnoreCase matching", 1559))
        for skill in books:
            skill["bookItemIds"].append(item["id"])
            item["sourceEvidence"].extend(skill["sourceEvidence"][1:])
        items.append(item)
        item_names[item["name"]].append(item)
    linked, unresolved = [], []
    for number, entry in enumerate(entrances, 1):
        entry["id"] = number
        target_skills = skill_names.get(entry["name"], []) if entry["kind"] == "npc_skill" else []
        target_items = [] if entry["kind"] == "npc_skill" else item_names.get(entry["name"], [])
        entry["itemIds"] = [i["id"] for i in target_items]
        entry["skillIndexes"] = [s["idx"] for s in target_skills]
        entry["classifications"] = sorted({t["classification"] for t in target_skills + target_items})
        entry["versionStatus"] = "unknown"
        for target in target_skills + target_items:
            target["entranceIds"].append(number)
        # A skill book also exposes its actual exact-name learned skill.
        for item in target_items:
            for skill in skill_names.get(item["name"], []) if item["stdMode"] == 4 else []:
                skill["entranceIds"].append(number)
        (linked if target_skills or target_items else unresolved).append(entry)
    by_id = defaultdict(list)
    for skill in skills:
        by_id[skill["magicId"]].append(skill)
    duplicates = [{"magicId": ident, "rows": [{"idx": s["idx"], "name": s["name"], "effect": s["effect"]} for s in ss],
                   "effectConflict": len({s["effect"] for s in ss}) > 1}
                  for ident, ss in by_id.items() if len(ss) > 1]
    for skill in skills:
        skill["duplicateMagicId"] = len(by_id[skill["magicId"]]) > 1
        skill["duplicateEffectConflict"] = len({s["effect"] for s in by_id[skill["magicId"]]}) > 1
    def summary(rows):
        return {"total": len(rows), "classification": {c: sum(r["classification"] == c for r in rows) for c in CLASSES},
                "iconsAvailable": sum(r["iconAvailable"] for r in rows),
                "iconsMissing": sum(not r["iconAvailable"] for r in rows),
                "missingByClassification": {c: sum(r["classification"] == c and not r["iconAvailable"] for r in rows) for c in CLASSES}}
    result = {"schemaVersion": 1, "domain": "classic_version_boundary", "mode": "tracked_sources_read_only",
              "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
              "historicalVersionStatus": "unknown; no dated same-version database/client executable proof",
              "classificationDefinitions": {
                  "classical_supported": "explicit project P0/input support, not independently certified 2003 content",
                  "explicit_extension": "explicit reference 1.8+ declaration joined to exact native/SQL identity (or its StdMode4 book); beyond project classical input, installed/historical version unknown",
                  "unclassified_evidence": "insufficient direct evidence; outside contract scope alone cannot establish later history"},
              "sourceLocks": profile["sourceLocks"],
              "nationalPixelsScope": {"profileId": national.get("id"), "proof": "local asset provenance only; pixels do not date item/skill identities"},
              "summary": {"items": summary(items), "skills": summary(skills), "inputSkills": len(inputs),
                          "pinnedSkillRules": len(rules), "ruleParameterDifferences": sum(bool(s["ruleParameterDifferences"]) for s in skills),
                          "entrances": len(entrances), "unresolvedEntrances": len(unresolved),
                          "classicRouteExtensionEntrances": sum(e["classicRoutePotential"] and "explicit_extension" in e["classifications"] for e in entrances),
                          "classicRouteUnclassifiedEntrances": sum(e["classicRoutePotential"] and "unclassified_evidence" in e["classifications"] for e in entrances)},
              "topology": topology, "duplicateMagicIds": duplicates,
              "items": items, "skills": skills, "entrances": entrances,
              "sources": sorted(evidence.sources.values(), key=lambda s: s["path"]),
              "limitations": ["No SQL, database, active server configuration, runtime account or catalogue mutation.",
                  "No same-version native runtime/browser historical proof; all versionStatus fields remain unknown.",
                  "Potential NPC action sections retain conditions but this audit does not prove graph reachability or permissions.",
                  "Drop matching uses exact monster/spawn names; suffix/alias transformations remain unresolved.",
                  "P0 sources not bound by literal copies or explicit original drop replacement are scanned but marked unresolved.",
                  "Reference constants after the explicit 1.8+ declaration do not override SQL identity mismatches."]}
    payload = {k: v for k, v in result.items() if k != "generatedAtUtc"}
    result["contentSha256"] = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--reference-root", type=Path, help="GameOfMir directory; omit to retain unresolved reference evidence")
    parser.add_argument("--output", type=Path, help="write a new report; existing reports are never overwritten")
    args = parser.parse_args()
    if args.output and args.output.exists():
        parser.error("output exists; choose a new evidence archive filename")
    report = build_audit(args.root, args.reference_root)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print(json.dumps({"mode": report["mode"], "summary": report["summary"], "contentSha256": report["contentSha256"],
                      "output": str(args.output) if args.output else None}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
