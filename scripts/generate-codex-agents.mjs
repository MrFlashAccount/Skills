import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const rolesDir = path.join(root, 'roles');
const agentsDir = path.join(root, 'agents');

const title = (value) =>
  value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const tomlLiteral = (value) => {
  if (value.includes("'''")) {
    throw new Error('Role content contains TOML literal delimiter');
  }

  return `'''\n${value.replace(/\r\n/g, '\n')}\n'''`;
};

const collectRoleFiles = (roleDir) => {
  const files = [];

  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };

  visit(roleDir);

  const order = new Map([
    ['ROLE.md', 0],
    ['RUBRIC.md', 1],
    ['LEARNINGS.md', 2],
  ]);

  return files.sort((left, right) => {
    const leftRelative = path.relative(roleDir, left);
    const rightRelative = path.relative(roleDir, right);
    const leftRank = order.get(leftRelative) ?? 10;
    const rightRank = order.get(rightRelative) ?? 10;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return leftRelative.localeCompare(rightRelative);
  });
};

fs.mkdirSync(agentsDir, { recursive: true });

const roles = fs
  .readdirSync(rolesDir)
  .filter((name) => fs.statSync(path.join(rolesDir, name)).isDirectory())
  .sort();

for (const role of roles) {
  const roleDir = path.join(rolesDir, role);
  const roleFiles = collectRoleFiles(roleDir);
  const chunks = roleFiles.map((filepath) => {
    const roleRelativePath = path
      .join('roles', role, path.relative(roleDir, filepath))
      .split(path.sep)
      .join('/');

    return `## ${roleRelativePath}\n\n${fs.readFileSync(filepath, 'utf8')}`;
  });

  const instructions = [
    `You are the ${title(role)} role from the Skills role catalog.`,
    '',
    'Follow the embedded role material below as binding developer instructions for this spawned Codex subagent. ROLE.md is primary. RUBRIC.md, LEARNINGS.md, role-local references, and nested learning files are supporting material. Stay inside the delegated task scope from the parent orchestrator. Do not take over orchestration unless explicitly asked. Return concise, evidence-backed output in the format requested by the parent. When reviewing code or plans, lead with blocker-level findings and concrete references.',
    '',
    `Embedded role files: ${roleFiles.length}.`,
    '',
    '# Embedded role material',
    '',
    chunks.join('\n\n---\n\n'),
  ].join('\n');

  const toml = [
    `name = "${role}"`,
    `description = "Use this agent for the ${title(role)} role from the Skills role catalog."`,
    `developer_instructions = ${tomlLiteral(instructions)}`,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(agentsDir, `${role}.toml`), toml, 'utf8');
}

console.log(`generated ${roles.length} agent files in ${agentsDir}`);
