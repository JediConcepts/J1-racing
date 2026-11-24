/* =========================================================================
   MCL-64  —  renderer, HUD, race director, input, main loop
   ========================================================================= */

/* Fallback only. The live figure is this.track.laps — a circuit sets its own
   distance, so a 4 km oval is not forced to the same lap count as a 5.5 km
   road course. Read it via this.laps(). */
var TOTAL_LAPS = 3;
var GRID_SIZE = 6;
var STEP = 1 / 60;

var STATE = { TITLE: 0, COUNTDOWN: 1, RACING: 2, FINISHED: 3 };

/* --- the picture tiers --------------------------------------------------- */

/* ONE TABLE for everything that differs between the tiers. applyQuality and
   resize read it, and nothing else asks which tier is on. The order of the
   keys is the order the settings button cycles through.

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
                  Such a tier is not trusted until it has drawn (see
                  chooseTier and loadSettings), and is given up for
                  TIER_SAFE if the frames come too slowly (see watchPace).

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

/* --- a tier is not trusted until it has drawn ---------------------------- */

/* How long the Graphics button waits after the last click before the tier it
   shows is built, in milliseconds. The button steps through the tiers in one
   direction, so the way from Modern to Retro passes Ultra, and Ultra takes
   seconds to build the first time. With the wait, two quick clicks pass it
   without building it. */
var TIER_SETTLE_MS = 400;

/* The tier a failed heavy tier falls back to, and how many frames a heavy
   tier has to draw before it is trusted. */
var TIER_SAFE = 'modern';
var TIER_TRIAL_FRAMES = 60;

/* THE TRIAL KEY. A heavy tier is built on the player's say so and saved, and
   a device that cannot hold it may lose its graphics device, or the whole
   tab, in the frames that follow. The saved tier would then be built again
   on every load, with no way back short of clearing the site's storage. So
   the tier's name is written here before it is built and taken away once it
   has drawn TIER_TRIAL_FRAMES frames; a load that finds it knows the tier
   never got that far (see loadSettings). What the key holds:

     'ultra'           being tried now. Found at load: it did not start.
     'ultra lost'      the graphics device was lost while it was on.
     'ultra untried'   the game reloaded the page itself (a change of
                       circuit) before the trial was over. Found at load: no
                       failure, the trial starts again from the first frame.

   Storage that is blocked reads as no key and writes nothing, which is the
   game as it was before there was a trial. */
var TIER_TRIAL_KEY = 'mcl64.tierTrial.v1';
function tierTrialRead() {
  try { return window.localStorage ? localStorage.getItem(TIER_TRIAL_KEY) : null; } catch (e) { return null; }
}
function tierTrialWrite(value) {
  try {
    if (value == null) localStorage.removeItem(TIER_TRIAL_KEY);
    else localStorage.setItem(TIER_TRIAL_KEY, value);
  } catch (e) {}
}

/* What the player is told when a load finds the key, by how it was left.
   Only a player who picked the tier is told: one who was given it as the
   default never asked for it, and comes up in TIER_SAFE with no word. */
var TIER_FELL = {
  failed: 'ULTRA OFF: IT DID NOT START LAST TIME',
  lost: 'ULTRA OFF: THE GRAPHICS DEVICE WAS LOST'
};

/* --- stepping down when the device cannot keep up ------------------------ */

/* Ultra is 2.5 to 4.8 times the work of a Modern frame, and every figure
   there is for it was measured on one fast machine. So the frames of a
   heavy tier are watched from the first one drawn (Game.watchPace), on the
   title screen and in the attract demo as well as in a race: Ultra is the
   tier a new player is given, so a device that cannot hold it has to be
   found out before the player has done anything. The gap between frames is
   kept as a running mean over about `meanMs`; when the mean has stood over
   `slowMs` for `forMs`, the tier is given up for TIER_SAFE.

   WHY 40 ms. It is 25 frames a second. A phone in Low Power Mode, a laptop
   saving energy and a 30 Hz screen all hold the browser to 30 frames a
   second, which is a gap of 33 ms on a device that may be running the tier
   with time to spare: a healthy device with a cap on it, and Modern would
   run at the same 30 there. The limit has to stand clear of that, or such
   a device has the tier taken away on every load for nothing (the limit
   was 25 ms once, and did exactly that). Under 25 frames a second no cap
   explains the gap, and the device is a slow one.

   A gap over `ignoreMs` that stands alone is not a slow frame, it is a
   change of tab or of tier, and is left out altogether: the first
   `ignoreRun` of them in a row are. A device that takes that long over
   every frame is the slowest there is, and the one the guard is most for,
   so from the next long gap in the row each counts, as `ignoreMs` and no
   more.

   PACE_SAID is for the player who picked the tier, and says why it went. A
   player who never picked it is not told anything alarming: the tier
   changes, and a race that is running flashes the name of the new one. */
var PACE = { slowMs: 40, forMs: 3000, ignoreMs: 250, ignoreRun: 3, meanMs: 500 };
var PACE_SAID = 'ULTRA TOO SLOW ON THIS DEVICE: NOW MODERN';

/* The names settings.timeOfDay may hold, in the order the settings button
   cycles through them. Only the names live here: what each one looks like
   belongs to the sky. */
var TIME_OF_DAY_NAMES = ['morning', 'midday', 'golden', 'dusk'];

/* --- the full post pass: bloom and a grade for each time of day ---------- */

/* Bloom is for what is truly bright: the sun's disc, a glint on paint, a lit
   start light. It is taken from the scene BEFORE the tone map, so the
   threshold is a figure in scene referred light and not a grey level on the
   screen.

   THE THRESHOLD IS MEASURED, NOT CHOSEN. Read back from the render target at
   Silverstone at midday, with the lights buildWorld makes: sunlit asphalt is
   about 0.3 to 0.5, the sky 0.5 to 1.0, and white paint in the sun (the track
   limit lines, the white of a kerb) 2.4 to 2.8, because the sun, the sky
   light and the ambient light add up to about 2.8 on a white surface. A
   glint on a car reaches 15 to 18. At 1.0 every white line on the circuit
   glowed. So the threshold stands just above sunlit white paint. If the
   lights are made brighter, this figure has to follow them.

   MEASURED AGAIN UNDER THE PHYSICAL SKY, which sets its own lights for each
   hour (TIME_OF_DAY in 32-sky.js). The same read of the render target, from
   the chase, driver's eye and high cameras: white paint in the sun is 2.0 to
   2.5 in the morning and at golden hour, 2.5 to 3.0 at midday, and under 2.5
   at dusk. So 3.0 still stands just above it at all four hours and does not
   have to follow the clock. One thing in the sky does pass it: at dusk the
   few degrees of sky round the sun reach 4 to 7 in the red channel. That is
   the sun's own aureole, and it is left to glow.

   `cap` is the most any one pixel may give the bloom, in the same units,
   counted from the threshold up (see bloomHighPass). It was 4.0 while the
   bloom stood alone. With a low sun the bar that carries a mirror takes a
   long white highlight seen from the driver's eye, and at 4.0 its glow drew
   the eye from the road; 2.5 leaves the highlight and takes back the haze
   round it.

   `sun` and `sunGive` are for the one true source of light in the frame.
   The sky draws the sun's disc far brighter than anything else (SUN_DISC in
   32-sky.js, 2000, where the strongest glint measured is under 100), and a
   pixel over `sun` is taken to be that disc. It gives the bloom `sunGive`
   on top of the cap, because the disc is a dozen pixels across and under
   the cap its glow could not be seen: with it the disc has a white core and
   a glow in its own colour, wide enough to spill over a tree in front. A
   mirror that ever throws back more than `sun` would flare the same way. */
var BLOOM = { strength: 0.35, radius: 0.6, threshold: 3.0, cap: 2.5, sun: 500.0, sunGive: 400.0 };

/* How much brighter than its plain colour a lit start light is drawn while
   the full post pass is on. A lamp is a source of light and the brightest
   thing on the start line; as plain red it is no brighter than a painted
   kerb and far under the threshold. Only setLights reads it. */
var START_LIGHT_GLOW = 6.0;

/* What the bloom takes from the scene. `o` is what BloomNode hands its
   highPassFn. The engine's own filter is not used, for two reasons, both
   seen in the stills.

   It measures luminance, in which red counts for a fifth: a pure red lamp
   would have to be five times as bright as white paint to pass. This one
   measures the strongest of the three channels, so a lamp of any colour
   passes when it is bright.

   And it passes the WHOLE of a pixel once the pixel is over the threshold,
   so a surface a little over it glows as hard as a lamp. From the driver's
   eye the highlight along the orange cockpit rim, a few thousand pixels at 4
   to 18, laid an orange haze over half the car. This one passes only what a
   pixel has ABOVE the threshold, in its own colour, and no more than
   BLOOM.cap of that: the glow grows from nothing as a surface brightens, and
   a wide highlight cannot outshine the frame. The sun's disc alone is given
   more (BLOOM.sun, BLOOM.sunGive). */
function bloomHighPass(o) {
  var c = o.input.rgb;
  var v = c.r.max(c.g).max(c.b);
  var over = THREE.TSL.clamp(v.sub(o.threshold), 0.0, BLOOM.cap);
  over = over.add(THREE.TSL.clamp(v.sub(BLOOM.sun), 0.0, 1.0).mul(BLOOM.sunGive));
  return THREE.TSL.vec4(c.mul(over.div(v.max(0.0001))), 1.0);
}

/* The grade for each time of day, one row for each name in TIME_OF_DAY_NAMES.

     gain        red, green, blue. Multiplies the scene's light before the
                 tone map, as a filter on the lens would, so a strong gain
                 rolls off into white through the tone curve and never clips.
     lift        red, green, blue. Added to the dark end of the finished
                 picture and fading to nothing at white: the colour of the
                 shadows.
     saturation  1 leaves the colour alone.

   Midday is neutral: with it, the full pass differs from Modern's by the
   bloom alone.

   THE GRADE IS A FINISH, NOT THE HOUR. The physical sky changes the colour
   and strength of the sun, the sky light and the fog for each hour, and that
   is the main effect. These rows were first set with the dome's one white
   light, where the grade had to do all of it; laid over the sky's own light
   they tinted twice (golden hour went brown, dusk went dark and blue). So
   each row was pulled most of the way back to neutral: golden's gain was
   1.14, 0.98, 0.78 and dusk's 0.74, 0.78, 0.94. */
var GRADES = {
  morning: { gain: [0.98, 1.00, 1.03], lift: [0.000, 0.003, 0.008], saturation: 0.96 },
  midday:  { gain: [1.00, 1.00, 1.00], lift: [0.000, 0.000, 0.000], saturation: 1.00 },
  golden:  { gain: [1.08, 1.00, 0.87], lift: [0.006, 0.002, 0.000], saturation: 1.05 },
  dusk:    { gain: [0.94, 0.95, 1.02], lift: [0.000, 0.003, 0.012], saturation: 0.96 }
};

/* --- post-process: RGBA5551 quantise + ordered dither ------------------- */

/* The pass is a node, not GLSL: WebGPURenderer draws node materials on both
   of its backends and does not draw a ShaderMaterial at all. It is the r128
   fragment shader function for function (the same Bayer arithmetic, the same
   1/52 dither, the same 31 level quantise, the same grade and vignette), with
   one stage added in front.

   THE ADDED STAGE. On r128 the scene arrived in the render target already
   tone mapped and sRGB encoded, in 8 bits, and the pass only had to read it.
   This renderer tone maps and encodes only when it draws to the canvas, so
   the target holds linear light that has not been tone mapped. The pass
   therefore does both itself before the old maths runs: tone mapping for
   Modern (Retro never had any), then the sRGB encode, then a round to 8 bits
   as the old target stored it. The encode is written out by hand, with r128's
   own formula, because the engine's colour space node does nothing once
   colour management is switched off, which is how this game runs.

   One node is built for each tier and not one node switched by a uniform:
   the tier is known when the target is made (see buildTarget), and a Retro
   frame then never pays for a tone map it throws away.

   `frame` is the render target's texture, `uRes` its size in pixels and
   `uFade` the fade from black.

   THE FULL PASS (Ultra) is Modern's with three things added, and `full` holds
   them: { bloom, uGain, uLift, uSat }. It is null for Retro and Modern, and
   every line it adds is behind a test of it made here, in JavaScript, when
   the node is built, so the other two tiers get the node they always had.

     bloom   added to the scene's light before the tone map. The bloom node
             draws its own small targets from `frame` just before this pass
             is drawn.
     uGain   the time of day's gain, on the scene's light, before the tone map
     uLift   the time of day's lift and saturation, on the finished picture,
     uSat    after Modern's own grade

   The full pass also leaves out the round to 8 bits. That round is there to
   hand the old maths what an 8 bit target used to hold; Ultra has no old
   picture to match, and a grade laid over values already rounded shows as
   bands in a smooth sky. */
function buildPostNode(frame, uRes, uFade, retro, full) {
  var T = THREE.TSL;

  /* recursive 4x4 Bayer, built arithmetically, as the GLSL had it:
       float b2(vec2 p){ return mod(2.0*p.y + 3.0*p.x, 4.0); }
       float bayer4(vec2 q){ hi = floor(mod(q,4.0)*0.5); lo = mod(q,2.0);
                             return (4.0*b2(hi) + b2(lo)) / 16.0; } */
  function b2(p) { return p.y.mul(2.0).add(p.x.mul(3.0)).mod(4.0); }
  function bayer4(q) {
    var hi = q.mod(4.0).mul(0.5).floor();
    var lo = q.mod(2.0);
    return b2(hi).mul(4.0).add(b2(lo)).div(16.0);
  }

  return T.Fn(function () {
    var vUv = T.uv();
    var c = T.texture(frame, vUv).rgb;

    if (full) c = c.add(T.vec4(full.bloom).rgb).mul(full.uGain);

    /* Modern: ACES, with the exposure read from renderer.toneMappingExposure.
       The colour space argument is the working space, so renderOutput tone
       maps and converts nothing. */
    if (!retro) {
      c = T.renderOutput(T.vec4(c, 1.0), THREE.ACESFilmicToneMapping, THREE.LinearSRGBColorSpace).rgb;
    }
    c = T.clamp(c, 0.0, 1.0);

    /* linear to sRGB, as r128's LinearTosRGB, then what an 8 bit target kept */
    var curve = c.pow(T.vec3(0.41666)).mul(1.055).sub(0.055);
    var toe = c.mul(12.92);
    c = T.mix(curve, toe, c.lessThanEqual(T.vec3(0.0031308)));
    if (!full) c = c.mul(255.0).add(0.5).floor().div(255.0);

    if (retro) {
      /* the console path: dither into a palette of 5 bits for each channel.
         uv() on a full screen pass has its origin at the TOP on this renderer,
         on both backends, where the old vUv had it at the bottom, so y is
         turned over before it indexes the matrix. Left as it comes, the
         pattern would be upside down and nearly every pixel a palette step
         out. */
      var px = T.vec2(vUv.x, vUv.y.oneMinus()).mul(uRes).floor();
      var d = bayer4(px).sub(0.5);
      c = c.add(d.mul(1.0 / 52.0));
      c = c.mul(31.0).add(0.5).floor().div(31.0);
    } else {
      /* modern: the frame is tone mapped by now, so this is only a gentle
         grade: a little saturation and contrast, no quantise and no dither. */
      var l = T.dot(c, T.vec3(0.2126, 0.7152, 0.0722));
      c = T.mix(T.vec3(l), c, 1.16);
      c = T.clamp(c.sub(0.5).mul(1.07).add(0.5), 0.0, 1.0);
      if (full) {
        c = c.add(full.uLift.mul(c.oneMinus()));
        var lg = T.dot(c, T.vec3(0.2126, 0.7152, 0.0722));
        c = T.clamp(T.mix(T.vec3(lg), c, full.uSat), 0.0, 1.0);
      }
    }

    var q = vUv.sub(0.5).mul(2.0);
    var vig = T.float(1.0).sub(T.dot(q, q).mul(retro ? 0.13 : 0.06));
    return T.vec4(c.mul(vig).mul(uFade), 1.0);
  })();
}

/* --- the game ----------------------------------------------------------- */

