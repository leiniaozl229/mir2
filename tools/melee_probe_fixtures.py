"""Pure ownership checks for protocol-created classic warrior fixtures."""
from datetime import datetime, timezone
import re

PROBE = "classic-warrior-melee-v1"


def validate_fixtures(manifest, prepared=False):
    if manifest.get("schemaVersion") != 1 or manifest.get("probe") != PROBE:
        raise ValueError("Unrecognized melee fixture manifest")
    fixtures = manifest.get("fixtures")
    if not isinstance(fixtures, list) or len(fixtures) != 2:
        raise ValueError("Exactly two isolated melee fixture identities are required")
    seen, roles = set(), set()
    for fixture in fixtures:
        account = fixture.get("account")
        if not isinstance(account, str) or not re.fullmatch(r"p[0-9a-f]{8}", account):
            raise ValueError("Fixture account is outside the isolated melee namespace")
        if fixture.get("character") != "P" + account[1:] or account in seen:
            raise ValueError("Invalid or repeated melee fixture identity")
        if fixture.get("role") not in ("attacker", "observer") or fixture["role"] in roles:
            raise ValueError("One attacker and one observer are required")
        created = datetime.fromisoformat(fixture["createdAt"].replace("Z", "+00:00"))
        if created.tzinfo is None or created > datetime.now(timezone.utc):
            raise ValueError("Fixture creation time must be valid and timezone-aware")
        if prepared and (manifest.get("cleaned") or not fixture.get("registered") or not fixture.get("characterCreated")):
            raise ValueError("Preparation requires uncleaned protocol-owned characters")
        seen.add(account); roles.add(fixture["role"])
    return fixtures
