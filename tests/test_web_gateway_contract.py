from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class WebGatewayContractTests(unittest.TestCase):
    def test_character_creation_honors_legacy_selection_throttle(self):
        source = (ROOT / "services/web-gateway/GatewaySession.cs").read_text()
        self.assertIn("CM_NEWCHR", source)
        self.assertIn("Task.Delay(TimeSpan.FromMilliseconds(1100), cancellation)", source)

    def test_pvp_probe_prefers_dedicated_fixture_pair(self):
        source = (ROOT / "tools/pvp_probe.mjs").read_text()
        self.assertIn(".runtime/pvp-attacker.json", source)
        self.assertIn(".runtime/pvp-victim.json", source)

    def test_castle_probe_keeps_default_path_non_mutating(self):
        source = (ROOT / "tools/castle_war_probe.mjs").read_text()
        self.assertIn("MIR2_CASTLE_EXPECT_LIST", source)
        self.assertIn("@requestcastlewarA", source)
        self.assertIn("startsWith('@requestcastlewarnow')", source)
        self.assertIn("castle-war.json", source)
        self.assertIn("qualificationResponse", source)

    def test_character_creation_probe_covers_empty_account_entry(self):
        source = (ROOT / "tools/character_creation_probe.mjs").read_text()
        for message_type in ("registrationResult", "characterCreationResult", "characters", "map"):
            self.assertIn(f"'{message_type}'", source)
        self.assertIn("createCharacter", source)
        self.assertIn("character-creation.json", source)

    def test_stability_probe_checks_reconnect_state(self):
        source = (ROOT / "tools/session_stability_probe.mjs").read_text()
        self.assertIn("mapGeneration", source)
        self.assertIn("report.reconnect = true", source)
        self.assertIn("session-stability.json", source)
        self.assertIn("durationMs > 7200000", source)
        for message_type in ("attributes", "equipment", "inventory", "skills"):
            self.assertIn(f"'{message_type}'", source)

    def test_trade_probe_verifies_both_sides_of_real_exchange(self):
        source = (ROOT / "tools/trade_probe.mjs").read_text()
        for message_type in ("tradeOpened", "tradeSuccess", "itemAdded"):
            self.assertIn(f"'{message_type}'", source)
        self.assertIn("senderTradeRemoval", source)
        self.assertIn("trade.json", source)

    def test_classic_window_exposes_social_and_world_panels(self):
        markup = (ROOT / "apps/web/play.html").read_text()
        source = (ROOT / "apps/web/src/play.ts").read_text()
        for tab in ("targets", "ground", "group", "attack", "guild", "trade"):
            self.assertIn(f'data-window-tab="{tab}"', markup)
            self.assertIn(f"id:'{tab}'", source)

    def test_movement_replay_covers_held_walk_and_run_cadence(self):
        source = (ROOT / "tools/movement_replay.mjs").read_text()
        self.assertIn("timedWalk", source)
        self.assertIn("timedRun", source)
        self.assertIn("replayTimedLine", source)
        self.assertIn("600", source)
        self.assertIn("400", source)

    def test_power_loss_probe_requires_recovery_and_saved_position(self):
        source = (ROOT / "tools/power_loss_probe.mjs").read_text()
        self.assertIn("kill", source)
        self.assertIn("restoredSavedState", source)
        self.assertIn("report.crashElapsedMs < 60000", source)
        self.assertIn("restartGameServices", source)


if __name__ == "__main__":
    unittest.main()
