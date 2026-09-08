import * as THREE from 'three';
export type Quality = 'retro' | 'clear';
export class GameRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.25, 2300);
  readonly renderer: THREE.WebGLRenderer;
  private target = new THREE.WebGLRenderTarget(640, 360, {
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private shader: THREE.ShaderMaterial;
  quality: Quality = 'retro';
  private sun: THREE.DirectionalLight;
  private abort = new AbortController();
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0xc8c0a8);
    this.scene.fog = new THREE.Fog(0xc8c0a8, 230, 1050);
    this.scene.add(new THREE.HemisphereLight(0xffe1b9, 0x627361, 2.4));
    this.sun = new THREE.DirectionalLight(0xffdfad, 3.3);
    this.sun.position.set(-130, 220, 150);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -65,
      right: 65,
      top: 65,
      bottom: -65,
      near: 1,
      far: 600,
    });
    this.sun.shadow.normalBias = 0.12;
    this.scene.add(this.sun, this.sun.target);
    this.shader = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        resolution: { value: new THREE.Vector2(640, 360) },
        retro: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `uniform sampler2D tScene;uniform vec2 resolution;uniform float retro;varying vec2 vUv;
        void main(){vec3 col=pow(texture2D(tScene,vUv).rgb,vec3(1./2.2));
        vec2 p=mod(floor(vUv*resolution),4.);float d=mod(p.x*2.+p.y*3.,4.)/4.-.375;
        col=mix(col,floor(clamp(col+d/42.,0.,1.)*31.)/31.,retro*.65);
        float vignette=1.-.23*pow(length((vUv-.5)*1.2),1.5);col*=vignette;
        gl_FragColor=vec4(col,1.);}`,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.shader));
    this.resize();
    window.addEventListener('resize', () => this.resize(), { signal: this.abort.signal });
  }
  setQuality(q: Quality): void {
    this.quality = q;
    this.resize();
  }
  resize(): void {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = this.quality === 'retro' ? Math.min(1, 640 / w) : Math.min(1, 1280 / w),
      tw = Math.max(1, Math.round(w * scale)),
      th = Math.max(1, Math.round(h * scale));
    this.target.setSize(tw, th);
    this.shader.uniforms.resolution.value.set(tw, th);
    this.shader.uniforms.retro.value = this.quality === 'retro' ? 1 : 0;
  }
  followLight(p: THREE.Vector3): void {
    this.sun.position.set(p.x - 130, p.y + 220, p.z + 150);
    this.sun.target.position.copy(p);
  }
  render(): void {
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
  dispose(): void {
    this.abort.abort();
    this.target.dispose();
    this.shader.dispose();
    this.renderer.dispose();
  }
}
