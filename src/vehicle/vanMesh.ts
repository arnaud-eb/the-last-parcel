import * as THREE from 'three/webgpu';
import {
  cameraPosition, dot, float, normalWorld, normalize, positionWorld, pow, smoothstep, texture, uniform, uv, vec3, vec4, positionLocal,
} from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowMaterial, lampLight, SNOW_ALBEDO, U } from '../render/materials';
import { VAN, type WheelState } from './van';

type N = any;

const BODY_RED = new THREE.Color(0.62, 0.07, 0.06);

/** Side livery drawn on a canvas: cream stripe, wordmark, parcel-and-star logo. */
function liveryTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9e1410';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#f1e4c8';
  g.fillRect(0, 150, 512, 26);
  g.fillStyle = '#f6ecd6';
  g.font = 'bold 84px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('Kuerier', 118, 92);
  // Parcel with a star.
  g.fillStyle = '#f1e4c8';
  g.fillRect(28, 52, 72, 72);
  g.fillStyle = '#9e1410';
  g.fillRect(60, 52, 8, 72);
  g.fillRect(28, 84, 72, 8);
  g.fillStyle = '#ffcf6a';
  star(g, 100, 46, 18);
  g.fillStyle = '#f1e4c8';
  g.font = '600 26px system-ui, sans-serif';
  g.fillText('Last parcel of the year', 120, 212);
  return canvasTexture(c);
}

/** Rear doors: split line, two windows, handles, plate, stripe. */
function rearTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9e1410';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#f1e4c8';
  g.fillRect(0, 150, 256, 16);
  g.fillStyle = '#0b1220';
  roundRect(g, 18, 26, 100, 70, 10);
  roundRect(g, 138, 26, 100, 70, 10);
  g.fillStyle = '#5a0a07';
  g.fillRect(126, 0, 4, 256);
  g.fillStyle = '#d9d2c4';
  g.fillRect(104, 128, 16, 6);
  g.fillRect(136, 128, 16, 6);
  // Luxembourg plate: yellow, black characters, the EU band with "L" on the left.
  g.fillStyle = '#f2c200';
  roundRect(g, 86, 196, 84, 26, 4);
  g.fillStyle = '#1f3a93';
  g.fillRect(86, 196, 12, 26);
  g.fillStyle = '#ffffff';
  g.font = 'bold 9px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('L', 92, 215);
  g.fillStyle = '#111111';
  g.font = 'bold 17px system-ui, sans-serif';
  g.fillText('KU 2312', 134, 210);
  return canvasTexture(c);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

/** Glossy painted body, warmed by nearby lamps, with a fresnel sky sheen. */
function paintMaterial(color: THREE.Color, map?: THREE.Texture): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.32, metalness: 0.1 });
  const albedo: N = map ? texture(map, uv()).rgb : vec3(color.r, color.g, color.b);
  m.colorNode = albedo;
  const V = normalize(cameraPosition.sub(positionWorld));
  const fres = pow(float(1).sub(dot(normalWorld, V).max(0)), 3);
  m.emissiveNode = lampLight(positionWorld, normalWorld, albedo, float(0.9), float(60)).add(U.horizon.mul(fres.mul(0.35)));
  return m;
}

export class VanMesh {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly wheels: THREE.Object3D[] = [];
  readonly headlight: THREE.SpotLight;
  /** Contact shadow; add to the scene separately (it follows yaw only). */
  readonly shadow: THREE.Mesh;
  private readonly brakeGlow = uniform(0);

