import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from './rapier';
import { VAN_GROUPS } from '../world/colliders';

export type DriveInput = {
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1. Brakes while rolling forward; reverses once stopped. */
  brake: number;
};

export const VAN = {
  mass: 1800,
  halfWidth: 0.95,
  halfHeight: 0.55,
  halfLength: 2.15,
  wheelRadius: 0.36,
  wheelX: 0.86,
  wheelZFront: 1.42,
  wheelZRear: -1.38,
  wheelY: -0.2,
  suspensionRest: 0.32,
  maxSpeed: 16, // m/s, ~58 km/h: narrow old-town streets
  maxReverse: 5,
  engineForce: 3600, // N per driven (front) wheel
  brakeForce: 90,
  frictionSlip: 2.6,
  maxSteer: 0.6,
  minSteer: 0.17,
};

export type WheelState = { steer: number; spin: number; compression: number };

/** The van's body and Rapier raycast vehicle controller. Local +Z is forward. */
export class VanPhysics {
  readonly body: RAPIER.RigidBody;
  readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  private steer = 0;
  private prevSpeed = 0;
  /** Largest one-step speed loss this frame (m/s), for hit detection. */
  impact = 0;

  constructor(R: Rapier, private readonly world: RAPIER.World, x: number, z: number, heading: number) {
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, 1.0, z)
      .setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) })
      .setLinearDamping(0.05)
      .setAngularDamping(0.8)
      .setCanSleep(false);
    this.body = world.createRigidBody(desc);
    const m = VAN.mass;
    const { halfWidth: w, halfHeight: h, halfLength: l } = VAN;
    world.createCollider(
      R.ColliderDesc.cuboid(w, h, l)
        .setTranslation(0, 0.35, 0)
        .setMassProperties(
          m,
          { x: 0, y: -0.45, z: 0 }, // low centre of mass: vans shouldn't tip in a corner
          { x: (m / 12) * (4 * h * h + 4 * l * l), y: (m / 12) * (4 * w * w + 4 * l * l), z: (m / 12) * (4 * w * w + 4 * h * h) },
          { x: 0, y: 0, z: 0, w: 1 },
        )
        .setFriction(0.3)
        .setRestitution(0.1)
        .setCollisionGroups(VAN_GROUPS),
      this.body,
    );

    const v = world.createVehicleController(this.body);
    v.indexUpAxis = 1;
    v.setIndexForwardAxis = 2;
    const wheels: [number, number][] = [
      [VAN.wheelX, VAN.wheelZFront], [-VAN.wheelX, VAN.wheelZFront],
      [VAN.wheelX, VAN.wheelZRear], [-VAN.wheelX, VAN.wheelZRear],
    ];
    wheels.forEach(([wx, wz], i) => {
      v.addWheel({ x: wx, y: VAN.wheelY, z: wz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, VAN.suspensionRest, VAN.wheelRadius);
      v.setWheelSuspensionStiffness(i, 28);
      v.setWheelSuspensionCompression(i, 2.4);
      v.setWheelSuspensionRelaxation(i, 3.2);
      v.setWheelMaxSuspensionTravel(i, 0.25);
      v.setWheelMaxSuspensionForce(i, 100000);
      v.setWheelFrictionSlip(i, VAN.frictionSlip);
      v.setWheelSideFrictionStiffness(i, 1.0);
    });
    this.vehicle = v;
  }

  /** Signed speed along the van's forward axis (m/s). */
  get speed(): number {
    return this.vehicle.currentVehicleSpeed();
  }

  get heading(): number {
    const q = this.body.rotation();
    // Yaw of local +Z projected on the ground plane.
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    return Math.atan2(fx, fz);
  }

  update(dt: number, input: DriveInput): void {
    const v = this.vehicle;
    const speed = this.speed;
    const abs = Math.abs(speed);

    // Speed-sensitive steering, smoothed.
    const steerLimit = VAN.maxSteer + (VAN.minSteer - VAN.maxSteer) * Math.min(1, abs / VAN.maxSpeed);
    const target = -input.steer * steerLimit;
    const rate = 2.6 * dt;
    this.steer += Math.max(-rate, Math.min(rate, target - this.steer));

    let engine = 0;
    let brake = 0;
    if (input.throttle > 0) {
      if (speed < -0.5) brake = VAN.brakeForce * input.throttle;
      else if (speed < VAN.maxSpeed) engine = VAN.engineForce * input.throttle * (1 - (0.6 * speed) / VAN.maxSpeed);
    }
    if (input.brake > 0) {
      if (speed > 0.6) brake = VAN.brakeForce * input.brake;
      else if (speed > -VAN.maxReverse) engine = -VAN.engineForce * 0.6 * input.brake;
    }
    if (input.throttle === 0 && input.brake === 0) brake = 1.2; // rolling resistance

    for (let i = 0; i < 4; i++) {
      v.setWheelSteering(i, i < 2 ? this.steer : 0);
      v.setWheelEngineForce(i, i < 2 ? engine : 0);
      v.setWheelBrake(i, brake);
    }
    v.updateVehicle(dt);
  }

  /** Call after world.step(). */
  afterStep(): void {
    const s = this.speed;
    this.impact = Math.max(0, Math.abs(this.prevSpeed) - Math.abs(s));
    this.prevSpeed = s;
  }

  wheels(): WheelState[] {
    const v = this.vehicle;
    return [0, 1, 2, 3].map((i) => ({
      steer: v.wheelSteering(i) ?? 0,
      spin: v.wheelRotation(i) ?? 0,
      compression: v.wheelSuspensionLength(i) ?? VAN.suspensionRest,
    }));
  }

  /** World-up component of the van's up axis: 1 upright, 0 on its side, -1 on its roof. */
  get upY(): number {
    const q = this.body.rotation();
    return 1 - 2 * (q.x * q.x + q.z * q.z);
  }

  wheelsOnGround(): number {
    let n = 0;
    for (let i = 0; i < 4; i++) if (this.vehicle.wheelIsInContact(i)) n++;
    return n;
  }

  /** Place the van upright at (x, z), `groundY` being the road or terrain height there. */
  teleport(x: number, z: number, heading: number, groundY = 0): void {
    this.body.setTranslation({ x, y: groundY + 1.0, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.prevSpeed = 0;
  }

  dispose(): void {
    this.world.removeVehicleController(this.vehicle);
  }
}