function Game(host, renderer) {
  this.host = host;
  this.state = STATE.TITLE;
  this.time = 0;
  this.raceTime = 0;
  this.countdown = 0;
  this.lights = 0;
  this.camMode = 0;
  this.headYaw = 0;        /* damped look-into-the-corner offset, onboard only */
  this.camPitch = 0;       /* low-passed attitude for the onboard mounts */
  this.camRoll = 0;
  this.paused = false;
  this.shake = 0;
  this.finishHold = 0;
  this.splitShow = 0;
  this.splitText = '';
  this.splitGood = false;
  this.message = '';
  this.messageT = 0;
  /* a line for the player that is not part of the race (see notify) */
  this.notice = '';
  this.noticeT = 0;
  /* the tier that is on the screen (applyQuality), the timer of a tier that
     has been clicked to and not yet built, the frames a heavy tier still has
     to draw before it is trusted, and why a tier the player picked was given
     up at load (see chooseTier and loadSettings) */
  this.tierOn = null;
  this.tierTimer = null;
  this.trialLeft = 0;
  this.tierFell = null;
  /* the running mean of the frame gap in a heavy tier, how long it has
     stood over the limit, both in milliseconds, how many gaps too long to
     be a frame have come in a row, and whether this load has already
     stepped down once (see watchPace) */
  this.paceMean = 0;
  this.paceSlow = 0;
  this.paceLong = 0;
  this.paceDone = false;
  /* OFF to start. The halo is the one part of the car that sits between the
     camera and the driver, and the onboard mounts are framed through it — so
     the first thing anyone sees is the shot without a bar across it, and H
     puts it back.

     Explicit rather than left undefined either way: !undefined is true, so an
     absent value would both start the halo on AND make the first press flash
     HALO: ON while it was already showing. buildGrid calls applyHalo, so cars
     are built hidden rather than shown and then corrected — no first frame
     with a halo that immediately vanishes. */
  this.haloVisible = false;
  this.reducedMotion = false;

  try {
    this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { this.reducedMotion = false; }

  this.audio = new EngineAudio();
  this.input = {
    steer: 0, throttle: 0, brake: 0, handbrake: 0, drs: false,
    keyL: false, keyR: false, keyU: false, keyD: false, keyB: false, keyDrs: false
  };
  this.stick = null;                 /* on-screen analog thumbstick */
  this.tilt = new TiltSensor();      /* accelerometer steering */
  this.settings = this.loadSettings();
  this.camMode = this.settings.camMode;
  this.settingsResume = false;

  this.buildRenderer(renderer);
  this.buildWorld();
  this.buildGrid();
  this.bindInput();
  this.resize();
  this.resetRace(true);
  if (this.tierFell) this.notify(TIER_FELL[this.tierFell] || TIER_FELL.failed);
}

/* The renderer, with the arguments main has always passed. WebGPURenderer
   picks its WebGL 2 backend by itself where the browser has no WebGPU;
   `forceWebGL` asks for that backend outright (the address switch in boot).
   Nothing here touches the GPU: that happens in init(), which returns a
   promise, so boot waits for it before it makes the Game.

   `antialias: true` no longer buys what it did. On r128 it gave the canvas
   four samples, which the one full screen triangle drawn to it never used.
   This renderer gives a full screen pass no samples on either backend, as
   long as the fallback's context is made while an output conversion is still
   pending. That is why the tone mapping and output colour space are set in
   buildRenderer, after init(), and not here: set before init(), the fallback
   would make a multisampled canvas again and pay for it on every frame. */
function makeRenderer(forceWebGL) {
  return new THREE.WebGPURenderer({
    canvas: document.getElementById('gl'), antialias: true, alpha: false,
    powerPreference: 'high-performance', stencil: false,
    forceWebGL: !!forceWebGL
  });
}

/* `renderer` comes from makeRenderer and has finished init(). */
Game.prototype.buildRenderer = function (renderer) {
  this.glCanvas = document.getElementById('gl');
  this.hudCanvas = document.getElementById('hud');
  this.hud = this.hudCanvas.getContext('2d');

  this.renderer = renderer;
  /* The renderer adds no output pass of its own: the post node tone maps and
     encodes (see buildPostNode). With either of these left at its default the
     renderer would draw every frame through a hidden target of its own first. */
  this.renderer.toneMapping = THREE.NoToneMapping;
  this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  this.renderer.setPixelRatio(window.devicePixelRatio || 1);
  /* a first value only: applyHaze sets the clear colour for the tier */
  this.renderer.setClearColor(SKY_HAZE, 1);
  this.renderer.shadowMap.enabled = true;
  /* PCFSoftShadowMap, which r128 drew, is gone from 0.187 (asked for, it
     warns and draws this one). The two filters are not the same: see the
     note on the shadow's radius in ShadowRig (33-shadows.js). */
  this.renderer.shadowMap.type = THREE.PCFShadowMap;

  /* The post pass: one node material on a full screen quad. The uniforms
     outlive the node, which is built again whenever the target is. */
  this.postU = {
    uRes: THREE.TSL.uniform(new THREE.Vector2(320, 240)),
    uFade: THREE.TSL.uniform(1),
    /* the grade of the full pass: see GRADES and drawFrame */
    uGain: THREE.TSL.uniform(new THREE.Vector3(1, 1, 1)),
    uLift: THREE.TSL.uniform(new THREE.Vector3(0, 0, 0)),
    uSat: THREE.TSL.uniform(1)
  };
  this.postMat = new THREE.NodeMaterial();
  this.postMat.depthTest = false;
  this.postMat.depthWrite = false;
  this.postQuad = new THREE.QuadMesh(this.postMat);
  this.bloom = null;
  this.buildTarget(false, false);
};

/* The target the scene is drawn into, and the post node that reads it.

   The scene arrives here LINEAR and not tone mapped (see buildPostNode), so
   the two tiers want different storage:

     Modern  half float. Highlights above 1.0 have to survive until the pass
             tone maps them; in 8 bits they would clip first.
     Retro   8 bits, flagged sRGB, which is what r128 had. The GPU encodes on
             write and decodes on read, so the pass still reads linear values,
             and what it reads has been through the same 8 bit store as
             before. That keeps the dither on the palette steps r128 gave.

   Called with the tier whenever it may have changed. A change makes a new
   target, so the node that samples it is built again too.

   `full` (Ultra) is Modern's target with the bloom fed from it, and with one
   difference in the target itself: it is read with linear filtering. The
   canvas is the size of the target in Ultra, so the post pass reads each
   texel at its centre and gets the same value either way. The bloom's first
   step reads the target at half size, and there linear filtering gives it the
   mean of four texels where nearest would give it one of the four, which
   makes a glint a pixel wide flicker as it moves.

   What the last call built is taken down first: the old target, and the
   bloom node with the eleven small targets and seven materials it owns. */
Game.prototype.buildTarget = function (modern, full) {
  full = !!full;
  if (this.rt && this.rtModern === modern && this.rtFull === full) return;
  if (this.rt) this.rt.dispose();
  if (this.bloom) { this.bloom.dispose(); this.bloom = null; }
  this.rtModern = modern;
  this.rtFull = full;
  var filter = full ? THREE.LinearFilter : THREE.NearestFilter;
  this.rt = new THREE.RenderTarget(this.gw || 320, this.gh || 240, {
    minFilter: filter, magFilter: filter,
    format: THREE.RGBAFormat,
    type: modern ? THREE.HalfFloatType : THREE.UnsignedByteType,
    colorSpace: modern ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace,
    depthBuffer: true, stencilBuffer: false
  });
  var extra = null;
  if (full) {
    this.bloom = THREE.bloom(THREE.TSL.texture(this.rt.texture), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    /* The node draws its targets "before" the pass that uses it, and by
       default at most once for each animation frame the renderer has counted.
       photo draws a frame whenever it is called, which need not be once for
       each of those, and a still must never carry the glow of the frame
       before it. 'render' is the engine's NodeUpdateType.RENDER (the bundle
       does not export the name): once for every draw of the post pass. */
    this.bloom.updateBeforeType = 'render';
    this.bloom.highPassFn = bloomHighPass;
    extra = { bloom: this.bloom, uGain: this.postU.uGain, uLift: this.postU.uLift, uSat: this.postU.uSat };
  }
  this.postMat.fragmentNode = buildPostNode(this.rt.texture, this.postU.uRes, this.postU.uFade, !modern, extra);
  this.postMat.needsUpdate = true;
};

/* The two draws of a frame: the scene into the target, then the post pass
   on to the canvas. The renderer clears the target by itself before the
   first. `fade` is 1 for a full picture and 0 for black. */
Game.prototype.drawFrame = function (fade) {
  this.renderer.setRenderTarget(this.rt);
  this.renderer.render(this.scene, this.camera);
  this.renderer.setRenderTarget(null);
  this.postU.uFade.value = fade;
  if (this.rtFull) {
    /* The grade follows settings.timeOfDay here, on every frame, so nothing
       has to tell the post pass when the time of day is changed. */
    var grade = GRADES[this.settings.timeOfDay] || GRADES.midday;
    this.postU.uGain.value.set(grade.gain[0], grade.gain[1], grade.gain[2]);
    this.postU.uLift.value.set(grade.lift[0], grade.lift[1], grade.lift[2]);
    this.postU.uSat.value = grade.saturation;
  }
  this.postQuad.render(this.renderer);
};

/* The post pass for a tier: TIERS[...].post, 'retro' | 'grade' | 'full'.
   Called by applyQuality. 'retro' is the dither and the palette; 'grade' is
   the tone map and the gentle grade; 'full' is 'grade' with bloom in front
   of the tone map and a grade for the time of day behind it. buildTarget
   takes down what the last mode built. */
Game.prototype.applyPostMode = function (mode) {
  this.buildTarget(mode !== 'retro', mode === 'full');
  /* the lit start lights are brighter under the full pass: see setLights */
  if (this.gantry) this.setLights(this.lightsLit || 0);
};

/* THE SKY RIG, and with it the environment map.

   Everything over the horizon is the rig's (SkyRig in 32-sky.js): the sky
   that is drawn, scene.environment, and what the three lights are set to
   once the sky is the physical one. It is made in the mode the game has
   always drawn, the painted dome and the painted environment, so the scene
   has an environment from here on. The lights have to exist first. */
Game.prototype.buildEnvironment = function (scene) {
  this.skyRig = new SkyRig(scene, this.renderer, this.sun, this.hemi, this.ambient);
};

/* The sky for a tier: TIERS[...].sky, 'dome' | 'physical'. Called by
   applyQuality, straight after applyHaze. 'dome' is the painted dome, the
   lights buildWorld makes and the haze applyHaze has just set. 'physical' is
   the engine's model of a clear sky at settings.timeOfDay, which sets the
   lights for itself and takes the haze over: it writes the fog's colour
   again for every frame it draws (SkyRig.fogToward).

   The circuit's own clouds are flat cards with a painted texture that no
   light reaches, white at any hour. The physical sky has clouds of its own,
   lit by its sun, so the cards are put away while it is up. */
Game.prototype.applySkyMode = function (mode) {
  /* "ahead" for the sun's bearing is the way the cars leave the line */
  var t = this.track, a = t.p[t.startIndex], b = t.p[(t.startIndex + 1) % t.n];
  this.skyRig.setNorth(b.x - a.x, b.z - a.z);
  /* the hour first, so that a rig coming up from the dome draws its
     environment once, for the right hour */
  this.skyRig.setTimeOfDay(this.settings.timeOfDay);
  this.skyRig.setMode(mode);
  /* applyHaze has just written the dome's haze: see SkyRig.takeFog */
  this.skyRig.takeFog();
  if (this.scenery && this.scenery.clouds) this.scenery.clouds.visible = mode !== 'physical';
  this.applyTimeOfDay();
};

/* The sky reads this.settings.timeOfDay here (one of TIME_OF_DAY_NAMES).
   Called by setTimeOfDay whenever the setting changes, and by applySkyMode.
   Under the dome the rig only remembers the name: Retro and Modern have one
   hour. The shadows are told last, because the sun has just moved. */
Game.prototype.applyTimeOfDay = function () {
  this.skyRig.setTimeOfDay(this.settings.timeOfDay);
  if (this.shadowRig) this.shadowRig.update();
};

/* THE HAZE COLOUR, IN THE FORM THIS ENGINE WANTS IT.

   SKY_HAZE is a colour as it should look on the screen. r128 mixed fog in
   AFTER tone mapping and encoding, so a fully fogged surface read as that hex
   in either tier. 0.187 mixes fog in linear light, BEFORE the output step, so
   what is handed over has to be the linear colour that the output step turns
   back into the hex:

     Retro   has no tone mapping, so it is the plain sRGB to linear conversion.
     Modern  the output step is ACES at the tier's exposure and then the
             encode, so the hex is run backwards through both (see
             hazeUnderToneMapping). The plain conversion reads 224,208,183
             there, where r128 read the hex itself, 233,195,154.

   This is exact only where a surface is FULLY fogged. Part way into the haze
   the two engines mix in different spaces (r128 in encoded values, this one
   in linear light), and a dark surface comes out paler than it did. It shows
   most in the far views of Modern. No choice of colour puts that right; where
   the haze starts does most of it (see the note on the 250 in buildWorld).

   The clear colour is the same hex, handed over the same way, so it gets the
   same treatment. The sky dome covers it in every frame the game draws.

   Called by applyQuality, because the answer depends on the tier. */
Game.prototype.applyHaze = function (modern) {
  var c = modern ? hazeUnderToneMapping(SKY_HAZE, this.renderer.toneMappingExposure) : srgb(SKY_HAZE);
  this.scene.fog.color.copy(c);
  this.renderer.setClearColor(c, 1);
};

/* The linear colour that ACES Filmic tone mapping at `exposure`, followed by
   the sRGB encode, turns into `hex`. It is the engine's ACESFilmicToneMapping
   run backwards, step for step:

     forward   c * exposure / 0.6  ->  input matrix  ->  the curve
               (v*(v + 0.0245786) - 0.000090537) / (v*(0.983729*v + 0.4329510) + 0.238081)
               ->  output matrix
     backward  inverse output matrix  ->  the curve solved for v (a quadratic,
               the positive root)  ->  inverse input matrix  ->  * 0.6 / exposure

   The matrices and the curve's constants are the ones in three.js, the same
   in r128 and in 0.187. A Matrix4 holds each 3 x 3 so the engine can invert
   it. Good for any colour the tone mapper can reach without clamping, which
   the haze is. */
function hazeUnderToneMapping(hex, exposure) {
  var acesIn = new THREE.Matrix4().set(
    0.59719, 0.35458, 0.04823, 0,
    0.07600, 0.90834, 0.01566, 0,
    0.02840, 0.13383, 0.83777, 0,
    0, 0, 0, 1);
  var acesOut = new THREE.Matrix4().set(
    1.60475, -0.53108, -0.07367, 0,
    -0.10208, 1.10813, -0.00605, 0,
    -0.00327, -0.07276, 1.07602, 0,
    0, 0, 0, 1);
  function uncurve(y) {
    var a = 1 - 0.983729 * y;
    var b = 0.0245786 - 0.4329510 * y;
    var c = -(0.000090537 + 0.238081 * y);
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }
  var want = srgb(hex);
  var v = new THREE.Vector3(want.r, want.g, want.b).applyMatrix4(acesOut.invert());
  v.set(uncurve(v.x), uncurve(v.y), uncurve(v.z));
  v.applyMatrix4(acesIn.invert()).multiplyScalar(0.6 / exposure);
  return new THREE.Color(v.x, v.y, v.z);
}

/* The shadows for a tier: TIERS[...].shadows, 'blob' | 'single' | 'cascades'.
   Called by applyQuality. 'blob' is the dark disc under each car and no
   shadow map; 'single' is the one map that follows the player; 'cascades' is
   shadows across the whole view. The maps are the rig's (33-shadows.js). The
   blob and a map never run together: both at once darken the road under
   every car twice.

   WHO CASTS AND WHO RECEIVES. The flags written where each mesh is built are
   the ones Modern has always had, and they stand in every mode: the cars and
   the trees cast, the road, kerbs, runoff and grass receive (and Monaco's
   town casts and receives). The single map only reaches 70 m from the
   player, so nothing else was ever worth drawing into it. With shadows
   across the whole view the stands, the gantry and the signs cast as well,
   and the stand faces receive. Those meshes are marked where they are built
   (wideShadow in 20-track.js) and get their flags here, so that leaving the
   mode takes them away again. */
Game.prototype.applyShadowMode = function (mode) {
  var mapped = mode !== 'blob';
  var wide = mode === 'cascades';
  this.renderer.shadowMap.enabled = mapped;
  if (this.shadowRig) this.shadowRig.setMode(mode);
  for (var ci = 0; ci < (this.cars || []).length; ci++) {
    if (this.cars[ci].shadow) this.cars[ci].shadow.visible = !mapped;
  }
  if (this.scene) this.scene.traverse(function (o) {
    var mark = o.userData.wideShadow;
    if (!mark) return;
    o.castShadow = wide && mark.cast;
    o.receiveShadow = wide && mark.receive;
  });
  /* THE GROUND BEYOND THE VERGE. Past the verge there is no ground mesh,
     only one great plane 10 m below the circuit (buildScenery), and the
     trees out there stand at the height of the verge, 10 m above it. Nobody
     can see that they float, because the plane has no detail to judge its
     distance by. But a shadow falls where the sun's ray meets the plane, and
     10 m further down is 6 m further along the ground at the midday sun,
     50 m at golden hour and 130 m at dusk: a low sun put every tree's
     shadow a field away from its trunk. Two things put it back, both only
     with the cascades, because the single map of Modern reaches 70 m from
     the player and its stills must not move.

     The plane is lifted to just under the verge (scenery.groundTop), where
     the trees stand. On a flat circuit that is all it takes.

     And the plane looks its shadow up at the height the trees stand at,
     straight above each of its points (groundShadowPosition), for a circuit
     with hills or banking, where the plane cannot come up to every tree. */
  var sc = this.scenery, ground = sc && sc.ground;
  if (ground) {
    if (ground.userData.lowY === undefined) ground.userData.lowY = ground.position.y;
    ground.position.y = wide && sc.groundTop !== null ? Math.max(sc.groundTop, ground.userData.lowY) : ground.userData.lowY;
    ground.material.receivedShadowPositionNode = wide ? groundShadowPosition(ground, Math.max(sc.treeFeet, ground.position.y)) : null;
    ground.material.needsUpdate = true;
  }
};

/* The point the ground plane looks its shadow up at: its own point, moved
   straight up (or down) to height `y`. See the note on the ground in
   applyShadowMode. On the map the shadow of a tree then starts at its trunk
   at every hour, whatever the height between the tree and the plane. `y` is
   one number for the whole plane, the mean of the trees' feet: exact on a
   flat circuit, the best single number on a hilly one.

   The engine takes the position from material.receivedShadowPositionNode.
   The point is worked out from the plane's uv, because the plane is a
   PlaneGeometry laid flat (rotation.x of minus a quarter turn), so u runs
   along x and v runs against z. */
function groundShadowPosition(ground, y) {
  var T = THREE.TSL;
  var g = ground.geometry.parameters;
  var at = T.uv();
  return T.vec3(
    at.x.sub(0.5).mul(g.width).add(ground.position.x),
    T.float(y),
    T.float(0.5).sub(at.y).mul(g.height).add(ground.position.z));
}

Game.prototype.buildWorld = function () {
  var scene = this.scene = new THREE.Scene();
  /* the colour here is a first value only: applyHaze sets it for the tier.

     WHERE THE HAZE STARTS: 250 m, and it was 150 m on r128. The 250 is a
     compensation for the engine move and nothing else. r128 mixed the haze
     into the finished, encoded picture; this engine mixes it into linear
     light, where the same share of haze reads as far more of it on a dark
     surface. A surface part way into the haze therefore came out paler and
     redder than on the live game, most of all in the far views of Modern.
     Starting the haze 100 m further out takes most of that back off. It
     does not make the picture match the live one: of the three starts
     measured (150, 250 and 300 m) it is the one that leaves the 28 stills
     nearest the live ones on average, and the numbers are in
     docs/v2-picture-log.md. The far limit, 980 m, is unchanged:
     a surface that far away is fully in the haze, as before, and reads as
     the same colour as before (see applyHaze). */
  scene.fog = new THREE.Fog(SKY_HAZE, 250, 980);

  this.camera = new THREE.PerspectiveCamera(64, 4 / 3, 0.6, 3400);
  this.camPos = new THREE.Vector3();
  this.camLook = new THREE.Vector3();

  /* LIGHT INTENSITIES CARRY A FACTOR OF PI. The numbers beside it (1.05, 1.35
     and 0.4) are the ones the look was tuned with on r128, which multiplied
     every light by pi inside its shaders unless physicallyCorrectLights was
     set. 0.187 has no such mode: an intensity is taken as it is given. So the
     factor is written out here, and the tuned numbers stay readable. Without
     it the whole scene is lit at about a third of its strength. */
  var hemi = this.hemi = new THREE.HemisphereLight(0xe6efff, 0x6a6244, 1.05 * Math.PI);
  scene.add(hemi);
  var sun = this.sun = new THREE.DirectionalLight(0xfff2e2, 1.35 * Math.PI);
  sun.position.set(-320, 420, 210);
  scene.add(sun);
  scene.add(sun.target);
  this.ambient = new THREE.AmbientLight(0x4d566a, 0.4 * Math.PI);
  scene.add(this.ambient);

  /* SHADOWS. The rig sets up the map Modern has always had, a tight box
     that follows the car, and holds the wider ones for the tiers that ask
     (see 33-shadows.js). applyShadowMode picks between them. */
  this.shadowRig = new ShadowRig(scene, this.camera, sun);

  this.buildEnvironment(scene);

  this.track = new Track(trackById(this.settings.trackId));
  /* Each circuit brings its own score; absent or unknown falls back to the
     original theme, so a new circuit needs no music work to ship. */
  this.audio.setMusicTheme(this.track.def.music);
  buildTrackMeshes(this.track, scene);
  this.gantry = buildStartGantry(this.track, scene);
  this.scenery = buildScenery(this.track, scene);
  /* what the camera drags along with it: the rig's dome, and its physical sky */
  this.sky = this.skyRig.root;
  /* after everything above is in the scene, so the sweep sees all of it;
     the cars come later and are done one by one in buildGrid */
  this.ownEnvironment(scene);
  /* a second sweep, here for the same reason: every canvas texture in the
     scene is turned into light in the shader, after the GPU has smoothed it
     (see texFromCanvas and decodeCanvasMaps in 10-core.js). The cars carry
     no such texture. */
  decodeCanvasMaps(scene);

  /* minimap path, precomputed once in normalised space */
  var i, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (i = 0; i < this.track.n; i++) {
    var p = this.track.p[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  this.mapBounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
};

/* envMapIntensity, PUT BACK TO WORK.

   On r128 a material's envMapIntensity scaled the light it took from
   scene.environment. In 0.187 that number only scales a material's OWN
   envMap; light from the scene's environment is scaled by
   scene.environmentIntensity and nothing else. So the car paint's 1.15 (see
   buildCarMesh) was read by nobody, and the bodywork came out darker than it
   was tuned to be.

   Every material under `root` that asks for a strength other than 1 (the car
   paint, and the sea at Monaco) is given the scene's environment as its own
   map, which is all it takes for its number to apply again. The renderer
   filters the one texture once, whoever holds it. Materials that leave the
   strength at 1 are not touched: for them the scene's environment already
   does the same thing.

   The scene always has an environment by the time this runs: buildEnvironment
   sets it before anything is swept and nothing takes it away again, so there
   is no check for a missing one. */
Game.prototype.ownEnvironment = function (root) {
  var env = this.scene.environment;
  root.traverse(function (o) {
    if (!o.material) return;
    var m = o.material.length ? o.material : [o.material];
    for (var i = 0; i < m.length; i++) {
      if (m[i] && m[i].isMeshStandardMaterial && m[i].envMapIntensity !== 1 && !m[i].envMap) m[i].envMap = env;
    }
  });
};

/* Field size is per circuit — GRID_SIZE is only the fallback. */
Game.prototype.gridSize = function () {
  return (this.track && this.track.def && this.track.def.grid) || GRID_SIZE;
};

/* Which car sits in each grid slot, front to back.
   order[slot] = car index, and car 0 is the player.

   The six-car circuits keep their original hand-listed order AND their
   player-starts-last rule. Times are already posted against silverstone-v1
   "under race conditions", so moving the player up the order — or even just
   reshuffling which AI lines up where, since their pace varies by index —
   would quietly make old and new times incomparable.

   A circuit that declares its own `grid` gets a generated order instead, and
   may ask for `playerStart: 'mid'`. On a 33-car Indy field, starting last is
   not a bit of fun to drive out of; it is a different race entirely. */
Game.prototype.gridOrder = function (n) {
  var def = (this.track && this.track.def) || {};
  if (!def.grid && n === 6) return [1, 4, 2, 5, 3, 0];
  var slot = def.playerStart === 'mid' ? Math.floor(n / 2) : n - 1;
  var order = [];
  for (var s = 0, car = 1; s < n; s++) order.push(s === slot ? 0 : car++);
  return order;
};

Game.prototype.buildGrid = function () {
  this.cars = [];
  this.ais = [];
  for (var i = 0; i < this.gridSize(); i++) {
    /* Papaya is reserved for the player — see the note on LIVERIES. The AI
       cycles the rest, never index 0, so exactly one orange car takes the
       grid however large the field is. */
    var livery = (i === 0) ? LIVERIES[0]
      : LIVERIES[1 + ((i - 1) % Math.max(1, LIVERIES.length - 1))];
    var v = new Vehicle(this.track, livery, i === 0);
    this.ownEnvironment(v.group);
    this.scene.add(v.group);
    this.scene.add(v.shadow);
    this.cars.push(v);
    if (i > 0) this.ais.push(new AIDriver(v, this.track, 0.940 + (i % 3) * 0.018, 100 + i * 37));
  }
  this.player = this.cars[0];
  this.applyHalo();

  /* Drives the player's car during the attract demo */
  this.demoAI = new AIDriver(this.player, this.track, 0.965, 7);
  this.demoCar = this.player;
  this.demoShot = 0;
  this.demoT = 0;
  this.demoAnchor = new THREE.Vector3();
};

Game.prototype.resetRace = function (toTitle) {
  var t = this.track, n = t.n;
  /* Grid tucked in behind the line: two abreast on a road circuit, three on
     the oval. Generated rather than hand-listed so it scales to any field. */
  var cols = (t.def && t.def.gridCols) || 2;
  var colPitch = cols >= 3 ? 3.4 : 6.2;      /* keeps 2-wide at the old +/-3.1 */
  var order = this.gridOrder(this.cars.length);
  for (var i = 0; i < this.cars.length; i++) {
    var v = this.cars[i];
    var idx;
    if (toTitle) {
      /* attract demo: strung out around the circuit and already at speed */
      idx = (t.startIndex + 40 + i * 47) % n;
      v.placeAt(idx, t.lineOff[idx]);
      v.vFwd = 46;
    } else {
      var slot = order.indexOf(i);
      var row = Math.floor(slot / cols);
      var col = slot % cols;
      idx = (t.startIndex - 5 - row * 3 + n) % n;
      v.placeAt(idx, (col - (cols - 1) / 2) * colPitch);
    }

    v.lapsDone = 0; v.started = false; v.finished = false;
    v.lapStart = 0; v.lastLap = 0; v.bestLap = 0; v.finishTime = 0;
    v.boost = 0; v.drift = 0; v.hitImpulse = 0; v.position = i + 1;
    v.sectorBest = [0, 0, 0]; v.sectorNow = [0, 0, 0]; v.sectorIdx = 0;
    var u = (v.f.s - t.startS + t.length) % t.length;
    v.prevU = u;
    v.progress = -t.length + u;
  }
  /* Rebuild the AI with fixed seeds. AIDriver holds a mulberry32 stream whose
     POSITION advances every frame, so without this a race inherits whatever
     the attract demo left behind — two players racing the "same" field would
     face different opposition, and no server could reproduce either. */
  this.ais = [];
  for (var ai = 1; ai < this.cars.length; ai++) {
    this.ais.push(new AIDriver(this.cars[ai], t, 0.940 + (ai % 3) * 0.018, 100 + ai * 37));
  }
  this.demoAI = new AIDriver(this.player, t, 0.965, 7);

  /* The AI reads this clock, so it has to start from the same place too. */
  this.time = 0;

  this.pendingResult = null;       /* cleared only once it has actually posted */
  this.boardResult = null;
  this.settling = false;
  this.raceTime = 0;
  this.finishHold = 0;
  this.splitShow = 0;
  this.message = '';
  this.messageT = 0;
  this.lights = 0;
  this.countdown = 0;
  this.state = toTitle ? STATE.TITLE : STATE.COUNTDOWN;
  if (toTitle) { this.demoShot = 0; this.demoT = 99; this.demoCar = this.cars[1]; }
  this.setLights(0);
  this.updateCamera(0, true);
};

Game.prototype.setLights = function (count) {
  /* Kept, so applyPostMode can set the same lights again for another tier.
     Under the full post pass a lit lamp is drawn brighter than white paint,
     which is what lets the bloom find it (see START_LIGHT_GLOW); in every
     other mode it is the plain colour, as it has always been. */
  this.lightsLit = count;
  var glow = this.rtFull ? START_LIGHT_GLOW : 1;
  for (var i = 0; i < this.gantry.lights.length; i++) {
    var colour = this.gantry.lights[i].material.color;
    colour.setHex(i < count ? 0xff2b1c : 0x2a1a18);
    if (i < count && glow !== 1) colour.multiplyScalar(glow);
  }
};

/* --- input -------------------------------------------------------------- */

Game.prototype.bindInput = function () {
  var self = this;
  var KEYS = {
    ArrowLeft: 'keyL', KeyA: 'keyL',
    ArrowRight: 'keyR', KeyD: 'keyR',
    ArrowUp: 'keyU', KeyW: 'keyU',
    ArrowDown: 'keyD', KeyS: 'keyD',
    Space: 'keyB',
    ShiftLeft: 'keyDrs', ShiftRight: 'keyDrs'
  };

  function onKey(e, down) {
    var code = e.code || '';
    var slot = KEYS[code];
    if (slot) {
      self.input[slot] = down;
      e.preventDefault();
      if (down) self.audio.wake();
      return;
    }
    if (!down) return;
    if (code === 'Enter' || code === 'NumpadEnter') {
      self.audio.wake();
      if (self.state === STATE.TITLE) self.beginRace();
      else if (self.state === STATE.FINISHED) self.beginRace();
      e.preventDefault();
    } else if (code === 'KeyR') {
      self.audio.wake();
      if (self.state !== STATE.TITLE) self.beginRace();
    } else if (code === 'KeyC') {
      self.cycleCam();
    } else if (code === 'KeyM') {
      self.toggleMute();
    } else if (code === 'KeyN') {
      self.toggleMusic();
    } else if (code === 'KeyH') {
      self.toggleHalo();
    } else if (code === 'KeyP' || code === 'Escape') {
      if (self.state === STATE.RACING || self.state === STATE.COUNTDOWN) {
        self.paused = !self.paused;
        self.flash(self.paused ? 'PAUSED' : '');
      }
    }
  }

  window.addEventListener('keydown', function (e) {
    if (isTextEntry(e)) return;                /* they are typing, not driving */
    onKey(e, true);
  }, { passive: false });
  /* keyup is NOT guarded: it only ever clears a key, and skipping it would
     leave the throttle stuck on if focus moved into a field mid-press. */
  window.addEventListener('keyup', function (e) { onKey(e, false); }, { passive: false });
  window.addEventListener('blur', function () {
    self.input.keyL = self.input.keyR = self.input.keyU = self.input.keyD = self.input.keyB = self.input.keyDrs = false;
  });

  /* touch pads */
  var pads = document.querySelectorAll('[data-key]');
  for (var i = 0; i < pads.length; i++) {
    (function (el) {
      var slot = el.getAttribute('data-key');
      function set(on) {
        return function (e) {
          e.preventDefault();
          self.audio.wake();
          if (slot === 'start') { if (on) { if (self.state === STATE.TITLE || self.state === STATE.FINISHED) self.beginRace(); } return; }
          self.input[slot] = on;
          el.classList.toggle('is-on', on);
        };
      }
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('pointerleave', set(false));
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    })(pads[i]);
  }

  var muteBtn = document.getElementById('btn-sound');
  if (muteBtn) muteBtn.addEventListener('click', function () { self.audio.wake(); self.toggleMute(); });
  /* Reveal the touch controls only once touch is real. Resize afterwards so
     the HUD reflows around them. */
  watchForTouch(function () {
    if (document.documentElement.classList.contains('has-touch')) return;
    document.documentElement.classList.add('has-touch');
    /* Covers the devices whose capability flags lied at load time: if this is
       a phone after all and the player has never chosen for themselves, adopt
       the phone default. Not saved — it stays a default until they change it. */
    if (!self.settings.userConfigured && !self.settings.autoThrottle) {
      self.settings.autoThrottle = true;
      self.applySettings();
    }
    self.resize();
  });

  var zone = document.getElementById('stick-zone');
  if (zone) {
    this.stick = new VirtualStick({
      zone: zone,
      base: document.getElementById('stick-base'),
      knob: document.getElementById('stick-knob'),
      radius: 58,
      onWake: function () { self.audio.wake(); }
    });
    this.stick.attach();
  }

  var camPad = document.getElementById('pad-cam');
  if (camPad) {
    camPad.addEventListener('click', function (e) {
      e.preventDefault();
      self.cycleCam();
    });
  }

  var fsBtn = document.getElementById('btn-fs');
  if (fsBtn) {
    if (isStandalone()) {
      fsBtn.hidden = true;                    /* launched from the home screen already */
    } else if (fullscreenSupported()) {
      fsBtn.addEventListener('click', function () {
        self.audio.wake();
        toggleFullscreen(document.querySelector('.cabinet') || document.body);
      });
    } else if (isIosWebKit()) {
      /* The request would silently do nothing here, so answer the intent
         instead: show the Add to Home Screen route, which does work. */
      fsBtn.addEventListener('click', function (e) { e.preventDefault(); self.openA2HS(); });
    } else {
      fsBtn.hidden = true;
    }
  }
  onFullscreenChange(function () {
    var on = isFullscreen();
    document.documentElement.classList.toggle('fs-on', on);
    if (fsBtn) { fsBtn.textContent = on ? 'EXIT FULL' : 'FULLSCREEN'; fsBtn.classList.toggle('is-on', on); }
    /* Orientation lock is only accepted once fullscreen is actually live, so
       it belongs here rather than beside the request. */
    if (on) lockLandscape();
    setTimeout(function () { self.resize(); }, 80);
  });

  var a2hsClose = document.getElementById('a2hs-close');
  if (a2hsClose) a2hsClose.addEventListener('click', function (e) { e.preventDefault(); self.closeA2HS(); });
  var a2hsOverlay = document.getElementById('a2hs');
  if (a2hsOverlay) a2hsOverlay.addEventListener('click', function (e) {
    if (e.target === a2hsOverlay) self.closeA2HS();
  });

  this.buildTrackList();

  var qualitySet = document.getElementById('set-quality');
  if (qualitySet) qualitySet.addEventListener('click', function (e) {
    e.preventDefault();
    var names = self.tierCycle();
    self.chooseTier(names[(names.indexOf(self.settings.quality) + 1) % names.length]);
  });

  var todSet = document.getElementById('set-tod');
  if (todSet) todSet.addEventListener('click', function (e) {
    e.preventDefault();
    var i = TIME_OF_DAY_NAMES.indexOf(self.settings.timeOfDay);
    self.setTimeOfDay(TIME_OF_DAY_NAMES[(i + 1) % TIME_OF_DAY_NAMES.length]);
    self.applySettings();
    self.flash(self.settings.timeOfDay.toUpperCase());
  });

  var autoFsSet = document.getElementById('set-autofs');
  if (autoFsSet) autoFsSet.addEventListener('click', function (e) {
    e.preventDefault();
    self.settings.autoFullscreen = !self.settings.autoFullscreen;
    self.applySettings();
    self.saveSettings();
  });

  var steerBtn = document.getElementById('btn-steer');
  if (steerBtn) {
    /* no sensor means no cycle worth offering — the joystick is already the
       default and the only mode that would work */
    if (!this.tilt.supported) steerBtn.hidden = true;
    else steerBtn.addEventListener('click', function (e) {
      e.preventDefault();
      self.audio.wake();
      self.cycleSteerMode();
    });
  }

  /* Accounts are optional: on the Artifact build there is no config and no
     SDK, so init() returns false and the whole block stays hidden. */
  this.cloud = new Cloud();
  if (this.cloud.init()) {
    var acct = document.getElementById('acct');
    if (acct) acct.hidden = false;

    /* Fires on the sign-in TRANSITION only. The watcher runs on every
       notify() — profile loads, message changes — so keying off status alone
       turns each of those into another post attempt. */
    var lastUid = null;
    this.cloud.watch(function (c) {
      self.paintAccount(c);
      var uid = c.user ? c.user.id : null;
      if (uid && uid !== lastUid && self.pendingResult) self.postPending(true);
      lastUid = uid;
    });
    this.paintAccount(this.cloud);

    var emailInput = document.getElementById('acct-email');
    var firstInput = document.getElementById('acct-first');
    var lastInput = document.getElementById('acct-last');
    var optIn = document.getElementById('acct-optin');
    var preview = document.getElementById('acct-preview');
    var sendBtn = document.getElementById('acct-send');

    var driverInput = document.getElementById('acct-driver');

    /* Show the exact name that will appear on the board. A chosen driver
       name wins; the derived "Jamie E." is only what they would get by
       leaving it blank. */
    var paintPreview = function () {
      if (!preview) return;
      var d = driverInput ? driverInput.value.trim() : '';
      var f = firstInput ? firstInput.value : '';
      var l = lastInput ? lastInput.value : '';
      var shown = d || (f.trim() ? deriveDisplayName(f, l) : '');
      preview.textContent = shown
        ? 'You will appear on the board as "' + shown + '"'
        : 'You will appear on the board as —';
    };

    if (driverInput) driverInput.addEventListener('input', paintPreview);
    if (firstInput) firstInput.addEventListener('input', paintPreview);
    if (lastInput) lastInput.addEventListener('input', paintPreview);
    paintPreview();

    var email2Input = document.getElementById('acct-email2');
    var createBtn = document.getElementById('acct-create');
    var busy = function (b) {
      if (sendBtn) sendBtn.disabled = b;
      if (createBtn) createBtn.disabled = b;
    };

    /* Existing account only. shouldCreateUser is false here, so a typo in the
       address cannot quietly mint a second, nameless account. */
    var doSignIn = function () {
      if (!emailInput) return;
      busy(true);
      self.cloud.signIn(emailInput.value).then(function () { busy(false); });
    };

    /* Name availability is checked once, here, rather than on every
       keystroke. Catching it before the email goes out is the point: better
       to say "pick another" now than to send a link and quietly hand them
       "Senna2" because the trigger had to break a tie. */
    /* New account. The name is checked once, here, so a clash is caught
       before the email goes out rather than silently becoming "Senna2". */
    var doSignUp = function () {
      if (!email2Input) return;
      busy(true);
      var reject = function (msg) {
        self.cloud.message = msg;
        self.cloud.notify();
        busy(false);
        if (driverInput) driverInput.focus();
      };
      self.cloud.checkDriverName(driverInput ? driverInput.value : '').then(function (r) {
        if (r.state === 'taken') return reject('That driver name is taken — pick another.');
        if (r.state === 'short') return reject('Driver name needs at least 2 characters.');
        if (r.state === 'long') return reject('Driver name is too long (24 max).');
        if (r.state === 'chars') return reject('Driver name: letters, numbers, spaces, . _ - only.');
        /* "unknown" means the check itself failed — never block on that; the
           unique index and the trigger still hold the line. */
        return self.cloud.signUp(email2Input.value, {
          driver: driverInput ? driverInput.value : '',
          first: firstInput ? firstInput.value : '',
          last: lastInput ? lastInput.value : '',
          optIn: optIn ? optIn.checked : false
        }).then(function () { busy(false); });
      });
    };

    /* Enter submits whichever form is on screen. */
    var send = function () {
      if (self.acctMode === 'signup') doSignUp(); else doSignIn();
    };

    var setMode = function (mode) {
      self.acctMode = mode;
      self.cloud.message = '';
      self.paintAccount(self.cloud);
      var focusOn = mode === 'signup' ? driverInput : emailInput;
      if (focusOn) focusOn.focus();
    };

    var toSignup = document.getElementById('acct-to-signup');
    if (toSignup) toSignup.addEventListener('click', function (e) { e.preventDefault(); setMode('signup'); });
    var toSignin = document.getElementById('acct-to-signin');
    if (toSignin) toSignin.addEventListener('click', function (e) { e.preventDefault(); setMode('signin'); });
    if (createBtn) createBtn.addEventListener('click', function (e) { e.preventDefault(); doSignUp(); });
    /* Both forms offer Google; either one starts the same redirect. */
    var google = function (e) {
      e.preventDefault();
      self.cloud.signInWithProvider('google');
    };
    var gBtn1 = document.getElementById('acct-google');
    var gBtn2 = document.getElementById('acct-google2');
    if (gBtn1) gBtn1.addEventListener('click', google);
    if (gBtn2) gBtn2.addEventListener('click', google);

    /* Google gives us a derived name like "Jamie E." and no way to choose a
       handle during signup, so renaming afterwards is the only route to a
       driver name for those accounts. */
    var renameInput = document.getElementById('acct-rename');
    var renameBtn = document.getElementById('acct-rename-go');
    var doRename = function () {
      if (!renameInput) return;
      var want = renameInput.value.trim();
      if (!want) return;
      renameBtn.disabled = true;
      var fail = function (msg) {
        self.cloud.message = msg;
        self.cloud.notify();
        renameBtn.disabled = false;
        renameInput.focus();
      };
      self.cloud.checkDriverName(want).then(function (c) {
        if (c.state === 'taken') return fail('That driver name is taken.');
        if (c.state === 'short') return fail('Needs at least 2 characters.');
        if (c.state === 'long') return fail('Too long (24 max).');
        if (c.state === 'chars') return fail('Letters, numbers, spaces, . _ - only.');
        return self.cloud.setDisplayName(want).then(function (r) {
          renameBtn.disabled = false;
          if (!r.ok) { fail(r.error || 'Could not save that name.'); return; }
          renameInput.value = '';
          self.cloud.message = '';
          self.cloud.notify();
        });
      });
    };
    if (renameBtn) renameBtn.addEventListener('click', function (e) { e.preventDefault(); doRename(); });
    if (renameInput) renameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); doRename(); }
    });

    var againBtn = document.getElementById('acct-again');
    if (againBtn) againBtn.addEventListener('click', function (e) { e.preventDefault(); self.cloud.cancelPending(); });
    if (sendBtn) sendBtn.addEventListener('click', function (e) { e.preventDefault(); send(); });
    var fields = [driverInput, firstInput, lastInput, emailInput, email2Input, renameInput];
    for (var fi = 0; fi < fields.length; fi++) {
      if (!fields[fi]) continue;
      fields[fi].addEventListener('keydown', function (e) {
        /* Enter would otherwise fall through to the game and start a race */
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); send(); }
      });
      /* If a key was held when they clicked into a field, its keyup may never
         arrive — release everything so the car does not drive off while they
         type. */
      fields[fi].addEventListener('focus', function () {
        var inp = self.input;
        inp.keyL = inp.keyR = inp.keyU = inp.keyD = inp.keyB = inp.keyDrs = false;
      });
    }

    /* Only offered where it can actually work — the artifact build has no
       cloud config, so the button stays hidden there. */
    var boardBtn = document.getElementById('btn-board');
    if (boardBtn) {
      boardBtn.hidden = false;
      boardBtn.addEventListener('click', function (e) { e.preventDefault(); self.openBoard(); });
    }
    var boardClose = document.getElementById('board-close');
    if (boardClose) boardClose.addEventListener('click', function (e) { e.preventDefault(); self.closeBoard(); });
    var boardRefresh = document.getElementById('board-refresh');
    if (boardRefresh) boardRefresh.addEventListener('click', function (e) { e.preventDefault(); self.loadBoard(); });
    var boardOverlay = document.getElementById('board');
    if (boardOverlay) boardOverlay.addEventListener('click', function (e) {
      if (e.target === boardOverlay) self.closeBoard();
    });

    var outBtn = document.getElementById('acct-out');
    if (outBtn) outBtn.addEventListener('click', function (e) { e.preventDefault(); self.cloud.signOut(); });
  }

  var settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) settingsBtn.addEventListener('click', function (e) {
    e.preventDefault(); self.audio.wake(); self.openSettings();
  });

  var closeBtn = document.getElementById('set-close');
  if (closeBtn) closeBtn.addEventListener('click', function (e) { e.preventDefault(); self.closeSettings(); });

  var overlay = document.getElementById('settings');
  if (overlay) overlay.addEventListener('click', function (e) {
    if (e.target === overlay) self.closeSettings();     /* tap the backdrop */
  });

  var steerSet = document.getElementById('set-steer');
  if (steerSet) steerSet.addEventListener('click', function (e) {
    e.preventDefault();
    self.setSteerTilt(!self.settings.steerTilt, true);
  });

  var invertSet = document.getElementById('set-invert');
  if (invertSet) invertSet.addEventListener('click', function (e) {
    e.preventDefault();
    self.settings.tiltInvert = !self.settings.tiltInvert;
    self.tilt.recalibrate();
    self.applySettings();
    self.saveSettings();
  });

  var sensSet = document.getElementById('set-sens');
  if (sensSet) sensSet.addEventListener('input', function () {
    self.settings.steerSens = clamp(parseInt(sensSet.value, 10) || 6, 1, 10);
    self.applySettings();
    self.saveSettings();
  });

  var enVol = document.getElementById('set-envol');
  if (enVol) enVol.addEventListener('input', function () {
    self.settings.engineVol = clamp(parseInt(enVol.value, 10), 0, 10);
    self.applySettings();
    self.saveSettings();
  });

  var musVol = document.getElementById('set-musvol');
  if (musVol) musVol.addEventListener('input', function () {
    self.settings.musicVol = clamp(parseInt(musVol.value, 10), 0, 10);
    self.applySettings();
    self.saveSettings();
  });

  var throttleSet = document.getElementById('set-throttle');
  if (throttleSet) throttleSet.addEventListener('click', function (e) {
    e.preventDefault();
    self.settings.autoThrottle = !self.settings.autoThrottle;
    self.applySettings();
    self.saveSettings();
  });

  var recentre = document.getElementById('set-recentre');
  if (recentre) recentre.addEventListener('click', function (e) {
    e.preventDefault();
    self.tilt.recalibrate();
    self.flash('TILT RECENTRED');
  });

  window.addEventListener('keydown', function (e) {
    /* Escape still closes the panel while typing — that is what people
       expect from a dialog — but "o" must reach the field, not toggle it. */
    if (e.key === 'Escape') { self.closeSettings(); self.closeA2HS(); self.closeBoard(); return; }
    if (isTextEntry(e)) return;
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      var el = document.getElementById('settings');
      if (el && el.hidden) self.openSettings(); else self.closeSettings();
    }
  });

  /* A saved tilt preference cannot be restored silently — iOS only hands out
     the sensor inside a user gesture, so wait for the first one. */
  if (this.settings.steerTilt) {
    var restore = function () {
      window.removeEventListener('pointerdown', restore, true);
      window.removeEventListener('keydown', restore, true);
      self.setSteerTilt(true, true);
    };
    window.addEventListener('pointerdown', restore, true);
    window.addEventListener('keydown', restore, true);
  }

  /* Everything above is wired and the stick exists, so push the loaded
     settings through to the tilt sensor, the stick and both UIs at once. */
  this.applyQuality();
  this.applySettings();

  var musicBtn = document.getElementById('btn-music');
  if (musicBtn) musicBtn.addEventListener('click', function () { self.audio.wake(); self.toggleMusic(); });
  var restartBtn = document.getElementById('btn-restart');
  if (restartBtn) restartBtn.addEventListener('click', function () { self.audio.wake(); self.beginRace(); });

  this.glCanvas.addEventListener('pointerdown', function () { self.audio.wake(); self.host.focus(); });

  /* ONE-SHOT GLOBAL UNLOCK. A browser will not start audio until it has seen
     a real user gesture, and picking a circuit RELOADS the page — so whatever
     gesture opened the picker is spent by the time the new document boots.

     Only the specific controls above were wired to wake(), so after a circuit
     change the score stayed silent until you happened to press one of them.
     That is exactly why turning MUSIC off and on again appeared to fix it:
     that button calls wake() before it touches the mute, so the toggle was
     never the point — the wake was.

     Capture phase so nothing can swallow it first, and `once` so it costs a
     single dispatch. wake() is idempotent, so the three firing independently
     is harmless. */
  var unlock = function () { self.audio.wake(); };
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, unlock, { capture: true, once: true });
  });
};

