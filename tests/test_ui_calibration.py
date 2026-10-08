from pathlib import Path
from html.parser import HTMLParser
import json
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CalibrationMarkup(HTMLParser):
    """Inspect real page controls without assuming dynamically created dialogs are static HTML."""

    def __init__(self, markup):
        super().__init__()
        self.elements = []
        self.options = {}
        self.select = None
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        self.elements.append((tag, attributes))
        if tag == "select":
            self.select = attributes.get("id")
            self.options[self.select] = []
        elif tag == "option" and self.select is not None:
            self.options[self.select].append(attributes.get("value"))

    def handle_endtag(self, tag):
        if tag == "select":
            self.select = None

    def one(self, attribute, value):
        matches = [(tag, attrs) for tag, attrs in self.elements if attribute in attrs and attrs[attribute] == value]
        if len(matches) != 1:
            raise AssertionError(f"Expected one [{attribute}={value}], got {len(matches)}")
        return matches[0]


class UiCalibrationTests(unittest.TestCase):
    def test_national_item_quickbar_uses_the_native_pockets_as_its_visible_skin(self):
        interactions = json.loads((ROOT / "content/classic-176/ui-interactions.json").read_text(encoding="utf-8"))
        css = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")
        quickbar = interactions["controls"]["hud.itemQuickBar.slot"]
        self.assertEqual(quickbar["normal"], 1)
        self.assertEqual(quickbar["hover"], "css-translucent-pocket-tint")
        self.assertEqual(quickbar["pressed"], "css-pressed-pocket-tint")
        self.assertEqual(quickbar["selected"], "not-applicable")
        self.assertEqual(quickbar["disabled"], "css-opacity")
        match = re.search(r"body\.classic-play #classic-hud \.item-quickbar-slot\{([^}]+)\}", css)
        self.assertIsNotNone(match)
        normal = match.group(1)
        self.assertIn("border:0", normal)
        self.assertIn("background:transparent", normal)
        self.assertIn("box-shadow:none", normal)
        self.assertIn("item-quickbar-slot:hover", css)
        self.assertIn("item-quickbar-slot:active", css)

    def test_calibration_page_is_in_production_build_inputs(self):
        page = ROOT / "apps/web/ui-calibration.html"
        config = (ROOT / "apps/web/vite.config.ts").read_text(encoding="utf-8")
        self.assertTrue(page.is_file())
        self.assertIn("apps/web/ui-calibration.html", config)
        self.assertIn('/src/ui-calibration.ts', page.read_text(encoding="utf-8"))

    def test_classic_play_hides_the_out_of_stage_chat_duplicate(self):
        css = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/play.html").read_text(encoding="utf-8")
        play = (ROOT / "apps/web/src/play.ts").read_text(encoding="utf-8")
        self.assertIn('body.classic-play main>.chat-panel', css)
        self.assertIn('section class="chat-panel" aria-label="聊天"', markup)
        self.assertIn('class="hud-chat" data-hud-chat', markup)
        self.assertIn('body.classic-play #classic-hud.national-ui .hud-chat', css)
        self.assertLess(play.index("hudChat.append(chatPanel);"), play.index("const view=await createMapView"))

    def test_calibration_uses_locked_800_by_600_layout(self):
        layout = json.loads((ROOT / "content/classic-176/ui-layout.json").read_text(encoding="utf-8"))
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        stage = (ROOT / "apps/web/src/classic-stage.ts").read_text(encoding="utf-8")
        self.assertEqual(layout["canvas"], {"width": 800, "height": 600})
        self.assertIn("new ClassicStage(frame,content)", source)
        self.assertEqual(layout["nationalInventoryGrid"]["originX"], 18)
        self.assertEqual(layout["nationalInventoryGrid"]["originY"], 14)
        self.assertEqual(layout["nationalHud"]["mainDialog"]["y"], 349)
        self.assertEqual(layout["nationalHud"]["mainDialog"]["evidence"], "asset")
        self.assertEqual((layout["itemQuickBar"]["x"], layout["itemQuickBar"]["y"], layout["itemQuickBar"]["slotStep"]), (285, 59, 43))
        self.assertEqual(layout["nationalInventoryWindow"]["index"], 3)
        self.assertEqual(layout["nationalCharacterWindow"]["index"], 370)
        helper = (ROOT / "apps/web/src/classic-layout.ts").read_text(encoding="utf-8")
        hud = (ROOT / "apps/web/src/classic-hud.ts").read_text(encoding="utf-8")
        css = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")
        self.assertIn("applyNationalHudLayout", helper)
        self.assertIn("applyNationalHudLayout", hud)
        self.assertIn("applyNationalInventoryLayout", hud)
        self.assertIn("applyNationalCharacterLayout", hud)
        self.assertNotIn("left:286px!important", css)
        self.assertNotIn("left:207px!important", css)
        self.assertNotIn("left:12px!important", css)
        self.assertNotIn("7.c0ab139c0ca9ba48.png", css)
        self.assertIn("CLASSIC_STAGE={width:800,height:600}", stage)
        for scene in ("login", "select", "create", "hud", "character", "inventory", "npc", "shop", "repair", "storage", "quest", "attack", "targets", "ground", "group", "guild", "system", "chat", "trade"):
            self.assertIn(f'data-scene="{scene}"', (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8"))
        self.assertEqual(layout["nationalWindowContracts"]["chat"]["content"], "channel-log-and-input")
        self.assertEqual(layout["nationalWindowContracts"]["trade"]["content"], "paired-local-remote-offer-grids-and-confirmation")
        self.assertEqual(layout["nationalWindowContracts"]["trade"]["frame"], "prguse#389+390")
        self.assertEqual(layout["nationalWindowContracts"]["quest"]["content"], "quest-progress-list")
        self.assertEqual(layout["nationalWindowContracts"]["attack"]["content"], "attack-mode-select")
        self.assertEqual(layout["nationalWindowContracts"]["system"]["content"], "modal-confirmation")
        for kind in ("targets", "ground"):
            self.assertEqual(layout["nationalWindowContracts"][kind]["frame"], "prguse#402")

    def test_party_and_guild_windows_use_their_native_frames_without_losing_controls(self):
        layout = json.loads((ROOT / "content/classic-176/ui-layout.json").read_text(encoding="utf-8"))
        source = (ROOT / "apps/web/src/classic-hud.ts").read_text(encoding="utf-8")
        css = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")
        play = (ROOT / "apps/web/play.html").read_text(encoding="utf-8")
        calibration = (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8")
        windows = layout["nationalUtilityWindows"]
        self.assertEqual((windows["group"]["index"], windows["group"]["width"], windows["group"]["height"]), (120, 276, 242))
        self.assertEqual((windows["guild"]["index"], windows["guild"]["width"], windows["guild"]["height"]), (180, 628, 453))
        self.assertEqual(windows["guild"]["padding"], "30px 44px 10px 12px")
        self.assertEqual((windows["guild"]["x"], windows["guild"]["y"]), (0, -3))
        self.assertIn("TFrmDlg.ShowGuildDlg sets Left=0, Top=-3", windows["guild"]["placementEvidence"])
        guild_start = calibration.index('id="calibration-guild-panel"')
        guild_markup = calibration[guild_start:calibration.index("</section>", guild_start)]
        self.assertIn('<strong>行会</strong><button type="button" class="classic-window-close"', guild_markup)
        self.assertNotIn('<div class="calibration-window-heading">', guild_markup)
        self.assertEqual((windows["guild"]["scrollButtons"]["stepRows"], windows["guild"]["scrollButtons"]["lineHeight"]), (3, 14))
        self.assertEqual((windows["guild"]["scrollButtons"]["up"]["x"], windows["guild"]["scrollButtons"]["up"]["y"], windows["guild"]["scrollButtons"]["down"]["y"]), (588, 230, 280))
        self.assertEqual((windows["group"]["x"] * 2 + windows["group"]["width"], windows["group"]["y"] * 2 + windows["group"]["height"]), (800, 600))
        self.assertEqual(layout["nationalWindowContracts"]["group"]["frame"], "prguse#120")
        self.assertEqual(layout["nationalWindowContracts"]["guild"]["frame"], "prguse#180")
        self.assertIn("layout.nationalUtilityWindows.group.index", source)
        self.assertIn("layout.nationalUtilityWindows.guild.index", source)
        self.assertIn("layout.nationalUtilityWindows.guild.scrollButtons", source)
        self.assertIn("element.style.setProperty('--classic-window-padding',spec.padding)", source)
        self.assertIn('.national-window[data-window-kind=group].group-panel>strong', css)
        self.assertIn('.national-window[data-window-kind=guild]>strong:first-child{display:none}', css)
        self.assertIn("--classic-window-background", source)
        self.assertIn("--classic-window-width", css)
        self.assertIn("background-image:var(--classic-window-background", css)
        self.assertIn("padding:var(--classic-window-padding,0px)!important", css)
        for control in ("group-mode", "group-create", "group-add", "group-remove", "group-members"):
            self.assertIn(f'id="{control}"', play)
        for control in ("guild-open", "guild-members-request", "guild-create", "guild-add", "guild-remove", "guild-war-request", "guild-castle-dialogue", "guild-notice-save", "guild-ally", "guild-break-ally", "guild-ranks-save", "guild-members"):
            self.assertIn(f'id="{control}"', play)
        calibration_controls = CalibrationMarkup(calibration)
        play_controls = CalibrationMarkup(play)
        party = re.search(r'<section id="calibration-group-panel"[\s\S]*?</section>', calibration)
        self.assertIsNotNone(party)
        self.assertNotRegex(party.group(0), r"<input\b", "calibration must match the production party window without a permanent name field")
        for control in ("group-mode", "group-create", "group-add", "group-remove", "group-feedback", "group-members"):
            self.assertEqual(calibration_controls.one("id", control)[0], "button" if control.startswith("group-") and control != "group-feedback" and control != "group-members" else "span" if control == "group-feedback" else "ol")
        self.assertIn("systemDialog.showInput", (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8"))
        self.assertIn("groupPrompts", (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8"))
        for control in ("guild-open", "guild-members-request", "guild-create", "guild-add", "guild-remove", "guild-war-request", "guild-castle-dialogue", "guild-notice-save", "guild-ally", "guild-break-ally", "guild-ranks-save"):
            self.assertEqual(calibration_controls.one("id", control)[0], "button")
        for control in ("guild-scroll-up", "guild-scroll-down"):
            fixture_tag, fixture_attrs = calibration_controls.one("id", control)
            production_tag, production_attrs = play_controls.one("id", control)
            self.assertEqual((fixture_tag, production_tag), ("button", "button"))
            self.assertEqual(fixture_attrs["aria-controls"], "guild-members")
            self.assertEqual(production_attrs["aria-controls"], "guild-members")
        self.assertEqual(calibration_controls.one("id", "guild-members")[0], "ol")
        self.assertIn('data-group-action="新建队伍"', calibration)
        self.assertIn('class="guild-window-roster"', play)
        self.assertIn('class="guild-window-admin"', play)
        self.assertIn('[data-group-action="邀请加入"]', css)
        self.assertIn('.guild-management{display:flex', css)
        self.assertIn("guild-native-scroll:focus-visible", css)

    def test_trade_window_uses_the_native_pair_and_keeps_the_server_controls(self):
        layout = json.loads((ROOT / "content/classic-176/ui-layout.json").read_text(encoding="utf-8"))
        source = (ROOT / "apps/web/src/classic-hud.ts").read_text(encoding="utf-8")
        play_source = (ROOT / "apps/web/src/play.ts").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/play.html").read_text(encoding="utf-8")
        css = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")
        trade = layout["nationalUtilityWindows"]["trade"]
        self.assertEqual((trade["index"], trade["width"], trade["height"], trade["x"], trade["y"]), (389, 236, 175, 564, 0))
        self.assertEqual((trade["remote"]["index"], trade["remote"]["left"], trade["remote"]["width"]), (390, -220, 220))
        self.assertEqual((trade["grid"]["columns"], trade["grid"]["rows"], trade["grid"]["cellWidth"], trade["grid"]["cellHeight"]), (5, 2, 36, 33))
        self.assertIn("layout.nationalUtilityWindows.trade.remote", source)
        self.assertIn("layout.nationalUtilityWindows.trade.confirm.index", source)
        for control in ("trade-request-form", "trade-local-items", "trade-remote-items", "trade-gold", "trade-set-gold", "trade-accept", "trade-cancel"):
            self.assertIn(f'id="{control}"', markup)
        self.assertIn("tradeIconAssets", play_source)
        self.assertIn("showClassicWindow('trade')", play_source)
        self.assertIn("tradeCancel.click()", play_source)
        self.assertIn("#trade-remote-items", css)
        self.assertIn("left:-199px", css)
        self.assertIn("overflow:visible", css)

    def test_calibration_can_load_reference_without_writing_workspace_files(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8")
        self.assertIn("FileReader", source)
        self.assertIn("readAsDataURL", source)
        self.assertIn("reference-opacity", markup)
        self.assertEqual(markup.count('id="calibration-status-message"'), 1)
        self.assertNotIn("writeFile", source)

    def test_calibration_mounts_the_same_production_component_ids(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8")
        for element_id in ("paperdoll-actor", "equipment-items", "character-panel", "character-state", "skills", "inventory-items", "item-tooltip-layer", "item-tooltip", "npc-dialog", "shop-panel", "repair-panel", "storage-panel", "calibration-quest-panel", "calibration-attack-panel", "calibration-targets-panel", "calibration-ground-panel", "calibration-group-panel", "calibration-guild-panel", "classic-modal-layer", "calibration-chat-panel", "calibration-trade-panel"):
            self.assertIn(f'id="{element_id}"', markup)
            if element_id not in ("skills", "item-tooltip-layer", "item-tooltip"):
                self.assertIn(f"#{element_id}", source)
        production = (ROOT / "apps/web/play.html").read_text(encoding="utf-8")
        css = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")
        self.assertIn('id="item-tooltip-layer"', production)
        self.assertIn('id="item-tooltip"', production)
        self.assertIn("#calibration-stage-frame>#item-tooltip-layer", css)
        self.assertIn("#viewport-shell>#item-tooltip-layer", css)
        self.assertNotIn("nationalScenes", source)
        self.assertNotIn("npc-window", markup)

    def test_calibration_mounts_windows_and_keyboard_close_route(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        window_stack = (ROOT / "apps/web/src/window-drag.ts").read_text(encoding="utf-8")
        for window_id in ("character-window", "inventory-window", "npc-dialog", "shop-panel", "repair-panel", "storage-panel", "calibration-quest-panel", "calibration-attack-panel", "calibration-targets-panel", "calibration-ground-panel", "calibration-group-panel", "calibration-guild-panel", "calibration-chat-panel", "calibration-trade-panel"):
            self.assertIn(f"'{window_id}'", source)
        # Escape policy, each button's own-window close and cleanup execute in
        # classic_input_regression.mjs; manual close must not require Escape routing.
        self.assertIn("closeTop:closeCalibrationTopWindow", source)
        self.assertNotIn("closeTop:()=>undefined", source)
        self.assertIn("restoreWindowFocus(next.element)", window_stack)
        self.assertIn("bringClassicWindowToFront(element)", source)

    def test_calibration_exposes_service_window_fixtures(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8")
        for component in ("ShopView", "RepairView", "StorageView"):
            self.assertIn(component, source)
        for scene in ("shop", "repair", "storage", "quest", "attack", "targets", "ground", "group", "guild", "system", "chat", "trade"):
            self.assertIn(f'data-scene="{scene}"', markup)
        for panel in ("shop-panel", "repair-panel", "storage-panel", "calibration-quest-panel", "calibration-attack-panel", "calibration-targets-panel", "calibration-ground-panel", "calibration-group-panel", "calibration-guild-panel", "classic-modal-layer", "calibration-chat-panel", "calibration-trade-panel"):
            self.assertIn(f'id="{panel}"', markup)

    def test_calibration_system_preview_uses_the_production_dialog_and_all_contract_variants(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8")
        play = (ROOT / "apps/web/src/play.ts").read_text(encoding="utf-8")
        controller = (ROOT / "apps/web/src/system-dialog.ts").read_text(encoding="utf-8")
        contract = json.loads((ROOT / "content/classic-176/system-dialog.json").read_text(encoding="utf-8"))
        controls = CalibrationMarkup(markup)
        controls.one("id", "classic-modal-layer")
        self.assertNotIn('id="calibration-system-panel"', markup)
        self.assertNotIn("#calibration-system-panel", source)
        self.assertIn("from './system-dialog'", source)
        self.assertIn("from './system-dialog'", play)
        self.assertEqual(source.count("new SystemDialogController("), 1)
        self.assertIn("new SystemDialogController(document.querySelector<HTMLElement>('#classic-modal-layer')!,content,", source)
        self.assertIn("import './system-dialog.css'", controller)
        self.assertEqual(set(controls.options["system-dialog-size"]), {"horizontal", "vertical", "small"})
        self.assertEqual(set(controls.options["system-dialog-size"]), set(contract["variants"]))
        combinations = {tuple(option.split(",")) for option in controls.options["system-dialog-buttons"]}
        self.assertEqual(combinations, {("ok", "cancel"), ("ok",), ("yes", "no"), ("ok", "yes", "no", "cancel")})
        self.assertEqual({button for combination in combinations for button in combination}, set(contract["buttons"]))
        self.assertEqual(controls.one("id", "system-dialog-preview")[1]["type"], "button")
        preview = re.search(r"function previewSystemDialog\(\)\{(.*?)\n\}", source, re.S).group(1)
        self.assertIn("'#system-dialog-size'", preview)
        self.assertIn("'#system-dialog-buttons'", preview)
        self.assertIn(".value.split(',')", preview)
        self.assertIn("size,buttons", preview)
        self.assertIn("systemDialog.show(", preview)
        self.assertIn(".then(result=>", preview)
        self.assertIn("'#calibration-status-message'", preview)
        self.assertIn("!.onclick=previewSystemDialog", source)
        self.assertIn("else if(screenName==='system'){\n  previewSystemDialog();", source)
        hide = re.search(r"function hideContent\(\)\{(.*?)\n\}", source, re.S).group(1)
        self.assertIn("systemDialog.interrupt()", hide)
        self.assertNotIn("hud.skinWindow(window,'system')", source)

    def test_calibration_password_fixture_matches_the_production_fields_without_sending_credentials(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        controls = CalibrationMarkup((ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8"))
        play_controls = CalibrationMarkup((ROOT / "apps/web/play.html").read_text(encoding="utf-8"))
        contract = json.loads((ROOT / "content/classic-176/auth-actions.json").read_text(encoding="utf-8"))
        self.assertEqual(controls.one("id", "auth-password-change")[1]["type"], "button")
        form_tag, form = controls.one("id", "change-password")
        self.assertEqual(form_tag, "form")
        self.assertIn("hidden", form)
        self.assertIn("novalidate", form)
        self.assertEqual(contract["changePassword"]["inputOrder"], ["account", "oldPassword", "newPassword", "repeatPassword"])
        for field in contract["changePassword"]["inputOrder"]:
            tag, attrs = controls.one("data-password-field", field)
            play_tag, play_attrs = play_controls.one("data-password-field", field)
            self.assertEqual(tag, "input")
            self.assertEqual(tag, play_tag)
            self.assertEqual(attrs["maxlength"], "10")
            for attribute in ("type", "autocomplete", "aria-label", "maxlength"):
                self.assertEqual(attrs.get(attribute), play_attrs.get(attribute))
            if field != "account":
                self.assertEqual(attrs["type"], "password")
        self.assertEqual(controls.one("data-password-agree", None)[1]["type"], "submit")
        self.assertEqual(controls.one("data-password-cancel", None)[1]["type"], "button")
        self.assertIn('data-scene="password-change"', (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8"))
        self.assertIn("from './classic-auth'", source)
        self.assertIn("auth.showPasswordChange()", source)
        self.assertIn("auth.bindPasswordActions(", source)
        submit = re.search(r"'#change-password'\)!.addEventListener\('submit',event=>\{(.*?)\n \}\);", source, re.S).group(1)
        self.assertIn("event.preventDefault()", submit)
        self.assertIn("['account','oldPassword','newPassword','repeatPassword']", submit)
        self.assertIn("validatePasswordChange(fields)", submit)
        self.assertIn("systemDialog.show(", submit)
        self.assertIn("buttons:['ok']", submit)
        self.assertNotIn("new WebSocket", source)
        self.assertNotIn(".send(", source)

    def test_calibration_wires_production_navigation_and_state_controls(self):
        source = (ROOT / "apps/web/src/ui-calibration.ts").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8")
        interactions = json.loads((ROOT / "content/classic-176/ui-interactions.json").read_text(encoding="utf-8"))
        self.assertIn("setCharacterPage", source)
        self.assertIn("new SkillBar", source)
        self.assertIn("makeClassicWindowDraggable", source)
        self.assertIn("[data-window-open]", source)
        self.assertIn("#login", source)
        self.assertIn("#create-character", source)
        self.assertIn("#npc-options button", source)
        self.assertIn("#calibration-attack-mode", source)
        self.assertIn("event.ctrlKey&&event.key.toLowerCase()==='h'", source)
        for target in ("character", "inventory", "skills", "quest", "attack"):
            self.assertIn(f'data-window-open="{target}"', markup)
        for control in ("service.close", "shop.goods.buy", "repair.item.action", "storage.item.action", "hud.window.quest", "hud.window.attack", "quest.entry", "attack.mode", "targets.entry", "ground.pickup", "group.action", "guild.action", "system.action", "chat.channel", "trade.confirm", "trade.cancel"):
            self.assertIn(control, interactions["controls"])


    def test_chat_recipient_label_hidden_state_survives_flex_form_styles(self):
        css = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")
        markup = (ROOT / "apps/web/ui-calibration.html").read_text(encoding="utf-8")
        play = (ROOT / "apps/web/play.html").read_text(encoding="utf-8")
        self.assertIn('id="calibration-chat-target-wrap" hidden', markup)
        self.assertIn('id="chat-target-wrap" hidden', play)
        self.assertIn("body.classic-play .chat-panel label[hidden]{display:none!important}", css)


if __name__ == "__main__":
    unittest.main()
