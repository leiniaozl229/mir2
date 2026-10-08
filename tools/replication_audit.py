"""Validate the versioned replication ledger; counts measure tracking, never fidelity."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DOMAINS = {'ui': 'UI', 'gameplay': 'GAME', 'art': 'ART'}
STATUSES = {'missing', 'partial', 'implemented', 'verified'}
KINDS = {'native_pixels', 'native_runtime', 'reference_source', 'server_source', 'contract', 'source_review', 'unit_regression', 'live_protocol', 'browser_runtime', 'visual_comparison'}
RUNTIME_KINDS = {'native_runtime', 'live_protocol', 'browser_runtime', 'visual_comparison'}
MARKDOWN_STATUS_LABELS = {
    '缺失': 'missing',
    '部分实现': 'partial',
    '实现待完整验收': 'implemented',
    '已完整验证': 'verified',
}


def markdown_statuses(domain: str, text: str) -> dict[str, str]:
    """Read the inventory's canonical per-ID status index, not arbitrary mentions."""
    prefix = DOMAINS[domain]
    result: dict[str, str] = {}
    if domain in {'ui', 'gameplay'}:
        for line in text.splitlines():
            if not line.lstrip().startswith('|'):
                continue
            cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
            if len(cells) < 3:
                continue
            match = re.search(rf'\b{prefix}-\d{{3}}\b', cells[0])
            if not match:
                continue
            status_text = cells[1].strip().strip('`').strip() if domain == 'ui' else cells[2].strip()
            status = status_text if domain == 'ui' else MARKDOWN_STATUS_LABELS.get(status_text, '')
            if status in STATUSES:
                result[match.group(0)] = status
        return result

    lines = text.splitlines()
    for index, line in enumerate(lines):
        heading = re.match(rf'^###\s+({prefix}-\d{{3}})\b', line)
        if not heading:
            continue
        for detail in lines[index + 1:]:
            if detail.startswith('### '):
                break
            status = re.search(r'状态：\s*`(missing|partial|implemented|verified)`', detail)
            if status:
                result[heading.group(1)] = status.group(1)
                break
    return result