/* Four modes now, and the choice STICKS. Picking a circuit reloads the page,
   so without persisting this you were dropped back to the chase camera every
   time you changed track. */
Game.prototype.cycleCam = function () {
  this.camMode = (this.camMode + 1) % CAM_LABELS.length;
  this.settings.camMode = this.camMode;
  this.saveSettings();
  this.flash(CAM_LABELS[this.camMode]);
};

Game.prototype.toggleMute = function () {
  this.audio.init();
  this.settings.engineOn = !this.settings.engineOn;
  this.applySettings();          /* pushes the mute and relabels the button */
  this.saveSettings();
  this.flash(this.settings.engineOn ? 'ENGINE ON' : 'ENGINE OFF');
};


/* Pushes haloVisible onto the cars that exist right now. Both the toggle and
   buildGrid call it, so a car built after the halo was switched off comes out
   of the garage matching — restarting a race used to silently put it back. */
Game.prototype.applyHalo = function () {
  var cars = this.cars || [];
  for (var i = 0; i < cars.length; i++) {
    if (cars[i].halo) cars[i].halo.visible = this.haloVisible;
  }
};

Game.prototype.toggleHalo = function () {
  this.haloVisible = !this.haloVisible;
  this.applyHalo();
  this.flash(this.haloVisible ? 'HALO: ON' : 'HALO: OFF');
};

