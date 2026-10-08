import re
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import city_services
import boss_rooms


class RefreshMenuTests(unittest.TestCase):
    def check_script(self, script):
        sections = dict(re.findall(r'^\[@([^\]]+)\]\n(.*?)(?=^\[@|\Z)', script, re.M | re.S))
        for name, body in sections.items():
            self.assertTrue(set(re.findall(r'/@([A-Za-z0-9_]+)', body)) <= sections.keys() | {'exit'}, name)
            if '#ACT' not in body:
                self.assertLessEqual(len([line for line in body.splitlines() if line.strip()]), 9, name)
        self.assertIn('<重置怪物刷新/@refresh>', sections['main'])
        self.assertIn('RESETMONSPAWN CURRENT', sections['refresh_current'])
        return sections

    def test_city_menu_reaches_all_destinations_without_changing_travel(self):
        script = city_services.build_travel_script()
        sections = self.check_script(script)
        for group, (_, routes) in enumerate(city_services.ROUTE_GROUPS.items()):
            for index, (_, map_id, x, y) in enumerate(routes):
                self.assertIn(f'RESETMONSPAWN {map_id}\n', sections[f'fr{group}_{index}'])
                self.assertIn(f'MAPMOVE {map_id} {x} {y}', sections[f'r{group}_{index}'])
                self.assertNotIn('MAPMOVE', sections[f'fr{group}_{index}'])
        self.assertEqual(len(re.findall(r'^MAPMOVE ', script, re.M)), 60)

    def test_boss_menu_covers_six_dark_rooms_and_filters_missing_maps(self):
        maps = {'0', 'T140', 'T339', 'T315', 'T218', 'T219', 'T232'}
        script = boss_rooms.build_script(maps)
        self.check_script(script)
        self.assertEqual(set(re.findall(r'^RESETMONSPAWN (\S+)$', script, re.M)), maps - {'0'} | {'CURRENT'})
        self.assertEqual(len(re.findall(r'^MAPMOVE ', script, re.M)), 6)


if __name__ == '__main__':
    unittest.main()
