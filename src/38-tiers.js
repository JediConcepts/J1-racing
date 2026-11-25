/* =========================================================================
   MCL-64: the picture tiers, and which of them a device is given
   =========================================================================
   The table of tiers, the saved settings, the trial a heavy tier is put on
   and the guard that steps down from it. Nothing in this file touches the
   page, the renderer or a clock: each function is handed what it needs and
   answers with what is to be done, so test/tiers.test.js runs all of it in
   plain node. Game (40-game.js) calls these from its listeners and its
   frame loop, and carries the answers out. */

/* --- the picture tiers --------------------------------------------------- */

/* ONE TABLE for everything that differs between the tiers. applyQuality and
   resize read it, and nothing else asks which tier is on. The order the
   settings button cycles through them is TIER_ORDER, below.

     target       'small'  the console's low framebuffer, stretched up
                  'super'  drawn above the display size and scaled down
     toneMapping  'none' | 'aces'. The post node does it (see buildPostNode),
                  never the renderer.
     exposure     renderer.toneMappingExposure, which the post node reads
     shadows      'blob' | 'single' | 'cascades'    see applyShadowMode
     sky          'dome' | 'physical'               see applySkyMode
     post         'retro' | 'grade' | 'full'        see applyPostMode
     overlays     whether the page lays its scanline and glow layers on top
     canvas       the size of the canvas drawing buffer:
                  'device'  the render target times the device pixel ratio,
                            which is what main has always had
                  'target'  the size of the render target and no larger
     heavy        true for a tier that not every device is known to hold.
                  Such a tier is not trusted until it has drawn, and is
                  given up for TIER_SAFE if the frames come too slowly
                  (see THE RULES below).

   Retro and Modern are what main has always drawn, in every field, the two
   layers over the page included: main lays them over both.

   Ultra keeps Modern's target, tone mapping and exposure, and differs in
   the rest:
     shadows   'cascades'  four maps laid along the view, so everything the
                           camera sees out to 700 m has a shadow
                           (33-shadows.js)
     sky       'physical'  the engine's clear sky at settings.timeOfDay,
                           which sets the three lights and the haze for the
                           hour (32-sky.js)
     post      'full'      Modern's tone map with bloom in front of it and a
                           grade for the time of day behind it
     overlays  false       the picture is its own post pass, with no
                           scanlines and no glow over it
     canvas    'target'    no larger than the render target
     heavy     true */
var TIERS = {
  retro: {
    target: 'small', toneMapping: 'none', exposure: 1.0,
    shadows: 'blob', sky: 'dome', post: 'retro',
    overlays: true, canvas: 'device', heavy: false
  },
  modern: {
    target: 'super', toneMapping: 'aces', exposure: 1.12,
    shadows: 'single', sky: 'dome', post: 'grade',
    overlays: true, canvas: 'device', heavy: false
  },
  ultra: {
    target: 'super', toneMapping: 'aces', exposure: 1.12,
    shadows: 'cascades',
    sky: 'physical',
    post: 'full',
    overlays: false, canvas: 'target', heavy: true
  }
};

/* The order the Graphics button steps through the tiers, on every device. */
var TIER_ORDER = ['retro', 'modern', 'ultra'];

/* How long the Graphics button waits after the last click before the tier it
   shows is built, in milliseconds. The button steps through the tiers in one
   direction, so the way from Modern to Retro passes Ultra, and Ultra takes
   seconds to build the first time. With the wait, two quick clicks pass it
   without building it. */
var TIER_SETTLE_MS = 400;

/* The tier a heavy tier falls back to. */
var TIER_SAFE = 'modern';