  constructor() {
    const L = VAN.halfLength * 2;
    const W = VAN.halfWidth * 2;
    const paint = paintMaterial(BODY_RED);
    const livery = paintMaterial(BODY_RED, liveryTexture());
    const trim = new THREE.MeshStandardNodeMaterial({ color: 0x15161a, roughness: 0.7 });
    const glass = new THREE.MeshStandardNodeMaterial({ color: 0x0a1220, roughness: 0.08, metalness: 0.6 });
    glass.emissiveNode = U.horizon.mul(0.25);

    // Cargo box + cab, chunky toy proportions. Body origin = chassis centre.
    const yBase = -0.1;
    const cargo = new THREE.Mesh(new RoundedBoxGeometry(W, 1.75, L * 0.72, 3, 0.16), paint);
    cargo.position.set(0, yBase + 0.95, -L * 0.14);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(W * 0.98, 1.15, L * 0.34, 3, 0.2), paint);
    cab.position.set(0, yBase + 0.65, L * 0.31);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, 0.62), glass);
    windshield.position.set(0, yBase + 1.38, L * 0.215);
    windshield.rotation.x = -0.55;
    const windshieldFrame = new THREE.Mesh(new RoundedBoxGeometry(W * 0.98, 0.7, 0.6, 2, 0.12), paint);
    windshieldFrame.position.set(0, yBase + 1.38, L * 0.19);
    windshieldFrame.rotation.x = -0.55;
    windshieldFrame.scale.set(1, 1, 0.9);
    const sideWin: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.5), glass);
      w.position.set(s * (W / 2 + 0.005), yBase + 1.45, L * 0.25);
      w.rotation.y = s * Math.PI / 2;
      sideWin.push(w);
      // Livery panels on the cargo sides.
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.66, 1.4), livery);
      panel.position.set(s * (W / 2 + 0.006), yBase + 0.98, -L * 0.14);
      panel.rotation.y = s * Math.PI / 2;
      if (s < 0) panel.scale.x = -1; // keep the wordmark readable on the left side
      sideWin.push(panel);
    }
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, 1.55), paintMaterial(BODY_RED, rearTexture()));
    rear.position.set(0, yBase + 0.98, -L / 2 - 0.006);
    rear.rotation.y = Math.PI;
    sideWin.push(rear);
    const bumperF = new THREE.Mesh(new RoundedBoxGeometry(W * 1.02, 0.28, 0.3, 2, 0.08), trim);
    bumperF.position.set(0, yBase + 0.12, L / 2 - 0.05);
    const bumperR = bumperF.clone();
    bumperR.position.z = -L / 2 + 0.02;

    // Snow on the roof: a soft slab, slightly lumpy.
    const snowMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
    snowMat.colorNode = SNOW_ALBEDO;
    snowMat.emissiveNode = lampLight(positionWorld, normalWorld, SNOW_ALBEDO, float(0.05), float(8));
    const roofSnow = new THREE.Mesh(new RoundedBoxGeometry(W * 0.94, 0.16, L * 0.68, 3, 0.07), snowMat);
    roofSnow.position.set(0, yBase + 1.86, -L * 0.15);
    const hoodSnow = new THREE.Mesh(new RoundedBoxGeometry(W * 0.86, 0.08, 0.5, 2, 0.04), snowMat);
    hoodSnow.position.set(0, yBase + 1.24, L * 0.4);

    // Lights.
    const headMat = glowMaterial(new THREE.Color(1.0, 0.92, 0.75), 12);
    const tailMat = new THREE.MeshBasicNodeMaterial();
    tailMat.colorNode = vec3(0.9, 0.015, 0.008).mul(this.brakeGlow.add(1.6));
    const heads: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), headMat);
      h.position.set(s * (W / 2 - 0.3), yBase + 0.62, L / 2 + 0.005);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.38), tailMat);
      t.position.set(s * (W / 2 - 0.1), yBase + 0.7, -L / 2 - 0.014);
      t.rotation.y = Math.PI;
      heads.push(h, t);
    }

    // Beam cones: faint additive volumes so the headlights cut through the snow.
    const coneLen = 14;
    const coneGeo = new THREE.ConeGeometry(2.6, coneLen, 20, 1, true);
    coneGeo.translate(0, -coneLen / 2, 0);
    coneGeo.rotateX(-Math.PI / 2);
    const coneMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const along = (positionLocal as N).z.div(coneLen);
    const V = normalize(cameraPosition.sub(positionWorld));
    const edge = pow(dot(normalWorld, V).abs(), 1.5);
    coneMat.colorNode = vec4(vec3(1.0, 0.85, 0.62).mul(smoothstep(1.0, 0.05, along).mul(smoothstep(0.0, 0.08, along)).mul(edge).mul(0.07).mul(U.headOn)), 1);
    coneMat.fog = false;
    for (const s of [-1, 1]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(s * (W / 2 - 0.3), yBase + 0.62, L / 2 + 0.05);
      cone.rotation.x = 0.07;
      cone.renderOrder = 2;
      heads.push(cone);
    }

    this.headlight = new THREE.SpotLight(0xffe2b8, 90, 38, 0.52, 0.55, 1.4);
    this.headlight.position.set(0, yBase + 0.7, L / 2);
    this.headlight.target.position.set(0, -0.6, L / 2 + 10);

    this.body.add(cargo, cab, windshieldFrame, windshield, ...sideWin, bumperF, bumperR, roofSnow, hoodSnow, ...heads, this.headlight, this.headlight.target);

    // Wheels.
    const tyre = new THREE.CylinderGeometry(VAN.wheelRadius, VAN.wheelRadius, 0.3, 18);
    tyre.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(0.17, 0.17, 0.32, 10);
    hub.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshStandardNodeMaterial({ color: 0x8a8f99, roughness: 0.4, metalness: 0.6 });
    const pos: [number, number][] = [[VAN.wheelX, VAN.wheelZFront], [-VAN.wheelX, VAN.wheelZFront], [VAN.wheelX, VAN.wheelZRear], [-VAN.wheelX, VAN.wheelZRear]];
    for (const [x, z] of pos) {
      const pivot = new THREE.Group();
      pivot.position.set(x, VAN.wheelY, z);
      const spin = new THREE.Group();
      spin.add(new THREE.Mesh(tyre, trim), new THREE.Mesh(hub, hubMat));
      pivot.add(spin);
      this.wheels.push(pivot);
      this.group.add(pivot);
    }

    // Soft contact shadow so the van sits on the ground.
    const shadowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const d = (uv() as N).sub(0.5).mul(2).length();
    shadowMat.colorNode = vec4(0, 0, 0, smoothstep(1.0, 0.3, d).mul(0.55));
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, L * 1.15), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.name = 'van-shadow';
    this.shadow = shadow;

    this.group.add(this.body);
    this.group.name = 'van';
  }

  /** Sync from physics. `pos`/`quat` are the chassis transform. */
  sync(pos: THREE.Vector3, quat: THREE.Quaternion, wheels: WheelState[], braking: boolean): void {
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);
    wheels.forEach((w, i) => {
      const pivot = this.wheels[i]!;
      pivot.position.y = VAN.wheelY - w.compression;
      pivot.rotation.y = w.steer;
      pivot.children[0]!.rotation.x = w.spin;
    });
    this.brakeGlow.value = braking ? 6 : 0;
    // Ground shadow follows yaw only.
    const yaw = new THREE.Euler().setFromQuaternion(quat, 'YXZ').y;
    this.shadow.position.set(pos.x, 0.03, pos.z);
    this.shadow.rotation.set(-Math.PI / 2, 0, yaw);
  }
}
