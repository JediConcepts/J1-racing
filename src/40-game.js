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

/* --- post-process: RGBA5551 quantise + ordered dither ------------------- */

var POST_VERT = [
  'varying vec2 vUv;',
  'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
].join('\n');

var POST_FRAG = [
  'uniform sampler2D tDiffuse;',
  'uniform vec2 uRes;',
  'uniform float uFade;',
  'uniform float uRetro;',      /* 1 = console, 0 = modern */
  'varying vec2 vUv;',
  /* recursive 4x4 Bayer, built arithmetically — GLSL ES 1.0 will not let us
     dynamically index a const array */
  'float b2(vec2 p){ return mod(2.0*p.y + 3.0*p.x, 4.0); }',
  'float bayer4(vec2 q){',
  '  vec2 hi = floor(mod(q,4.0)*0.5);',
  '  vec2 lo = mod(q,2.0);',
  '  return (4.0*b2(hi) + b2(lo)) / 16.0;',
  '}',
  'void main(){',
  '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
  '  if (uRetro > 0.5) {',
  /* the console path: dither into a 5-bit-per-channel palette */
  '    vec2 px = floor(vUv * uRes);',
  '    float d = bayer4(px) - 0.5;',
  '    c += d * (1.0/52.0);',
  '    c = floor(c * 31.0 + 0.5) / 31.0;',
  '  } else {',
  /* modern: the frame is already tone mapped by the renderer, so this is
     only a gentle grade — a little saturation and contrast, no quantise
     and no dither. */
  '    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
  '    c = mix(vec3(l), c, 1.16);',
  '    c = clamp((c - 0.5) * 1.07 + 0.5, 0.0, 1.0);',
  '  }',
  '  vec2 q = (vUv - 0.5) * 2.0;',
  '  float vig = 1.0 - dot(q,q) * mix(0.06, 0.13, uRetro);',
  '  gl_FragColor = vec4(c * vig * uFade, 1.0);',
  '}'
].join('\n');

/* --- the game ----------------------------------------------------------- */

function Game(host) {
  this.host = host;
  this.state = STATE.TITLE;
  this.time = 0;
  this.raceTime = 0;
  this.countdown = 0;
  this.lights = 0;
  this.camMode = 0;
  this.paused = false;
  this.shake = 0;
  this.finishHold = 0;
  this.splitShow = 0;
  this.splitText = '';
  this.splitGood = false;
  this.message = '';
  this.messageT = 0;
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
  this.settingsResume = false;

  this.buildRenderer();
  this.buildWorld();
  this.buildGrid();
  this.bindInput();
  this.resize();
  this.resetRace(true);
}

Game.prototype.buildRenderer = function () {
  this.glCanvas = document.getElementById('gl');
  this.hudCanvas = document.getElementById('hud');
  this.hud = this.hudCanvas.getContext('2d');

  this.renderer = new THREE.WebGLRenderer({
    canvas: this.glCanvas, antialias: false, alpha: false,
    powerPreference: 'high-performance', stencil: false
  });
  this.renderer.setPixelRatio(1);
  this.renderer.setClearColor(SKY_HAZE, 1);

  this.rt = new THREE.WebGLRenderTarget(320, 240, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
  });

  this.postScene = new THREE.Scene();
  this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  this.postMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: this.rt.texture },
      uRes: { value: new THREE.Vector2(320, 240) },
      uFade: { value: 1 },
      uRetro: { value: 1 }
    },
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    depthTest: false, depthWrite: false
  });
  this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
};

