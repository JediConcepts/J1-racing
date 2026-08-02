/* =========================================================================
   MCL-64  —  deterministic transcendentals
   =========================================================================

   ECMAScript does NOT require Math.sin/cos/tan/atan2/log to be correctly
   rounded, so V8 and JavaScriptCore disagree by up to 1 ULP. Measured on
   THIS simulation, a 1e-9 difference in a single steering value grows to
   roughly 5 km of positional divergence by step 15,000 of a race — the
   off-track, on-kerb, DRS-zone and contact branches turn a last-bit
   difference into a completely different race. A Safari client and a Deno
   validator would therefore never agree, and replay validation would be
   impossible.

   These replacements are built only from operations IEEE 754 requires to be
   correctly rounded — + - * / and comparisons — plus Math.round/abs, which
   are exact. That makes them bit-identical on every engine, OS and CPU.

   Deliberately NOT reimplemented: Math.sqrt, Math.exp, Math.pow, Math.cbrt.
   Those were measured bit-identical across V8 and JavaScriptCore already
   (sqrt is required to be correctly rounded; the others agree in practice),
   so wrapping them would add error for nothing.

   Accuracy target is ~1e-16 relative, i.e. indistinguishable from the
   built-ins for handling purposes. Determinism is the point; accuracy just
   has to be good enough that the car feels identical.
   ========================================================================= */

var FP_PI = 3.141592653589793;
var FP_TWO_PI = 6.283185307179586;
var FP_HALF_PI = 1.5707963267948966;
var FP_QUARTER_PI = 0.7853981633974483;
var INV_HALF_PI = 0.6366197723675814;          /* 2/pi */

/* pi/2 split so that n * PIO2 is exact in the first term and the remainder
   carries the low bits. Two terms hold full precision for |n| well beyond
   anything this game produces (yaw accumulates, but stays under a few
   thousand radians even in a very long race). */
var PIO2_HI = 1.5707963267341256;
var PIO2_LO = 6.077100506506192e-11;

/* minimax kernels on [-pi/4, pi/4] (fdlibm coefficients) */
var S1 = -1.66666666666666324348e-01;
var S2 = 8.33333333332248946124e-03;
var S3 = -1.98412698298579493134e-04;
var S4 = 2.75573137070700676789e-06;
var S5 = -2.50507602534068634195e-08;
var S6 = 1.58969099521155010221e-10;

var K1 = 4.16666666666666019037e-02;
var K2 = -1.38888888888741095749e-03;
var K3 = 2.48015872894767294178e-05;
var K4 = -2.75573143513906633035e-07;
var K5 = 2.08757232129817482790e-09;
var K6 = -1.13596475577881948265e-11;

function fpKernelSin(r) {
  var z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function fpKernelCos(r) {
  var z = r * r;
  var poly = K1 + z * (K2 + z * (K3 + z * (K4 + z * (K5 + z * K6))));
  return 1.0 - 0.5 * z + z * z * poly;
}

/* Reduce x to the nearest multiple of pi/2. Returns the remainder; the
   quadrant is left in fpQuadrant because JS has no cheap multi-return and
   this runs in the physics hot path. */
var fpQuadrant = 0;

function fpReduce(x) {
  var n = Math.round(x * INV_HALF_PI);
  fpQuadrant = n & 3;                       /* ToInt32 is exactly specified */
  return (x - n * PIO2_HI) - n * PIO2_LO;
}

function dsin(x) {
  var r = fpReduce(x);
  var q = fpQuadrant;
  if (q === 0) return fpKernelSin(r);
  if (q === 1) return fpKernelCos(r);
  if (q === 2) return -fpKernelSin(r);
  return -fpKernelCos(r);
}

function dcos(x) {
  var r = fpReduce(x);
  var q = fpQuadrant;
  if (q === 0) return fpKernelCos(r);
  if (q === 1) return -fpKernelSin(r);
  if (q === 2) return -fpKernelCos(r);
  return fpKernelSin(r);
}

function dtan(x) {
  var r = fpReduce(x);
  var q = fpQuadrant;
  var s = fpKernelSin(r), c = fpKernelCos(r);
  /* odd quadrants swap sine and cosine and flip the sign */
  return (q === 1 || q === 3) ? -c / s : s / c;
}

/* atan on |t| <= tan(pi/8); fdlibm's polynomial, split into even and odd
   halves so the two chains can pipeline */
var A0 = 3.33333333333329318027e-01;
var A1 = -1.99999999998764832476e-01;
var A2 = 1.42857142725034663711e-01;
var A3 = -1.11111104054623557880e-01;
var A4 = 9.09088713343650656196e-02;
var A5 = -7.69187620504482999495e-02;
var A6 = 6.66107313738753120669e-02;
var A7 = -5.83357013379057348645e-02;
var A8 = 4.97687799461593236017e-02;
var A9 = -3.65315727442169155270e-02;
var A10 = 1.62858201153657823623e-02;

function fpKernelAtan(t) {
  var z = t * t, w = z * z;
  var s1 = z * (A0 + w * (A2 + w * (A4 + w * (A6 + w * (A8 + w * A10)))));
  var s2 = w * (A1 + w * (A3 + w * (A5 + w * (A7 + w * A9))));
  return t - t * (s1 + s2);
}

var TAN_PI_8 = 0.41421356237309503;            /* sqrt(2) - 1 */

function datan(x) {
  var neg = x < 0;
  var a = neg ? -x : x;
  var r;
  if (a > 1.0) {
    /* atan(a) = pi/2 - atan(1/a) */
    var inv = 1.0 / a;
    if (inv > TAN_PI_8) {
      r = FP_HALF_PI - (FP_QUARTER_PI + fpKernelAtan((inv - 1.0) / (inv + 1.0)));
    } else {
      r = FP_HALF_PI - fpKernelAtan(inv);
    }
  } else if (a > TAN_PI_8) {
    /* atan(a) = pi/4 + atan((a-1)/(a+1)), which lands inside the kernel range */
    r = FP_QUARTER_PI + fpKernelAtan((a - 1.0) / (a + 1.0));
  } else {
    r = fpKernelAtan(a);
  }
  return neg ? -r : r;
}

function datan2(y, x) {
  if (x === 0) {
    if (y > 0) return FP_HALF_PI;
    if (y < 0) return -FP_HALF_PI;
    return 0;                                  /* atan2(0,0) — never hit in the sim */
  }
  var a = datan(y / x);
  if (x > 0) return a;
  return y >= 0 ? a + FP_PI : a - FP_PI;
}
