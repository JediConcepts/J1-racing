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
 * - This renderer does not draw ShaderMaterial. The post pass, which was
 *   GLSL in a ShaderMaterial on r128, is a node material in the source now
 *   (buildPostNode in src/40-game.js). */

/* 1. Every THREE.<Name> the source used while it drew through r128 (see the
 *    WebGL entry for the grep), less sRGBEncoding, which is gone from 0.187,
 *    and WebGLRenderer, which this build does not have.
 *
 *    Since the game moved to this bundle the source no longer names five of
 *    them: OrthographicCamera, PCFSoftShadowMap, PMREMGenerator,
 *    ShaderMaterial and WebGLRenderTarget. They are still exported and
 *    nothing reads them. Taking them out means building the bundle again,
 *    which is left for a later change. */
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

/* 2. What the move to 0.187 needed beyond the r128 list. The same seven
 *    names as in the WebGL entry, for the same reasons, and two more that
 *    only this flavour needs. ColorManagement, because the game switches
 *    colour management off (it converts its own colours, as it did for
 *    r128). UnsignedByteType, for the 8 bit render target that Retro draws
 *    into. The source names seven of the nine now (REVISION is read by the
 *    colour management guard at the top of src/10-core.js); MathUtils and
 *    Object3D are for the tools, as the WebGL entry says. */
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
 *    three inside itself, so naming them adds nothing to the file.
 *
 *    The source draws its post pass by hand, with NodeMaterial and QuadMesh
 *    into a RenderTarget. It names neither RenderPipeline nor
 *    MeshBasicNodeMaterial. */
export {
  MeshBasicNodeMaterial,
  NodeMaterial,
  QuadMesh,
  RenderPipeline,
  RenderTarget,
  WebGPURenderer
} from 'three/webgpu';

/* 4. The `three/tsl` functions, as THREE.TSL.<name>. The list was drawn up
 *    from the GLSL post pass r128 had (POST_FRAG, which is gone) for writing
 *    it as nodes, function for function, plus `pass` (the scene as an input
 *    to the post chain) and `renderOutput` (tone mapping and the output
 *    colour space). Most arithmetic is also a method on a node (`a.mul(b)`,
 *    `a.floor()`), so the list stays short.
 *
 *    The pass as it is written now (buildPostNode in src/40-game.js) uses
 *    Fn, clamp, dot, float, mix, renderOutput, texture, uniform, uv, vec2,
 *    vec3 and vec4. It does not use If, floor, mod or pass: the arithmetic
 *    went to node methods, and the scene is drawn into a target the game
 *    owns. Those four are still exported and nothing reads them.
 *
 *    Two names are here for the canvas textures and not for the post pass
 *    (decodeCanvasMaps in src/10-core.js): `reference`, which reads a
 *    property of the mesh being drawn, and `sRGBTransferEOTF`, the engine's
 *    own conversion from sRGB values to light. r128 made that conversion in
 *    the shader after the GPU had smoothed the texture, and the game does
 *    so again. */
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
  reference,
  renderOutput,
  sRGBTransferEOTF,
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
  reference: reference,
  renderOutput: renderOutput,
  sRGBTransferEOTF: sRGBTransferEOTF,
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