Game.prototype.buildWorld = function () {
  var scene = this.scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HAZE, 150, 980);

  this.camera = new THREE.PerspectiveCamera(64, 4 / 3, 0.6, 3400);
  this.camPos = new THREE.Vector3();
  this.camLook = new THREE.Vector3();

  var hemi = new THREE.HemisphereLight(0xe6efff, 0x6a6244, 1.05);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff2e2, 0.95);
  sun.position.set(-320, 420, 210);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x4d566a, 0.5));

  this.track = new Track(trackById(this.settings.trackId));
  buildTrackMeshes(this.track, scene);
  this.gantry = buildStartGantry(this.track, scene);
  this.scenery = buildScenery(this.track, scene);
  this.sky = buildSky(scene);

  /* minimap path, precomputed once in normalised space */
  var i, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (i = 0; i < this.track.n; i++) {
    var p = this.track.p[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  this.mapBounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
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
    var livery = LIVERIES[i % LIVERIES.length];
    var v = new Vehicle(this.track, livery, i === 0);
    this.scene.add(v.group);
    this.scene.add(v.shadow);
    this.cars.push(v);
    if (i > 0) this.ais.push(new AIDriver(v, this.track, 0.940 + (i % 3) * 0.018, 100 + i * 37));
  }
  this.player = this.cars[0];

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
  for (var i = 0; i < this.gantry.lights.length; i++) {
    this.gantry.lights[i].material.color.setHex(i < count ? 0xff2b1c : 0x2a1a18);
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
      self.camMode = (self.camMode + 1) % 2;
      self.flash(self.camMode === 0 ? 'CHASE CAM' : 'COCKPIT CAM');
    } else if (code === 'KeyM') {
      self.toggleMute();
    } else if (code === 'KeyN') {
      self.toggleMusic();
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
      self.camMode = (self.camMode + 1) % 2;
      self.flash(self.camMode === 0 ? 'CHASE CAM' : 'COCKPIT CAM');
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
    self.settings.quality = self.settings.quality === 'modern' ? 'retro' : 'modern';
    self.applyQuality();
    self.applySettings();
    self.saveSettings();
    self.flash(self.settings.quality === 'modern' ? 'MODERN GRAPHICS' : 'RETRO 240p');
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
};

Game.prototype.toggleMute = function () {
  this.audio.init();
  this.audio.setEngineMuted(!this.audio.engineMuted);
  var b = document.getElementById('btn-sound');
  if (b) b.textContent = this.audio.engineMuted ? 'ENGINE OFF' : 'ENGINE ON';
  this.flash(this.audio.engineMuted ? 'ENGINE OFF' : 'ENGINE ON');
};

Game.prototype.toggleMusic = function () {
  this.audio.init();
  this.audio.initMusic();
  this.audio.musicMuted = !this.audio.musicMuted;
  var b = document.getElementById('btn-music');
  if (b) b.textContent = this.audio.musicMuted ? 'MUSIC OFF' : 'MUSIC ON';
  this.flash(this.audio.musicMuted ? 'MUSIC OFF' : 'MUSIC ON');
};

Game.prototype.flash = function (msg) {
  this.message = msg;
  this.messageT = msg ? 1.9 : 0;
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

  var gw, gh;
  if (this.settings && this.settings.quality === 'modern') {
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
  this.postMat.uniforms.uRes.value.set(gw, gh);

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
    autoThrottle: touchLikely(),
    autoFullscreen: true,
    /* Retro is the default because it is the point of the thing — modern is
       there for anyone who wants to see the circuit without the dither. */
    quality: 'retro',
    trackId: 'silverstone-v1',
    userConfigured: false
  };
  try {
    var raw = window.localStorage ? localStorage.getItem(SETTINGS_KEY) : null;
    if (raw) {
      var p = JSON.parse(raw);
      /* validate each field rather than trusting the blob — a stale or hand
         edited entry must not be able to wedge the controls */
      if (typeof p.steerTilt === 'boolean') s.steerTilt = p.steerTilt;
      if (typeof p.tiltInvert === 'boolean') s.tiltInvert = p.tiltInvert;
      if (typeof p.autoThrottle === 'boolean') s.autoThrottle = p.autoThrottle;
      if (typeof p.autoFullscreen === 'boolean') s.autoFullscreen = p.autoFullscreen;
      if (typeof p.userConfigured === 'boolean') s.userConfigured = p.userConfigured;
      if (p.quality === 'retro' || p.quality === 'modern') s.quality = p.quality;
      /* Validated against the registry: a stale or hand-edited id must fall
         back to a real circuit rather than crashing the boot. */
      if (typeof p.trackId === 'string' && trackById(p.trackId).id === p.trackId) {
        s.trackId = p.trackId;
      }
      /* tiltSens is the old field name — read it so anyone who already set a
         value keeps it instead of being silently reset to 6 */
      var sv = (typeof p.steerSens === 'number') ? p.steerSens : p.tiltSens;
      if (typeof sv === 'number' && isFinite(sv)) s.steerSens = clamp(Math.round(sv), 1, 10);
    }
  } catch (e) { /* blocked storage or corrupt JSON — defaults are fine */ }
  return s;
};

/* Only ever called from an explicit player action, so this is the right place
   to record that the defaults no longer apply. */
Game.prototype.saveSettings = function () {
  this.settings.userConfigured = true;
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

Game.prototype.syncSettingsUi = function () {
  var s = this.settings;
  function put(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; }

  put('set-steer', s.steerTilt ? 'TILT' : 'JOYSTICK');
  put('set-invert', s.tiltInvert ? 'ON' : 'OFF');
  put('set-throttle', s.autoThrottle ? 'AUTO' : 'MANUAL');
  put('set-autofs', s.autoFullscreen ? 'AUTO' : 'MANUAL');
  this.syncTrackList();

  put('set-quality', s.quality === 'modern' ? 'MODERN' : 'RETRO 240p');
  var qh = document.getElementById('set-quality-hint');
  if (qh) {
    qh.textContent = s.quality === 'modern'
      ? 'Modern: supersampled, tone mapped, no dither. Costs more GPU.'
      : 'Retro: 240p with a 5-bit dither, as the hardware did it.';
  }

  /* No point offering an automatic fullscreen the platform will refuse. */
  var fsRow = document.getElementById('row-autofs');
  if (fsRow) fsRow.classList.toggle('is-disabled', !fullscreenSupported() || isStandalone());
  put('set-sens-num', String(s.steerSens));

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
  el.hidden = false;
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
  var tv = this.trackVersion();
  this.cloud.leaderboard(tv, 50).then(function (list) {
    rows.textContent = '';
    if (!list.length) {
      if (status) {
        status.textContent = 'No times posted yet. Race conditions, 3 laps, full grid — first one on the board sets the target.';
      }
      return;
    }
    if (status) status.textContent = (self.track.name || tv) + ' · ' + self.track.laps + ' laps · full grid';

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

Game.prototype.updateCamera = function (dt, snap) {
  var p = (this.state === STATE.TITLE) ? this.demoCar : this.player;
  p.visForward(_cf); p.visRight(_cr);

  var px = p.visX(), py = p.visY(), pz = p.visZ();
  var speed01 = clamp(p.vFwd / V_MAX, 0, 1);

  if (this.state === STATE.TITLE && this.demoShot !== 0) {
    /* locked-off TV camera: hold the position, track the car */
    this.camPos.copy(this.demoAnchor);
    _look.set(px, py + 0.9, pz);
    this.camLook.lerp(_look, snap ? 1 : 1 - Math.exp(-9 * dt));
    this.camera.fov = this.demoShot === 1 ? 34 : 52;
  } else if (this.camMode === 1 && this.state !== STATE.TITLE) {
    _ideal.set(px + _cf.x * 0.30, py + 1.16, pz + _cf.z * 0.30);
    _look.set(px + _cf.x * 26, py + 1.5, pz + _cf.z * 26);
    this.camPos.copy(_ideal);
    this.camLook.copy(_look);
    this.camera.fov = 70 + speed01 * 12;
  } else {
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
    this.camera.fov = 62 + speed01 * 13 + p.boost * 4;
  }

  /* keep the camera out of the dirt */
  var ground = this.track.heightAt(this.camPos.x, this.camPos.z, p.frameIdx) + 1.1;
  if (this.camPos.y < ground) this.camPos.y = ground;

  var sx = 0, sy = 0;
  if (!this.reducedMotion) {
    var rumble = (p.onKerb ? 0.16 : 0) + (p.offTrack ? 0.20 : 0);
    this.shake = Math.max(this.shake * Math.exp(-6 * dt), p.hitImpulse * 0.7 + rumble * clamp(p.vFwd / 40, 0, 1));
    sx = (Math.sin(this.time * 61.3) + Math.sin(this.time * 37.7)) * this.shake * 0.35;
    sy = (Math.sin(this.time * 47.1) + Math.sin(this.time * 71.3)) * this.shake * 0.35;
  }

  this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
  this.camera.lookAt(this.camLook);
  this.camera.updateProjectionMatrix();

  this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
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

  if (this.state === STATE.TITLE) { this.drawTitle(); return; }
  if (this.state === STATE.FINISHED) { this.drawResults(); return; }

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
      'C CAM   P PAUSE   R RESTART   N MUSIC   M ENGINE'
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
  var host = document.getElementById('set-track-list');
  if (!host) return;
  var self = this;
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
        self.selectTrack(def.id);
      });
      host.appendChild(b);
    })(TRACKS[i]);
  }
  this.syncTrackList();
};

