// Set the admin's username and password: npm run set-login -- <username> <password>
export {};
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local
}
const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: npm run set-login -- <username> <password>");
  process.exit(1);
}
const { setAdminLogin } = await import("../src/server/auth");
setAdminLogin(username, password);
console.log(`Admin login updated (username: ${username.toLowerCase()}).`);
