// Weapon registry. Each weapon kind lives in its own file in this folder.
// Add a new weapon by creating a file that exports a `BulletKind` and
// registering it here.

import { BIG_SHOT } from './bigShot'
import { SLUG } from './slug'

export type { BulletKind } from './types'

export const BULLET_KINDS = {
  slug: SLUG,
  bigShot: BIG_SHOT,
} as const

export type BulletKindName = keyof typeof BULLET_KINDS