Game.prototype.toggleMusic = function () {
  this.audio.init();
  this.audio.initMusic();
  this.settings.musicOn = !this.settings.musicOn;
  this.applySettings();          /* pushes the mute and relabels the button */
  this.saveSettings();
  this.flash(this.settings.musicOn ? 'MUSIC ON' : 'MUSIC OFF');
};

Game.prototype.flash = function (msg) {
  this.message = msg;
  this.messageT = msg ? 1.9 : 0;
};

/* A line the player has to be able to read whichever screen is up, for
   longer than a flash: flash() is the race's own, it is drawn only while a
   race is on, counted down by the simulation's clock and wiped when a race
   is reset. This one is drawn over the title and the results as well, and
   counted down by the frame loop (render), so it runs on the title screen
   and never touches the simulation. One line of up to 49 characters: the
   HUD is never narrower than 300 units. */
Game.prototype.notify = function (msg) {
  this.notice = msg || '';
  this.noticeT = msg ? 7 : 0;
};

Game.prototype.drawNotice = function () {
  if (!this.notice || this.noticeT <= 0) return;
  var g = this.hud, W = this.vw, H = this.vh;
  var w = textWidth(this.notice, 1) + 12, y = Math.round(H * 0.72);
  g.globalAlpha = clamp(this.noticeT / 0.6, 0, 1);
  this.panel(Math.round(W / 2 - w / 2), y - 5, w, GLYPH_H + 10);
  drawTextCenter(g, this.notice, W / 2, y, 1, C_WHITE, C_SHADOW);
  g.globalAlpha = 1;
};

Game.prototype.beginRace = function () {
  this.audio.wake();
  this.maybeEnterFullscreen();
  this.resetRace(false);
  this.startTrace();
  this.state = STATE.COUNTDOWN;
  this.countdown = 0;
  this.paused = false;
};

/* --- sizing ------------------------------------------------------------- */

Game.prototype.resize = function () {
  var cw = Math.max(160, this.host.clientWidth | 0);
  var ch = Math.max(120, this.host.clientHeight | 0);

  /* The canvas drawing buffer is not sized here by name: renderer.setSize
     below multiplies by the renderer's pixel ratio, and applyQuality sets
     that from the tier's `canvas` rule. */
  var tier = (this.settings && TIERS[this.tierOn || this.settings.quality]) || TIERS.retro;
  var gw, gh;
  if (tier.target === 'super') {
    /* Render ABOVE the display size and let the downscale do the smoothing.
       Supersampling rather than MSAA because it needs no WebGL2 path and no
       version-specific render-target API, and it anti-aliases the alpha-tested
       foliage too, which MSAA would leave jagged. Capped on total pixels so a
       4K monitor does not ask for a 33-megapixel buffer. */
    var dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    var ss = 1.35 * dpr;
    gw = Math.round(cw * ss);
    gh = Math.round(ch * ss);
    var maxPx = 5200000;
    if (gw * gh > maxPx) {
      var k = Math.sqrt(maxPx / (gw * gh));
      gw = Math.round(gw * k); gh = Math.round(gh * k);
    }
    gw = clamp(gw, 320, 3800);
    gh = clamp(gh, 240, 2400);
  } else {
    /* The 3D runs in a small framebuffer and is stretched up with bilinear
       filtering. That softness is the point: an N64 fed a CRT, so its image
       blended rather than showing hard pixel edges. Nearest-neighbour here
       would read as 2D pixel art, which is the wrong console entirely. */
    var scale3d = clamp(ch / 384, 1, 3.4);
    gw = clamp(Math.round(cw / scale3d), 240, 900);
    gh = clamp(Math.round(ch / scale3d), 180, 620);
  }

  this.gw = gw; this.gh = gh;
  this.renderer.setSize(gw, gh, false);
  this.rt.setSize(gw, gh);
  this.postU.uRes.value.set(gw, gh);

  this.glCanvas.style.width = cw + 'px';
  this.glCanvas.style.height = ch + 'px';

  /* The HUD is a separate, sharper layer at native pixels — N64 games
     composited their 2D at full output resolution too. It is drawn in
     virtual units and scaled by an integer so every rect stays crisp. */
  var dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  var uiCss = clamp(Math.round(ch / 300), 1, 4);
  /* never let the HUD's virtual canvas get so narrow that labels collide */
  while (uiCss > 1 && cw / uiCss < 300) uiCss--;

  this.hudCanvas.width = Math.min(2600, Math.round(cw * dpr));
  this.hudCanvas.height = Math.min(1600, Math.round(ch * dpr));
  this.hudCanvas.style.width = cw + 'px';
  this.hudCanvas.style.height = ch + 'px';

  /* Virtual HUD units stay device-independent so the overlay is the same
     physical size everywhere; the backing store is what gets denser. */
  this.us = uiCss * dpr;
  this.vw = Math.floor(this.hudCanvas.width / this.us);
  this.vh = Math.floor(this.hudCanvas.height / this.us);

  this.camera.aspect = cw / ch;
  this.camera.updateProjectionMatrix();
};

/* --- simulation --------------------------------------------------------- */

/* Three input sources feed the same three axes. Tilt outranks the stick for
   steering; the stick always owns throttle and brake, so tilt players still
   have a pedal. Analog sources barely need smoothing — the heavy damping
   exists to make binary key presses feel progressive. */
Game.prototype.playerInput = function (dt) {
  var inp = this.input;
  var onStick = !!(this.stick && this.stick.active);
  var onTilt = !!(this.tilt && this.tilt.mode !== 0);

  var sens = this.settings.steerSens;

  var tSteer;
  if (onTilt) tSteer = this.tilt.value();                       /* lean range already applied */
  else if (onStick) tSteer = applyExpo(this.stick.x, steerExpoFor(sens));
  else tSteer = (inp.keyR ? 1 : 0) - (inp.keyL ? 1 : 0);

  var tThrottle, tBrake;
  if (onStick) {
    tThrottle = this.stick.throttle();
    tBrake = this.stick.brake();
  } else {
    tThrottle = inp.keyU ? 1 : 0;
    tBrake = inp.keyD ? 1 : 0;
  }

  /* Auto throttle frees the thumb for steering: hold the throttle wide open
     and let pulling back still brake (and reverse from a standstill). Only
     while actually racing, so it cannot creep during the countdown. */
  if (this.settings.autoThrottle && this.state === STATE.RACING) {
    tThrottle = tBrake > 0.05 ? 0 : 1;
  }

  /* Analog sources are already smooth, so their damping is fixed. Keys get
     the sensitivity knob, and centring stays proportionally brisker than
     winding on — the 16/9 ratio the fixed values used to have. */
  var keyRate = keyRateFor(sens);
  var steerRate = (onTilt || onStick) ? 20 : (tSteer === 0 ? keyRate * (16 / 9) : keyRate);
  inp.steer = damp(inp.steer, clamp(tSteer, -1, 1), steerRate, dt);
  inp.throttle = damp(inp.throttle, tThrottle, onStick ? 20 : 13, dt);
  inp.brake = damp(inp.brake, tBrake, onStick ? 24 : 18, dt);
  inp.handbrake = inp.keyB ? 1 : 0;

  /* Quantise to exactly the 8-bit grid the replay trace stores. Doing it HERE
     rather than at record time is what makes a replay reproduce the run it
     claims to: quantise only on the way out and every playback starts from
     slightly different numbers, and this simulation turns a 1e-9 difference
     into kilometres. 254 steps of steering is finer than most gamepads. */
  inp.steer = Math.round(clamp(inp.steer, -1, 1) * 127) / 127;
  inp.throttle = Math.round(clamp(inp.throttle, 0, 1) * 255) / 255;
  inp.brake = Math.round(clamp(inp.brake, 0, 1) * 255) / 255;

  return inp;
};

/* ---- settings ----------------------------------------------------------
   The chrome button and the settings panel are two views of ONE state, so
   changing either has to end up calling applySettings(). */

var SETTINGS_KEY = 'mcl64.settings.v1';

/* ---- one sensitivity, three meanings -----------------------------------
   Each input type needs a different knob turned, but the player should only
   ever see one number. All three curves are pinned so that 6 reproduces the
   old hard-coded feel exactly — moving the slider is opt-in, and anyone who
   never touches it notices nothing. */

/* TILT: degrees of lean for full lock. 40 is forgiving, 10 is twitchy. */
function tiltRangeFor(sens) { return 40 - (clamp(sens, 1, 10) - 1) * (30 / 9); }

/* JOYSTICK: exponent on stick deflection. Above 1 softens the centre for
   precision at speed; below 1 sharpens it. Full lock stays reachable at every
   setting — this bends the curve, it does not cap the ends. */
function steerExpoFor(sens) {
  var s = clamp(sens, 1, 10);
  return s <= 6 ? (2.0 - (s - 1) * 0.2) : (1.0 - (s - 6) * 0.1);
}

/* KEYS: binary input has no magnitude, so the only thing sensitivity can mean
   is how fast the wheel winds on toward full lock. */
function keyRateFor(sens) {
  var s = clamp(sens, 1, 10);
  return s <= 6 ? (5 + (s - 1) * 0.8) : (9 + (s - 6) * 2.25);
}

function applyExpo(v, k) {
  if (k === 1) return v;
  return sign(v) * Math.pow(Math.abs(v), k);
}

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
   never asked for (see watchPace and TIER_FELL). */
var SETTINGS_DEFAULTS = 2;
var OLD_DEFAULTS = { quality: 'modern', trackId: 'silverstone-v1', timeOfDay: 'midday' };

Game.prototype.loadSettings = function () {
  /* Phones default to auto throttle: one thumb cannot hold the gas and steer
     accurately at the same time. Tilt deliberately stays OFF — switching it on
     requires an iOS permission prompt, and ambushing a first-time player with
     a system dialog before they have driven anything is a poor trade for a
     control most people only sometimes want.
     userConfigured tracks whether the player has ever set anything themselves,
     so these defaults never overwrite a returning player's choices. */
  var s = {
    steerTilt: false,
    tiltInvert: false,
    steerSens: 6,
    engineVol: 10,
    musicVol: 10,
    /* The on/off state of each bus, kept here rather than only on the audio
       object — see applySettings. Engine off is the deliberate default: the
       drone is punishing over three laps, the score is not. */
    musicOn: true,
    engineOn: false,
    camMode: 0,
    autoThrottle: touchLikely(),
    autoFullscreen: true,
    /* see WHO STARTS WHERE above */
    quality: 'ultra',
    tierChosen: false,
    timeOfDay: 'dusk',
    trackId: 'monaco-gp-v1',
    defaults: SETTINGS_DEFAULTS,
    userConfigured: false
  };
  /* whether storage held settings at all, and whether they were saved before
     today's defaults */
  var found = false, old = false;
  try {
    var raw = window.localStorage ? localStorage.getItem(SETTINGS_KEY) : null;
    if (raw) {
      var p = JSON.parse(raw);
      old = p.defaults !== SETTINGS_DEFAULTS;
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
      found = true;
    }
  } catch (e) { /* blocked storage or corrupt JSON — defaults are fine */ }
  /* the tier of this load is the game's pick and not the player's: nothing
     was saved, or it was saved before today and held the old default */
  var given = (!found || old) && !s.tierChosen;
  var write = found && old;

  /* A TIER LEFT ON TRIAL (see TIER_TRIAL_KEY). The key is taken away
     whatever it says, so one failure is acted on once. If it names the tier
     of this load, that tier either never drew its frames or lost the
     graphics device: the load goes to TIER_SAFE instead, and that is saved
     here and now, or the next load would try the same tier again. The
     constructor tells a player who had picked the tier; one who was given it
     is told nothing. A key marked untried is the game's own reload, and the
     trial starts again. */
  var trial = tierTrialRead();
  if (trial) {
    tierTrialWrite(null);
    var parts = trial.split(' ');
    if (parts[0] === s.quality && TIERS[s.quality].heavy) {
      if (parts[1] === 'untried') {
        tierTrialWrite(s.quality);
        this.trialLeft = TIER_TRIAL_FRAMES;
      } else {
        if (s.tierChosen) this.tierFell = parts[1] === 'lost' ? 'lost' : 'failed';
        s.quality = TIER_SAFE;
        s.tierChosen = false;
        write = true;
      }
    }
  }

  /* A HEAVY TIER NOBODY PICKED goes on trial exactly as a picked one does
     (commitTier): the key is written before the world is built, and the
     settings are saved with it, so a first load that dies before it has
     drawn TIER_TRIAL_FRAMES frames leaves both behind and the load after it
     comes up in TIER_SAFE. A load that draws them takes the key away, and
     the saved tier is trusted from then on like any other. */
  if (given && TIERS[s.quality].heavy && !(this.trialLeft > 0)) {
    tierTrialWrite(s.quality);
    this.trialLeft = TIER_TRIAL_FRAMES;
    write = true;
  }
  if (write) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e2) {} }
  return s;
};

/* Only ever called from an explicit player action, so this is the right place
   to record that the defaults no longer apply. */
Game.prototype.saveSettings = function () {
  this.settings.userConfigured = true;
  this.storeSettings();
};

/* Writes the settings without saying the player set anything: for the game's
   own changes (a tier given up, see watchPace). */
Game.prototype.storeSettings = function () {
  this.settings.defaults = SETTINGS_DEFAULTS;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) {}
};

Game.prototype.applySettings = function () {
  var s = this.settings, t = this.tilt;
  t.mode = s.steerTilt ? (s.tiltInvert ? 2 : 1) : 0;
  t.range = tiltRangeFor(s.steerSens);

  var tilting = t.mode !== 0;
  document.documentElement.classList.toggle('tilt-on', tilting);
  if (this.stick) {
    this.stick.lockX = tilting;
    if (tilting) this.stick.x = 0;
  }

  var btn = document.getElementById('btn-steer');
  if (btn) {
    btn.textContent = !s.steerTilt ? 'JOYSTICK' : (s.tiltInvert ? 'TILT INV' : 'TILT');
    btn.classList.toggle('is-on', tilting);
  }
  this.syncSettingsUi();
};

/* What the settings panel says for each tier: the button, the line that
   flashes on the screen when it is picked, and the hint under the row. */
var TIER_UI = {
  retro: {
    label: 'RETRO 240p', flash: 'RETRO 240p',
    hint: 'Retro: 240p with a 5-bit dither, as the hardware did it.'
  },
  modern: {
    label: 'MODERN', flash: 'MODERN GRAPHICS',
    hint: 'Modern: supersampled, tone mapped, no dither. Costs more GPU.'
  },
  ultra: {
    label: 'ULTRA', flash: 'ULTRA GRAPHICS',
    hint: 'Ultra: shadows across the whole view, a real sky and time of day.'
  }
};

Game.prototype.syncSettingsUi = function () {
  var s = this.settings;
  function put(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; }

  put('set-steer', s.steerTilt ? 'TILT' : 'JOYSTICK');
  put('set-invert', s.tiltInvert ? 'ON' : 'OFF');
  put('set-throttle', s.autoThrottle ? 'AUTO' : 'MANUAL');
  put('set-autofs', s.autoFullscreen ? 'AUTO' : 'MANUAL');
  this.syncTrackList();

  put('set-quality', TIER_UI[s.quality].label);
  put('set-quality-hint', TIER_UI[s.quality].hint);
  /* the time of day means something in Ultra only, so its row is shown there
     and nowhere else */
  put('set-tod', s.timeOfDay.toUpperCase());
  var todRow = document.getElementById('row-tod');
  if (todRow) todRow.hidden = s.quality !== 'ultra';

  /* No point offering an automatic fullscreen the platform will refuse. */
  var fsRow = document.getElementById('row-autofs');
  if (fsRow) fsRow.classList.toggle('is-disabled', !fullscreenSupported() || isStandalone());
  put('set-sens-num', String(s.steerSens));
  put('set-envol-num', String(s.engineVol));
  put('set-musvol-num', String(s.musicVol));

  /* Build stamp, injected by build.js at compile time — never edited by hand,
     because a version somebody has to remember to bump is a version that lies.
     Absent only if the page was assembled some other way. */
  var bi = window.MCL64_BUILD;
  var be = document.getElementById('set-build');
  if (be) {
    be.textContent = bi
      ? (bi.version + ' \u00b7 ' + bi.channel + ' \u00b7 ' + bi.sha + ' \u00b7 ' + bi.at)
      : 'unversioned build';
    be.classList.toggle('is-dev', !bi || bi.channel !== 'release');
  }

  var ev = document.getElementById('set-envol');
  if (ev && ev.value !== String(s.engineVol)) ev.value = String(s.engineVol);
  var mv = document.getElementById('set-musvol');
  if (mv && mv.value !== String(s.musicVol)) mv.value = String(s.musicVol);
  this.audio.setLevels(s.engineVol / 10, s.musicVol / 10);
  /* The mutes live in settings so they survive a reload — and a reload is not
     rare, since choosing a circuit performs one. Turning the music off and
     then switching track used to turn it straight back on. */
  this.audio.musicMuted = !s.musicOn;
  this.audio.setEngineMuted(!s.engineOn);
  var mb = document.getElementById('btn-music');
  if (mb) mb.textContent = s.musicOn ? 'MUSIC ON' : 'MUSIC OFF';
  var sb = document.getElementById('btn-sound');
  if (sb) sb.textContent = s.engineOn ? 'ENGINE ON' : 'ENGINE OFF';

  var slider = document.getElementById('set-sens');
  if (slider && slider.value !== String(s.steerSens)) slider.value = String(s.steerSens);

  /* The number means something different in each mode, so spell out which. */
  var sensHint = document.getElementById('set-sens-hint');
  if (sensHint) {
    sensHint.textContent = s.steerTilt
      ? ('Lean about ' + Math.round(tiltRangeFor(s.steerSens)) + '° for full lock.')
      : 'Shapes the stick around centre and how fast the arrow keys wind on. Full lock stays reachable either way.';
  }

  var hint = document.getElementById('set-hint');
  if (hint) {
    hint.textContent = s.autoThrottle
      ? 'Auto holds the throttle open so you can steer with one thumb. Pull back to brake, and again to reverse.'
      : 'Manual: push forward for gas, pull back to brake and then reverse.';
  }

  /* Invert is the only genuinely tilt-specific control — sensitivity now
     applies to every mode. It stays put rather than hiding, so the panel
     never reflows under the player's thumb. */
  var inv = document.getElementById('row-invert');
  if (inv) inv.classList.toggle('is-disabled', !s.steerTilt);

  /* recentring only means something when the sensor is driving */
  var rec = document.getElementById('set-recentre');
  if (rec) rec.disabled = !s.steerTilt;
};

/* Turning tilt ON is the only settings change that can fail, because iOS
   grants the sensor per gesture. Every caller must be inside a real click. */
Game.prototype.setSteerTilt = function (on, quiet) {
  var self = this, s = this.settings;
  if (!on) {
    s.steerTilt = false;
    this.applySettings();
    this.saveSettings();
    if (!quiet) this.flash('FINGER JOYSTICK');
    return;
  }
  this.tilt.enable().then(function (ok) {
    if (!ok) {
      s.steerTilt = false;
      self.applySettings();
      self.flash('TILT UNAVAILABLE');
      return;
    }
    s.steerTilt = true;
    self.tilt.recalibrate();
    self.applySettings();
    self.saveSettings();
    if (!quiet) self.flash('TILT STEERING');
  });
};

/* Quick in-race cycle: JOYSTICK -> TILT -> TILT INV -> JOYSTICK. Same state
   the panel edits, just without opening it. */
Game.prototype.cycleSteerMode = function () {
  var s = this.settings;
  if (!s.steerTilt) { this.setSteerTilt(true); return; }
  if (!s.tiltInvert) {
    s.tiltInvert = true;
    this.tilt.recalibrate();
    this.applySettings();
    this.saveSettings();
    this.flash('TILT INVERTED');
    return;
  }
  s.tiltInvert = false;
  this.setSteerTilt(false);
};

/* Called from beginRace, which means it is still inside the tap or keypress
   that started the race — the only moment a fullscreen request is allowed.
   Asking a frame later would be rejected as gestureless. */
Game.prototype.maybeEnterFullscreen = function () {
  if (!this.settings.autoFullscreen) return;
  if (!this.isTouch()) return;              /* desktop players size their own window */
  if (isStandalone() || isFullscreen() || !fullscreenSupported()) return;
  toggleFullscreen(document.querySelector('.cabinet') || document.body);
};

/* iPhone has no element fullscreen at all, so the button explains the one
   route that does work rather than vanishing and leaving the player stuck. */
Game.prototype.openA2HS = function () {
  var el = document.getElementById('a2hs');
  if (!el || !el.hidden) return;
  this.a2hsResume = (this.state === STATE.RACING || this.state === STATE.COUNTDOWN) && !this.paused;
  if (this.a2hsResume) this.paused = true;
  el.hidden = false;
  var c = document.getElementById('a2hs-close');
  if (c) c.focus();
};

Game.prototype.closeA2HS = function () {
  var el = document.getElementById('a2hs');
  if (!el || el.hidden) return;
  el.hidden = true;
  if (this.a2hsResume) { this.paused = false; this.a2hsResume = false; }
};

