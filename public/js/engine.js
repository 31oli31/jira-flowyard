      import * as THREE from "three";
      import { OrbitControls } from "three/addons/controls/OrbitControls.js";
      import {
        BUILDINGS,
        PARKING,
        ROADS,
        THEME_DECOR,
        TREES
      } from "./layout.js";

      /*
       * The campus is a self-contained Three.js scene. Everything that touches
       * Jira or the DOM panels lives in app.js; this module only owns the
       * renderer, the ticket geometry and the interaction events.
       */

      const listeners = new Map();

      function on(event, handler) {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }

        listeners.get(event).add(handler);

        return () => listeners.get(event)?.delete(handler);
      }

      function emit(event, payload) {
        listeners.get(event)?.forEach((handler) => {
          handler(payload);
        });
      }

      const COLORS = {
        corporateBackground: 0xe6f0fb,
        christmasBackground: 0xffdde8,
        ground: 0xc6d5e6,
        snow: 0xffffff,
        grass: 0x2fbd5a,

        road: 0x2f4357,
        parking: 0x40566c,
        white: 0xffffff,
        wall: 0xf4f8fd,

        blue: 0x0040e0,
        blueDark: 0x00238c,
        blueLight: 0x1fa2ff,

        christmas: 0xff2f63,
        christmasDark: 0x9c0a30,
        christmasGreen: 0x056b37,

        yellow: 0xffc400,
        orange: 0xff6a00,
        green: 0x03a047,
        red: 0xe01438,
        purple: 0x7a1fd0,

        steel: 0x18293b,
        steelLight: 0x93aabd,
        dark: 0x040f1c,

        parcel: 0xf07a12,
        tape: 0xffd23f,

        skin: 0xffc99d,
        brown: 0x7c451d,
        brownDark: 0x3f210c
      };

      /*
       * Theme catalogue. The UI renders its picker from this list, so adding a
       * theme only requires an entry here plus decoration and weather groups.
       */
      const THEMES = [
        {
          id: "corporate",
          label: "Corporate",
          icon: "🏢",
          hint: "Daylight logistics"
        },
        {
          id: "christmas",
          label: "Christmas",
          icon: "🎄",
          hint: "Snow, elves & sleigh"
        },
        {
          id: "halloween",
          label: "Halloween",
          icon: "🎃",
          hint: "Pumpkins, bats & fog"
        },
        {
          id: "summer",
          label: "Summer",
          icon: "🏖",
          hint: "Palms & sunshine"
        },
        {
          id: "neon",
          label: "Night Shift",
          icon: "🌃",
          hint: "Neon glow after dark"
        }
      ];

      const THEME_DEFINITIONS = {
        corporate: {
          background: 0xe6f0fb,
          ground: 0xc6d5e6,
          accent: 0x0040e0,
          parcels: [0xf07a12],
          ribbon: 0xffd23f,
          lighting: {
            ambient: [0xffffff, 0.38],
            hemisphere: [0xfff6ec, 0x4f6172, 0.45],
            sun: [0xfff8ee, 3.2],
            rim: [0xbcd6ff, 0.7]
          },
          weather: null
        },

        christmas: {
          background: 0xffdde8,
          ground: 0xc6d5e6,
          accent: 0xff2f63,
          parcels: [0xff2f63, 0x056b37, 0x0040e0, 0x7a1fd0],
          ribbon: 0xffc400,
          lighting: {
            ambient: [0xfff3f6, 0.42],
            hemisphere: [0xffe7ef, 0x6a4a58, 0.52],
            sun: [0xfff2e6, 3.1],
            rim: [0xffc2d4, 0.75]
          },
          weather: "snow"
        },

        halloween: {
          background: 0x1b1030,
          ground: 0x2c3340,
          accent: 0xff7a18,
          parcels: [0xff7a18, 0x8b2be2, 0x2f9e44, 0xd9a400],
          ribbon: 0xffe066,
          lighting: {
            ambient: [0xa794e0, 0.5],
            hemisphere: [0x6a3fa0, 0x120c22, 0.75],
            sun: [0xffb27a, 1.6],
            rim: [0x8b5cf6, 1.1]
          },
          weather: "embers"
        },

        summer: {
          background: 0xbfe9ff,
          ground: 0xf0e2bd,
          accent: 0x00a8c6,
          parcels: [0xff8c42, 0x00a8c6, 0x2fa8ff, 0xf2c744],
          ribbon: 0xffffff,
          lighting: {
            ambient: [0xffffff, 0.5],
            hemisphere: [0xd8f1ff, 0xe8d9a8, 0.62],
            sun: [0xfff4d0, 3.4],
            rim: [0xbfe9ff, 0.6]
          },
          weather: "petals"
        },

        neon: {
          background: 0x050a17,
          ground: 0x0d1526,
          accent: 0x00e5ff,
          parcels: [0x00e5ff, 0xff2fb9, 0x8b2be2, 0x7cff6b],
          ribbon: 0xffffff,
          lighting: {
            ambient: [0x7fa7ff, 0.3],
            hemisphere: [0x2b4dff, 0x05070f, 0.6],
            sun: [0x9fc4ff, 1.25],
            rim: [0xff2fb9, 0.95]
          },
          weather: "sparks"
        }
      };

      const STATUSES = [
        "To Do",
        "In Progress",
        "In Review",
        "In Testing"
      ];

      const LANE_X = [-6, -2, 2, 6];
      const BELT_Y = 1.08;
      const CONNECTOR_Z = -4.15;
      const tickets = [];
      const clickableMeshes = [];
      const rollers = [];
      const bayLeds = [];
      const accentMaterials = [];

      let currentTheme = "corporate";
      let selectedTicket = null;
      let hoveredTicket = null;
      let releaseAnimation = null;
      let ticketSerial = 1100;
      let searchFilter = null;
      let demo = null;
      let demoSerial = 0;

      const prefersReducedMotion =
        window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        );

      const sceneElement = document.getElementById("scene");
      const tooltip = document.getElementById("tooltip");

      function setSelected(ticket) {
        selectedTicket = ticket || null;
        emit("selection", selectedTicket);
        emit("state");
      }

      function setSearchFilter(ids) {
        let next = null;

        if (ids) {
          const list =
            Array.isArray(ids)
              ? ids
              : [...ids];

          next = list.length
            ? new Set(list)
            : null;
        }

        const unchanged =
          (searchFilter === null && next === null) ||
          (searchFilter !== null &&
            next !== null &&
            searchFilter.size === next.size &&
            [...next].every((id) =>
              searchFilter.has(id)
            ));

        if (unchanged) {
          return;
        }

        searchFilter = next;

        emit("state");
      }

      function setTicketsCleared() {
        selectedTicket = null;
        emit("selection", null);
        emit("state");
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(COLORS.corporateBackground);

      /*
       * Only extremely distant fog.
       */
      scene.fog = new THREE.Fog(
        COLORS.corporateBackground,
        350,
        700
      );

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
      });

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;

      sceneElement.appendChild(renderer.domElement);

      const cameraSize = 30;

      const camera = new THREE.OrthographicCamera(
        -18,
        18,
        15,
        -15,
        0.1,
        400
      );

      /*
       * Dedicated perspective camera for the cockpit view. The orthographic
       * campus camera is great for the overview, but from the driver's seat it
       * reads as an isometric 3D view - no depth, no vanishing point. The cockpit
       * camera is only switched in while the ride-along view is active.
       */
      const cockpitCamera = new THREE.PerspectiveCamera(
        62,
        window.innerWidth / window.innerHeight,
        0.1,
        400
      );

      camera.position.set(32, 27, 35);
      camera.lookAt(0, 1, 1);

      const controls = new OrbitControls(
        camera,
        renderer.domElement
      );

      controls.target.set(0, 0.8, 1);
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.screenSpacePanning = true;
      controls.minZoom = 0.55;
      controls.maxZoom = 3.2;
      controls.minPolarAngle = Math.PI / 5.5;
      controls.maxPolarAngle = Math.PI / 2.08;
      controls.update();

      const ambient = new THREE.AmbientLight(0xffffff, 0.38);

      scene.add(ambient);

      const hemisphere = new THREE.HemisphereLight(
        0xfff6ec,
        0x4f6172,
        0.45
      );

      scene.add(hemisphere);

      const sun = new THREE.DirectionalLight(0xfff8ee, 3.2);
      sun.position.set(-17, 24, 14);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -42;
      sun.shadow.camera.right = 42;
      sun.shadow.camera.top = 42;
      sun.shadow.camera.bottom = -42;
      sun.shadow.camera.far = 130;
      sun.shadow.bias = -0.00025;

      scene.add(sun);

      /*
       * Cool rim light from the opposite side keeps the shadows readable
       * instead of flattening them into the ambient light.
       */
      const rim = new THREE.DirectionalLight(0xbcd6ff, 0.7);
      rim.position.set(20, 14, -22);

      scene.add(rim);

      function resetCamera() {
        setChaseView(false);
        camera.position.set(32, 27, 35);
        controls.target.set(0, 0.8, 1);
        camera.zoom = 1;
        camera.updateProjectionMatrix();
        controls.update();
      }

      function topCamera() {
        setChaseView(false);
        camera.position.set(1, 38, 23);
        controls.target.set(0, 0, 1);
        controls.update();
      }

      function focusSelected() {
        if (!selectedTicket || !selectedTicket.root.visible) {
          return;
        }

        setChaseView(false);
        controls.target.copy(selectedTicket.root.position);

        camera.zoom = 1.65;
        camera.updateProjectionMatrix();
      }

      function createMaterial(color, options = {}) {
        return new THREE.MeshStandardMaterial({
          color,
          roughness: options.roughness ?? 0.65,
          metalness: options.metalness ?? 0,
          emissive: options.emissive ?? 0x000000,
          emissiveIntensity: options.emissiveIntensity ?? 0,
          transparent: options.transparent ?? false,
          opacity: options.opacity ?? 1,
          depthWrite: options.depthWrite ?? true
        });
      }

      function createBox(
        width,
        height,
        depth,
        color,
        x = 0,
        y = 0,
        z = 0,
        options = {}
      ) {
        const material = createMaterial(color, options);

        if (options.accent) {
          accentMaterials.push(material);
        }

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          material
        );

        mesh.position.set(x, y, z);
        mesh.castShadow = options.castShadow !== false;
        mesh.receiveShadow = options.receiveShadow !== false;

        return mesh;
      }

      /*
       * Rounded vertical object.
       */
      function createRoundedBox(
        width,
        height,
        depth,
        radius,
        color,
        x = 0,
        y = 0,
        z = 0,
        options = {}
      ) {
        const safeRadius = Math.max(
          0.001,
          Math.min(radius, width * 0.45, height * 0.45)
        );

        const shape = new THREE.Shape();
        const left = -width / 2;
        const right = width / 2;
        const bottom = -height / 2;
        const top = height / 2;

        shape.moveTo(left + safeRadius, bottom);
        shape.lineTo(right - safeRadius, bottom);
        shape.quadraticCurveTo(
          right,
          bottom,
          right,
          bottom + safeRadius
        );
        shape.lineTo(right, top - safeRadius);
        shape.quadraticCurveTo(
          right,
          top,
          right - safeRadius,
          top
        );
        shape.lineTo(left + safeRadius, top);
        shape.quadraticCurveTo(
          left,
          top,
          left,
          top - safeRadius
        );
        shape.lineTo(left, bottom + safeRadius);
        shape.quadraticCurveTo(
          left,
          bottom,
          left + safeRadius,
          bottom
        );

        const bevel = Math.min(
          options.bevelSize ?? 0.04,
          safeRadius * 0.42,
          depth * 0.15
        );

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth,
          steps: 1,
          bevelEnabled: true,
          bevelSegments: options.bevelSegments ?? 3,
          bevelSize: bevel,
          bevelThickness: bevel
        });

        geometry.center();
        geometry.computeVertexNormals();

        const material = createMaterial(color, options);

        if (options.accent) {
          accentMaterials.push(material);
        }

        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(x, y, z);
        mesh.castShadow = options.castShadow !== false;
        mesh.receiveShadow = options.receiveShadow !== false;

        return mesh;
      }

      /*
       * Rounded horizontal surface.
       * Shape XY is rotated into XZ.
       */
      function createRoundedSurface(
        width,
        depth,
        thickness,
        radius,
        color,
        x,
        y,
        z,
        options = {}
      ) {
        const mesh = createRoundedBox(
          width,
          depth,
          thickness,
          radius,
          color,
          x,
          y,
          z,
          options
        );

        mesh.rotation.x = Math.PI / 2;

        return mesh;
      }

      function createSphere(
        radius,
        color,
        x = 0,
        y = 0,
        z = 0,
        segments = 18,
        options = {}
      ) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(radius, segments, segments),
          createMaterial(color, options)
        );

        mesh.position.set(x, y, z);
        mesh.castShadow = options.castShadow !== false;
        mesh.receiveShadow = options.receiveShadow !== false;

        return mesh;
      }

      function createCylinder(
        radiusTop,
        radiusBottom,
        height,
        color,
        x = 0,
        y = 0,
        z = 0,
        segments = 16
      ) {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(
            radiusTop,
            radiusBottom,
            height,
            segments
          ),
          createMaterial(color)
        );

        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
      }

      function createCone(
        radius,
        height,
        color,
        x = 0,
        y = 0,
        z = 0,
        segments = 16
      ) {
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(radius, height, segments),
          createMaterial(color)
        );

        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
      }

      function clamp(value, min = 0, max = 1) {
        return Math.max(min, Math.min(max, value));
      }

      function smooth(value) {
        const t = clamp(value);
        return t * t * (3 - 2 * t);
      }

      function lerp(a, b, value) {
        return THREE.MathUtils.lerp(a, b, clamp(value));
      }

      function normalizeLabel(value) {
        return String(value || "").trim().replace(/^#/, "");
      }

      /* --------------------------------------------------
       * Campus layout
       * -------------------------------------------------- */

      const campusGround = createRoundedSurface(
        58,
        42,
        0.55,
        1.3,
        COLORS.ground,
        1,
        -0.28,
        1,
        {
          bevelSize: 0.07,
          castShadow: false
        }
      );

      scene.add(campusGround);

      /*
       * Snow lies above the campus but below roads and parking.
       */
      const snowGround = createRoundedSurface(
        57.4,
        41.4,
        0.08,
        1.2,
        COLORS.snow,
        1,
        0.025,
        1,
        {
          bevelSize: 0.012,
          castShadow: false
        }
      );

      snowGround.visible = false;
      scene.add(snowGround);

      const corporateSurfaceGroup = new THREE.Group();
      const christmasGroup = new THREE.Group();
      const halloweenGroup = new THREE.Group();
      const summerGroup = new THREE.Group();
      const neonGroup = new THREE.Group();

      scene.add(corporateSurfaceGroup);
      scene.add(christmasGroup);
      scene.add(halloweenGroup);
      scene.add(summerGroup);
      scene.add(neonGroup);

      const themeGroups = {
        corporate: corporateSurfaceGroup,
        christmas: christmasGroup,
        halloween: halloweenGroup,
        summer: summerGroup,
        neon: neonGroup
      };

      function addRoadMarkings(group, road) {
        const horizontal = road.width >= road.depth;
        const length = horizontal ? road.width : road.depth;
        const inset = 1.1;
        const spacing = 1.45;
        const dash = 0.72;

        for (
          let offset = -length / 2 + inset;
          offset <= length / 2 - inset;
          offset += spacing
        ) {
          const x = horizontal ? road.x + offset : road.x;
          const z = horizontal ? road.z : road.z + offset;

          /*
           * Junction boxes stay unmarked so crossing streets read as one
           * surface instead of stacked paint.
           */
          const inJunction = ROADS.some(
            (other) =>
              other !== road &&
              x > other.x - other.width / 2 - 0.4 &&
              x < other.x + other.width / 2 + 0.4 &&
              z > other.z - other.depth / 2 - 0.4 &&
              z < other.z + other.depth / 2 + 0.4
          );

          if (inJunction) {
            continue;
          }

          group.add(
            createBox(
              horizontal ? dash : 0.075,
              0.025,
              horizontal ? 0.075 : dash,
              COLORS.white,
              x,
              0.205,
              z,
              {
                castShadow: false
              }
            )
          );
        }
      }

      function createRoads() {
        const roads = new THREE.Group();

        ROADS.forEach((road) => {
          roads.add(
            createRoundedSurface(
              road.width,
              road.depth,
              0.13,
              Math.min(
                0.75,
                Math.min(road.width, road.depth) / 3
              ),
              COLORS.road,
              road.x,
              0.12,
              road.z,
              {
                bevelSize: 0.015,
                castShadow: false
              }
            )
          );

          if (road.markings) {
            addRoadMarkings(roads, road);
          }
        });

        scene.add(roads);
      }

      function createParking() {
        const group = new THREE.Group();
        const left = PARKING.x - PARKING.width / 2;
        const top = PARKING.z - PARKING.depth / 2;
        const bottom = PARKING.z + PARKING.depth / 2;

        group.add(
          createRoundedSurface(
            PARKING.width,
            PARKING.depth,
            0.14,
            0.65,
            COLORS.parking,
            PARKING.x,
            0.18,
            PARKING.z,
            {
              bevelSize: 0.016,
              castShadow: false
            }
          )
        );

        /*
         * Bay dividers and border lines are derived from the parking
         * rectangle so the paint can never drift off the surface again.
         */
        const columns = 5;
        const step = 1.7;
        const firstX = left + 0.85;
        const rowZ = [PARKING.z - 1.75, PARKING.z + 1.75];

        for (let column = 0; column < columns; column++) {
          const x = firstX + column * step;

          rowZ.forEach((z) => {
            group.add(
              createBox(
                0.055,
                0.028,
                2.2,
                COLORS.yellow,
                x,
                0.285,
                z,
                {
                  castShadow: false
                }
              )
            );
          });
        }

        [top + 0.55, bottom - 0.55].forEach((z) => {
          group.add(
            createBox(
              PARKING.width - 1.3,
              0.028,
              0.055,
              COLORS.yellow,
              PARKING.x,
              0.285,
              z,
              {
                castShadow: false
              }
            )
          );
        });

        const cars = [
          [-2.6, -1.75, COLORS.blue],
          [-0.9, -1.75, COLORS.yellow],
          [0.8, -1.75, COLORS.red],
          [2.5, -1.75, COLORS.green],
          [-1.7, 1.75, COLORS.white],
          [0.4, 1.75, COLORS.purple],
          [2.5, 1.75, COLORS.blueLight]
        ];

        cars.forEach(([offsetX, offsetZ, color]) => {
          const car = createCar(color);

          car.position.set(
            PARKING.x + offsetX,
            0.31,
            PARKING.z + offsetZ
          );
          car.rotation.y = Math.PI / 2;

          group.add(car);
        });

        scene.add(group);
      }

      function createCar(color) {
        const car = new THREE.Group();

        car.add(
          createRoundedBox(
            1.3,
            0.4,
            0.75,
            0.14,
            color,
            0,
            0.3,
            0
          )
        );

        car.add(
          createRoundedBox(
            0.72,
            0.34,
            0.65,
            0.11,
            COLORS.blueLight,
            0,
            0.61,
            0
          )
        );

        [-0.43, 0.43].forEach((x) => {
          [-0.39, 0.39].forEach((z) => {
            const wheel = createCylinder(
              0.13,
              0.13,
              0.12,
              COLORS.dark,
              x,
              0.14,
              z,
              12
            );

            wheel.rotation.x = Math.PI / 2;
            car.add(wheel);
          });
        });

        return car;
      }

      function createOffice(x, z, width, depth, height) {
        const group = new THREE.Group();

        group.add(
          createRoundedBox(
            width,
            height,
            depth,
            0.25,
            COLORS.white,
            0,
            height / 2,
            0,
            {
              bevelSize: 0.07
            }
          )
        );

        group.add(
          createRoundedSurface(
            width + 0.25,
            depth + 0.25,
            0.24,
            0.2,
            COLORS.blueLight,
            0,
            height + 0.12,
            0,
            {
              bevelSize: 0.025
            }
          )
        );

        const floors = Math.max(2, Math.floor(height / 1.1));
        const columns = Math.max(3, Math.floor(width / 1.2));

        for (let floor = 0; floor < floors; floor++) {
          for (let column = 0; column < columns; column++) {
            const px =
              -width / 2 +
              0.65 +
              column * (
                (width - 1.3) /
                Math.max(columns - 1, 1)
              );

            group.add(
              createRoundedBox(
                0.66,
                0.46,
                0.055,
                0.08,
                COLORS.blueLight,
                px,
                0.82 + floor * 1.02,
                depth / 2 + 0.035,
                {
                  bevelSize: 0.012
                }
              )
            );
          }
        }

        group.position.set(x, 0, z);
        scene.add(group);
      }

      function createTree(x, z, scale = 1) {
        const group = new THREE.Group();

        group.add(
          createCylinder(
            0.15,
            0.2,
            1.4,
            COLORS.brownDark,
            0,
            0.7,
            0,
            8
          )
        );

        group.add(
          createCone(
            0.88,
            1.65,
            COLORS.christmasGreen,
            0,
            1.45,
            0,
            12
          )
        );

        group.add(
          createCone(
            0.67,
            1.35,
            COLORS.green,
            0,
            2.02,
            0,
            12
          )
        );

        group.position.set(x, 0, z);
        group.scale.setScalar(scale);

        scene.add(group);
      }

      function createCampus() {
        createRoads();
        createParking();

        BUILDINGS.filter(
          (building) => building.kind === "office"
        ).forEach((building) => {
          createOffice(
            building.x,
            building.z,
            building.width,
            building.depth,
            building.height
          );
        });

        TREES.forEach((entry) => {
          createTree(entry.x, entry.z, entry.scale);
        });
      }

      /* --------------------------------------------------
       * Warehouse
       * -------------------------------------------------- */

      function createWarehouse() {
        scene.add(
          createRoundedSurface(
            18,
            11,
            0.28,
            0.4,
            0xd2dfeb,
            0,
            0.14,
            0,
            {
              bevelSize: 0.03
            }
          )
        );

        scene.add(
          createRoundedBox(
            18,
            3.8,
            0.26,
            0.22,
            COLORS.wall,
            0,
            1.9,
            -5.4
          )
        );

        scene.add(
          createRoundedBox(
            18.2,
            0.24,
            0.36,
            0.1,
            COLORS.blue,
            0,
            3.72,
            -5.25,
            {
              accent: true
            }
          )
        );

        scene.add(
          createRoundedBox(
            0.28,
            3.8,
            10.7,
            0.14,
            COLORS.wall,
            -9,
            1.9,
            -0.05
          )
        );

        scene.add(
          createRoundedBox(
            0.28,
            3.8,
            10.7,
            0.14,
            COLORS.wall,
            9,
            1.9,
            -0.05
          )
        );

        LANE_X.forEach((x, index) => {
          createConveyor(x, index);
          createBay(x, index + 1);
        });

        createRearConnector();
      }

      function createRoller(
        length,
        x,
        y,
        z,
        orientation,
        speed
      ) {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, z);

        const drum = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.115,
            0.115,
            length,
            14
          ),
          createMaterial(COLORS.steelLight, {
            roughness: 0.4,
            metalness: 0.35
          })
        );

        const marker = createBox(
          0.03,
          length * 0.88,
          0.025,
          COLORS.blue,
          0.108,
          0,
          0,
          {
            castShadow: false,
            accent: true
          }
        );

        drum.add(marker);
        pivot.add(drum);

        if (orientation === "lane") {
          pivot.rotation.z = Math.PI / 2;
        } else {
          pivot.rotation.x = Math.PI / 2;
        }

        rollers.push({ drum, speed });

        return pivot;
      }

      function createConveyor(x, laneIndex) {
        const group = new THREE.Group();

        group.add(
          createRoundedBox(
            1.38,
            0.16,
            7.72,
            0.13,
            COLORS.steel,
            x,
            0.62,
            -0.1
          )
        );

        group.add(
          createRoundedBox(
            0.14,
            0.36,
            7.86,
            0.07,
            COLORS.blue,
            x - 0.72,
            0.78,
            -0.1,
            {
              accent: true
            }
          )
        );

        group.add(
          createRoundedBox(
            0.14,
            0.36,
            7.86,
            0.07,
            COLORS.blue,
            x + 0.72,
            0.78,
            -0.1,
            {
              accent: true
            }
          )
        );

        for (let index = 0; index < 21; index++) {
          group.add(
            createRoller(
              1.28,
              x,
              0.79,
              -3.65 + index * 0.35,
              "lane",
              laneIndex % 2 === 0 ? 4 : -4
            )
          );
        }

        scene.add(group);
      }

      function createRearConnector() {
        const group = new THREE.Group();

        group.add(
          createRoundedBox(
            13.3,
            0.16,
            1.15,
            0.13,
            COLORS.steel,
            0,
            0.62,
            CONNECTOR_Z
          )
        );

        group.add(
          createRoundedBox(
            13.6,
            0.34,
            0.13,
            0.06,
            COLORS.blue,
            0,
            0.78,
            CONNECTOR_Z - 0.58,
            {
              accent: true
            }
          )
        );

        group.add(
          createRoundedBox(
            13.6,
            0.34,
            0.13,
            0.06,
            COLORS.blue,
            0,
            0.78,
            CONNECTOR_Z + 0.58,
            {
              accent: true
            }
          )
        );

        for (let index = 0; index < 37; index++) {
          group.add(
            createRoller(
              1.05,
              -6.3 + index * 0.35,
              0.79,
              CONNECTOR_Z,
              "connector",
              -4.2
            )
          );
        }

        scene.add(group);
      }

      function createBay(x, number) {
        const group = new THREE.Group();
        group.position.set(x, 0, 4.35);

        group.add(
          createRoundedBox(
            1.8,
            2.8,
            0.28,
            0.16,
            COLORS.blue,
            0,
            1.4,
            0,
            {
              accent: true
            }
          )
        );

        group.add(
          createRoundedBox(
            1.42,
            2.18,
            0.2,
            0.13,
            0xc5d2df,
            0,
            1.3,
            0.16
          )
        );

        for (let index = 0; index < 7; index++) {
          group.add(
            createBox(
              1.36,
              0.025,
              0.025,
              0x71869d,
              0,
              0.42 + index * 0.3,
              0.28
            )
          );
        }

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 64;

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.font = "bold 40px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(number), 64, 34);

        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(canvas),
            transparent: true
          })
        );

        sprite.position.set(0, 2.95, 0.18);
        sprite.scale.set(0.55, 0.28, 1);

        group.add(sprite);

        const led = createSphere(
          0.095,
          COLORS.green,
          0.68,
          0.16,
          0.25
        );

        led.material.emissive.setHex(COLORS.green);
        led.material.emissiveIntensity = 1.8;

        bayLeds.push(led);
        group.add(led);

        scene.add(group);
      }

      /* --------------------------------------------------
       * Depot
       * -------------------------------------------------- */

      function createDepot() {
        scene.add(
          createRoundedSurface(
            9,
            8.5,
            0.27,
            0.45,
            0xd2dfeb,
            16.2,
            0.14,
            0,
            {
              bevelSize: 0.03
            }
          )
        );

        scene.add(
          createRoundedBox(
            9,
            4.2,
            0.26,
            0.22,
            COLORS.wall,
            16.2,
            2.1,
            -4.1
          )
        );

        scene.add(
          createRoundedBox(
            0.27,
            4.2,
            8.2,
            0.14,
            COLORS.wall,
            11.82,
            2.1,
            0
          )
        );

        scene.add(
          createRoundedBox(
            0.27,
            4.2,
            8.2,
            0.14,
            COLORS.wall,
            20.58,
            2.1,
            0
          )
        );

        scene.add(
          createRoundedBox(
            9.2,
            0.24,
            0.36,
            0.1,
            COLORS.blue,
            16.2,
            4.1,
            -3.98,
            {
              accent: true
            }
          )
        );

        [13.6, 16.2, 18.8].forEach((x) => {
          scene.add(
            createRoundedBox(
              0.12,
              3.25,
              3,
              0.04,
              COLORS.steel,
              x - 0.8,
              1.63,
              -0.6
            )
          );

          scene.add(
            createRoundedBox(
              0.12,
              3.25,
              3,
              0.04,
              COLORS.steel,
              x + 0.8,
              1.63,
              -0.6
            )
          );

          [0.5, 1.35, 2.2, 3.05].forEach((y) => {
            scene.add(
              createRoundedBox(
                1.7,
                0.09,
                3,
                0.03,
                COLORS.steel,
                x,
                y,
                -0.6
              )
            );
          });
        });
      }

      /* --------------------------------------------------
       * Christmas details
       * -------------------------------------------------- */

      function createSnowHill(x, z, sx, sy, sz) {
        const hill = createSphere(
          1,
          COLORS.snow,
          x,
          sy * 0.45,
          z,
          22
        );

        hill.scale.set(sx, sy, sz);
        christmasGroup.add(hill);
      }

      function createElf(x, z, rotation = 0, coatColor = COLORS.christmasGreen) {
        const elf = new THREE.Group();

        elf.add(
          createRoundedBox(
            0.18,
            0.16,
            0.32,
            0.05,
            COLORS.brownDark,
            -0.16,
            0.08,
            0.08
          )
        );

        elf.add(
          createRoundedBox(
            0.18,
            0.16,
            0.32,
            0.05,
            COLORS.brownDark,
            0.16,
            0.08,
            0.08
          )
        );

        /*
         * Striped legs.
         */
        [
          [-0.16, 0.25, COLORS.white],
          [-0.16, 0.4, COLORS.red],
          [0.16, 0.25, COLORS.white],
          [0.16, 0.4, COLORS.red]
        ].forEach(([px, py, color]) => {
          elf.add(
            createRoundedBox(
              0.13,
              0.18,
              0.13,
              0.04,
              color,
              px,
              py,
              0
            )
          );
        });

        elf.add(
          createCylinder(
            0.28,
            0.34,
            0.65,
            coatColor,
            0,
            0.76,
            0
          )
        );

        elf.add(
          createRoundedBox(
            0.61,
            0.09,
            0.39,
            0.03,
            COLORS.dark,
            0,
            0.64,
            0
          )
        );

        elf.add(
          createRoundedBox(
            0.12,
            0.13,
            0.05,
            0.025,
            COLORS.yellow,
            0,
            0.64,
            0.22
          )
        );

        const leftArm = createRoundedBox(
          0.14,
          0.55,
          0.14,
          0.05,
          coatColor,
          -0.36,
          0.82,
          0
        );

        leftArm.rotation.z = -0.28;
        elf.add(leftArm);

        const rightArm = createRoundedBox(
          0.14,
          0.55,
          0.14,
          0.05,
          coatColor,
          0.36,
          0.82,
          0
        );

        rightArm.rotation.z = 0.28;
        elf.add(rightArm);

        elf.add(
          createSphere(
            0.1,
            COLORS.skin,
            -0.43,
            0.55,
            0
          )
        );

        elf.add(
          createSphere(
            0.1,
            COLORS.skin,
            0.43,
            0.55,
            0
          )
        );

        elf.add(
          createSphere(
            0.28,
            COLORS.skin,
            0,
            1.36,
            0
          )
        );

        /*
         * Pointed ears.
         */
        const leftEar = createCone(
          0.12,
          0.38,
          COLORS.skin,
          -0.34,
          1.38,
          0,
          10
        );

        leftEar.rotation.z = Math.PI / 2;
        elf.add(leftEar);

        const rightEar = createCone(
          0.12,
          0.38,
          COLORS.skin,
          0.34,
          1.38,
          0,
          10
        );

        rightEar.rotation.z = -Math.PI / 2;
        elf.add(rightEar);

        elf.add(
          createSphere(
            0.035,
            COLORS.dark,
            -0.09,
            1.43,
            0.24,
            10
          )
        );

        elf.add(
          createSphere(
            0.035,
            COLORS.dark,
            0.09,
            1.43,
            0.24,
            10
          )
        );

        elf.add(
          createCylinder(
            0.28,
            0.28,
            0.08,
            COLORS.white,
            0,
            1.62,
            0
          )
        );

        const elfHat = new THREE.Group();

        elfHat.position.set(0, 1.63, 0);
        elfHat.rotation.z = -0.18;

        elfHat.add(
          createCone(
            0.28,
            0.65,
            COLORS.red,
            0,
            0.325,
            0,
            16
          )
        );

        elfHat.add(
          createSphere(
            0.08,
            COLORS.yellow,
            0,
            0.68,
            0,
            12
          )
        );

        elf.add(elfHat);

        elf.position.set(x, 0, z);
        elf.rotation.y = rotation;

        christmasGroup.add(elf);
        return elf;
      }

      function createSanta(x, z, rotation = 0) {
        const santa = new THREE.Group();

        santa.add(
          createRoundedBox(
            0.28,
            0.5,
            0.32,
            0.07,
            COLORS.red,
            -0.23,
            0.34,
            0
          )
        );

        santa.add(
          createRoundedBox(
            0.28,
            0.5,
            0.32,
            0.07,
            COLORS.red,
            0.23,
            0.34,
            0
          )
        );

        santa.add(
          createRoundedBox(
            0.36,
            0.18,
            0.49,
            0.07,
            COLORS.dark,
            -0.23,
            0.1,
            0.1
          )
        );

        santa.add(
          createRoundedBox(
            0.36,
            0.18,
            0.49,
            0.07,
            COLORS.dark,
            0.23,
            0.1,
            0.1
          )
        );

        const body = createSphere(
          0.7,
          COLORS.red,
          0,
          1.12,
          0
        );

        body.scale.y = 1.08;
        santa.add(body);

        /*
         * The belt is a ring around the body; a box would disappear inside
         * the sphere. The buckle sits on the ring's front face.
         */
        santa.add(
          createCylinder(
            0.72,
            0.72,
            0.16,
            COLORS.dark,
            0,
            1,
            0,
            20
          )
        );

        santa.add(
          createRoundedBox(
            0.24,
            0.26,
            0.08,
            0.04,
            COLORS.yellow,
            0,
            1,
            0.7
          )
        );

        const leftArm = createCylinder(
          0.18,
          0.2,
          0.85,
          COLORS.red,
          -0.73,
          1.3,
          0
        );

        leftArm.rotation.z = -0.55;
        santa.add(leftArm);

        const rightArm = createCylinder(
          0.18,
          0.2,
          0.85,
          COLORS.red,
          0.73,
          1.3,
          0
        );

        rightArm.rotation.z = 0.78;
        santa.add(rightArm);

        santa.add(
          createSphere(
            0.17,
            COLORS.white,
            -0.92,
            1,
            0
          )
        );

        santa.add(
          createSphere(
            0.17,
            COLORS.white,
            0.98,
            1.02,
            0
          )
        );

        santa.add(
          createSphere(
            0.4,
            COLORS.skin,
            0,
            1.94,
            0
          )
        );

        /*
         * Beard.
         */
        [
          [0, 1.65, 0.23, 0.28],
          [-0.23, 1.72, 0.2, 0.2],
          [0.23, 1.72, 0.2, 0.2],
          [-0.1, 1.91, 0.33, 0.13],
          [0.1, 1.91, 0.33, 0.13]
        ].forEach(([px, py, pz, radius]) => {
          santa.add(
            createSphere(
              radius,
              COLORS.white,
              px,
              py,
              pz
            )
          );
        });

        santa.add(
          createSphere(
            0.04,
            COLORS.dark,
            -0.11,
            2.05,
            0.35
          )
        );

        santa.add(
          createSphere(
            0.04,
            COLORS.dark,
            0.11,
            2.05,
            0.35
          )
        );

        santa.add(
          createCylinder(
            0.43,
            0.43,
            0.11,
            COLORS.white,
            0,
            2.26,
            0,
            20
          )
        );

        /*
         * The hat is built around a pivot at its base so the cone and the
         * pompom stay perfectly aligned when the hat tilts.
         */
        const hatGroup = new THREE.Group();

        hatGroup.position.set(0, 2.3, 0);
        hatGroup.rotation.z = -0.22;

        hatGroup.add(
          createCone(
            0.42,
            0.9,
            COLORS.red,
            0,
            0.45,
            0,
            20
          )
        );

        hatGroup.add(
          createSphere(
            0.13,
            COLORS.white,
            0,
            0.92,
            0,
            14
          )
        );

        santa.add(hatGroup);

        santa.position.set(x, 0, z);
        santa.rotation.y = rotation;

        christmasGroup.add(santa);
        return santa;
      }

      function createSnowman(x, z, scale = 1) {
        const snowman = new THREE.Group();

        snowman.add(
          createSphere(
            0.54,
            COLORS.white,
            0,
            0.55,
            0
          )
        );

        snowman.add(
          createSphere(
            0.4,
            COLORS.white,
            0,
            1.3,
            0
          )
        );

        snowman.add(
          createSphere(
            0.29,
            COLORS.white,
            0,
            1.9,
            0
          )
        );

        snowman.add(
          createSphere(
            0.04,
            COLORS.dark,
            -0.1,
            1.98,
            0.25
          )
        );

        snowman.add(
          createSphere(
            0.04,
            COLORS.dark,
            0.1,
            1.98,
            0.25
          )
        );

        const nose = createCone(
          0.07,
          0.4,
          COLORS.orange,
          0,
          1.9,
          0.36,
          10
        );

        nose.rotation.x = Math.PI / 2;
        snowman.add(nose);

        snowman.add(
          createCylinder(
            0.31,
            0.31,
            0.1,
            COLORS.red,
            0,
            1.68,
            0
          )
        );

        snowman.add(
          createCylinder(
            0.35,
            0.35,
            0.08,
            COLORS.dark,
            0,
            2.16,
            0
          )
        );

        snowman.add(
          createCylinder(
            0.25,
            0.25,
            0.35,
            COLORS.dark,
            0,
            2.34,
            0
          )
        );

        /*
         * Coal buttons and twig arms make the snowman readable from the
         * default camera angle.
         */
        [1.16, 1.3, 1.44].forEach((y) => {
          snowman.add(
            createSphere(
              0.045,
              COLORS.dark,
              0,
              y,
              0.39,
              10
            )
          );
        });

        [-1, 1].forEach((side) => {
          const arm = createCylinder(
            0.03,
            0.045,
            0.72,
            COLORS.brownDark,
            side * 0.6,
            1.44,
            0,
            7
          );

          arm.rotation.z = side * -1.08;
          arm.rotation.x = 0.16;
          snowman.add(arm);
        });

        const scarfTail = createRoundedBox(
          0.16,
          0.44,
          0.08,
          0.03,
          COLORS.red,
          0.19,
          1.46,
          0.28
        );

        scarfTail.rotation.z = 0.14;
        snowman.add(scarfTail);

        snowman.position.set(x, 0, z);
        snowman.scale.setScalar(scale);

        christmasGroup.add(snowman);
        return snowman;
      }

      function createChristmasTree(x, z, scale = 1) {
        const tree = new THREE.Group();

        tree.add(
          createCylinder(
            0.18,
            0.25,
            1.2,
            COLORS.brownDark,
            0,
            0.6,
            0
          )
        );

        [
          [1.25, 1.75, 1.1],
          [1.05, 1.65, 1.8],
          [0.82, 1.45, 2.45]
        ].forEach(([radius, height, y]) => {
          tree.add(
            createCone(
              radius,
              height,
              COLORS.christmasGreen,
              0,
              y,
              0,
              18
            )
          );
        });

        const colors = [
          COLORS.red,
          COLORS.yellow,
          COLORS.blueLight,
          COLORS.purple,
          COLORS.white
        ];

        /*
         * The tree is three stacked cones. Ornaments and the light spiral
         * are placed on the actual cone surface so nothing floats.
         */
        const tiers = [
          [1.25, 0.225, 1.975],
          [1.05, 0.975, 2.625],
          [0.82, 1.725, 3.175]
        ];

        const treeSurfaceRadius = (y) => {
          let radius = 0;

          tiers.forEach(([coneRadius, bottom, top]) => {
            if (y >= bottom && y <= top) {
              radius = Math.max(
                radius,
                coneRadius * (1 - (y - bottom) / (top - bottom))
              );
            }
          });

          return radius;
        };

        for (let index = 0; index < 26; index++) {
          const angle = index * 2.399;
          const y = 0.95 + ((index * 0.0837) % 2.05);
          const radius = Math.max(
            0.16,
            treeSurfaceRadius(y) - 0.035
          );

          tree.add(
            createSphere(
              0.085,
              colors[index % colors.length],
              Math.cos(angle) * radius,
              y,
              Math.sin(angle) * radius,
              12
            )
          );
        }

        for (let index = 0; index < 44; index++) {
          const y = 0.9 + index * 0.045;
          const angle = index * 0.62;
          const radius = Math.max(
            0.12,
            treeSurfaceRadius(y) + 0.02
          );
          const color =
            index % 3 === 0
              ? 0xfff3c4
              : 0xffb347;

          tree.add(
            createSphere(
              0.035,
              color,
              Math.cos(angle) * radius,
              y,
              Math.sin(angle) * radius,
              8,
              {
                emissive: color,
                emissiveIntensity: 1.4
              }
            )
          );
        }

        const star = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.25, 0),
          createMaterial(COLORS.yellow, {
            emissive: COLORS.yellow,
            emissiveIntensity: 1.25
          })
        );

        star.position.y = 3.22;
        tree.add(star);

        tree.position.set(x, 0, z);
        tree.scale.setScalar(scale);

        christmasGroup.add(tree);
      }

      function createCandyCane(x, z, rotation = 0) {
        const cane = new THREE.Group();

        const bandHeight = 0.26;
        const bandCount = 7;
        const shaftTop = bandHeight * bandCount;

        for (let index = 0; index < bandCount; index++) {
          const band = createCylinder(
            0.085,
            0.085,
            bandHeight,
            index % 2
              ? COLORS.red
              : COLORS.white,
            0,
            bandHeight / 2 + index * bandHeight,
            0,
            14
          );

          band.material.roughness = 0.35;
          cane.add(band);
        }

        /*
         * The hook starts exactly at the top of the shaft and follows a
         * single arc, so the stripe bands stay continuous instead of
         * leaving a gap or an offset bend.
         */
        const hookRadius = 0.3;
        const hookSegments = 16;
        const hookArc = Math.PI * 1.08;
        const step = hookArc / hookSegments;

        for (let index = 0; index < hookSegments; index++) {
          const angle = (index + 0.5) * step;
          const segment = createCylinder(
            0.085,
            0.085,
            hookRadius * step * 1.18,
            Math.floor(index / 2) % 2 === 0
              ? COLORS.white
              : COLORS.red,
            -hookRadius + Math.cos(angle) * hookRadius,
            shaftTop + Math.sin(angle) * hookRadius,
            0,
            12
          );

          segment.rotation.z = angle;
          segment.material.roughness = 0.35;
          cane.add(segment);
        }

        cane.position.set(x, 0, z);
        cane.rotation.y = rotation;

        christmasGroup.add(cane);
      }

      function buildWreath(scale = 1) {
        const wreath = new THREE.Group();

        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.5, 0.14, 10, 26),
          createMaterial(COLORS.christmasGreen, {
            roughness: 0.55
          })
        );

        ring.castShadow = true;
        wreath.add(ring);

        const berryColors = [
          COLORS.red,
          COLORS.yellow,
          COLORS.white
        ];

        for (let index = 0; index < 12; index++) {
          const angle = (index / 12) * Math.PI * 2;
          const color =
            berryColors[index % berryColors.length];

          wreath.add(
            createSphere(
              0.075,
              color,
              Math.cos(angle) * 0.5,
              Math.sin(angle) * 0.5,
              0.15,
              10,
              {
                emissive: color,
                emissiveIntensity: 0.45
              }
            )
          );
        }

        [-1, 1].forEach((side) => {
          const loop = createSphere(
            0.16,
            COLORS.red,
            side * 0.15,
            -0.55,
            0.16,
            12
          );

          loop.scale.set(1, 0.72, 0.5);
          wreath.add(loop);
        });

        wreath.add(
          createSphere(
            0.09,
            COLORS.christmasDark,
            0,
            -0.55,
            0.2,
            10
          )
        );

        [-0.1, 0.1].forEach((offset) => {
          const tail = createRoundedBox(
            0.11,
            0.36,
            0.05,
            0.02,
            COLORS.red,
            offset,
            -0.82,
            0.14
          );

          tail.rotation.z = offset * 2.4;
          wreath.add(tail);
        });

        wreath.scale.setScalar(scale);

        return wreath;
      }

      function createWreath(x, y, z, scale = 1, rotationY = 0) {
        const wreath = buildWreath(scale);

        wreath.position.set(x, y, z);
        wreath.rotation.y = rotationY;

        christmasGroup.add(wreath);
      }

      function createGiftBox(
        x,
        z,
        size = 0.6,
        bodyColor = COLORS.red,
        ribbonColor = COLORS.yellow,
        rotation = 0
      ) {
        const gift = new THREE.Group();
        const height = size * 0.85;
        const centerY = height / 2 + 0.02;

        gift.add(
          createRoundedBox(
            size,
            height,
            size,
            size * 0.07,
            bodyColor,
            0,
            centerY,
            0
          )
        );

        gift.add(
          createBox(
            size + 0.035,
            height + 0.03,
            size * 0.16,
            ribbonColor,
            0,
            centerY,
            0
          )
        );

        gift.add(
          createBox(
            size * 0.16,
            height + 0.03,
            size + 0.035,
            ribbonColor,
            0,
            centerY,
            0
          )
        );

        [-1, 1].forEach((side) => {
          const loop = createSphere(
            0.12,
            ribbonColor,
            side * size * 0.17,
            height + 0.09,
            0,
            10
          );

          loop.scale.set(1, 0.62, 0.55);
          gift.add(loop);
        });

        gift.add(
          createSphere(
            0.07,
            ribbonColor,
            0,
            height + 0.08,
            0,
            10
          )
        );

        gift.position.set(x, 0, z);
        gift.rotation.y = rotation;

        christmasGroup.add(gift);
        return gift;
      }

      function createGingerbread(
        x,
        z,
        scale = 1,
        rotation = 0
      ) {
        const cookie = new THREE.Group();
        const dough = 0xc9813f;
        const icing = 0xfff6e2;

        cookie.add(
          createSphere(
            0.28,
            dough,
            0,
            1.55,
            0,
            16
          )
        );

        cookie.add(
          createRoundedBox(
            0.52,
            0.64,
            0.22,
            0.12,
            dough,
            0,
            1.02,
            0
          )
        );

        [-1, 1].forEach((side) => {
          const arm = createRoundedBox(
            0.44,
            0.15,
            0.2,
            0.07,
            dough,
            side * 0.4,
            1.13,
            0
          );

          arm.rotation.z = side * -0.42;
          cookie.add(arm);

          const leg = createRoundedBox(
            0.2,
            0.56,
            0.2,
            0.08,
            dough,
            side * 0.15,
            0.42,
            0
          );

          leg.rotation.z = side * 0.12;
          cookie.add(leg);
        });

        [1.1, 0.98, 0.86].forEach((y) => {
          cookie.add(
            createSphere(
              0.045,
              icing,
              0,
              y,
              0.115,
              8
            )
          );
        });

        [-0.095, 0.095].forEach((eyeX) => {
          cookie.add(
            createSphere(
              0.035,
              COLORS.dark,
              eyeX,
              1.61,
              0.25,
              8
            )
          );
        });

        for (let index = -1; index <= 1; index++) {
          cookie.add(
            createSphere(
              0.03,
              icing,
              index * 0.07,
              1.48 - Math.abs(index) * 0.015,
              0.255,
              8
            )
          );
        }

        const bow = createRoundedBox(
          0.12,
          0.08,
          0.06,
          0.02,
          COLORS.red,
          0,
          1.34,
          0.12
        );

        cookie.add(bow);

        cookie.position.set(x, 0, z);
        cookie.rotation.y = rotation;
        cookie.scale.setScalar(scale);

        christmasGroup.add(cookie);
        return cookie;
      }

      function createLightString(
        start,
        end,
        {
          count = 18,
          sag = 0.3,
          radius = 0.055
        } = {}
      ) {
        const startPoint = new THREE.Vector3(...start);
        const endPoint = new THREE.Vector3(...end);
        const middle = startPoint
          .clone()
          .add(endPoint)
          .multiplyScalar(0.5);

        middle.y -= sag;

        const curve = new THREE.QuadraticBezierCurve3(
          startPoint,
          middle,
          endPoint
        );

        const cable = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 28, 0.012, 5, false),
          createMaterial(0x26201a)
        );

        cable.castShadow = false;
        christmasGroup.add(cable);

        const palette = [
          0xfff2c0,
          COLORS.red,
          COLORS.yellow,
          0x2fe07a,
          COLORS.blueLight
        ];

        for (let index = 0; index < count; index++) {
          const point = curve.getPoint(
            (index + 0.5) / count
          );
          const color = palette[index % palette.length];

          christmasGroup.add(
            createSphere(
              radius,
              color,
              point.x,
              point.y,
              point.z,
              8,
              {
                emissive: color,
                emissiveIntensity: 1.6,
                castShadow: false
              }
            )
          );
        }
      }

      function createNorthPoleSign(x, z, rotation = 0) {
        const sign = new THREE.Group();

        for (let index = 0; index < 7; index++) {
          sign.add(
            createCylinder(
              0.075,
              0.075,
              0.34,
              index % 2
                ? COLORS.white
                : COLORS.red,
              0,
              0.17 + index * 0.34,
              0,
              10
            )
          );
        }

        sign.add(
          createRoundedBox(
            2.55,
            0.9,
            0.1,
            0.08,
            COLORS.brownDark,
            0,
            2.15,
            0
          )
        );

        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 180;

        const context = canvas.getContext("2d");
        context.fillStyle = "#5c3014";
        context.fillRect(0, 0, 512, 180);
        context.strokeStyle = "#ffe6b0";
        context.lineWidth = 10;
        context.strokeRect(9, 9, 494, 162);
        context.fillStyle = "#fff4d6";
        context.font = "bold 66px Georgia, serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("NORTH POLE", 256, 92);

        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;

        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(2.4, 0.84),
          new THREE.MeshBasicMaterial({ map: texture })
        );

        face.position.set(0, 2.15, 0.08);
        sign.add(face);

        sign.position.set(x, 0, z);
        sign.rotation.y = rotation;

        christmasGroup.add(sign);
      }

      function createLampPost(x, z, rotation = 0) {
        const lamp = new THREE.Group();

        lamp.add(
          createCylinder(
            0.26,
            0.34,
            0.18,
            COLORS.steel,
            0,
            0.09,
            0,
            14
          )
        );

        lamp.add(
          createCylinder(
            0.09,
            0.13,
            3,
            COLORS.steel,
            0,
            1.55,
            0,
            10
          )
        );

        lamp.add(
          createRoundedBox(
            0.44,
            0.52,
            0.44,
            0.08,
            COLORS.steel,
            0,
            3.06,
            0
          )
        );

        const glow = createSphere(
          0.25,
          0xffd27a,
          0,
          3.06,
          0,
          14,
          {
            emissive: 0xffb43a,
            emissiveIntensity: 2.1
          }
        );

        lamp.add(glow);

        const cap = createCone(
          0.4,
          0.26,
          COLORS.steel,
          0,
          3.46,
          0,
          4
        );

        cap.rotation.y = Math.PI / 4;
        lamp.add(cap);

        const wreath = buildWreath(0.34);
        wreath.position.set(0, 2.32, 0.12);
        lamp.add(wreath);

        const light = new THREE.PointLight(
          0xffb04a,
          1.2,
          13,
          2
        );

        light.position.set(0, 3.06, 0);
        lamp.add(light);

        lamp.position.set(x, 0, z);
        lamp.rotation.y = rotation;

        christmasGroup.add(lamp);
      }

      /* --------------------------------------------------
       * Corporate decoration set
       * -------------------------------------------------- */

      function createCorporateLamp(x, z, rotation = 0) {
        const lamp = new THREE.Group();

        lamp.add(
          createCylinder(0.06, 0.11, 3.2, COLORS.steel, 0, 1.6, 0, 10)
        );

        lamp.add(
          createRoundedBox(
            0.52,
            0.12,
            0.14,
            0.04,
            COLORS.steel,
            0.3,
            3.26,
            0
          )
        );

        lamp.add(
          createRoundedBox(
            0.5,
            0.18,
            0.34,
            0.05,
            COLORS.steel,
            0.56,
            3.14,
            0
          )
        );

        lamp.add(
          createBox(0.36, 0.05, 0.24, 0xfff0c4, 0.56, 3.03, 0, {
            emissive: 0xffd27a,
            emissiveIntensity: 1.4,
            castShadow: false
          })
        );

        lamp.position.set(x, 0, z);
        lamp.rotation.y = rotation;
        corporateSurfaceGroup.add(lamp);
      }

      function createBench(x, z, rotation = 0) {
        const bench = new THREE.Group();
        const wood = 0xa9754a;

        for (let row = -1; row <= 1; row++) {
          bench.add(
            createRoundedBox(
              1.9,
              0.1,
              0.24,
              0.04,
              wood,
              0,
              0.48,
              row * 0.28,
              {
                bevelSize: 0.02
              }
            )
          );
        }

        [-0.78, 0.78].forEach((legX) => {
          bench.add(
            createBox(0.1, 0.48, 0.8, COLORS.steel, legX, 0.24, 0.05)
          );
          bench.add(
            createBox(0.08, 0.6, 0.1, COLORS.steel, legX, 0.78, -0.36)
          );
        });

        [0.72, 0.94].forEach((backY) => {
          bench.add(
            createRoundedBox(
              1.9,
              0.16,
              0.08,
              0.03,
              wood,
              0,
              backY,
              -0.36,
              {
                bevelSize: 0.015
              }
            )
          );
        });

        bench.position.set(x, 0, z);
        bench.rotation.y = rotation;
        corporateSurfaceGroup.add(bench);
      }

      function createHedge(x, z, width, depth, rotation = 0) {
        const hedge = new THREE.Group();

        hedge.add(
          createRoundedBox(
            width,
            0.62,
            depth,
            0.2,
            0x2f7d43,
            0,
            0.34,
            0,
            {
              bevelSize: 0.06
            }
          )
        );

        hedge.add(
          createRoundedBox(
            width - 0.16,
            0.28,
            depth - 0.12,
            0.12,
            0x3f9c55,
            0,
            0.74,
            0,
            {
              bevelSize: 0.04
            }
          )
        );

        const clumps = Math.max(2, Math.round(width / 1.1));

        for (let index = 0; index < clumps; index++) {
          const bush = createSphere(
            0.26,
            index % 2 ? 0x3f9c55 : 0x2f7d43,
            -width / 2 + (width / (clumps - 1)) * index,
            0.88,
            0,
            10
          );

          bush.scale.set(1, 0.72, 1);
          hedge.add(bush);
        }

        hedge.position.set(x, 0, z);
        hedge.rotation.y = rotation;
        corporateSurfaceGroup.add(hedge);
      }

      function createPlanter(x, z, scale = 1) {
        const planter = new THREE.Group();

        planter.add(
          createRoundedBox(1.1, 0.5, 1.1, 0.08, 0x9aa7b4, 0, 0.25, 0, {
            bevelSize: 0.03
          })
        );

        planter.add(
          createBox(0.94, 0.06, 0.94, 0x4a3524, 0, 0.51, 0)
        );

        [
          [0, 0, 0.68],
          [-0.26, 0.12, 0.6],
          [0.26, -0.1, 0.58]
        ].forEach(([px, pz, py]) => {
          const bush = createSphere(0.32, 0x2f9e44, px, py, pz, 10);

          bush.scale.set(1, 0.8, 1);
          planter.add(bush);
        });

        planter.position.set(x, 0, z);
        planter.scale.setScalar(scale);
        corporateSurfaceGroup.add(planter);
      }

      function createBollard(x, z) {
        const bollard = new THREE.Group();

        bollard.add(
          createCylinder(0.11, 0.13, 0.95, COLORS.steel, 0, 0.48, 0, 10)
        );

        bollard.add(
          createCylinder(0.135, 0.135, 0.1, 0xffd23f, 0, 0.82, 0, 10)
        );

        bollard.add(
          createCylinder(
            0.17,
            0.19,
            0.08,
            COLORS.steelLight,
            0,
            0.04,
            0,
            10
          )
        );

        bollard.position.set(x, 0, z);
        corporateSurfaceGroup.add(bollard);
      }

      function createPalletStack(x, z, rotation = 0) {
        const stack = new THREE.Group();

        for (let level = 0; level < 3; level++) {
          const y = level * 0.16;

          [-0.42, 0, 0.42].forEach((offset) => {
            stack.add(
              createBox(1.3, 0.06, 0.22, 0xa9754a, 0, y + 0.03, offset, {
                castShadow: false
              })
            );
          });

          [-0.55, 0.55].forEach((offset) => {
            stack.add(
              createBox(0.14, 0.1, 1.05, 0x8c5f39, offset, y + 0.02, 0)
            );
          });
        }

        stack.add(
          createRoundedBox(1.06, 0.58, 0.9, 0.05, 0xd8b98a, 0, 0.62, 0)
        );

        stack.add(
          createBox(1.08, 0.08, 0.22, COLORS.white, 0, 0.74, 0, {
            castShadow: false
          })
        );

        stack.position.set(x, 0, z);
        stack.rotation.y = rotation;
        corporateSurfaceGroup.add(stack);
      }

      function createTrafficCone(x, z) {
        const cone = new THREE.Group();

        cone.add(
          createBox(0.5, 0.06, 0.5, 0x2b2f36, 0, 0.03, 0, {
            castShadow: false
          })
        );

        cone.add(createCone(0.22, 0.62, 0xff6a00, 0, 0.34, 0, 14));

        cone.add(
          createCylinder(0.15, 0.19, 0.1, COLORS.white, 0, 0.42, 0, 14)
        );

        cone.position.set(x, 0, z);
        corporateSurfaceGroup.add(cone);
      }

      function createGuardKiosk(x, z, rotation = 0) {
        const kiosk = new THREE.Group();

        kiosk.add(
          createRoundedBox(1.5, 2.1, 1.5, 0.14, COLORS.wall, 0, 1.05, 0, {
            bevelSize: 0.04
          })
        );

        kiosk.add(
          createRoundedBox(
            1.78,
            0.18,
            1.78,
            0.1,
            COLORS.steel,
            0,
            2.18,
            0,
            {
              bevelSize: 0.03
            }
          )
        );

        kiosk.add(
          createBox(1.02, 0.78, 0.06, 0x8ecae6, 0, 1.45, 0.76, {
            emissive: 0x3b82a0,
            emissiveIntensity: 0.7,
            castShadow: false
          })
        );

        kiosk.add(
          createBox(0.46, 0.9, 0.06, COLORS.steel, 0, 0.52, 0.76, {
            castShadow: false
          })
        );

        kiosk.add(
          createBox(1.62, 0.14, 1.62, 0x9aa7b4, 0, 0.07, 0, {
            castShadow: false
          })
        );

        kiosk.position.set(x, 0, z);
        kiosk.rotation.y = rotation;
        corporateSurfaceGroup.add(kiosk);
      }

      function createCampusSign(x, z, rotation = 0) {
        const sign = new THREE.Group();

        [-0.72, 0.72].forEach((postX) => {
          sign.add(
            createCylinder(0.07, 0.07, 1.9, COLORS.steel, postX, 0.95, 0, 8)
          );
        });

        sign.add(
          createRoundedBox(
            2.0,
            0.85,
            0.12,
            0.06,
            COLORS.blueDark,
            0,
            1.62,
            0,
            {
              bevelSize: 0.025
            }
          )
        );

        [
          [1.82, 0.1, COLORS.yellow],
          [1.55, 0.09, COLORS.white],
          [1.3, 0.08, COLORS.blueLight]
        ].forEach(([barY, barHeight, color]) => {
          sign.add(
            createBox(1.62, barHeight, 0.05, color, 0, barY, 0.07, {
              castShadow: false
            })
          );
        });

        sign.position.set(x, 0, z);
        sign.rotation.y = rotation;
        corporateSurfaceGroup.add(sign);
      }

      function createBikeRack(x, z, rotation = 0) {
        const rack = new THREE.Group();

        for (let slot = -1; slot <= 1; slot++) {
          const hoop = new THREE.Mesh(
            new THREE.TorusGeometry(0.32, 0.04, 8, 20, Math.PI),
            createMaterial(COLORS.steelLight, {
              metalness: 0.45,
              roughness: 0.35
            })
          );

          hoop.position.set(slot * 0.58, 0.32, 0);
          rack.add(hoop);
        }

        rack.add(
          createBox(1.5, 0.06, 0.06, COLORS.steel, 0, 0.03, 0, {
            castShadow: false
          })
        );

        rack.position.set(x, 0, z);
        rack.rotation.y = rotation;
        corporateSurfaceGroup.add(rack);
      }

      function createCrateStack(x, z, rotation = 0) {
        const stack = new THREE.Group();

        stack.add(
          createRoundedBox(1.15, 0.62, 1.0, 0.06, 0xc99a63, 0, 0.31, 0)
        );

        stack.add(
          createRoundedBox(0.82, 0.5, 0.74, 0.05, 0xb98750, 0.06, 0.87, 0)
        );

        [-0.42, 0.42].forEach((offset) => {
          stack.add(
            createBox(0.1, 0.64, 1.02, 0x8c5f39, offset, 0.32, 0, {
              castShadow: false
            })
          );
        });

        stack.add(
          createBox(0.86, 0.09, 0.78, COLORS.white, 0.06, 0.98, 0, {
            castShadow: false
          })
        );

        stack.position.set(x, 0, z);
        stack.rotation.y = rotation;
        corporateSurfaceGroup.add(stack);
      }

      /* --------------------------------------------------
       * Additional Christmas decoration builders
       * -------------------------------------------------- */

      function createSled(x, z, rotation = 0) {
        const sled = new THREE.Group();
        const wood = 0xb5622f;

        [-0.45, 0.45].forEach((runnerX) => {
          sled.add(
            createBox(0.08, 0.08, 1.7, COLORS.steel, runnerX, 0.12, 0, {
              castShadow: false
            })
          );

          const curl = new THREE.Mesh(
            new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI * 1.3),
            createMaterial(COLORS.steel)
          );

          curl.position.set(runnerX, 0.24, 0.82);
          curl.rotation.set(0, Math.PI / 2, 0);
          sled.add(curl);
        });

        [-0.42, 0, 0.42].forEach((slatZ) => {
          sled.add(
            createRoundedBox(1.0, 0.07, 0.3, 0.03, wood, 0, 0.22, slatZ, {
              bevelSize: 0.02
            })
          );
        });

        sled.add(
          createRoundedBox(0.92, 0.5, 0.1, 0.05, COLORS.red, 0, 0.42, -0.55)
        );

        sled.position.set(x, 0, z);
        sled.rotation.y = rotation;
        christmasGroup.add(sled);
      }

      function createNutcracker(x, z, rotation = 0) {
        const figure = new THREE.Group();

        [-0.16, 0.16].forEach((legX) => {
          figure.add(
            createBox(0.18, 0.5, 0.2, COLORS.white, legX, 0.25, 0)
          );
          figure.add(
            createBox(0.22, 0.12, 0.3, COLORS.dark, legX, 0.06, 0.03)
          );
        });

        figure.add(
          createCylinder(0.28, 0.32, 0.75, 0x1f3fbf, 0, 0.86, 0, 12)
        );

        figure.add(
          createCylinder(0.3, 0.3, 0.09, COLORS.yellow, 0, 0.58, 0, 12)
        );

        [-0.11, 0.11].forEach((buttonX) => {
          figure.add(
            createSphere(0.04, COLORS.yellow, buttonX, 0.98, 0.29, 8)
          );
        });

        [-1, 1].forEach((side) => {
          figure.add(
            createRoundedBox(
              0.14,
              0.6,
              0.14,
              0.05,
              COLORS.red,
              side * 0.36,
              0.9,
              0
            )
          );
          figure.add(
            createSphere(0.09, COLORS.skin, side * 0.36, 1.24, 0, 8)
          );
        });

        figure.add(createSphere(0.24, COLORS.skin, 0, 1.52, 0, 14));

        [-0.09, 0.09].forEach((eyeX) => {
          figure.add(
            createBox(0.06, 0.09, 0.05, COLORS.dark, eyeX, 1.58, 0.21, {
              castShadow: false
            })
          );
        });

        figure.add(
          createBox(0.28, 0.16, 0.06, COLORS.white, 0, 1.36, 0.19, {
            castShadow: false
          })
        );

        figure.add(
          createCylinder(0.26, 0.28, 0.18, COLORS.yellow, 0, 1.78, 0, 12)
        );

        figure.add(createCone(0.25, 0.5, COLORS.red, 0, 2.12, 0, 12));

        figure.position.set(x, 0, z);
        figure.rotation.y = rotation;
        christmasGroup.add(figure);
        return figure;
      }

      function createSnowLantern(x, z, rotation = 0) {
        const lantern = new THREE.Group();

        lantern.add(
          createCylinder(0.08, 0.11, 0.7, COLORS.steel, 0, 0.35, 0, 8)
        );

        lantern.add(
          createRoundedBox(0.42, 0.5, 0.42, 0.08, COLORS.steel, 0, 0.92, 0)
        );

        lantern.add(
          createBox(0.32, 0.36, 0.32, 0xfff0bf, 0, 0.92, 0, {
            emissive: 0xffc247,
            emissiveIntensity: 1.7,
            castShadow: false
          })
        );

        const capSnow = createSphere(0.34, COLORS.snow, 0, 1.22, 0, 10);

        capSnow.scale.set(1, 0.35, 1);
        lantern.add(capSnow);

        lantern.position.set(x, 0, z);
        lantern.rotation.y = rotation;
        christmasGroup.add(lantern);
      }

      function createReindeerDecor(x, z, rotation, scale) {
        const deer = createReindeer(x, z);

        deer.rotation.y = rotation;
        deer.scale.setScalar(scale);
        christmasGroup.add(deer);
        return deer;
      }

      /* --------------------------------------------------
       * Clickable decoration actors (Christmas figures)
       * -------------------------------------------------- */

      const decorActors = [];

      function registerDecorActor(group, type) {
        if (!group) {
          return null;
        }

        const actor = {
          group,
          type,
          basePosition: group.position.clone(),
          baseRotation: group.rotation.clone(),
          baseScale: group.scale.clone(),
          active: null
        };

        group.userData.decorActor = actor;
        group.traverse((child) => {
          if (child.isMesh || child.isSprite) {
            child.userData.decorActor = actor;
          }
        });

        decorActors.push(actor);
        return actor;
      }

      function clearDecorActor(actor) {
        if (!actor) return;
        actor.active = null;
        actor.group.position.copy(actor.basePosition);
        actor.group.rotation.copy(actor.baseRotation);
        actor.group.scale.copy(actor.baseScale);
      }

      function triggerDecorActor(actor, at = performance.now() / 1000) {
        if (!actor) return;

        actor.group.position.copy(actor.basePosition);
        actor.group.rotation.copy(actor.baseRotation);
        actor.group.scale.copy(actor.baseScale);

        const modes = ["jump", "dance", "circle"];
        const mode = modes[Math.floor(Math.random() * modes.length)];
        const duration = 1.4 + Math.random() * 1.4;

        actor.active = {
          mode,
          start: at,
          duration,
          origin: actor.basePosition.clone(),
          baseRotY: actor.baseRotation.y,
          radius: 0.45 + Math.random() * 0.45,
          spin: (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 1.4),
          jumps: 2 + Math.floor(Math.random() * 3),
          seed: Math.random() * Math.PI * 2
        };
      }

      function updateDecorActors(elapsed) {
        decorActors.forEach((actor) => {
          const a = actor.active;
          if (!a) {
            return;
          }

          const t = (elapsed - a.start) / a.duration;
          if (t >= 1) {
            clearDecorActor(actor);
            return;
          }

          const p = Math.max(0, Math.min(1, t));
          const g = actor.group;

          if (a.mode === "jump") {
            const cycles = Math.sin(p * Math.PI * a.jumps);
            const hop = Math.abs(cycles) * (1.05 + 0.25 * Math.sin(a.seed + p * 8));
            g.position.copy(a.origin);
            g.position.y = a.origin.y + hop;
            g.rotation.set(
              actor.baseRotation.x,
              a.baseRotY + Math.sin(p * Math.PI * 2) * 0.18,
              actor.baseRotation.z
            );
            const squash = 1 - 0.08 * Math.abs(cycles);
            g.scale.set(actor.baseScale.x * (1 + (1 - squash) * 0.5), actor.baseScale.y * squash, actor.baseScale.z * (1 + (1 - squash) * 0.5));
            return;
          }

          if (a.mode === "dance") {
            g.position.copy(a.origin);
            g.position.y = a.origin.y + Math.abs(Math.sin(p * Math.PI * 6)) * 0.55;
            g.rotation.set(
              actor.baseRotation.x + Math.sin(p * Math.PI * 8) * 0.08,
              a.baseRotY + Math.sin(p * Math.PI * 4) * 0.7,
              actor.baseRotation.z + Math.sin(p * Math.PI * 6 + a.seed) * 0.18
            );
            const pulse = 1 + Math.sin(p * Math.PI * 6) * 0.05;
            g.scale.set(actor.baseScale.x * pulse, actor.baseScale.y, actor.baseScale.z * pulse);
            return;
          }

          if (a.mode === "circle") {
            const angle = p * Math.PI * 2;
            g.position.set(
              a.origin.x + Math.cos(angle + a.seed) * a.radius,
              a.origin.y + Math.abs(Math.sin(p * Math.PI * 4)) * 0.22,
              a.origin.z + Math.sin(angle + a.seed) * a.radius
            );
            g.rotation.set(
              actor.baseRotation.x,
              a.baseRotY - (angle + a.seed) + Math.PI / 2,
              actor.baseRotation.z
            );
            g.scale.copy(actor.baseScale);
          }
        });
      }

      function decorActorUnderPointer() {
        raycaster.setFromCamera(pointer, camera);
        if (decorActors.length === 0) {
          return null;
        }
        const groups = decorActors.map((a) => a.group);
        const hits = raycaster.intersectObjects(groups, true);
        for (const hit of hits) {
          let actor = hit.object.userData.decorActor;
          let node = hit.object;
          while (!actor && node.parent) {
            node = node.parent;
            actor = node.userData.decorActor;
          }
          if (actor) {
            return actor;
          }
        }
        return null;
      }

      /* --------------------------------------------------
       * Table-driven decoration dispatcher
       * -------------------------------------------------- */

      function createDecorItem(item) {
        const {
          type,
          x,
          z,
          rotation = 0,
          scale = 1
        } = item;

        switch (type) {
          /* corporate */
          case "lampPost":
            createCorporateLamp(x, z, rotation);
            break;
          case "bench":
            createBench(x, z, rotation);
            break;
          case "hedge":
            createHedge(x, z, item.w, item.d, rotation);
            break;
          case "planter":
            createPlanter(x, z, scale);
            break;
          case "bollard":
            createBollard(x, z);
            break;
          case "pallet":
            createPalletStack(x, z, rotation);
            break;
          case "trafficCone":
            createTrafficCone(x, z);
            break;
          case "guardKiosk":
            createGuardKiosk(x, z, rotation);
            break;
          case "campusSign":
            createCampusSign(x, z, rotation);
            break;
          case "bikeRack":
            createBikeRack(x, z, rotation);
            break;
          case "crateStack":
            createCrateStack(x, z, rotation);
            break;

          /* christmas */
          case "christmasTree":
            createChristmasTree(x, z, scale);
            break;
          case "snowman":
            registerDecorActor(createSnowman(x, z, scale), "snowman");
            break;
          case "candyCane":
            createCandyCane(x, z, rotation);
            break;
          case "gift":
            createGiftBox(
              x,
              z,
              scale,
              item.color,
              item.ribbon,
              rotation
            );
            break;
          case "nutcracker":
            registerDecorActor(createNutcracker(x, z, rotation), "nutcracker");
            break;
          case "sled":
            createSled(x, z, rotation);
            break;
          case "snowLantern":
            createSnowLantern(x, z, rotation);
            break;
          case "snowPile":
            createSnowHill(x, z, item.w / 2, 0.34, item.d / 2);
            break;
          case "snowHill":
            createSnowHill(
              x,
              z,
              item.w / 2,
              item.w * 0.3,
              item.d / 2
            );
            break;
          case "reindeer":
            registerDecorActor(createReindeerDecor(x, z, rotation, scale), "reindeer");
            break;
          case "gingerbread":
            registerDecorActor(createGingerbread(x, z, scale, rotation), "gingerbread");
            break;
          case "northPoleSign":
            createNorthPoleSign(x, z, rotation);
            break;
          case "elf":
            registerDecorActor(createElf(x, z, rotation), "elf");
            break;
          case "santa":
            registerDecorActor(createSanta(x, z, rotation), "santa");
            break;

          /* halloween */
          case "pumpkin":
            createPumpkin(x, z, scale);
            break;
          case "tombstone":
            createTombstone(x, z, rotation);
            break;
          case "deadTree":
            createDeadTree(x, z, scale, rotation);
            break;
          case "hayBale":
            createHayBale(x, z, rotation);
            break;
          case "scarecrow":
            createScarecrow(x, z, rotation);
            break;
          case "cauldron":
            createCauldron(x, z, scale);
            break;
          case "fence":
            createFence(x, z, item.w, item.d, rotation);
            break;
          case "fog":
            createFogPatch(x, z, scale);
            break;
          case "ghostLantern":
            createGhostLantern(x, z);
            break;

          /* summer */
          case "palmTree":
            createPalmTree(x, z, scale);
            break;
          case "beachUmbrella":
            createBeachUmbrella(x, z);
            break;
          case "sunbed":
            createSunbed(x, z, rotation);
            break;
          case "beachBall":
            createBeachBall(x, z, scale);
            break;
          case "sandPatch":
            createSandPatch(x, z, item.w, item.d);
            break;
          case "towel":
            createTowel(x, z, rotation);
            break;
          case "surfboard":
            createSurfboard(x, z, rotation);
            break;
          case "cooler":
            createCooler(x, z, rotation);
            break;
          case "iceCreamCart":
            createIceCreamCart(x, z, rotation);
            break;
          case "picnicTable":
            createPicnicTable(x, z, rotation);
            break;
          case "buoy":
            createBuoy(x, z, scale);
            break;

          /* neon */
          case "neonPylon":
            createNeonPylon(x, z, rotation);
            break;
          case "glowCrate":
            createGlowCrate(x, z, scale);
            break;
          case "holoBillboard":
            createHoloBillboard(x, z, rotation);
            break;
          case "neonBarrel":
            createNeonBarrel(x, z, scale);
            break;
          case "lightBeam":
            createLightBeam(x, z, scale);
            break;

          default:
            throw new Error(`Unknown decoration type "${type}"`);
        }
      }

      function createCorporateDetails() {
        THEME_DECOR.corporate.forEach(createDecorItem);
      }

      createCorporateDetails();

      function createChristmasDetails() {
        createSnowHill(-24, -10, 4.2, 1.25, 3.2);
        createSnowHill(-16, -14, 5, 1.45, 2.6);
        createSnowHill(4, -15, 7, 1.4, 2.2);
        createSnowHill(24, -4, 3.6, 1.2, 5);
        createSnowHill(22, 14, 4.6, 1.4, 3);
        createSnowHill(-20, 15, 5.2, 1.3, 2.8);

        registerDecorActor(createElf(-7.35, 0.5, Math.PI / 2), "elf");
        registerDecorActor(createElf(-3.25, -1.1, Math.PI / 2, COLORS.christmas), "elf");
        registerDecorActor(createElf(0.8, 1.2, -Math.PI / 2), "elf");
        registerDecorActor(createElf(4.8, -0.6, -Math.PI / 2, COLORS.christmas), "elf");
        registerDecorActor(createElf(8, 2.2, -Math.PI / 2), "elf");

        registerDecorActor(createSanta(-11.3, 5.7, Math.PI / 3), "santa");

        registerDecorActor(createSnowman(-10.5, -4.5, 0.9), "snowman");
        registerDecorActor(createSnowman(10, 5, 1), "snowman");
        registerDecorActor(createSnowman(22.2, 6.4, 0.85), "snowman");

        createChristmasTree(-11.2, -8.2, 1.08);
        createChristmasTree(22, -8, 1);
        createChristmasTree(-20, 12, 0.9);
        createChristmasTree(14.5, 12.6, 0.9);
        createChristmasTree(-25.5, 6.5, 0.9);

        createCandyCane(-8.2, 5.1);
        createCandyCane(8.2, 5.1, Math.PI);
        createCandyCane(12.2, 5.2);
        createCandyCane(20, 5.2, Math.PI);
        createCandyCane(-19.6, 6.9, Math.PI);

        /*
         * Hanging decorations on the buildings.
         */
        /*
         * Bay 4 is the release lane; keep its door clear for the forklift.
         */
        LANE_X.slice(0, 3).forEach((x) => {
          createWreath(x, 2.2, 4.56, 0.34);
        });

        createWreath(-19.2, 4.65, -5.82, 1);
        createWreath(17.8, 5.3, -6.72, 1);
        createWreath(16.2, 2.9, -3.92, 0.85);

        createLightString(
          [-9, 3.72, 5.14],
          [9, 3.72, 5.14],
          { count: 34, sag: 0.55, radius: 0.06 }
        );

        createLightString(
          [-22.7, 5.55, -5.76],
          [-15.7, 5.55, -5.76],
          { count: 16, sag: 0.3 }
        );

        createLightString(
          [14.05, 5.97, -6.66],
          [21.55, 5.97, -6.66],
          { count: 16, sag: 0.3 }
        );

        createLightString(
          [11.95, 4.28, -3.9],
          [20.45, 4.28, -3.9],
          { count: 16, sag: 0.28 }
        );

        /*
         * Warm lamps at the plaza entrance.
         */
        createLampPost(-9.8, 6.8, 0.1);
        createLampPost(9.8, 6.8, -0.1);

        /*
         * Gift piles around Santa, the trees and the depot.
         */
        createGiftBox(-12.6, 5, 0.62, COLORS.red, COLORS.yellow);
        createGiftBox(-12, 5.55, 0.46, COLORS.purple, COLORS.white, 0.3);
        createGiftBox(-13.1, 5.7, 0.5, COLORS.green, COLORS.red, -0.4);

        createGiftBox(-12.6, -7.2, 0.55, COLORS.yellow, COLORS.red, 0.2);
        createGiftBox(-10.1, -7, 0.45, COLORS.blue, COLORS.white, -0.3);
        createGiftBox(-12.4, -8.6, 0.6, COLORS.red, COLORS.yellow, 0.5);

        createGiftBox(20.2, -7, 0.55, COLORS.green, COLORS.red, -0.2);
        createGiftBox(21.4, -6.7, 0.42, COLORS.red, COLORS.white, 0.4);

        createGiftBox(12.9, 4.6, 0.6, COLORS.purple, COLORS.yellow, 0.15);
        createGiftBox(13.8, 4.4, 0.48, COLORS.yellow, COLORS.red, -0.35);

        createGiftBox(-21.6, 12, 0.55, COLORS.red, COLORS.white, 0.25);
        createGiftBox(-18.6, 11.6, 0.45, COLORS.blue, COLORS.yellow, -0.3);

        createGiftBox(11.2, 6.1, 0.5, COLORS.red, COLORS.yellow, 0.35);

        /*
         * Gingerbread figures and a pair of reindeer.
         */
        registerDecorActor(createGingerbread(-6, 6.9, 1, 0.25), "gingerbread");
        registerDecorActor(createGingerbread(11.6, 7.1, 1, -0.2), "gingerbread");
        registerDecorActor(createGingerbread(18.5, 7, 0.95, 0.1), "gingerbread");

        [
          [14.4, 6.3, -Math.PI / 2 + 0.15, 1.05],
          [16.6, 5.9, -Math.PI / 2 - 0.1, 0.92]
        ].forEach(([x, z, rotation, scale]) => {
          registerDecorActor(createReindeerDecor(x, z, rotation, scale), "reindeer");
        });

        createNorthPoleSign(24.2, 6.5, -0.35);
      }

      createChristmasDetails();
      christmasGroup.visible = false;

      /* --------------------------------------------------
       * Halloween decorations
       * -------------------------------------------------- */

      const animatedBats = [];
      const driftingFog = [];

      function createPumpkin(x, z, scale = 1) {
        const pumpkin = new THREE.Group();
        const body = createSphere(
          0.56,
          0xff7a18,
          0,
          0.4,
          0,
          18,
          {
            roughness: 0.58
          }
        );

        body.scale.set(0.95, 0.78, 0.9);
        pumpkin.add(body);

        /*
         * Thin ellipsoids rotated around Y read as pumpkin ribs and cost
         * much less than a custom lathe geometry.
         */
        for (let index = 0; index < 6; index++) {
          const rib = createSphere(
            0.56,
            0xf05f0a,
            0,
            0.4,
            0,
            14,
            {
              roughness: 0.62,
              castShadow: false
            }
          );

          rib.scale.set(0.32, 0.76, 0.88);
          rib.rotation.y = (Math.PI / 3) * index;
          pumpkin.add(rib);
        }

        pumpkin.add(
          createCylinder(
            0.06,
            0.09,
            0.34,
            0x4a7c2f,
            0,
            0.9,
            0,
            6
          )
        );

        pumpkin.add(
          createBox(
            0.2,
            0.04,
            0.12,
            0x4a7c2f,
            0.12,
            0.94,
            0.05,
            {
              castShadow: false
            }
          )
        );

        const glow = {
          emissive: 0xffb300,
          emissiveIntensity: 2.4,
          castShadow: false,
          roughness: 0.5
        };

        [
          [-0.17, 0.52, 0.45],
          [0.17, 0.52, 0.45]
        ].forEach(([eyeX, eyeY, eyeZ]) => {
          pumpkin.add(
            createBox(0.13, 0.11, 0.05, 0xffe066, eyeX, eyeY, eyeZ, glow)
          );
        });

        [
          [-0.12, 0.29, 0.47],
          [0, 0.25, 0.49],
          [0.12, 0.29, 0.47]
        ].forEach(([mouthX, mouthY, mouthZ]) => {
          pumpkin.add(
            createBox(0.1, 0.1, 0.05, 0xffe066, mouthX, mouthY, mouthZ, glow)
          );
        });

        pumpkin.position.set(x, 0, z);
        pumpkin.scale.setScalar(scale);
        pumpkin.rotation.y = (Math.random() - 0.5) * 0.6;

        halloweenGroup.add(pumpkin);
      }

      function createBat(x, z, options = {}) {
        const bat = new THREE.Group();
        const wings = [];

        const body = createSphere(
          0.16,
          0x17101f,
          0,
          0,
          0,
          12,
          {
            roughness: 0.5,
            castShadow: false
          }
        );

        body.scale.set(1, 1.35, 0.9);
        bat.add(body);

        [-1, 1].forEach((side) => {
          const wing = createRoundedBox(
            0.86,
            0.05,
            0.4,
            0.14,
            0x241736,
            side * 0.42,
            0,
            0,
            {
              castShadow: false,
              bevelSize: 0.015
            }
          );

          wing.rotation.z = side * 0.22;
          wings.push(wing);
          bat.add(wing);
        });

        [-0.08, 0.08].forEach((earX) => {
          bat.add(
            createCone(
              0.05,
              0.14,
              0x17101f,
              earX,
              0.22,
              0,
              6
            )
          );
        });

        bat.position.set(x, 6, z);
        bat.userData.wings = wings;

        animatedBats.push({
          group: bat,
          wings,
          radius: options.radius ?? 9,
          height: options.height ?? 7.5,
          bob: options.bob ?? 0.9,
          speed: options.speed ?? 0.22,
          phase: options.phase ?? 0
        });

        halloweenGroup.add(bat);
      }

      function createFogPatch(x, z, scale = 1) {
        const patch = createSphere(
          1,
          0xc3c8dd,
          x,
          0.55,
          z,
          18,
          {
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            roughness: 1,
            castShadow: false,
            receiveShadow: false
          }
        );

        patch.scale.set(scale * 2.6, 0.32, scale * 1.9);
        halloweenGroup.add(patch);

        driftingFog.push({
          patch,
          baseX: x,
          phase: Math.random() * Math.PI * 2,
          speed: 0.08 + Math.random() * 0.06
        });
      }

      function createTombstone(x, z, rotation = 0) {
        const stone = new THREE.Group();

        stone.add(
          createRoundedBox(0.72, 1.05, 0.22, 0.2, 0x8b93a5, 0, 0.55, 0)
        );

        stone.add(
          createBox(0.1, 0.55, 0.06, 0x6d7484, 0, 0.62, 0.13, {
            castShadow: false
          })
        );

        stone.add(
          createBox(0.34, 0.1, 0.06, 0x6d7484, 0, 0.74, 0.13, {
            castShadow: false
          })
        );

        stone.position.set(x, 0, z);
        stone.rotation.y = rotation;

        halloweenGroup.add(stone);
      }

      function createHalloweenDetails() {
        [
          [-11.9, 6.2, 1],
          [-10.3, 6.9, 0.78],
          [3.1, 6.6, 0.92],
          [4.7, 6.95, 0.7],
          [12.4, 6.3, 1.02],
          [13.9, 6.75, 0.76],
          [22.3, 5.7, 0.9],
          [-21.7, 6.5, 0.86],
          [20.5, -6.3, 1.1],
          [-16.4, 13.6, 0.95]
        ].forEach(([x, z, scale]) => createPumpkin(x, z, scale));

        createTombstone(-14.6, 6.9, 0.18);
        createTombstone(-16.4, 7.2, -0.16);
        createTombstone(9.3, 7, 0.1);

        [
          [-14, 6.4, 1.4],
          [8, 6.7, 1.5],
          [20, 2.4, 1.2],
          [-20.5, -9, 1.6],
          [0, -8, 1.3]
        ].forEach(([x, z, scale]) => createFogPatch(x, z, scale));

        [
          { x: 0, z: 0, radius: 10, height: 8.2, speed: 0.24, phase: 0 },
          { x: 0, z: 0, radius: 13, height: 10.4, speed: 0.17, phase: 2.1 },
          { x: 0, z: 0, radius: 7.5, height: 6.4, speed: 0.31, phase: 4.2 }
        ].forEach((options) => createBat(options.x, options.z, options));
      }

      createHalloweenDetails();
      halloweenGroup.visible = false;

      /* --------------------------------------------------
       * Summer decorations
       * -------------------------------------------------- */

      function createPalmTree(x, z, scale = 1) {
        const palm = new THREE.Group();

        for (let index = 0; index < 5; index++) {
          const segment = createCylinder(
            0.15 - index * 0.012,
            0.19 - index * 0.012,
            0.62,
            0x8a5a2b,
            index * 0.05,
            0.32 + index * 0.58,
            0,
            8
          );

          segment.rotation.z = -0.05 - index * 0.02;
          palm.add(segment);
        }

        const crown = new THREE.Group();

        crown.position.set(0.28, 3.02, 0);

        for (let index = 0; index < 7; index++) {
          const frond = new THREE.Group();

          frond.rotation.y = (index / 7) * Math.PI * 2;

          const droop = new THREE.Group();

          droop.rotation.z = -0.22;

          droop.add(
            createRoundedBox(
              1.95,
              0.07,
              0.44,
              0.2,
              0x2f9e44,
              0.98,
              0,
              0,
              {
                bevelSize: 0.02,
                castShadow: false
              }
            )
          );

          const tip = createCone(
            0.22,
            0.66,
            0x38b552,
            1.96,
            0,
            0,
            8
          );

          tip.rotation.z = -Math.PI / 2;
          droop.add(tip);
          frond.add(droop);
          crown.add(frond);
        }

        [-0.22, 0.18].forEach((offsetX, index) => {
          palm.add(
            createSphere(
              0.14,
              0x6b4423,
              0.28 + offsetX,
              2.9 - index * 0.12,
              0.16 * (index ? -1 : 1),
              10
            )
          );
        });

        palm.add(crown);
        palm.position.set(x, 0, z);
        palm.scale.setScalar(scale);

        summerGroup.add(palm);
      }

      function createBeachUmbrella(x, z, colorA = 0xff6f61, colorB = 0xffffff) {
        const umbrella = new THREE.Group();

        umbrella.add(
          createCylinder(0.05, 0.06, 2.5, 0xf2f4f6, 0, 1.25, 0, 8)
        );

        for (let index = 0; index < 8; index++) {
          const geometry = new THREE.ConeGeometry(
            1.15,
            0.52,
            10,
            1,
            true,
            (index / 8) * Math.PI * 2,
            Math.PI / 4 + 0.01
          );

          const panel = new THREE.Mesh(
            geometry,
            createMaterial(index % 2 ? colorB : colorA, {
              roughness: 0.72
            })
          );

          panel.position.y = 2.5;
          panel.castShadow = true;
          umbrella.add(panel);
        }

        umbrella.add(createCone(0.07, 0.18, colorA, 0, 2.84, 0, 8));
        umbrella.position.set(x, 0, z);

        summerGroup.add(umbrella);
      }

      function createSunbed(x, z, rotation = 0) {
        const bed = new THREE.Group();

        bed.add(
          createRoundedBox(1.5, 0.09, 0.58, 0.05, 0x00a8c6, 0, 0.44, 0)
        );

        const back = createRoundedBox(
          0.62,
          0.08,
          0.58,
          0.05,
          0x00a8c6,
          -0.92,
          0.66,
          0
        );

        back.rotation.z = 0.55;
        bed.add(back);

        [
          [-0.55, -0.22],
          [-0.55, 0.22],
          [0.55, -0.22],
          [0.55, 0.22]
        ].forEach(([legX, legZ]) => {
          bed.add(
            createCylinder(0.04, 0.04, 0.42, 0xe7edf2, legX, 0.21, legZ, 6)
          );
        });

        bed.position.set(x, 0, z);
        bed.rotation.y = rotation;

        summerGroup.add(bed);
      }

      function createBeachBall(x, z, scale = 1) {
        const ball = new THREE.Group();

        ball.add(createSphere(0.32, 0xfff4e6, 0, 0.33, 0, 16));

        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.31, 0.05, 8, 22),
          createMaterial(0xff6f61, { roughness: 0.5 })
        );

        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.33;
        ball.add(ring);

        const ring2 = ring.clone();
        ring2.rotation.set(0, Math.PI / 2, Math.PI / 2);
        ball.add(ring2);

        ball.position.set(x, 0, z);
        ball.scale.setScalar(scale);

        summerGroup.add(ball);
      }

      function createSummerDetails() {
        [
          [-26.4, 10.8, 1.05],
          [26.6, 11.4, 1.1],
          [-26.6, -12.4, 1],
          [26.4, -12.8, 1.05],
          [11.6, 15.4, 0.92],
          [-13.4, 15.6, 0.95]
        ].forEach(([x, z, scale]) => createPalmTree(x, z, scale));

        createBeachUmbrella(-12.6, 6.6, 0xff6f61, 0xfff4e6);
        createBeachUmbrella(3.4, 6.8, 0x00a8c6, 0xfff4e6);
        createBeachUmbrella(21.6, 6.2, 0xf2c744, 0xfff4e6);

        createSunbed(-14.4, 6.7, 0.35);
        createSunbed(1.6, 6.9, -0.3);
        createSunbed(19.8, 6.4, 0.2);

        createBeachBall(5.8, 6.7, 1);
        createBeachBall(-10.4, 5.9, 0.8);
        createBeachBall(23.4, 4.9, 0.9);
      }

      createSummerDetails();
      summerGroup.visible = false;

      /* --------------------------------------------------
       * Neon night-shift decorations
       * -------------------------------------------------- */

      const neonPulse = [];

      function neonMaterial(color, intensity = 2.6) {
        return createMaterial(color, {
          emissive: color,
          emissiveIntensity: intensity,
          roughness: 0.35,
          castShadow: false
        });
      }

      function createNeonRing(x, y, z, color, radius = 1.05) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.075, 10, 36),
          neonMaterial(color)
        );

        ring.position.set(x, y, z);

        neonGroup.add(ring);
        neonPulse.push({
          material: ring.material,
          base: 2.4,
          amplitude: 0.9,
          speed: 1.6,
          phase: x * 0.7
        });

        return ring;
      }

      function createNeonBar(width, height, depth, color, x, y, z) {
        const material = neonMaterial(color, 2.2);

        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          material
        );

        bar.position.set(x, y, z);
        neonGroup.add(bar);

        return bar;
      }

      function createNeonSign(text, x, y, z, scale = 1) {
        const canvas = document.createElement("canvas");

        canvas.width = 512;
        canvas.height = 128;

        const context = canvas.getContext("2d");

        context.clearRect(0, 0, 512, 128);
        context.font = "bold 62px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = "#00e5ff";
        context.shadowBlur = 26;
        context.fillStyle = "#dbffff";
        context.fillText(text, 256, 68);

        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(canvas),
            transparent: true,
            depthWrite: false
          })
        );

        sprite.position.set(x, y, z);
        sprite.scale.set(7.4 * scale, 1.85 * scale, 1);

        neonGroup.add(sprite);

        return sprite;
      }

      function createNeonDetails() {
        LANE_X.forEach((x) => {
          createNeonRing(x, 3.3, 4.62, 0x00e5ff, 1.05);
        });

        /*
         * Rooftop edge lighting plus a magenta stripe along the plaza.
         */
        createNeonBar(18.4, 0.08, 0.08, 0x00e5ff, 0, 4.24, 5.32);
        createNeonBar(0.08, 4.2, 0.08, 0xff2fb9, -9.2, 2.12, 5.32);
        createNeonBar(0.08, 4.2, 0.08, 0xff2fb9, 9.2, 2.12, 5.32);
        createNeonBar(46, 0.05, 0.05, 0xff2fb9, 3, 0.4, 7.1);
        createNeonBar(0.05, 0.05, 20, 0x00e5ff, -13.6, 0.4, 1);

        createNeonSign("NIGHT SHIFT", 0, 5.35, 5.4, 1);

        [
          [0, 3.2, 6.5, 0x00e5ff],
          [16, 3, 3.4, 0xff2fb9],
          [-13.6, 2.6, 1, 0x8b2be2]
        ].forEach(([x, y, z, color]) => {
          const light = new THREE.PointLight(color, 1.6, 24, 2);

          light.position.set(x, y, z);
          neonGroup.add(light);
        });
      }

      createNeonDetails();
      neonGroup.visible = false;

      /* --------------------------------------------------
       * Weather layers (theme particles)
       * -------------------------------------------------- */

      function createParticleTexture(shape = "round") {
        const size = 64;
        const canvas = document.createElement("canvas");

        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext("2d");

        if (shape === "leaf") {
          context.translate(size / 2, size / 2);
          context.rotate(-0.5);
          context.beginPath();
          context.ellipse(0, 0, 12, 24, 0, 0, Math.PI * 2);
          context.fillStyle = "rgba(255, 255, 255, 1)";
          context.fill();
          context.strokeStyle = "rgba(255, 255, 255, 0.55)";
          context.lineWidth = 2.5;
          context.beginPath();
          context.moveTo(0, -22);
          context.lineTo(0, 22);
          context.stroke();
        } else {
          const gradient = context.createRadialGradient(
            size / 2,
            size / 2,
            0,
            size / 2,
            size / 2,
            size / 2
          );

          gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
          gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.98)");
          gradient.addColorStop(0.78, "rgba(255, 255, 255, 0.78)");
          gradient.addColorStop(0.92, "rgba(255, 255, 255, 0.24)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

          context.fillStyle = gradient;
          context.fillRect(0, 0, size, size);
        }

        const texture = new THREE.CanvasTexture(canvas);

        texture.encoding = THREE.sRGBEncoding;

        return texture;
      }

      const particleTextures = {
        round: createParticleTexture("round"),
        leaf: createParticleTexture("leaf")
      };

      /*
       * Each profile describes one weather mood. Layers render back to front;
       * screen-space layers ignore the depth buffer so a handful of big flakes
       * is always visible in front of the buildings.
       *
       * The campus renders with an OrthographicCamera, where three.js ignores
       * size attenuation and treats `size` as plain pixel diameter. Keep the
       * values in pixels, otherwise the particles shrink to invisible dots.
       */
      const WEATHER_PROFILES = {
        snow: {
          texture: "round",
          rise: false,
          layers: [
            {
              count: 1600,
              size: 3.4,
              opacity: 0.5,
              speed: [1.1, 2.3],
              sway: 0.3,
              depthTest: true
            },
            {
              count: 900,
              size: 5.5,
              opacity: 0.82,
              speed: [1.7, 3.2],
              sway: 0.45,
              depthTest: true
            },
            {
              count: 220,
              size: 9,
              opacity: 0.9,
              speed: [2.4, 4.2],
              sway: 0.7,
              depthTest: false,
              screenSpace: true
            }
          ]
        },

        embers: {
          texture: "round",
          rise: true,
          color: 0xffa53d,
          blending: THREE.AdditiveBlending,
          layers: [
            {
              count: 520,
              size: 2.2,
              opacity: 0.5,
              speed: [0.5, 1.4],
              sway: 0.55,
              depthTest: true
            },
            {
              count: 260,
              size: 6,
              opacity: 0.75,
              speed: [0.7, 1.8],
              sway: 0.8,
              depthTest: false,
              screenSpace: true,
              color: 0xffd27a
            }
          ]
        },

        petals: {
          texture: "leaf",
          rise: false,
          color: 0xffd0e0,
          layers: [
            {
              count: 520,
              size: 2.8,
              opacity: 0.7,
              speed: [0.5, 1.2],
              sway: 1.1,
              depthTest: true
            },
            {
              count: 140,
              size: 7.5,
              opacity: 0.72,
              speed: [0.8, 1.6],
              sway: 1.4,
              depthTest: false,
              screenSpace: true,
              color: 0xfff0c2
            }
          ]
        },

        sparks: {
          texture: "round",
          rise: true,
          color: 0x00e5ff,
          blending: THREE.AdditiveBlending,
          layers: [
            {
              count: 460,
              size: 1.9,
              opacity: 0.55,
              speed: [0.4, 1.2],
              sway: 0.3,
              depthTest: true
            },
            {
              count: 220,
              size: 5.5,
              opacity: 0.7,
              speed: [0.5, 1.4],
              sway: 0.5,
              depthTest: false,
              screenSpace: true,
              color: 0xff2fb9
            }
          ]
        }
      };

      const WEATHER_BOUNDS = {
        x: 34,
        z: 26,
        minY: 0.4,
        maxY: 26
      };

      const weatherGroups = new Map();

      let activeWeather = null;
      let weatherVisible = true;

      function randomInRange([min, max]) {
        return min + Math.random() * (max - min);
      }

      function createWeatherLayer(profile, config) {
        const positions = new Float32Array(config.count * 3);
        const speeds = new Float32Array(config.count);

        for (let index = 0; index < config.count; index++) {
          positions[index * 3] =
            (Math.random() - 0.5) * WEATHER_BOUNDS.x * 2;

          positions[index * 3 + 1] = randomInRange([
            WEATHER_BOUNDS.minY,
            WEATHER_BOUNDS.maxY
          ]);

          positions[index * 3 + 2] =
            (Math.random() - 0.5) * WEATHER_BOUNDS.z * 2;

          speeds[index] = randomInRange(config.speed);
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3)
        );

        const material = new THREE.PointsMaterial({
          color: config.color ?? profile.color ?? 0xffffff,
          size: config.size,
          map: particleTextures[profile.texture],
          alphaTest: 0.02,
          transparent: true,
          opacity: config.opacity,
          depthWrite: false,
          depthTest: config.depthTest !== false,
          sizeAttenuation: !config.screenSpace,
          blending: profile.blending ?? THREE.NormalBlending
        });

        const layer = new THREE.Points(geometry, material);

        layer.frustumCulled = false;
        layer.userData.speeds = speeds;
        layer.userData.rise = Boolean(profile.rise);
        layer.userData.sway = config.sway;
        layer.renderOrder = config.screenSpace ? 30 : 0;

        return layer;
      }

      function weatherGroup(kind) {
        if (weatherGroups.has(kind)) {
          return weatherGroups.get(kind);
        }

        const profile = WEATHER_PROFILES[kind];
        const group = new THREE.Group();

        group.visible = false;

        profile.layers.forEach((config) => {
          group.add(createWeatherLayer(profile, config));
        });

        scene.add(group);
        weatherGroups.set(kind, group);

        return group;
      }

      function setWeather(kind) {
        activeWeather = kind && WEATHER_PROFILES[kind] ? kind : null;

        if (activeWeather) {
          weatherGroup(activeWeather);
        }

        weatherGroups.forEach((group, key) => {
          group.visible = weatherVisible && key === activeWeather;
        });
      }

      /*
       * Test/debug helper: toggling the weather lets tooling measure how many
       * pixels the particles actually paint, instead of guessing visibility.
       */
      function setWeatherVisible(visible) {
        weatherVisible = Boolean(visible);

        weatherGroups.forEach((group, key) => {
          group.visible = weatherVisible && key === activeWeather;
        });
      }

      function updateWeather(delta, elapsed) {
        if (!activeWeather || !weatherVisible) {
          return;
        }

        const motion =
          delta * (prefersReducedMotion.matches ? 0.4 : 1);

        weatherGroup(activeWeather).children.forEach(
          (layer, layerIndex) => {
            const positions =
              layer.geometry.attributes.position.array;

            const speeds = layer.userData.speeds;
            const rise = layer.userData.rise;
            const sway = layer.userData.sway;

            for (let index = 0; index < speeds.length; index++) {
              const offset = index * 3;

              if (rise) {
                positions[offset + 1] += speeds[index] * motion;

                if (positions[offset + 1] > WEATHER_BOUNDS.maxY) {
                  positions[offset + 1] = WEATHER_BOUNDS.minY;
                  positions[offset] =
                    (Math.random() - 0.5) * WEATHER_BOUNDS.x * 2;
                  positions[offset + 2] =
                    (Math.random() - 0.5) * WEATHER_BOUNDS.z * 2;
                }
              } else {
                positions[offset + 1] -= speeds[index] * motion;

                if (positions[offset + 1] < WEATHER_BOUNDS.minY) {
                  positions[offset + 1] = WEATHER_BOUNDS.maxY;
                  positions[offset] =
                    (Math.random() - 0.5) * WEATHER_BOUNDS.x * 2;
                  positions[offset + 2] =
                    (Math.random() - 0.5) * WEATHER_BOUNDS.z * 2;
                }
              }

              positions[offset] +=
                Math.sin(
                  elapsed * 1.3 + index + layerIndex * 2
                ) *
                motion *
                sway;

              positions[offset + 2] +=
                Math.cos(
                  elapsed + index * 0.7 + layerIndex
                ) *
                motion *
                sway *
                0.45;
            }

            layer.geometry.attributes.position.needsUpdate = true;
          }
        );
      }

      /* --------------------------------------------------
       * Tickets and packages
       * -------------------------------------------------- */

      function createPackage(scale = 1) {
        const group = new THREE.Group();

        const body = createRoundedBox(
          0.72 * scale,
          0.58 * scale,
          0.62 * scale,
          0.1 * scale,
          COLORS.parcel
        );

        const ribbonA = createRoundedBox(
          0.15 * scale,
          0.6 * scale,
          0.64 * scale,
          0.03,
          COLORS.tape
        );

        const ribbonB = createRoundedBox(
          0.74 * scale,
          0.6 * scale,
          0.13 * scale,
          0.03,
          COLORS.tape
        );

        group.add(body, ribbonA, ribbonB);

        group.userData.body = body;
        group.userData.ribbons = [
          ribbonA,
          ribbonB
        ];

        return group;
      }

      function createTicketLabel(text) {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);

        const label = String(text || "");
        context.font = "700 66px 'Trebuchet MS', 'Segoe UI', sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";

        const padX = 34;
        const textWidth = Math.min(
          canvas.width - padX * 2,
          context.measureText(label).width
        );
        const boxWidth = textWidth + padX * 2;
        const boxHeight = 88;
        const boxX = (canvas.width - boxWidth) / 2;
        const boxY = (canvas.height - boxHeight) / 2;
        const radius = 24;

        context.fillStyle = "rgba(255,255,255,0.94)";
        context.strokeStyle = "rgba(15,23,42,0.22)";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(boxX + radius, boxY);
        context.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + boxHeight, radius);
        context.arcTo(boxX + boxWidth, boxY + boxHeight, boxX, boxY + boxHeight, radius);
        context.arcTo(boxX, boxY + boxHeight, boxX, boxY, radius);
        context.arcTo(boxX, boxY, boxX + boxWidth, boxY, radius);
        context.closePath();
        context.fill();
        context.stroke();

        context.fillStyle = "#0f172a";
        context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          depthTest: true
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.78, 0.195, 1);
        sprite.position.set(0, 0.31, 0);
        sprite.renderOrder = 3;

        return sprite;
      }

      function createTicket(id, status, options = {}) {
        const root = createPackage(0.82);
        const label = createTicketLabel(id);
        root.add(label);

        const ticket = {
          id,
          title: options.title || "Enterprise Shipment",
          quantity: Number(options.quantity) || 1,
          status,
          jiraStatus: options.jiraStatus || status,
          tag: options.tag || "#logistics",
          labels: options.labels || [],
          assignee: options.assignee || "Unassigned",
          priority: options.priority || "None",
          updated: options.updated || null,

          root,
          body: root.userData.body,
          ribbons: root.userData.ribbons,
          label,

          target: new THREE.Vector3(),
          route: [],
          routeSpeed: 3.5,
          released: false,
          baseColor: COLORS.parcel
        };

        root.traverse((child) => {
          if (!child.isMesh && !child.isSprite) {
            return;
          }

          child.userData.ticket = ticket;
          clickableMeshes.push(child);
        });

        scene.add(root);
        tickets.push(ticket);

        updateTicketTheme(ticket);

        return ticket;
      }

      function updateTicketTheme(ticket) {
        const theme =
          THEME_DEFINITIONS[currentTheme] ??
          THEME_DEFINITIONS.corporate;

        const hash = ticket.id
          .split("")
          .reduce(
            (sum, character) =>
              sum + character.charCodeAt(0),
            0
          );

        ticket.baseColor =
          theme.parcels[hash % theme.parcels.length];

        ticket.ribbonColor = theme.ribbon;

        ticket.body.material.color.setHex(
          ticket.baseColor
        );

        ticket.ribbons.forEach((ribbon) => {
          ribbon.material.color.setHex(
            ticket.ribbonColor
          );
        });

        /*
         * Pre-blended colours are cheaper than blending every frame while a
         * search filter dims the packages that do not match.
         */
        const backdrop =
          new THREE.Color(theme.background);

        ticket.dimBodyColor =
          new THREE.Color(ticket.baseColor)
            .lerp(backdrop, 0.82)
            .getHex();

        ticket.dimRibbonColor =
          new THREE.Color(ticket.ribbonColor)
            .lerp(backdrop, 0.82)
            .getHex();
      }

      function disposeObject(object) {
        object.traverse((child) => {
          if (!child.isMesh && !child.isSprite) {
            return;
          }

          child.geometry?.dispose();

          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];

          materials.forEach((material) => {
            if (!material) {
              return;
            }
            material.map?.dispose?.();
            material.dispose();
          });
        });
      }

      function rebuildClickableMeshes() {
        clickableMeshes.length = 0;

        tickets.forEach((ticket) => {
          ticket.root.traverse((child) => {
            if (child.isMesh) {
              child.userData.ticket = ticket;
              clickableMeshes.push(child);
            }
          });
        });
      }

      function clearTickets() {
        tickets.forEach((ticket) => {
          scene.remove(ticket.root);
          disposeObject(ticket.root);
        });

        tickets.length = 0;
        clickableMeshes.length = 0;

        selectedTicket = null;
        hoveredTicket = null;
        tooltip.style.display = "none";

        emit("selection", null);
        emit("state");
      }

      function seedMockTickets() {
        clearTickets();

        for (let index = 0; index < 30; index++) {
          createTicket(
            index === 0
              ? "JIRA-1026"
              : `JIRA-${1027 + index}`,
            "To Do",
            index === 0
              ? {
                  title: "Sleigh GPS",
                  quantity: 82,
                  tag: "#christmas-2026",
                  labels: ["christmas-2026"],
                  assignee: "North Pole Operations"
                }
              : {
                  title:
                    currentTheme === "christmas"
                      ? "Christmas Gift Order"
                      : "Mock Logistics Ticket",

                  quantity:
                    1 + Math.floor(Math.random() * 95),

                  tag:
                    currentTheme === "christmas"
                      ? "#christmas-2026"
                      : "#logistics"
                }
          );
        }

        for (let index = 0; index < 5; index++) {
          createTicket(
            `JIRA-${1057 + index}`,
            "In Progress",
            {
              title: "Active Shipment",
              quantity: 10 + index,
              tag: "#logistics"
            }
          );
        }

        for (let index = 0; index < 3; index++) {
          createTicket(
            `JIRA-${1062 + index}`,
            "In Review",
            {
              title: "Review Shipment",
              quantity: 20 + index,
              tag: "#logistics"
            }
          );
        }

        for (let index = 0; index < 2; index++) {
          createTicket(
            `JIRA-${1065 + index}`,
            "In Testing",
            {
              title: "Testing Shipment",
              quantity: 30 + index,
              tag: "#logistics"
            }
          );
        }

        layoutTickets(true);
        setSelected(tickets[0]);
      }

      function layoutTickets(immediate = false) {
        STATUSES.forEach((status, laneIndex) => {
          const laneTickets = tickets.filter(
            (ticket) =>
              ticket.status === status &&
              !ticket.released
          );

          laneTickets.forEach((ticket, index) => {
            const row = index % 10;
            const stack = Math.floor(index / 10);
            const direction =
              laneIndex % 2 === 0 ? 1 : -1;

            const z =
              direction === 1
                ? 2.8 - row * 0.62
                : -2.8 + row * 0.62;

            ticket.target.set(
              LANE_X[laneIndex] +
                (stack % 2) * 0.42 -
                0.2,
              BELT_Y + stack * 0.53,
              z
            );

            if (immediate) {
              ticket.root.position.copy(
                ticket.target
              );
            }

            ticket.root.visible = true;
          });
        });

        emit("state");
      }

      function buildRoute(ticket, oldStatus, newStatus) {
        const oldLane = STATUSES.indexOf(oldStatus);
        const newLane = STATUSES.indexOf(newStatus);

        if (
          oldLane < 0 ||
          newLane < 0 ||
          oldLane === newLane
        ) {
          ticket.route = [];
          return;
        }

        const current =
          ticket.root.position.clone();

        const destination =
          ticket.target.clone();

        ticket.route = [
          new THREE.Vector3(
            current.x,
            BELT_Y,
            current.z
          ),

          new THREE.Vector3(
            LANE_X[oldLane],
            BELT_Y,
            current.z
          ),

          new THREE.Vector3(
            LANE_X[oldLane],
            BELT_Y,
            CONNECTOR_Z
          ),

          new THREE.Vector3(
            LANE_X[newLane],
            BELT_Y,
            CONNECTOR_Z
          ),

          new THREE.Vector3(
            LANE_X[newLane],
            BELT_Y,
            destination.z
          ),

          destination.clone()
        ];
      }

      function updateRoute(ticket, delta) {
        if (!ticket.route.length) {
          return false;
        }

        const waypoint = ticket.route[0];

        const distance =
          ticket.root.position.distanceTo(waypoint);

        const movement =
          ticket.routeSpeed * delta;

        if (distance <= movement) {
          ticket.root.position.copy(waypoint);
          ticket.route.shift();
        } else {
          const direction = waypoint
            .clone()
            .sub(ticket.root.position)
            .normalize();

          ticket.root.position.addScaledVector(
            direction,
            movement
          );
        }

        return true;
      }

      function moveTicket(ticket, newStatus) {
        if (
          !ticket ||
          releaseAnimation ||
          ticket.released ||
          !STATUSES.includes(newStatus) ||
          ticket.status === newStatus
        ) {
          return;
        }

        const oldStatus = ticket.status;

        ticket.status = newStatus;

        layoutTickets(false);
        buildRoute(ticket, oldStatus, newStatus);
        setSelected(ticket);
      }

      function moveNext(ticket) {
        if (!ticket || releaseAnimation) {
          return;
        }

        const index =
          STATUSES.indexOf(ticket.status);

        if (
          index >= 0 &&
          index < STATUSES.length - 1
        ) {
          moveTicket(
            ticket,
            STATUSES[index + 1]
          );
        } else if (
          ticket.status === "In Testing"
        ) {
          startRelease(ticket);
        }
      }

      /* --------------------------------------------------
       * Forklift, truck and sleigh
       * -------------------------------------------------- */

      function createForklift() {
        const root = new THREE.Group();
        const body = new THREE.Group();
        const lift = new THREE.Group();
        const cargoAnchor = new THREE.Object3D();

        body.add(
          createRoundedBox(
            1.2,
            0.56,
            1.4,
            0.15,
            COLORS.yellow,
            0,
            0.5,
            0
          )
        );

        body.add(
          createRoundedBox(
            0.9,
            0.13,
            0.8,
            0.06,
            COLORS.dark,
            0,
            1.18,
            0
          )
        );

        body.add(
          createBox(
            0.09,
            0.9,
            0.09,
            COLORS.dark,
            -0.38,
            0.9,
            0.2
          )
        );

        body.add(
          createBox(
            0.09,
            0.9,
            0.09,
            COLORS.dark,
            0.38,
            0.9,
            0.2
          )
        );

        lift.add(
          createBox(
            0.1,
            1.65,
            0.1,
            COLORS.steel,
            -0.5,
            0.92,
            0.82
          )
        );

        lift.add(
          createBox(
            0.1,
            1.65,
            0.1,
            COLORS.steel,
            0.5,
            0.92,
            0.82
          )
        );

        lift.add(
          createRoundedBox(
            0.14,
            0.09,
            1.25,
            0.035,
            COLORS.steel,
            -0.28,
            0.18,
            1.38
          )
        );

        lift.add(
          createRoundedBox(
            0.14,
            0.09,
            1.25,
            0.035,
            COLORS.steel,
            0.28,
            0.18,
            1.38
          )
        );

        cargoAnchor.position.set(
          0,
          0.53,
          1.55
        );

        lift.add(cargoAnchor);

        root.add(body, lift);
        root.position.set(6, 0, 5.8);

        scene.add(root);

        return {
          root,
          lift,
          cargoAnchor
        };
      }

      function createTruck() {
        const root = new THREE.Group();

        root.add(
          createRoundedBox(
            4.2,
            1.9,
            1.75,
            0.22,
            COLORS.white,
            0.6,
            1.25,
            0
          )
        );

        root.add(
          createRoundedBox(
            1.45,
            1.65,
            1.75,
            0.2,
            COLORS.blue,
            -2.15,
            1.05,
            0,
            {
              accent: true
            }
          )
        );

        root.add(
          createRoundedBox(
            0.58,
            0.5,
            0.06,
            0.1,
            COLORS.blueLight,
            -2.55,
            1.35,
            0.9
          )
        );

        [-2.1, -0.65, 1.25].forEach((x) => {
          [-0.9, 0.9].forEach((z) => {
            const wheel = createCylinder(
              0.34,
              0.34,
              0.22,
              COLORS.dark,
              x,
              0.3,
              z
            );

            wheel.rotation.x = Math.PI / 2;
            root.add(wheel);
          });
        });

        root.position.set(6, 0, 9.2);
        root.rotation.y = Math.PI;

        scene.add(root);

        return root;
      }

      function createReindeer(x, z) {
        const deer = new THREE.Group();

        const body = createRoundedBox(
          1.05,
          0.55,
          0.5,
          0.18,
          COLORS.brown,
          0,
          0.9,
          0
        );
        deer.add(body);

        const headGroup = new THREE.Group();
        headGroup.position.set(-0.65, 1.2, 0);
        headGroup.add(createSphere(0.29, COLORS.brown, 0, 0, 0));
        headGroup.add(createSphere(0.18, 0xb0784c, -0.23, -0.07, 0));
        headGroup.add(
          createSphere(0.085, COLORS.red, -0.39, -0.05, 0, 14, {
            emissive: COLORS.red,
            emissiveIntensity: 1.5
          })
        );
        [-0.14, 0.14].forEach((antlerZ) => {
          const stem = createCylinder(
            0.025,
            0.035,
            0.62,
            COLORS.brownDark,
            -0.05,
            0.45,
            antlerZ,
            8
          );
          stem.rotation.z = -0.18;
          headGroup.add(stem);
          headGroup.add(
            createBox(0.35, 0.04, 0.04, COLORS.brownDark, -0.19, 0.57, antlerZ)
          );
        });
        deer.add(headGroup);

        const legs = [];
        [-0.35, 0.35].forEach((legX, xi) => {
          [-0.17, 0.17].forEach((legZ, zi) => {
            const pivot = new THREE.Group();
            pivot.position.set(legX, 0.62, legZ);
            pivot.add(createBox(0.09, 0.65, 0.09, COLORS.brown, 0, -0.24, 0));
            pivot.add(
              createRoundedBox(
                0.14,
                0.1,
                0.16,
                0.03,
                COLORS.brownDark,
                0,
                -0.54,
                0
              )
            );
            deer.add(pivot);
            legs.push({ pivot, isFront: xi === 0, side: zi === 0 ? -1 : 1 });
          });
        });

        deer.position.set(x, 0, z);
        deer.userData.anim = { body, headGroup, legs, baseY: 0 };
        return deer;
      }

      function createSleigh() {
        const root = new THREE.Group();

        // Front team (reindeer + harness) follows travel direction like a car/tractor.
        const team = new THREE.Group();
        root.add(team);

        // Rear sleigh body is a trailer with a hitch joint (kink/articulation allowed).
        const hitch = new THREE.Group();
        hitch.position.set(-0.55, 0, 0);
        team.add(hitch);
        const trailer = new THREE.Group();
        hitch.add(trailer);

        trailer.add(
          createRoundedBox(
            2.55,
            0.75,
            1.55,
            0.28,
            COLORS.christmas,
            1.35,
            1,
            0
          )
        );

        trailer.add(
          createRoundedBox(
            1.45,
            1.05,
            1.48,
            0.25,
            COLORS.christmasDark,
            2.05,
            1.55,
            0
          )
        );

        [-0.72, 0.72].forEach((z) => {
          trailer.add(
            createRoundedBox(
              3.5,
              0.11,
              0.1,
              0.05,
              COLORS.yellow,
              1.15,
              0.27,
              z
            )
          );

          trailer.add(
            createBox(
              0.09,
              0.55,
              0.09,
              COLORS.yellow,
              0.0,
              0.52,
              z
            )
          );

          trailer.add(
            createBox(
              0.09,
              0.55,
              0.09,
              COLORS.yellow,
              2.1,
              0.52,
              z
            )
          );
        });

        const reindeer = [
          createReindeer(-2.1, -0.58),
          createReindeer(-2.1, 0.58),
          createReindeer(-3.65, -0.58),
          createReindeer(-3.65, 0.58)
        ];
        reindeer.forEach((d, i) => {
          d.userData.anim.phase = i * 0.9 + (i % 2 === 0 ? 0.15 : -0.1);
          d.userData.anim.speed = 1.0 + (i % 3) * 0.18 - 0.08;
          d.userData.anim.bob = 0.045 + (i % 2) * 0.015;
          team.add(d);
        });
        root.userData.reindeer = reindeer;
        root.userData.team = team;
        root.userData.trailer = trailer;
        root.userData.hitch = hitch;

        root.position.set(6, 0, 9.2);
        root.rotation.y = Math.PI;
        root.visible = false;

        scene.add(root);

        return root;
      }

      const forklift = createForklift();
      const truck = createTruck();
      const sleigh = createSleigh();
      const releaseCargo = createPackage(0.9);

      releaseCargo.visible = false;
      scene.add(releaseCargo);

      function activeVehicle() {
        return currentTheme === "christmas"
          ? sleigh
          : truck;
      }

      /* --------------------------------------------------
       * Easter egg: drive the truck
       * -------------------------------------------------- */

      const VEHICLE_HOME = {
        x: 6,
        z: 9.2,
        rotationY: Math.PI
      };

      // Car + trailer: how far the sleigh body lags behind the hitch along the
      // driven path, and how strongly that curve offset is shown as a kink.
      const TRAILER_FOLLOW_DIST = 3.2;
      const TRAILER_KINK_GAIN = 1.7;
      const TRAILER_KINK_MAX = 0.55;

      const DRIVE_BOUNDS = {
        minX: -24,
        maxX: 26,
        minZ: -16,
        maxZ: 19
      };

      const DRIVE_MAX_SPEED = 8.5;
      const DRIVE_ACCEL = 12;
      const DRIVE_BRAKE = 20;
      const DRIVE_TURN = 2.2;

      const DRIVE_KEY_MAP = {
        w: "forward",
        W: "forward",
        ArrowUp: "forward",
        s: "back",
        S: "back",
        ArrowDown: "back",
        a: "left",
        A: "left",
        ArrowLeft: "left",
        d: "right",
        D: "right",
        ArrowRight: "right"
      };

      const drive = {
        active: false,
        vehicle: null,
        speed: 0,
        keys: new Set()
      };

      function vehicleLabel(vehicle) {
        return vehicle === sleigh ? "Sleigh" : "Truck";
      }

      function resetVehiclePosition(vehicle) {
        vehicle.position.set(
          VEHICLE_HOME.x,
          0,
          VEHICLE_HOME.z
        );

        vehicle.rotation.set(0, VEHICLE_HOME.rotationY, 0);
        if (vehicle === sleigh && vehicle?.userData?.trailer) {
          vehicle.userData.trailer.rotation.y = 0;
        }
      }

      function resetVehicles() {
        stopSleighFlight({ resetPosition: false });
        resetVehiclePosition(truck);
        resetVehiclePosition(sleigh);

        truck.visible =
          currentTheme !== "christmas";

        sleigh.visible =
          currentTheme === "christmas";
      }

      function startDriving(vehicle = activeVehicle()) {
        if (!vehicle || !vehicle.visible || releaseAnimation) {
          return false;
        }

        if (sleighFlight.active) {
          stopSleighFlight({ resetPosition: drive.vehicle === sleigh || vehicle === sleigh });
        }

        /*
         * The demo and the release animation own the vehicle, so entering
         * drive mode takes it back instead of fighting for the same transform.
         */
        if (demo) {
          stopDemo();
        }

        if (drive.active && drive.vehicle === vehicle) {
          return true;
        }

        drive.active = true;
        drive.vehicle = vehicle;
        drive.speed = 0;
        drive.keys.clear();

        tooltip.style.display = "none";

        emit("vehicle", {
          driving: true,
          label: vehicleLabel(vehicle)
        });

        return true;
      }

      function stopDriving({ reset = false } = {}) {
        if (!drive.active) {
          return;
        }

        const vehicle = drive.vehicle;

        drive.active = false;
        drive.vehicle = null;
        drive.speed = 0;
        drive.keys.clear();

        if (reset && vehicle) {
          resetVehiclePosition(vehicle);
        }

        emit("vehicle", {
          driving: false,
          reset,
          label: vehicleLabel(vehicle)
        });
      }

      function resetVehicle(vehicle = drive.vehicle || activeVehicle()) {
        if (drive.active) {
          stopDriving({ reset: true });
          return;
        }

        resetVehiclePosition(vehicle);

        emit("vehicle", {
          driving: false,
          reset: true,
          label: vehicleLabel(vehicle)
        });
      }

      function isEditableTarget(target) {
        return (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(
              target.tagName
            ))
        );
      }

      window.addEventListener("keydown", (event) => {
        if (!drive.active || event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }

        if (isEditableTarget(event.target)) {
          return;
        }

        const action = DRIVE_KEY_MAP[event.key];

        if (!action) {
          return;
        }

        event.preventDefault();
        drive.keys.add(action);
      });

      window.addEventListener("keyup", (event) => {
        const action = DRIVE_KEY_MAP[event.key];

        if (action) {
          drive.keys.delete(action);
        }
      });

      window.addEventListener("blur", () => drive.keys.clear());

      function updateDriving(delta) {
        if (!drive.active || !drive.vehicle) {
          return;
        }

        const vehicle = drive.vehicle;
        const keys = drive.keys;

        const throttle =
          (keys.has("forward") ? 1 : 0) -
          (keys.has("back") ? 1 : 0);

        const steer =
          (keys.has("left") ? 1 : 0) -
          (keys.has("right") ? 1 : 0);

        const targetSpeed =
          throttle * DRIVE_MAX_SPEED * (throttle < 0 ? 0.6 : 1);
        const rate =
          throttle === 0 ? DRIVE_BRAKE : DRIVE_ACCEL;

        if (drive.speed < targetSpeed) {
          drive.speed = Math.min(
            targetSpeed,
            drive.speed + rate * delta
          );
        } else if (drive.speed > targetSpeed) {
          drive.speed = Math.max(
            targetSpeed,
            drive.speed - rate * delta
          );
        }

        if (steer) {
          /*
           * Standing still allows a slow pivot, moving gets full steering.
           * Reversing mirrors the direction like a real vehicle.
           */
          const grip =
            Math.abs(drive.speed) > 0.4
              ? Math.min(1, Math.abs(drive.speed) / 3) *
                (drive.speed < 0 ? -1 : 1)
              : 0.5;

          vehicle.rotation.y +=
            steer * DRIVE_TURN * grip * delta;
        }

        if (Math.abs(drive.speed) < 0.01) {
          return;
        }

        const dx =
          -Math.cos(vehicle.rotation.y) *
          drive.speed *
          delta;
        const dz =
          Math.sin(vehicle.rotation.y) *
          drive.speed *
          delta;

        const nextX = THREE.MathUtils.clamp(
          vehicle.position.x + dx,
          DRIVE_BOUNDS.minX,
          DRIVE_BOUNDS.maxX
        );

        const nextZ = THREE.MathUtils.clamp(
          vehicle.position.z + dz,
          DRIVE_BOUNDS.minZ,
          DRIVE_BOUNDS.maxZ
        );

        if (
          nextX !== vehicle.position.x + dx ||
          nextZ !== vehicle.position.z + dz
        ) {
          drive.speed = 0;
        }

        vehicle.position.set(nextX, 0, nextZ);
      }

      /* --------------------------------------------------
       * Christmas sleigh flight (release-only, drops over warehouse hall)
       * Takeoff and landing happen on the straight main road (z=9.2).
       * Route is generated dynamically/randomly per flight.
       * -------------------------------------------------- */

      const sleighFlight = {
        active: false,
        startedAt: 0,
        duration: 18,
        mode: null, // "release"
        releaseCargoDropped: false,
        dropObjects: [],
        plan: null,
        distance: 0,
        lastPose: null,
        smoothYaw: null,
        lastElapsed: 0
      };

      const SLEIGH_DROP_LIMIT = 24;
      const MAIN_ROAD_Z = 9.2;

      function resetSleighFlightDrops() {
        sleighFlight.dropObjects.forEach((obj) => {
          if (obj === releaseCargo) {
            return;
          }
          if (obj?.parent) {
            obj.parent.remove(obj);
          }
          disposeObject(obj);
        });
        sleighFlight.dropObjects = sleighFlight.dropObjects.filter(
          (obj) => obj === releaseCargo
        );
      }

      function stopSleighFlight({ resetPosition = true } = {}) {
        if (sleighFlight.active) {
          sleighFlight.active = false;
          sleighFlight.mode = null;
          sleighFlight.releaseCargoDropped = false;
          sleighFlight.plan = null;
          sleighFlight.distance = 0;
          sleighFlight.lastPose = null;
          sleighFlight.smoothYaw = null;
          sleighFlight.lastElapsed = 0;
        }
        if (resetPosition) {
          sleigh.visible = currentTheme === "christmas";
          resetVehiclePosition(sleigh);
        }
      }

      function isOverWarehouseHall(x, z) {
        return x >= -7.5 && x <= 7.5 && z >= -4.2 && z <= 4.2;
      }

      function rand(min, max) {
        return min + Math.random() * (max - min);
      }

      function smooth01(t) {
        const x = Math.max(0, Math.min(1, t));
        return x * x * (3 - 2 * x);
      }

      // Signed shortest angular difference in radians (-PI..PI).
      function shortestAngle(a) {
        let d = a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
      }

      function easeInOutCubic(t) {
        const x = Math.max(0, Math.min(1, t));
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      }

      function easeInOutQuint(t) {
        const x = Math.max(0, Math.min(1, t));
        return x < 0.5
          ? 16 * x * x * x * x * x
          : 1 - Math.pow(-2 * x + 2, 5) / 2;
      }

      /*
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

        // Waypoint ring in flight order. Every coordinate outside the road roll
        // itself is random, so each release flies a visibly different spline. The
        // topology that must stay valid is fixed: roll out and take off on the
        // straight road, swing out over the front lawn and the campus, cross the
        // warehouse hall while high enough for the drop, then rejoin the road from
        // the west and land on it.
        const rollOut = [
          [homeX, homeZ],
          [homeX + rand(5.5, 7), homeZ],
          [homeX + rand(10.5, 13.5), homeZ]
        ];

        const loop = [
          // front-lawn lobe (behind the road)
          [rand(19, 23), homeZ + rand(2.5, 4.5)],
          [rand(15, 20), homeZ + rand(6.5, 9)],
          [rand(8, 14), homeZ + rand(9, 11.5)],
          [rand(-1, 5), homeZ + rand(9, 11.5)],
          [rand(-10, -4), homeZ + rand(6.5, 9)],
          [rand(-15, -11), homeZ + rand(2, 4.5)],
          // west side, dropping towards the hall
          [rand(-15, -11.5), rand(3, 6)],
          [rand(-14, -10.5), rand(-1, 2)],
          [rand(-9, -5), rand(-4, -1)],
          // hall overflight (package drop happens here)
          [rand(-2, 2), rand(-3.5, -1.5)],
          [rand(4.5, 7), rand(-3, -0.5)],
          [rand(10, 14), rand(-2, 1)],
          // east lobe
          [rand(15, 19), rand(-5, -1)],
          [rand(14, 18), rand(-9, -5)],
          // south lobe
          [rand(7, 12), rand(-12, -9)],
          [rand(-1, 4), rand(-14, -10.5)],
          [rand(-9, -4), rand(-12.5, -9)],
          [rand(-15, -11), rand(-8, -4.5)],
          // western return towards the road
          [rand(-19, -16), rand(-2, 1)],
          [rand(-19, -16), rand(3, 6)]
        ];

        const landing = [
          [rand(-17, -14), homeZ],
          [homeX - 16, homeZ],
          [homeX - 10, homeZ],
          [homeX - 5, homeZ],
          [homeX - 1.5, homeZ]
        ];

        // One global size factor per flight: some releases fly a wide sweep, others
        // a tight loop. It only scales the loop, never the road roll itself.
        const spread = rand(0.9, 1.12);
        const centerX = 2;
        const centerZ = 3;

        const ring = [
          ...rollOut,
          ...loop.map(([x, z]) => [
            centerX + (x - centerX) * spread,
            centerZ + (z - centerZ) * spread
          ]),
          ...landing
        ];

        const waypoints = ring.map(([x, z]) => new THREE.Vector3(x, 0, z));

        const curve = new THREE.CatmullRomCurve3(waypoints, true, 'centripetal', 0.5);
        curve.arcLengthDivisions = 1200;
        curve.updateArcLengths();
        const length = curve.getLength() || 1;

        const hMax = rand(5.2, 7);

        // Height profile breakpoints as distances along the route (in world units),
        // converted to the normalized route parameter the curve works with. The
        // descent is spread over a long stretch so it stays a shallow glide, and
        // the flare/touchdown section sits fully on the final road straight.
        const cruiseU = Math.min(46 / length, 0.36);
        const descentU = Math.max(1 - 56 / length, cruiseU + 0.18);
        const breaks = {
          rollIn: 6 / length,       // standstill roll on the road
          lift: 12 / length,        // leaving the ground on the road
          climb: 26 / length,       // climbing out
          cruise: cruiseU,          // reaching cruise altitude
          descent: descentU,        // leaving cruise altitude
          flare: 1 - 16 / length,   // flare over the road
          ground: 1 - 6 / length    // touchdown on the road, roll to home
        };

        // Drop point: the highest route point that is above the warehouse hall.
        // Precomputed, so a random loop can never end up without a hall overflight.
        let dropU = null;
        let dropY = -Infinity;
        const dropSamples = 240;
        for (let i = 0; i <= dropSamples; i += 1) {
          const u = i / dropSamples;
          const y = flightHeightProfile(u, hMax, breaks).y;
          if (y <= 2.4 || y <= dropY) continue;
          const point = curve.getPointAt(u);
          if (!isOverWarehouseHall(point.x, point.z)) continue;
          dropY = y;
          dropU = u;
        }

        return {
          curve,
          length,
          breaks,
          hMax,
          homeZ,
          dropU: dropU ?? 0.5,
          duration: THREE.MathUtils.clamp(length / 8.5, 18, 26)
        };
      }

      /*
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

      function spawnDroppedGift(x, y, z, options = {}) {
        if (sleighFlight.dropObjects.length >= SLEIGH_DROP_LIMIT) {
          const old = sleighFlight.dropObjects.shift();
          if (old?.parent) old.parent.remove(old);
          disposeObject(old);
        }

        let gift = options.object || null;
        if (!gift) {
          const size = 0.46 + Math.random() * 0.22;
          const bodies = [COLORS.red, COLORS.yellow, COLORS.green, COLORS.purple, COLORS.blue, COLORS.orange];
          const ribbons = [COLORS.white, COLORS.yellow, COLORS.red, COLORS.green];
          gift = createGiftBox(
            x,
            z,
            size,
            bodies[Math.floor(Math.random() * bodies.length)],
            ribbons[Math.floor(Math.random() * ribbons.length)],
            Math.random() * Math.PI * 2
          );
        }
        if (!gift) return null;

        if (!gift.parent) {
          christmasGroup.add(gift);
        }

        const targetY = 0.32; // inside hall on floor plane
        const targetX = THREE.MathUtils.clamp(x + (Math.random() - 0.5) * 1.0, -7.0, 7.0);
        const targetZ = THREE.MathUtils.clamp(z + (Math.random() - 0.5) * 1.0, -3.8, 3.8);

        gift.position.set(x, y, z);
        gift.userData.flightDrop = {
          startY: y,
          targetY,
          targetX,
          targetZ,
          startX: x,
          startZ: z,
          startedAt: options.startedAt ?? performance.now() / 1000,
          duration: options.duration ?? (1.0 + Math.random() * 0.5),
          spin: (Math.random() - 0.5) * 4
        };

        sleighFlight.dropObjects.push(gift);
        return gift;
      }

      function updateSleighDrops(elapsed) {
        sleighFlight.dropObjects.forEach((gift) => {
          const d = gift.userData.flightDrop;
          if (!d) return;
          const p = Math.min(1, (elapsed - d.startedAt) / d.duration);
          const eased = 1 - Math.pow(1 - p, 2);
          gift.position.x = d.startX + (d.targetX - d.startX) * eased;
          gift.position.z = d.startZ + (d.targetZ - d.startZ) * eased;
          gift.position.y = d.startY + (d.targetY - d.startY) * (p * p);
          gift.rotation.y += (d.spin || 0) * 0.016;
          gift.rotation.x = Math.sin(p * Math.PI) * 0.35;
          if (p >= 1) {
            gift.position.set(d.targetX, d.targetY, d.targetZ);
            gift.rotation.x = 0;
            delete gift.userData.flightDrop;
          }
        });
      }

      function startSleighFlight(at = performance.now() / 1000, options = {}) {
        if (currentTheme !== "christmas" || drive.active) {
          return false;
        }
        if (options.mode !== "release" && releaseAnimation) {
          return false;
        }
        if (demo) {
          stopDemo();
        }

        const plan = buildFlightPlan();
        stopSleighFlight({ resetPosition: false });
        sleigh.visible = true;
        sleighFlight.active = true;
        sleighFlight.startedAt = at;
        sleighFlight.duration = plan.duration;
        sleighFlight.mode = options.mode ?? "release";
        sleighFlight.releaseCargoDropped = false;
        sleighFlight.plan = plan;
        sleighFlight.distance = 0;
        sleighFlight.lastPose = null;
        sleighFlight.lastElapsed = at;

        // exact start = home, standstill
        resetVehiclePosition(sleigh);

        // Face the actual initial path direction (never drive backwards at takeoff)
        const startSample = pathPoseAt(plan, 0);
        const startTan = startSample.tan;
        const startFlat = Math.hypot(startTan.x, startTan.z);
        sleighFlight.smoothYaw = startFlat > 0.0005
          ? Math.atan2(startTan.z, -startTan.x)
          : VEHICLE_HOME.rotationY;
        sleigh.rotation.set(0, sleighFlight.smoothYaw, 0);
        if (sleigh.userData?.trailer) sleigh.userData.trailer.rotation.y = 0;
        emit("vehicle", { driving: false, label: vehicleLabel(sleigh), flight: true });
        return true;
      }

      function completeReleaseAfterFlight(elapsed) {
        if (!releaseAnimation) return;
        const finished = releaseAnimation.ticket;

        if (releaseCargo.parent) {
          scene.attach(releaseCargo);
        }
        // keep the dropped cargo visible where it landed if it was dropped; otherwise hide
        if (!sleighFlight.releaseCargoDropped) {
          releaseCargo.visible = false;
        }
        releaseCargo.userData.flightDrop = releaseCargo.userData.flightDrop || undefined;

        forklift.root.position.set(6, 0, 5.8);
        forklift.lift.position.y = 0;

        if (finished) {
          finished.status = "Released";
          finished.released = true;
          finished.root.visible = false;
          setSelected(finished);
        }

        bayLeds[0].material.color.setHex(COLORS.green);
        bayLeds[0].material.emissive.setHex(COLORS.green);

        const doneTicket = finished;
        releaseAnimation = null;
        stopSleighFlight({ resetPosition: true });
        emit("progress", 1);
        if (doneTicket) {
          emit("release-end", doneTicket);
        }
      }

      function animateSleighReindeer(elapsed, active, speedHint = 1) {
        const deerList = sleigh?.userData?.reindeer || [];
        deerList.forEach((deer, i) => {
          const a = deer.userData.anim;
          if (!a) return;
          const t = elapsed * (6.5 * (a.speed || 1)) * (active ? (0.85 + speedHint * 0.5) : 0.35) + (a.phase || 0);
          const gallop = active ? 1 : 0.18;
          const stride = Math.sin(t) * 0.55 * gallop;
          const stride2 = Math.sin(t + Math.PI * 0.85) * 0.55 * gallop;
          a.legs.forEach((leg) => {
            const pairPhase = leg.isFront ? stride : stride2;
            const sideBias = leg.side * 0.08 * gallop;
            leg.pivot.rotation.z = pairPhase + sideBias + (active ? 0.05 : 0);
          });
          if (a.body) a.body.position.y = 0.9 + Math.abs(Math.sin(t * 1.0 + i)) * (a.bob || 0.05) * gallop;
          if (a.headGroup) {
            a.headGroup.rotation.z = Math.sin(t * 0.9 + 0.4 + i * 0.2) * 0.08 * gallop;
            a.headGroup.position.y = 1.2 + Math.abs(Math.sin(t + 0.6)) * 0.03 * gallop;
          }
          deer.position.y = 0;
        });
      }

      function updateSleighFlight(elapsed) {
        updateSleighDrops(elapsed);

        if (currentTheme !== "christmas") {
          if (sleighFlight.active) stopSleighFlight({ resetPosition: true });
          return;
        }

        if (!sleighFlight.active) {
          if (currentTheme === "christmas" && sleigh.visible) {
            if (sleigh.userData?.trailer) sleigh.userData.trailer.rotation.y *= 0.85;
            animateSleighReindeer(elapsed, false, 0);
          }
          return;
        }

        if (drive.active) {
          stopSleighFlight({ resetPosition: true });
          return;
        }

        const plan = sleighFlight.plan;
        if (!plan) {
          stopSleighFlight({ resetPosition: true });
          return;
        }

        // Single coherent state: time -> progress -> sampled pose.
        // smooth01 ends exactly at 1 (no asymptotic tail where the sleigh stands
        // still at home while the animation keeps running).
        const tRaw = (elapsed - sleighFlight.startedAt) / sleighFlight.duration;
        const t = Math.max(0, Math.min(1, tRaw));
        const progress = smooth01(t);
        const sample = pathPoseAt(plan, progress);
        const pos = sample.pos;

        // Position comes straight from the planned path. The path IS the steering
        // result: it only curves where the vehicle advances forward, with a bounded
        // radius. So driving "forward while turning" is expressed by the geometry,
        // not by fake rotation in place.
        sleigh.position.set(pos.x, pos.y, pos.z);

        const dt = Math.max(0.001, Math.min(0.05, (elapsed - (sleighFlight.lastElapsed || elapsed)) || 0.016));

        // Heading follows the actual direction of travel (path tangent). Only a very
        // light smoothing is used: the body never lags behind, so it can never slide
        // sideways and never appears to drive backwards.
        const tanFlat = Math.hypot(sample.tan.x, sample.tan.z);
        let targetYaw = sleighFlight.smoothYaw ?? VEHICLE_HOME.rotationY;
        if (tanFlat > 1e-4) {
          targetYaw = Math.atan2(sample.tan.z, -sample.tan.x);
        }
        if (sleighFlight.smoothYaw == null) {
          sleighFlight.smoothYaw = targetYaw;
        }

        const prevYaw = sleighFlight.smoothYaw;
        const yawAlpha = 1 - Math.exp(-18 * dt);
        sleighFlight.smoothYaw += shortestAngle(targetYaw - prevYaw) * yawAlpha;
        sleigh.rotation.y = sleighFlight.smoothYaw;

        // Forward progress actually made this frame: everything vehicle-like
        // (trailer kink, banking) is driven by real forward motion only.
        const distanceNow = progress * (plan.length || 1);
        const lastDist = sleighFlight.lastPose?.dist ?? distanceNow;
        const forwardSpeed = Math.max(0, (distanceNow - lastDist) / dt);
        const moveFactor = THREE.MathUtils.clamp(forwardSpeed / 8, 0, 1);

        // Trailer articulation, aligned to the curve the team actually drives: the
        // trailer axis runs from the route point roughly one trailer length behind
        // the hitch up to the hitch. On straights that chord is parallel to the
        // heading (kink 0); in a curve it gives a real, curve-proportional kink, so
        // the sleigh swings out exactly like a body on a drawbar. The route is a
        // closed loop, so the lag point wraps around the seam.
        if (sleigh.userData?.trailer) {
          const trailer = sleigh.userData.trailer;
          const lag = TRAILER_FOLLOW_DIST / (plan.length || 1);
          let backS = sample.s - lag;
          if (backS < 0) backS += 1;

          const back = pathPoseAt(plan, backS);
          const hx = pos.x - back.pos.x;
          const hz = pos.z - back.pos.z;

          let targetKink = 0;
          if (Math.hypot(hx, hz) > 0.02) {
            const trailerYaw = Math.atan2(hz, -hx);
            targetKink = THREE.MathUtils.clamp(
              shortestAngle(trailerYaw - sleighFlight.smoothYaw) * TRAILER_KINK_GAIN,
              -TRAILER_KINK_MAX,
              TRAILER_KINK_MAX
            );
          }

          const response = 1 - Math.exp(-(6 + 14 * moveFactor) * dt);
          trailer.rotation.y += shortestAngle(targetKink - trailer.rotation.y) * response;
        }

        // Banking + pitch only while airborne and really moving forward.
        // Roll comes from how strongly the horizontal tangent turns along the route
        // (cross product of tangent and a slightly advanced tangent), pitch from the
        // height gradient of the profile. Both are geometry, not fake animation.
        const settle = 1 - Math.exp(-9 * dt);
        if (pos.y > 0.25 && moveFactor > 0.05) {
          const step = Math.min(0.02, Math.max(0.002, 0.35 / (plan.length || 1)));
          const aheadS = Math.min(1, sample.s + step);
          const ahead = pathPoseAt(plan, aheadS);

          // (t0 x t1).y > 0 means the route turns left.
          const turnY = sample.tan.z * ahead.tan.x - sample.tan.x * ahead.tan.z;
          const targetBank = THREE.MathUtils.clamp(turnY * 6, -0.45, 0.45);

          const ds = Math.max(0.01, (aheadS - sample.s) * (plan.length || 1));
          const slope = (ahead.pos.y - pos.y) / ds;
          const targetPitch = THREE.MathUtils.clamp(-Math.atan(slope) * 0.65, -0.22, 0.22);

          const k = 1 - Math.exp(-7 * dt);
          sleigh.rotation.x += (targetBank - sleigh.rotation.x) * k;
          sleigh.rotation.z += (targetPitch - sleigh.rotation.z) * k;
        } else {
          sleigh.rotation.x += (0 - sleigh.rotation.x) * settle;
          sleigh.rotation.z += (0 - sleigh.rotation.z) * settle;
        }

        const flightSpeedHint = 1 + (pos.y > 0.2 ? 0.6 : 0.2);
        animateSleighReindeer(elapsed, true, flightSpeedHint);
        sleighFlight.lastPose = {
          x: pos.x,
          z: pos.z,
          dist: progress * (plan.length || 1)
        };
        sleighFlight.lastElapsed = elapsed;

        // Drop release cargo at the precomputed hall overflight point. Because the
        // plan already picked the highest route point above the hall, the drop can
        // never be skipped (short frame, random loop, long route, ...).
        if (
          sleighFlight.mode === "release" &&
          releaseAnimation &&
          !sleighFlight.releaseCargoDropped &&
          progress >= (plan.dropU ?? 0.5)
        ) {
          sleighFlight.releaseCargoDropped = true;

          const dropX = THREE.MathUtils.clamp(pos.x, -6.5, 6.5);
          const dropZ = THREE.MathUtils.clamp(pos.z, -3.5, 3.5);

          scene.attach(releaseCargo);
          releaseCargo.visible = true;
          releaseCargo.position.set(dropX, pos.y - 0.5, dropZ);
          releaseCargo.userData.flightDrop = {
            startY: pos.y - 0.5,
            targetY: 0.32,
            targetX: dropX,
            targetZ: dropZ,
            startX: dropX,
            startZ: dropZ,
            startedAt: elapsed,
            duration: 1.0,
            spin: (Math.random() - 0.5) * 3
          };
          sleighFlight.dropObjects.push(releaseCargo);

          emit("progress", 0.7);
        }

        if (releaseAnimation) {
          const base = t;
          const prog = sleighFlight.releaseCargoDropped ? 0.7 + base * 0.3 : base * 0.65;
          emit("progress", Math.min(prog, 0.995));
        }

        if (t >= 1) {
          // Single, clean finalization: exact home pose, no extra snaps before/after
          sleigh.position.set(VEHICLE_HOME.x, 0, VEHICLE_HOME.z);
          sleigh.rotation.set(0, VEHICLE_HOME.rotationY, 0);
          if (sleigh.userData?.trailer) sleigh.userData.trailer.rotation.y = 0;
          sleighFlight.smoothYaw = VEHICLE_HOME.rotationY;
          sleighFlight.lastPose = null;
          sleighFlight.lastElapsed = elapsed;
          if (sleighFlight.mode === "release" && releaseAnimation) {
            completeReleaseAfterFlight(elapsed);
          } else {
            stopSleighFlight({ resetPosition: true });
            emit("vehicle", {
              driving: false,
              reset: true,
              label: vehicleLabel(sleigh),
              flight: false
            });
          }
        }
      }

      function triggerSleighFlight() {
        if (currentTheme !== "christmas") return false;
        // Flight is release-only now.
        return false;
      }

      /* --------------------------------------------------
       * Theme
       * -------------------------------------------------- */

      function setTheme(theme) {
        currentTheme =
          THEME_DEFINITIONS[theme] ? theme : "corporate";

        const definition = THEME_DEFINITIONS[currentTheme];

        scene.background.setHex(definition.background);
        scene.fog.color.setHex(definition.background);

        campusGround.material.color.setHex(definition.ground);

        Object.entries(themeGroups).forEach(([id, group]) => {
          group.visible = id === currentTheme;
        });

        snowGround.visible = currentTheme === "christmas";

        const [ambientColor, ambientIntensity] =
          definition.lighting.ambient;

        ambient.color.setHex(ambientColor);
        ambient.intensity = ambientIntensity;

        const [
          hemisphereSky,
          hemisphereGround,
          hemisphereIntensity
        ] = definition.lighting.hemisphere;

        hemisphere.color.setHex(hemisphereSky);
        hemisphere.groundColor.setHex(hemisphereGround);
        hemisphere.intensity = hemisphereIntensity;

        const [sunColor, sunIntensity] = definition.lighting.sun;

        sun.color.setHex(sunColor);
        sun.intensity = sunIntensity;

        const [rimColor, rimIntensity] = definition.lighting.rim;

        rim.color.setHex(rimColor);
        rim.intensity = rimIntensity;

        accentMaterials.forEach((material) => {
          material.color.setHex(definition.accent);
        });

        tickets.forEach(updateTicketTheme);

        if (drive.active) {
          stopDriving({ reset: true });
        }

        if (currentTheme !== "christmas") {
          stopSleighFlight({ resetPosition: true });
          resetSleighFlightDrops();
        } else {
          // Sleigh flies only for releases now.
          stopSleighFlight({ resetPosition: false });
          resetSleighFlightDrops();
        }

        resetVehicles();
        setWeather(definition.weather);

        emit("theme", currentTheme);
      }

      /* --------------------------------------------------
       * One-shot release animation
       * -------------------------------------------------- */

      function startRelease(ticket) {
        if (
          !ticket ||
          releaseAnimation ||
          ticket.status !== "In Testing" ||
          ticket.released
        ) {
          return;
        }

        ticket.status = "Release";
        ticket.route = [];
        ticket.root.visible = false;

        if (drive.active) {
          stopDriving({ reset: true });
        }

        stopSleighFlight({ resetPosition: false });

        forklift.root.position.set(6, 0, 5.8);
        forklift.lift.position.y = 0;

        sleighFlight.dropObjects = sleighFlight.dropObjects.filter(
          (obj) => obj !== releaseCargo
        );
        delete releaseCargo.userData.flightDrop;

        scene.attach(releaseCargo);
        releaseCargo.visible = false;

        releaseAnimation = {
          ticket,
          start: performance.now() / 1000,
          cargoAttached: false,
          cargoPlaced: false,
          vehicle: activeVehicle(),
          mode: currentTheme === "christmas" ? "sleigh-flight" : "ground"
        };

        resetVehicles();

        bayLeds[0].material.color.setHex(COLORS.red);
        bayLeds[0].material.emissive.setHex(COLORS.red);

        if (releaseAnimation.mode === "sleigh-flight") {
          // Sleigh flies over the warehouse hall and drops the package there.
          const started = startSleighFlight(performance.now() / 1000, { mode: "release" });
          if (!started) {
            // Fallback: complete as ground-style delivery if flight cannot start.
            releaseAnimation.mode = "ground";
            releaseCargo.visible = true;
            releaseCargo.position.set(6, 1.1, 3.25);
          } else {
            sleigh.visible = true;
            releaseCargo.visible = false;
          }
        } else {
          releaseCargo.visible = true;
          releaseCargo.position.set(6, 1.1, 3.25);
        }

        setSelected(ticket);
        emit("release-start", ticket);
      }

      function animateRelease(now) {
        if (!releaseAnimation) {
          return;
        }

        const animation = releaseAnimation;

        // Christmas release is handled by the sleigh flight.
        if (animation.mode === "sleigh-flight") {
          if ((!sleighFlight.active || sleighFlight.mode !== "release")) {
            const flightAge = sleighFlight.startedAt ? (now - sleighFlight.startedAt) : Infinity;
            // Give a short grace period for startup; only fail-safe after that.
            if (flightAge > 0.5 && releaseAnimation) {
              completeReleaseAfterFlight(now);
            }
          }
          return;
        }
        const elapsed = now - animation.start;
        const vehicle = animation.vehicle;

        let forkliftZ = 5.8;
        let forkHeight = 0;

        if (elapsed < 2) {
          forkliftZ = lerp(
            5.8,
            1.7,
            smooth(elapsed / 2)
          );
        } else if (elapsed < 3.4) {
          forkliftZ = 1.7;

          forkHeight = lerp(
            0,
            0.8,
            smooth((elapsed - 2) / 1.4)
          );
        } else if (elapsed < 5.8) {
          forkliftZ = lerp(
            1.7,
            6.2,
            smooth((elapsed - 3.4) / 2.4)
          );

          forkHeight = 0.8;
        } else if (elapsed < 7) {
          forkliftZ = 6.2;

          forkHeight = lerp(
            0.8,
            0.12,
            smooth((elapsed - 5.8) / 1.2)
          );
        }

        forklift.root.position.set(
          6,
          0,
          forkliftZ
        );

        /*
         * Only the fork assembly moves vertically.
         */
        forklift.lift.position.y =
          forkHeight;

        if (
          elapsed >= 2 &&
          !animation.cargoAttached
        ) {
          animation.cargoAttached = true;

          forklift.cargoAnchor.add(
            releaseCargo
          );

          releaseCargo.position.set(0, 0, 0);
        }

        if (
          elapsed >= 6.55 &&
          !animation.cargoPlaced
        ) {
          animation.cargoPlaced = true;

          scene.attach(releaseCargo);

          releaseCargo.position.set(
            6,
            1.35,
            8.65
          );
        }

        if (elapsed >= 7) {
          releaseCargo.visible = false;
        }

        if (elapsed >= 7 && elapsed < 11) {
          vehicle.position.x = lerp(
            6,
            16,
            smooth((elapsed - 7) / 4)
          );

          vehicle.rotation.y = Math.PI;
        } else if (
          elapsed >= 11 &&
          elapsed < 12.2
        ) {
          vehicle.position.x = 16;
        } else if (
          elapsed >= 12.2 &&
          elapsed < 16.5
        ) {
          vehicle.position.x = lerp(
            16,
            6,
            smooth((elapsed - 12.2) / 4.3)
          );

          vehicle.rotation.y = 0;
        }

        emit("progress", Math.min(elapsed / 17, 1));

        /*
         * No modulo and no loop.
         */
        if (elapsed >= 17) {
          const finished =
            animation.ticket;

          scene.attach(releaseCargo);
          releaseCargo.visible = false;

          forklift.root.position.set(
            6,
            0,
            5.8
          );

          forklift.lift.position.y = 0;

          finished.status = "Released";
          finished.released = true;
          finished.root.visible = false;

          bayLeds[0].material.color.setHex(
            COLORS.green
          );

          bayLeds[0].material.emissive.setHex(
            COLORS.green
          );

          releaseAnimation = null;

          resetVehicles();
          setSelected(finished);
          emit("release-end", finished);
        }
      }

      /* --------------------------------------------------
       * Animate mode - scripted parcel flow
       * -------------------------------------------------- */

      const DEMO_INTERVAL = 4.4;
      const DEMO_TRIP_MS = 6.8;
      const DEMO_TRIP_GAP = 12.5;

      function demoMessage(message) {
        emit("demo", {
          running: Boolean(demo),
          message
        });
      }

      function startDemo() {
        if (demo) {
          return demo;
        }

        if (drive.active) {
          stopDriving({ reset: true });
        }

        const now = performance.now() / 1000;

        demo = {
          startedAt: now,
          nextActionAt: now + 0.9,
          nextTripAt: now + 3.2,
          trip: null
        };

        /*
         * A slow orbit makes the demo feel alive; it is cleared again as soon
         * as the demo stops, so the user camera is never hijacked for long.
         */
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;

        demoMessage("Animation running");

        return demo;
      }

      function stopDemo() {
        if (!demo) {
          return;
        }

        demo = null;
        controls.autoRotate = false;

        if (!releaseAnimation) {
          resetVehicles();
        }

        demoMessage("Animation stopped");
      }

      function animateDemoTrip(now) {
        const trip = demo.trip;
        const progress = (now - trip.start) / trip.duration;
        const vehicle = activeVehicle();

        vehicle.position.z = 9.2;

        if (progress >= 1) {
          demo.trip = null;
          vehicle.position.set(6, 0, 9.2);
          vehicle.rotation.y = Math.PI;
          return;
        }

        if (progress < 0.45) {
          vehicle.position.x = lerp(
            6,
            16,
            smooth(progress / 0.45)
          );

          vehicle.rotation.y = Math.PI;
        } else if (progress < 0.55) {
          vehicle.position.x = 16;
        } else {
          vehicle.position.x = lerp(
            16,
            6,
            smooth((progress - 0.55) / 0.45)
          );

          vehicle.rotation.y = 0;
        }
      }

      function demoAdvance(now) {
        const testing = tickets.find(
          (ticket) =>
            !ticket.released && ticket.status === "In Testing"
        );

        if (testing) {
          startRelease(testing);
          demoMessage(`Loading ${testing.id}`);
          demo.nextActionAt = now + DEMO_INTERVAL;
          return;
        }

        const active = tickets
          .filter(
            (ticket) =>
              !ticket.released &&
              STATUSES.includes(ticket.status)
          )
          .sort(
            (left, right) =>
              STATUSES.indexOf(left.status) -
              STATUSES.indexOf(right.status)
          );

        if (!active.length) {
          const ticket = createTicket(
            `DEMO-${++demoSerial}`,
            "To Do",
            {
              title: "Demo shipment",
              quantity: 1 + Math.floor(Math.random() * 12),
              tag: "#demo"
            }
          );

          layoutTickets(false);
          demoMessage(`Queued ${ticket.id}`);
          demo.nextActionAt = now + DEMO_INTERVAL;
          return;
        }

        const ticket = active[0];
        const index = STATUSES.indexOf(ticket.status);
        const nextStatus = STATUSES[index + 1];

        if (!nextStatus) {
          return;
        }

        moveTicket(ticket, nextStatus);
        demoMessage(`${ticket.id} → ${nextStatus}`);

        demo.nextActionAt = now + DEMO_INTERVAL;
      }

      function animateDemo(now) {
        if (!demo) {
          return;
        }

        /*
         * The release animation owns the truck/forklift, so the scripted
         * shuttle pauses while a parcel is being loaded.
         */
        if (releaseAnimation) {
          demo.trip = null;
          return;
        }

        if (demo.trip) {
          animateDemoTrip(now);
        } else if (now >= demo.nextTripAt) {
          demo.trip = {
            start: now,
            duration: DEMO_TRIP_MS
          };

          demo.nextTripAt = now + DEMO_TRIP_GAP;
          demoMessage("Truck departing");
        }

        if (now >= demo.nextActionAt) {
          demoAdvance(now);
        }
      }

      /* --------------------------------------------------
       * Theme decoration animation
       * -------------------------------------------------- */

      function updateAmbience(elapsed) {
        animatedBats.forEach((bat, index) => {
          const angle = elapsed * bat.speed + bat.phase;

          bat.group.position.set(
            Math.cos(angle) * bat.radius,
            bat.height + Math.sin(angle * 2.4) * bat.bob,
            Math.sin(angle) * bat.radius
          );

          bat.group.rotation.y = -angle + Math.PI / 2;
          bat.group.rotation.z = Math.sin(angle * 3.2) * 0.14;

          const flap = Math.sin(elapsed * 8 + index * 2) * 0.45;

          bat.wings[0].rotation.z = -0.22 - flap;
          bat.wings[1].rotation.z = 0.22 + flap;
        });

        driftingFog.forEach((fog) => {
          fog.patch.position.x =
            fog.baseX +
            Math.sin(elapsed * fog.speed + fog.phase) * 2.6;

          fog.patch.rotation.y =
            Math.sin(elapsed * 0.05 + fog.phase) * 0.3;
        });

        neonPulse.forEach((entry) => {
          entry.material.emissiveIntensity =
            entry.base +
            Math.sin(elapsed * entry.speed + entry.phase) *
              entry.amplitude;
        });
      }

            function applyTickets(incomingTickets) {
        const incomingIds = new Set(
          incomingTickets.map(
            (ticket) => ticket.id
          )
        );

        const existingById = new Map(
          tickets.map(
            (ticket) => [ticket.id, ticket]
          )
        );

        incomingTickets.forEach((incoming) => {
          const existing =
            existingById.get(incoming.id);

          if (!existing) {
            const ticket = createTicket(
              incoming.id,
              STATUSES.includes(incoming.status)
                ? incoming.status
                : "To Do",
              incoming
            );

            if (
              incoming.status === "Released"
            ) {
              ticket.status = "Released";
              ticket.released = true;
              ticket.root.visible = false;
            }

            return;
          }

          const oldStatus = existing.status;

          existing.title = incoming.title;
          existing.quantity = incoming.quantity;
          existing.tag = incoming.tag;
          existing.labels = incoming.labels;
          existing.updated = incoming.updated;
          existing.priority = incoming.priority;
          existing.assignee = incoming.assignee;
          existing.jiraStatus =
            incoming.jiraStatus;

          if (
            incoming.status === "Release" &&
            oldStatus === "In Testing" &&
            !releaseAnimation
          ) {
            startRelease(existing);
            return;
          }

          if (
            incoming.status === "Released"
          ) {
            existing.status = "Released";
            existing.released = true;
            existing.route = [];
            existing.root.visible = false;
            return;
          }

          if (
            STATUSES.includes(incoming.status)
          ) {
            existing.status = incoming.status;
            existing.released = false;
            existing.root.visible = true;

            if (
              oldStatus !== incoming.status &&
              STATUSES.includes(oldStatus)
            ) {
              layoutTickets(false);

              buildRoute(
                existing,
                oldStatus,
                incoming.status
              );
            }
          }
        });

        /*
         * Remove missing tickets only when loading a collection.
         * A single-issue request is allowed to coexist with that issue only.
         */
        [...tickets].forEach((ticket) => {
          if (
            incomingIds.has(ticket.id) ||
            releaseAnimation?.ticket === ticket
          ) {
            return;
          }

          scene.remove(ticket.root);
          disposeObject(ticket.root);

          const index =
            tickets.indexOf(ticket);

          if (index >= 0) {
            tickets.splice(index, 1);
          }
        });

        rebuildClickableMeshes();
        layoutTickets(false);

        const refreshed = selectedTicket
          ? tickets.find(
              (ticket) =>
                ticket.id === selectedTicket.id
            )
          : null;

        if (refreshed) {
          setSelected(refreshed);
        } else if (tickets.length) {
          setSelected(tickets[0]);
        } else {
          setTicketsCleared();
        }
      }

