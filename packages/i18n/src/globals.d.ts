// Minimal ambient declaration so dev-only warnings can check
// process.env.NODE_ENV without pulling @types/node into this React-free
// package. The literal `process.env.NODE_ENV` expression is load-bearing:
// bundlers (Next.js/webpack) inline it textually in browser builds.
declare const process: { env: { NODE_ENV?: string } };
