# The Last Parcel

A 3D browser driving game. It is December 24, 4pm, in Luxembourg's old town. You drive the last courier van of the year. Every present must arrive before Christmas Eve dinner, the 6pm cutoff, and you can't make every stop.

Phone first. Plays in the browser, no install. Launch target: **December 16, 2026**.

---

## 1. Goals

1. **Visual quality at or above "Trick or Clawd".** Lighting, fog, glow and snow do the heavy lifting, not polygon count.
2. **Feels great on a phone.** 60 fps on a mid-range phone (iPhone 13, Pixel 7 class), playable one-handed in short sessions.
3. **A reason to come back daily until Christmas.** Daily route, ghosts, leaderboard.
4. **Public, well-tested codebase.** TypeScript, readable modules, tests, a write-up at launch.

Non-goals for v1: real-time multiplayer, accounts or login, accurate GIS map, monetization, sound files or 3D model files.

---

## 2. Core loop

- **One run = one shift**, 4:00pm to 6:00pm game time, about **5 minutes real time** (1 game minute = 2.5 s).
- The van starts at the depot loaded with **14 to 18 parcels**. Each has an address, a type, and a value.
- Drive to a glowing delivery zone, stop inside it, hold for about 1 s to hand over. Quick and readable, no mini-game.
- At 6pm the shift ends. Parcels still in the van don't arrive before Christmas.

### Parcel types

| Type | Rule | Why it's interesting |
|---|---|---|
| Standard | Deliver anywhere before 6pm | Baseline |
| Express | Bonus if delivered before 5pm | Forces early routing choices |
| Fragile | Value drops with each hard hit | Rewards careful driving on ice |
| Heavy | Van handles worse while it's on board | Deliver it first, or carry the penalty |
| "For Grandma" | Big bonus, address is uphill or awkward | The emotional, risky pick |

### Events at the door (light, quick)

- **Not home:** choose "leave with neighbour" (fast, small chance of complaint) or "come back later" (keeps full value, costs time).
- **Tip:** some recipients tip for on-time or fragile-intact deliveries.

### Hazards

- **Ice patches** on shaded streets and bridges. The van slides.
- **Steep cobbled switchbacks** between the upper town and Grund. Hard to climb when heavy, fast and slippery going down.
- **Christmas market crowds** around the market squares. Very slow, pedestrians move unpredictably.
- **Roadworks and closures** that change daily (seeded).
- **Traffic:** a few cars, a city bus on a fixed route, a snowplough that clears ice behind it.
- Snowfall intensity rises during the shift. Visibility drops toward 6pm.

### Scoring

```
score = sum(delivered parcel value)
      + express bonuses + tips
      + fragile-intact bonus
      + streak bonus (deliveries within 30 s of each other)
      - damage penalty
```

End-of-shift tally screen, same idea as Trick or Clawd: line items, total, rank.

Ranks: **Missed the Sleigh** / **On Time** / **Christmas Hero**. Thresholds tuned in playtesting.

### Van handling

The heavier the load, the slower the acceleration and the longer the braking. The van gets lighter and nimbler as the shift goes on. This makes route order a real decision.

---

## 3. Setting: Luxembourg old town

Inspired by the real place, not a map replica. **The town layout is fixed and hand-authored** so players can learn it. The daily seed changes parcels, closures, ice, and weather, not the streets.

Zones to include, as stylised set pieces:

- **Ville Haute (upper town):** narrow streets, the two market squares with stalls, a big tree and a Ferris wheel.
- **The Corniche:** a road along the cliff edge with the valley view. The postcard shot.
- **Grund (lower town):** down in the valley by the river, old stone houses, fog sitting low over the water.
- **Switchback climbs** linking upper and lower town, cobbled and steep.
- **A high bridge** across the valley, iced over and windy.
- **Casemate cliffs** lit from below.
- **The depot** at the edge of town by the Gare, where the shift starts.

### Real landmarks and geography

The layout is hand-authored, not GIS, but it keeps the **real geography and the real route between landmarks**: the upper town on its plateau, the Pétrusse valley to the south (crossed by Pont Adolphe) and the Alzette valley with Grund to the east, cliffs between them. Streets are simplified and shortened so they're fun to drive, but their order and the landmarks along them are real, so a local can find their way.

