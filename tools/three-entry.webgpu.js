/* What goes into vendor/three.webgpu.js: the WebGPURenderer flavour of the
 * vendored engine, which carries its own WebGL 2 fallback. Built by
 * tools/vendor-three.js, never loaded by node and never shipped as it stands.
 *
 * Read the header of tools/three-entry.webgl.js first: why this is a list of
 * names, how to add one, and how `three/...` is found. What differs here:
 *
 * - The core comes from `three/webgpu`, not `three`. That build has no
 *   WebGLRenderer; WebGPURenderer stands in its place.
 * - The shader functions come from `three/tsl` and are gathered under
 *   THREE.TSL, the name three.js itself uses for them. They cannot sit flat
 *   on THREE: `log` is a console helper in `three/webgpu` and a logarithm in
 *   `three/tsl`, and one global cannot hold both.
 * - ShaderMaterial is exported so the source still loads, but this renderer
 *   does not draw it. A pass written in GLSL has to become a node material. */

/* 1. Every THREE.<Name> the source uses today (see the WebGL entry for the
 *    grep), less sRGBEncoding, which is gone from 0.187, and WebGLRenderer,
 *    which this build does not have. */
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
  WebGLRenderTarget
} from 'three/webgpu';

/* 2. What the move to 0.187 needs that the source does not name yet. The
 *    same seven names as in the WebGL entry, for the same reasons, and two
 *    more that only this flavour needs. ColorManagement, because the game
 *    switches colour management off (it converts its own colours, as it did
 *    for r128). UnsignedByteType, for the 8 bit render target that Retro
 *    draws into. */
export {
  ColorManagement,
  HalfFloatType,
  LinearSRGBColorSpace,
  MathUtils,
  Object3D,
  PCFShadowMap,
  REVISION,
  SRGBColorSpace,
  UnsignedByteType
} from 'three/webgpu';

/* 3. This renderer and what stands beside it. RenderPipeline is the post
 *    chain (it was called PostProcessing in older releases). RenderTarget is
 *    the plain target this renderer takes. NodeMaterial, MeshBasicNodeMaterial
 *    and QuadMesh are for a post pass drawn by hand. The renderer uses all
 *    three inside itself, so naming them adds nothing to the file. */
export {
  MeshBasicNodeMaterial,
  NodeMaterial,
  QuadMesh,
  RenderPipeline,
  RenderTarget,
  WebGPURenderer
} from 'three/webgpu';

/* 4. The `three/tsl` functions used, as THREE.TSL.<name>. The list is what
 *    the Retro and Modern post pass (POST_FRAG in src/40-game.js) needs when
 *    it is written as nodes, function for function, plus `pass` (the scene
 *    as an input to the post chain) and `renderOutput` (tone mapping and the
 *    output colour space, done in the post chain). Most arithmetic is also a
 *    method on a node (`a.mul(b)`, `a.floor()`), so the list stays short. */
import {
  Fn,
  If,
  clamp,
  dot,
  float,
  floor,
  mix,
  mod,
  pass,
  renderOutput,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4
} from 'three/tsl';

export const TSL = {
  Fn: Fn,
  If: If,
  clamp: clamp,
  dot: dot,
  float: float,
  floor: floor,
  mix: mix,
  mod: mod,
  pass: pass,
  renderOutput: renderOutput,
  texture: texture,
  uniform: uniform,
  uv: uv,
  vec2: vec2,
  vec3: vec3,
  vec4: vec4
};

/* 5. The addons Ultra uses on this path. Paths and names were checked
 *    against the unpacked three@0.187.0 package. CSMShadowNode and SkyMesh
 *    are each the one name their file exports. BloomNode.js exports the
 *    function `bloom` by name and the class BloomNode as its default; the
 *    function is the one a post chain calls. */
export { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
export { SkyMesh } from 'three/addons/objects/SkyMesh.js';
export { bloom } from 'three/addons/tsl/display/BloomNode.js';
