import re
from pathlib import Path
import sys

path = Path('public/js/engine.js')
text = path.read_text()


def cut(start_anchor, end_anchor, replacement):
    global text
    i = text.find(start_anchor)
    j = text.find(end_anchor, i + 1)
    if i < 0 or j < 0:
        print(f'anchor not found: {start_anchor[:40]!r} / {end_anchor[:40]!r}', file=sys.stderr)
        sys.exit(1)
    text = text[:i] + replacement + text[j:]


# ---------------------------------------------------------------- 1) drop dead helpers
cut(
    "      function clampRoadX(x) {",
    "      function smooth01(t) {",
    ""
)

cut(
    "      function catmullRom(p0, p1, p2, p3, t) {",
    "      function buildFlightPlan() {",
    ""
)

# ---------------------------------------------------------------- 2) new route builder
new_plan = '''      /*
       * Closed circuit built from a centripetal Catmull-Rom curve.
       *
       * Centripetal parameterisation avoids the loops/overshoot a uniform spline
       * produces between waypoints that differ a lot in length, so every curve is
       * actually flown with the radius suggested by the waypoints.
       *
       * The curve only describes the route in the ground plane; altitude comes
       * exclusively from flightHeightProfile(), so the route can never dive or
       * overshoot vertically.
       */
      function buildFlightPlan() {
        const homeX = VEHICLE_HOME.x;
        const homeZ = MAIN_ROAD_Z;
        const scale = rand(0.94, 1.06);

        // Hand spaced one-way circuit: takeoff/landing stay on the straight road,
        // the loop crosses the warehouse hall (package drop) and never reverses
        // direction. x is scaled around 0, z around the road line, so the road
        // waypoints stay exactly on z = homeZ.
        const ring = [
          [6, 9.2], [12, 9.2], [18, 9.2],
          [22, 12], [19, 16], [11, 17.5], [3, 16.5], [-5, 14],
          [-11, 10], [-14, 5], [-12, 0], [-7, -3], [-1, -2], [5, -1],
          [11, 1], [15, -2], [15, -8], [10, -11], [3, -12], [-4, -11],
          [-10, -8], [-15, -4], [-18, 1], [-18, 6], [-15, 9.2],
          [-10, 9.2], [-4, 9.2], [1, 9.2], [4.5, 9.2]
        ];

        const waypoints = ring.map(([x, z]) => new THREE.Vector3(
          x * scale,
          0,
          homeZ + (z - homeZ) * scale
        ));

        const curve = new THREE.CatmullRomCurve3(waypoints, true, 'centripetal', 0.5);
        curve.arcLengthDivisions = 1200;
        curve.updateArcLengths();
        const length = curve.getLength() || 1;

        // Height profile breakpoints as distances along the route (in world units),
        // converted to the normalized route parameter the curve works with.
        const breaks = {
          rollIn: 6 / length,      // standstill roll on the road
          lift: 12 / length,       // leaving the ground on the road
          climb: 24 / length,      // climbing out
          cruise: 40 / length,     // reaching cruise altitude
          descent: 1 - 24 / length,// leaving cruise altitude
          flare: 1 - 11 / length,  // flare
          ground: 1 - 5 / length   // touchdown on the road, roll to home
        };

        return {
          curve,
          length,
          breaks,
          hMax: rand(5.4, 6.8),
          homeZ,
          duration: THREE.MathUtils.clamp(length / 8.5, 18, 26)
        };
      }

'''

cut(
    "      function buildFlightPlan() {",
    "      // Smooth Hermite segment:",
    new_plan
)

# ---------------------------------------------------------------- 3) profile + sampling
new_sampling = '''      /*
       * Continuously differentiable flight height profile over the normalized
       * route parameter (0..1): ground roll -> climb -> cruise plateau -> descent
       * -> flare -> ground roll. Tangential (y = 0, dy/ds = 0) at both ends.
       */
      const DEFAULT_FLIGHT_BREAKS = {
        rollIn: 0.03,
        lift: 0.07,
        climb: 0.13,
        cruise: 0.21,
        descent: 0.87,
        flare: 0.94,
        ground: 0.975
      };

      function flightHeightProfile(sNorm, hMax = 6.2, breaks = DEFAULT_FLIGHT_BREAKS) {
        const s = Math.max(0, Math.min(1, sNorm));
        const h = hMax;
        const b = breaks;

        if (s <= b.rollIn || s >= b.ground) return { y: 0, dy: 0 };

        // Quintic blends (smootherstep): C2-like smoothness, no overshoot.
        const seg = (s0, s1, y0, y1) => {
          const t = (s - s0) / Math.max(1e-6, (s1 - s0));
          const u = t * t * t * (t * (t * 6 - 15) + 10);
          const du = 30 * t * t * (1 - t) * (1 - t);
          return {
            y: y0 + (y1 - y0) * u,
            dy: (y1 - y0) * du / Math.max(1e-6, (s1 - s0))
          };
        };

        if (s < b.lift) return seg(b.rollIn, b.lift, 0, h * 0.14);
        if (s < b.climb) return seg(b.lift, b.climb, h * 0.14, h * 0.68);
        if (s < b.cruise) return seg(b.climb, b.cruise, h * 0.68, h);
        if (s < b.descent) return { y: h, dy: 0 };
        if (s < b.flare) return seg(b.descent, b.flare, h, h * 0.16);
        return seg(b.flare, b.ground, h * 0.16, 0);
      }

      /*
       * Pose on the planned route for a normalized route parameter u (0..1).
       *
       * getPointAt()/getTangentAt() are arc-length based, so the sleigh travels
       * at constant speed along the route instead of speeding up in short spline
       * segments. u is monotonic across the closed-loop seam, so the height
       * profile can never jump back into cruise altitude before landing.
       */
      function pathPoseAt(plan, uNorm) {
        const u = Math.max(0, Math.min(1, uNorm));
        const pos = plan.curve.getPointAt(u);
        const tan = plan.curve.getTangentAt(u);
        if (tan.lengthSq() < 1e-6) tan.set(1, 0, 0);

        const prof = flightHeightProfile(u, plan.hMax || 6.2, plan.breaks);
        pos.y = prof.y;

        // Ground roll: keep the runners exactly on the straight road.
        const b = plan.breaks || DEFAULT_FLIGHT_BREAKS;
        if (u <= b.rollIn || u >= b.ground) {
          pos.z = plan.homeZ ?? MAIN_ROAD_Z;
        }

        return {
          pos,
          tan,
          s: u,
          dyds: prof.dy,
          overHall: isOverWarehouseHall(pos.x, pos.z) && pos.y > 1.5
        };
      }

'''

cut(
    "      // Smooth Hermite segment:",
    "      function spawnDroppedGift(",
    new_sampling
)

path.write_text(text)
print('route patched')
