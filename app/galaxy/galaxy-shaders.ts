// 银河场景的 GLSL 着色器资源(自 galaxy-experience.tsx 纯搬移,逐字未改)。
// 每段对应一个 THREE.ShaderMaterial 的 vertex/fragment;改 GLSL 请保持与
// 材质构建处 uniform 命名一致。
export const starVertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uWarp;
  uniform float uPassage;
  uniform float uMaxSize;
  attribute float aScale;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 transformed = position;
    float depthFactor = abs(transformed.z) * 0.03 + 1.0;
    transformed.xy *= 1.0 + uWarp * 0.34 * depthFactor;
    transformed.z += sign(transformed.z + 0.001) * uWarp * 5.5;
    transformed.xy *= 1.0 + uPassage * 0.18 * depthFactor;
    transformed.z += sign(transformed.z + 0.001) * uPassage * 3.2;

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float pulse = 0.76 + 0.24 * sin(uTime * 0.86 + aPhase);
    float pointSize = aScale * uPixelRatio * pulse * (54.0 / max(2.0, -viewPosition.z));
    pointSize *= 1.0 + uWarp * 1.25 + uPassage * 0.72;
    gl_PointSize = clamp(pointSize, 0.65, uMaxSize);
    gl_Position = projectionMatrix * viewPosition;
    vColor = color;
    vAlpha = 0.72 + pulse * 0.28;
  }
`;

export const starFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceToCenter = length(point) * 2.0;
    if (distanceToCenter > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.18, distanceToCenter);
    float halo = 1.0 - smoothstep(0.08, 1.0, distanceToCenter);
    gl_FragColor = vec4(vColor * (0.54 + core * 0.46), (halo * 0.5 + core * 0.32) * vAlpha);
  }
`;

export const stellarVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    vLocalPosition = position;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const stellarFragmentShader = `
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uCorona;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  float hash(vec3 point) {
    point = fract(point * 0.1031);
    point += dot(point, point.yzx + 33.33);
    return fract((point.x + point.y) * point.z);
  }

  void main() {
    vec3 direction = normalize(vLocalPosition);
    float time = uTime * (0.045 + uSeed * 0.002);
    float cells = hash(floor((direction + 1.0) * (18.0 + uSeed)) + floor(time));
    float broad = sin(direction.y * (15.0 + uSeed) + sin(direction.x * 9.0 - time) * 2.1 + time) * 0.5 + 0.5;
    float filament = sin((direction.x + direction.z) * 27.0 - time * 1.7 + cells * 4.0) * 0.5 + 0.5;
    float convection = smoothstep(0.2, 0.86, broad * 0.62 + filament * 0.28 + cells * 0.22);
    float limb = clamp(dot(normalize(vNormal), normalize(vViewDirection)), 0.0, 1.0);
    float edge = pow(1.0 - limb, 2.4);
    vec3 color = mix(uColorB * 0.62, uColorA * 1.18, convection);
    color *= 0.74 + limb * 0.52;
    color += uCorona * edge * (0.16 + filament * 0.12);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const nebulaVertexShader = `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const nebulaFragmentShader = `
  uniform float uTime;
  uniform float uDetail;
  uniform float uPassage;
  varying vec3 vLocalPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = noise(p) * 0.55;
    p = p * 2.02 + 1.7;
    value += noise(p) * 0.26;
    if (uDetail > 0.5) {
      p = p * 2.03 + 2.1;
      value += noise(p) * 0.13;
      p = p * 2.01 + 0.9;
      value += noise(p) * 0.06;
    }
    return value;
  }

  void main() {
    vec3 direction = normalize(vLocalPosition);
    float time = uTime * 0.006;
    float first = fbm(direction * 3.3 + vec3(time, -time * 0.7, time * 0.3));
    float warped = fbm(direction * 6.2 + vec3(first * 1.8, -first, time));
    float veil = smoothstep(0.5, 0.79, warped + first * 0.22);
    float dust = smoothstep(0.62, 0.82, fbm(direction * 9.0 - vec3(time * 0.5)));
    vec3 indigo = vec3(0.05, 0.035, 0.14);
    vec3 mist = vec3(0.19, 0.22, 0.38);
    vec3 color = mix(indigo, mist, smoothstep(0.44, 0.78, first));
    float alpha = veil * 0.16 - dust * 0.055;
    alpha *= 1.0 - uPassage * 0.58;
    gl_FragColor = vec4(color, max(0.0, alpha));
  }
`;

