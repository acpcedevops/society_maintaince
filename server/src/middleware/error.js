export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  if (err.code === "P2002") {
    return res.status(409).json({ error: "Record already exists (duplicate value)" });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ error: "Record not found" });
  }
  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Validation failed", details: err.issues });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
}
