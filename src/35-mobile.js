/* =========================================================================
   MCL-64  —  mobile input: floating thumbstick, tilt steering, fullscreen
   ========================================================================= */

/* --- touch detection -----------------------------------------------------
   Deliberately NOT (pointer: coarse). That query is wrong often enough in
   both directions — false on some phones, true on touch-capable laptops —
   that gating the only available controls on it leaves real players with no
   way to drive. Capability is a hint; an actual touch event is proof. */

function touchLikely() {
  try {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (navigator.msMaxTouchPoints > 0);
  } catch (e) { return false; }
}

function watchForTouch(onDetected) {
  if (touchLikely()) onDetected();
  /* Proof, whatever the capability flags claimed. Fires once. */
  var seen = false;
  function mark(e) {
    if (seen) return;
    if (e.pointerType && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    seen = true;
    onDetected();
  }
  window.addEventListener('pointerdown', mark, true);
  window.addEventListener('touchstart', function () { if (!seen) { seen = true; onDetected(); } }, true);
}

/* True when a keystroke belongs to a form field rather than to the car.
   The game binds its controls on window, so without this guard every letter
   typed into the email box also steers, and r/c/m/n/p restart the race,
   change camera, toggle sound and pause — while preventDefault swallows the
   character so nothing appears in the field at all. */
function isTextEntry(e) {
  var t = e && e.target;
  if (!t) return false;
  var tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

/* --- floating analog thumbstick -----------------------------------------
   The base spawns wherever the thumb lands rather than sitting in a fixed
   spot, so the player never has to look down to find it. X steers; pushing
   forward is throttle and pulling back is brake, which becomes reverse once
   the car is stopped. */

function VirtualStick(opts) {
  this.zone = opts.zone;
  this.base = opts.base;
  this.knob = opts.knob;
  this.radius = opts.radius || 58;
  this.dead = 0.14;
  this.onWake = opts.onWake || function () {};

  /* When tilt owns steering, the stick becomes a throttle/brake slider. It
     has to stop moving sideways as well as stop reporting sideways — a knob
     that slides left while doing nothing reads as broken. */
  this.lockX = false;

  this.pointerId = null;
  this.active = false;
  this.x = 0;
  this.y = 0;
}

function applyDeadzone(v, d) {
  var a = Math.abs(v);
  if (a <= d) return 0;
  return sign(v) * ((a - d) / (1 - d));
}

VirtualStick.prototype.attach = function () {
  var self = this;

  this.zone.addEventListener('pointerdown', function (e) {
    if (self.pointerId !== null) return;                 /* one thumb owns the stick */
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    self.pointerId = e.pointerId;
    self.active = true;
    var r = self.zone.getBoundingClientRect();
    self.originX = e.clientX - r.left;
    self.originY = e.clientY - r.top;
    self.x = 0; self.y = 0;
    self.render(0, 0, true);
    /* capture so the stick keeps tracking even if the thumb slides out of
       the zone — without this, input silently sticks ON */
    try { self.zone.setPointerCapture(e.pointerId); } catch (err) {}
    self.onWake();
    e.preventDefault();
  });

  this.zone.addEventListener('pointermove', function (e) {
    if (e.pointerId !== self.pointerId) return;
    var r = self.zone.getBoundingClientRect();
    self.move(e.clientX - r.left, e.clientY - r.top);
    e.preventDefault();
  });

  function end(e) {
    if (e.pointerId !== self.pointerId) return;
    self.release();
    e.preventDefault();
  }
  this.zone.addEventListener('pointerup', end);
  this.zone.addEventListener('pointercancel', end);
  this.zone.addEventListener('lostpointercapture', function (e) {
    if (e.pointerId === self.pointerId) self.release();
  });
};

VirtualStick.prototype.move = function (lx, ly) {
  var dx = lx - this.originX;
  var dy = ly - this.originY;
  var r = this.radius;

  if (this.lockX) dx = 0;      /* tilt is steering; this is a pedal now */

  /* Axes gate INDEPENDENTLY. Clamping the vector length instead would cap a
     45-degree push at 0.71 on each axis, so full throttle through a full-lock
     corner would be impossible — the one thing a racing stick must allow. */
  this.x = applyDeadzone(clamp(dx / r, -1, 1), this.dead);
  this.y = applyDeadzone(clamp(dy / r, -1, 1), this.dead);

  /* The knob still rides inside the ring, which is what reads correctly. */
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len > r && len > 0) { dx = dx / len * r; dy = dy / len * r; }
  this.render(dx, dy, true);
};

VirtualStick.prototype.release = function () {
  this.pointerId = null;
  this.active = false;
  this.x = 0;
  this.y = 0;
  this.render(0, 0, false);
};

VirtualStick.prototype.render = function (dx, dy, visible) {
  if (!this.base || !this.knob) return;
  var v = visible ? '1' : '0';
  this.base.style.opacity = v;
  this.knob.style.opacity = v;
  if (!visible) return;
  this.base.style.left = this.originX + 'px';
  this.base.style.top = this.originY + 'px';
  this.knob.style.left = (this.originX + dx) + 'px';
  this.knob.style.top = (this.originY + dy) + 'px';
};

/* forward on the stick is throttle, back is brake (and then reverse) */
VirtualStick.prototype.throttle = function () { return this.active ? clamp(-this.y, 0, 1) : 0; };
VirtualStick.prototype.brake = function () { return this.active ? clamp(this.y, 0, 1) : 0; };

/* --- tilt steering -------------------------------------------------------
   beta/gamma are reported in DEVICE space, so the axis that means "lean
   left/right" changes as the screen rotates. Steering the wrong way is worse
   than no steering, so the control also offers an inverted mode. */

function TiltSensor() {
  this.mode = 0;                 /* 0 off, 1 normal, 2 inverted */
  this.supported = typeof window.DeviceOrientationEvent !== 'undefined';
  this.needsPermission = !!(window.DeviceOrientationEvent &&
    typeof window.DeviceOrientationEvent.requestPermission === 'function');
  this.granted = false;
  this.raw = 0;
  this.neutral = null;
  this.range = 24;               /* degrees of lean for full lock */
  this.handler = null;
}

TiltSensor.prototype.screenAngle = function () {
  try {
    if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') return (window.orientation + 360) % 360;
  } catch (e) {}
  return 0;
};

TiltSensor.prototype.onOrientation = function (e) {
  if (e.gamma === null || e.gamma === undefined) return;
  if (e.beta === null || e.beta === undefined) return;
  var a = this.screenAngle();
  var raw;
  if (a === 90) raw = -e.beta;
  else if (a === 180) raw = -e.gamma;
  else if (a === 270) raw = e.beta;
  else raw = e.gamma;
  /* first reading after enabling becomes "level", so the player can hold the
     phone however is comfortable instead of flat */
  if (this.neutral === null) this.neutral = raw;
  this.raw = raw;
};

TiltSensor.prototype.enable = function () {
  var self = this;
  if (!this.supported) return Promise.resolve(false);

  function listen() {
    if (!self.handler) {
      self.handler = function (e) { self.onOrientation(e); };
      window.addEventListener('deviceorientation', self.handler, true);
    }
    self.granted = true;
    self.neutral = null;
    return true;
  }

  /* iOS requires an explicit grant, requested from inside a user gesture and
     over HTTPS. Android has no such call — feature detect, never sniff. */
  if (this.needsPermission) {
    try {
      return window.DeviceOrientationEvent.requestPermission()
        .then(function (r) { return r === 'granted' ? listen() : false; })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }
  return Promise.resolve(listen());
};

TiltSensor.prototype.disable = function () {
  if (this.handler) {
    window.removeEventListener('deviceorientation', this.handler, true);
    this.handler = null;
  }
  this.mode = 0;
  this.neutral = null;
};

TiltSensor.prototype.recalibrate = function () { this.neutral = this.raw; };

TiltSensor.prototype.value = function () {
  if (this.mode === 0 || this.neutral === null) return 0;
  /* NOTE THE SUBTRACTION ORDER. (raw - neutral) is the intuitive form and it
     steers BACKWARDS on real hardware — confirmed on device, not in theory.
     So the negated form is the default, and mode 2 flips it back for any
     handset that disagrees. */
  var s = clamp((this.neutral - this.raw) / this.range, -1, 1);
  return this.mode === 2 ? -s : s;
};

/* --- fullscreen ---------------------------------------------------------
   iPhone Safari still refuses element fullscreen (video only), so this is
   feature detected and the button hides itself rather than lying. */

function fullscreenSupported() {
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

/* Launched from a home-screen icon, so the browser chrome is already gone and
   there is nothing to offer. iOS uses navigator.standalone; everyone else
   reports it through the display-mode media query. */
function isStandalone() {
  try {
    if (window.navigator && window.navigator.standalone === true) return true;
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch (e) { return false; }
}

/* Every browser on iOS is WebKit underneath — Chrome and Firefox there inherit
   Safari's restrictions, so this must not be a "is it Safari" check. iPadOS
   reports itself as a Mac, hence the touch-point tiebreak. */
function isIosWebKit() {
  try {
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  } catch (e) { return false; }
}

/* Only meaningful once fullscreen is actually active, and rejects outright on
   iOS and desktop — so it must never be allowed to throw. */
function lockLandscape() {
  try {
    if (window.screen && screen.orientation && screen.orientation.lock) {
      var p = screen.orientation.lock('landscape');
      if (p && p.catch) p.catch(function () {});
    }
  } catch (e) {}
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen(el) {
  try {
    if (!isFullscreen()) {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        var p = req.call(el, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(function () {});
      }
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        var q = exit.call(document);
        if (q && q.catch) q.catch(function () {});
      }
    }
  } catch (e) { /* never let a chrome affordance break the game */ }
}

function onFullscreenChange(fn) {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}
