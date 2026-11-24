/* =========================================================================
   MCL-64  —  the shadows: one rig for the three ways a tier can have them
   ========================================================================= */

/* THE THREE MODES (TIERS[...].shadows, set through Game.applyShadowMode).

     'blob'      no shadow map at all. The dark disc under each car is the
                 game's, not the rig's: the rig only switches the sun's
                 shadow off.
     'single'    one map in a tight box that follows the player's car. This
                 is what Modern has always drawn.
     'cascades'  several maps laid out along the camera's view, small and
                 sharp near the camera and wide and coarse far away, so that
                 everything the camera can see out to SHADOW_WIDE.far has a
                 shadow. The engine's CSMShadowNode does the laying out.

   WHERE THE SUN IS. The rig never decides the sun's direction. A directional
   light shines from its position towards its target, and the rig reads that
   pair every time update() runs, so whoever moves the sun (the sky, for the
   time of day) only has to place `sun.position` relative to
   `sun.target.position` and call update(). What the rig does move is the
   pair together, to `focus`, which the game sets to the player's car: the
   single map's box is centred on the target.

   Game code calls update() once a frame, after the camera is in its place
   for that frame: the cascades are laid out from the camera. */

/* The cascades. `splits` are the far edge of each cascade as a share of
   `far`, so their number is the number of cascades, and `mapSizes` is the
   size of each one's map.

   Why not the engine's 'practical' split, which the plan started from: with
   four cascades to 700 m it ends the first one 89 m out. On a screen twice
   as wide as it is tall that first map has to cover a square 260 m across,
   which is 13 cm a texel under the player's own car, twice as coarse as
   Modern's single map. These splits end the first cascade at 42 m, where a
   texel is 6 to 7 cm, as in Modern, the second at 119 m and the third at
   315 m. (The 13 cm is worked out from the engine's sums, not measured from
   a picture: the practical split was never drawn.)

   What a texel is in each, at 2048, for the chase camera on a screen twice
   as wide as it is tall: 7 cm, 20 cm, half a metre and a little over a
   metre. A car keeps a shadow of its own shape through the second cascade
   and a thinner one through the third; in the last a texel is as big as
   half a car and only trees, stands and buildings cast anything to speak
   of. The sizes are one for each cascade so that one of them can be raised
   alone: [2048, 4096, 4096, 2048] was tried, and at the size of the stills
   it drew the same picture, so it was not kept. */
var SHADOW_WIDE = {
  mapSizes: [2048, 2048, 2048, 2048],
  far: 700,
  splits: [0.06, 0.17, 0.45, 1],
  /* how far towards the sun, beyond the part of the view a cascade covers,
     something may stand and still cast into it */
  lightMargin: 200
};

/* The cascades are laid out for a camera with its field of view rounded UP
   to a multiple of this many degrees. The game's field of view widens with
   speed, a little every frame; laid out from the true figure, every cascade
   would change size every frame, and the texels of its map would slide
   under the edges of shadows that are standing still. Rounded, the layout
   holds until the field of view crosses a step. */
var SHADOW_FOV_STEP = 8;

/* ...and holds a little longer on the way down. The chase camera's field of
   view is 52 degrees plus 10 for speed, so it stands at the 56 degree step
   at 132 km/h, a speed a car passes into and out of most corners and can
   sit on through a long one; the driver's eye camera does the same at 72
   degrees and 110 km/h. With one threshold for both directions a field of
   view hovering there laid all four cascades out again and again, and each
   time every shadow edge moved to a new grid of texels. So a layout is
   taken up the moment the field of view passes its step, as it must be to
   cover the view, and is only given up for the narrower one when the field
   of view is this many degrees under the step: about 50 km/h of speed in
   the chase camera, so 82 km/h on the way down against 132 on the way up. */
var SHADOW_FOV_HOLD = 1.5;