/* Identifies which physics + circuit a time was set on. Any change that
   alters lap times must bump this, or old and new runs end up ranked against
   each other as if they were comparable. */
/* Which circuit a time was set on. Read from the live track rather than
   hard-coded, so scores land on the right board when the circuit changes. */
Game.prototype.laps = function () {
  return (this.track && this.track.laps) || TOTAL_LAPS;
};

Game.prototype.trackVersion = function () {
  return (this.track && this.track.id) || 'silverstone-v1';
};

/* Bump when anything changes lap times: physics, the deterministic math, the
   track, or the AI. Traces recorded under an older SIM_VERSION cannot be
   validated by a newer validator, and their times are not comparable. */
var SIM_VERSION = 'sim-2';

/* 4 bytes per tick. A 3-lap race is ~20,400 ticks, so ~82 KB raw and a few KB
   once gzipped — small enough to post with the score. */
var TRACE_STRIDE = 4;
var TRACE_MAX_TICKS = 60 * 60 * 12;          /* 12 minutes, then stop growing */

Game.prototype.startTrace = function () {
  this.trace = { buf: new Uint8Array(TRACE_MAX_TICKS * TRACE_STRIDE), n: 0, overflow: false };
};

/* Stores exactly what the physics was handed. Because playerInput already
   quantised to this grid, the recording is lossless — replaying these bytes
   reproduces the run bit for bit rather than merely closely. */
Game.prototype.recordInput = function (inp) {
  var t = this.trace;
  if (!t || this.settling) return;      /* the settle loop is not part of the run */
  if (t.n + TRACE_STRIDE > t.buf.length) { t.overflow = true; return; }
  var b = t.buf, n = t.n;
  b[n] = (Math.round(clamp(inp.steer, -1, 1) * 127) + 128) & 0xff;   /* -127..127 -> 1..255 */
  b[n + 1] = Math.round(clamp(inp.throttle, 0, 1) * 255);
  b[n + 2] = Math.round(clamp(inp.brake, 0, 1) * 255);
  b[n + 3] = (inp.handbrake ? 1 : 0) | (this.input.keyDrs ? 2 : 0);
  t.n = n + TRACE_STRIDE;
};

/* Decoded form, for replaying locally and for the validator to consume. */
Game.prototype.traceTick = function (i) {
  var t = this.trace, n = i * TRACE_STRIDE;
  if (!t || n + TRACE_STRIDE > t.n) return null;
  var b = t.buf;
  return {
    steer: (b[n] - 128) / 127,
    throttle: b[n + 1] / 255,
    brake: b[n + 2] / 255,
    handbrake: (b[n + 3] & 1) ? 1 : 0,
    drs: !!(b[n + 3] & 2)
  };
};

Game.prototype.traceTicks = function () {
  return this.trace ? (this.trace.n / TRACE_STRIDE) | 0 : 0;
};

/* You crossed the line but the others are still circulating. Rather than
   writing them off as DNF, keep simulating — invisibly, and thousands of
   times faster than real time — until everyone has finished, so the results
   can show genuine gaps. A whole race costs ~95ms to simulate, so the last
   few seconds are free. Only a car that is still out there after three
   further minutes is really a DNF. */
Game.prototype.settleField = function () {
  this.settling = true;
  var cap = 60 * 180, n = 0, i, pending;
  while (n < cap) {
    pending = 0;
    for (i = 0; i < this.cars.length; i++) if (!this.cars[i].finished) pending++;
    if (!pending) break;
    this.tick(STEP);          /* the settling flag stops this recursing */
    n++;
  }
  this.settling = false;
};

/* Fires when the chequered flag drops. Everything about it is best-effort: a
   network failure must never stop the player seeing their result, so the
   outcome is a line on the results screen, not an error. */
Game.prototype.submitRace = function () {
  var p = this.player;
  if (!p.finished || !p.finishTime) { this.boardResult = null; return; }
  /* Held until it actually lands, so a race driven while signed out can still
     be posted the moment you sign in — without having to drive it again. */
  this.pendingResult = {
    trackVersion: this.trackVersion(),
    simVersion: SIM_VERSION,
    raceMs: p.finishTime,
    bestLapMs: p.bestLap || p.finishTime,
    position: p.position
  };
  this.postPending();
};

Game.prototype.postPending = function (force) {
  var self = this;
  var r = this.pendingResult;
  if (!r) return;
  if (!this.cloud || !this.cloud.enabled) { this.boardResult = null; return; }
  if (!this.cloud.user) { this.boardResult = { state: 'signed-out' }; return; }
  if (this.boardResult && this.boardResult.state === 'sending') return;
  /* A failure stays failed until something explicitly asks again. Without
     this, any notify() from the auth layer counts as a retry — and a failing
     post plus a chatty auth layer is an unbounded request loop. */
  if (!force && this.boardResult && this.boardResult.state === 'failed') return;

  this.boardResult = { state: 'sending' };
  this.cloud.submitScore(r).then(function (res) {
    if (!res.ok && window.console) console.warn('[MCL-64] score post failed:', res.reason);
    if (res.ok) {
      self.pendingResult = null;
      self.boardResult = { state: 'posted', improved: res.improved, rank: res.rank };
    } else {
      self.boardResult = { state: 'failed', reason: res.reason };
    }
  });
};

/* One line on the results screen telling them what happened to their time. */
Game.prototype.boardResultLine = function () {
  var b = this.boardResult;
  if (!b) return null;
  if (b.state === 'sending') return 'POSTING TO LEADERBOARD...';
  if (b.state === 'signed-out') return 'SIGN IN TO POST THIS TIME';
  if (b.state === 'failed') {
    /* The full reason goes to the console — truncating it on screen once hid
       "for schema auth", which was the entire diagnosis. */
    var r = String(b.reason || '');
    return 'COULD NOT POST - SEE CONSOLE: ' + r.toUpperCase().slice(0, 34);
  }
  if (b.state === 'posted') {
    if (b.improved) return 'NEW PERSONAL BEST - WORLD RANK ' + (b.rank || '?');
    return 'POSTED - WORLD RANK ' + (b.rank || '?');
  }
  return null;
};

Game.prototype.openBoard = function () {
  var el = document.getElementById('board');
  if (!el || !el.hidden) return;
  this.boardResume = (this.state === STATE.RACING || this.state === STATE.COUNTDOWN) && !this.paused;
  if (this.boardResume) this.paused = true;
  /* Always open on the circuit you are actually driving. */
  this.boardTrackId = this.trackVersion();
  el.hidden = false;
  /* AFTER unhiding — the rail measures 0 wide while the panel is display:none,
     so scrolling the current card into view has nothing to compute against. */
  this.syncTrackRail('board-track-list', this.boardTrackId);
  this.loadBoard();
};

Game.prototype.closeBoard = function () {
  var el = document.getElementById('board');
  if (!el || el.hidden) return;
  el.hidden = true;
  if (this.boardResume) { this.paused = false; this.boardResume = false; }
};

Game.prototype.loadBoard = function () {
  var self = this;
  var rows = document.getElementById('board-rows');
  var status = document.getElementById('board-status');
  if (!rows) return;
  if (status) status.textContent = 'Loading…';

  /* Ten are visible; the rest are there to scroll to. */
  var tv = this.boardTrackId || this.trackVersion();
  var def = trackById(tv) || (this.track && this.track.def);
  var label = (def && def.name) || tv;
  var conditions = def ? (def.laps + ' laps · ' + (def.grid || GRID_SIZE) + ' cars') : 'full grid';

  this.cloud.leaderboard(tv, 50).then(function (list) {
    rows.textContent = '';
    if (!list.length) {
      if (status) {
        /* Was hardcoded to "3 laps", which was simply wrong on a 5-lap oval
           and a 4-lap Brands. Read it off the circuit. */
        status.textContent = 'No times posted at ' + label + ' yet. Race conditions, ' +
          conditions + ' — first one on the board sets the target.';
      }
      return;
    }
    if (status) status.textContent = label + ' · ' + conditions;

    var head = document.createElement('div');
    head.className = 'brow brow-head';
    head.appendChild(self.boardCell('brank', '#'));
    head.appendChild(self.boardCell('bname', 'DRIVER'));
    head.appendChild(self.boardCell('btime', 'RACE'));
    head.appendChild(self.boardCell('blap', 'BEST LAP'));
    rows.appendChild(head);

    var mine = (self.cloud.profile && self.cloud.profile.display_name) || null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var row = document.createElement('div');
      row.className = 'brow' + (mine && r.display_name === mine ? ' brow-me' : '');
      row.appendChild(self.boardCell('brank', String(r.rank)));
      /* textContent, never innerHTML — display names are player-supplied */
      row.appendChild(self.boardCell('bname', r.display_name));
      /* fmtTime takes MILLISECONDS, and the columns are stored in ms — no
         conversion. Dividing by 1000 turned a 5:31 race into "00.331". */
      row.appendChild(self.boardCell('btime', fmtTime(r.race_ms)));
      row.appendChild(self.boardCell('blap', fmtTime(r.best_lap_ms)));
      rows.appendChild(row);
    }

    /* SAY THAT NOTHING IS VERIFIED YET.
       0003 chose to show unvalidated runs rather than hide them, on the grounds
       that a board hiding everything until a validator exists is
       indistinguishable from a broken board. That much was implemented. The
       README then claimed the rows were shown "flagged", which was never true:
       the query did not even select `validated`, and nothing here drew a marker.
       Caught by an external audit reading the claim against the code.

       A per-row flag is the wrong fix while the validator does not exist —
       every row is unvalidated, so it would be fifty identical asterisks. One
       line that states the actual position is more honest and less noise. */
    var unverified = 0;
    for (var k = 0; k < list.length; k++) if (list[k].validated === false) unverified++;
    if (unverified) {
      var note = document.createElement('div');
      note.className = 'brow brow-note';
      note.appendChild(self.boardCell(
        'bnote',
        unverified === list.length
          ? 'No time here is replay-verified yet — the validator is not built.'
          : unverified + ' of these times are not replay-verified yet.'
      ));
      rows.appendChild(note);
    }
  });
};

Game.prototype.boardCell = function (cls, text) {
  var d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
};

Game.prototype.openSettings = function () {
  var el = document.getElementById('settings');
  if (!el || !el.hidden) return;
  /* Pause a live race so nobody crashes while adjusting a slider, but only
     resume what we ourselves paused. */
  this.settingsResume = (this.state === STATE.RACING || this.state === STATE.COUNTDOWN) && !this.paused;
  if (this.settingsResume) this.paused = true;
  this.syncSettingsUi();
  el.hidden = false;
  /* AFTER unhiding. syncSettingsUi runs while the panel is still display:none,
     where the circuit rail measures 0 wide, so centring the current card there
     computes against nothing and leaves the rail parked at the far left. */
  this.syncTrackList();
  var c = document.getElementById('set-close');
  if (c) c.focus();
};

Game.prototype.closeSettings = function () {
  var el = document.getElementById('settings');
  if (!el || el.hidden) return;
  el.hidden = true;
  if (this.settingsResume) { this.paused = false; this.settingsResume = false; }
  this.saveSettings();
};

Game.prototype.inDrsZone = function (v) {
  var z = this.track.drsZones;
  for (var i = 0; i < z.length; i++) {
    var a = z[i][0], b = z[i][1];
    if (a <= b) { if (v.frameIdx >= a && v.frameIdx <= b) return true; }
    else if (v.frameIdx >= a || v.frameIdx <= b) return true;   /* zone wraps the seam */
  }
  return false;
};

Game.prototype.tick = function (dt) {
  this.time += dt;

  if (this.state === STATE.TITLE) { this.tickDemo(dt); return; }
  if (this.paused) return;

  var live = this.state === STATE.RACING;

  if (this.state === STATE.COUNTDOWN) {
    var prev = this.countdown;
    this.countdown += dt;
    var stepsAt = [0.7, 1.5, 2.3, 3.1, 3.9];
    for (var s = 0; s < 5; s++) {
      if (prev < stepsAt[s] && this.countdown >= stepsAt[s]) {
        this.setLights(s + 1);
        this.audio.blip(320, 0.16, 'square', 0.22);
      }
    }
    if (prev < 5.0 && this.countdown >= 5.0) {
      this.setLights(0);
      this.audio.blip(760, 0.42, 'sawtooth', 0.3);
      this.state = STATE.RACING;
      this.flash('GO');
      live = true;
    }
  }

  if (live) this.raceTime += dt * 1000;

  /* DRS */
  var p = this.player;
  var wantBoost = this.input.keyDrs && this.inDrsZone(p) && p.vFwd > 42 && live;
  p.drsActive = wantBoost;
  p.boost = damp(p.boost, wantBoost ? 1 : 0, wantBoost ? 3.2 : 2.2, dt);

  var i;
  for (i = 0; i < this.cars.length; i++) {
    var v = this.cars[i];
    var inp;
    /* Recorded on EVERY tick from beginRace, countdown included. Gating on
       `live` would make tick 0 of the trace mean "first racing tick", so a
       replayer would have to know exactly how long the countdown ran to line
       the inputs up — get it wrong and every input lands seconds early. This
       way index 0 is simply the first tick after beginRace. */
    if (v.isPlayer) { inp = this.playerInput(dt); this.recordInput(inp); }
    else {
      inp = this.ais[i - 1].update(dt, this.cars, this.time);
      var aiBoost = this.inDrsZone(v) && v.vFwd > 42;
      v.boost = damp(v.boost, aiBoost ? 0.85 : 0, 2.5, dt);
    }
    var alive = live && !v.finished;
    v.step(dt, inp, alive);
    if (live) this.checkLap(v);
  }

  resolveCarContacts(this.cars, this.audio);
  this.updatePositions();

  if (this.messageT > 0) { this.messageT -= dt; if (this.messageT <= 0) this.message = ''; }
  if (this.splitShow > 0) this.splitShow -= dt;

  /* Only while the race is still notionally running. tick() has no early
     return for FINISHED, so without this gate the branch below re-fires on
     every frame after the flag — which meant submitRace() ran 60 times a
     second and buried Supabase in submit_score calls. */
  if (p.finished && this.state !== STATE.FINISHED) {
    this.finishHold += dt;
    if (this.finishHold > 2.6 && !this.settling) {
      this.settleField();
      this.state = STATE.FINISHED;
      this.submitRace();
    }
  }
};

/* Attract mode: a full field racing under AI, cut between TV cameras.
   Every N64 racer opened on one of these. */
Game.prototype.tickDemo = function (dt) {
  var i, v;
  for (i = 0; i < this.cars.length; i++) {
    v = this.cars[i];
    var drv = (i === 0) ? this.demoAI : this.ais[i - 1];
    var inp = drv.update(dt, this.cars, this.time);
    var boosting = this.inDrsZone(v) && v.vFwd > 42;
    v.boost = damp(v.boost, boosting ? 0.85 : 0, 2.5, dt);
    v.step(dt, inp, true);
    var len = this.track.length;
    v.prevU = (v.f.s - this.track.startS + len) % len;
    v.progress = v.prevU;
  }
  resolveCarContacts(this.cars, null);

  this.demoT += dt;
  var dur = this.demoShot === 0 ? 7.5 : 5.0;
  if (this.demoT >= dur) this.nextDemoShot();
};

Game.prototype.nextDemoShot = function () {
  var t = this.track, n = t.n;
  this.demoT = 0;
  this.demoShot = (this.demoShot + 1) % 3;

  /* follow whoever is leading on track, then the car behind them */
  var idx = this.cars.indexOf(this.demoCar);
  this.demoCar = this.cars[(idx + 2) % this.cars.length];

  var focus = this.demoCar;
  var side = (this.demoShot === 1) ? 1 : -1;
  var aheadSamples = this.demoShot === 1 ? 20 : 13;
  var ai = (focus.frameIdx + aheadSamples) % n;

  if (this.demoShot === 1) {
    t.pointAt(ai, side * (WALL_HALF + 16), this.demoAnchor);
    this.demoAnchor.y += 9.5;
  } else if (this.demoShot === 2) {
    t.pointAt(ai, side * (HALF_W - 2), this.demoAnchor);
    this.demoAnchor.y += 1.5;
  }
};

Game.prototype.checkLap = function (v) {
  var t = this.track, len = t.length;
  var u = (v.f.s - t.startS + len) % len;
  var d = u - v.prevU;
  var half = len * 0.5;

  if (d < -half) {
    /* crossed the timing line going forwards */
    if (!v.started) {
      v.started = true;
      v.lapStart = this.raceTime;
      v.sectorIdx = 0;
    } else {
      var lap = this.raceTime - v.lapStart;
      v.lastLap = lap;
      if (!v.bestLap || lap < v.bestLap) {
        v.bestLap = lap;
        if (v.isPlayer) this.showSplit('LAP ' + fmtTime(lap), true);
      } else if (v.isPlayer) {
        this.showSplit(fmtDelta(lap - v.bestLap), false);
      }
      v.lapStart = this.raceTime;
      v.lapsDone++;
      v.sectorIdx = 0;
      if (v.lapsDone >= this.laps()) {
        v.finished = true;
        v.finishTime = this.raceTime;
        if (v.isPlayer) { this.flash('FINISH'); this.audio.blip(880, 0.5, 'square', 0.28); }
      } else if (v.isPlayer) {
        if (v.lapsDone === this.laps() - 1) this.flash('FINAL LAP');
        else this.flash('LAP ' + (v.lapsDone + 1));
        this.audio.blip(560, 0.2, 'square', 0.2);
      }
    }
  } else if (d > half) {
    if (v.lapsDone > 0) v.lapsDone--;
  }
  v.prevU = u;
  v.progress = (v.started ? v.lapsDone : -1) * len + u;

  /* sector splits */
  if (v.isPlayer && v.started && !v.finished) {
    var third = len / 3;
    var target = (v.sectorIdx + 1) * third;
    if (v.sectorIdx < 2 && u >= target) {
      var st = this.raceTime - v.lapStart;
      var idx = v.sectorIdx;
      var best = v.sectorBest[idx];
      if (best) this.showSplit('S' + (idx + 1) + ' ' + fmtDelta(st - best), st <= best);
      if (!best || st < best) v.sectorBest[idx] = st;
      v.sectorIdx++;
    }
  }
};

Game.prototype.showSplit = function (text, good) {
  this.splitText = text;
  this.splitGood = good;
  this.splitShow = 2.6;
};

