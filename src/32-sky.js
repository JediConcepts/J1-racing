/* =========================================================================
   MCL-64  —  the sky: the painted dome, the physical sky, the time of day
   ========================================================================= */

/* THE FOUR HOURS. One row for each name in TIME_OF_DAY_NAMES (40-game.js).
   Only the physical sky reads them: the dome has one look and no clock.

     elevation   degrees above the horizon
     azimuth     degrees clockwise, seen from above, from the direction the
                 cars travel at the start line (see SkyRig.setNorth). Measured
                 from the circuit and not from the compass, so that on every
                 circuit the main straight has the sun to one side and ahead,
                 and is never lit flat from behind the camera. Through the day
                 it goes round the way the real sun does: rising ahead and to
                 the right, high on the right at midday, setting ahead and to
                 the left.

   The sky's own settings, as SkyMesh names them:

     turbidity, rayleigh, mieCoefficient, mieDirectionalG
     gain        what the sky's light is multiplied by before it is drawn. The
                 model gives a noon sky many times brighter than a sky at
                 dusk, and the game has one fixed exposure, so this is the
                 eye getting used to the hour.
     tint        the colour that light is multiplied by as well. The model's
                 sky is close to white wherever it is bright; a low sun wants
                 the whole sky a little warm, as film balanced for daylight
                 shows it.
     cloud       how much of the sky the model's clouds cover, 0 to 1
     haze        where the fog starts and where it is complete, in metres.
                 The dome has 250 and 980 (see buildWorld). The far figure
                 stays: the ground plane ends not much further out, and its
                 edge has to be lost in the fog. The near one is the hour's
                 air: mist in the morning, clear at midday.

   The lights. A colour is three numbers in linear light, as the engine takes
   them with colour management off, and a strength is the number beside the
   factor of pi (see the note on the lights in buildWorld):

     sun, sunK       the directional light
     sky, land, skyK the hemisphere light, from above and from below
     fill, fillK     the ambient light, which is what keeps a shaded wall from
                     going to black when the sun is low */
var TIME_OF_DAY = {
  morning: {
    elevation: 20, azimuth: 62,
    turbidity: 3.5, rayleigh: 1.3, mieCoefficient: 0.0005, mieDirectionalG: 0.82,
    gain: 0.34, tint: [1.05, 0.99, 0.97], cloud: 0.34, haze: [360, 980],
    sun: [1.00, 0.88, 0.72], sunK: 1.25,
    sky: [0.78, 0.88, 1.00], land: [0.40, 0.38, 0.28], skyK: 0.85,
    fill: [0.32, 0.36, 0.44], fillK: 0.30
  },
  midday: {
    elevation: 58, azimuth: 118,
    turbidity: 1.5, rayleigh: 1.0, mieCoefficient: 0.003, mieDirectionalG: 0.80,
    gain: 0.19, tint: [1.00, 1.00, 1.00], cloud: 0.30, haze: [420, 980],
    sun: [1.00, 0.96, 0.89], sunK: 1.75,
    sky: [0.82, 0.90, 1.00], land: [0.42, 0.39, 0.28], skyK: 0.75,
    fill: [0.30, 0.34, 0.42], fillK: 0.28
  },
  golden: {
    elevation: 11, azimuth: 330,
    turbidity: 4.0, rayleigh: 2.2, mieCoefficient: 0.0005, mieDirectionalG: 0.84,
    gain: 0.40, tint: [1.00, 0.80, 0.56], cloud: 0.20, haze: [300, 980],
    sun: [1.00, 0.62, 0.30], sunK: 1.70,
    sky: [0.78, 0.78, 0.95], land: [0.44, 0.34, 0.24], skyK: 0.44,
    fill: [0.42, 0.36, 0.44], fillK: 0.27
  },
  dusk: {
    elevation: 4.5, azimuth: 340,
    turbidity: 4.0, rayleigh: 2.5, mieCoefficient: 0.0005, mieDirectionalG: 0.86,
    gain: 1.10, tint: [1.00, 0.85, 0.74], cloud: 0.18, haze: [280, 980],
    sun: [1.00, 0.50, 0.24], sunK: 0.95,
    sky: [0.60, 0.62, 0.92], land: [0.40, 0.30, 0.28], skyK: 0.60,
    fill: [0.40, 0.36, 0.52], fillK: 0.42
  }
};