/* Marks the current circuit. Called from applySettings too, so the list is
   right whenever the panel opens rather than only when it is first built. */
Game.prototype.syncTrackList = function () {
  var host = document.getElementById('set-track-list');
  if (!host) return;
  var current = this.settings.trackId || (this.track && this.track.def.id);
  var rows = host.children;
  for (var i = 0; i < rows.length; i++) {
    var on = rows[i].dataset.trackId === current;
    rows[i].setAttribute('aria-checked', on ? 'true' : 'false');
    rows[i].tabIndex = on ? 0 : -1;
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
  setTimeout(function () { location.reload(); }, 220);
};

Game.prototype.applyQuality = function () {
  var modern = this.settings.quality === 'modern';

  this.renderer.toneMapping = modern ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  this.renderer.toneMappingExposure = modern ? 1.12 : 1.0;

  /* Tone mapping is compiled INTO every material's shader, so changing it
     after the scene exists does nothing until each one is rebuilt. Without
     this the toggle appears to do nothing but change the resolution. */
  this.scene.traverse(function (o) {
    if (!o.material) return;
    var m = o.material.length ? o.material : [o.material];
    for (var i = 0; i < m.length; i++) if (m[i]) m[i].needsUpdate = true;
  });

  this.postMat.uniforms.uRetro.value = modern ? 0 : 1;
  this.resize();
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

  this.renderer.setRenderTarget(this.rt);
  this.renderer.clear();
  this.renderer.render(this.scene, this.camera);
  this.renderer.setRenderTarget(null);

  var fade = 1;
  if (this.state === STATE.COUNTDOWN && this.countdown < 0.6) fade = clamp(this.countdown / 0.6, 0, 1);
  this.postMat.uniforms.uFade.value = fade;
  this.renderer.render(this.postScene, this.postCam);

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

/* =========================================================================
   BOOT
   ========================================================================= */

(function boot() {
  var host = document.getElementById('screen');
  var fallback = document.getElementById('fallback');

  function fail(msg) {
    if (fallback) {
      fallback.style.display = 'flex';
      var d = document.getElementById('fallback-detail');
      if (d) d.textContent = msg;
    }
  }

  if (!window.THREE) { fail('The 3D library did not load.'); return; }

  /* probe WebGL before we build anything, so the failure is a message and
     not a stack trace */
  try {
    var probe = document.createElement('canvas');
    var gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
    if (!gl) { fail('WebGL is unavailable in this browser. Try enabling hardware acceleration.'); return; }
  } catch (e) {
    fail('WebGL could not be initialised: ' + e.message);
    return;
  }

  var game;
  try {
    game = new Game(host);
  } catch (err) {
    fail(err && err.message ? err.message : String(err));
    if (window.console) console.error(err);
    return;
  }

  var loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';

  var last = performance.now();
  var acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;          /* tab was backgrounded — don't fast-forward */
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard < 6) { game.tick(STEP); acc -= STEP; guard++; }
    if (acc > STEP * 6) acc = 0;
    /* Whatever is left in the accumulator is how far this frame sits past the
       last physics step. Feeding it to sync() is what lets the cars move on
       frames where no step ran — without it they only advance at 60Hz while
       the camera glides on every frame, and the chase car twitches. */
    var alpha = acc / STEP;
    for (var i = 0; i < game.cars.length; i++) game.cars[i].sync(dt, alpha);
    game.render(dt);
    game.updateAudio();
  }
  requestAnimationFrame(frame);

  var resizeTimer = null;
  function scheduleResize(delay) {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { game.resize(); }, delay);
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
})();