Game.prototype.updatePositions = function () {
  var sorted = this.cars.slice();
  sorted.sort(function (a, b) {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  for (var i = 0; i < sorted.length; i++) sorted[i].position = i + 1;
  this.order = sorted;
};

/* --- camera ------------------------------------------------------------- */

var _cf = new THREE.Vector3(), _cr = new THREE.Vector3(), _ideal = new THREE.Vector3(), _look = new THREE.Vector3();
var _camQ = new THREE.Quaternion(), _spinQ = new THREE.Quaternion();
var _localOff = new THREE.Vector3(), _camEuler = new THREE.Euler(), _camEuler2 = new THREE.Euler();

var CAM_LABELS = ['CHASE CAM', 'T-CAM', 'HELMET CAM', 'GYRO CAM'];

/* THE ONBOARD CAMERAS.

   Both are bolted to the car and inherit its FULL orientation, roll included.
   That is the whole difference. The chase camera is aimed with lookAt against
   world up, and lookAt cannot express roll at all — which is why the old
   cockpit view stayed rigidly level while the car leaned underneath it, and
   why it read as a floating window rather than a place you are sitting.

   Offsets are in the car's own frame, where +Z is the nose (see buildCarMesh).
   For reference, the model puts the driver's helmet at [0, 0.775, 0.28] with a
   0.185 radius, the halo hoop at z 0.72 and the mirrors at z 0.74.

     T-CAM    above the airbox and just behind the head, the television
              onboard shot: you see the halo, the nose and both front wheels
              working. Wider, calmer, no head movement — it is a fixed mount.

     HELMET   the driver's eye, set just forward of the helmet shell so we are
              outside it rather than inside the geometry. Narrower view, and
              the head LEADS THE CAR INTO THE CORNER, which is the thing that
              makes an onboard feel driven rather than filmed.

     GYRO     same eye point, but GYRO-STABILISED: the horizon is held level
              and the car rolls underneath it. Roll is cancelled outright,
              pitch only mostly, so kerbs and crests still register instead of
              the whole image going dead.

   T-CAM and GYRO share a framing taken from the real broadcast shot: set back
   and up BEHIND the helmet and tilted down, so the car fills the lower part of
   the frame — halo, both mirrors, both front wheels working, the nose running
   away ahead — with the road in the upper third. Sitting it just above the
   airbox, as a first pass did, crops all of that away and looks like nothing.

   stabRoll/stabPitch are 0 for a hard mount and 1 for fully stabilised.
   `tilt` is a fixed downward angle in radians on top of the car's own pitch. */
var ONBOARD_CAMS = {
  1: { off: [0, 1.34, -0.95], fov: 66, fovGain: 7, lead: 0.00, stabRoll: 0, stabPitch: 0, tilt: 0.16 },
  /* Sat back at the eye rather than out at the visor, so the halo hoop arcs
     across the TOP of the frame and you look out under it, the strut runs up
     the middle, and both mirrors sit just inside the edges. fov is VERTICAL in
     three.js — 82 gives about 114 horizontal at 16:9, which is the wide,
     slightly fisheye look of the real driver's-eye shot. */
    /* PLANTED IN THE HELMET. The head mesh is a 0.185 sphere centred on
     [0, 0.775, 0.28], so this is the driver's own eye position — which is the
     point of a visor cam, and it is hidden for exactly this view so there is
     nothing to see the inside of.

     Two earlier attempts missed it in opposite directions. Pushing back to
     z -0.08 to get the coaming framing buried the eye INSIDE the airbox, which
     spans z -0.61 to -0.07, so the view looked out through the engine cover.
     Pulling forward to z 0.52 put it out at the visor, ahead of the halo, with
     the wheel filling half the screen. The head is where it belongs.

     Height is 0.87, not the helmet's own 0.775: this model has the head sitting
     ON the bodywork rather than down in a hole, and the shoulder-line cylinder
     tops out at exactly 0.80 — an eye at head height is INSIDE the tub and the
     screen goes black. 0.87 clears that surface while staying in the helmet.

     Tilt is only 0.08: at 0.13 the coaming swept across the middle of the
     frame and you drove looking at your own bodywork. */
  2: { off: [0, 0.87, 0.28], fov: 70, fovGain: 6, lead: 0.55, stabRoll: 0, stabPitch: 0, tilt: 0.08, hideHead: true },
  /* bankIn tilts INTO the corner, against the car's own outward body lean.
     Killing the car's roll outright (stabRoll 1) and leaving it there is what
     a real gyro mount does, but it reads badly from the seat: the horizon is
     nailed down while the cockpit rocks OUTWARD under you, so a left-hander
     looks like the car falling to the right. Banking in instead is the thing
     every rider and pilot already expects. */
  3: { off: [0, 1.34, -0.95], fov: 66, fovGain: 7, lead: 0.28, stabRoll: 1, stabPitch: 0.8, tilt: 0.16, bankIn: 0.34 }
};

Game.prototype.updateCamera = function (dt, snap) {
  var p = (this.state === STATE.TITLE) ? this.demoCar : this.player;
  p.visForward(_cf); p.visRight(_cr);

  var px = p.visX(), py = p.visY(), pz = p.visZ();
  var speed01 = clamp(p.vFwd / V_MAX, 0, 1);
  /* The eye sits INSIDE the helmet, so drawing it would fill the screen with
     the inside of a sphere. Hidden for this car only, and only in that view —
     the behind-the-head shots want the head very much in frame. */
  if (p.head) p.head.visible = !(ONBOARD_CAMS[this.camMode] || {}).hideHead || this.state === STATE.TITLE;
  /* The attract demo always runs the chase camera — an onboard shot of a car
     nobody is driving is just a moving wall. */
  var onboard = (this.state !== STATE.TITLE && ONBOARD_CAMS[this.camMode]) ? this.camMode : 0;

  if (this.state === STATE.TITLE && this.demoShot !== 0) {
    /* locked-off TV camera: hold the position, track the car */
    this.camPos.copy(this.demoAnchor);
    _look.set(px, py + 0.9, pz);
    this.camLook.lerp(_look, snap ? 1 : 1 - Math.exp(-9 * dt));
    this.camera.fov = this.demoShot === 1 ? 34 : 52;
  } else if (onboard) {
    var cfg = ONBOARD_CAMS[onboard];

    /* Mount point in the CAR's frame, so it swings with the car exactly as a
       bolted camera would — including being carried sideways as the car rolls
       on Indy's banking. */
    _localOff.set(cfg.off[0], cfg.off[1], cfg.off[2]);
    _localOff.applyQuaternion(p.group.quaternion);
    /* RIGID. Do NOT damp this toward the mount point in world space.

       The mount is attached to something moving, so a world-space lerp does
       not smooth it — it produces a LAG PROPORTIONAL TO SPEED. At 216 km/h the
       car covers a metre per frame, and damping at 25/s leaves the camera
       settling about two metres behind where it belongs: reversed back through
       the cockpit and into the engine cover. The faster you go, the deeper it
       sinks.

       There was never anything here worth damping anyway. The vertical jitter
       from the road surface measures 0.0025 m RMS. The motion that made the
       cockpit unwatchable was the rumble shake at +/-0.25 m, which is handled
       below, and the attitude, which is low-passed just after this. */
    this.camPos.copy(p.group.position).add(_localOff);

    /* The head leads the car into the corner. yawRate is positive in a LEFT
       turn and a positive camera yaw looks left, so this needs no negation. */
    var lead = clamp(p.yawRate * cfg.lead, -0.5, 0.5);
    this.headYaw = snap ? lead : damp(this.headYaw, lead, 7, dt);

    /* COMPOSED IN THE CAR'S OWN ORDER, not folded into one Euler.

       The obvious version — bake the 180 degree turn into the yaw term and
       negate pitch and roll to compensate — is wrong, and measurably so: it
       left the hard-mounted views 8.9 degrees off the car's own up vector and
       the stabilised one 10.5 degrees off level. Rotations do not commute, and
       there is no set of Euler angles in one triple that expresses "the car's
       attitude, then turned around".

       So build it in stages instead. First an attitude in exactly the car's
       convention, with roll and pitch scaled by however much this mount
       stabilises. Then turn about that body's OWN up to face forward and lead
       into the corner. Then tilt down about the camera's OWN right. Each step
       is applied in the frame the previous one produced, which is what the
       words actually mean. */
    /* Roll = whatever of the car's own roll this mount lets through, plus an
       optional lean INTO the turn. Positive roll lifts the car's LEFT, and a
       left turn is a positive yaw rate, so leaning into it is NEGATIVE. */
    var roll = p.roll * (1 - cfg.stabRoll);
    if (cfg.bankIn) roll -= clamp(p.yawRate * cfg.bankIn, -0.25, 0.25);

    /* Low-pass the ATTITUDE the camera uses. The car's own pitch and roll stay
       untouched — the chassis should still snap over a kerb — but the view
       riding on it gets a neck. Without this, clipping the outside of the
       circuit makes the cockpit unwatchable. */
    if (snap) { this.camPitch = p.pitch * (1 - cfg.stabPitch); this.camRoll = roll; }
    else {
      var kAtt = 1 - Math.exp(-16 * dt);
      this.camPitch += ((p.pitch * (1 - cfg.stabPitch)) - this.camPitch) * kAtt;
      this.camRoll += (roll - this.camRoll) * kAtt;
    }
    _camEuler.set(this.camPitch, p.vyaw, this.camRoll, 'YXZ');
    _camQ.setFromEuler(_camEuler);

    _camEuler2.set(0, Math.PI + this.headYaw, 0, 'YXZ');
    _spinQ.setFromEuler(_camEuler2);
    _camQ.multiply(_spinQ);

    _camEuler2.set(-cfg.tilt, 0, 0, 'YXZ');
    _spinQ.setFromEuler(_camEuler2);
    _camQ.multiply(_spinQ);
    this.camera.fov = cfg.fov + speed01 * cfg.fovGain;
  } else {
    this.headYaw = 0;
    var back = 8.0 + speed01 * 1.4;
    var lift = 3.05 + speed01 * 0.5;
    /* trail the slide a little so drifts read from behind */
    var slide = clamp(-p.vLat * 0.10, -2.2, 2.2);
    _ideal.set(
      px - _cf.x * back + _cr.x * slide,
      py + lift,
      pz - _cf.z * back + _cr.z * slide
    );
    _look.set(px + _cf.x * 11, py + 1.35, pz + _cf.z * 11);
    if (snap) { this.camPos.copy(_ideal); this.camLook.copy(_look); }
    else {
      var k = 1 - Math.exp(-9 * dt);
      this.camPos.lerp(_ideal, k);
      this.camLook.lerp(_look, 1 - Math.exp(-12 * dt));
    }
    /* Tighter than it was (62 + 13). A wide chase field pushes the car into
       the distance and flattens any sense of speed — the frame reads as a map
       of the corner rather than a car being driven through it. */
    this.camera.fov = 52 + speed01 * 10 + p.boost * 4;
  }

  /* Keep the camera out of the dirt — CHASE ONLY. An onboard mount sits about
     0.8 m above the car's floor, well under this 1.1 m floor, so applying it
     would jack the driver's eye up out of the cockpit on every frame. */
  if (!onboard) {
    var ground = this.track.heightAt(this.camPos.x, this.camPos.z, p.frameIdx) + 1.1;
    if (this.camPos.y < ground) this.camPos.y = ground;
  }

  var sx = 0, sy = 0;
  if (!this.reducedMotion) {
    var rumble = (p.onKerb ? 0.16 : 0) + (p.offTrack ? 0.20 : 0);
    this.shake = Math.max(this.shake * Math.exp(-6 * dt), p.hitImpulse * 0.7 + rumble * clamp(p.vFwd / 40, 0, 1));
    /* MEASURED: at the chase camera's 0.35 the shake throws the viewpoint
       +/-0.25 m at about 10 Hz when you run wide onto the rim at speed. Looking
       AT the car that reads as impact. From inside the helmet it is the entire
       world lurching a quarter of a metre, ten times a second, and it is
       genuinely unwatchable. 0.06 keeps it as a vibration you feel rather than
       a motion you fight — +/-0.04 m. */
    var shk = onboard ? 0.06 : 0.35;
    sx = (Math.sin(this.time * 61.3) + Math.sin(this.time * 37.7)) * this.shake * shk;
    sy = (Math.sin(this.time * 47.1) + Math.sin(this.time * 71.3)) * this.shake * shk;
  }

  this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
  /* lookAt would overwrite the roll — it always rebuilds the orientation from
     world up. Onboard modes therefore set the quaternion themselves. */
  /* The chase camera's 0.6 m near plane sits BEYOND the cockpit furniture —
     the steering wheel is 0.36 m from the driver's eye, so at 0.6 it was
     clipped away entirely and the view looked like sitting on the car rather
     than in it. Onboard pulls it in; chase keeps the far plane's depth
     precision. */
  this.camera.near = onboard ? 0.12 : 0.6;
  if (onboard) this.camera.quaternion.copy(_camQ);
  else this.camera.lookAt(this.camLook);
  this.camera.updateProjectionMatrix();

  this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);

  /* Walk the shadows along with the car, and lay the wide ones out from
     where the camera now is. The rig keeps the sun's direction: see update
     in 33-shadows.js. */
  this.shadowRig.focus.set(p.visX(), 0, p.visZ());
  this.shadowRig.update();
};

/* --- HUD ---------------------------------------------------------------- */

var C_PAPAYA = '#ff8c14';
var C_PAPAYA_DK = '#c85c00';
var C_CYAN = '#4fe3e0';
var C_WHITE = '#f4f2ef';
var C_SHADOW = '#0d0d12';
var C_PANEL = 'rgba(16,17,22,0.72)';
var C_GREEN = '#6fe06f';
var C_RED = '#ff5a4a';

Game.prototype.panel = function (x, y, w, h, accent) {
  var g = this.hud;
  g.fillStyle = C_PANEL;
  g.fillRect(x, y, w, h);
  g.fillStyle = accent || C_PAPAYA;
  g.fillRect(x, y, w, 1);
};

Game.prototype.drawHUD = function () {
  var g = this.hud, W = this.vw, H = this.vh;
  g.setTransform(this.us, 0, 0, this.us, 0, 0);
  g.clearRect(0, 0, W, H);

  if (this.state === STATE.TITLE) { this.drawTitle(); this.drawNotice(); return; }
  if (this.state === STATE.FINISHED) { this.drawResults(); this.drawNotice(); return; }

  var p = this.player;
  var small = W < 300;

  /* Lap and position get their own panels. Sharing one put "1/3" and "6/6"
     four pixels apart — narrower than a single stroke of the font at this
     scale — so they read as the one number "1/36/6". The gap between two
     panels is what tells them apart; a wider margin alone would not. */
  var lap = Math.min(p.lapsDone + 1, this.laps());
  var boxW = textWidth('0/0', 2) + 6;      /* value width plus 3px each side */
  var boxGap = 5;

  this.panel(3, 3, boxW, 25);
  drawText(g, 'LAP', 6, 6, 1, C_PAPAYA, C_SHADOW);
  drawText(g, lap + '/' + this.laps(), 6, 15, 2, C_WHITE, C_SHADOW);

  var posX = 3 + boxW + boxGap;
  this.panel(posX, 3, boxW, 25, C_CYAN);
  drawText(g, 'POS', posX + 3, 6, 1, C_CYAN, C_SHADOW);
  drawText(g, p.position + '/' + this.cars.length, posX + 3, 15, 2, C_WHITE, C_SHADOW);

  /* timing tower */
  var tw = 78;
  this.panel(W - tw - 3, 3, tw, 34, C_CYAN);
  drawText(g, 'TIME', W - tw, 6, 1, C_CYAN, C_SHADOW);
  drawTextRight(g, fmtTime(p.started ? this.raceTime - p.lapStart : 0), W - 6, 13, 1, C_WHITE, C_SHADOW);
  drawText(g, 'BEST', W - tw, 22, 1, C_CYAN, C_SHADOW);
  drawTextRight(g, p.bestLap ? fmtTime(p.bestLap) : '--.---', W - 6, 29, 1, C_WHITE, C_SHADOW);

  /* split flash */
  if (this.splitShow > 0 && this.splitText) {
    var alpha = clamp(this.splitShow / 0.5, 0, 1);
    g.globalAlpha = alpha;
    var sw = textWidth(this.splitText, 2, 1) + 10;
    this.panel(W - sw - 3, 40, sw, 15, this.splitGood ? C_GREEN : C_RED);
    drawText(g, this.splitText, W - sw + 2, 44, 2, this.splitGood ? C_GREEN : C_RED, C_SHADOW);
    g.globalAlpha = 1;
  }

  /* speed + gear */
  var kph = Math.round(p.speedKph());
  var sx = W - 4, sy = H - 42;
  drawTextRight(g, 'KM/H', sx, sy - 9, 1, C_PAPAYA, C_SHADOW);
  drawTextRight(g, String(kph), sx, sy, 5, C_WHITE, C_SHADOW);
  drawTextRight(g, 'GEAR ' + p.gear(), sx, sy + 38, 1, C_CYAN, C_SHADOW);

  /* rev bar */
  var rw = 118, rh = 6, rx = W - rw - 4, ry = H - 7;
  g.fillStyle = 'rgba(10,10,14,0.75)';
  g.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
  var rpm = p.rpm01();
  var lit = Math.round(rw * rpm);
  for (var b = 0; b < lit; b += 3) {
    var f = b / rw;
    g.fillStyle = f > 0.86 ? C_RED : (f > 0.66 ? C_PAPAYA : C_PAPAYA_DK);
    g.fillRect(rx + b, ry, 2, rh);
  }

  /* DRS */
  if (this.inDrsZone(p)) {
    var on = p.drsActive;
    var dw = 34;
    this.panel(W - dw - 100, H - 20, dw, 13, on ? C_GREEN : C_PAPAYA);
    drawText(g, 'DRS', W - dw - 96, H - 16, 1, on ? C_GREEN : C_WHITE, C_SHADOW);
  }

  var mapSize = small ? 62 : 86;
  this.drawMinimap(4, H - mapSize - 4, mapSize, mapSize, false);

  /* the corner you are arriving at */
  var cname = this.track.cornerLabel[p.frameIdx];
  if (cname) {
    drawText(g, cname, 6, H - mapSize - 15, 1, C_PAPAYA, C_SHADOW);
  }

  /* off-track warning */
  if (p.offTrack && p.vFwd > 8) {
    if (Math.floor(this.time * 4) % 2 === 0) {
      drawTextCenter(g, 'TRACK LIMITS', W / 2, H - 52, 1, C_RED, C_SHADOW);
    }
  }

  /* countdown + banner messages */
  if (this.state === STATE.COUNTDOWN) {
    var c = this.countdown;
    var label = c < 4.6 ? 'GET READY' : 'GO';
    var sc = c < 4.6 ? 2 : 4;
    drawTextCenter(g, label, W / 2, H / 2 - 30, sc, c < 4.6 ? C_WHITE : C_GREEN, C_SHADOW);
    if (c < 4.6) {
      var lightsOn = Math.min(5, Math.floor(Math.max(0, c - 0.7) / 0.8) + (c >= 0.7 ? 1 : 0));
      for (var li = 0; li < 5; li++) {
        var lx = W / 2 - 34 + li * 14;
        g.fillStyle = li < lightsOn ? '#ff2b1c' : 'rgba(60,26,24,0.85)';
        g.fillRect(lx, H / 2 - 8, 10, 10);
        g.fillStyle = C_SHADOW;
        g.fillRect(lx, H / 2 + 2, 10, 1);
      }
    }
  }

  if (this.message && this.messageT > 0) {
    var a2 = clamp(this.messageT / 0.6, 0, 1);
    g.globalAlpha = a2;
    drawTextCenter(g, this.message, W / 2, this.state === STATE.COUNTDOWN ? H / 2 + 22 : H / 2 - 40, 3, C_PAPAYA, C_SHADOW);
    g.globalAlpha = 1;
  }

  if (this.paused) {
    g.fillStyle = 'rgba(8,8,12,0.55)';
    g.fillRect(0, 0, W, H);
    drawTextCenter(g, 'PAUSED', W / 2, H / 2 - 10, 3, C_PAPAYA, C_SHADOW);
    drawTextCenter(g, 'PRESS P TO RESUME', W / 2, H / 2 + 14, 1, C_WHITE, C_SHADOW);
  }
  this.drawNotice();
};

/* Overhead circuit map. North-up and never rotated — a map you can learn is
   worth more than one that spins with the car. */
Game.prototype.drawMinimap = function (x, y, w, h, showTitleCar) {
  var g = this.hud, t = this.track, b = this.mapBounds;
  var spanX = b.maxX - b.minX, spanZ = b.maxZ - b.minZ;
  var pad = 7;
  var sc = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  var ox = x + (w - spanX * sc) / 2;
  var oy = y + (h - spanZ * sc) / 2;
  var i, p, px, py;

  function mx(wx) { return ox + (wx - b.minX) * sc; }
  function my(wz) { return oy + (wz - b.minZ) * sc; }

  g.fillStyle = 'rgba(12,13,18,0.74)';
  g.fillRect(x, y, w, h);
  g.fillStyle = C_PAPAYA;
  g.fillRect(x, y, w, 1);

  /* the circuit as a continuous ribbon, wide enough to read at a glance */
  g.strokeStyle = 'rgba(232,232,238,0.92)';
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  for (i = 0; i <= t.n; i += 2) {
    p = t.p[i % t.n];
    px = mx(p.x); py = my(p.z);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.stroke();

  /* DRS zones picked out along the straights */
  g.strokeStyle = C_CYAN;
  g.lineWidth = 2;
  for (var z = 0; z < t.drsZones.length; z++) {
    var a = t.drsZones[z][0], bb = t.drsZones[z][1];
    g.beginPath();
    var steps = (bb - a + t.n) % t.n;
    for (i = 0; i <= steps; i += 2) {
      p = t.p[(a + i) % t.n];
      px = mx(p.x); py = my(p.z);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }

  /* start/finish */
  var sp = t.p[t.startIndex], sl = t.lat[t.startIndex];
  g.strokeStyle = C_PAPAYA;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(mx(sp.x - sl.x * 26), my(sp.z - sl.z * 26));
  g.lineTo(mx(sp.x + sl.x * 26), my(sp.z + sl.z * 26));
  g.stroke();

  for (var c = this.cars.length - 1; c >= 0; c--) {
    var v = this.cars[c];
    var cx = Math.round(mx(v.pos.x));
    var cy = Math.round(my(v.pos.z));
    var isFocus = showTitleCar ? (v === this.demoCar) : v.isPlayer;
    if (isFocus) {
      g.fillStyle = C_SHADOW; g.fillRect(cx - 3, cy - 3, 7, 7);
      g.fillStyle = C_PAPAYA; g.fillRect(cx - 2, cy - 2, 5, 5);
    } else {
      g.fillStyle = C_SHADOW; g.fillRect(cx - 2, cy - 2, 5, 5);
      g.fillStyle = '#' + ('00000' + v.livery.body.toString(16)).slice(-6);
      g.fillRect(cx - 1, cy - 1, 3, 3);
    }
  }
};

Game.prototype.drawTitle = function () {
  var g = this.hud, W = this.vw, H = this.vh;
  var pulse = 0.5 + 0.5 * Math.sin(this.time * 3.4);
  var small = W < 340;

  /* scrims top and bottom only — the demo footage stays clear in the middle */
  var top = g.createLinearGradient(0, 0, 0, H * 0.34);
  top.addColorStop(0, 'rgba(8,8,12,0.86)');
  top.addColorStop(1, 'rgba(8,8,12,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, Math.round(H * 0.34));

  var bot = g.createLinearGradient(0, H, 0, H * 0.60);
  bot.addColorStop(0, 'rgba(8,8,12,0.88)');
  bot.addColorStop(1, 'rgba(8,8,12,0)');
  g.fillStyle = bot;
  g.fillRect(0, Math.round(H * 0.60), W, H - Math.round(H * 0.60));

  var touch = this.isTouch();
  var titleScale = small ? 4 : 6;
  var ty = Math.round(H * 0.07);

  /* papaya slab behind the wordmark */
  var tw = textWidth('MCL-64', titleScale, 1);
  g.fillStyle = C_PAPAYA;
  g.fillRect(Math.round(W / 2 - tw / 2) - 6, ty - 5, tw + 12, GLYPH_H * titleScale + 10);
  g.fillStyle = C_SHADOW;
  g.fillRect(Math.round(W / 2 - tw / 2) - 6, ty + GLYPH_H * titleScale + 5, tw + 12, 2);
  drawTextCenter(g, 'MCL-64', W / 2, ty, titleScale, '#15161a', null);

  /* Names the circuit you are about to race, not a hard-coded one. */
  drawTextCenter(g, 'PAPAYA GRAND PRIX   ' + this.track.name + '   ' + this.track.laps + ' LAPS',
    W / 2, ty + GLYPH_H * titleScale + 14, 1, C_CYAN, C_SHADOW);

  /* attract-mode tag, top right */
  drawTextRight(g, 'DEMO', W - 6, 6, 1, pulse > 0.5 ? C_PAPAYA : '#6c5a48', C_SHADOW);

  /* On touch the bottom-right corner belongs to the DRS and CAM pads, so the
     circuit map moves out from under them. */
  var mapSize = small ? 58 : 78;
  if (touch) this.drawMinimap(5, Math.round(H * 0.055) + GLYPH_H * titleScale + 26, mapSize, mapSize, true);
  else this.drawMinimap(W - mapSize - 5, H - mapSize - 5, mapSize, mapSize, true);

  if (pulse > 0.35) {
    drawTextCenter(g, touch ? 'TAP START TO RACE' : 'PRESS ENTER TO RACE',
      W / 2, Math.round(H * (touch ? 0.50 : 0.60)), 2, C_WHITE, C_SHADOW);
  }

  var lines = touch
    ? [
      'DRAG ANYWHERE TO STEER',
      this.settings.autoThrottle
        ? 'AUTO THROTTLE - PULL BACK TO BRAKE'
        : 'PUSH UP FOR GAS, PULL BACK TO BRAKE',
      'STEER BUTTON: JOYSTICK / TILT / TILT INV'
    ]
    : [
      'ARROWS / WASD   STEER + THROTTLE',
      'SPACE HANDBRAKE    SHIFT DRS BOOST',
      /* Two rows rather than one, and the number that decides it is 300:
         resize() steps uiCss down until `cw / uiCss >= 300`, so 300 virtual
         units is the narrowest this HUD is ever drawn into and the width every
         label has to fit. The old single row measured 287 — deliberately just
         inside it. Appending H HALO would have made it 341, which fits on a
         wide monitor and runs off the edge of anything that reaches the floor.
         Two 27-character rows measure 161 each. */
      'C CAM   P PAUSE   R RESTART',
      'H HALO   N MUSIC   M ENGINE'
    ];
  /* keep clear of the START pad and the thumbstick on touch */
  var ly = touch ? Math.round(H * 0.60) : (H - 16 - lines.length * 9);
  for (var i = 0; i < lines.length; i++) {
    drawTextCenter(g, lines[i], W / 2, ly + i * 9, 1, i === 0 ? C_PAPAYA : '#a9a29b', C_SHADOW);
  }
  if (!touch) drawText(g, this.laps() + ' LAPS   ' + this.cars.length + ' CARS', 6, H - 11, 1, '#7d7772', C_SHADOW);
};

/* Single place that reflects auth state into the panel, driven by Cloud's
   watcher so it cannot drift from the real session. */
/* Four mutually exclusive states, one place that decides which is on screen:
   SIGN IN, CREATE ACCOUNT, CHECK YOUR EMAIL, SIGNED IN. Driven by Cloud's
   watcher so the UI cannot drift from the real session — the previous version
   showed an empty form to someone who had already registered. */
Game.prototype.paintAccount = function (c) {
  var el = function (id) { return document.getElementById(id); };
  var status = el('acct-status');
  var secIn = el('acct-signin'), secUp = el('acct-signup');
  var secPend = el('acct-pending'), secDone = el('acct-signed');
  if (!secIn || !secUp || !secPend || !secDone) return;

  if (!this.acctMode) this.acctMode = 'signin';

  var signedIn = c.status === 'signed-in';
  var pending = c.status === 'pending';

  secDone.hidden = !signedIn;
  secPend.hidden = !pending;
  secIn.hidden = signedIn || pending || this.acctMode !== 'signin';
  secUp.hidden = signedIn || pending || this.acctMode !== 'signup';

  /* Name the section after whatever is actually on screen. Without this both
     forms sat under a generic "LEADERBOARD" heading and were impossible to
     tell apart at a glance. */
  var head = el('acct-title');
  if (head) {
    head.textContent = signedIn ? 'YOUR ACCOUNT'
      : pending ? 'CHECK YOUR EMAIL'
      : (this.acctMode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN');
  }

  if (signedIn) {
    var who = (c.profile && c.profile.display_name) ? c.profile.display_name : 'your account';
    var nameEl = el('acct-name');
    if (nameEl) nameEl.textContent = who;
    if (status) status.textContent = 'Your race times will be posted to the global board.';
    return;
  }

  if (pending) {
    var to = el('acct-sentto');
    if (to) to.textContent = c.pendingEmail || 'your email';
    if (status) status.textContent = c.message || '';
    return;
  }

  if (status) {
    status.textContent = c.message ||
      'Sign in to post your race times. We will email you a link — no password.';
  }
};

/* Once you are signed in you are racing as yourself, not as the car. Falls
   back to the livery name for the AI, and for anyone not signed in. */
Game.prototype.carName = function (v) {
  if (v && v.isPlayer && this.cloud && this.cloud.profile && this.cloud.profile.display_name) {
    return this.cloud.profile.display_name.toUpperCase();
  }
  return v.livery.name;
};

/* RETRO is the 240p console look; MODERN supersamples, tone maps and drops
   the 5-bit quantise entirely. */
/* Switching circuit rebuilds the whole scene — road ribbon, barriers,
   scenery, grandstands — so it reloads rather than trying to dispose and
   rebuild in place. The session lives in localStorage, so nothing is lost,
   and the page is one file that loads in about a second.
   Unlock rules would go here: filter TRACKS by what the player has earned
   before picking the next one. */
/* Renders one row per circuit from the TRACKS registry, so a new entry in
   20-track.js appears here with no markup and no wiring.

   This replaced a single button that cycled to the next circuit and reloaded.
   With two circuits that was fine; at three or more you could not see what
   you were choosing — every look at the next name cost a full page reload,
   and you had to cycle all the way round to get back. */
Game.prototype.buildTrackList = function () {
  var self = this;
  /* Two rails, same widget, different consequence: picking in SETTINGS loads
     that circuit, picking in the LEADERBOARD only changes which board you are
     reading. Nobody should have to load Indianapolis to see its times. */
  this.buildTrackRail('set-track-list', function (id) { self.selectTrack(id); });
  this.buildTrackRail('board-track-list', function (id) {
    self.boardTrackId = id;
    self.syncTrackRail('board-track-list', id);
    self.loadBoard();
  });
  this.syncTrackList();
};

Game.prototype.buildTrackRail = function (hostId, onPick) {
  var host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';

  for (var i = 0; i < TRACKS.length; i++) {
    (function (def) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tracko';
      b.setAttribute('role', 'radio');
      b.dataset.trackId = def.id;

      var name = document.createElement('span');
      name.className = 'tracko-name';
      name.textContent = def.name;

      var meta = document.createElement('span');
      meta.className = 'tracko-meta';
      meta.textContent = def.laps + ' laps · ' + (def.blurb || 'full grid');

      b.appendChild(name);
      b.appendChild(meta);

      b.addEventListener('click', function (e) {
        e.preventDefault();
        onPick(def.id);
      });
      host.appendChild(b);
    })(TRACKS[i]);
  }
};

/* Marks the current circuit. Called from applySettings too, so the list is
   right whenever the panel opens rather than only when it is first built. */
Game.prototype.syncTrackList = function () {
  this.syncTrackRail('set-track-list', this.settings.trackId || (this.track && this.track.def.id));
  this.syncTrackRail('board-track-list', this.boardTrackId || this.trackVersion());
};

Game.prototype.syncTrackRail = function (hostId, current) {
  var host = document.getElementById(hostId);
  if (!host) return;
  var rows = host.children, sel = null;
  for (var i = 0; i < rows.length; i++) {
    var on = rows[i].dataset.trackId === current;
    rows[i].setAttribute('aria-checked', on ? 'true' : 'false');
    rows[i].tabIndex = on ? 0 : -1;
    if (on) sel = rows[i];
  }

  /* Centre the current circuit in the rail. Deliberately NOT
     scrollIntoView(): that walks every scrollable ancestor, so it would drag
     the settings panel — and on some browsers the page behind it — rather
     than just sliding this one strip. Setting scrollLeft moves the rail and
     nothing else. */
  /* Bring the selected card flush to the left edge. The browser clamps this
     at the end of the rail, which lands the last card flush RIGHT — either
     way it is fully visible, which matters more than being centred, and it
     lines up exactly with a scroll-snap-align:start snap point so the snap
     does not drag it somewhere else afterwards. */
  /* Measured against the RAIL, via rects. offsetLeft resolves against the
     nearest positioned ancestor, which here is the settings panel rather than
     this strip, so using it scrolls by the wrong origin and the card lands
     anywhere. The rect delta is what actually has to be taken up. */
  if (sel) {
    host.scrollLeft += sel.getBoundingClientRect().left - host.getBoundingClientRect().left;
  }
};

Game.prototype.selectTrack = function (id) {
  if (id === this.settings.trackId) return;          /* already on it */
  var def = null;
  for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) def = TRACKS[i];
  if (!def) return;

  this.settings.trackId = id;
  this.saveSettings();
  this.syncTrackList();
  this.flash('LOADING ' + def.name);
  /* let the flash paint before the navigation stalls the frame */
  var self = this;
  setTimeout(function () { self.carryTier(); location.reload(); }, 220);
};

/* Puts the tier in settings.quality on the screen. Everything a tier decides
   comes from its row of TIERS, and each of the three big concerns has its own
   method, which undoes what the last tier set up and sets up its own. */
Game.prototype.applyQuality = function () {
  var tier = TIERS[this.settings.quality];
  this.tierOn = this.settings.quality;

  /* Tone mapping itself is in the post node, which buildTarget builds for the
     tier; the node reads the exposure from here. The renderer's own
     toneMapping stays off (see buildRenderer), so no material's shader holds
     any tone mapping, and a change of tier no longer has to rebuild every
     material in the scene as it did on r128. */
  this.renderer.toneMappingExposure = tier.exposure;
  this.applyHaze(tier.toneMapping !== 'none');

  /* The canvas rule. renderer.setSize multiplies by this ratio, so resize
     (below) gives a canvas of the render target times the device pixel ratio
     for 'device', as buildRenderer sets it up and main has always had it,
     and a canvas the size of the render target for 'target'. */
  this.renderer.setPixelRatio(tier.canvas === 'target' ? 1 : (window.devicePixelRatio || 1));

  this.applyShadowMode(tier.shadows);   /* 'blob' | 'single' | 'cascades': the shadows */
  this.applySkyMode(tier.sky);          /* 'dome' | 'physical': the sky and time of day */
  this.applyPostMode(tier.post);        /* 'retro' | 'grade' | 'full': the bloom and grading */

  /* The page's scanline and glow layers. `display`, because photo hides the
     same two layers through `visibility` and the two must not undo each
     other. */
  var layers = this.host.querySelectorAll('.scanlines, .glow');
  for (var li = 0; li < layers.length; li++) layers[li].style.display = tier.overlays ? '' : 'none';

  this.resize();
};

/* The tiers the Graphics button steps through, in order, on every device:
   the ruling that kept Ultra off touch devices until it had been run on a
   phone was lifted on 24 Nov 2026, when the owner ran it on his. */
Game.prototype.tierCycle = function () {
  var out = [];
  for (var name in TIERS) {
    if (TIERS.hasOwnProperty(name)) out.push(name);
  }
  return out;
};

/* THE PLAYER PICKS A TIER (the Graphics button). The button and its hint
   say the new tier at once, and nothing else happens until the clicks have
   stopped for TIER_SETTLE_MS: a tier that was only passed through on the way
   to another is never built and never saved. */
Game.prototype.chooseTier = function (name) {
  var self = this;
  this.settings.quality = name;
  this.applySettings();
  this.flash(TIER_UI[name].flash);
  if (this.tierTimer) clearTimeout(this.tierTimer);
  this.tierTimer = setTimeout(function () { self.tierTimer = null; self.commitTier(); }, TIER_SETTLE_MS);
};

/* The clicks have stopped. A heavy tier goes on trial before it is built:
   the key is in storage first, so a build that takes the tab down with it
   leaves the key behind (see TIER_TRIAL_KEY). The settings are saved after,
   not before: a build that throws saves nothing. */
Game.prototype.commitTier = function () {
  var name = this.settings.quality;
  if (name !== this.tierOn) {
    var heavy = TIERS[name].heavy;
    this.trialLeft = heavy ? TIER_TRIAL_FRAMES : 0;
    tierTrialWrite(heavy ? name : null);
    this.applyQuality();
  }
  /* the tier the clicks ended on is the player's own from here on */
  this.settings.tierChosen = true;
  this.saveSettings();
};

/* Called by the frame loop for every frame it has drawn. The frame that
   ends a trial takes the key away: the tier is trusted from then on. */
Game.prototype.countFrame = function () {
  if (this.trialLeft > 0 && --this.trialLeft === 0) tierTrialWrite(null);
};

/* Called by the frame loop with the gap since the frame before, in
   milliseconds (see PACE). It is given the gap and reads no clock, and it is
   never called from tick: the simulation knows nothing of it. Every frame of
   a heavy tier counts, from the first, whatever is on the screen: the title,
   the attract demo, a race, the results. In a pause or with the page hidden
   the count starts again.

   It steps down ONCE in a load. A player who picks the heavy tier again has
   chosen it, and is not argued with a second time in that load; the load
   after it watches again. (A browser that something holds back looks the
   same from here as a device that cannot keep up. The limit is set clear
   of the common case, a cap at 30 frames a second, but the guard can still
   be wrong, and must not be able to be wrong over and over.)

   What it gives up is saved, so the device stays stepped down, and it is
   saved as the game's pick and not the player's (storeSettings). A player
   who had picked the tier is told why it went. One who was given it is not:
   a race that is running flashes the new tier's name, and that is all. */
Game.prototype.watchPace = function (gapMs) {
  if (this.paceDone || this.paused || document.hidden || this.tierTimer || !this.tierOn || !TIERS[this.tierOn].heavy) {
    this.paceMean = 0;
    this.paceSlow = 0;
    this.paceLong = 0;
    return;
  }
  if (!(gapMs > 0)) return;
  /* a long gap is left out while it stands alone, and counts once it is
     plainly how this device draws (see PACE) */
  if (gapMs > PACE.ignoreMs) {
    if (++this.paceLong <= PACE.ignoreRun) return;
    gapMs = PACE.ignoreMs;
  } else {
    this.paceLong = 0;
  }
  this.paceMean = this.paceMean > 0
    ? this.paceMean + (gapMs - this.paceMean) * Math.min(1, gapMs / PACE.meanMs)
    : gapMs;
  if (this.paceMean <= PACE.slowMs) { this.paceSlow = 0; return; }
  this.paceSlow += gapMs;
  if (this.paceSlow < PACE.forMs) return;

  var chosen = this.settings.tierChosen;
  this.paceDone = true;
  this.paceMean = 0;
  this.paceSlow = 0;
  this.paceLong = 0;
  this.settings.quality = TIER_SAFE;
  this.settings.tierChosen = false;
  this.trialLeft = 0;
  tierTrialWrite(null);
  this.applyQuality();
  this.applySettings();
  this.storeSettings();
  if (chosen) this.notify(PACE_SAID);
  else this.flash(TIER_UI[TIER_SAFE].flash);
};

/* The graphics device has gone (boot's onDeviceLost). If a heavy tier was on,
   the next load must not go straight back into it. */
Game.prototype.tierLost = function () {
  if (this.tierTimer) { clearTimeout(this.tierTimer); this.tierTimer = null; }
  if (this.tierOn && TIERS[this.tierOn].heavy) tierTrialWrite(this.tierOn + ' lost');
};

/* The game is about to reload the page itself. A tier that is clicked to
   and not yet built, or built and still on trial, has not failed: it is
   marked untried, so the load that follows starts its trial again and does
   not take the key for a failure. */
Game.prototype.carryTier = function () {
  if (!this.tierTimer && !(this.trialLeft > 0)) return;
  var name = this.settings.quality;
  tierTrialWrite(TIERS[name].heavy ? name + ' untried' : null);
};

/* Sets the time of day by name (one of TIME_OF_DAY_NAMES), saves it, and has
   the picture follow. Anything else is refused. */
Game.prototype.setTimeOfDay = function (name) {
  if (TIME_OF_DAY_NAMES.indexOf(name) < 0) throw new Error('unknown time of day ' + name);
  this.settings.timeOfDay = name;
  this.saveSettings();
  this.applyTimeOfDay();
};

Game.prototype.isTouch = function () {
  return document.documentElement.classList.contains('has-touch');
};

/* Drives the CSS that hides the START pad and the rotate nudge once you are
   actually driving. Only touches the DOM when the state changes. */
Game.prototype.syncUiState = function () {
  var racing = this.state === STATE.RACING || this.state === STATE.COUNTDOWN;
  if (this.uiRacing === racing) return;
  this.uiRacing = racing;
  document.documentElement.classList.toggle('racing', racing);
};

Game.prototype.drawResults = function () {
  var g = this.hud, W = this.vw, H = this.vh;
  g.fillStyle = 'rgba(10,10,14,0.80)';
  g.fillRect(0, 0, W, H);

  var pw = Math.min(W - 16, 220);
  var px = Math.round((W - pw) / 2);
  var py = 12;

  g.fillStyle = C_PAPAYA;
  g.fillRect(px, py, pw, 12);
  drawText(g, 'RACE RESULT', px + 4, py + 3, 1, '#15161a', null);

  var rows = this.order || this.cars;

  /* F1 convention: the winner gets an absolute time, everyone else the gap
     to them. Only a car that never crossed the line is a DNF. */
  var winner = null;
  for (var wi = 0; wi < rows.length; wi++) {
    var c = rows[wi];
    if (c.finished && (!winner || c.finishTime < winner.finishTime)) winner = c;
  }

  var y = py + 18;
  for (var i = 0; i < rows.length; i++) {
    var v = rows[i];
    var isP = v.isPlayer;
    if (isP) { g.fillStyle = 'rgba(255,128,0,0.20)'; g.fillRect(px, y - 2, pw, 11); }
    var col = isP ? C_PAPAYA : C_WHITE;
    drawText(g, String(i + 1), px + 4, y, 1, col, C_SHADOW);
    g.fillStyle = '#' + ('00000' + v.livery.body.toString(16)).slice(-6);
    g.fillRect(px + 13, y, 3, 7);
    drawText(g, this.carName(v), px + 20, y, 1, col, C_SHADOW);
    var label;
    if (!v.finished) label = 'DNF';
    else if (winner && v !== winner) {
      /* "+0.816", not "+00.816" — a sub-minute gap keeps no leading zero. */
      var gap = fmtTime(v.finishTime - winner.finishTime);
      if (gap.charAt(0) === '0' && gap.indexOf(':') === -1) gap = gap.slice(1);
      label = '+' + gap;
    }
    else label = fmtTime(v.finishTime);
    drawTextRight(g, label, px + pw - 4, y, 1, isP ? C_PAPAYA : '#a9a29b', C_SHADOW);
    y += 11;
  }

  y += 4;
  g.fillStyle = 'rgba(79,227,224,0.85)';
  g.fillRect(px, y, pw, 1);
  y += 5;
  drawText(g, 'YOUR BEST LAP', px + 4, y, 1, C_CYAN, C_SHADOW);
  drawTextRight(g, this.player.bestLap ? fmtTime(this.player.bestLap) : '--.---', px + pw - 4, y, 1, C_WHITE, C_SHADOW);

  var posted = this.boardResultLine();
  if (posted) {
    var col = this.boardResult && this.boardResult.state === 'posted' ? C_PAPAYA : '#a9a29b';
    drawTextCenter(g, posted, W / 2, H - 28, 1, col, C_SHADOW);
  }

  if (0.5 + 0.5 * Math.sin(this.time * 3.4) > 0.35) {
    drawTextCenter(g, this.isTouch() ? 'TAP START TO RACE AGAIN' : 'PRESS ENTER TO RACE AGAIN',
      W / 2, H - 16, 1, C_WHITE, C_SHADOW);
  }
};

/* --- frame -------------------------------------------------------------- */

Game.prototype.render = function (dt) {
  this.syncUiState();
  this.updateCamera(dt, false);

  /* drift the clouds; nothing else in the sky moves */
  if (this.scenery && this.scenery.clouds) this.scenery.clouds.rotation.y += dt * 0.004;

  var fade = 1;
  if (this.state === STATE.COUNTDOWN && this.countdown < 0.6) fade = clamp(this.countdown / 0.6, 0, 1);
  this.drawFrame(fade);

  if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) this.notice = ''; }
  this.drawHUD();
};

Game.prototype.updateAudio = function () {
  var demo = this.state === STATE.TITLE;
  var p = demo ? this.demoCar : this.player;
  var alive = demo || this.state === STATE.RACING || this.state === STATE.COUNTDOWN;
  var load = demo ? 0.75 : this.input.throttle;
  var scrub = clamp(p.drift * 0.9 + (p.offTrack && p.vFwd > 10 ? 0.35 : 0), 0, 1);
  this.audio.update(p.rpm01(), load, clamp(p.vFwd / V_MAX, 0, 1), scrub, alive && !this.paused);

  /* Music sits up front on the menus and drops back under the engines while
     you are actually driving. */
  var level = 0.30;
  if (this.state === STATE.RACING) level = 0.13;
  else if (this.state === STATE.COUNTDOWN) level = 0.20;
  if (this.paused) level = 0.06;
  this.audio.tickMusic(level);
};

/* --- photo and bench hooks ----------------------------------------------
   For tools/stills.js and tools/bench.js only; nothing in the game's own UI
   reaches them. They are the camera every later change to the picture is
   judged with, so the one property that matters is that the same arguments
   always give the same frame.

   Neither touches the simulation's code. photo swaps the player's input
   source on THIS INSTANCE for the length of its run (the switch the attract
   demo already makes for every car), and puts the prototype's back after. */

var PHOTO_CAMS = ['chase', 'helmet', 'grid', 'high', 'apex', 'stands'];

/* The most ticks photo will run: 20 minutes of racing at 60 Hz, the same cap
   test/sim-parity.test.js puts on a race. Every tick runs inside one call,
   so without a top end a mistyped figure would hang the page. */
var PHOTO_TICK_MAX = 72000;

/* Circuit and tier for a hook. A circuit is only ever built at boot, so a
   different one is saved and the page reloaded, exactly as the settings
   picker does it; the caller sees a rejection and calls again once the page
   has loaded. Returns false when that reload is under way. */
Game.prototype.hookSelect = function (circuit, quality) {
  if (circuit && trackById(circuit).id !== circuit) throw new Error('unknown circuit ' + circuit);
  if (quality && !(typeof quality === 'string' && TIERS.hasOwnProperty(quality))) throw new Error('unknown quality ' + quality);
  if (circuit && circuit !== this.track.def.id) {
    this.settings.trackId = circuit;
    if (quality) this.settings.quality = quality;
    this.saveSettings();
    this.carryTier();
    location.reload();
    return false;
  }
  if (quality && (quality !== this.settings.quality || quality !== this.tierOn)) {
    this.settings.quality = quality;
    this.applyQuality();
  }
  return true;
};

/* A point on the track at arc length s from the sample origin, interpolated
   between samples so "30 m past the line" means 30 m and not the nearest
   sample to it (they are 3 to 6 m apart). */
Game.prototype.photoPointAtS = function (s, lateral, out) {
  var t = this.track, n = t.n, len = t.length;
  s = ((s % len) + len) % len;
  var lo = 0, hi = n;
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (t.cum[mid] <= s) lo = mid; else hi = mid; }
  var f = (s - t.cum[lo]) / (t.cum[lo + 1] - t.cum[lo]);
  var a = t.pointAt(lo, lateral, new THREE.Vector3());
  var b = t.pointAt((lo + 1) % n, lateral, new THREE.Vector3());
  return out.copy(a).lerp(b, f);
};

