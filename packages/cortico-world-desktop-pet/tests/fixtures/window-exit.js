// A stand-in window process for tests/window-host.test.ts: exits with the code in its first argument
// (WindowHost appends `--parent-pid=<pid>` after it), or stays up until it is killed when there is none.
const code = Number(process.argv[2]);
if (Number.isInteger(code)) process.exit(code);
else setInterval(() => {}, 1000);
