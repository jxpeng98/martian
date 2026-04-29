import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '..', 'package.json');

const [, , releaseType, ...restArgs] = process.argv;
const flagArgs = new Set(restArgs.filter(arg => arg.startsWith('--')));
const valueArgs = restArgs.filter(arg => !arg.startsWith('--'));
const preid = valueArgs[0];
const shouldTagVersion = !flagArgs.has('--no-git-tag-version');

if (!releaseType) {
  throw new Error(
    'Usage: node scripts/bump-version.mjs <prerelease|patch|minor|major> [preid] [--no-git-tag-version]',
  );
}

if (shouldTagVersion) {
  assertCleanGitState();
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, releaseType, preid);

packageJson.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

if (shouldTagVersion) {
  createVersionCommitAndTag(nextVersion);
}

console.log(`Version bumped successfully:\n${packageJson.name}: ${currentVersion} -> ${nextVersion}`);

function bumpVersion(version, type, prereleaseId) {
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+)\.(\d+))?$/.exec(version);

  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  const currentPreid = match[4];
  const currentPreNum =
    match[5] !== undefined ? Number(match[5]) : undefined;

  switch (type) {
    case 'prerelease': {
      const nextPreid = prereleaseId || 'beta';
      if (currentPreid === nextPreid && currentPreNum !== undefined) {
        return `${major}.${minor}.${patch}-${nextPreid}.${currentPreNum + 1}`;
      }

      patch += 1;
      return `${major}.${minor}.${patch}-${nextPreid}.0`;
    }

    case 'patch':
      if (currentPreid) {
        return `${major}.${minor}.${patch}`;
      }
      return `${major}.${minor}.${patch + 1}`;

    case 'minor':
      return `${major}.${minor + 1}.0`;

    case 'major':
      return `${major + 1}.0.0`;

    default:
      throw new Error(`Unsupported release type: ${type}`);
  }
}

function assertCleanGitState() {
  if (!isInsideGitWorkTree()) {
    return;
  }

  const status = execGit(['status', '--porcelain']);

  if (status.trim()) {
    throw new Error(
      'Git working tree must be clean before auto version tagging. Commit or stash your changes, or rerun with --no-git-tag-version.',
    );
  }
}

function createVersionCommitAndTag(version) {
  if (!isInsideGitWorkTree()) {
    return;
  }

  execGit(['add', 'package.json']);
  execGit(['commit', '-m', `v${version}`]);
  execGit(['tag', `v${version}`]);
}

function isInsideGitWorkTree() {
  try {
    return execGit(['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

function execGit(args) {
  return execFileSync('git', args, {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