/* ONE CIRCUIT'S OWN HOURS. A row here is laid over the row of the same name
   in TIME_OF_DAY, field by field, on that circuit and on no other (see
   SkyRig.setCircuit and SkyRig.rowFor). A circuit that is not named, or an
   hour that is not, has the table above and nothing else.

   MONACO AT DUSK is the first thing a new player sees, so its sun is placed
   as a photographer would place it and not by the rule that serves the
   other three circuits.

     azimuth 322   38 degrees to the left of the way the cars leave the line,
                   which at Monaco is over the far end of the harbour. From
                   the grid the disc is in the frame, low on the left, with
                   the water under it; the fronts of the buildings across
                   the road are turned towards it and take two thirds of its
                   light; and every car throws a long shadow across the road
                   and back towards the camera. With the table's 340 the sun
                   stood at the end of the street and those fronts were lit
                   at a glancing angle. Further round (305 was tried) the
                   fronts are brighter still, but the disc leaves the frame
                   and the picture stops saying dusk.
     elevation 7.5 and not 4.5. A sea wall 1.25 m high throws a shadow 16 m
                   long at 4.5 degrees, which is the whole road; at 7.5 it
                   is 9.5 m, and 6 m across the road at this bearing, so the
                   far lane is in the sun. The disc also clears the towers
                   at the far end of the harbour.
     rayleigh      more of it: a deeper blue overhead and a redder horizon.
     gain, tint    the sky under the table's, because a sun this much higher
                   makes the model's sky a good deal brighter and the camera
                   looks towards it for a third of the lap. The tint keeps
                   its blue, where the table's takes a quarter of it out:
                   that is what turned the upper sky teal.
     sun, sunK     a stronger and slightly less red sun. Its light on the
                   road falls with the sine of its height, so the table's
                   0.95 left the road to the fill alone; the fronts of the
                   buildings, which face it, take most of 1.9 and glow.
     sky, fill     the shade is most of a street circuit at this hour. It is
                   lifted and kept blue, so a road in shadow is read as a
                   road at dusk and not as a dark band.
     windows       how strongly the town's lit windows shine (setHour in
                   20-track.js). Only an hour that names it has any.
     haze          starts further out: the far side of the harbour is 300 m
                   away and is the middle of the picture. */
var TIME_OF_DAY_AT = {
  'monaco-gp-v1': {
    dusk: {
      elevation: 7.5, azimuth: 322,
      rayleigh: 3.2,
      gain: 0.72, tint: [1.00, 0.86, 0.94],
      sun: [1.00, 0.58, 0.30], sunK: 1.90,
      sky: [0.56, 0.62, 1.00], land: [0.44, 0.34, 0.32], skyK: 0.72,
      fill: [0.40, 0.38, 0.58], fillK: 0.50,
      windows: 1.9,
      haze: [340, 980]
    }
  }
};

/* How far the sun light sits from the point it looks at: the length of the
   (-320, 420, 210) the dome's sun has always had. */
var SUN_REACH = 568.2;

/* The brightest the sky's horizon is taken to be when the fog is given its
   colour, in linear light (see horizon). 24 is far past white under the tone
   map. While the sky stood alone it was also the cap on the sky as drawn and
   what the sun's disc was scaled to; both of those are SUN_DISC now. */
var SKY_CAP = 24;