/* =========================================================================
   WHO IS GIVEN WHICH TIER: THE RULES

   A new player is given Ultra, the heavy tier, on a device nobody has
   measured. Everything from here to the end of the file exists to make these
   five things true, and test/tiers.test.js has a line for each.

   R2  A DEVICE THAT CANNOT RUN ULTRA ENDS IN MODERN, by itself, within about
       10 seconds of screen time, and stays there: whatever the length of
       its frames, and whether the player waits, reloads, or leaves and
       comes back.
   R3  A DEVICE THAT CAN RUN ULTRA NEVER HAS IT TAKEN AWAY BY MISTAKE. None
       of these counts against it: a page that is hidden, before or during
       its trial; a graphics device lost while the page is hidden or within
       TIER_GRACE_MS of its coming back; the slow frames of the load itself;
       a browser held to 30 frames a second, with the odd frame doubled.
   R4  EVERY LOAD THAT BUILDS A HEAVY TIER IS ON TRIAL, whoever picked the
       tier and however often it has run before. And once the trial is
       passed, a tab the system kills while the page is in view leaves a
       mark the next load reads as a loss. A tab thrown away in the
       background leaves none.
   R5  THE SECOND CHANCE. One loss on a page in view costs the tier one load
       (that load is in TIER_SAFE, and says so to a player who had picked
       the tier), and the load after it tries the tier again. A second loss
       in that load turns the tier off until the player picks it again. The
       player's own pick on the Graphics button always wins for that load.
   R8  NONE OF THIS REACHES THE SIMULATION. No function here reads a clock
       or is called from tick. The frame loop hands the guard its gap.

   HOW: ONE KEY AND ONE TABLE. Everything the game has learned about the
   heavy tier on this device is in the settings (the tier, `tierChosen`,
   `tierBarred`) and in one more key, TIER_TRIAL_KEY, which says what the
   heavy tier was doing when the page was last heard from. A page writes the
   key at each event in the right hand column, and the load that finds it
   does what the middle column says.

     the key holds        the load that finds it      written when
     -------------------  --------------------------  ------------------------
     (nothing)            builds the saved tier;      a light tier is on; or
                          a heavy one goes on trial   the page is out of view
                                                      with its trial passed
     ultra                the tier did not start:     a page in view starts or
                          TIER_SAFE, saved, off       resumes a trial (before
                                                      the tier is built)
     ultra untried MS     no failure: the tier        a page on trial is
                          again, on trial, with MS    hidden, left or reloaded
                          of its time already used    with nothing wrong on it
     ultra running        a loss: the tab died in     the trial is passed and
                          view                        the page is in view; or
                                                      a page is left inside
                                                      its trial with an error
                                                      on it
     ultra lost           a loss: the device went     the graphics device is
                                                      lost on a page in view
     ultra again          the tier again, on trial,   a load has just counted
                          as its second chance        a first loss (it is in
                                                      TIER_SAFE itself)

   A FIRST LOSS is not saved: the load is in TIER_SAFE and the key becomes
   'ultra again' (with ' chosen' after it for a tier the player picked,
   because any setting saved in that load writes the settings out whole with
   TIER_SAFE in them). The second chance load writes ' twice' after whatever
   it writes ('ultra running twice', 'ultra lost twice'), and a loss found
   with that word turns the tier off: TIER_SAFE, saved, `tierBarred`.

   A key that names a heavy tier other than the saved one is dropped. If it
   says the tier failed, the tier was one the player had clicked to and that
   died before it was saved: nothing else changes, but it is barred.

   THE TRIAL (R2, R3, R4). A heavy tier is on trial from before it is built
   until it has drawn TIER_TRIAL_FRAMES frames, PACE.warmMs have passed
   since it was built, and it has then kept pace for one window of
   PACE.windowMs (see PACE). It has TIER_TRIAL_MS of screen time to do that
   in, added up over every load it takes, with no single gap counting for
   more than TIER_TRIAL_GAP_MS. A trial that runs out of time is a device
   too slow for the tier: TIER_SAFE, saved, barred. Time in a pause, with
   the page hidden, or while the Graphics button is being clicked through,
   is not screen time and does not count.
   ========================================================================= */
var TIER_TRIAL_FRAMES = 60;
var TIER_TRIAL_MS = 10000;
var TIER_TRIAL_GAP_MS = 4000;
var TIER_GRACE_MS = 5000;
var TIER_TRIAL_KEY = 'mcl64.tierTrial.v1';

/* What the player is told when a load finds a heavy tier gone, by how it
   went. Only a player who picked the tier is told: one who was given it as
   the default never asked for it, and comes up in TIER_SAFE with no word.
   (Devices are lost for reasons that have nothing to do with the tier on
   the screen. Measured in review: headless Chromium lost its context within
   two seconds of starting in 1 start of 3 in Modern, where no heavy tier
   was on to blame. That is why one loss is not the end of a tier.) */
