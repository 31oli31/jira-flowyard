/*
 * Single source of truth for the campus ground plan.
 *
 * Every rectangle below is expressed as a centre point plus width/depth in
 * world units. The scene builders in engine.js iterate these tables instead of
 * hard-coding coordinates, and test/layout.test.js uses the same data to prove
 * that buildings, roads and parking never overlap each other.
 *
 * Coordinate system: +x points right, +z points towards the camera.
 */

export const CAMPUS = {
  x: 1,
  z: 1,
  width: 58,
  depth: 42
};

/*
 * Road tiles. Tiles only share edges (never area), so the rendered surfaces
 * read as one street network without z-fighting or double geometry.
 *
 *   main          horizontal street in front of the campus
 *   westApproach  vertical street left of the warehouse
 *   depotLane     vertical service lane between warehouse and depot
 *   depotApron    horizontal yard strip in front of the depot
 */
export const ROADS = [
  {
    id: "main",
    x: 3,
    z: 9.2,
    width: 45,
    depth: 4,
    markings: true
  },
  {
    id: "westApproach",
    x: -13.6,
    z: -1.8,
    width: 4,
    depth: 18,
    markings: true
  },
  {
    id: "depotLane",
    x: 10.4,
    z: 1.3,
    width: 2.4,
    depth: 11.8,
    markings: false
  },
  {
    id: "depotApron",
    x: 17.05,
    z: 5.8,
    width: 10.9,
    depth: 2.8,
    markings: false
  }
];

export const PARKING = {
  x: -20.1,
  z: 2.1,
  width: 8.2,
  depth: 7.6
};

export const BUILDINGS = [
  {
    id: "warehouse",
    kind: "warehouse",
    x: 0,
    z: 0,
    width: 18,
    depth: 11
  },
  {
    id: "officeWest",
    kind: "office",
    x: -19.6,
    z: -8.8,
    width: 7.2,
    depth: 5.8,
    height: 5.4
  },
  {
    id: "officeEast",
    kind: "office",
    x: 17.8,
    z: -9.5,
    width: 7.6,
    depth: 5.4,
    height: 5.8
  },
  {
    id: "depot",
    kind: "depot",
    x: 16.2,
    z: 0,
    width: 9,
    depth: 8.5
  }
];

const TREE_SCALES = [0.86, 0.98, 1.1];

function tree(x, z, index) {
  return { x, z, scale: TREE_SCALES[index % TREE_SCALES.length] };
}

/*
 * Border trees. They stay outside every building, road and parking tile and
 * frame the campus without blocking the front lawn decoration band.
 */
export const TREES = [
  ...[-26, -21, -16, -11, -6, -1, 4, 9, 14, 19, 24, 28].map((x, index) =>
    tree(x, -17.5, index)
  ),
  ...[-26, -20, -14, -8, -2, 4, 10, 16, 22, 27].map((x, index) =>
    tree(x, 18.5, index + 1)
  ),
  ...[-11, -4, 3, 10, 15.5].map((z, index) =>
    tree(-26.4, z, index + 2)
  ),
  ...[-11, -5, 1, 13].map((z, index) => tree(28, z, index))
];

/*
 * Ground footprint per decoration type (full width/depth at scale 1).
 * Types that carry their own `w`/`d` in the table use those values instead.
 */
