const toDegrees = (radians) => radians * 180 / Math.PI
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)

// MediaPipe returns a column-major canonical-face-to-camera 4×4 transform.
// Our Euler convention is R = Rz(roll) * Ry(yaw) * Rx(pitch), in degrees.
// Coordinates describe the original input; CSS mirroring does not change them.
export function extractHeadPose(matrix) {
  if (matrix?.rows !== 4 || matrix?.columns !== 4 || matrix.data?.length !== 16) return null
  const m = matrix.data
  if (!Array.from(m).every(Number.isFinite)) return null
  if (Math.abs(m[3]) > 1e-5 || Math.abs(m[7]) > 1e-5 ||
      Math.abs(m[11]) > 1e-5 || Math.abs(m[15] - 1) > 1e-5) return null

  // Ignore translation and remove positive axis scales from the rotation block.
  const axes = [0, 4, 8].map((offset) => [m[offset], m[offset + 1], m[offset + 2]])
  const lengths = axes.map((axis) => Math.hypot(...axis))
  if (lengths.some((length) => length < 1e-8)) return null
  const [x, y, z] = axes.map((axis, i) => axis.map((value) => value / lengths[i]))
  const determinant = x[0] * (y[1] * z[2] - y[2] * z[1])
    - y[0] * (x[1] * z[2] - x[2] * z[1]) + z[0] * (x[1] * y[2] - x[2] * y[1])
  // Reject malformed/sheared/reflected matrices instead of displaying bogus angles.
  if (Math.abs(dot(x, y)) > 0.02 || Math.abs(dot(x, z)) > 0.02 ||
      Math.abs(dot(y, z)) > 0.02 || Math.abs(determinant - 1) > 0.02) return null

  const yaw = Math.asin(Math.max(-1, Math.min(1, -x[2])))
  const singular = Math.abs(Math.cos(yaw)) < 1e-6
  // At ±90° yaw, pitch/roll cannot be separated; choose roll=0 deterministically.
  const pitch = singular ? Math.atan2(-z[1], y[1]) : Math.atan2(y[2], z[2])
  const roll = singular ? 0 : Math.atan2(x[1], x[0])
  return { yaw: toDegrees(yaw), pitch: toDegrees(pitch), roll: toDegrees(roll) }
}