var TIER_FELL = {
  failed: 'ULTRA OFF: IT DID NOT START LAST TIME',
  lost: 'ULTRA OFF: THE GRAPHICS DEVICE WAS LOST',
  died: 'ULTRA OFF: THE PAGE STOPPED LAST TIME'
};

/* --- stepping down when the device cannot keep up ------------------------

   Ultra is 2.5 to 4.8 times the work of a Modern frame, and every figure
   there is for it was measured on one fast machine. So the frames of a
   heavy tier are watched (tierPace), on the title screen and in the attract
   demo as well as in a race.

   THE WARM UP. Nothing is judged until the trial's frames are drawn and
   `warmMs` have passed since the tier was built: the first frames of a tier
   build its shaders and its shadow maps, and say nothing of how it runs.

   THE WINDOWS. After that the frames are taken a window of `windowMs` at a
   time. A window is slow when the mean gap between its frames is over
   `slowMs`, and no gap feeds the mean more than `gapMs`: one hitch is one
   hitch, however long it lasted. One window that is not slow passes the
   trial. Windows slow for `forMs` on end, on trial or long after it, give
   the tier up for TIER_SAFE. A gap longer than a window is a window by
   itself, so a device at four seconds a frame is found out in three frames
   and not in thirty.

   WHY 40 ms. It is 25 frames a second. A phone in Low Power Mode, a laptop
   saving energy and a 30 Hz screen all hold the browser to 30 frames a
   second, which is a gap of 33 ms on a device that may be running the tier
   with time to spare. The limit has to stand clear of that (it was 25 ms
   once, and took the tier from every such device). Held to 30 with one
   frame in seven taking two refreshes, the mean is 38 ms and the tier
   stays; under 25 frames a second no cap explains the gap.

   IT STEPS DOWN ONCE IN A LOAD (`paceDone`). A player who picks the heavy
   tier again has chosen it, and is not argued with a second time in that
   load; the load after it watches again.

   PACE_SAID is for the player who picked the tier, and says why it went. A
   player who never picked it is not told anything alarming: the tier
   changes, and a race that is running flashes the name of the new one. */
var PACE = { slowMs: 40, forMs: 3000, windowMs: 1000, gapMs: 100, warmMs: 2000 };
var PACE_SAID = 'ULTRA TOO SLOW ON THIS DEVICE: NOW MODERN';

/* --- the settings, and where they are kept ------------------------------- */

var SETTINGS_KEY = 'mcl64.settings.v1';

/* WHO STARTS WHERE, AND WHO KEEPS WHAT. 24 Nov 2026, the owner, having played
   the Ultra build on his phone: "seems to work.. well we need to default to
   Ultra Dusk and Monaco as game 1 now". So a player who has never chosen
   gets the Ultra tier, at dusk, at Monaco (monaco-gp-v1), on a phone as on
   a desk, on the title screen and for the first race.

   A player who picked a tier, an hour or a circuit keeps it. What was saved
   before today cannot say which of its values were picked: the whole object
   is written on any save, a change of music volume included, so it holds
   the defaults of its day beside the choices. Hence the `defaults` field,
   which every save from today writes as SETTINGS_DEFAULTS. A saved object
   without it is from before today, and is read like this, once:

     tier      'modern' was the default, on every device, on main and on
               every build since (the comment there said Retro; the code
               said Modern). A saved 'modern' is taken for never chosen and
               becomes Ultra. 'retro' or 'ultra' was picked, and is kept.
     circuit   'silverstone-v1' was the default, on every device. A saved
               Silverstone becomes Monaco; any other circuit is kept.
     hour      there was none on main, and 'midday' was the default on the
               builds that had one. None, or midday, becomes dusk; morning
               or golden was picked, and is kept.

   The object is then saved, with the field, so that this happens once and
   whatever the player picks afterwards is kept, the old defaults included.
   A player who had truly picked Modern, Silverstone or midday is moved with
   the rest, once: nothing saved could tell them apart.

   `tierChosen` says whether the tier is one the player picked on the
   Graphics button. The game's own pick is not: the default, and the tier a
   failed or slow Ultra falls back to. Nobody is told off for a tier they
   never asked for. `tierBarred` says the game has taken a heavy tier away
   on this device and the player has not picked it again since. */