/* What the sun's disc is drawn at: its brightest channel, in linear light,
   and with it the cap on the sky as drawn. The model's disc comes out in the
   tens of thousands, which a half float target can hold and a bloom pass
   would turn into a white screen. So the disc is scaled to this number (see
   setTimeOfDay), which leaves a low sun its colour where a plain cap would
   have made every sun white.

   It was 24 while the sky stood alone. On the screen the two look the same,
   both being far past white, but the bloom has to be able to tell the disc
   from a glint on paint, which it can only do by how bright a pixel is, and
   a glint has been measured in the tens. So the disc stands well clear of
   everything else in the frame, above BLOOM.sun (40-game.js), and the bloom
   gives it the glow of a source of light. Nothing else in the sky comes
   near either figure: worked out from skyLight, the sky beside the sun is
   5.2 at its brightest (dusk, the red channel), so the cap of 24 only ever
   held the disc. */
var SUN_DISC = 2000;

/* How much brighter than the rest of the horizon the fog may go when the
   camera looks towards the sun. See SkyRig.fogToward. */
var FOG_GLARE = 2.5;

/* THE SUN THROUGH A LONG LENS. The bloom gives the sun's disc a glow for
   every pixel of the disc (BLOOM.sunGive in 40-game.js), and the disc is a
   fixed angle across, so the glow grows with the square of the lens: tuned
   on the race cameras (50 degrees and wider), it came out as a wash over a
   third of the frame from the title screen's 34 degree camera, where the
   disc covers three times the pixels. Under SUN_LONG degrees of field of
   view the disc is therefore drawn at SUN_DISC_LONG and not at SUN_DISC:
   still far past white, so the disc itself looks the same, but under what
   the bloom takes for the sun (BLOOM.sun, 500), so it glows as any bright
   thing does and no more.

   It is a step and not a slope. A slope was tried: the bloom gives the full
   glow from one above BLOOM.sun, so a disc at 500.25 should have asked for
   a quarter of it. Measured on both backends it gave none, the figure
   being lost somewhere under the quarter steps of a half float at that
   size. No race camera is near the step (the narrowest is 50 degrees). */
var SUN_LONG = 45;
var SUN_DISC_LONG = 60;

/* What the land reflects, for the half of the environment below the horizon:
   grass, tarmac and gravel taken together. */
var SKY_LAND = [0.15, 0.17, 0.12];

/* THE PAINTED ENVIRONMENT, which is the dome's.

   A Standard material with nothing to reflect is just a Lambert with extra
   maths — car paint comes out looking like matte plastic. This is the single
   biggest contributor to the modern look after the material swap itself.

   Generated procedurally from a sky dome with a bright sun disc and a ground
   half, then prefiltered into the roughness mip chain. On r128 the game ran
   PMREMGenerator for that; this renderer prefilters an equirectangular
   scene.environment by itself, so the texture is handed over as painted. Done
   this way because the artifact CSP blocks every external host, so an HDR file
   could never be fetched — and a 2 KB shader beats a 4 MB download regardless. */