**The spine (in driving order):**

1. **Gare (Luxembourg station)**: the far end of Avenue de la Liberté. The **depot** sits here, where the shift starts.
2. **Avenue de la Liberté** → **Pont Adolphe**, the high bridge over the Pétrusse valley: iced over and windy.
3. **Boulevard Franklin Delano Roosevelt** → **Place de la Constitution**: the **Gëlle Fra** (Golden Lady) and the **Ferris wheel**, with a view back over the valley to Pont Adolphe. The **Cathédrale Notre-Dame** stands beside it.
4. **Place Guillaume II ("Knuedler")** with the **Hôtel de Ville**, between Place de la Constitution and Place d'Armes. Market stalls.
5. **Rue Chimay** → **Place d'Armes**: the Christmas market and the big tree.
6. **Rue du Curé**: the **Palais Grand-Ducal** on the right at the corner of **Rue du Marché-aux-Herbes**, which runs between Rue du Curé and Rue de la Boucherie.
7. **Rue de la Boucherie** → **Bock casemates** and the **Corniche** along the cliff edge above Grund (the postcard shot).
8. **Switchbacks** down the cliff → **Grund** on the valley floor → **Rue Münster** → **Neumünster Abbey** by the river, in low fog.

Loops and side streets are added around this spine for route choices, closures and stops. The spine itself stays.

**Landmark looks** (from reference photos; silhouette and colour first, ornament as painted shader detail):

| Landmark | What makes it recognisable |
|---|---|
| **Cathédrale Notre-Dame** | Three spires: two tall, slender **dark-slate needles** and one **green copper** spire over the crossing, plus a large dark slate hipped roof on honey sandstone. **The spires must be visible from almost everywhere in town**, like the Golden Gate Bridge in San Francisco: the player's compass. They sit above the fog line and catch light at night. |
| **Palais Grand-Ducal** | Flemish Renaissance. Honey sandstone with carved diamond and arabesque panels; steep **dark slate roof** with **pointed turret spires**, dormers with iron finials; **corner oriel towers**; a long first-floor **balcony with iron railing on stone corbels**; a **blue arched door** with **two blue sentry boxes**; chained bollards along the front. |
| **Hôtel de Ville** | Neoclassical, symmetrical, about seven bays. **Cream plaster with honey sandstone quoins** and a heavy cornice; low slate roof with two chimneys; **triangular pediments over the tall ground-floor French doors**; window boxes with red flowers; wall lanterns; **two green bronze lions on plinths** flanking a **wide front staircase**; flags over the door. At night the ground floor glows warm. |
| **Gare** | **Clock tower with a green copper baroque cupola**, sandstone hall, dark slate mansard roof with round dormers, a big **arched glass gable window**. Floodlit at night: the tower is a beacon down Avenue de la Liberté. |
| **Gëlle Fra** | Golden figure holding a wreath, on a tall stone obelisk. Lit gold at night. |
| **Pont Adolphe** | Stone arch bridge over a deep wooded valley. |
| **Neumünster Abbey** | Long low stone abbey buildings by the river in Grund. |

Street names on addresses are real (Grand-Rue, Rue du Marché-aux-Herbes, Rue de la Boucherie, Rue Chimay, Rue Münster…); house numbers are fictional.

Local flavour through text, not voice:

- Dispatcher radio messages as short toasts, in English: "16 parcels to go. Last run before Christmas Eve dinner. Good luck!"
- Recipients say thank you in French, German, Portuguese and English, the city's common languages. No Luxembourgish text (it can't be reviewed).
- End screen: "Merry Christmas!"

No real company names or logos. The courier is fictional (working name: **Kuerier**).

---

## 4. Visual direction

Target: **a warm, toy-like miniature town at blue hour, turning to night.** Stylised, not photoreal.