var SETTINGS_DEFAULTS = 2;
var OLD_DEFAULTS = { quality: 'modern', trackId: 'silverstone-v1', timeOfDay: 'midday' };

/* Copies what a saved object `p` holds into the settings `s`, field by
   field. `old` is an object from before the defaults changed. */
function settingsTake(s, p, old) {
  /* validate each field rather than trusting the blob — a stale or hand
     edited entry must not be able to wedge the controls */
  if (typeof p.steerTilt === 'boolean') s.steerTilt = p.steerTilt;
  if (typeof p.tiltInvert === 'boolean') s.tiltInvert = p.tiltInvert;
  if (typeof p.autoThrottle === 'boolean') s.autoThrottle = p.autoThrottle;
  if (typeof p.autoFullscreen === 'boolean') s.autoFullscreen = p.autoFullscreen;
  if (typeof p.userConfigured === 'boolean') s.userConfigured = p.userConfigured;
  /* Anything that is not a tier, or not a time of day, keeps the
     default. So does a value that was the default when an object from
     before today was saved; any other value in such an object was
     picked. */
  if (typeof p.quality === 'string' && TIERS.hasOwnProperty(p.quality) && !(old && p.quality === OLD_DEFAULTS.quality)) {
    s.quality = p.quality;
    s.tierChosen = old || p.tierChosen === true;
  }
  if (p.tierBarred === true) s.tierBarred = true;
  if (TIME_OF_DAY_NAMES.indexOf(p.timeOfDay) >= 0 && !(old && p.timeOfDay === OLD_DEFAULTS.timeOfDay)) s.timeOfDay = p.timeOfDay;
  /* Validated against the registry: a stale or hand-edited id must fall
     back to a real circuit rather than crashing the boot. */
  if (typeof p.trackId === 'string' && trackById(p.trackId).id === p.trackId && !(old && p.trackId === OLD_DEFAULTS.trackId)) {
    s.trackId = p.trackId;
  }
  /* tiltSens is the old field name — read it so anyone who already set a
     value keeps it instead of being silently reset to 6 */
  var sv = (typeof p.steerSens === 'number') ? p.steerSens : p.tiltSens;
  if (typeof sv === 'number' && isFinite(sv)) s.steerSens = clamp(Math.round(sv), 1, 10);
  /* 0 is a legitimate value here — silent — so these check isFinite
     rather than truthiness, or muting a bus would never persist. */
  if (typeof p.camMode === 'number' && CAM_LABELS[p.camMode]) s.camMode = p.camMode | 0;
  if (typeof p.musicOn === 'boolean') s.musicOn = p.musicOn;
  if (typeof p.engineOn === 'boolean') s.engineOn = p.engineOn;
  if (typeof p.engineVol === 'number' && isFinite(p.engineVol)) s.engineVol = clamp(Math.round(p.engineVol), 0, 10);
  if (typeof p.musicVol === 'number' && isFinite(p.musicVol)) s.musicVol = clamp(Math.round(p.musicVol), 0, 10);
}

/* Writes the settings. `store` is storage as get(key) and set(key, value):
   a value of null takes the key away, and set answers whether the write
   went through. */
function settingsWrite(store, s) {
  s.defaults = SETTINGS_DEFAULTS;
  return store.set(SETTINGS_KEY, JSON.stringify(s));
}

/* WHAT A LOAD DOES, given what storage holds. `s` comes in as the defaults
   and goes out as the settings of this load. `env.hidden` is whether the
   page is out of view as it loads. Answers what tierLoad answers. The key
   is written before the settings, and both before the world is built. */
function settingsLoad(store, s, env) {
  /* `first`: nothing was saved, or what was saved is from before the
     defaults changed and is moved, this once */
  var first = true;
  try {
    var raw = store.get(SETTINGS_KEY);
    if (raw) {
      var p = JSON.parse(raw);
      first = p.defaults !== SETTINGS_DEFAULTS;
      settingsTake(s, p, first);
    }
  } catch (e) { /* blocked storage or corrupt JSON — defaults are fine */ }
  var t = tierLoad(s, store.get(TIER_TRIAL_KEY), { hidden: env.hidden });
  store.set(TIER_TRIAL_KEY, t.key);
  if (first || t.save) settingsWrite(store, s);
  return t;
}

