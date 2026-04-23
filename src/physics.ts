// Physics barrel. Real logic lives in src/physics/{broadphase,narrowphase,resolve}.ts.

export {
  applySlopeProjection,
  moveAndCollide,
  overlapsHazard as rectOverlapsHazard,
  tryStickToGround,
} from './physics/resolve'
export { BroadphaseGrid } from './physics/broadphase'
