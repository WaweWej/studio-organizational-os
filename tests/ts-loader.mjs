import {registerHooks} from 'node:module';
// The app uses extensionless TypeScript imports with Vite's bundler resolver.
// Node 24 can strip types; this test-only hook resolves those relative imports.
registerHooks({resolve(specifier,context,nextResolve){try{return nextResolve(specifier,context)}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return nextResolve(specifier+'.ts',context);throw error;}}});