export const planetVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    vLocalPosition = position;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const planetFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = noise(p) * 0.54;
    p = p * 2.03 + 7.1;
    value += noise(p) * 0.27;
    p = p * 2.01 + 3.7;
    value += noise(p) * 0.13;
    p = p * 2.04 + 1.9;
    value += noise(p) * 0.06;
    return value;
  }

  void main() {
    vec3 p = normalize(vLocalPosition);
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(vViewDirection);
    float longitude = atan(p.z, p.x);
    float slowTime = uTime * 0.018;
    float broadWarp = fbm(p * 3.2 + vec3(slowTime, 1.7, -slowTime * 0.4));
    float fineWarp = fbm(p * 8.5 - vec3(0.0, slowTime * 0.8, slowTime));
    float latitude = asin(clamp(p.y, -1.0, 1.0));
    float mainBand = sin(latitude * 20.0 + broadWarp * 4.6 + sin(longitude * 2.0) * 0.38);
    float filament = sin(latitude * 61.0 - fineWarp * 3.4 + longitude * 0.72);
    float bandSignal = mainBand * 0.34 + filament * 0.055 + (broadWarp - 0.5) * 0.52;
    float bands = clamp(0.5 + bandSignal * 0.5, 0.0, 1.0);
    vec2 stormSpace = vec2((longitude - 0.78) * 0.58, (p.y + 0.14) * 2.9);
    float stormRadius = length(stormSpace);
    float stormSpiral = sin(atan(stormSpace.y, stormSpace.x) * 4.0 - stormRadius * 24.0 + uTime * 0.04);
    float storm = exp(-stormRadius * stormRadius * 10.0) * (0.58 + stormSpiral * 0.22);
    vec3 midnight = vec3(0.012, 0.04, 0.07);
    vec3 cobalt = vec3(0.045, 0.18, 0.27);
    vec3 pearl = vec3(0.3, 0.43, 0.48);
    vec3 color = mix(midnight, cobalt, 0.22 + bands * 0.64);
    float cloudPlume = smoothstep(0.68, 0.9, fineWarp * 0.62 + bands * 0.24 + storm * 0.5);
    color = mix(color, pearl, cloudPlume * 0.34 + storm * 0.38);
    vec3 lightDirection = normalize(vec3(-0.44, 0.5, 0.74));
    float rawLight = dot(normal, lightDirection);
    float light = smoothstep(-0.28, 0.78, rawLight);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.4);
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float sheen = pow(max(dot(normal, halfDirection), 0.0), 38.0) * smoothstep(0.0, 0.3, rawLight);
    color *= 0.045 + light * 0.96;
    color += sheen * vec3(0.5, 0.66, 0.72) * 0.22;
    color += fresnel * vec3(0.12, 0.38, 0.56) * 0.38;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const nyxFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = noise(p) * 0.56;
    p = p * 2.07 + 4.3;
    value += noise(p) * 0.27;
    p = p * 2.03 + 8.1;
    value += noise(p) * 0.12;
    p = p * 2.01 + 2.6;
    value += noise(p) * 0.05;
    return value;
  }

  void main() {
    vec3 p = normalize(vLocalPosition);
    float drift = uTime * 0.0035;
    float continental = fbm(p * 3.4 + vec3(drift, 2.1, -drift));
    vec3 warped = p * 7.2 + vec3(continental * 2.8, -continental * 1.9, continental * 2.2);
    float plateA = fbm(warped);
    float plateB = fbm(warped.yzx * 1.31 + 5.7);
    float ridgeA = abs(plateA - 0.49);
    float ridgeB = abs(plateB - 0.515);
    float fissure = 1.0 - smoothstep(0.008, 0.042, min(ridgeA, ridgeB * 1.18));
    float hairline = 1.0 - smoothstep(0.004, 0.018, abs(fbm(p * 16.0 + plateA) - 0.51));
    fissure = max(fissure, hairline * 0.28);
    float cooled = smoothstep(0.24, 0.82, continental * 0.7 + plateA * 0.3);
    vec3 basalt = vec3(0.009, 0.005, 0.008);
    vec3 iron = vec3(0.11, 0.025, 0.022);
    vec3 ember = vec3(1.4, 0.16, 0.018);
    vec3 hotCore = vec3(2.2, 0.72, 0.12);
    vec3 color = mix(basalt, iron, cooled * 0.72);
    vec3 emission = mix(ember, hotCore, smoothstep(0.35, 0.92, plateB)) * fissure;
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(vViewDirection);
    vec3 lightDirection = normalize(vec3(-0.5, 0.42, 0.75));
    float rawLight = dot(normal, lightDirection);
    float light = smoothstep(-0.34, 0.72, rawLight);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
    color *= 0.055 + light * 0.78;
    color += emission * (0.5 + (1.0 - light) * 0.2);
    color += fresnel * vec3(0.31, 0.035, 0.025) * 0.33;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const caelumFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.19, 0.07, 0.23));
    p *= 19.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = noise(p) * 0.55;
    p = p * 2.04 + 6.2;
    value += noise(p) * 0.27;
    p = p * 2.01 + 2.8;
    value += noise(p) * 0.13;
    p = p * 2.06 + 8.4;
    value += noise(p) * 0.05;
    return value;
  }

  void main() {
    vec3 p = normalize(vLocalPosition);
    float driftTime = uTime * 0.0028;
    float shelf = fbm(p * 3.8 + vec3(0.0, driftTime, -driftTime));
    float compressed = fbm(p * 9.5 + vec3(shelf * 2.3));
    float fractureA = abs(compressed - 0.505);
    float fractureB = abs(fbm(p.zxy * 13.0 + shelf * 3.0) - 0.49);
    float crack = 1.0 - smoothstep(0.009, 0.045, min(fractureA, fractureB * 1.22));
    float crystalDust = smoothstep(0.76, 0.94, noise(p * 34.0 + 9.0));
    float polar = pow(abs(p.y), 4.2);
    vec3 abyss = vec3(0.008, 0.016, 0.055);
    vec3 glacier = vec3(0.08, 0.25, 0.43);
    vec3 frost = vec3(0.55, 0.78, 0.86);
    vec3 color = mix(abyss, glacier, smoothstep(0.18, 0.82, shelf));
    color = mix(color, frost, polar * 0.34 + crystalDust * 0.18);
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(vViewDirection);
    vec3 lightDirection = normalize(vec3(-0.34, 0.58, 0.72));
    float rawLight = dot(normal, lightDirection);
    float light = smoothstep(-0.38, 0.78, rawLight);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.7);
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float iceSpecular = pow(max(dot(normal, halfDirection), 0.0), 76.0) * smoothstep(0.0, 0.24, rawLight);
    float aurora = fresnel * smoothstep(0.42, 0.92, sin(p.y * 13.0 + p.x * 5.0 + uTime * 0.035) * 0.5 + 0.5);
    color *= 0.06 + light * 0.94;
    color += crack * vec3(0.12, 0.5, 1.05) * (0.16 + (1.0 - light) * 0.09);
    color += iceSpecular * vec3(0.82, 0.93, 1.0) * 0.34;
    color += aurora * vec3(0.12, 0.82, 0.72) * 0.45;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const archivePlanetFragmentShader = `
  uniform float uTime;
  uniform float uSeed;
  uniform float uPattern;
  uniform float uSurface;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uGlow;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(uSeed * 0.017, uSeed * 0.031, uSeed * 0.023));
    p *= 18.0 + fract(uSeed) * 3.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = noise(p) * 0.54;
    p = p * 2.03 + 7.2;
    value += noise(p) * 0.27;
    p = p * 2.01 + 3.8;
    value += noise(p) * 0.13;
    p = p * 2.04 + 1.6;
    value += noise(p) * 0.06;
    return value;
  }

  void main() {
    vec3 p = normalize(vLocalPosition);
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(vViewDirection);
    vec3 lightDirection = normalize(vec3(-0.42, 0.52, 0.74));
    float rawLight = dot(normal, lightDirection);
    float daylight = smoothstep(-0.3, 0.78, rawLight);
    float night = 1.0 - smoothstep(-0.28, 0.08, rawLight);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.9);
    float slowTime = uTime * (0.003 + fract(uSeed) * 0.0015);
    float broad = fbm(p * (3.0 + fract(uPattern) * 1.4) + vec3(slowTime, -slowTime * 0.45, uSeed));
    float detail = fbm(p * (8.2 + fract(uPattern) * 3.1) - vec3(slowTime * 0.7, 0.0, slowTime));
    vec3 albedo = mix(uColorA, uColorB, broad);
    vec3 emission = vec3(0.0);
    vec3 cloudColor = mix(vec3(0.78, 0.82, 0.82), uGlow, 0.08);
    float clouds = 0.0;
    float specularStrength = 0.08;
    float specularPower = 24.0;

    if (uSurface < 3.5) {
      float continental = fbm(p * 2.8 + vec3(uSeed, 0.0, -uSeed));
      float islands = smoothstep(0.58, 0.72, continental * 0.78 + broad * 0.22);
      float wave = sin((p.y + detail * 0.045) * 58.0 + atan(p.z, p.x) * 1.4) * 0.5 + 0.5;
      vec3 deepWater = mix(uColorA, uColorB * 0.58, 0.16 + broad * 0.2 + wave * 0.035);
      vec3 land = mix(uColorB * 0.48, uGlow * 0.52, smoothstep(0.55, 0.92, detail));
      albedo = mix(deepWater, land, islands);
      float coast = 1.0 - smoothstep(0.012, 0.055, abs(continental - 0.64));
      emission = uGlow * coast * night * 0.18;
      float cloudField = fbm(p * 5.2 + vec3(-slowTime * 1.7, 2.0, slowTime));
      float cloudBand = sin((p.y + cloudField * 0.09) * 17.0 + atan(p.z, p.x)) * 0.5 + 0.5;
      clouds = smoothstep(0.7, 0.88, cloudField * 0.74 + cloudBand * 0.26) * (0.62 - islands * 0.16);
      specularStrength = 0.34;
      specularPower = 82.0;
    } else if (uSurface < 4.5) {
      float warp = fbm(p * 3.2 + uSeed);
      float dune = sin((p.x + warp * 0.18) * 48.0 + p.y * 8.0 + atan(p.z, p.x) * 3.0) * 0.5 + 0.5;
      float strata = smoothstep(0.22, 0.86, fbm(p * vec3(5.0, 13.0, 5.0) + warp * 2.0));
      float rock = smoothstep(0.69, 0.88, detail);
      albedo = mix(uColorA, uColorB, 0.2 + dune * 0.065 + strata * 0.54);
      albedo = mix(albedo, uGlow * 0.54, rock * 0.34);
      specularStrength = 0.05;
      specularPower = 18.0;
    } else if (uSurface < 5.5) {
      float continentField = fbm(p * 3.5 + vec3(uSeed, -slowTime, slowTime));
      float continents = smoothstep(0.43, 0.69, continentField);
      float canopy = fbm(p * 11.0 + broad * 2.6);
      float branchField = abs(fbm(p * 7.2 + continentField * 3.0) - 0.51);
      float rivers = 1.0 - smoothstep(0.015, 0.07, branchField);
      albedo = mix(uColorA, uColorB, continents * (0.34 + canopy * 0.56));
      albedo = mix(albedo, uGlow * 0.26, rivers * continents * 0.28);
      emission = uGlow * rivers * continents * night * 0.19;
      clouds = smoothstep(0.74, 0.9, fbm(p * 6.2 - vec3(slowTime, 0.0, slowTime * 0.6))) * 0.34;
      specularStrength = 0.16;
      specularPower = 36.0;
    } else if (uSurface < 6.5) {
      float terrain = fbm(p * 4.8 + vec3(uSeed, 0.0, slowTime));
      float fault = 1.0 - smoothstep(0.018, 0.064, abs(fbm(p * 9.0 + terrain * 3.0) - 0.5));
      float settlements = smoothstep(0.74, 0.91, noise(p * 36.0 + uSeed * 4.0)) * fault;
      albedo = mix(uColorA, uColorB, 0.12 + terrain * 0.5);
      emission = mix(uGlow, vec3(1.0, 0.54, 0.24), 0.34) * settlements * night * 0.78;
      specularStrength = 0.11;
      specularPower = 28.0;
    } else {
      float internal = fbm(p * 5.6 + vec3(uSeed, slowTime, -slowTime));
      float vein = 1.0 - smoothstep(0.018, 0.075, abs(fbm(p * 12.0 + internal * 3.4) - 0.5));
      float facetTone = pow(abs(dot(p, normalize(vec3(0.37, 0.81, -0.44)))), 2.4);
      albedo = mix(uColorA, uColorB, 0.2 + internal * 0.45 + facetTone * 0.28);
      emission = uGlow * vein * (0.11 + night * 0.24);
      specularStrength = 0.3;
      specularPower = 58.0;
    }

    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float specular = pow(max(dot(normal, halfDirection), 0.0), specularPower) * specularStrength * smoothstep(-0.02, 0.24, rawLight);
    vec3 color = albedo * (0.045 + daylight * 0.96);
    color += cloudColor * clouds * (0.08 + daylight * 0.48);
    color += emission;
    color += vec3(0.92, 0.94, 0.91) * specular;
    color += uGlow * fresnel * (uSurface > 6.5 ? 0.42 : 0.25);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const accretionVertexShader = `
  varying vec3 vLocalPosition;
  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const accretionFragmentShader = `
  uniform float uTime;
  uniform float uPassage;
  varying vec3 vLocalPosition;

  float hash(float value) {
    return fract(sin(value * 91.17) * 43758.5453);
  }

  void main() {
    float radius = length(vLocalPosition.xy);
    float angle = atan(vLocalPosition.y, vLocalPosition.x);
    float radialMask = smoothstep(3.7, 4.16, radius) * (1.0 - smoothstep(11.2, 13.45, radius));
    float flow = uTime * 4.4 / pow(max(radius, 3.7), 1.12);
    float spiralA = sin(angle * 14.0 - radius * 2.7 - flow);
    float spiralB = sin(angle * 31.0 - radius * 5.1 + flow * 0.64);
    float granular = hash(floor(angle * 96.0) + floor(radius * 18.0) * 7.0);
    float strands = smoothstep(0.08, 0.9, spiralA * 0.52 + spiralB * 0.25 + granular * 0.54);
    float heat = 1.0 - smoothstep(3.9, 12.8, radius);
    float doppler = cos(angle - 0.22) * 0.5 + 0.5;
    vec3 ember = vec3(0.54, 0.11, 0.018);
    vec3 amber = vec3(1.16, 0.42, 0.075);
    vec3 whiteGold = vec3(1.42, 1.08, 0.72);
    vec3 color = mix(ember, amber, doppler * 0.64 + heat * 0.2);
    color = mix(color, whiteGold, heat * 0.66 + strands * 0.16 + doppler * 0.08);
    float alpha = radialMask * (0.028 + strands * 0.23 + heat * 0.17) * mix(0.58, 1.0, doppler);
    alpha *= 1.0 + uPassage * 0.22;
    gl_FragColor = vec4(color, alpha);
  }
`;

