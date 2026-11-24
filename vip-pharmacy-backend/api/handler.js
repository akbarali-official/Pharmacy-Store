// Vercel serverless entry: exposes the compiled Express app (built into /dist by "npm run vercel-build")
module.exports = require('../dist/app').app;
