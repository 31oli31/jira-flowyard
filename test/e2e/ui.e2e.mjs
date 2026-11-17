/*
 * End-to-end smoke test for the campus UI.
 *
 * Runs against a real server process and a real browser, so it is kept out of
 * `npm test` (unit tests) and executed via `npm run test:e2e`.
 *
 * Set CHROME_PATH when Chrome is not installed in a default location. The
 * script skips itself instead of failing when no browser is available, which
 * keeps CI runs on machines without Chrome green.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.E2E_PORT || 3311);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

let chromium;
let puppeteer;

try {
  puppeteer = (await import("puppeteer-core")).default;
} catch {
  console.log("SKIP e2e: puppeteer-core is not installed (npm install)");
  process.exit(0);
}

chromium = CHROME_CANDIDATES.find((path) => existsSync(path));

if (!chromium) {
  console.log("SKIP e2e: no Chrome/Chromium found, set CHROME_PATH");
  process.exit(0);
}

const failures = [];
const consoleErrors = [];

function check(label, condition, details) {
  console.log(`${condition ? "✓" : "✗"} ${label}`, details ?? "");
  if (!condition) {
    failures.push(label);
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await sleep(250);
  }

  throw new Error(`Server did not become healthy on ${BASE_URL}`);
}

const server = spawn(process.execPath, ["server/index.js"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
  stdio: "ignore"
});

let browser;

try {
  await waitForHealth();

  browser = await puppeteer.launch({
    executablePath: chromium,
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader"
    ],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 }
  });

  const page = await browser.newPage();

  page.on("pageerror", (error) =>
    consoleErrors.push(`[pageerror] ${error.message}`)
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`[console] ${message.text()}`);
    }
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{transition:none!important;animation:none!important}"
  });
  await sleep(900);

  const evaluate = (callback) => page.evaluate(callback);

  check(
    "details panel starts collapsed",
    (await evaluate(
      () =>
        document.body.classList.contains("panel-closed") &&
        getComputedStyle(document.querySelector(".sidebar")).visibility ===
          "hidden"
    )) === true
  );

  await page.click("#openPackages");
  await sleep(150);

  check(
    "package browser lists every mock package",
    (await evaluate(
      () =>
        !document.querySelector("#packageDrawer").hidden &&
        document.querySelectorAll("#packageList .package-row").length === 40
    )) === true
  );

  await page.type("#packageSearch", "Sleigh");

  check(
    "search narrows the package list",
    (await evaluate(
      () =>
        document.querySelectorAll("#packageList .package-row").length === 1 &&
        document.querySelector("#packageList .package-row strong")
          .textContent === "JIRA-1026"
    )) === true
  );

  await page.keyboard.press("Escape");

  check(
    "Escape closes the package browser",
    await evaluate(() => document.querySelector("#packageDrawer").hidden)
  );

  const contextHit = await evaluate(() => {
    const canvas = document.querySelector("#scene canvas");

    for (let y = 260; y < 760; y += 20) {
      for (let x = 360; x < 1260; x += 20) {
        canvas.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 2
          })
        );

        if (!document.querySelector("#packageMenu").hidden) {
          return { x, y };
        }
      }
    }

    return null;
  });

  check("right-click opens the package menu", Boolean(contextHit), contextHit);
  check(
    "package menu exposes workflow actions",
    (await evaluate(
      () =>
        document.querySelectorAll("#packageMenuActions .context-menu-item")
          .length >= 8
    )) === true
  );

  await page.keyboard.press("Escape");

  await page.goto(`${BASE_URL}/?theme=christmas#JIRA-1030`, {
    waitUntil: "domcontentloaded"
  });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{transition:none!important;animation:none!important}"
  });
  await sleep(900);

  check(
    "deep link applies the theme and selects the ticket",
    (await evaluate(
      () =>
        document.body.classList.contains("christmas") &&
        document.querySelector("#ticketId").textContent === "JIRA-1030" &&
        !document.body.classList.contains("panel-closed")
    )) === true
  );

  check(
    "christmas theme renders visible snow",
    (await evaluate(() => {
      const weather = window.jiraFlowyard?.getWeather();

      return (
        Boolean(weather) && weather.kind === "snow" && weather.points > 0
      );
    })) === true,
    await evaluate(
      () => JSON.stringify(window.jiraFlowyard?.getWeather() ?? null)
    )
  );

  /*
   * Weather visibility is measured, not assumed: the same frame is captured
   * with and without the particle layers and the differing pixels are counted.
   * The camera is reset first so the view matches the default framing.
   */
  await evaluate(() => window.jiraFlowyard.resetCamera());
  await sleep(700);

  const snowFrame = await page.screenshot({ encoding: "base64" });

  await evaluate(() => window.jiraFlowyard.setWeatherVisible(false));
  await sleep(120);

  const bareFrame = await page.screenshot({ encoding: "base64" });

  await evaluate(() => window.jiraFlowyard.setWeatherVisible(true));

  const snowPixels = await page.evaluate(
    async ([visible, hidden]) => {
      const load = (base64) =>
        new Promise((resolve) => {
          const image = new Image();

          image.onload = () => resolve(image);
          image.src = `data:image/png;base64,${base64}`;
        });

      const [withSnow, without] = await Promise.all([
        load(visible),
        load(hidden)
      ]);

      const canvas = document.createElement("canvas");

      canvas.width = withSnow.width;
      canvas.height = withSnow.height;

      const context = canvas.getContext("2d");

      context.drawImage(withSnow, 0, 0);

      const first = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(without, 0, 0);

      const second = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;

      let changed = 0;

      for (let index = 0; index < first.length; index += 4) {
        const delta =
          Math.abs(first[index] - second[index]) +
          Math.abs(first[index + 1] - second[index + 1]) +
          Math.abs(first[index + 2] - second[index + 2]);

        if (delta >= 12) {
          changed += 1;
        }
      }

      return {
        changed,
        total: first.length / 4,
        share: Number(
          ((changed / (first.length / 4)) * 100).toFixed(2)
        )
      };
    },
    [snowFrame, bareFrame]
  );

  check(
    "snowflakes actually paint a sizeable part of the frame",
    snowPixels.changed > 10000,
    `${snowPixels.changed} px (${snowPixels.share} % of the frame)`
  );

  await page.click("#themeButton");
  await sleep(150);

  const themeMenu = await evaluate(() => {
    const menu = document.querySelector("#themeMenu");

    return {
      open: !menu.hidden,
      options: [...menu.querySelectorAll(".theme-option")].map(
        (option) => option.dataset.theme
      ),
      expanded: document
        .querySelector("#themeButton")
        .getAttribute("aria-expanded")
    };
  });

  check(
    "theme menu opens with every theme",
    themeMenu.open &&
      themeMenu.options.length >= 5 &&
      themeMenu.expanded === "true",
    themeMenu.options.join(", ")
  );

  await page.keyboard.press("Escape");
  await sleep(150);

  check(
    "Escape closes the theme menu",
    await evaluate(() => document.querySelector("#themeMenu").hidden)
  );

  await page.click("#themeButton");
  await sleep(120);
  await page.click("#themeButton");
  await sleep(200);

  check(
    "clicking the theme button again closes the menu",
    (await evaluate(() => {
      const menu = document.querySelector("#themeMenu");

      return menu.hidden && getComputedStyle(menu).display === "none";
    })) === true
  );

  await page.click("#themeButton");
  await sleep(150);
  await page.click('#themeMenu .theme-option[data-theme="halloween"]');
  await sleep(250);

  check(
    "picking a theme applies it, closes the menu and updates the URL",
    (await evaluate(() => {
      const menu = document.querySelector("#themeMenu");

      return (
        document.body.dataset.theme === "halloween" &&
        new URLSearchParams(window.location.search).get("theme") ===
          "halloween" &&
        menu.hidden &&
        document.querySelector("#themeButtonLabel").textContent ===
          "Halloween" &&
        document.querySelector("#deliveredKpiIcon").textContent === "🎃" &&
        window.jiraFlowyard.getWeather()?.kind === "embers"
      );
    })) === true
  );

  await page.click("#animateToggle");
  await sleep(300);

  check(
    "animate button starts the scripted demo",
    (await evaluate(() => {
      const button = document.querySelector("#animateToggle");

      return (
        button.getAttribute("aria-pressed") === "true" &&
        document.querySelector("#animateLabel").textContent === "Stop" &&
        window.jiraFlowyard.isDemoRunning() === true
      );
    })) === true
  );

  await page.click("#animateToggle");
  await sleep(250);

  check(
    "animate button stops the scripted demo",
    (await evaluate(() => {
      const button = document.querySelector("#animateToggle");

      return (
        button.getAttribute("aria-pressed") === "false" &&
        document.querySelector("#animateLabel").textContent === "Animate" &&
        window.jiraFlowyard.isDemoRunning() === false
      );
    })) === true
  );

  await page.keyboard.press("a");
  await sleep(250);

  check(
    "the A shortcut toggles the animation",
    (await evaluate(() => window.jiraFlowyard.isDemoRunning())) === true
  );

  await page.keyboard.press("a");
  await sleep(250);

  check(
    "topbar KPIs are driven by real ticket data",
    (await evaluate(() => {
      const tickets = window.jiraFlowyard.getTickets();
      const active = tickets.filter((ticket) => !ticket.released);
      const inProgress = active.filter((ticket) =>
        ["In Progress", "In Review", "In Testing"].includes(ticket.status)
      ).length;

      const text = document.querySelector("#app").textContent;

      return (
        !text.includes("On-time delivery") &&
        document.querySelector("#totalPackages").textContent ===
          String(active.length) &&
        document.querySelector("#inProgressPackages").textContent ===
          String(inProgress) &&
        document.querySelector("#deliveredPackages").textContent ===
          String(tickets.filter((ticket) => ticket.released).length)
      );
    })) === true
  );

  /*
   * Easter egg: clicking the truck hands over the keyboard controls. The hit
   * point is found by scanning the canvas so the test does not depend on the
   * camera projection math.
   */
  const truckHit = await evaluate(() => {
    const canvas = document.querySelector("#scene canvas");
    const campus = window.jiraFlowyard;
    const bounds = canvas.getBoundingClientRect();
    const startX = Math.round(bounds.left + bounds.width * 0.3);
    const endX = Math.round(bounds.left + bounds.width * 0.7);
    const startY = Math.round(bounds.top + bounds.height * 0.55);
    const endY = Math.round(bounds.top + bounds.height * 0.85);

    for (let y = startY; y < endY; y += 12) {
      for (let x = startX; x < endX; x += 12) {
        canvas.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          })
        );

        if (campus.isDriving()) {
          campus.resetVehicle();
          return { x, y };
        }
      }
    }

    return null;
  });

  /*
   * A real mouse click is used on purpose: it focuses the page, which keeps
   * requestAnimationFrame at full speed in headless Chrome.
   */
  if (truckHit) {
    await page.mouse.click(truckHit.x, truckHit.y);
    await sleep(200);
  }

  check(
    "clicking the truck starts drive mode",
    Boolean(truckHit) &&
      (await evaluate(() => window.jiraFlowyard.isDriving())),
    truckHit
  );

  const vehicleBefore = await evaluate(() =>
    window.jiraFlowyard.getVehicle()
  );

  await page.keyboard.down("ArrowUp");
  await sleep(1200);
  await page.keyboard.up("ArrowUp");
  await sleep(150);

  const vehicleAfter = await evaluate(() =>
    window.jiraFlowyard.getVehicle()
  );

  check(
    "arrow keys move the truck",
    vehicleAfter.position.x !== vehicleBefore.position.x ||
      vehicleAfter.position.z !== vehicleBefore.position.z,
    `${vehicleBefore.position.x.toFixed(1)} → ${vehicleAfter.position.x.toFixed(1)}`
  );

  await page.keyboard.press("KeyC");
  await sleep(300);

  const chasingOn = await evaluate(() => {
    const campus = window.jiraFlowyard;
    const vehicle = campus.getVehicle();

    return {
      active: campus.isChaseView(),
      driving: campus.isDriving(),
      pressed: document.querySelector("#chaseCamera").getAttribute("aria-pressed"),
      camera: campus.getViewCamera(),
      vehicle
    };
  });

  check(
    "C turns the ride-along camera on while driving",
    chasingOn.active === true &&
      chasingOn.driving === true &&
      chasingOn.pressed === "true",
    JSON.stringify(chasingOn)
  );

  check(
    "the ride-along view is a perspective camera on the driver's seat",
    chasingOn.camera.mode === "driver" &&
      chasingOn.camera.perspective === true &&
      Math.hypot(
        chasingOn.camera.position.x - chasingOn.vehicle.position.x,
        chasingOn.camera.position.z - chasingOn.vehicle.position.z
      ) < 3 &&
      chasingOn.camera.position.y > 1.2 &&
      chasingOn.camera.position.y < 3.2,
    JSON.stringify(chasingOn.camera)
  );

  const dragStart = await evaluate(() => {
    const rect = document
      .querySelector("#scene canvas")
      .getBoundingClientRect();

    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 150, dragStart.y, { steps: 12 });
  await page.mouse.up();
  await sleep(450);

  const turned = await evaluate(() => ({
    driving: window.jiraFlowyard.isDriving(),
    camera: window.jiraFlowyard.getViewCamera()
  }));

  check(
    "dragging in the cockpit turns the head",
    turned.driving === true &&
      turned.camera.look.yaw < -0.15 &&
      Math.abs(turned.camera.forward.z) > 0.1,
    JSON.stringify(turned.camera)
  );

  await page.mouse.click(dragStart.x, dragStart.y, { count: 2 });
  await sleep(450);

  const recentered = await evaluate(() =>
    window.jiraFlowyard.getViewCamera()
  );

  check(
    "double-clicking the cockpit recenters the head",
    Math.abs(recentered.look.yaw) < 0.05 &&
      Math.abs(recentered.forward.z) < 0.05,
    JSON.stringify(recentered)
  );

  await page.click("#chaseCamera");
  await sleep(300);

  const chasingOff = await evaluate(() => ({
    active: window.jiraFlowyard.isChaseView(),
    pressed: document.querySelector("#chaseCamera").getAttribute("aria-pressed"),
    camera: window.jiraFlowyard.getViewCamera()
  }));

  check(
    "clicking the camera button turns the ride-along view off again",
    chasingOff.active === false &&
      chasingOff.pressed === "false" &&
      chasingOff.camera.mode === "overview" &&
      chasingOff.camera.perspective === false &&
      Math.abs(chasingOff.camera.position.x - 32) < 1 &&
      Math.abs(chasingOff.camera.position.z - 35) < 1,
    JSON.stringify(chasingOff)
  );

  const resetHit = await evaluate(() => {
    const canvas = document.querySelector("#scene canvas");
    const campus = window.jiraFlowyard;
    const bounds = canvas.getBoundingClientRect();
    const startX = Math.round(bounds.left + bounds.width * 0.3);
    const endX = Math.round(bounds.left + bounds.width * 0.7);
    const startY = Math.round(bounds.top + bounds.height * 0.55);
    const endY = Math.round(bounds.top + bounds.height * 0.85);

    for (let y = startY; y < endY; y += 12) {
      for (let x = startX; x < endX; x += 12) {
        canvas.dispatchEvent(
          new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          })
        );

        if (!campus.isDriving()) {
          return { x, y };
        }
      }
    }

    return null;
  });
  await sleep(250);

  const parked = await evaluate(() => ({
    driving: window.jiraFlowyard.isDriving(),
    vehicle: window.jiraFlowyard.getVehicle()
  }));

  check(
    "double-clicking the truck parks it again",
    resetHit !== null &&
      parked.driving === false &&
      Math.abs(parked.vehicle.position.x - 6) < 0.01 &&
      Math.abs(parked.vehicle.position.z - 9.2) < 0.01,
    JSON.stringify({ resetHit, position: parked.vehicle.position })
  );

  await page.click("#chaseCamera");
  await sleep(250);
  await page.click("#resetCamera");
  await sleep(300);

  const afterReset = await evaluate(() => ({
    chase: window.jiraFlowyard.isChaseView(),
    pressed: document.querySelector("#chaseCamera").getAttribute("aria-pressed")
  }));

  check(
    "resetting the camera leaves the ride-along view",
    afterReset.chase === false && afterReset.pressed === "false",
    JSON.stringify(afterReset)
  );

  await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
  await sleep(400);

  check(
    "narrow phones do not overflow horizontally",
    await evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  );

  check("no console errors", consoleErrors.length === 0, consoleErrors);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error(`\n${failures.length} e2e check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll e2e checks passed");
}