/* --------------------------------------------------
       * Frame updates
       * -------------------------------------------------- */

      function updatePackages(delta) {
        tickets.forEach((ticket) => {
          if (
            ticket.released ||
            ticket.status === "Release"
          ) {
            return;
          }

          const routing =
            updateRoute(ticket, delta);

          if (!routing) {
            ticket.root.position.x =
              THREE.MathUtils.damp(
                ticket.root.position.x,
                ticket.target.x,
                5,
                delta
              );

            ticket.root.position.y =
              THREE.MathUtils.damp(
                ticket.root.position.y,
                ticket.target.y,
                5,
                delta
              );

            ticket.root.position.z =
              THREE.MathUtils.damp(
                ticket.root.position.z,
                ticket.target.z,
                5,
                delta
              );
          }

          const selected =
            ticket === selectedTicket;

          const hovered =
            ticket === hoveredTicket;

          const dimmed =
            searchFilter !== null &&
            !searchFilter.has(ticket.id);

          ticket.body.material.color.setHex(
            dimmed
              ? ticket.dimBodyColor
              : selected
                ? COLORS.yellow
                : hovered
                  ? COLORS.orange
                  : ticket.baseColor
          );

          ticket.ribbons.forEach((ribbon) => {
            ribbon.material.color.setHex(
              dimmed
                ? ticket.dimRibbonColor
                : ticket.ribbonColor
            );
          });

          if (ticket.label?.material) {
            ticket.label.material.opacity = dimmed ? 0.35 : 0.98;
          }

          const targetScale =
            selected
              ? 1.16
              : dimmed
                ? 0.78
                : hovered
                  ? 1.1
                  : 1;

          ticket.root.scale.x =
            THREE.MathUtils.damp(
              ticket.root.scale.x,
              targetScale,
              8,
              delta
            );

          ticket.root.scale.y =
            THREE.MathUtils.damp(
              ticket.root.scale.y,
              targetScale,
              8,
              delta
            );

          ticket.root.scale.z =
            THREE.MathUtils.damp(
              ticket.root.scale.z,
              targetScale,
              8,
              delta
            );
        });

        const conveyorActive =
          tickets.some(
            (ticket) =>
              ticket.route.length ||
              [
                "In Progress",
                "In Review",
                "In Testing"
              ].includes(ticket.status)
          );

        if (conveyorActive) {
          rollers.forEach(
            ({ drum, speed }) => {
              drum.rotation.y +=
                delta * speed;
            }
          );
        }
      }