export const lensedArcVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const lensedArcFragmentShader = `
  uniform float uTime;
  uniform float uPassage;
  varying vec2 vUv;

  float hash(float value) {
    return fract(sin(value * 127.1) * 43758.5453);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    p.y += p.x * 0.018;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float horizonRadius = 0.266;
    float photonRadius = 0.282;
    float side = p.x / max(radius, 0.001) * 0.5 + 0.5;
    float doppler = mix(0.48, 1.0, smoothstep(0.04, 0.96, side));

    float photonCore = 1.0 - smoothstep(0.0025, 0.0075, abs(radius - photonRadius));
    float photonHalo = 1.0 - smoothstep(0.008, 0.026, abs(radius - photonRadius));
    float polar = pow(abs(sin(angle)), 1.6);
    float arcRadius = photonRadius * (1.245 + 0.105 * abs(cos(angle)));
    float arcDistance = abs(radius - arcRadius);
    float lensedArc = (1.0 - smoothstep(0.012, 0.042, arcDistance)) * smoothstep(0.28, 0.74, polar);
    float arcHalo = (1.0 - smoothstep(0.035, 0.088, arcDistance)) * smoothstep(0.2, 0.68, polar);
    float filament = 0.58 + 0.42 * sin(angle * 53.0 - uTime * 0.12 + hash(floor(angle * 19.0)) * 6.2831);
    lensedArc *= 0.68 + filament * 0.32;

    vec3 deepAmber = vec3(0.78, 0.22, 0.035);
    vec3 warmWhite = vec3(1.34, 1.03, 0.68);
    vec3 color = mix(deepAmber, warmWhite, smoothstep(0.08, 0.94, side));
    color = mix(color, vec3(1.45, 1.28, 0.92), photonCore * 0.72);
    float alpha = photonCore * 0.42 + photonHalo * 0.034 + lensedArc * 0.37 * doppler + arcHalo * 0.032;
    alpha *= 1.0 + uPassage * 0.18;
    if (radius < horizonRadius * 1.01 || radius > 0.62 || alpha < 0.006) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const atmosphereFragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDirection))), 2.35);
    float falloff = smoothstep(0.04, 0.92, rim);
    gl_FragColor = vec4(uColor * (0.72 + rim * 0.46), falloff * uOpacity);
  }
`;

