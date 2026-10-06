if (process.env.RENDER !== "true") {
  console.log("render build migration skipped outside Render");
  process.exit(0);
}

console.log("render build migration: starting database migrations and integrity verification");
try {
  await import("./migrate.js");
  console.log("render build migration: completed");
} catch (error) {
  console.error("render build migration: failed");
  process.exitCode = 1;
  throw error;
}