function paintDomeEnvironment() {
  /* NO TRY AND CATCH HERE ANY MORE, because nothing in here can fail by
     itself. On r128 one wrapped this function, with "no environment is a
     flatter look, never a broken one" in its catch: PMREMGenerator ran inside
     it, on the GPU, and a prefilter that failed left the scene without an
     environment and the game still drawing. Now the function only paints a
     2D canvas, as every texture in the game is painted, and hands it over.
     The engine filters it inside the first frame it draws, which no catch in
     here could reach: a failure there is the renderer failing to draw, and
     that belongs to whoever called for the frame, not to this function. */

  /* Painted as an EQUIRECTANGULAR canvas rather than rendered from a shader
     dome. The dome version prefiltered to solid black, and because a
     Standard material takes its whole indirect term from the environment,
     a black one does not soften the scene, it extinguishes it. A canvas goes
     through the engine's well worn equirect path instead, and its
     contents can be inspected, which a shader baked inside PMREM cannot. */
  var cv = makeCanvas(256, 128), ctx = cv.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, '#6f9ede');    /* zenith */
  g.addColorStop(0.42, '#c4d3e8');
  g.addColorStop(0.50, '#d8d2c4');    /* haze band at the horizon */
  g.addColorStop(0.58, '#8d8578');
  g.addColorStop(1.00, '#3f3c37');    /* ground bounce */
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);

  /* A sun disc, which is what actually puts a moving highlight along the
     bodywork. Placed to match the directional light's bearing. */
  var sg = ctx.createRadialGradient(74, 34, 1, 74, 34, 26);
  sg.addColorStop(0, 'rgba(255,252,242,1)');
  sg.addColorStop(0.25, 'rgba(255,238,206,0.85)');
  sg.addColorStop(1, 'rgba(255,238,206,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(48, 8, 52, 52);

  var tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  /* THIS CANVAS KEEPS ITS sRGB FLAG, where texFromCanvas (10-core.js) takes
     the flag off every other canvas texture that carries colour. The two are
     not at odds. The flag makes the GPU turn each texel into light before it
     smooths, where r128 smoothed the painted values first, and that matters
     for a texture of strong contrast seen small: the crowd came out up to 42
     levels too light. This canvas is a smooth sky with a soft sun, so the
     two orders give almost the same answer. Worked out on the canvas as it
     is painted here: averaging a 2 x 2 box of texels before or after turning
     it into light differs by 0.080 of a level at worst, and a 4 x 4 box by
     0.299. Those are the sizes the GPU smooths over when the engine reads
     it; the wider blurs a rough surface needs are the engine's own
     prefilter, which r128's did in light as well. Taking the flag off would
     buy nothing that can be seen and would need a decode of its own inside
     the engine's prefilter, which is not the game's to change. If the sky
     ever gets hard edges (a horizon line, a small bright sun), measure it
     again. */
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* The light the physical sky sends from direction (dx, dy, dz) with the sun
   at (sx, sy, sz), both of length 1, for one row of TIME_OF_DAY, before the
   gain. This is SkyMesh's own arithmetic (the Preetham model, in
   examples/jsm/objects/SkyMesh.js of three.js 0.187) written out again in
   plain numbers, less the sun disc and the clouds, because the fog has to be
   given the colour the sky has at the horizon and a shader cannot be asked.
   If the engine's sky ever changes its sums, this has to follow.

   `disc`, when given, is filled with the model's sun disc as seen along that
   line (its colour before SkyMesh's showSunDisc is applied). */
function skyLight(dx, dy, dz, sx, sy, sz, row, disc) {
  var total = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
  var mieK = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
  var floor = [0, 0.0003, 0.00075];
  var sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(clamp(sy, -1, 1))) / 1.5)));
  var zenith = Math.acos(Math.max(0, dy));
  var inverse = 1 / (Math.cos(zenith) + 0.15 * Math.pow(93.885 - zenith * 180 / Math.PI, -1.253));
  var cosTheta = dx * sx + dy * sy + dz * sz;
  var rPhase = 0.05968310365946075 * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
  var g = row.mieDirectionalG, g2 = g * g;
  var mPhase = 0.07957747154594767 * (1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5);
  var low = clamp(Math.pow(1 - sy, 5), 0, 1);
  var out = [0, 0, 0];
  for (var i = 0; i < 3; i++) {
    var betaR = total[i] * row.rayleigh;
    var betaM = 0.434 * (0.2 * row.turbidity * 10e-18) * mieK[i] * row.mieCoefficient;
    var fex = Math.exp(-(betaR * 8400 * inverse + betaM * 1250 * inverse));
    var x = sunE * (betaR * rPhase + betaM * mPhase) / (betaR + betaM);
    var lin = Math.pow(x * (1 - fex), 1.5);
    lin *= (1 - low) + low * Math.pow(x * fex, 0.5);
    out[i] = (lin + 0.1 * fex) * 0.04 + floor[i];
    if (disc) disc[i] = Math.min(sunE * fex, 80) * 760;
  }
  return out;
}

