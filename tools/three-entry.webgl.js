/* What goes into vendor/three.webgl.js: the WebGLRenderer flavour of the
 * vendored engine. Built by tools/vendor-three.js, never loaded by node and
 * never shipped as it stands.
 *
 * WHY A LIST. three.js 0.187 ships ES modules only, and the game is plain
 * scripts that read one global called THREE. The bundler turns this file into
 * that global: every name exported here becomes THREE.<Name>. The names are
 * given one by one, not with `export *`, so the bundler can leave out what
 * the game never touches.
 *
 * TO ADD A NAME: add it here, run the tool again, and commit the entry with
 * the code that uses the name. A name the source uses that is missing from
 * this list is `undefined` on THREE, with no error until it is called.
 *
 * `three` and `three/addons/...` are not found the way node finds packages.
 * The tool maps them onto the copy of three in its workdir (see `resolver`
 * in tools/vendor-three.js), so nothing here ever reads the repo's
 * package.json or a node_modules beside it. */

/* 1. Every THREE.<Name> the source uses today:
 *      grep -oh "THREE\.[A-Za-z0-9_]*" src/*.js | sort -u
 *    run on the tree at ce5272a, 43 names. One of them is gone from 0.187 and
 *    is left out: sRGBEncoding (its replacement is in group 2). */
export {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapLinearFilter,
  NoToneMapping,
  OrthographicCamera,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer
} from 'three';

/* 2. What the move to 0.187 needs that the source does not name yet.
 *    SRGBColorSpace and LinearSRGBColorSpace stand where sRGBEncoding stood
 *    (`.encoding` became `.colorSpace`). PCFShadowMap is what 0.187 uses in
 *    place of PCFSoftShadowMap, which it still exports but no longer draws:
 *    it warns once and falls back. HalfFloatType is for a render target that
 *    holds linear light before the post pass tone maps it. MathUtils is there
 *    for the stills tool (generateUUID), Object3D for tools/stills-pin-check.js
 *    and REVISION so a check can ask the bundle which release it is. */
export {
  HalfFloatType,
  LinearSRGBColorSpace,
  MathUtils,
  Object3D,
  PCFShadowMap,
  REVISION,
  SRGBColorSpace
} from 'three';

/* 3. The addons Ultra uses on this path. Paths and names were checked
 *    against the unpacked three@0.187.0 package: each file below exports
 *    exactly the one name taken from it. */
export { CSM } from 'three/addons/csm/CSM.js';
export { Sky } from 'three/addons/objects/Sky.js';
export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
export { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
export { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
export { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