/* The four fixed cameras. Every one is derived from the circuit's own data,
   so it lands in the same place on every circuit that has the feature. */
Game.prototype.placePhotoCamera = function (name) {
  var t = this.track, n = t.n, si = t.startIndex, sS = t.cum[si];
  var eye = new THREE.Vector3(), at = new THREE.Vector3(), fov = 50;

  if (name === 'grid') {
    /* 3 m above the road's right hand edge (lateral -HALF_W, the side away
       from the pit boards), 30 m past the line, looking back at the middle
       row of the grid resetRace lays out. */
    this.photoPointAtS(sS + 30, -HALF_W, eye);
    eye.y += 3;
    var cols = (t.def && t.def.gridCols) || 2;
    var rows = Math.ceil(this.cars.length / cols);
    var gi = (si - 5 - Math.round(3 * (rows - 1) / 2) + n) % n;
    t.pointAt(gi, 0, at);
    at.y += 0.6;
    fov = 50;
  } else if (name === 'high') {
    /* 70 m straight up from the line, looking at the far end of the main
       straight (the straight the line sits on). */
    t.pointAt(si, 0, eye);
    eye.y += 70;
    var main = t.straights[0];
    t.pointAt((main.start + main.count) % n, 0, at);
    fov = 55;
  } else if (name === 'apex') {
    /* The first named corner after the line that has a kerb (the mesh only
       lays kerbs where |curv| > 0.0026), 1.2 m above the middle of the inside
       kerb, looking back up the road 80 m. */
    var corner = null, best = Infinity;
    for (var c = 0; c < t.corners.length; c++) {
      var ci = t.corners[c].index;
      var d = (ci - si + n) % n;
      if (d > 0 && d < best && Math.abs(t.curv[ci]) > 0.0026) { best = d; corner = ci; }
    }
    if (corner === null) corner = (si + Math.round(n / 4)) % n;
    var inner = t.curv[corner] > 0 ? 1 : -1;
    t.pointAt(corner, inner * (HALF_W + 0.8), eye);
    eye.y += 1.2;
    this.photoPointAtS(t.cum[corner] - 80, 0, at);
    at.y += 1.0;
    this.photoApex = t.corners.filter(function (k) { return k.index === corner; }).map(function (k) { return k.name; })[0] || null;
    fov = 50;
  } else if (name === 'stands') {
    /* The top row of the main grandstand: the one nearest the line. These
       figures mirror buildScenery and buildStandRing; if either moves its
       stands, this has to move with it. */
    var side = -1, idx, rowOff, rowY;
    if (t.def.standRing) {
      /* outer ring (side -1): seats climb from 1.4 m at WALL_HALF + 14 to
         15 m at 19 m further out. Sit 1.5 m in from the back. */
      idx = si;
      var near = WALL_HALF + 14, far = near + 19;
      rowOff = far - 1.5;
      rowY = groundY(t, idx, side * rowOff) + 1.4 + (15.0 - 1.4) * ((rowOff - near) / (far - near)) + 0.6;
    } else {
      /* stand s = 1 of buildScenery: index start - 3, side -1. Its crowd
         panel is 10.5 m tall, centred 5.4 m up at WALL_HALF + 11.8, raked
         back 0.42 rad, so the top row is 2.14 m further out and 4.79 m
         higher than the centre. Sit just in front of it, under the roof. */
      idx = (si - 3 + n) % n;
      var cd = WALL_HALF + 20 - 8.2;
      rowOff = cd + 5.25 * Math.sin(0.42) - 0.3;
      rowY = groundY(t, idx, side * cd) + 5.4 + 5.25 * Math.cos(0.42) + 0.45;
    }
    t.pointAt(idx, side * rowOff, eye);
    eye.y = rowY;
    /* across the track: the far edge of the road, square to the stand */
    t.pointAt(idx, -side * HALF_W, at);
    fov = 50;
  }

  this.camera.position.copy(eye);
  this.camera.near = 0.6;
  this.camera.fov = fov;
  this.camera.lookAt(at);
  this.camera.updateProjectionMatrix();
  this.sky.position.set(eye.x, 0, eye.z);
  /* the wide shadows are laid out from the camera, and it has just moved */
  this.shadowRig.update();
};

