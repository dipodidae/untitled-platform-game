// Enemies registry. Each enemy kind lives in its own file in this folder;
// this barrel re-exports so downstream code imports from `./enemies` rather
// than reaching into individual files. Add a new enemy by creating a file
// here and adding a re-export below.

export * from './dummy'
export * from './prowler'
export * from './specials'
export * from './classics'