function ShadowRig(scene, camera, sun) {
  this.scene = scene;
  this.camera = camera;
  this.sun = sun;
  this.mode = null;
  /* the point the shadows are centred on; the game sets it before update() */
  this.focus = new THREE.Vector3();
  this.csm = null;

  /* from the target to the sun, and where the rig last left the two, so it
     can tell when somebody else has moved either (see update) */
  this.offset = new THREE.Vector3();
  this.sunAt = new THREE.Vector3(NaN, NaN, NaN);
  this.targetAt = new THREE.Vector3(NaN, NaN, NaN);

  /* the stand in for the camera that the cascades are laid out from: the
     game camera's place and heading, with the rounded field of view */
  this.view = new THREE.PerspectiveCamera();
  this.view.matrixAutoUpdate = false;

  /* THE SINGLE MAP. A tight ortho box that FOLLOWS THE CAR rather than one
     big enough to cover the circuit: Silverstone is 1.8 km across, and a
     shadow map stretched over that has metre-wide texels and casts nothing
     you would recognise. 70 m around the player at 2048 gives roughly 7 cm
     per texel (the box is 140 m across). */
  sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
  sc.near = 1; sc.far = 900;
  /* Normal bias rather than a big constant bias: constant bias on a surface
     this shallow detaches the shadow from the tyre and it floats. */
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  /* THE FILTER, and why nothing here sets it. r128 drew PCFSoftShadowMap, a
     fixed 3 x 3 kernel that took no radius. 0.187's PCFShadowMap takes five
     samples on a small disc, turned by a different amount at each pixel, and
     shadow.radius is the size of that disc in texels. It is left at the
     engine's 1: at 0, 0.5 and 2 the picture is as far from r128's as at 1, to
     within 0.02 of a level, because a texel here is under 7 cm and the edge
     is thinner than a pixel from any camera the game has. shadow.intensity
     stays at 1 too: lowering it only lightens the shadow, which moves it
     away from r128's. The two bias values above carried over unchanged, with
     no acne and no detached shadow.

     One thing did change and is not a setting. A caster with an alpha test
     (the trees) now casts its own outline. On r128 the shadow pass ignored
     the alpha test, so a tree cast the shadow of its whole card. */
  /* REQUIRED. Editing left/right/top/bottom does not rebuild the projection,
     so without this the shadow camera keeps its default +/-5 box, the entire
     circuit falls outside the frustum, and every surface samples as occluded —
     the whole world renders black. */
  sc.updateProjectionMatrix();

  /* until a tier says otherwise: the single map, as the world was always
     built */
  this.setMode('single');
}

ShadowRig.prototype.setMode = function (mode) {
  if (mode !== 'blob' && mode !== 'single' && mode !== 'cascades') throw new Error('unknown shadow mode ' + mode);
  if (mode === this.mode) return;
  var had = this.mode === 'cascades';
  this.mode = mode;
  this.sun.castShadow = mode !== 'blob';
  if (had) this.dropCascades();
  if (mode === 'cascades') this.buildCascades();
  /* HOW THE ENGINE IS TOLD. The engine builds a light's shadow once and
     keeps it; switching castShadow makes it build every lit material again,
     which is all 'blob' against 'single' needs. Between 'single' and
     'cascades' castShadow stays on, and the engine would go on drawing with
     the shadow it already has. Disposing of the light is the signal it
     listens for: it lets go of the shadow it built (and frees that map), and
     the next frame builds the materials again with whichever shadow the sun
     carries now. */
  if (had || mode === 'cascades') this.sun.dispose();
};

ShadowRig.prototype.buildCascades = function () {
  var rig = this;
  var csm = this.csm = new THREE.CSMShadowNode(this.sun, {
    cascades: SHADOW_WIDE.splits.length,
    maxFar: SHADOW_WIDE.far,
    mode: 'custom',
    customSplitsCallback: function (amount, near, far, target) {
      for (var i = 0; i < amount; i++) target.push(SHADOW_WIDE.splits[i]);
    },
    lightMargin: SHADOW_WIDE.lightMargin
  });
  /* blend from one cascade into the next over a margin, so there is no line
     on the ground where the texels change size */
  csm.fade = true;

  /* The node makes its cascades the first time a material is built with it,
     inside the frame that draws that material, from the camera that frame
     is drawn with. The rig needs them laid out from its own stand in for
     the camera and with its own bias for each, and needs that before the
     same frame goes on to draw the shadow maps, or the first frame of Ultra
     (which is the whole of a still) would be drawn with the engine's values.
     So the rig steps in right after the node has made them. */
  var setup = csm.setup;
  csm.setup = function (builder) {
    var first = this.camera === null;
    var node = setup.call(this, builder);
    if (first) rig.layOutCascades(true);   /* afresh: see syncView */
    return node;
  };

  this.sun.shadow.shadowNode = csm;
};

ShadowRig.prototype.dropCascades = function () {
  var csm = this.csm;
  if (!csm) return;
  this.csm = null;
  delete this.sun.shadow.shadowNode;
  /* takes the cascades' own lights back out of the scene */
  csm.dispose();
  /* THE ENGINE'S SHADOW NODE FOR EACH CASCADE, which the line above does not
     free. Each owns the depth material its cascade is drawn with, and the
     renderer keeps one render object, with its own uniform buffer, for every
     caster drawn with that material until the material is disposed. Left
     alone, every visit to Ultra left those behind for good: 62 of them a
     visit from the title screen at Silverstone, counted. Disposing of the
     node frees the material, which lets go of the render objects, and the
     map with it. `_shadowNodes` is a private field of the engine's node, so
     it is on the list of things an engine update must check (CLAUDE.md). */
  var nodes = csm._shadowNodes || [];
  for (var n = 0; n < nodes.length; n++) nodes[n].dispose();
  /* and their maps, for a cascade whose node was never made (a second
     dispose of a map the node has already freed does nothing) */
  for (var i = 0; i < csm.lights.length; i++) csm.lights[i].shadow.dispose();
};

/* Copies the game camera into the stand in. True when the stand in's
   projection changed, which is when the cascades have to be laid out again.

   `afresh` rounds the field of view with no memory of the layout before
   (see SHADOW_FOV_HOLD). The first layout of a set of cascades is made
   that way, and so is a still's: what a still shows must depend on where
   its camera is and not on where the camera was before it. */