- **Time of day:** shift starts just after sunset with a deep blue sky and ends in full night. Lights switch on during the run.
- **Colour:** cool blue snow and shadows vs. warm amber windows, street lamps and market lights. That contrast is the whole look.
- **Snow:** falling snow (GPU compute, tens of thousands of flakes) plus **accumulation** on roofs, cars, the van and ledges. Tyre tracks behind the van.
- **Lights:** window glow, string lights across streets, market stall bulbs, van headlights cutting through the snow, the Ferris wheel.
- **Atmosphere:** height fog filling the valley, steam rising from market stalls, breath-like exhaust from the van.
- **Surfaces:** wet cobblestones with soft reflections of the lights.
- **Facade relief:** walls are not flat. Recessed windows with sills and frames that stick out, door steps and stoops, dormers and chimneys on roofs, oriel (bay) windows, shop awnings and signs, balconies. All instanced, so the whole town adds only a handful of draw calls.
- **Post-processing:** bloom, filmic tone mapping (AgX), colour grading, vignette, light film grain, mild depth of field on the far valley.
- **All assets procedural:** geometry built in code, textures drawn to canvases or generated in shaders. Same approach as Trick or Clawd: no downloads, tiny bundle, consistent style.

**Process rule:** the look is built in week 1, not at the end. Every milestone ends with screenshots from fixed camera positions, reviewed against this section.

---

## 5. Phone-first controls and UI

- **Orientation:** landscape. Show a "rotate your phone" screen in portrait.
- **Controls (touch):** left thumb steers (drag left/right on a virtual wheel area). Right thumb has **Gas** and **Brake/Reverse** buttons. Optional tilt-to-steer in settings.
- **Desktop:** WASD or arrows, Space to brake, gamepad supported.
- **Haptics:** short vibration on hard hits and on each delivery (Android; silently skipped where unsupported).
- **HUD:** clock (4:00pm → 6:00pm), parcels left, score, minimap with the next stop, an arrow toward the selected stop.
- **Stop picker:** tap a parcel in a small tray to set it as the current target. Default target is the nearest.
- **Chase camera:** behind and above the van, lags slightly on turns, pulls back at speed, tightens in narrow streets. Never clips through buildings.
- **Settings:** music volume, sound volume, quality (Auto/High/Medium/Fast), fewer flashes, tilt steering.
- Safe areas respected (notch, home bar). Large touch targets.

---

## 6. Daily route, ghosts and leaderboard

- **Daily seed** = the date in Europe/Luxembourg time. Everyone gets the same parcels, closures, ice and weather that day.
- **Free play** with a random seed is always available.
- **Ghosts:** during a daily run, show 3 ghost vans: the day's best run, a run close to your own best, and your own previous best.
- **Ghost format:** van position and heading sampled at 10 Hz, quantised and compressed. Recording positions (not inputs) means the physics doesn't have to be perfectly deterministic. Target under 20 KB per run.
- **Leaderboard:** daily top 50 plus your own position. Nickname only, no account. An anonymous player ID kept in local storage.
- **Light anti-cheat:** the server recomputes score from the submitted delivery log, checks timings are physically possible against distances, and rejects outliers. Good enough for a free holiday game.
- **Share card:** end screen generates an image (score, rank, route drawn on a mini-map) for sharing, Wordle style.

---

## 7. Tech stack

| Area | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | Readable, safe refactors |
| Build | Vite | Fast dev server, simple static build |
| 3D | three.js latest, `WebGPURenderer` with automatic WebGL2 fallback, shaders in TSL | GPU compute for snow, one shader codebase for both backends |
| Physics | Rapier (`@dimforge/rapier3d-compat`), raycast vehicle controller | Real sliding on ice, collisions, slopes |
| UI | Preact for menus, HUD and tally; three.js for the world | Small and fast, keeps UI code separate from the render loop |
| Audio | Web Audio API, fully procedural | No files; adaptive music that speeds up as 6pm nears |
| Randomness | Seeded PRNG everywhere gameplay-relevant | Daily route, reproducible tests |
| Backend | Cloudflare Worker + D1 (SQLite) | Leaderboard, ghost storage, score checks. Free tier is enough |
| Hosting | Cloudflare Pages | Same platform as the Worker, global CDN |
| Offline | PWA manifest + service worker | Add to home screen, plays offline (daily features need network) |
| Unit tests | Vitest | Scoring, seeds, route generation, ghost encoding |
| E2E tests | Playwright | Scripted runs, screenshots, performance checks |

### Project layout