/* --- the key, as text ---------------------------------------------------- */

/* Reads the key. Null for no key, a tier that is not heavy, or a word this
   build does not write. A key with no word after the tier is a trial. */
function tierKeyParse(text) {
  if (typeof text !== 'string' || !text) return null;
  var p = text.split(' ');
  if (!TIERS.hasOwnProperty(p[0]) || !TIERS[p[0]].heavy) return null;
  var word = p.length > 1 ? p[1] : 'trying';
  if (['trying', 'untried', 'running', 'lost', 'again'].indexOf(word) < 0) return null;
  var ms = word === 'untried' ? parseInt(p[2], 10) : 0;
  return {
    tier: p[0], word: word, ms: ms > 0 ? ms : 0,
    twice: p.indexOf('twice') > 1, chosen: p.indexOf('chosen') > 1
  };
}
function tierHeavyOn(g) { return !!g.tierOn && TIERS[g.tierOn].heavy; }
function tierUntried(tier, ms, again) { return tier + ' untried ' + Math.round(ms) + (again ? ' twice' : ''); }
function tierRunning(g) { return g.tierOn + ' running' + (g.tierAgain ? ' twice' : ''); }

/* --- what a page knows, and what each event does to it -------------------

   The fields a page keeps for all of this. Game copies them on to itself,
   and every function below is handed the Game (or, in the test, a plain
   object with the same fields and a `settings`). Each answers null for
   nothing to do, or what is to be done:

     key    what TIER_TRIAL_KEY is to hold now (null takes it away; left
            out, the key stands)
     build  the tier in settings.quality is to be put on the screen
     save   the settings are to be saved
     say    'slow': tell the player the tier was too slow (PACE_SAID);
            'quiet': only flash the new tier's name */
function tierFresh() {
  return {
    /* the tier on the screen (applyQuality) */
    tierOn: null,
    /* whether that tier is on trial, the frames of the trial still to
       draw, and the screen time the trial has used, in milliseconds */
    trialOn: false, trialLeft: 0, trialMs: 0,
    /* whether this load is the tier's second chance (R5) */
    tierAgain: false,
    /* whether the page is out of view: hidden, left, or being reloaded */
    tierAway: false,
    /* whether the graphics device has gone, and whether an error nobody
       caught has been seen on this page */
    tierGone: false, tierBroke: false,
    /* whether the game has taken a heavy tier away on this device, and
       why a tier the player picked was given up at load (a name in
       TIER_FELL) */
    tierBarred: false, tierFell: null,
    /* the guard (see PACE): the tier it last saw, what is left of the
       warm up, the window being filled (its length, what it feeds the
       mean, its frames), how long the windows have been slow, and whether
       this load has already stepped down once */
    paceTier: null, paceWarm: 0, paceWin: 0, paceFed: 0, paceFrames: 0, paceSlow: 0, paceDone: false
  };
}

/* THE LOAD. `s` holds what was saved (or the defaults) and is changed to
   what this load runs; nothing is on the screen yet. Answers the fields of
   tierFresh that differ, with `key` and `save`. */
