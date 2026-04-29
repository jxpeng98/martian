import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '..', 'package.json');

const [, , releaseType, preid] = process.argv;

if (!releaseType) {
  throw new Error(
    'Usage: node scripts/bump-version.mjs <prerelease|patch|minor|major> [preid]',
  );
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, releaseType, preid);

packageJson.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

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