/* --------------------------------------------------
       * 3D interaction
       * -------------------------------------------------- */

      const raycaster =
        new THREE.Raycaster();

      const pointer =
        new THREE.Vector2();

      function setPointer(event) {
        const bounds =
          renderer.domElement
            .getBoundingClientRect();

        pointer.x =
          (
            (event.clientX - bounds.left) /
            bounds.width
          ) *
            2 -
          1;

        pointer.y =
          -(
            (event.clientY - bounds.top) /
            bounds.height
          ) *
            2 +
          1;
      }

      function ticketUnderPointer() {
        raycaster.setFromCamera(
          pointer,
          camera
        );

        const intersections =
          raycaster.intersectObjects(
            clickableMeshes,
            false
          );

        for (
          const intersection of intersections
        ) {
          const ticket =
            intersection.object
              .userData.ticket;

          if (
            ticket &&
            ticket.root.visible &&
            !ticket.released
          ) {
            return ticket;
          }
        }

        return null;
      }

      function vehicleUnderPointer() {
        raycaster.setFromCamera(
          pointer,
          camera
        );

        for (const vehicle of [truck, sleigh]) {
          if (
            vehicle.visible &&
            raycaster.intersectObject(vehicle, true).length
          ) {
            return vehicle;
          }
        }

        return null;
      }

      function updateHover(event) {
        setPointer(event);

        hoveredTicket =
          ticketUnderPointer();

        if (!hoveredTicket) {
          tooltip.style.display = "none";

          const decor =
            currentTheme === "christmas" ? decorActorUnderPointer() : null;
          renderer.domElement.style.cursor =
            vehicleUnderPointer() || decor ? "pointer" : "grab";

          return;
        }

        renderer.domElement.style.cursor =
          "pointer";

        document.getElementById(
          "tooltipId"
        ).textContent =
          hoveredTicket.id;

        document.getElementById(
          "tooltipTitle"
        ).textContent =
          hoveredTicket.title || "";

        document.getElementById(
          "tooltipStatus"
        ).textContent =
          hoveredTicket.status;

        const meta = [
          hoveredTicket.assignee && hoveredTicket.assignee !== "Unassigned"
            ? `👤 ${hoveredTicket.assignee}`
            : null,
          hoveredTicket.priority && hoveredTicket.priority !== "None"
            ? `⚑ ${hoveredTicket.priority}`
            : null
        ].filter(Boolean).join("  •  ");
        const metaEl = document.getElementById("tooltipMeta");
        if (metaEl) {
          metaEl.textContent = meta;
        }

        document.getElementById(
          "tooltipMeta"
        ).textContent =
          `${hoveredTicket.quantity} units · ` +
          `${hoveredTicket.tag} · ` +
          `${hoveredTicket.assignee}`;

        tooltip.style.display = "block";

        tooltip.style.left =
          `${event.clientX + 14}px`;

        tooltip.style.top =
          `${event.clientY + 14}px`;
      }

      /*
       * Raycasting on every pointermove is expensive in a scene with many
       * packages, so hover work is coalesced into one frame. Clicks and
       * context menus stay immediate because they must use the live pointer.
       */
      let hoverFrame = null;
      let lastHoverEvent = null;

      renderer.domElement.addEventListener(
        "pointermove",
        (event) => {
          lastHoverEvent = event;

          if (hoverFrame !== null) {
            return;
          }

          hoverFrame = requestAnimationFrame(() => {
            hoverFrame = null;

            if (lastHoverEvent) {
              updateHover(lastHoverEvent);
            }
          });
        }
      );

      renderer.domElement.addEventListener(
        "pointerleave",
        () => {
          hoveredTicket = null;
          tooltip.style.display = "none";
        }
      );

      renderer.domElement.addEventListener(
        "click",
        (event) => {
          if (suppressSceneClick) {
            suppressSceneClick = false;
            return;
          }

          setPointer(event);

          const vehicle =
            vehicleUnderPointer();

          if (vehicle) {
            if (!drive.active) {
              startDriving(vehicle);
            }

            return;
          }

          const ticket =
            ticketUnderPointer();

          if (ticket) {
            setSelected(ticket);
            return;
          }

          if (currentTheme === "christmas") {
            const actor = decorActorUnderPointer();
            if (actor) {
              triggerDecorActor(actor);
              emit("decor-action", {
                type: actor.type,
                mode: actor.active?.mode
              });
            }
          }
        }
      );

      renderer.domElement.addEventListener(
        "dblclick",
        (event) => {
          setPointer(event);

          if (chaseView.active) {
            event.preventDefault();
            recenterLook();
            return;
          }

          const vehicle =
            vehicleUnderPointer();

          if (vehicle) {
            event.preventDefault();
            resetVehicle(vehicle);
            return;
          }

          const ticket =
            ticketUnderPointer();

          if (ticket) {
            setSelected(ticket);
            emit("next-request", ticket);
          }
        }
      );

      renderer.domElement.addEventListener(
        "contextmenu",
        (event) => {
          setPointer(event);

          const ticket =
            ticketUnderPointer();

          if (!ticket) {
            return;
          }

          event.preventDefault();

          tooltip.style.display = "none";

          setSelected(ticket);
          emit("context-request", {
            ticket,
            clientX: event.clientX,
            clientY: event.clientY
          });
        }
      );