```
/src
  /core       game state, clock, seeded RNG, scoring, parcels
  /world      town layout, buildings, roads, set pieces, props
  /vehicle    van physics, handling, damage
  /render     renderer setup, quality tiers, post-processing, snow, lights
  /audio      procedural music and sound effects
  /ui         Preact screens and HUD
  /net        daily seed, leaderboard and ghost API client
  /test-hook  window.__game API (only with ?test)
/worker       Cloudflare Worker + D1 schema
/tests
  /unit       Vitest
  /e2e        Playwright
SPEC.md
CLAUDE.md
```

### Performance budget (mid-range phone)

- 60 fps target, 30 fps floor on the Fast tier
- Under 200 draw calls (instancing for buildings, props, lights, crowds)
- Under 600k triangles on screen
- Initial download under 1.5 MB gzipped, interactive in under 3 s on 4G
- Adaptive quality like Trick or Clawd: measure frame time continuously, lower render scale first, then drop a tier

---

## 8. Testing and quality

- **Test hook:** with `?test` in the URL, expose `window.__game` (state, clock, van, parcels, `step(dt)`, `teleport()`, `setSeed()`, `deliver()`), and let tests run the simulation without real time.
- **Unit tests:** scoring rules, parcel generation per seed, ghost encode/decode round trip, clock math.
- **Scripted playtests (Playwright):** a bot that drives the route using the test hook. Checks that every daily seed is completable, that no parcel spawns unreachable, and that no closure blocks the only route.
- **Visual checks:** screenshots from 6 fixed camera positions on every milestone. Reviewed by eye and by Claude against section 4.
- **Performance checks:** Playwright with CPU throttling and mobile viewport, fail if average frame time crosses the budget.
- **Real devices:** test on at least one iPhone and one Android phone each week.

---

## 9. Milestones

### M1: Look and vertical slice (Nov 13 to Nov 19)
- Repo, Vite, TypeScript, three.js WebGPU renderer with WebGL2 fallback, quality tiers
- One snowy upper-town street with buildings, window lights, street lamps, falling snow, fog, post-processing
- Drivable van (basic physics), chase camera, touch + keyboard controls
- One delivery, a countdown clock, a minimal HUD
- **Checkpoint:** screenshots + runs at 60 fps on a phone. Agree the look before going on.

### M2: Town and core loop (Nov 20 to Nov 26)
- Facade relief pass on the M1 street first (see §4), so the look is settled before the town is built
- Real geography and landmark placement (§3): the spine from the Gare depot to Neumünster Abbey, landmarks as blocking volumes in their real positions, cathedral spires visible from every street
- Full town layout: upper town, Corniche, switchbacks, Grund, bridge, depot
- Parcel generation from seed, all five parcel types, delivery zones, stop picker, minimap
- Scoring, tally screen, ranks
- **Checkpoint:** a full 5-minute shift is playable start to finish.

### M3: Visual pass (Nov 27 to Dec 3)
- Detailed landmark models: Cathédrale Notre-Dame, Palais Grand-Ducal, Hôtel de Ville, Gare, Gëlle Fra, Pont Adolphe, Neumünster Abbey
- Snow accumulation and tyre tracks, wet cobblestone reflections
- Christmas markets: stalls, string lights, tree, Ferris wheel, steam, crowds
- Valley fog, casemate lighting, sky and lights changing over the shift
- **Checkpoint:** screenshot review against section 4.

### M4: Feel and sound (Dec 4 to Dec 10)
- Rapier vehicle tuning: ice, slopes, load weight, damage
- Traffic, bus, snowplough, closures, door events
- Procedural music and sound effects, haptics
- Settings screen, PWA, loading screen
- **Checkpoint:** playtest with 3 people who haven't seen it.

### M5: Daily, ghosts, launch (Dec 11 to Dec 16)
- Worker + D1: daily seed, leaderboard, ghost storage, score checks
- Ghost vans, share card
- Full test suite green, performance checks on real phones
- Deploy, README, write-up
- **Launch: Dec 16**

If behind schedule, cut in this order: tilt steering, share card, snowplough, ghosts (keep the leaderboard).

---

## 10. Open questions

- Final title and courier name (working: The Last Parcel / Kuerier)
- Exact rank thresholds and parcel values (tune in M2 playtests)
- Whether "come back later" redelivery is fun or just slow (test in M4, cut if not)
- Music style: music box + strings like Trick or Clawd, or something more brass-band Christmas