/* THE SKY RIG: everything over the horizon, and the light that comes from it.

   It owns the sky that is drawn, scene.environment, and what the three lights
   are set to. It has two modes:

     'dome'      the vertex coloured dome (buildSky in 20-track.js), the
                 painted environment above, and the lights exactly as
                 buildWorld made them. This is Retro and Modern, and it is
                 what the rig is in when it is made. The time of day is
                 remembered and changes nothing.
     'physical'  SkyMesh, the engine's model of a clear sky, with a sun disc
                 that can be seen. setTimeOfDay moves the sun light to where
                 the disc is, sets the three lights for the hour, draws the
                 sky into scene.environment through PMREMGenerator, and gives
                 the fog the colour the sky has at the horizon.

   `root` is the one object the game moves to keep the sky centred on the
   camera (game.sky). `sunOffset` is where the sun light sits measured from
   the point it looks at: whoever moves the light to follow a car adds this
   to the target and so keeps the sun's direction. */
function SkyRig(scene, renderer, sun, hemi, ambient) {
  this.scene = scene;
  this.renderer = renderer;
  this.sun = sun;
  this.hemi = hemi;
  this.ambient = ambient;
  this.mode = 'dome';
  this.timeOfDay = 'midday';
  this.north = 0;
  this.circuit = '';
  this.rows = {};
  this.drawn = '';
  /* for the fog: the hour's row and its sun, and the mean of the horizon
     away from the sun */
  this.row = null;
  this.sunDir = new THREE.Vector3(0, 1, 0);
  this.fogBase = [0, 0, 0];
  this.domeHaze = [scene.fog.near, scene.fog.far];

  this.sunOffset = new THREE.Vector3().copy(sun.position).sub(sun.target.position);

  /* the dome's lights, kept so that leaving the physical sky puts them back */
  this.domeLights = {
    offset: this.sunOffset.clone(),
    sun: sun.color.clone(), sunK: sun.intensity,
    sky: hemi.color.clone(), land: hemi.groundColor.clone(), skyK: hemi.intensity,
    fill: ambient.color.clone(), fillK: ambient.intensity
  };

  this.root = new THREE.Group();
  scene.add(this.root);
  this.dome = buildSky(scene);
  this.root.add(this.dome);

  /* Kept, not disposed: the renderer filters it when it first draws and
     reads it again if the scene's environment is ever set anew. */
  this.domeEnvironment = paintDomeEnvironment();
  scene.environment = this.domeEnvironment;

  /* built the first time the physical sky is asked for, so Retro and Modern
     never pay for it */
  this.sky = null;
  this.envScene = null;
  this.envSky = null;
  this.envLand = null;
  this.envTarget = null;
  this.pmrem = null;
  this.gain = null;
  /* what SkyMesh's showSunDisc is set to for a race camera and for a long
     lens (see SUN_LONG) */
  this.discFull = 1;
  this.discLong = 1;
}

/* Which circuit the rig is over: an id from TRACKS. A circuit may have hours
   of its own (TIME_OF_DAY_AT). Called once the circuit is built. */
SkyRig.prototype.setCircuit = function (id) {
  if (id === this.circuit) return;
  this.circuit = id;
  this.rows = {};
  this.drawn = '';
  if (this.mode === 'physical') this.setTimeOfDay(this.timeOfDay);
};

/* The row for an hour on this circuit: TIME_OF_DAY's, with the circuit's own
   fields laid over it. Null for a name that is not an hour. */
SkyRig.prototype.rowFor = function (name) {
  var base = TIME_OF_DAY[name];
  if (!base) return null;
  var own = (TIME_OF_DAY_AT[this.circuit] || {})[name];
  if (!own) return base;
  if (!this.rows[name]) {
    var row = {}, k;
    for (k in base) if (base.hasOwnProperty(k)) row[k] = base[k];
    for (k in own) if (own.hasOwnProperty(k)) row[k] = own[k];
    this.rows[name] = row;
  }
  return this.rows[name];
};

/* Where "ahead" is for the azimuths in TIME_OF_DAY: the direction the cars
   travel at the start line, as (x, z) on the ground. Called once the circuit
   is built. */
SkyRig.prototype.setNorth = function (x, z) {
  var north = Math.atan2(x, -z);
  if (north === this.north) return;
  this.north = north;
  this.drawn = '';
  if (this.mode === 'physical') this.setTimeOfDay(this.timeOfDay);
};

