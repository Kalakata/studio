import * as THREE from 'three';
import { L, W, H, T } from './spec.js';

// Every MeshStandardMaterial in the scene goes through roomLit(). The patch does three things:
//
// 1. Inside the room's clear volume, the sky environment map is switched off. Sky light gets
//    in only through the windows (rect-area lights) plus the inter-reflected bounce term, so
//    it falls off with depth instead of passing through the ceiling. Outside, the reverse:
//    window lights and bounce are off and the environment map lights the exterior.
// 2. Shadows from the sun use PCSS: the penumbra widens with the distance from the blocker,
//    by the sun's real angular size. It replaces three's BasicShadowMap lookup.
// 3. Sample counts come from the quality setting.

const EPS = 0.02;       // well inside the 0.12 wall, so window reveals and glass count as outside

export const roomUniforms = {
  uRoomMin: { value: new THREE.Vector3(-L / 2 - EPS, -EPS, -W / 2 - EPS) },
  uRoomMax: { value: new THREE.Vector3(L / 2 + EPS, H + EPS, W / 2 + EPS) },
  // the wall's own thickness: window reveals, frames and glass. They see roughly half the sky
  // (the other half is wall), so they take half the environment light. Outer faces stay outside.
  uWallMin: { value: new THREE.Vector3(-L / 2 - T + EPS, -EPS, -W / 2 - T + EPS) },
  uWallMax: { value: new THREE.Vector3(L / 2 + T - EPS, H + T - EPS, W / 2 + T - EPS) },
  uBounce: { value: new THREE.Color(0, 0, 0) },
  uShadowWorld: { value: new THREE.Vector2(1, 1) },   // shadow frustum width and height, metres
  uShadowDepthRange: { value: 1 },                    // far - near, metres
  uSunTanRadius: { value: Math.tan(0.2666 * Math.PI / 180) },
  uPcssSearch: { value: 0.08 }                        // blocker search radius, metres
};

const samples = { blocker: 16, filter: 16 };   // filter taps are 2x2 bilinear: 4 fetches each
const patched = new Set();

export function setSoftShadowSamples(blocker, filter) {
  if (samples.blocker === blocker && samples.filter === filter) return;
  samples.blocker = blocker; samples.filter = filter;
  for (const m of patched) m.needsUpdate = true;
}

const PCSS = /* glsl */`
		float pcssNoise( vec2 p ) {
			return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
		}

		vec2 pcssDisk( int i, int n, float phi ) {
			float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
			float t = float( i ) * 2.399963229728653 + phi;
			return vec2( cos( t ), sin( t ) ) * r;
		}

		// the depth map is nearest-filtered: compare the four texels around uv and blend, so a
		// tap is a smooth 0..1 rather than a hard step that turns into grain at narrow penumbras
		float pcssLit( sampler2D shadowMap, vec2 uv, float zr, vec2 size ) {
			vec2 t = uv * size - 0.5;
			vec2 f = fract( t );
			vec2 base = ( floor( t ) + 0.5 ) / size;
			vec2 px = vec2( 1.0 ) / size;
			float a = step( zr, texture2D( shadowMap, base ).r );
			float b = step( zr, texture2D( shadowMap, base + vec2( px.x, 0.0 ) ).r );
			float c = step( zr, texture2D( shadowMap, base + vec2( 0.0, px.y ) ).r );
			float d = step( zr, texture2D( shadowMap, base + px ).r );
			return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
		}

		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

			float shadow = 1.0;

			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;

			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;

			if ( inFrustum && shadowCoord.z <= 1.0 ) {

				float zr = shadowCoord.z;
				float phi = pcssNoise( gl_FragCoord.xy ) * PI2;

				// average depth of whatever blocks the sun near this point
				vec2 search = vec2( uPcssSearch ) / uShadowWorld;
				float blockers = 0.0, found = 0.0;
				for ( int i = 0; i < PCSS_BLOCKER; i ++ ) {
					float d = texture2D( shadowMap, shadowCoord.xy + pcssDisk( i, PCSS_BLOCKER, phi ) * search ).r;
					if ( d < zr ) { blockers += d; found += 1.0; }
				}

				if ( found > 0.0 ) {

					// orthographic light: depth is linear, so the gap is metres x range
					float gap = ( zr - blockers / found ) * uShadowDepthRange;
					float penumbra = gap * 2.0 * uSunTanRadius;
					vec2 radius = max( vec2( 0.5 * penumbra ) / uShadowWorld, vec2( 1.0 ) / shadowMapSize );

					float lit = 0.0;
					for ( int i = 0; i < PCSS_FILTER; i ++ ) {
						lit += pcssLit( shadowMap, shadowCoord.xy + pcssDisk( i, PCSS_FILTER, phi + 1.7 ) * radius, zr, shadowMapSize );
					}
					shadow = lit / float( PCSS_FILTER );

				}

			}

			return mix( 1.0, shadow, shadowIntensity );

		}
`;

