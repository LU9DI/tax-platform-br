if (process.env.RENDER !== "true") {
  console.log("render build migration skipped outside Render");
  process.exit(0);
}

console.log("render build migration: starting database migrations and integrity verification");
await import("./migrate.ts");
console.log("render build migration: completed");