/* A SkyMesh with the gain and the cap put on its colour. The gain (with the
   tint in it) is one uniform shared by the sky that is drawn and the one the
   environment is made from. The clouds are the model's own and are made to
   stand still: left alone they move with the engine's clock, and a photo has
   to give the same frame every time. */
SkyRig.prototype.makeSky = function () {
  var T = THREE.TSL;
  var sky = new THREE.SkyMesh();
  sky.material.colorNode = T.vec4(T.clamp(sky.material.colorNode.rgb.mul(this.gain), 0.0, SUN_DISC), 1.0);
  sky.cloudSpeed.value = 0;
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
};

SkyRig.prototype.buildPhysical = function () {
  var rig = this;
  this.gain = THREE.TSL.uniform(new THREE.Vector3(1, 1, 1));

  /* the sky that is drawn: a box round the camera, pushed to the far plane
     by its own vertex stage, so its size only has to keep the camera inside */
  this.sky = this.makeSky();
  this.sky.scale.setScalar(3000);
  this.sky.visible = false;
  /* The fog follows the camera round (see fogToward). The sky is drawn
     first in every frame (its renderOrder), and only in the frame itself,
     never in a shadow pass or into the environment, so this is the one place
     that is told which camera the picture is being drawn for, before
     anything that takes fog is drawn. */
  this.sky.onBeforeRender = function (renderer, scene, camera) {
    var e = camera.matrixWorld.elements;
    rig.fogToward(-e[8], -e[10]);
    /* and how long its lens is: see SUN_LONG */
    rig.sky.showSunDisc.value = camera.fov < SUN_LONG ? rig.discLong : rig.discFull;
  };
  this.root.add(this.sky);

  /* The scene the environment is drawn from: the same sky with no sun disc,
     and the land below it. The disc is left out because a few texels of it
     prefilter into sparks on every rough surface; the directional light is
     the sun's highlight. Without the land the lower half would be the bright
     haze of the horizon, and the underside of every car would be lit like
     its roof. */
  this.envScene = new THREE.Scene();
  this.envSky = this.makeSky();
  this.envSky.showSunDisc.value = 0;
  this.envSky.scale.setScalar(50);
  this.envScene.add(this.envSky);
  this.envLand = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ fog: false }));
  this.envLand.rotation.x = -Math.PI / 2;
  this.envLand.position.y = -0.2;
  this.envScene.add(this.envLand);

  this.pmrem = new THREE.PMREMGenerator(this.renderer);
};

/* Hands `tex` over as the scene's environment. A material that asks for its
   own strength holds the environment as its own map (Game.ownEnvironment),
   so those are moved across too, and rebuilt, because the engine settles
   which texture a material reads when it builds the material. */
SkyRig.prototype.useEnvironment = function (tex) {
  var from = this.scene.environment;
  if (from === tex) return;
  this.scene.traverse(function (o) {
    if (!o.material) return;
    var m = o.material.length ? o.material : [o.material];
    for (var i = 0; i < m.length; i++) {
      if (m[i] && m[i].envMap === from) { m[i].envMap = tex; m[i].needsUpdate = true; }
    }
  });
  this.scene.environment = tex;
};

/* 'dome' | 'physical'. Undoes what the other mode set up. The fog is the
   caller's in 'dome' (Game.applyHaze, which knows the tier) and the rig's in
   'physical'. */
SkyRig.prototype.setMode = function (mode) {
  if (mode !== 'dome' && mode !== 'physical') throw new Error('unknown sky mode ' + mode);
  if (mode === this.mode) return;
  this.mode = mode;
  this.drawn = '';
  if (mode === 'physical') {
    if (!this.sky) this.buildPhysical();
    this.dome.visible = false;
    this.sky.visible = true;
    this.setTimeOfDay(this.timeOfDay);
  } else {
    var d = this.domeLights;
    this.sky.visible = false;
    this.dome.visible = true;
    this.sunOffset.copy(d.offset);
    this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
    this.sun.color.copy(d.sun); this.sun.intensity = d.sunK;
    this.hemi.color.copy(d.sky); this.hemi.groundColor.copy(d.land); this.hemi.intensity = d.skyK;
    this.ambient.color.copy(d.fill); this.ambient.intensity = d.fillK;
    this.scene.fog.near = this.domeHaze[0]; this.scene.fog.far = this.domeHaze[1];
    this.useEnvironment(this.domeEnvironment);
  }
};

