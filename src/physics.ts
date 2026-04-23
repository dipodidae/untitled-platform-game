// Physics barrel. Real logic lives in src/physics/{broadphase,narrowphase,resolve}.ts.

export {
  applySlopeProjection,
  moveAndCollide,
  overlapsLethal,
  tryStickToGround,
} from './physics/resolve'
export { BroadphaseGrid } from './physics/broadphase'
