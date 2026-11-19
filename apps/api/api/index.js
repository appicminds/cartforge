// Vercel Function: every request is rewritten here (see vercel.json) and handed
// to the compiled Nest app. Built by `tsc` before Vercel packages the function.
module.exports = require("../dist/serverless.js").default;