function replaceOnce(src, find, repl, where) {
  const i = src.indexOf(find);
  if (i < 0 || src.indexOf(find, i + find.length) >= 0) {
    throw new Error(`roomlit: expected exactly one "${find}" in ${where}. three.js shader source changed — revisit src/scene/roomlit.js`);
  }
  return src.slice(0, i) + repl + src.slice(i + find.length);
}

// The basic getShadow is the branch after the VSM one: a top-level `#else` (one tab; the
// nested ones are deeper) up to `#if NUM_SUN_LIGHT_SHADOWS`. The npm build strips GLSL
// comments, so no comment can be used as a marker.
export function patchShadowChunk(chunk) {
  const vsm = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )');
  const tail = vsm < 0 ? null : /\n\t#else[^\n]*\n/.exec(chunk.slice(vsm));
  const start = tail ? vsm + tail.index + 1 : -1;
  const end = start < 0 ? -1 : chunk.indexOf('#if NUM_SUN_LIGHT_SHADOWS > 0', start);
  if (start < 0 || end < 0) throw new Error('roomlit: BasicShadowMap getShadow not found in shadowmap_pars_fragment');
  return chunk.slice(0, start) + '\t#else // BasicShadowMap, replaced with PCSS\n' + PCSS + '\n\t#endif\n\n\t' + chunk.slice(end);
}

// Work skipped where it cannot change the pixel: a rect-area light that is off (the unlit sun patches, the
// LED profiles not in use) adds nothing, and a surface turned away from the sun, or a sun with no light,
// gets no direct sun whatever its shadow says, so the PCSS lookup is not made.
export function patchLightsBegin(chunk) {
  let s = replaceOnce(chunk, 'RE_Direct_RectArea( rectAreaLight,', 'if ( roomInside > 0.5 && max3( rectAreaLight.color ) > 0.0 ) RE_Direct_RectArea( rectAreaLight,', 'lights_fragment_begin');
  s = replaceOnce(s, '( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]',
    '( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 && max3( directLight.color ) > 0.0 ) ? getShadow( directionalShadowMap[ i ]', 'lights_fragment_begin');
  s = replaceOnce(s, '#ifdef USE_LIGHT_PROBES_GRID', 'irradiance += roomInside * uBounce;\n\n\t#ifdef USE_LIGHT_PROBES_GRID', 'lights_fragment_begin');
  return s;
}

export function patchLightsMaps(chunk) {
  let s = replaceOnce(chunk, 'iblIrradiance += getIBLIrradiance( geometryNormal );', 'iblIrradiance += skyShare * getIBLIrradiance( geometryNormal );', 'lights_fragment_maps');
  s = replaceOnce(s, 'radiance += iblRadiance;', 'radiance += skyShare * iblRadiance;', 'lights_fragment_maps');
  return s;
}

export function patchVertex(src) {
  let s = replaceOnce(src, '#include <common>', '#include <common>\nvarying vec3 vRoomPos;', 'vertex shader');
  s = replaceOnce(s, '#include <begin_vertex>', '#include <begin_vertex>\n\tvRoomPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;', 'vertex shader');
  return s;
}

export function patchFragment(src, { blocker, filter }) {
  const C = THREE.ShaderChunk;
  let s = `#define PCSS_BLOCKER ${blocker}\n#define PCSS_FILTER ${filter}\n` + src;
  s = replaceOnce(s, '#include <common>', `#include <common>
varying vec3 vRoomPos;
uniform vec3 uRoomMin, uRoomMax, uWallMin, uWallMax, uBounce;
uniform vec2 uShadowWorld;
uniform float uShadowDepthRange, uSunTanRadius, uPcssSearch;`, 'fragment shader');
  s = replaceOnce(s, '#include <shadowmap_pars_fragment>', patchShadowChunk(C.shadowmap_pars_fragment), 'fragment shader');
  s = replaceOnce(s, '#include <lights_fragment_begin>', patchLightsBegin(C.lights_fragment_begin), 'fragment shader');
  s = replaceOnce(s, '#include <lights_fragment_maps>', patchLightsMaps(C.lights_fragment_maps), 'fragment shader');
  s = replaceOnce(s, 'void main() {', `void main() {
	vec3 roomIn = step( uRoomMin, vRoomPos ) * step( vRoomPos, uRoomMax );
	float roomInside = roomIn.x * roomIn.y * roomIn.z;
	vec3 wallIn = step( uWallMin, vRoomPos ) * step( vRoomPos, uWallMax );
	float skyShare = ( 1.0 - roomInside ) * ( 1.0 - 0.5 * wallIn.x * wallIn.y * wallIn.z );`, 'fragment shader');
  return s;
}

function onBeforeCompile(shader) {
  Object.assign(shader.uniforms, roomUniforms);
  shader.vertexShader = patchVertex(shader.vertexShader);
  shader.fragmentShader = patchFragment(shader.fragmentShader, samples);
}

export function roomLit(material) {
  material.onBeforeCompile = onBeforeCompile;
  material.customProgramCacheKey = () => `roomlit-${samples.blocker}-${samples.filter}`;
  patched.add(material);
  return material;
}
