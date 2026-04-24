// Physics barrel. Real logic lives in src/physics/{broadphase,narrowphase,resolve}.ts.

export { BroadphaseGrid } from './broadphase'
export {
  applySlopeProjection,
  moveAndCollide,
  overlapsLethal,
  tryStickToGround,
} from './resolve'