/* --------------------------------------------------
       * Labels and resizing
       * -------------------------------------------------- */

      function projectLabel(
        element,
        position
      ) {
        const projected =
          position.clone().project(renderCamera());

        const width =
          renderer.domElement.clientWidth;

        const height =
          renderer.domElement.clientHeight;

        const x =
          (projected.x * 0.5 + 0.5) *
          width;

        const y =
          (-projected.y * 0.5 + 0.5) *
          height;

        const visible =
          projected.z > -1 &&
          projected.z < 1 &&
          x >= 0 &&
          x <= width &&
          y >= 0 &&
          y <= height;

        element.style.display =
          visible
            ? "block"
            : "none";

        element.style.left =
          `${x}px`;

        element.style.top =
          `${y}px`;
      }

      function updateLabels() {
        projectLabel(
          document.getElementById(
            "hallLabel"
          ),
          new THREE.Vector3(
            0,
            4.35,
            -5.2
          )
        );

        projectLabel(
          document.getElementById(
            "depotLabel"
          ),
          new THREE.Vector3(
            16.2,
            4.7,
            -4
          )
        );

        projectLabel(
          document.getElementById(
            "officeLabel"
          ),
          new THREE.Vector3(
            -19.2,
            6.2,
            -8.8
          )
        );
      }

      function resize() {
        const width =
          window.innerWidth;

        const height =
          window.innerHeight;

        const aspect =
          width / height;

        camera.left =
          (-cameraSize * aspect) / 2;

        camera.right =
          (cameraSize * aspect) / 2;

        camera.top =
          cameraSize / 2;

        camera.bottom =
          -cameraSize / 2;

        camera.updateProjectionMatrix();

        cockpitCamera.aspect = aspect;
        cockpitCamera.updateProjectionMatrix();

        renderer.setSize(
          width,
          height
        );

        renderer.setPixelRatio(
          Math.min(
            window.devicePixelRatio,
            1.75
          )
        );
      }

      window.addEventListener(
        "resize",
        resize
      );