/* One of TIME_OF_DAY's names. In 'dome' it is only remembered. */
SkyRig.prototype.setTimeOfDay = function (name) {
  var row = this.rowFor(name);
  if (!row) throw new Error('unknown time of day ' + name);
  this.timeOfDay = name;
  if (this.mode !== 'physical') return;
  /* asked for again with nothing changed: the environment is not drawn twice */
  if (this.drawn === name) return;
  this.drawn = name;

  /* the sun, as a direction of length 1 */
  var el = row.elevation * Math.PI / 180, az = row.azimuth * Math.PI / 180 + this.north;
  var sx = Math.cos(el) * Math.sin(az), sy = Math.sin(el), sz = -Math.cos(el) * Math.cos(az);

  /* the light moves to where the disc is and keeps looking at its target */
  this.sunOffset.set(sx, sy, sz).multiplyScalar(SUN_REACH);
  this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
  this.sun.color.setRGB(row.sun[0], row.sun[1], row.sun[2]);
  this.sun.intensity = row.sunK * Math.PI;
  this.hemi.color.setRGB(row.sky[0], row.sky[1], row.sky[2]);
  this.hemi.groundColor.setRGB(row.land[0], row.land[1], row.land[2]);
  this.hemi.intensity = row.skyK * Math.PI;
  this.ambient.color.setRGB(row.fill[0], row.fill[1], row.fill[2]);
  this.ambient.intensity = row.fillK * Math.PI;

  /* both skies */
  var skies = [this.sky, this.envSky];
  for (var i = 0; i < skies.length; i++) {
    skies[i].turbidity.value = row.turbidity;
    skies[i].rayleigh.value = row.rayleigh;
    skies[i].mieCoefficient.value = row.mieCoefficient;
    skies[i].mieDirectionalG.value = row.mieDirectionalG;
    skies[i].cloudCoverage.value = row.cloud;
    skies[i].sunPosition.value.set(sx, sy, sz);
  }
  this.gain.value.set(row.gain * row.tint[0], row.gain * row.tint[1], row.gain * row.tint[2]);

  /* The disc, scaled so that its brightest channel is SUN_DISC once the gain
     is on it. SkyMesh's showSunDisc is a plain multiplier on the disc. */
  var disc = [0, 0, 0];
  skyLight(sx, sy, sz, sx, sy, sz, row, disc);
  this.discFull = SUN_DISC / Math.max(
    disc[0] * row.gain * row.tint[0], disc[1] * row.gain * row.tint[1], disc[2] * row.gain * row.tint[2]);
  this.discLong = this.discFull * SUN_DISC_LONG / SUN_DISC;
  this.sky.showSunDisc.value = this.discFull;

  /* The land in the environment: what the ground sends back up under this
     hour's sun and sky. A strength already carries the factor of pi, and a
     matt surface sends back its colour times the light on it over pi, so
     the two cancel. */
  var up = row.sunK * sy;
  this.envLand.material.color.setRGB(
    SKY_LAND[0] * (row.sun[0] * up + row.sky[0] * row.skyK + row.fill[0] * row.fillK),
    SKY_LAND[1] * (row.sun[1] * up + row.sky[1] * row.skyK + row.fill[1] * row.fillK),
    SKY_LAND[2] * (row.sun[2] * up + row.sky[2] * row.skyK + row.fill[2] * row.fillK));

  /* The environment, drawn into the same target every time: the texture the
     materials hold stays the one texture, so a change of hour rebuilds no
     material. */
  this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 100, { renderTarget: this.envTarget });
  this.useEnvironment(this.envTarget.texture);

  /* the fog: the part that does not depend on where the camera looks, and
     a first colour, for a camera looking the way the cars leave the line */
  this.row = row;
  this.scene.fog.near = row.haze[0];
  this.scene.fog.far = row.haze[1];
  this.sunDir.set(sx, sy, sz);
  var turns = [0.5, 1, 1.5];
  this.fogBase[0] = this.fogBase[1] = this.fogBase[2] = 0;
  for (var q = 0; q < turns.length; q++) {
    var c = this.horizon(az + turns[q] * Math.PI);
    for (var k = 0; k < 3; k++) this.fogBase[k] += c[k] / turns.length;
  }
  this.fogToward(Math.sin(this.north), -Math.cos(this.north));
  this.renderer.setClearColor(this.scene.fog.color, 1);
};