export const DECOR_FOOTPRINTS = {
  /* corporate */
  lampPost: { w: 0.7, d: 0.7 },
  bench: { w: 2.1, d: 1.0 },
  planter: { w: 1.5, d: 1.5 },
  bollard: { w: 0.5, d: 0.5 },
  pallet: { w: 1.4, d: 1.2 },
  trafficCone: { w: 0.7, d: 0.7 },
  guardKiosk: { w: 1.9, d: 1.9 },
  campusSign: { w: 1.9, d: 0.8 },
  bikeRack: { w: 1.9, d: 0.8 },
  crateStack: { w: 1.3, d: 1.3 },

  /* christmas */
  christmasTree: { w: 2.0, d: 2.0 },
  snowman: { w: 1.7, d: 1.7 },
  candyCane: { w: 0.8, d: 0.8 },
  gift: { w: 0.9, d: 0.9 },
  nutcracker: { w: 0.9, d: 0.9 },
  sled: { w: 2.0, d: 1.0 },
  snowLantern: { w: 0.8, d: 0.8 },
  reindeer: { w: 2.0, d: 1.0 },
  gingerbread: { w: 1.2, d: 0.7 },
  northPoleSign: { w: 1.8, d: 1.0 },
  elf: { w: 0.8, d: 0.8 },
  santa: { w: 1.8, d: 1.8 },

  /* halloween */
  pumpkin: { w: 1.4, d: 1.4 },
  tombstone: { w: 0.9, d: 0.6 },
  deadTree: { w: 1.9, d: 1.9 },
  hayBale: { w: 1.7, d: 1.1 },
  scarecrow: { w: 1.5, d: 0.9 },
  cauldron: { w: 1.3, d: 1.3 },
  ghostLantern: { w: 0.8, d: 0.8 },
  fog: { w: 3.0, d: 2.2 },

  /* summer */
  palmTree: { w: 2.5, d: 2.5 },
  beachUmbrella: { w: 2.5, d: 2.5 },
  sunbed: { w: 2.1, d: 1.0 },
  beachBall: { w: 0.9, d: 0.9 },
  towel: { w: 1.7, d: 1.0 },
  surfboard: { w: 0.9, d: 2.3 },
  cooler: { w: 1.0, d: 0.8 },
  iceCreamCart: { w: 2.1, d: 1.3 },
  picnicTable: { w: 2.1, d: 1.7 },
  buoy: { w: 0.7, d: 0.7 },

  /* neon */
  neonPylon: { w: 0.9, d: 0.9 },
  glowCrate: { w: 1.1, d: 1.1 },
  holoBillboard: { w: 2.8, d: 0.7 },
  neonBarrel: { w: 1.0, d: 1.0 },
  lightBeam: { w: 1.3, d: 1.3 }
};

const GIFT_COLORS = [
  { color: 0xff2f63, ribbon: 0xffc400 },
  { color: 0x7a1fd0, ribbon: 0xffffff },
  { color: 0x03a047, ribbon: 0xe01438 },
  { color: 0x1fa2ff, ribbon: 0xffc400 }
];

function gift(x, z, size, index) {
  const palette = GIFT_COLORS[index % GIFT_COLORS.length];

  return {
    type: "gift",
    x,
    z,
    scale: size,
    color: palette.color,
    ribbon: palette.ribbon,
    rotation: (index % 3 - 1) * 0.25
  };
}

/*
 * Decoration band layout per theme. Everything here sits on free ground:
 * the front lawn (z between 11.2 and 18), the plaza strip in front of the
 * warehouse (z 5.5-7.2), the side margins and the rear service yard.
 * test/layout.test.js asserts this remains true.
 */