/* --------------------------------------------------
       * Ride-along camera ("Fahrersicht")
       * -------------------------------------------------- */

      /*
       * Optional cockpit view ("Fahrersicht"): while a flight or a drive runs,
       * the camera sits on the driver's seat and looks along the heading. Because
       * it is carried by the vehicle, banking and pitch come for free and the
       * scene gets real perspective depth. Orbit controls are parked for the
       * duration and the previous framing is restored when it is turned off.
       */
      const DRIVER_EYE_HEIGHT = {
        // local offsets in the vehicle's own space (-x is forward, so a larger x
        // sits further back towards the rear seat)
        truck: new THREE.Vector3(-0.9, 2.55, 0.42),
        sleigh: new THREE.Vector3(2, 2.75, 0)
      };

      const COCKPIT_ROLL_DAMPING = 0.35;
      const COCKPIT_FOV = 62;

      // Head turn: dragging looks around from the seat, relative to the vehicle.
      const LOOK_SENSITIVITY = 0.0028;
      const LOOK_YAW_LIMIT = 2;
      const LOOK_PITCH_UP = 0.6;
      const LOOK_PITCH_DOWN = 0.85;
      const LOOK_FOLLOW = 14;

      const chaseView = {
        active: false,
        ready: false,
        saved: null
      };

      const lookAround = {
        dragging: false,
        pointerId: null,
        lastX: 0,
        lastY: 0,
        moved: false,
        yaw: 0,
        pitch: 0,
        targetYaw: 0,
        targetPitch: 0
      };

      const WORLD_UP = new THREE.Vector3(0, 1, 0);
      const LOCAL_UP = new THREE.Vector3(0, 1, 0);
      const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
      const cockpitEye = new THREE.Vector3();
      const cockpitForward = new THREE.Vector3();
      const cockpitUp = new THREE.Vector3();
      const cockpitTarget = new THREE.Vector3();
      const cockpitView = new THREE.Matrix4();
      const cockpitBase = new THREE.Quaternion();
      const lookYaw = new THREE.Quaternion();
      const lookPitch = new THREE.Quaternion();

      let suppressSceneClick = false;

      function chaseSubject() {
        if (sleighFlight.active) {
          return sleigh;
        }

        if (drive.active && drive.vehicle) {
          return drive.vehicle;
        }

        const vehicle = activeVehicle();

        return vehicle?.visible ? vehicle : null;
      }

      /*
       * Node that carries the driver. In the sleigh the seat lives on the
       * articulated trailer, so the view follows the hitch kink instead of the
       * reindeer team.
       */
      function driverNode(vehicle) {
        if (vehicle === sleigh && sleigh.userData.trailer) {
          return sleigh.userData.trailer;
        }

        return vehicle;
      }

      function updateChaseCamera(dt) {
        if (!chaseView.active) {
          return;
        }

        const vehicle = chaseSubject();

        if (!vehicle) {
          chaseView.ready = false;
          return;
        }

        const node = driverNode(vehicle);

        node.updateWorldMatrix(true, false);

        const offset =
          vehicle === sleigh
            ? DRIVER_EYE_HEIGHT.sleigh
            : DRIVER_EYE_HEIGHT.truck;

        cockpitEye.copy(offset).applyMatrix4(node.matrixWorld);
        cockpitForward
          .set(-1, 0, 0)
          .transformDirection(node.matrixWorld)
          .normalize();

        /*
         * Carry most of the vehicle's roll so banking is visible, but keep a
         * share of the world horizon so the flight never looks upside down.
         */
        cockpitUp
          .copy(WORLD_UP)
          .transformDirection(node.matrixWorld)
          .lerp(WORLD_UP, COCKPIT_ROLL_DAMPING)
          .normalize();

        // Ease the head turn so mouse drags feel like a neck, not a snap.
        const ease = chaseView.ready
          ? 1 - Math.exp(-LOOK_FOLLOW * Math.min(Math.max(dt, 0.001), 0.1))
          : 1;

        lookAround.yaw += (lookAround.targetYaw - lookAround.yaw) * ease;
        lookAround.pitch +=
          (lookAround.targetPitch - lookAround.pitch) * ease;

        cockpitTarget
          .copy(cockpitEye)
          .add(cockpitForward);

        cockpitView.lookAt(cockpitEye, cockpitTarget, cockpitUp);
        cockpitBase.setFromRotationMatrix(cockpitView);

        lookYaw.setFromAxisAngle(LOCAL_UP, lookAround.yaw);
        lookPitch.setFromAxisAngle(LOCAL_RIGHT, -lookAround.pitch);

        cockpitCamera.position.copy(cockpitEye);
        cockpitCamera.quaternion
          .copy(cockpitBase)
          .multiply(lookYaw)
          .multiply(lookPitch);

        chaseView.ready = true;
      }

      function beginLook(event) {
        if (!chaseView.active || event.button !== 0) {
          return;
        }

        suppressSceneClick = false;
        lookAround.dragging = true;
        lookAround.pointerId = event.pointerId;
        lookAround.lastX = event.clientX;
        lookAround.lastY = event.clientY;
        lookAround.moved = false;

        if (renderer.domElement.setPointerCapture) {
          renderer.domElement.setPointerCapture(event.pointerId);
        }
      }

      function moveLook(event) {
        if (
          !lookAround.dragging ||
          event.pointerId !== lookAround.pointerId
        ) {
          return;
        }

        const dx = event.clientX - lookAround.lastX;
        const dy = event.clientY - lookAround.lastY;

        lookAround.lastX = event.clientX;
        lookAround.lastY = event.clientY;

        if (Math.abs(dx) + Math.abs(dy) > 0) {
          lookAround.moved =
            lookAround.moved || Math.hypot(dx, dy) >= 2;
        }

        lookAround.targetYaw = clamp(
          lookAround.targetYaw - dx * LOOK_SENSITIVITY,
          -LOOK_YAW_LIMIT,
          LOOK_YAW_LIMIT
        );

        lookAround.targetPitch = Math.max(
          -LOOK_PITCH_UP,
          Math.min(
            LOOK_PITCH_DOWN,
            lookAround.targetPitch + dy * LOOK_SENSITIVITY
          )
        );
      }

      function endLook(event) {
        if (
          !lookAround.dragging ||
          (event && event.pointerId !== lookAround.pointerId)
        ) {
          return;
        }

        lookAround.dragging = false;
        lookAround.pointerId = null;

        if (lookAround.moved) {
          // Swallow the click that follows a head drag, so looking around never
          // selects a package or starts driving.
          suppressSceneClick = true;
        }
      }

      function recenterLook() {
        lookAround.targetYaw = 0;
        lookAround.targetPitch = 0;
      }

      renderer.domElement.addEventListener("pointerdown", beginLook);
      window.addEventListener("pointermove", moveLook);
      window.addEventListener("pointerup", endLook);
      window.addEventListener("pointercancel", endLook);

      function setChaseView(on) {
        const next = Boolean(on);

        if (next === chaseView.active) {
          return chaseView.active;
        }

        chaseView.active = next;

        if (next) {
          chaseView.saved = {
            position: camera.position.clone(),
            target: controls.target.clone(),
            zoom: camera.zoom
          };
          chaseView.ready = false;
          lookAround.yaw = 0;
          lookAround.pitch = 0;
          lookAround.targetYaw = 0;
          lookAround.targetPitch = 0;
          cockpitCamera.fov = COCKPIT_FOV;
          cockpitCamera.aspect =
            window.innerWidth / window.innerHeight;
          cockpitCamera.updateProjectionMatrix();
          controls.enabled = false;
        } else {
          controls.enabled = true;
          lookAround.dragging = false;
          lookAround.pointerId = null;
          lookAround.yaw = 0;
          lookAround.pitch = 0;
          lookAround.targetYaw = 0;
          lookAround.targetPitch = 0;

          if (chaseView.saved) {
            camera.position.copy(chaseView.saved.position);
            controls.target.copy(chaseView.saved.target);
            camera.zoom = chaseView.saved.zoom;
            camera.updateProjectionMatrix();
            controls.update();
          }

          chaseView.saved = null;
          chaseView.ready = false;
        }

        emit("chase", { active: chaseView.active });

        return chaseView.active;
      }

      function toggleChaseView() {
        return setChaseView(!chaseView.active);
      }

      /*
       * Camera that actually renders the frame. Labels project with the same
       * camera, otherwise they would drift while the cockpit view is active.
       */
      function renderCamera() {
        return chaseView.ready ? cockpitCamera : camera;
      }