def audit(root: Path = ROOT) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    ids: set[str] = set()
    totals: Counter = Counter()
    domains: dict = {}

    def problem(owner: str, message: str):
        errors.append(f'{owner}: {message}')

    def path_exists(owner: str, value, kind=None):
        if not isinstance(value, str) or not value.strip():
            problem(owner, 'path must be a non-empty string')
            return
        p = Path(value)
        if p.is_absolute():
            if kind not in {'reference_source', 'native_pixels', 'native_runtime'}:
                problem(owner, 'absolute paths require external original/reference evidence kind')
            if not p.exists():
                problem(owner, f'evidence path does not exist: {value}')
            return
        if '..' in p.parts:
            problem(owner, f'repository paths cannot escape root: {value}')
        elif not (root / p).exists():
            problem(owner, f'path does not exist: {value}')

    for domain, prefix in DOMAINS.items():
        path = root / 'docs' / 'replication' / f'{domain}.json'
        try:
            data = json.loads(path.read_text(encoding='utf-8-sig'))
        except (OSError, ValueError) as exc:
            problem(domain, f'cannot read ledger: {exc}')
            continue
        if data.get('schemaVersion') != 1 or data.get('domain') != domain:
            problem(domain, 'invalid schemaVersion or domain')
        entries = data.get('requirements')
        if not isinstance(entries, list) or not entries:
            problem(domain, 'requirements must be a non-empty array')
            continue
        counts: Counter = Counter()
        domain_ids: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                problem(domain, 'requirement must be an object')
                continue
            ident = entry.get('id', '')
            if not isinstance(ident, str) or not re.fullmatch(rf'{prefix}-\d{{3}}', ident):
                problem(domain, f'invalid stable ID: {ident}')
                continue
            if ident in ids:
                problem(ident, 'duplicate ID')
            ids.add(ident)
            domain_ids.add(ident)
            if not isinstance(entry.get('title'), str) or not entry['title'].strip():
                problem(ident, 'title is required')
            status = entry.get('status')
            if not isinstance(status, str) or status not in STATUSES:
                problem(ident, f'invalid status: {status}')
                status = ''
            else:
                counts[status] += 1
                totals[status] += 1
            for field in ('acceptance', 'gaps', 'implementation'):
                values = entry.get(field)
                if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
                    problem(ident, f'{field} must be an array of non-empty strings')
                elif field == 'acceptance' and not values:
                    problem(ident, 'at least one specific acceptance scenario is required')
            for value in entry.get('implementation', []) if isinstance(entry.get('implementation'), list) else []:
                path_exists(ident, value)
            if status in {'partial', 'implemented', 'verified'} and not entry.get('implementation'):
                problem(ident, f'{status} requires an implementation path')
            if status in {'missing', 'partial'} and not entry.get('gaps'):
                problem(ident, f'{status} requires an explicit gap')
            evidence: dict[str, set[str]] = {}
            for field in ('sourceEvidence', 'verification'):
                evidence[field] = set()
                values = entry.get(field)
                if not isinstance(values, list):
                    problem(ident, f'{field} must be an array')
                    continue
                if field == 'sourceEvidence' and not values:
                    problem(ident, 'source/version basis is required, including proposed contract where unconfirmed')
                for item in values:
                    if not isinstance(item, dict):
                        problem(ident, f'{field} evidence must be an object')
                        continue
                    kind = item.get('kind')
                    if not isinstance(kind, str) or kind not in KINDS:
                        problem(ident, f'unknown evidence kind: {kind}')
                    else:
                        evidence[field].add(kind)
                    if not isinstance(item.get('scope'), str) or not item['scope'].strip():
                        problem(ident, 'evidence needs an exact scope and limitations')
                    path_exists(ident, item.get('path'), kind)
                    if isinstance(kind, str) and kind in RUNTIME_KINDS and isinstance(item.get('path'), str) and Path(item['path']).suffix in {'.ts', '.cs', '.py', '.mjs'}:
                        problem(ident, f'{kind} requires an execution report/capture, not source code')
            if status == 'verified':
                if entry.get('gaps'):
                    problem(ident, 'verified cannot have remaining gaps')
                if 'native_runtime' not in evidence['sourceEvidence'] | evidence['verification']:
                    problem(ident, 'verified requires target original executable evidence')
                if 'browser_runtime' not in evidence['verification']:
                    problem(ident, 'verified requires current browser interaction evidence')
                if domain in {'ui', 'art'} and 'visual_comparison' not in evidence['verification']:
                    problem(ident, 'verified visual detail requires original/browser comparison')
                all_evidence = [item for field in ('sourceEvidence', 'verification') for item in (entry.get(field) if isinstance(entry.get(field), list) else []) if isinstance(item, dict)]
                for item in all_evidence:
                    if isinstance(item.get('kind'), str) and item['kind'] in RUNTIME_KINDS and not all(item.get(k) for k in ('recordedAt', 'environment', 'sha256')):
                        problem(ident, 'verified runtime evidence needs recordedAt, environment and sha256')
                    digest = item.get('sha256')
                    if digest:
                        if not isinstance(digest, str) or not re.fullmatch('[a-fA-F0-9]{64}', digest):
                            problem(ident, 'invalid evidence sha256')
                        elif isinstance(item.get('path'), str):
                            proof = Path(item['path'])
                            if not proof.is_absolute():
                                proof = root / proof
                            if proof.is_file() and hashlib.sha256(proof.read_bytes()).hexdigest() != digest.lower():
                                problem(ident, 'evidence content differs from recorded sha256')
            elif not evidence['verification']:
                warnings.append(f'{ident}: no verification evidence yet')
        doc = root / 'docs' / f'{domain}-replication-inventory.md'
        try:
            markdown = doc.read_text(encoding='utf-8-sig')
            md_ids = set(re.findall(rf'\b{prefix}-\d{{3}}\b', markdown))
            if domain_ids != md_ids:
                problem(domain, f'Markdown/JSON IDs differ: markdown missing {sorted(domain_ids-md_ids)}, JSON missing {sorted(md_ids-domain_ids)}')
            md_statuses = markdown_statuses(domain, markdown)
            missing_statuses = domain_ids - set(md_statuses)
            if missing_statuses:
                problem(domain, f'Markdown status rows missing: {sorted(missing_statuses)}')
            for entry in entries:
                if not isinstance(entry, dict) or not isinstance(entry.get('id'), str):
                    continue
                ident = entry['id']
                markdown_status = md_statuses.get(ident)
                if markdown_status and entry.get('status') != markdown_status:
                    problem(ident, f'Markdown/JSON status differs: Markdown {markdown_status}, JSON {entry.get("status")}')
        except OSError as exc:
            problem(domain, f'cannot read inventory document: {exc}')
        domains[domain] = {'total': len(domain_ids), **{state: counts[state] for state in sorted(STATUSES)}}
    return {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'scope': 'ledger schema/references plus Markdown/JSON ID and per-ID status consistency; counts are not visual fidelity or acceptance percentages', 'ok': not errors, 'total': len(ids), 'counts': {state: totals[state] for state in sorted(STATUSES)}, 'domains': domains, 'errors': errors, 'warnings': warnings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', type=Path, help='optional local report (normally .runtime/reports/replication-audit.json)')
    args = parser.parse_args()
    result = audit()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
