"use client";

// Source adapted from ReactBits FaultyTerminal (MIT + Commons Clause).
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

type Vec2 = [number, number];

export interface FaultyTerminalProps extends React.HTMLAttributes<HTMLDivElement> {
  scale?: number;
  gridMul?: Vec2;
  digitSize?: number;
  timeScale?: number;
  scanlineIntensity?: number;
  glitchAmount?: number;
  flickerAmount?: number;
  noiseAmp?: number;
  chromaticAberration?: number;
  dither?: number | boolean;
  curvature?: number;
  tint?: string;
  mouseReact?: boolean;
  mouseStrength?: number;
  dpr?: number;
  pageLoadAnimation?: boolean;
  brightness?: number;
}

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragmentShader = `
precision mediump float;
varying vec2 vUv;
uniform float iTime;
uniform vec3 iResolution;
uniform float uScale;
uniform vec2 uGridMul;
uniform float uDigitSize;
uniform float uScanlineIntensity;
uniform float uGlitchAmount;
uniform float uFlickerAmount;
uniform float uNoiseAmp;
uniform float uChromaticAberration;
uniform float uDither;
uniform float uCurvature;
uniform vec3 uTint;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform float uUseMouse;
uniform float uPageLoadProgress;
uniform float uUsePageLoadAnimation;
uniform float uBrightness;
float time;

float hash21(vec2 p){ p=fract(p*234.56); p+=dot(p,p+34.56); return fract(p.x*p.y); }
float noise(vec2 p){ return sin(p.x*10.0)*sin(p.y*(3.0+sin(time*0.090909)))+0.2; }
mat2 rotate(float a){ float c=cos(a); float s=sin(a); return mat2(c,-s,s,c); }
float fbm(vec2 p){
  p*=1.1; float f=0.0; float amp=0.5*uNoiseAmp;
  f+=amp*noise(p); p=rotate(time*0.02)*p*2.0; amp*=0.454545;
  f+=amp*noise(p); p=rotate(time*0.02)*p*2.0; amp*=0.454545;
  f+=amp*noise(p); return f;
}
float pattern(vec2 p,out vec2 q,out vec2 r){
  q=vec2(fbm(p+vec2(1.0)),fbm(rotate(0.1*time)*p+vec2(1.0)));
  r=vec2(fbm(rotate(0.1)*q),fbm(q)); return fbm(p+r);
}
float digit(vec2 p){
  vec2 grid=uGridMul*15.0; vec2 s=floor(p*grid)/grid; p*=grid;
  vec2 q,r; float intensity=pattern(s*0.1,q,r)*1.3-0.03;
  if(uUseMouse>0.5){
    float dist=distance(s,uMouse*uScale);
    float influence=exp(-dist*8.0)*uMouseStrength*10.0;
    intensity+=influence+sin(dist*20.0-iTime*5.0)*0.1*influence;
  }
  if(uUsePageLoadAnimation>0.5){
    float rnd=fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);
    intensity*=smoothstep(0.0,1.0,clamp((uPageLoadProgress-rnd*0.8)/0.2,0.0,1.0));
  }
  p=fract(p)*uDigitSize;
  float px=p.x*5.0; float py=(1.0-p.y)*5.0;
  float x=fract(px); float y=fract(py);
  float i=floor(py)-2.0; float j=floor(px)-2.0;
  float on=step(0.1,intensity-(i*i+j*j)*0.0625);
  float value=on*(0.2+y*0.8)*(0.75+x*0.25);
  return step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0)*value;
}
float onOff(float a,float b,float c){ return step(c,sin(iTime+a*cos(iTime*b)))*uFlickerAmount; }
float displace(vec2 p){
  float y=p.y-mod(iTime*0.25,1.0); float window=1.0/(1.0+50.0*y*y);
  return sin(p.y*20.0+iTime)*0.0125*onOff(4.0,2.0,0.8)*(1.0+cos(iTime*60.0))*window;
}
vec3 getColor(vec2 p){
  float bar=(step(mod(p.y+time*20.0,1.0),0.2)*0.4+1.0)*uScanlineIntensity;
  float displacement=displace(p); p.x+=displacement*uGlitchAmount;
  float middle=digit(p); const float off=0.002;
  float sum=digit(p+vec2(-off,-off))+digit(p+vec2(0.0,-off))+digit(p+vec2(off,-off))+
    digit(p+vec2(-off,0.0))+digit(p)+digit(p+vec2(off,0.0))+
    digit(p+vec2(-off,off))+digit(p+vec2(0.0,off))+digit(p+vec2(off,off));
  return vec3(0.9)*middle+sum*0.1*vec3(1.0)*bar;
}
vec2 barrel(vec2 uv){ vec2 c=uv*2.0-1.0; c*=1.0+uCurvature*dot(c,c); return c*0.5+0.5; }
void main(){
  time=iTime*0.333333; vec2 uv=uCurvature!=0.0?barrel(vUv):vUv; vec2 p=uv*uScale;
  vec3 col=getColor(p);
  if(uChromaticAberration!=0.0){
    vec2 ca=vec2(uChromaticAberration)/iResolution.xy;
    col.r=getColor(p+ca).r; col.b=getColor(p-ca).b;
  }
  col*=uTint*uBrightness;
  if(uDither>0.0){ col+=(hash21(gl_FragCoord.xy)-0.5)*(uDither*0.003922); }
  gl_FragColor=vec4(col,1.0);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  let normalized = hex.replace("#", "").trim();
  if (normalized.length === 3) normalized = normalized.split("").map((char) => char + char).join("");
  const value = Number.parseInt(normalized, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export default function FaultyTerminal({
  scale = 1,
  gridMul = [2, 1],
  digitSize = 1.5,
  timeScale = 0.3,
  scanlineIntensity = 0.3,
  glitchAmount = 1,
  flickerAmount = 1,
  noiseAmp = 1,
  chromaticAberration = 0,
  dither = 0,
  curvature = 0.2,
  tint = "#ffffff",
  mouseReact = true,
  mouseStrength = 0.2,
  dpr,
  pageLoadAnimation = true,
  brightness = 1,
  className = "",
  style,
  ...rest
}: FaultyTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const smoothMouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef(0);
  const loadStartRef = useRef(0);
  const timeOffsetRef = useRef(Math.random() * 100);
  const tintVec = useMemo(() => hexToRgb(tint), [tint]);
  const ditherValue = useMemo(() => (typeof dither === "boolean" ? (dither ? 1 : 0) : dither), [dither]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouseRef.current = {
      x: (event.clientX - rect.left) / rect.width,
      y: 1 - (event.clientY - rect.top) / rect.height,
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new Renderer({ dpr: dpr ?? Math.min(window.devicePixelRatio || 1, 1.5) });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 1);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Color(gl.canvas.width, gl.canvas.height, 1) },
        uScale: { value: scale },
        uGridMul: { value: new Float32Array(gridMul) },
        uDigitSize: { value: digitSize },
        uScanlineIntensity: { value: scanlineIntensity },
        uGlitchAmount: { value: glitchAmount },
        uFlickerAmount: { value: flickerAmount },
        uNoiseAmp: { value: noiseAmp },
        uChromaticAberration: { value: chromaticAberration },
        uDither: { value: ditherValue },
        uCurvature: { value: curvature },
        uTint: { value: new Color(...tintVec) },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseStrength: { value: mouseStrength },
        uUseMouse: { value: mouseReact && !reduceMotion ? 1 : 0 },
        uPageLoadProgress: { value: reduceMotion || !pageLoadAnimation ? 1 : 0 },
        uUsePageLoadAnimation: { value: pageLoadAnimation && !reduceMotion ? 1 : 0 },
        uBrightness: { value: brightness },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      program.uniforms.iResolution.value = new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    container.appendChild(gl.canvas);

    const update = (time: number) => {
      if (!reduceMotion) rafRef.current = requestAnimationFrame(update);
      if (pageLoadAnimation && loadStartRef.current === 0) loadStartRef.current = time;
      program.uniforms.iTime.value = (time * 0.001 + timeOffsetRef.current) * timeScale;
      if (pageLoadAnimation && !reduceMotion) {
        program.uniforms.uPageLoadProgress.value = Math.min((time - loadStartRef.current) / 2000, 1);
      }
      if (mouseReact && !reduceMotion) {
        const smooth = smoothMouseRef.current;
        smooth.x += (mouseRef.current.x - smooth.x) * 0.08;
        smooth.y += (mouseRef.current.y - smooth.y) * 0.08;
        const uniform = program.uniforms.uMouse.value as Float32Array;
        uniform[0] = smooth.x;
        uniform[1] = smooth.y;
      }
      renderer.render({ scene: mesh });
    };
    rafRef.current = requestAnimationFrame(update);
    if (mouseReact) window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      if (gl.canvas.parentElement === container) container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [brightness, chromaticAberration, curvature, digitSize, ditherValue, dpr, flickerAmount, glitchAmount, gridMul, handleMouseMove, mouseReact, mouseStrength, noiseAmp, pageLoadAnimation, scale, scanlineIntensity, timeScale, tintVec]);

  return <div ref={containerRef} className={`faulty-terminal-container ${className}`.trim()} style={style} {...rest} />;
}
