const FRAME_INTERVAL_MS = 1000 / 12;
const RENDER_SCALE = 0.55;

const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uTint;

float hash21(vec2 value) {
  value = fract(value * vec2(123.34, 456.21));
  value += dot(value, value + 45.32);
  return fract(value.x * value.y);
}

void main() {
  vec2 coordinate = gl_FragCoord.xy;
  float timeStep = floor(uTime * 1.8);
  float row = floor(coordinate.y / 13.0);
  float glitchGate = step(0.972, hash21(vec2(timeStep, row)));
  coordinate.x += glitchGate * sin(uTime * 17.0 + row) * 12.0;

  vec2 cellSize = vec2(8.0, 13.0);
  vec2 cell = floor(coordinate / cellSize);
  vec2 local = fract(coordinate / cellSize);
  vec2 matrixCell = floor(local * vec2(3.0, 5.0));
  vec2 matrixLocal = fract(local * vec2(3.0, 5.0)) - 0.5;

  float activeCell = step(0.28, hash21(cell * 0.37));
  float bit = step(0.52, hash21(cell * 11.7 + matrixCell * 3.1 + timeStep * 0.013));
  float dot = 1.0 - smoothstep(0.18, 0.42, length(matrixLocal));
  float edge = step(0.05, local.x) * step(local.x, 0.95) * step(0.04, local.y) * step(local.y, 0.96);
  float glyph = activeCell * bit * dot * edge;

  float scanline = 0.76 + 0.24 * sin(coordinate.y * 1.55 + uTime * 2.2);
  float sweep = 0.82 + 0.18 * sin((coordinate.y / uResolution.y) * 10.0 - uTime * 0.7);
  vec2 uv = gl_FragCoord.xy / uResolution;
  float vignette = smoothstep(0.95, 0.22, distance(uv, vec2(0.62, 0.42)));
  float noise = hash21(gl_FragCoord.xy + timeStep) * 0.035;
  float intensity = (0.018 + glyph * 0.9 + noise) * scanline * sweep * (0.5 + vignette * 0.5);

  gl_FragColor = vec4(uTint * intensity, 1.0);
}
`;

let canvas;
let gl;
let program;
let resolutionUniform;
let timeUniform;
let tintUniform;
let width = 1;
let height = 1;
let pixelRatio = 1;
let tint = [1, 0.2, 0.28];
let reducedMotion = false;
let visible = true;
let disposed = false;
let timer = 0;
let startedAt = 0;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Faulty Terminal shader compilation failed.");
  }
  return shader;
}

function parseTint(value) {
  const normalized = value.replace("#", "");
  const number = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized, 16);
  return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}

function resize() {
  if (!canvas || !gl) return;
  canvas.width = Math.max(1, Math.round(width * pixelRatio * RENDER_SCALE));
  canvas.height = Math.max(1, Math.round(height * pixelRatio * RENDER_SCALE));
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
}

function render() {
  if (!gl || disposed || !visible) return;
  gl.uniform1f(timeUniform, (performance.now() - startedAt) / 1000);
  gl.uniform3f(tintUniform, tint[0], tint[1], tint[2]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function schedule() {
  clearTimeout(timer);
  if (disposed || reducedMotion || !visible) return;
  timer = setTimeout(() => {
    render();
    schedule();
  }, FRAME_INTERVAL_MS);
}

function initialize(message) {
  canvas = message.canvas;
  width = message.width;
  height = message.height;
  pixelRatio = message.pixelRatio;
  tint = parseTint(message.tint);
  reducedMotion = message.reducedMotion;
  startedAt = performance.now();

  gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
  });
  if (!gl) return;

  const vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Faulty Terminal shader linking failed.");
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  resolutionUniform = gl.getUniformLocation(program, "uResolution");
  timeUniform = gl.getUniformLocation(program, "uTime");
  tintUniform = gl.getUniformLocation(program, "uTint");
  resize();
  render();
  schedule();
}

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "init") {
    initialize(message);
  } else if (message.type === "resize") {
    width = message.width;
    height = message.height;
    pixelRatio = message.pixelRatio;
    resize();
    render();
  } else if (message.type === "tint") {
    tint = parseTint(message.tint);
    render();
  } else if (message.type === "visibility") {
    visible = message.visible;
    if (visible) {
      render();
      schedule();
    } else {
      clearTimeout(timer);
    }
  } else if (message.type === "dispose") {
    disposed = true;
    clearTimeout(timer);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    self.close();
  }
});
