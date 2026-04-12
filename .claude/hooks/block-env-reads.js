// PreToolUse hook: blocks Read tool calls targeting .env* files.
// Called by Claude Code before any Read tool call — receives JSON on stdin.
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  // Match .env, .env.local, .env.production, etc. — anywhere in the path
  if (/(^|[/\\])\.env([^/\\]*)$/.test(filePath)) {
    process.stdout.write(JSON.stringify({
      continue: false,
      stopReason: 'Blocked: .env files contain production secrets — see CLAUDE.md security rules.',
    }) + '\n');
    process.exit(2);
  }
});
