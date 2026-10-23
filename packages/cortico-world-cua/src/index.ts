/** Package entry: the default export is the `WorldDefinition`. */
import { CUA } from './definition.ts';

export default CUA;

export { CUA };
export { cuaDefinition, type CuaAssembly } from './definition.ts';
export { CUA_DEFAULTS, CUA_CONFIG_GROUP, cuaConfigGroup } from './config.ts';
export { cuaText, type CuaText } from './strings.ts';
export type { CuaConfigSection } from './config.ts';
export { CuaWorld, type CuaWorldOptions } from './world.ts';
export type { Answer } from './engine-ipc.ts';
