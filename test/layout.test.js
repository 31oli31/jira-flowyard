import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPUS,
  ROADS,
  PARKING,
  BUILDINGS,
  TREES,
  THEME_DECOR,
  WORK_ZONE,
  DECOR_FOOTPRINTS,
  rectOf,
  rectsOverlap,
  validateLayout
} from "../public/js/layout.js";

test("layout has no overlapping surfaces and keeps decorations clear", () => {
  const { ok, violations } = validateLayout();

  assert.deepEqual(violations, []);
  assert.equal(ok, true);
});

test("roads and parking never share area with buildings", () => {
  const surfaces = [
    ...ROADS.map((road) => ({ id: road.id, ...rectOf(road) })),
    { id: "parking", ...rectOf(PARKING) }
  ];

  for (const surface of surfaces) {
    for (const building of BUILDINGS) {
      assert.equal(
        rectsOverlap(surface, rectOf(building)),
        false,
        `${surface.id} overlaps building ${building.id}`
      );
    }
  }
});

test("every decoration type has a registered footprint", () => {
  Object.entries(THEME_DECOR).forEach(([theme, items]) => {
    assert.ok(items.length > 0, `${theme} needs decorations`);

    items.forEach((item) => {
      const ownFootprint =
        item.w !== undefined && item.d !== undefined;

      assert.ok(
        ownFootprint || DECOR_FOOTPRINTS[item.type],
        `${theme} decoration ${item.type} has no footprint`
      );
    });
  });
});

test("all themes are decorated and the campus stays inside bounds", () => {
  assert.deepEqual(Object.keys(THEME_DECOR).sort(), [
    "christmas",
    "corporate",
    "halloween",
    "neon",
    "summer"
  ]);

  const campus = rectOf(CAMPUS);

  assert.ok(campus.x1 === -28 && campus.x2 === 30);
  assert.ok(campus.z1 === -20 && campus.z2 === 22);
  assert.ok(TREES.length >= 24, "expected a full tree belt");
  assert.ok(rectOf(WORK_ZONE).x2 <= 8);
});