export const THEME_DECOR = {
  corporate: [
    { type: "lampPost", x: -22.8, z: 12.2 },
    { type: "lampPost", x: -16.2, z: 12.2 },
    { type: "lampPost", x: -9.4, z: 12.2 },
    { type: "lampPost", x: -2.6, z: 12.2 },
    { type: "lampPost", x: 4.2, z: 12.2 },
    { type: "lampPost", x: 11.0, z: 12.2 },
    { type: "lampPost", x: 17.8, z: 12.2 },
    { type: "lampPost", x: 24.4, z: 12.2 },
    { type: "bench", x: -19.0, z: 14.4 },
    { type: "bench", x: -12.4, z: 14.4 },
    { type: "bench", x: 1.0, z: 14.6 },
    { type: "bench", x: 13.4, z: 14.4 },
    { type: "bench", x: 21.0, z: 14.6 },
    { type: "hedge", x: -25.6, z: 12.4, w: 4.4, d: 0.8 },
    { type: "hedge", x: 24.2, z: 16.6, w: 5.4, d: 0.9 },
    { type: "hedge", x: -1.5, z: -14.0, w: 6.0, d: 0.8 },
    { type: "planter", x: -14.4, z: 12.5 },
    { type: "planter", x: 8.0, z: 12.5 },
    { type: "planter", x: 20.2, z: 16.8 },
    { type: "planter", x: -11.4, z: -14.6 },
    { type: "planter", x: 19.8, z: -14.6 },
    { type: "bikeRack", x: 15.6, z: 12.8 },
    { type: "bikeRack", x: -20.8, z: -14.6 },
    { type: "campusSign", x: 2.0, z: 13.6, rotation: 0.1 },
    { type: "guardKiosk", x: -25.6, z: -8.8 },
    { type: "pallet", x: 24.3, z: 3.2, rotation: 0.1 },
    { type: "pallet", x: 24.5, z: 1.6, rotation: -0.15 },
    { type: "trafficCone", x: 8.6, z: 6.5 },
    { type: "trafficCone", x: 23.4, z: 5.3 },
    { type: "trafficCone", x: 8.2, z: 6.6 },
    { type: "bollard", x: -10.2, z: 6.3 },
    { type: "bollard", x: -10.2, z: 4.0 },
    { type: "bollard", x: -10.2, z: 1.7 },
    { type: "crateStack", x: 12.9, z: -5.6 },
    { type: "crateStack", x: 14.6, z: -5.7 },
    { type: "crateStack", x: 19.6, z: -5.5 },
    { type: "bench", x: -16.8, z: -14.4 },
    { type: "bench", x: -6.2, z: -14.2 },
    { type: "bench", x: 4.2, z: -14.6 },
    { type: "bench", x: 12.8, z: -14.4 }
  ],

  christmas: [
    { type: "christmasTree", x: -21.0, z: 15.2, scale: 1.05 },
    { type: "christmasTree", x: -2.6, z: 16.0, scale: 1.2 },
    { type: "christmasTree", x: 25.0, z: 15.0 },
    { type: "christmasTree", x: 9.4, z: 15.6, scale: 0.95 },
    { type: "christmasTree", x: -13.5, z: 14.6 },
    { type: "christmasTree", x: -25.9, z: -8.2, scale: 0.9 },
    { type: "snowman", x: -17.5, z: 13.0 },
    { type: "snowman", x: 13.6, z: 13.2, scale: 0.95 },
    { type: "snowman", x: 22.2, z: 13.4, scale: 0.9 },
    { type: "snowman", x: 24.8, z: -1.4, scale: 0.95 },
    { type: "nutcracker", x: -24.4, z: 12.9 },
    { type: "nutcracker", x: 12.2, z: 13.9 },
    { type: "nutcracker", x: -8.4, z: 12.8 },
    { type: "candyCane", x: -6.2, z: 12.4 },
    { type: "candyCane", x: 6.5, z: 12.7, rotation: Math.PI },
    { type: "candyCane", x: 17.5, z: 12.9 },
    { type: "candyCane", x: -19.8, z: 12.6 },
    { type: "candyCane", x: 0.6, z: 12.5, rotation: Math.PI },
    { type: "candyCane", x: -16.2, z: 12.5 },
    { type: "sled", x: -11.2, z: 15.8, rotation: 0.3 },
    { type: "sled", x: 4.2, z: 16.4, rotation: -0.2 },
    { type: "snowPile", x: -19.6, z: 16.4, w: 4.4, d: 1.5 },
    { type: "snowPile", x: 18.5, z: 16.2, w: 5.0, d: 1.6 },
    { type: "reindeer", x: 1.3, z: 14.0, rotation: -Math.PI / 2 },
    { type: "reindeer", x: 5.6, z: 14.2, rotation: -Math.PI / 2 },
    { type: "gingerbread", x: -3.9, z: 13.0, rotation: 0.2 },
    { type: "gingerbread", x: 20.6, z: 15.8, rotation: -0.15 },
    { type: "snowLantern", x: -15.2, z: 12.6, rotation: 0.2 },
    { type: "snowLantern", x: 7.4, z: 12.6, rotation: -0.2 },
    { type: "snowLantern", x: 24.4, z: 17.4 },
    { type: "northPoleSign", x: 27.6, z: 16.4, rotation: -0.4 },
    gift(-23.2, 14.4, 0.6, 0),
    gift(-22.4, 15.1, 0.45, 1),
    gift(-23.9, 15.5, 0.5, 2),
    gift(11.6, 14.7, 0.55, 3),
    gift(23.6, 16.6, 0.5, 1),
    { type: "santa", x: -12.2, z: 13.4, rotation: 0.6 },
    { type: "elf", x: -7.6, z: 6.5, rotation: Math.PI / 2 },
    { type: "elf", x: -4.6, z: 6.5, rotation: Math.PI / 2 },
    { type: "elf", x: -1.2, z: 6.5, rotation: -Math.PI / 2 },
    { type: "elf", x: 1.8, z: 6.5, rotation: -Math.PI / 2 },
    { type: "elf", x: 8.2, z: 6.5, rotation: -Math.PI / 2 },
    { type: "snowPile", x: -11.5, z: -13.6, w: 4.6, d: 1.5 },
    { type: "snowPile", x: 17.5, z: -14.2, w: 5.0, d: 1.6 },
    { type: "candyCane", x: 7.5, z: -15.2 },
    { type: "candyCane", x: -19.5, z: -15.4, rotation: Math.PI },
    { type: "snowLantern", x: -16.2, z: -14.6 },
    { type: "snowLantern", x: 11.5, z: -14.8 },
    { type: "snowHill", x: -24.0, z: -14.0, w: 4.0, d: 2.6 },
    { type: "snowHill", x: -8.0, z: -14.4, w: 5.0, d: 2.4 },
    { type: "snowHill", x: 4.5, z: -14.6, w: 6.0, d: 2.2 },
    { type: "snowHill", x: 21.5, z: -15.0, w: 4.5, d: 2.4 },
    { type: "snowHill", x: -11.0, z: 19.5, w: 2.6, d: 1.8 },
    { type: "snowHill", x: 26.2, z: -15.2, w: 3.0, d: 1.8 }
  ],

  halloween: [
    { type: "pumpkin", x: -20.0, z: 12.6 },
    { type: "pumpkin", x: -18.4, z: 13.2, scale: 0.8 },
    { type: "pumpkin", x: -4.6, z: 13.4, scale: 0.95 },
    { type: "pumpkin", x: -3.1, z: 12.8, scale: 0.7 },
    { type: "pumpkin", x: 8.6, z: 13.0 },
    { type: "pumpkin", x: 10.2, z: 13.5, scale: 0.8 },
    { type: "pumpkin", x: 18.4, z: 12.8, scale: 0.9 },
    { type: "pumpkin", x: 25.4, z: 12.6, scale: 0.85 },
    { type: "pumpkin", x: 1.5, z: 13.6, scale: 0.75 },
    { type: "pumpkin", x: -7.9, z: 6.4, scale: 0.9 },
    { type: "pumpkin", x: 8.4, z: 6.4, scale: 0.85 },
    { type: "tombstone", x: -15.4, z: 16.8, rotation: 0.15 },
    { type: "tombstone", x: -13.4, z: 16.9, rotation: -0.12 },
    { type: "tombstone", x: 14.2, z: 16.6, rotation: 0.1 },
    { type: "tombstone", x: 15.6, z: 16.2, rotation: -0.18 },
    { type: "deadTree", x: -24.2, z: 14.6 },
    { type: "deadTree", x: 23.8, z: 14.8 },
    { type: "deadTree", x: 5.2, z: 15.4 },
    { type: "hayBale", x: -9.4, z: 13.2 },
    { type: "hayBale", x: 11.8, z: 15.6 },
    { type: "hayBale", x: 20.6, z: 16.4 },
    { type: "scarecrow", x: -12.6, z: 14.4 },
    { type: "scarecrow", x: 6.8, z: 13.4 },
    { type: "scarecrow", x: 24.2, z: 11.8 },
    { type: "cauldron", x: -16.6, z: 12.8 },
    { type: "cauldron", x: 13.0, z: 12.6 },
    { type: "cauldron", x: 2.4, z: 15.0 },
    { type: "fence", x: -22.0, z: 17.2, w: 5.0, d: 0.35 },
    { type: "fence", x: 17.5, z: 17.1, w: 6.0, d: 0.35 },
    { type: "ghostLantern", x: -18.8, z: 15.4 },
    { type: "ghostLantern", x: 0.4, z: 12.8 },
    { type: "ghostLantern", x: 19.8, z: 14.6 },
    { type: "fog", x: -16.5, z: 14.8, scale: 1.2 },
    { type: "fog", x: 8.5, z: 15.4, scale: 1.3 },
    { type: "fog", x: 22.5, z: -14.5, scale: 1.4 },
    { type: "fog", x: -6.5, z: -15.0, scale: 1.1 },
    { type: "fog", x: 2.4, z: 14.6, scale: 1.0 }
  ],

  summer: [
    { type: "palmTree", x: -24.8, z: 12.8, scale: 1.05 },
    { type: "palmTree", x: 25.4, z: 14.6, scale: 1.1 },
    { type: "palmTree", x: -26.0, z: -13.4 },
    { type: "palmTree", x: 26.4, z: -13.6, scale: 1.05 },
    { type: "palmTree", x: 7.2, z: 14.6, scale: 0.95 },
    { type: "palmTree", x: -7.0, z: 14.8 },
    { type: "beachUmbrella", x: -15.2, z: 13.4 },
    { type: "beachUmbrella", x: -0.8, z: 14.0 },
    { type: "beachUmbrella", x: 13.2, z: 13.0 },
    { type: "beachUmbrella", x: 22.6, z: 15.6 },
    { type: "sunbed", x: -13.6, z: 13.6, rotation: 0.35 },
    { type: "sunbed", x: 0.8, z: 14.2, rotation: -0.3 },
    { type: "sunbed", x: 14.8, z: 13.8, rotation: 0.2 },
    { type: "beachBall", x: -5.8, z: 12.8 },
    { type: "beachBall", x: 4.4, z: 15.4 },
    { type: "beachBall", x: 11.0, z: 12.5 },
    { type: "sandPatch", x: -19.5, z: 15.7, w: 5.0, d: 1.8 },
    { type: "sandPatch", x: 17.8, z: 15.4, w: 5.5, d: 1.8 },
    { type: "towel", x: -21.2, z: 13.6 },
    { type: "towel", x: 3.6, z: 13.2, rotation: 0.2 },
    { type: "towel", x: 19.4, z: 13.0, rotation: -0.15 },
    { type: "surfboard", x: -23.6, z: 12.6, rotation: 0.2 },
    { type: "surfboard", x: 10.4, z: 15.9, rotation: -0.15 },
    { type: "cooler", x: -6.6, z: 14.0 },
    { type: "cooler", x: 15.8, z: 14.4 },
    { type: "iceCreamCart", x: -9.8, z: 13.0 },
    { type: "picnicTable", x: 6.0, z: 17.0 },
    { type: "buoy", x: -11.0, z: 13.0 },
    { type: "buoy", x: 23.8, z: 13.6, scale: 0.9 }
  ],

  neon: [
    { type: "neonPylon", x: -18.6, z: 13.0 },
    { type: "neonPylon", x: 5.6, z: 13.4 },
    { type: "neonPylon", x: 21.8, z: 13.2 },
    { type: "neonPylon", x: -6.4, z: 13.0 },
    { type: "neonPylon", x: 13.6, z: 15.8 },
    { type: "neonPylon", x: -8.0, z: -15.4 },
    { type: "neonPylon", x: 0.2, z: -15.2 },
    { type: "neonPylon", x: 15.8, z: -15.6 },
    { type: "glowCrate", x: -22.4, z: 13.4 },
    { type: "glowCrate", x: 9.2, z: 14.6 },
    { type: "glowCrate", x: 24.2, z: 15.2 },
    { type: "glowCrate", x: 0.6, z: 16.6 },
    { type: "glowCrate", x: -17.4, z: -15.6 },
    { type: "glowCrate", x: 10.2, z: -15.8 },
    { type: "glowCrate", x: 23.4, z: -15.4 },
    { type: "holoBillboard", x: 0.0, z: 16.6 },
    { type: "holoBillboard", x: -14.2, z: 16.8, rotation: 0.3 },
    { type: "neonBarrel", x: -4.2, z: 15.8 },
    { type: "neonBarrel", x: 16.4, z: 14.4 },
    { type: "neonBarrel", x: -12.8, z: 15.2 },
    { type: "lightBeam", x: -20.8, z: 16.0 },
    { type: "lightBeam", x: 7.8, z: 12.6 },
    { type: "lightBeam", x: 22.4, z: 12.6 }
  ]
};