/* The sky's light at the horizon on bearing `a` (radians, as the sun's), as
   it is drawn: with the gain, the tint and the cap. */
SkyRig.prototype.horizon = function (a) {
  var row = this.row, s = this.sunDir;
  var c = skyLight(Math.sin(a), 0, -Math.cos(a), s.x, s.y, s.z, row);
  for (var k = 0; k < 3; k++) c[k] = Math.min(c[k] * row.gain * row.tint[k], SKY_CAP);
  return c;
};

/* THE FOG takes the colour of the sky at the horizon, in the direction the
   camera looks: (x, z) on the ground, any length. Called for every frame.

   The fog is mixed in linear light before the post pass, which is where the
   sky is drawn too, so the sky's own number is the fog's number and nothing
   has to be run backwards through the tone map as the dome's haze is
   (Game.applyHaze).

   The horizon is not one colour. Towards a low sun it is many times brighter
   than away from it, and one fixed fog colour leaves a hard line where the
   far ground meets the sky in every direction but one. So the fog is the
   horizon across the width of the view (five bearings, 25 degrees apart),
   which is also what haze does: it is bright towards the sun and dull away
   from it. It is held to FOG_GLARE times the mean of the three quarters of
   the horizon that are not the sun's, because fog as bright as the glow
   round a setting sun would wipe out the road ahead. */
SkyRig.prototype.fogToward = function (x, z) {
  if (this.mode !== 'physical' || !this.row) return;
  /* looking straight down: keep the last colour */
  if (x * x + z * z < 1e-6) return;
  var a0 = Math.atan2(x, -z), base = this.fogBase;
  var top = FOG_GLARE * (0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]);
  var r = 0, g = 0, b = 0;
  for (var i = -2; i <= 2; i++) {
    var c = this.horizon(a0 + i * 25 * Math.PI / 180);
    var l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    var f = l > top ? top / l : 1;
    r += c[0] * f / 5; g += c[1] * f / 5; b += c[2] * f / 5;
  }
  this.scene.fog.color.setRGB(r, g, b);
};

/* Puts the fog back in the rig's hands. Game.applyHaze writes the dome's
   haze colour and the clear colour on every change of tier, before it knows
   which sky the tier has, and setMode and setTimeOfDay do nothing when asked
   for what they already hold. So whoever applies a tier calls this after
   both: under the physical sky it writes the hour's fog again, and under the
   dome it leaves what applyHaze wrote. */
SkyRig.prototype.takeFog = function () {
  if (this.mode !== 'physical' || !this.row) return;
  this.scene.fog.near = this.row.haze[0];
  this.scene.fog.far = this.row.haze[1];
  this.fogToward(Math.sin(this.north), -Math.cos(this.north));
  this.renderer.setClearColor(this.scene.fog.color, 1);
};

SkyRig.prototype.dispose = function () {
  this.useEnvironment(null);
  this.scene.remove(this.root);
  this.dome.geometry.dispose();
  this.dome.material.dispose();
  this.domeEnvironment.dispose();
  if (this.sky) {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.envSky.geometry.dispose();
    this.envSky.material.dispose();
    this.envLand.geometry.dispose();
    this.envLand.material.dispose();
    if (this.envTarget) this.envTarget.dispose();
    this.pmrem.dispose();
  }
};