/* --------------------------------------------------
       * Initialization
       * -------------------------------------------------- */

      createCampus();
      createWarehouse();
      createDepot();

      setTheme("corporate");
      resize();

      const clock = new THREE.Clock();

      function animate() {
        requestAnimationFrame(animate);

        const delta = Math.min(
          clock.getDelta(),
          0.05
        );

        const elapsed =
          performance.now() / 1000;

        updatePackages(delta);
        updateWeather(delta, elapsed);
        updateAmbience(elapsed);
        updateDecorActors(elapsed);
        animateRelease(elapsed);
        animateDemo(elapsed);
        updateSleighFlight(elapsed);
        updateDriving(delta);

        if (chaseView.active) {
          updateChaseCamera(delta);
        } else {
          controls.update();
        }

        updateLabels();

        renderer.render(
          scene,
          renderCamera()
        );
      }

      animate();

      /* --------------------------------------------------
       * Public API
       * -------------------------------------------------- */

      export const campus = {
        STATUSES,
        THEMES,
        normalizeLabel,
        on,
        emit,

        setTheme,
        getTheme: () => currentTheme,
        getThemes: () => THEMES,
        getWeather: () =>
          activeWeather
            ? {
                kind: activeWeather,
                visible: weatherVisible,
                points: weatherGroup(
                  activeWeather
                ).children.reduce(
                  (total, layer) =>
                    total +
                    layer.geometry.attributes.position.count,
                  0
                )
              }
            : null,
        setWeatherVisible,

        startDemo,
        stopDemo,
        isDemoRunning: () => Boolean(demo),
        resetCamera,
        topCamera,
        focusSelected,
        setChaseView,
        toggleChaseView,
        isChaseView: () => chaseView.active,
        getViewCamera: () => {
          const active = renderCamera();
          const forward = active
            .getWorldDirection(new THREE.Vector3());

          return {
            mode: chaseView.ready ? "driver" : "overview",
            perspective: active.isPerspectiveCamera === true,
            fov: active.isPerspectiveCamera ? active.fov : null,
            look: {
              yaw: +lookAround.yaw.toFixed(3),
              pitch: +lookAround.pitch.toFixed(3)
            },
            forward: {
              x: +forward.x.toFixed(3),
              y: +forward.y.toFixed(3),
              z: +forward.z.toFixed(3)
            },
            position: {
              x: +active.position.x.toFixed(3),
              y: +active.position.y.toFixed(3),
              z: +active.position.z.toFixed(3)
            }
          };
        },

        startDriving,
        stopDriving,
        resetVehicle,
        isDriving: () => drive.active,
        triggerSleighFlight,
        isSleighFlying: () => sleighFlight.active,
        getVehicle: () => {
          const vehicle = activeVehicle();

          return {
            label: vehicleLabel(vehicle),
            visible: vehicle.visible,
            position: {
              x: vehicle.position.x,
              y: vehicle.position.y,
              z: vehicle.position.z
            },
            rotationY: vehicle.rotation.y
          };
        },

        createTicket,
        layoutTickets,
        seedMockTickets,
        clearTickets,
        applyTickets,
        rebuildClickableMeshes,

        moveTicket,
        moveNext,
        startRelease,

        setSelected,
        clearSelected: setTicketsCleared,
        setSearchFilter,

        getTickets: () => tickets.slice(),
        getSelectedTicket: () => selectedTicket,
        isReleasing: () => releaseAnimation !== null,
        nextMockTicketId: () => `JIRA-${++ticketSerial}`
      };