/*
 * Ground rectangle kept clear of props so the forklift can leave the warehouse
 * bay and reach the main road.
 */
export const WORK_ZONE = {
  x: 6,
  z: 4.1,
  width: 3.2,
  depth: 6.2
};

export function rectOf(entry) {
  return {
    x1: entry.x - entry.width / 2,
    x2: entry.x + entry.width / 2,
    z1: entry.z - entry.depth / 2,
    z2: entry.z + entry.depth / 2
  };
}

export function decorRect(item) {
  const footprint =
    item.w !== undefined && item.d !== undefined
      ? { w: item.w, d: item.d }
      : DECOR_FOOTPRINTS[item.type];

  if (!footprint) {
    throw new Error(`No footprint registered for decoration "${item.type}"`);
  }

  const scale = item.scale ?? 1;
  const width = footprint.w * scale;
  const depth = footprint.d * scale;
  const rotation = item.rotation ?? 0;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));

  return {
    x1: item.x - (width * cos + depth * sin) / 2,
    x2: item.x + (width * cos + depth * sin) / 2,
    z1: item.z - (width * sin + depth * cos) / 2,
    z2: item.z + (width * sin + depth * cos) / 2
  };
}

export function treeRect(tree) {
  const half = 0.95 * (tree.scale ?? 1);

  return {
    x1: tree.x - half,
    x2: tree.x + half,
    z1: tree.z - half,
    z2: tree.z + half
  };
}