function tierLoad(s, key, env) {
  var t = {
    trialOn: false, trialLeft: 0, trialMs: 0, tierAgain: false, tierAway: false,
    tierBarred: s.tierBarred === true, tierFell: null, key: null, save: false
  };
  var k = tierKeyParse(key);
  var mine = !!k && k.tier === s.quality;
  if (k && k.word === 'again') {
    /* THE SECOND CHANCE: the tier is put back, as the player's own or the
       game's as it was. Storage may still hold the tier, or TIER_SAFE as
       the game's pick, which is what a setting saved in the load between
       leaves there. A player who picked a tier in that load has no such
       key (tierPick wrote over it), or has `tierChosen` set. */
    if (mine || (s.quality === TIER_SAFE && !s.tierChosen)) {
      s.quality = k.tier;
      s.tierChosen = k.chosen;
      t.tierAgain = true;
      t.save = true;
    }
  } else if (mine && k.word === 'untried') {
    t.trialMs = k.ms;
    t.tierAgain = k.twice;
  } else if (mine && (k.word === 'lost' || k.word === 'running') && !k.twice) {
    /* A FIRST LOSS: this load is in TIER_SAFE, and nothing is saved */
    if (s.tierChosen) t.tierFell = k.word === 'lost' ? 'lost' : 'died';
    t.key = k.tier + ' again' + (s.tierChosen ? ' chosen' : '');
    s.quality = TIER_SAFE;
    s.tierChosen = false;
    t.tierBarred = true;
  } else if (mine) {
    /* IT DID NOT START, OR WAS LOST TWICE RUNNING: off, and saved as off */
    if (s.tierChosen) t.tierFell = k.word === 'lost' ? 'lost' : (k.word === 'running' ? 'died' : 'failed');
    s.quality = TIER_SAFE;
    s.tierChosen = false;
    s.tierBarred = t.tierBarred = true;
    t.save = true;
  } else if (k && k.word !== 'untried') {
    /* a tier the player clicked to, that died before it was saved */
    s.tierBarred = t.tierBarred = true;
    t.save = true;
  }
  if (TIERS[s.quality].heavy) {
    /* R4: on trial, whoever picked it. A page that loads out of view is
       not trying the tier yet, and says so (R3). */
    t.trialOn = true;
    t.trialLeft = TIER_TRIAL_FRAMES;
    t.tierAway = !!env.hidden;
    t.key = t.tierAway ? tierUntried(s.quality, t.trialMs, t.tierAgain) : s.quality;
  }
  return t;
}

/* THE TRIAL IS PASSED: the tier is trusted, and from here the key says it
   is running on a page in view (R4). */
function tierPassed(g) {
  g.trialOn = false;
  g.trialLeft = 0;
  g.trialMs = 0;
  return { key: tierRunning(g) };
}

/* THE DEVICE IS TOO SLOW FOR THE TIER (R2): TIER_SAFE, saved as the game's
   pick and not the player's, and barred. */
function tierSlow(g) {
  var chosen = g.settings.tierChosen;
  g.paceDone = true;
  g.trialOn = false;
  g.trialLeft = 0;
  g.trialMs = 0;
  g.tierAgain = false;
  g.settings.quality = TIER_SAFE;
  g.settings.tierChosen = false;
  g.settings.tierBarred = g.tierBarred = true;
  return { key: null, build: true, save: true, say: chosen ? 'slow' : 'quiet' };
}

/* A FRAME WAS DRAWN. Counts the frames of the trial. With the guard held
   for the load (`paceDone`) there is no pace to wait for, and the frames
   alone pass the trial. */
function tierFrame(g) {
  if (!g.trialOn || g.tierAway || g.tierGone) return null;
  if (g.trialLeft > 0) g.trialLeft--;
  return g.trialLeft === 0 && g.paceDone ? tierPassed(g) : null;
}

/* THE GUARD: the gap since the frame before, in milliseconds, from the
   frame loop (see PACE and THE TRIAL). `held` is a pause, a hidden page or
   a tier clicked to and not yet built: the window starts again, and the
   time is not screen time. */
function tierPace(g, gapMs, held) {
  var heavy = tierHeavyOn(g);
  if (g.paceTier !== g.tierOn) {
    g.paceTier = g.tierOn;
    g.paceWarm = heavy ? PACE.warmMs : 0;
  }
  if (held || g.paceDone || g.tierAway || g.tierGone || !heavy) {
    g.paceWin = g.paceFed = g.paceFrames = g.paceSlow = 0;
    return null;
  }
  if (!(gapMs > 0)) return null;
  if (g.trialOn) g.trialMs += Math.min(gapMs, TIER_TRIAL_GAP_MS);
  if (g.trialLeft > 0 || g.paceWarm > 0) {
    g.paceWarm -= gapMs;
  } else {
    g.paceWin += gapMs;
    g.paceFed += Math.min(gapMs, PACE.gapMs);
    g.paceFrames++;
    if (g.paceWin >= PACE.windowMs) {
      var mean = g.paceFed / g.paceFrames;
      g.paceWin = g.paceFed = g.paceFrames = 0;
      if (mean <= PACE.slowMs) {
        g.paceSlow = 0;
        if (g.trialOn) return tierPassed(g);
      } else {
        g.paceSlow += PACE.windowMs;
        if (g.paceSlow >= PACE.forMs) return tierSlow(g);
      }
    }
  }
  return g.trialOn && g.trialMs >= TIER_TRIAL_MS ? tierSlow(g) : null;
}

