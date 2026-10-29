// Usage: npm run hash-password -- "your-strong-password"
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run hash-password -- "a-strong-password (10+ chars)"');
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
// Next.js expands "$VAR" in .env files, so every "$" in the hash must be escaped.
console.log("Copy this whole line into .env.local:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash.replace(/\$/g, "\\$")}`);
