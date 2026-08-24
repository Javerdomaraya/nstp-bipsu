/** Registers the `.ts` resolution hook for `node --test`. See ts-extension-loader.mjs. */
import { register } from 'node:module';

register('./ts-extension-loader.mjs', import.meta.url);