export function rectsOverlap(a, b, epsilon = 0.02) {
  return (
    a.x1 < b.x2 - epsilon &&
    b.x1 < a.x2 - epsilon &&
    a.z1 < b.z2 - epsilon &&
    b.z1 < a.z2 - epsilon
  );
}

export function rectPointsInside(inner, outer, epsilon = 0.02) {
  return (
    inner.x1 >= outer.x1 - epsilon &&
    inner.x2 <= outer.x2 + epsilon &&
    inner.z1 >= outer.z1 - epsilon &&
    inner.z2 <= outer.z2 + epsilon
  );
}

export function blockedRects() {
  return [
    ...ROADS.map((road) => ({ id: road.id, kind: "road", ...rectOf(road) })),
    { id: "parking", kind: "parking", ...rectOf(PARKING) },
    ...BUILDINGS.map((building) => ({
      id: building.id,
      kind: "building",
      ...rectOf(building)
    }))
  ];
}

export function validateLayout() {
  const violations = [];
  const campusRect = rectOf(CAMPUS);
  const blocked = blockedRects();
  const staticRects = [
    ...ROADS.map((road) => ({ id: `road:${road.id}`, ...rectOf(road) })),
    { id: "parking", ...rectOf(PARKING) },
    ...BUILDINGS.map((building) => ({
      id: `building:${building.id}`,
      ...rectOf(building)
    }))
  ];

  for (let i = 0; i < staticRects.length; i++) {
    for (let j = i + 1; j < staticRects.length; j++) {
      if (rectsOverlap(staticRects[i], staticRects[j])) {
        violations.push(
          `${staticRects[i].id} overlaps ${staticRects[j].id}`
        );
      }
    }
  }

  staticRects.forEach((rect) => {
    if (!rectPointsInside(rect, campusRect)) {
      violations.push(`${rect.id} leaves the campus bounds`);
    }
  });

  const treeRects = TREES.map((entry) => ({
    id: `tree@${entry.x},${entry.z}`,
    ...treeRect(entry)
  }));

  treeRects.forEach((rect) => {
    if (!rectPointsInside(rect, campusRect)) {
      violations.push(`${rect.id} leaves the campus bounds`);
    }

    blocked.forEach((block) => {
      if (rectsOverlap(rect, block)) {
        violations.push(`${rect.id} overlaps ${block.kind}:${block.id}`);
      }
    });
  });

  for (let i = 0; i < treeRects.length; i++) {
    for (let j = i + 1; j < treeRects.length; j++) {
      if (rectsOverlap(treeRects[i], treeRects[j])) {
        violations.push(
          `${treeRects[i].id} overlaps ${treeRects[j].id}`
        );
      }
    }
  }

  const workZone = rectOf(WORK_ZONE);

  Object.entries(THEME_DECOR).forEach(([theme, items]) => {
    const decorRects = items.map((item) => ({
      id: `${theme}:${item.type}@${item.x},${item.z}`,
      ...decorRect(item)
    }));

    decorRects.forEach((rect) => {
      if (!rectPointsInside(rect, campusRect)) {
        violations.push(`${rect.id} leaves the campus bounds`);
      }

      blocked.forEach((block) => {
        if (rectsOverlap(rect, block)) {
          violations.push(`${rect.id} overlaps ${block.kind}:${block.id}`);
        }
      });

      if (rectsOverlap(rect, workZone)) {
        violations.push(`${rect.id} blocks the forklift work zone`);
      }

      treeRects.forEach((tree) => {
        if (rectsOverlap(rect, tree)) {
          violations.push(`${rect.id} overlaps ${tree.id}`);
        }
      });
    });
  });

  return { ok: violations.length === 0, violations };
}