ShadowRig.prototype.syncView = function (afresh) {
  var cam = this.camera, view = this.view;
  cam.updateMatrixWorld();
  view.matrixWorld.copy(cam.matrixWorld);
  var fov = Math.min(170, Math.ceil(cam.fov / SHADOW_FOV_STEP) * SHADOW_FOV_STEP);
  if (!afresh && fov < view.fov && cam.fov > view.fov - SHADOW_FOV_STEP - SHADOW_FOV_HOLD) fov = view.fov;
  if (fov === view.fov && cam.aspect === view.aspect && cam.far === view.far) return false;
  view.fov = fov;
  view.aspect = cam.aspect;
  /* the chase camera's near plane, whichever camera is on: the onboard
     cameras pull theirs in to 12 cm, and the cascades need not move for it */
  view.near = 0.6;
  view.far = cam.far;
  view.updateProjectionMatrix();
  return true;
};

/* Lays the cascades out from the stand in for the camera, when its
   projection has changed (or `force`, which also lays them out afresh: see
   syncView), and sets each cascade's own reach and bias. Does nothing until
   the node has made its cascades. */
ShadowRig.prototype.layOutCascades = function (force) {
  var csm = this.csm;
  if (!csm || csm.camera === null) return;
  var moved = this.syncView(force);
  if (csm.camera !== this.view) { csm.camera = this.view; moved = true; }
  if (moved || force) csm.updateFrustums();

  /* HOW MUCH BIAS. A texel of a cascade's map covers `texel` metres of the
     plane the sun looks at. The ground is tilted against that plane, so from
     one texel to the next the ground's depth, as the sun measures it, changes
     by texel x slope, where slope is 1 over the tangent of the sun's height
     in the sky: 0.9 at the midday sun the game has always had, and more as
     the sun goes down. The filter reads up to about two texels away, so a
     bias under that draws the ground as shadowing itself in stripes. The
     bias is therefore a number of texels, for each cascade, and follows the
     sun. The engine takes it as a share of the shadow camera's depth range,
     hence the division.

     The slope is capped: a sun near the horizon would otherwise ask for a
     bias taller than a car, and the car would lose its shadow before the
     ground lost its stripes. */
  var o = this.offset;
  var up = o.y / (o.length() || 1);
  var slope = up > 0 ? Math.min(Math.sqrt(Math.max(0, 1 - up * up)) / up, 3) : 3;
  for (var i = 0; i < csm.lights.length; i++) {
    var sh = csm.lights[i].shadow, cam = sh.camera;
    var width = cam.right - cam.left;
    var size = SHADOW_WIDE.mapSizes[i];
    var texel = width / size;
    if (moved || force) {
      sh.mapSize.set(size, size);
      /* The cascade's light stands lightMargin beyond the nearest corner of
         its part of the view, and no two points of that part are further
         apart than the box is wide, so this reaches all of it whichever way
         the camera faces. The engine's own figure is the sun's (900 m),
         which is short of the far side of the last cascade. */
      cam.near = 1;
      cam.far = width + SHADOW_WIDE.lightMargin + 1;
      cam.updateProjectionMatrix();
    }
    sh.bias = -(0.05 + 1.5 * texel * slope) / (cam.far - cam.near);
    sh.normalBias = Math.max(0.035, 0.5 * texel);
  }
};

/* Once a frame, and again by whoever has just moved the sun. `afresh` is
   for a still (see syncView). */
ShadowRig.prototype.update = function (afresh) {
  if (this.mode !== 'single' && this.mode !== 'cascades') return;
  var sun = this.sun;
  /* THE SUN'S DIRECTION IS READ FRESH, from the light itself, whenever the
     light is not exactly where the rig left it: that is somebody else having
     moved it, and theirs is the direction. When nothing has touched it the
     rig uses the offset it already holds, and does not take it again from
     the two positions it wrote: the subtraction would lose the last bits of
     it, a little more each frame, and the shadows of a still would depend
     on how many frames came before it. */
  if (!sun.position.equals(this.sunAt) || !sun.target.position.equals(this.targetAt)) {
    this.offset.subVectors(sun.position, sun.target.position);
  }
  /* Walk the shadows along with the car. The light keeps its DIRECTION —
     position and target move together — so the sun angle never changes as you
     drive; only the volume being sampled does. */
  sun.target.position.copy(this.focus);
  sun.position.addVectors(this.focus, this.offset);
  sun.target.updateMatrixWorld();
  this.sunAt.copy(sun.position);
  this.targetAt.copy(sun.target.position);

  if (this.mode === 'cascades') this.layOutCascades(!!afresh);
};

ShadowRig.prototype.dispose = function () {
  this.dropCascades();
  this.mode = null;
  this.sun.castShadow = false;
  /* frees the single map, and has the engine let go of whichever shadow it
     built (see setMode) */
  this.sun.dispose();
};