export const planetaryRingVertexShader = `
  varying float vRadius;
  varying float vAngle;

  void main() {
    vRadius = length(position.xy);
    vAngle = atan(position.y, position.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const planetaryRingFragmentShader = `
  uniform float uTime;
  uniform float uSeed;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uColor;
  varying float vRadius;
  varying float vAngle;

  float hash(float value) {
    return fract(sin(value * 91.173 + uSeed * 17.19) * 43758.5453);
  }

  void main() {
    float radial = clamp((vRadius - uInner) / max(0.001, uOuter - uInner), 0.0, 1.0);
    float edge = smoothstep(0.0, 0.055, radial) * (1.0 - smoothstep(0.91, 1.0, radial));
    float broad = sin(radial * 82.0 + sin(vAngle * 3.0 + uSeed) * 1.7) * 0.5 + 0.5;
    float fine = sin(radial * 311.0 - uTime * 0.045) * 0.5 + 0.5;
    float grain = hash(floor(radial * 190.0) + floor(vAngle * 36.0) * 0.17);
    float lane = smoothstep(0.18, 0.8, broad * 0.58 + fine * 0.18 + grain * 0.38);
    float division = 1.0 - smoothstep(0.018, 0.05, abs(radial - 0.42 - sin(vAngle * 2.0) * 0.012));
    vec3 color = mix(uColor * 0.28, uColor * 1.35 + vec3(0.14, 0.1, 0.055), lane);
    float alpha = edge * (0.018 + lane * 0.19 + fine * 0.026) * (1.0 - division * 0.72);
    gl_FragColor = vec4(color, alpha);
  }
`;