/* THE PAGE GOES OUT OF VIEW: hidden, left (pagehide), or about to be
   reloaded by the game. That is not a failure (R3). A tier on trial is
   marked untried, with the time its trial has used, and a tier that is
   trusted takes its mark away, so a tab thrown away in the background
   leaves nothing behind (R4).

   Only a page on which nothing went wrong may say a trial is untried. One
   that had an error nobody caught leaves the mark of a page that stopped:
   something did fail there, and the tier may be why, so it is a loss, with
   a second chance after it like any other (R5). A render that throws on
   every frame is turned off by the second such load; one stray error on a
   device that runs the tier well costs it one load. And a page whose
   device has gone has said what it has to say (tierDeviceLost). */
function tierOut(g) {
  if (g.tierAway) return null;
  g.tierAway = true;
  if (g.tierGone || !tierHeavyOn(g)) return null;
  if (!g.trialOn) return { key: null };
  return { key: g.tierBroke ? tierRunning(g) : tierUntried(g.tierOn, g.trialMs, g.tierAgain) };
}

/* THE PAGE IS IN VIEW AGAIN (visibilitychange, or pageshow for a page the
   browser kept). The key says once more what the tier is doing. */
function tierBack(g) {
  if (!g.tierAway) return null;
  g.tierAway = false;
  if (g.tierGone || !tierHeavyOn(g)) return null;
  return { key: g.trialOn ? g.tierOn : tierRunning(g) };
}

/* THE GRAPHICS DEVICE HAS GONE. `hidden` is whether the page is out of
   view, `sinceMs` how long ago it last came back into view (Infinity for a
   page that never left). A device taken from a page in the background, or
   found gone as the page comes back, says nothing about the tier (R3): the
   key is left as a page out of view leaves it. On a page in view it is a
   loss, the first or the second running (R5). */
function tierDeviceLost(g, hidden, sinceMs) {
  g.tierGone = true;
  if (!tierHeavyOn(g)) return null;
  if (hidden || g.tierAway || sinceMs < TIER_GRACE_MS) {
    return { key: g.trialOn ? tierUntried(g.tierOn, g.trialMs, g.tierAgain) : null };
  }
  return { key: g.tierOn + ' lost' + (g.tierAgain ? ' twice' : '') };
}

/* THE PLAYER HAS PICKED THE TIER IN settings.quality (the clicks on the
   Graphics button have stopped). A heavy tier goes on trial before it is
   built: the key is in storage first, so a build that takes the tab down
   with it leaves the key behind. The pick is the player's own from here
   on, a heavy tier picked is no longer barred, and whatever second chance
   was owed is forgotten: the key is written over. */
function tierPick(g) {
  var name = g.settings.quality, heavy = TIERS[name].heavy;
  var o = { save: true };
  if (name !== g.tierOn) {
    g.trialOn = heavy;
    g.trialLeft = heavy ? TIER_TRIAL_FRAMES : 0;
    g.trialMs = 0;
    g.tierAgain = false;
    /* (a click whose wait ran out after the page was hidden is not in
       view, and its key says so) */
    o.key = !heavy ? null : (g.tierAway ? tierUntried(name, 0, false) : name);
    o.build = true;
  }
  g.settings.tierChosen = true;
  if (heavy) g.settings.tierBarred = g.tierBarred = false;
  return o;
}

/* The tiers the Graphics button steps through, in order, and the one after
   the tier the button shows now. */
function tierTaps(g) {
  return TIER_ORDER.slice();
}
function tierTap(g) {
  var names = tierTaps(g);
  return names[(names.indexOf(g.settings.quality) + 1) % names.length];
}