/* Why a camera cannot be placed on the loaded circuit, or '' when it can.
   Only `stands` depends on scenery. buildScenery lays the stands by the line
   on every circuit except Monaco, and a standRing circuit has the ring
   instead; Monaco has neither, so there is no top row to sit in and the
   camera would hang in the air over the street. This mirrors the conditions
   in buildScenery: if a circuit gains or loses its stands there, change it
   here too. tools/stills.js looks for the words "is not available at". */
Game.prototype.photoCamMissing = function (name) {
  var t = this.track;
  if (name === 'stands' && !t.def.standRing && t.id === 'monaco-gp-v1') {
    return 'camera stands is not available at ' + t.id + ': the circuit has no main grandstand';
  }
  return '';
};

/* MCL64.photo({ circuit, tick, cam, quality, timeOfDay }) -> Promise<void>
 *
 * Starts a real race (grid, countdown and all), drives the player with the
 * demo driver for exactly `tick` sim ticks without drawing, places camera
 * `cam`, and draws ONE frame with the HUD hidden. The frame loop is then held
 * so nothing draws over it before it is captured: the game is left frozen
 * afterwards, and needs a reload to be played. `timeOfDay`, when given, is
 * set and saved through setTimeOfDay before the frame is drawn; an unknown
 * name is refused before the game is touched. `tick` must be a finite whole number from 0 to PHOTO_TICK_MAX; anything
 * else is refused before the game is touched.
 *
 * Everything that would otherwise carry history into the frame is pinned:
 * the visual state on each car is reset to what a new Vehicle has, cars are
 * synced at alpha 1 after every tick as a 60 Hz display would, the camera is
 * snapped rather than damped, the countdown fade is forced to full, the
 * clouds are set from the tick count instead of drifting on wall clock time,
 * and the halo is put back to the game's default (hidden) whatever H did
 * earlier.
 *
 * THE RACE IS NEVER POSTED. It is a real race driven by the demo driver, and
 * tick() sends a finished race to the leaderboard. So submitRace is switched
 * off for the length of the run, and a `tick` past the end of the race is
 * refused: that also keeps the count exact, because settleField would
 * otherwise run thousands of further ticks inside one call. A photo that
 * fails after it has started puts the game back on the title, so the frame
 * loop is not left held and no half run race is left for it to finish. */
Game.prototype.photo = function (opts) {
  var o = opts || {};
  var self = this;
  var held = false;
  try {
    var cam = o.cam || 'chase';
    if (PHOTO_CAMS.indexOf(cam) < 0) throw new Error('unknown camera ' + cam);
    var ticks = o.tick == null ? 900 : o.tick;
    if (typeof ticks !== 'number' || !isFinite(ticks) || Math.floor(ticks) !== ticks || ticks < 0 || ticks > PHOTO_TICK_MAX) {
      throw new Error('tick must be a whole number from 0 to ' + PHOTO_TICK_MAX);
    }
    if (o.timeOfDay != null && TIME_OF_DAY_NAMES.indexOf(o.timeOfDay) < 0) throw new Error('unknown time of day ' + o.timeOfDay);
    if (!this.hookSelect(o.circuit, o.quality)) {
      return Promise.reject(new Error('MCL64.photo: reloading to load ' + o.circuit + '; call again once the page has loaded'));
    }
    var missing = this.photoCamMissing(cam);
    if (missing) return Promise.reject(new Error('MCL64.photo: ' + missing));
    if (o.timeOfDay != null) this.setTimeOfDay(o.timeOfDay);

    this.photoHold = true;
    held = true;

    /* beginRace, less the audio wake and the fullscreen request */
    this.resetRace(false);
    this.startTrace();
    this.state = STATE.COUNTDOWN;
    this.countdown = 0;
    this.paused = false;
    this.input.keyDrs = false;
    this.shake = 0;
    for (var c = 0; c < this.cars.length; c++) { this.cars[c].steerVis = 0; this.cars[c].wheelSpin = 0; }
    this.haloVisible = false;
    this.applyHalo();

    /* The demo driver's output, through the same quantiser playerInput ends
       with, in place of the keyboard. */
    var drive = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this.playerInput = function (dt) {
      var a = self.demoAI.update(dt, self.cars, self.time);
      drive.steer = Math.round(clamp(a.steer, -1, 1) * 127) / 127;
      drive.throttle = Math.round(clamp(a.throttle, 0, 1) * 255) / 255;
      drive.brake = Math.round(clamp(a.brake, 0, 1) * 255) / 255;
      drive.handbrake = 0;
      return drive;
    };
    /* Shadowed the same way, so tick() itself stays untouched. The check in
       the loop means tick() never gets as far as calling it; this is the
       second lock on the same door. */
    this.submitRace = function () {};
    try {
      for (var k = 0; k < ticks; k++) {
        if (this.player.finished) {
          throw new Error('tick is past the end of the race: the player finished after ' + k + ' of ' + ticks + ' ticks');
        }
        this.tick(STEP);
        for (c = 0; c < this.cars.length; c++) this.cars[c].sync(STEP, 1);
      }
    } finally {
      delete this.playerInput;
      delete this.submitRace;
    }

    var keepMode = this.camMode;
    this.camMode = cam === 'helmet' ? 2 : 0;
    this.updateCamera(0, true);
    if (cam !== 'chase' && cam !== 'helmet') this.placePhotoCamera(cam);
    this.camMode = keepMode;
    /* The wide shadows hold a layout a little past the field of view it was
       made for (SHADOW_FOV_HOLD in 33-shadows.js). A still lays them out
       afresh, so that it shows the same shadows whatever camera the page
       had before it. */
    this.shadowRig.update(true);

    if (this.scenery && this.scenery.clouds) this.scenery.clouds.rotation.y = ticks * STEP * 0.004;

    this.syncUiState();
    /* The game picture only: the HUD and the page's own scanline and glow
       layers are hidden, so a still measures the renderer and nothing the
       page lays over it. Not restored; see above. */
    this.hudCanvas.style.visibility = 'hidden';
    var layers = this.host.querySelectorAll('.scanlines, .glow');
    for (var li = 0; li < layers.length; li++) layers[li].style.visibility = 'hidden';
    this.drawFrame(1);
    return Promise.resolve();
  } catch (e) {
    /* Only when this call took the hold: a refusal before that leaves the page
       exactly as it was. resetRace(true) is the title, as bench leaves it, and
       it clears pendingResult and every car's finished flag, so nothing the
       demo driver did can be posted by the frame loop or by a later sign in. */
    if (held) {
      this.photoHold = false;
      this.hudCanvas.style.visibility = '';
      var hidden = this.host.querySelectorAll('.scanlines, .glow');
      for (var hi = 0; hi < hidden.length; hi++) hidden[hi].style.visibility = '';
      try { this.resetRace(true); } catch (ignore) { /* report the first error, not this one */ }
    }
    return Promise.reject(e);
  }
};

/* MCL64.bench({ circuit, quality, seconds, timeOfDay }) -> Promise<{ frames, avgMs, p95Ms }>
 *
 * Runs the attract demo and times the gaps between animation frames, which
 * is the frame time a player actually gets. The first second is a warm up
 * (shaders compile on the first frames after a tier change) and is not
 * counted. Releases a hold left by photo. `timeOfDay` is as photo takes it:
 * one of TIME_OF_DAY_NAMES, set and saved before the run, and anything else
 * is refused. It changes the picture in Ultra only.
 *
 * The step down guard (watchPace) is switched off for the rest of the load.
 * It watches the attract demo too, and a bench of Ultra on a machine too slow
 * for it would otherwise come back with Modern's frame times under Ultra's
 * name. */
Game.prototype.bench = function (opts) {
  var o = opts || {};
  try {
    var seconds = o.seconds > 0 ? o.seconds : 20;
    if (o.timeOfDay != null && TIME_OF_DAY_NAMES.indexOf(o.timeOfDay) < 0) throw new Error('unknown time of day ' + o.timeOfDay);
    if (!this.hookSelect(o.circuit, o.quality)) {
      return Promise.reject(new Error('MCL64.bench: reloading to load ' + o.circuit + '; call again once the page has loaded'));
    }
    if (o.timeOfDay != null) this.setTimeOfDay(o.timeOfDay);
    this.paceDone = true;
    this.photoHold = false;
    this.hudCanvas.style.visibility = '';
    this.resetRace(true);
  } catch (e) {
    return Promise.reject(e);
  }
  return new Promise(function (resolve) {
    var gaps = [], last = 0, start = 0;
    function step(now) {
      if (!start) start = now;
      if (now - start >= 1000) {
        if (last) gaps.push(now - last);
        last = now;
      }
      if (now - start < 1000 + seconds * 1000) { requestAnimationFrame(step); return; }
      var sum = 0;
      for (var i = 0; i < gaps.length; i++) sum += gaps[i];
      var sorted = gaps.slice().sort(function (a, b) { return a - b; });
      var p95 = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] : 0;
      resolve({
        frames: gaps.length,
        avgMs: gaps.length ? Math.round(sum / gaps.length * 100) / 100 : 0,
        p95Ms: Math.round(p95 * 100) / 100
      });
    }
    requestAnimationFrame(step);
  });
};

/* =========================================================================
   BOOT
   ========================================================================= */

(function boot() {
  /* First of all: from here on, every failure is this function's to report.
     The guard script at the head of the page (index.template.html) shows
     the panel for a page that never got this far, and stands down when it
     sees this. */
  window.MCL64_BOOTED = true;

  /* One line on the console so a build is identifiable from a devtools
     screenshot, without anyone opening the settings panel. */
  if (window.MCL64_BUILD) {
    var bb = window.MCL64_BUILD;
    console.log('MCL-64 ' + bb.version + ' (' + bb.channel + ') ' + bb.sha + ' ' + bb.branch + ' ' + bb.at);
  }
  var host = document.getElementById('screen');
  var fallback = document.getElementById('fallback');

  /* Every way the picture can fail once boot has begun ends here: the
     panel, with a sentence a player can act on. (A browser that cannot read
     the engine's script never gets to boot; the guard script in the
     template shows the same panel for it.) `lead` replaces the panel's own first line, which
     says the game could not start, for the one case where it had started. */
  function fail(msg, lead) {
    if (fallback) {
      fallback.style.display = 'flex';
      var d = document.getElementById('fallback-detail');
      if (d) {
        d.textContent = msg;
        var first = d.parentNode && d.parentNode.firstChild;
        if (lead && first && first.nodeType === 3) first.nodeValue = lead + ' ';
      }
    }
  }

  if (!window.THREE) { fail('The 3D library did not load.'); return; }

  /* `?renderer=webgl` in the address forces the WebGL 2 backend, for testing
     the fallback on a machine that has WebGPU. Left alone, the renderer picks
     WebGPU where the browser has it and the fallback where it does not. */
  var forceWebGL = /[?&]renderer=webgl(&|$)/.test(location.search || '');

  /* Probe before anything is built, so the failure is a message and not a
     stack trace. The game draws through WebGPU, or through WebGL 2 where
     there is none, so WebGL 2 is asked for only when it is going to be
     needed: the browser has no WebGPU, or the address forces the fallback. A
     browser that has WebGPU is not asked, because a context made here would
     only be thrown away.

     A browser can have navigator.gpu and still hand out no adapter (a GPU on
     its block list, or headless Chromium). The renderer finds that out
     inside init() and tries WebGL 2 by itself; if that is missing as well,
     init() rejects and the message comes from `cannotStart` below. */
  var hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu;
  if (forceWebGL || !hasWebGPU) {
    try {
      var probe = document.createElement('canvas');
      if (!probe.getContext('webgl2')) {
        fail(hasWebGPU
          ? 'WebGL 2 is unavailable in this browser. Try enabling hardware acceleration.'
          : 'This browser has neither WebGPU nor WebGL 2. Try enabling hardware acceleration, or a newer browser.');
        return;
      }
    } catch (e) {
      fail('WebGL 2 could not be initialised: ' + e.message);
      return;
    }
  }

  /* The engine's own words for a renderer that will not start are a line of
     its internals (with no WebGL 2 it is "Cannot read properties of null").
     They are kept, in brackets, because they are what a bug report needs,
     behind a sentence that says what happened. */
  function cannotStart(err) {
    fail('Neither WebGPU nor WebGL 2 could be started on this device. Try enabling hardware acceleration, or a newer browser. ('
      + (err && err.message ? err.message : String(err)) + ')');
    if (window.console) console.error(err);
  }

  /* The renderer cannot be used until init() has settled, and Game builds its
     whole world in its constructor, so the order is: make the renderer, wait,
     then make the game. Either step failing ends at the fallback panel. */
  var renderer;
  try {
    renderer = makeRenderer(forceWebGL);
  } catch (err0) {
    cannotStart(err0);
    return;
  }
  renderer.init().then(start, cannotStart);

  function start() {
    var game;
    try {
      game = new Game(host, renderer);
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
      if (window.console) console.error(err);
      return;
    }

    var loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';

    /* THE GPU CAN BE TAKEN AWAY MID RACE: the driver restarts, the laptop
       changes graphics card, the browser reclaims a context it thinks is
       idle. The engine then stops drawing and says so on the console and
       nowhere else, which leaves the last frame, or a black canvas, with the
       game still running underneath it. So a loss ends where every other
       failure of the picture ends: at the panel, with the race paused where
       it stood, the sound faded out and the frame loop stopped. Nothing is
       recovered. A reload is, and the panel says so.

       Two routes lead here, and both are needed. The engine calls
       renderer.onDeviceLost for a lost WebGL context and for a WebGPU device
       the system took away, but NOT for a device that was destroyed: its
       own watch on the device returns at once for that reason. (The engine
       destroys the device itself when it is disposed, which is presumably
       why.) A destroyed device stops the picture all the same, so the
       device's own promise is watched here too and sent down the same road.
       The engine's handler is called first in either case: it is what makes
       every later render() return at once. */
    var gone = false;
    var engineLost = renderer.onDeviceLost;
    renderer.onDeviceLost = function (info) {
      if (gone) return;
      gone = true;
      engineLost.call(renderer, info);
      game.tierLost();
      if (game.state === STATE.RACING || game.state === STATE.COUNTDOWN) game.paused = true;
      /* `ready` off as well, so a key press cannot wake the sound again
         over a picture that is not coming back */
      if (game.audio.ready) {
        game.audio.master.gain.setTargetAtTime(0, game.audio.ctx.currentTime, 0.2);
        game.audio.ready = false;
      }
      fail('Reload the page to carry on. If it keeps happening, try enabling hardware acceleration, or a newer browser.',
        'The graphics device was lost, and the picture has stopped.');
    };
    var device = renderer.backend && renderer.backend.device;
    if (device && device.lost && device.lost.then) {
      device.lost.then(function (info) {
        renderer.onDeviceLost({
          api: 'WebGPU', message: (info && info.message) || 'Unknown reason',
          reason: (info && info.reason) || null, originalEvent: info
        });
      });
    }

    var last = performance.now();
    var acc = 0;

    function frame(now) {
      if (gone) return;
      requestAnimationFrame(frame);
      /* photo() holds the loop so its frame is the one on screen when the
         stills tool captures it. Never set in normal play. */
      if (game.photoHold) { last = now; return; }
      var gap = now - last;
      var dt = gap / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;          /* tab was backgrounded: don't fast forward */
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard < 6) { game.tick(STEP); acc -= STEP; guard++; }
      if (acc > STEP * 6) acc = 0;
      /* Whatever is left in the accumulator is how far this frame sits past the
         last physics step. Feeding it to sync() is what lets the cars move on
         frames where no step ran: without it they only advance at 60Hz while
         the camera glides on every frame, and the chase car twitches. */
      var alpha = acc / STEP;
      for (var i = 0; i < game.cars.length; i++) game.cars[i].sync(dt, alpha);
      game.render(dt);
      game.countFrame();
      game.watchPace(gap);
      game.updateAudio();
      if (window.updateMonacoLiveStreetView && game.playerCar && game.track) {
        window.updateMonacoLiveStreetView(game.playerCar, game.track);
      }
    }
    requestAnimationFrame(frame);

    var resizeTimer = null;
    function scheduleResize(delay) {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (!gone) game.resize(); }, delay);
    }
    window.addEventListener('resize', function () { scheduleResize(60); });
    /* Mobile Safari reports stale dimensions immediately after a rotation, so
       this one deliberately waits longer than the plain resize path. */
    window.addEventListener('orientationchange', function () { scheduleResize(320); });
    if (window.screen && screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', function () { scheduleResize(320); });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && (game.state === STATE.RACING || game.state === STATE.COUNTDOWN)) {
        game.paused = true;
      }
      last = performance.now();
      acc = 0;
    });

    window.MCL64 = game;
    /* The circuit registry, for the selector UI and for poking at in a console. */
    game.tracks = TRACKS;
    game.trackById = trackById;
    game.photoCams = PHOTO_CAMS;
  }
})();
