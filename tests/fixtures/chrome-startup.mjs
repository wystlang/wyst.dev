import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const spawn = childProcess.spawn;
let attempts = 0;

childProcess.spawn = (command, args, options) => {
	if (!args?.includes("--headless=new")) return spawn(command, args, options);
	attempts++;
	let child;
	const mode = process.env.WYST_TEST_CHROME_MODE;
	const profile = args.find((arg) => arg.startsWith("--user-data-dir="))
		.slice("--user-data-dir=".length);
	if (mode === "spawn-error") {
		child = spawn(`${profile}/missing-chrome`, args, options);
	} else if (mode === "exit") {
		child = spawn(process.execPath, [
			"-e", 'console.error("Chrome startup fixture exited"); process.exit(17);',
		], options);
	} else if (mode === "stall-once" && attempts === 1) {
		child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], options);
	} else {
		child = spawn(command, args, options);
	}
	appendFileSync(
		process.env.WYST_TEST_CHROME_LOG,
		JSON.stringify({ pid: child.pid, profile }) + "\n",
	);
	return child;
};

syncBuiltinESMExports();
