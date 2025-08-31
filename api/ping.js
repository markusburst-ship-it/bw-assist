// api/ping.js
function handler(req, res) {
  res.status(200).json({
    ok: true,
    method: req.method,
    runtime: "node",
    hasKey: Boolean(process.env.OPENAI_API_KEY)
  });
}
module.exports = handler;
module.exports.default = handler;
module.exports.config = { runtime: "nodejs18.x" };
